You are building "GuardLoop", a functional closed-loop AI security platform, to run locally on my PC. It has four parts: a React dashboard (apps/web), a Flask backend that runs the agent pipeline and streams events live (apps/server), a deliberately vulnerable Flask demo target the agents attack for real (apps/target), and LLM access through OpenRouter. Work autonomously and do not stop until every acceptance check at the bottom passes.

PRODUCT
GuardLoop attacks an AI/LLM-backed target, verifies the finding is real (rejecting hallucinated ones), drafts a fix, applies it, re-attacks to confirm the fix holds, and only then reports. Loop: Guard Gate -> Attack Agents -> Verify & Fix -> Confirm Agent -> Report Agent, with Confirm Agent looping back to Attack Agents if the fix does not hold. Conceptually built on VulnBot's Penetration Task Graph (role-specialized agents sharing a task graph). Audience: small organizations (schools, clinics, NGOs) with no red or blue team.

REPO LAYOUT
apps/web React 18 + TypeScript strict + Vite + Tailwind + shadcn/ui + lucide-react + recharts + zustand + react-router-dom + vitest
apps/server Python 3.11+, Flask, Pydantic v2, httpx, SQLite (stdlib sqlite3 or SQLAlchemy), pytest, ruff, mypy
apps/target Python Flask app: "acme-chatbot-api", the deliberately vulnerable demo target (fictional, local only), plus a tiny fake internal "metadata" service
scripts/ dev runner and type generation
Each Python app has its own virtualenv and requirements.txt (or pyproject.toml). Root-level `npm run dev` (using concurrently) must start web, server and target together, and a root README documents a one-time setup (python -m venv, pip install, npm install). Provide a cross-platform dev script that works on Windows.

SHARED CONTRACT
Define all API and event schemas ONCE as Pydantic models in apps/server/guardloop/schemas.py (Finding, Stage, FindingStatus, AgentId, AgentEvent, LogEntry, ScanConfig, ScanState, Metrics, Settings). Add a script (scripts/gen_types) that exports JSON Schema from the Pydantic models and generates apps/web/src/api/types.ts (use json-schema-to-typescript). The frontend must import those generated types and never hand-write duplicates. Add a CI-style check that fails if the generated file is stale.

SAFETY RULES (hard requirements, enforce in code and tests)

