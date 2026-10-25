# GuardLoop Build Spec: Auth + NeonDB, UI Revamp, Juice Shop Pen Testing

Repo: `CriticalMalwareHacker/SE_project`
Stack: React dashboard (`apps/web`), Flask backend (`apps/server`), bundled vulnerable demo target (`apps/target`), Juice Shop via Docker, LLM agents via OpenRouter or NVIDIA.

This spec covers three workstreams. Read all of it before touching code, the constraints in Part 0 apply across every workstream and exist to keep this project safe to demo and submit as coursework.

---

## Part 0: Constraints that must not be loosened

These are already enforced in the codebase (per README, "Safety rules enforced in code + tests"). Do not weaken, bypass, or work around any of them while implementing the features below.

1. **Guard Gate stays loopback only.** Scan requests must continue to resolve to `127.0.0.1` on exactly port 5001 (bundled target) or port 3000 (Juice Shop). No new target types, no arbitrary hostnames, no public URLs. If a feature below seems to require widening this, stop and flag it instead of implementing it.
2. **No deployment work in this pass.** Everything described here runs on a single local host, same as today. Do not add deployment configs, Docker Compose for multi host split, reverse proxy setup, or cloud service wiring beyond the NeonDB connection itself (Neon is a hosted database, that's fine, it's not hosting the app).
3. **Secrets stay server-side.** `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, and the new NeonDB connection string all live only in `apps/server/.env`, never shipped to the browser, redacted in logs/errors, same pattern as today.
4. **Juice Shop stays read-only safe by default.** Expanding its coverage (Part 3) must not perform destructive actions, must not write/alter Juice Shop's own state in a way that corrupts the demo for other users of the same container, and must stay within the fixed loopback port 3000.
5. **Keep the existing five-stage pipeline intact.** Guard Gate -> Attack Agent -> Verify & Fix Agent -> Confirm Agent -> Report Agent, with the self-loops and retry paths already in the collaboration diagram (hallucinated findings get discarded, unfixed findings retry the attack). New features should sit around this pipeline, not replace it.

---

## Part 1: Auth + NeonDB persistence

### Goal
Gate scan execution, scan history, and the evaluation dashboard behind login. Keep the bundled demo target viewable without login if that's useful for a quick showcase, but no scan can be *triggered* without an authenticated user.

### Database
- Use NeonDB (serverless Postgres). Store the pooled connection string (the `-pooler` host, not the direct one) as `DATABASE_URL` in `apps/server/.env`.
- Use SQLAlchemy as the ORM, Alembic for migrations. Do not hand-edit schema, this is a four person repo.

### Schema (minimum viable, adjust naming to match existing conventions in `apps/server`)
- `users`: id, email (unique), password_hash, created_at
- `scans`: id, user_id (FK), target_type (`bundled` | `juice_shop`), status, started_at, completed_at
- `findings`: id, scan_id (FK), title, severity, status (`genuine` | `hallucinated` | `fixed` | `not_fixed`), created_at
- `evaluations`: either a view/query over `scans` + `findings`, or a materialized summary table per user if query cost matters, decide based on expected scan volume (this is a student demo, a view is probably enough, don't over-engineer)

### Auth flow
- Email + password is sufficient, no need for OAuth providers for a coursework project.
- Hash passwords with `bcrypt` or `argon2`, never store plaintext.
- Session-based auth (Flask session cookie) is simpler to reason about than JWT for a single-backend setup like this, use that unless the team already has a reason to prefer JWT.
- Add `login_required` style decorator in Flask, apply it to: scan creation endpoint, scan history endpoints, evaluation/profile endpoints. Leave read-only bundled-target info endpoints open if desired.

### API additions
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/profile/evaluations` (per-user aggregate: finding counts by severity, Verified Remediation Rate, time-to-mitigation across their scans)
- Existing scan endpoints gain `user_id` scoping, a user only sees their own scans and findings.

### Acceptance criteria
- Unauthenticated request to start a scan returns 401, does not reach Guard Gate.
- A logged-in user only ever sees their own scan history, never another user's.
- Evaluation dashboard numbers match a manual count of that user's findings (spot check with a test account).
- `apps/server/.env.example` updated with a `DATABASE_URL` placeholder and a comment that it's the Neon pooled connection string.

---

## Part 2: UI revamp (minimalistic)

### Direction
The existing frontend already uses a shadcn-based component set (`apps/web/src/components/ui/`, "base-nova" style) with a slate/teal dark theme mapped onto shadcn's CSS variables in `globals.css`. Keep that foundation, this is a refinement pass, not a rebuild.

Minimalistic means: fewer competing visual signals, not fewer features.