- The server may ONLY attack targets on an allowlist of local demo targets (127.0.0.1 or localhost on the demo target's port). Any other host is refused by Guard Gate with a logged "out of scope" event. No setting, env var or UI field may widen this to external hosts. Resolve hostnames and check the resolved IP, to block DNS tricks and redirects. Disable HTTP redirects on attack requests.
- The OpenRouter API key lives only in apps/server/.env and is never sent to the browser or logged (redact it in all logs and error messages).
- Attack payloads are only ever sent to the local demo target.
- The demo target's /admin endpoints only accept requests from 127.0.0.1 and require a shared admin token from env.

ENV FILE (apps/server/.env.example, copy to .env, loaded with python-dotenv)
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
MODEL_ATTACK=
MODEL_VERIFY=
MODEL_FIX=
MODEL_REPORT=
MODEL_TARGET=
MAX_TOKENS_PER_CALL=1024
MAX_LLM_CALLS_PER_SCAN=150
LLM_CONCURRENCY=3
TARGET_BASE_URL=http://127.0.0.1:5001
TARGET_ADMIN_TOKEN=change-me
SERVER_PORT=5000
WEB_ORIGIN=http://localhost:5173
Do not hardcode model names. Read them from env, and document in the README that I choose model IDs from openrouter.ai/models (cheap or free ones are fine to start). If OPENROUTER_API_KEY is empty, the server starts in MOCK MODE using the simulated runtime, and the UI shows a "Mock mode" badge. If the key is set, it starts in LIVE MODE with a "Live agents" badge. Expose GET /api/mode.

LLM CLIENT (apps/server/guardloop/llm)

- Thin client over the OpenRouter chat completions endpoint (OpenAI-compatible) using httpx, with timeouts, exponential backoff retry on 429 and 5xx, a global concurrency limiter (threading.BoundedSemaphore sized by LLM_CONCURRENCY), and a hard per-scan call budget (MAX_LLM_CALLS_PER_SCAN). When the budget is hit, the scan ends gracefully with a "budget exhausted" event.
- Every call is cancellable: each scan owns a threading.Event cancel flag, and the client checks it before and between retries and uses short httpx timeouts so in-flight requests can be abandoned and their httpx client closed on halt.
- Every agent asks for JSON and validates it with Pydantic. On validation failure, retry once with the error fed back, then fall back to a safe default and log it. Never crash the pipeline on a bad LLM response.
- Track tokens and approximate cost per agent from the response usage field and surface it in the UI.

THE DEMO TARGET (apps/target, Flask on port 5001)
A small "chatbot API" that is genuinely vulnerable in controlled, fictional ways, with a MUTABLE security config that the Fix step can change through a whitelisted admin endpoint (POST /admin/patch, localhost only, token required, accepts only known mitigation IDs):

1. Prompt injection and system-prompt leak: POST /v1/chat/completions calls MODEL_TARGET via OpenRouter (or a built-in rule-based responder in mock mode). Its system prompt contains a CANARY string (e.g. GL-CANARY-7f3a) and a fake internal admin note. Success = the canary appears in a response. Mitigation: hardened system prompt with delimiters plus an output filter that strips canary-pattern strings.
2. Insecure output handling: an endpoint that returns model output as unescaped HTML in a fake admin console view. Success = an attacker-supplied script tag marker reflected unescaped. Mitigation: output escaping toggle.
3. SSRF via tool-calling: a fetch_url tool that can reach a fake local metadata service (second tiny Flask app on its own port returning a canary). Success = metadata canary retrieved. Mitigation: host allowlist.
4. BOLA: /v1/threads/<id> returns any tenant's thread (in-memory fake data with a canary). Mitigation: ownership check.
5. Rate limiter bypass via duplicated or case-varied header. Mitigation: header normalization.
   Each vulnerability has an objective, programmatic success check (canary or marker detection). This is what makes verification real instead of vibes. Mitigations form a fixed catalog (HARDEN_PROMPT, ESCAPE_OUTPUT, HOST_ALLOWLIST, OWNERSHIP_CHECK, NORMALIZE_HEADERS). Make first-level mitigations deliberately weak for some vulnerabilities (for example, prompt hardening that blocks the naive payload but not a paraphrased or encoded one) so loop-backs happen naturally, with a stronger second-level mitigation available. Provide POST /admin/reset to restore the vulnerable baseline.

AGENT RUNTIME (apps/server/guardloop/runtime)
Define an abstract base class AgentRuntime with start(config), pause(), resume(), halt(reason), set_speed(n), and subscribe(callback). Two implementations:

- LiveRuntime: the real agents below, orchestrated with a worker thread per scan and a ThreadPoolExecutor for parallel probes.
- MockRuntime: a seeded, deterministic simulation (random.Random(seed)) with a scenario library of 12 or more fictional vulnerability templates (payloads, vulnerable and patched responses, diff-style fixes, plain-language text, OWASP-LLM-style tags), intentional hallucinated findings, and configurable hallucination and fix-failure rates. It emits the exact same event types as LiveRuntime so the UI cannot tell the difference. Use cancellable scheduling (threading.Event.wait with timeouts, not time.sleep) so pause, resume, halt and speed really work.

Task graph (guardloop/taskgraph.py): a small Penetration Task Graph (nodes = subtasks like "probe prompt injection on /v1/chat/completions", edges = dependencies, status pending, running, done, failed). Agents read and write it. The "subtasks completed" metric comes from it.

Agents (guardloop/agents/):

1. guard_gate.py (deterministic, no LLM): requires an authorization acknowledgement and a scope in the scan request, validates the target against the allowlist, enforces the probe budget, and owns the kill switch. Logs every allowed and blocked action.
2. attack.py (LLM + target): for each task graph node, the LLM proposes a payload (given the endpoint description and prior failed attempts), the server sends it to the target, and the raw request and response are recorded. Success is determined by the target's programmatic check, never by the LLM alone. A candidate finding is emitted if the check fires OR the LLM claims success (claimed-but-unconfirmed candidates are how hallucinations enter the pipeline).
3. verify_fix.py (LLM + deterministic): replay the exact payload N times (default 10 in live mode) and compute reproducibility. An LLM judge may comment, but the decision is based on the objective check: below the threshold (default 60%) the finding becomes "Rejected/Hallucinated" and is dropped before the fix stage with a log line. Otherwise the LLM chooses a mitigation from the catalog and writes the explanation and a diff-style description; the server applies it via the target's /admin/patch.
4. confirm.py (LLM + target): re-attack the patched target with the original payload plus K LLM-generated mutations (paraphrases and encodings). If any attempt succeeds, status goes back to "Retesting", the finding returns to the Attack Agents with an incremented attempt counter plus the failed fix and bypass payload as context, and Verify & Fix proposes a stronger mitigation. Max attempts configurable (default 3), then "Fix Failed, needs human". Zero successes means "Verified Fixed", and time-to-mitigation is recorded.
5. report.py (LLM): only for Verified Fixed findings. Produces a technical report and a plain-language report (2 to 3 short paragraphs for an IT volunteer at a small NGO or clinic), grounded strictly in recorded evidence (payloads, responses, attempts, patch applied). It must not invent facts that are not in the finding record.

Finding state machine (guardloop/statemachine.py), with an explicit transition whitelist and unit tests: Candidate -> Verifying -> (Rejected | Fixing) -> Retesting -> (Verified Fixed | Fixing again | Fix Failed) -> Reported. Illegal transitions raise an exception.

SERVER API (Flask, blueprints, CORS restricted to WEB_ORIGIN, run threaded)

- GET /api/mode
- POST /api/scans (body validated by Pydantic ScanConfig: target, allowed endpoints, probe budget, seed, authorization flag) returns the scan id
- POST /api/scans/<id>/pause, /resume, /halt, /speed
- GET /api/scans/<id> (full state snapshot including findings, metrics, task graph, per-agent counters, token and cost totals)
- GET /api/scans/<id>/events: Server-Sent Events stream (text/event-stream, generator response, heartbeat comments every 15 seconds, Last-Event-ID replay from persisted events so a page reload reconnects cleanly). Each scan has a thread-safe event bus (queue per subscriber).
- GET /api/scans/<id>/export (JSON), GET and PUT /api/settings, POST /api/llm/test (one tiny call, returns success or the redacted error)
- Standard error format {error, detail}, Pydantic validation errors return 422.
- Kill switch: halt() sets the cancel Event, aborts in-flight LLM and target requests, stops the executor, marks in-flight findings "Halted mid-loop", logs who and when, and guarantees no further events are emitted afterward. Write a test proving this. Optionally POST /api/target/reset to restore the target baseline.
- Persist scans, findings and events in SQLite so history survives restarts.

DASHBOARD (apps/web)
Design: dark slate-950/900 background, light slate text, ONE accent (teal-400 or blue-400), status colors used sparingly: red = attack in progress or critical, amber = pending or retry, green = verified fixed, gray = rejected. No gradients, no glow, no neon. Linear/Vercel feel, rounded-lg, border-slate-800, generous whitespace, small badges. Inter for UI, JetBrains Mono ONLY for technical values (targets, endpoints, IDs, payloads, log messages). Colors defined once as tokens.
All UI state comes from the Flask server via an SSE client (EventSource with reconnect) and a zustand store. Vite dev proxy forwards /api to the server. Components never compute business numbers themselves.

- Layout: collapsible sidebar (Overview, Findings, Agents, Reports, Settings). Top bar: target name, live status pill (Idle, Running with pulsing dot, Paused, Halted, Completed), Mock or Live badge, speed selector, Start, Pause, Resume, and the red Kill Switch with a confirmation Dialog. Halted shows a full-width red banner and a Reset button.
- Overview: 5-stage pipeline tracker with icons (Shield, Zap, CheckCircle2, RefreshCw, FileText), a live count of findings in each stage, and a clearly visible curved SVG arrow from Confirm Agent back to Attack Agents labeled "retry if not verified" that animates whenever a real loop-back event arrives. Four metric cards (Subtask Completion Rate vs 69.05% VulnBot baseline, Reproducibility Score, Verified Remediation Rate vs 0% prior frameworks, Time to Mitigation vs multi-day manual cycles), each with a Progress bar and a tooltip explaining how it is computed. A recharts time-to-mitigation trend that gains a point per confirmed fix. A cost and token panel (LLM calls used out of budget, tokens, approximate cost). Live Agent Activity feed (auto-scroll, pause on hover, filter by agent, monospace, amber for "hallucination rejected", red for Guard Gate blocks). Findings Snapshot (latest 5) opening the finding Sheet.
- New Scan dialog: target (preselected local demo target), endpoints, probe budget, seed, authorization checkbox. Start is disabled until authorized.
- Findings page: shadcn Table with ID, Title, Endpoint, Severity, Status, Reproducibility, Attempts, Last Confirmed (live relative time), plus search, severity and status filters, sortable columns. Rejected rows are grayed with strikethrough. Row click opens a Sheet with a mini 5-step stepper derived from the finding's real history, severity, OWASP-LLM-style tag, and Tabs: Attack (actual payload and raw response), Verify (per-replay pass or fail bar, reproducibility, verdict), Fix (mitigation ID plus diff-style change per attempt), Confirm (before and after responses per attempt, final result badge), plus a transition timeline.
- Agents page: five cards with description, Idle or Active pill, live counters (probes, promoted, rejected, fixes confirmed, retries, reports), a last action line, and per-agent token usage.
- Reports page: select a Verified Fixed finding; Tabs for Technical and Plain-Language reports from the Report Agent's output; working Copy as Markdown, Download .md, and Print / Save as PDF (print stylesheet).
- Settings page (functional): reproducibility threshold, max retry attempts, replay count, mutation count, probe budget, LLM call budget, simulation speed (mock mode), hallucination rate and fix-failure rate (mock mode), model IDs per agent (read-only display of what the server loaded), a "Test OpenRouter connection" button, Reset all data, Export scan JSON.
- Empty states for every page before any scan, with a clear call to action. Keyboard accessible, visible focus states, aria-labels on icon buttons.

QUALITY BAR

- Everything on screen traces back to server events. Changing a setting visibly changes the next scan.
- A default scan tells a coherent story: at least 3 findings Verified Fixed, one that loops back at least once, one rejected as hallucinated, and one still Retesting or Fix Failed. In live mode outcomes depend on the real LLMs, so design the target so the story is likely but not scripted.
- No console errors or warnings in the browser. Full type hints in Python (mypy clean), ruff clean, no `any` in TypeScript. Small focused files. Structured logging in the server with the API key redacted.
- README explains setup on Windows, macOS and Linux, modes, env vars, safety rules, and how to point the Attack Agents at a different local target later.

TESTS
pytest for the server: state machine whitelist, hallucination rejection threshold, loop-back and max attempts, kill switch aborting in-flight work and emitting nothing after halt, scope check refusing non-local hosts (including a hostname that resolves to a public IP and a redirect to an external URL), the target's canary checks and mitigation effects, Pydantic fallback when the LLM returns garbage (mock the LLM client with respx or monkeypatch), LLM call budget enforcement, MockRuntime determinism under the same seed, SSE replay with Last-Event-ID, and each metric function. Use the Flask test client where possible. vitest for the web app: store reducers, SSE event handling, and the table filtering and sorting logic.

WORKFLOW
Work in phases. After each, run the relevant ruff, mypy, pytest, tsc, eslint, vitest and build commands, fix all errors, and make a git commit.
Phase 1: repo scaffold, venvs, tooling, Pydantic schemas, type generation, app shells, dev runner.
Phase 2: the Flask demo target with the admin patch endpoint, metadata service, and tests.
Phase 3: server core: state machine, task graph, Guard Gate, metrics, event bus, SSE, SQLite persistence, MockRuntime, tests.
Phase 4: web Overview wired to SSE, running fully in mock mode.
Phase 5: Findings page, finding Sheet, Agents, Reports, Settings.
Phase 6: LLM client, LiveRuntime and the four LLM agents, mode switching, connection test, cost tracking.
Phase 7: polish, empty states, accessibility, README.

ACCEPTANCE CHECKS (verify each yourself)

1. With no API key, the app starts in Mock mode and a full scan completes with the story described above.
2. With a valid key in .env, it starts in Live mode, the Attack Agent really exploits the local target (a canary appears in a recorded response), and findings are verified by replay.
3. A weak first fix is bypassed by a mutation, the finding loops back (arrow animates), and a stronger fix then verifies.
4. At least one candidate is rejected as hallucinated before any fix is applied.
5. Targeting any non-local host is refused and logged by Guard Gate.
6. Kill Switch halts instantly, aborts in-flight LLM calls, emits no further events, the banner shows, and Reset works.
7. Reloading the page mid-scan reconnects the SSE stream and restores state.
8. The LLM call budget stops a scan gracefully when exceeded.
9. Reports are grounded in recorded evidence, and Copy, Download and Print work.
10. Generated TypeScript types match the Pydantic schemas, and ruff, mypy, pytest, tsc, eslint, vitest and build all pass with zero errors. `npm run dev` brings up web, server and target.

When finished, summarize what was built, how to run it (setup commands, copy .env.example to .env, npm run dev), and anything you deliberately left out.

UI IMPLEMENTATION RULES (mandatory)
Component library:

- Initialize shadcn/ui properly with `npx shadcn@latest init` (TypeScript, Tailwind, dark theme, slate base color, CSS variables). Then install components with `npx shadcn@latest add` for: button, card, table, badge, tabs, dialog, alert-dialog, sheet, progress, separator, tooltip, input, select, switch, checkbox, label, scroll-area, skeleton, sonner (toasts), dropdown-menu, sidebar, command, popover, textarea.
- NEVER hand-write a button, card, table, dialog, badge, tab or input. Always use the shadcn component from src/components/ui. Customize through variants (cva) and className only, never by editing the generated files heavily.
- Use the shadcn Sidebar component for the collapsible nav. Use AlertDialog for the Kill Switch confirmation. Use Sonner for toasts (scan started, halted, fix confirmed, errors). Use Skeleton for loading states. Use ScrollArea for the log feed.
- Icons only from lucide-react at a consistent size (16px in tables and badges, 20px in nav, 24px in pipeline stage cards) and a consistent 1.5 stroke.

Design tokens (define once in globals.css and tailwind config, never use raw hex in components):

- Background slate-950, surface slate-900, border slate-800, muted text slate-400, body text slate-200, heading text slate-50.
- One accent: teal-400 (actions, focus rings, active nav, active pipeline stage).
- Status tokens: status-critical (red-400), status-warning (amber-400), status-success (emerald-400), status-info (accent), status-neutral (slate-500). Each has a matching subtle background at 10 to 15 percent opacity for badges.
- Severity badges: Critical red, High orange, Medium amber, Low slate. Never use more than these colors.

Typography and spacing:

- Inter for UI, JetBrains Mono for technical values only. Type scale: page title text-2xl semibold, section title text-lg medium, body text-sm, captions text-xs. Tabular numbers (tabular-nums) on every metric and table number.
- Spacing on a strict 4px grid. Page padding 24px to 32px, card padding 20px to 24px, gap between cards 16px to 24px. Max content width 1400px, centered.
- Rounded-lg on cards and inputs, rounded-md on buttons and badges. Borders 1px, no shadows except on popovers and dialogs. No gradients, no glow, no blur effects.

Polish requirements:

- Motion: 150 to 200ms ease-out transitions only. Pulsing dot for Running, a one-shot highlight flash on new log lines and new table rows, and the loop-back arrow animation. Respect prefers-reduced-motion by disabling all non-essential animation.
- Pipeline tracker: stage cards equal width, connected by thin lines, icon in a subtle rounded square, stage name, one-line caption, and a live count badge. Active stage gets an accent border and a soft pulse. The loop-back arrow is a smooth SVG curve routed beneath the cards with an arrowhead and a small label pill, in amber when idle and accent-colored while a loop-back is actually happening.
- Metric cards: large tabular number, small delta or baseline line, thin Progress bar or sparkline, info Tooltip. Numbers animate between values with a short count transition.
- Tables: sticky header, row hover state, comfortable row height (48px), truncated cells with Tooltip on overflow, monospace IDs and endpoints, right-aligned numbers.
- Code blocks (payloads, responses, diffs): monospace text-xs on slate-900, copy button, horizontal scroll, diff lines colored with subtle red and green row backgrounds.
- Every page has a designed empty state (icon, one-line explanation, primary action button), a skeleton loading state, and an error state with a retry button.
- Responsive down to 1024px wide with a sensible collapse of the sidebar. Verify layout at 1280, 1440 and 1920 widths.
- Accessibility: contrast of at least 4.5:1 for text, visible focus rings in the accent color, full keyboard navigation, aria-labels on icon-only buttons, status never conveyed by color alone (always an icon or text label too).

UI self-review (do this at the end of Phase 5 and Phase 7):
Run the app, open every page in every state (empty, running, halted, completed), and fix any of: inconsistent spacing, raw hex colors in components, hand-built components that should be shadcn, text overflowing containers, misaligned numbers, missing hover or focus states, or layout shifts when data streams in. List what you fixed.