- **Color**: keep the slate/teal dark theme, but reduce to essentially one accent color (teal) used only for primary actions and status (do not also use it for decorative elements). Severity colors (critical/high/medium/low) should be the only other color family on screen, and should follow a consistent scale across every page (scan list, finding detail, evaluation dashboard).
- **Typography**: one type scale used consistently, a clear distinction between page titles, section headers, and body text, nothing in between. Avoid mixing font weights beyond regular/medium/semibold.
- **Spacing**: adopt a single spacing scale (e.g. 4/8/16/24/32px) and audit existing pages for ad hoc padding/margin values that don't match it.
- **Density**: the scan timeline (Guard Gate -> Attack -> Verify&Fix -> Confirm -> Report, with the self-loops) is the most complex visual in the app, per the collaboration diagram. Keep it as a clean linear/stepper visualization, resist the urge to show every agent-to-agent message by default, let the user expand a step for detail rather than showing everything at once.

### Specific pages to revisit
1. **Login/register**: new, simple, centered form, no dashboard chrome.
2. **New Scan**: target picker (bundled target or Juice Shop), authorize step, clear single primary action.
3. **Scan detail**: the five-stage pipeline as a stepper, current stage highlighted, findings listed per stage with severity, collapsed by default.
4. **Profile / evaluation dashboard**: the new NeonDB-backed view from Part 1, summary cards (total scans, Verified Remediation Rate, time-to-mitigation trend) above a scan history list.
5. **Side assistant dock**: keep as-is functionally, just restyle to match the reduced color/spacing rules above.

### Explicitly avoid
- Don't introduce a second component library alongside the existing shadcn set.
- Don't add animation/motion beyond simple state transitions (expand/collapse, loading states), this is a lab demo, not a product pitch.
- Don't change the underlying API contracts to fit a UI idea, if a UI need requires a new endpoint shape, add it, don't repurpose existing ones in a way that breaks the Mock mode / Live mode distinction.

### Acceptance criteria
- Every page uses the shared severity badge and labeled-select components already in `src/components/`, no new one-off badge/select implementations.
- A visual pass confirms no more than one accent color plus the severity scale appears on any given screen.
- Existing Vitest suite (`npm --prefix apps/web run test -- --run`) still passes after the restyle.

---

## Part 3: Juice Shop pen testing, properly

### Current state
Per the README, the Juice Shop profile today performs exactly two fixed, read-only GET checks on loopback port 3000. It does not attempt any of Juice Shop's actual built-in challenges, retrieve account data, or change its state. That's intentionally narrow, and it's the reason it "works" but doesn't feel like real pen testing yet.

### What to build
Juice Shop is OWASP's own intentionally vulnerable training app, built specifically to have its challenges attempted (see the OWASP Juice Shop Developer Guide linked in the README). Expanding coverage here is using it exactly as designed, not a new risk.

- Add a dedicated Juice Shop adapter (separate from the bundled-target LiveRuntime path, same as today) that attempts a defined, fixed set of Juice Shop's documented challenge categories: e.g. basic XSS injection, SQL injection on the login form, broken access control on an endpoint, sensitive data exposure. Keep the set fixed and enumerated in code, don't let the LLM agent choose arbitrary actions against Juice Shop.
- Map each attempted check to its OWASP Top 10 category and Juice Shop's own challenge name, so the report output is meaningful (this is good material for your lab report's "real-world application" framing too).
- Findings from this adapter still flow through Verify & Fix / Confirm / Report like bundled-target findings, so the full pipeline is demonstrated end to end on a second, independent target.
- Still never sends Juice Shop response content to the LLM provider, per the existing safety rule, keep that adapter's output structured/parsed, not raw HTML piped to a model.
- Still restricted to loopback port 3000, still started via the documented `docker run` command, no new ports, no new containers beyond the one already documented.

### Acceptance criteria
- Running a Juice Shop scan against a freshly started container produces findings across at least 3 distinct OWASP categories, each traceable to a specific Juice Shop challenge.
- A second run against a freshly restarted container produces consistent results (supports your reproducibility metric from the project's literature goals).
- Confirm that none of the attempted checks require write access that would corrupt the container for a later run, if a check does need state mutation, restarting the Docker container must be sufficient to reset it (already documented as the standard way to reset Juice Shop).

---

## Out of scope for this pass
- Deployment of any kind (explicitly deferred, single-host local setup only, see Part 0.2).
- Additional vulnerable targets beyond Juice Shop (WebGoat, DVWA, etc.) can be a future addition using the same adapter pattern as Part 3, but are not part of this build.
- OAuth/social login, multi-target orchestration, anything else not listed above.

## Test checklist before calling this done
```
python -m pytest apps/server/tests -q
python -m ruff check apps/server/guardloop apps/server/tests
python -m mypy apps/server/guardloop
python scripts/check_types.py
npm --prefix apps/web run build
npm --prefix apps/web run test -- --run
```
Add new test coverage for: auth endpoints (register/login/logout, unauthorized access rejected), scan ownership scoping (user A cannot see user B's scans), and the Juice Shop adapter's fixed check set.
