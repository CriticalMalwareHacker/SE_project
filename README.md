# GuardLoop — closed-loop AI security platform (local)

Four parts: React dashboard (`apps/web`), Flask backend (`apps/server`), vulnerable demo target (`apps/target`), and LLM agents using OpenRouter or NVIDIA's OpenAI-compatible API.

## One-time setup

Windows (PowerShell):
```powershell
py -3.13 -m venv .venv  # optional; or use system python
pip install -r apps/server/requirements.txt
pip install -r apps/target/requirements.txt
npm install
npm --prefix apps/web install
Copy-Item apps/server/.env.example apps/server/.env
C:\Python313\python.exe scripts/gen_types.py
```

macOS / Linux:
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r apps/server/requirements.txt -r apps/target/requirements.txt
npm install && npm --prefix apps/web install
cp apps/server/.env.example apps/server/.env
python3 scripts/gen_types.py
```

## Run

```bash
npm run dev   # starts target :5001 + metadata :5002, server :5000, web :5173
```

Open http://localhost:5173 → Start → authorize → watch Guard → Attack → Verify&Fix → Confirm → Report.

### Local OWASP Juice Shop

Juice Shop does not need public hosting. If Docker is installed, run this in a terminal and leave it running while using GuardLoop:

```bash
docker run --rm -p 127.0.0.1:3000:3000 bkimminich/juice-shop
```

In GuardLoop choose **OWASP Juice Shop (local Docker)** in New Scan, acknowledge authorization, and start. This profile performs only two fixed read-only GET checks on loopback; it does not run challenge exploits, retrieve account data, or change Juice Shop state. Its results are compatibility observations, not a full pentest. OWASP documents Juice Shop as an intentionally vulnerable training app and describes running it locally in Docker: [OWASP Juice Shop Developer Guide](https://devguide.owasp.org/en/07-training-education/01-vulnerable-apps/01-juice-shop/).

## Side assistant

The persistent Assistant dock appears on the right side of every dashboard page. Ordinary questions are sent to the configured Attack Agent model (NVIDIA or OpenRouter); without a configured key/model, it explains that it is offline. Chat requests are not given tools. To run app actions, enter one exact command:

- `/help` lists commands.
- `/status` summarizes the currently selected scan.
- `/findings` lists finding titles and severity without payloads or response data.
- Natural requests such as “show the demo emails and passwords” return only the bundled target's synthetic `example.test` accounts; `/demo-users` does the same explicitly. These demo-only passwords are not valid anywhere else.
- `/scan` asks for confirmation, then scans only the bundled demo at `127.0.0.1:5001`.
- `/reset` restores the bundled demo target to its baseline.

The assistant does not accept URLs or arbitrary shell commands. It is a guide to this local training app, not a general-purpose pentest agent. Requests for demo account data are served directly from the fixed loopback demo endpoint, not sent to the model provider. Other chat messages leave the machine to be processed by the configured model provider; do not enter secrets or personal data.

## Accounts and email verification

Sign-up and password sign-in use Neon Auth. New accounts receive a 6-digit verification code; enter it on the next screen to finish. Sign-in also supports a passwordless 6-digit email code. Codes expire after 10 minutes, and the development branch uses Neon Auth's shared sender (`auth@mail.myneon.app`). Configure custom SMTP in Neon before production use.

## Modes

- No OpenRouter or NVIDIA key in `apps/server/.env` → **Mock mode** badge, deterministic `MockRuntime` simulation.
- A provider key set → **Live agents** badge, `LiveRuntime` probes only the bundled GuardLoop lab at `http://127.0.0.1:5001`. The Juice Shop profile always uses its separate fixed read-only adapter and does not send target content to an LLM.
- `GET /api/mode` exposes the mode. Model IDs come from env (`MODEL_ATTACK`, `MODEL_VERIFY`, `MODEL_FIX`, `MODEL_REPORT`, `MODEL_TARGET`); pick cheap/free IDs from openrouter.ai/models.
- The New Scan form offers the bundled GuardLoop lab or local Juice Shop. Each lab has a fixed endpoint list and fixed loopback port; arbitrary paths and public hosts are rejected.
- To use NVIDIA, set `NVIDIA_API_KEY` and optionally `NVIDIA_BASE_URL` (defaults to `https://integrate.api.nvidia.com/v1`). For each role, set `LLM_PROVIDER_ATTACK`, `LLM_PROVIDER_VERIFY`, `LLM_PROVIDER_FIX`, `LLM_PROVIDER_CONFIRM`, `LLM_PROVIDER_REPORT`, or `LLM_PROVIDER_TARGET` to `nvidia` or `openrouter`, plus its `MODEL_*` ID. Each agent can route to a different provider/model. When only a NVIDIA key is set, roles default to NVIDIA.
- `NVIDIA_MODEL_ATTACK` etc. can also supply a role model when that role uses NVIDIA. API keys are read only by the server and are not returned to the UI.

## Safety rules (enforced in code + tests)

- Scan requests only target loopback on port 5001 (bundled GuardLoop) or 3000 (Juice Shop). Hostnames are DNS-resolved and must be loopback; redirects are disabled. Anything else is blocked by Guard Gate. Public URLs remain out of scope.
- `OPENROUTER_API_KEY` and `NVIDIA_API_KEY` live only in `apps/server/.env`, never sent to the browser; redacted in logs/errors.
- GuardLoop probes only ever go to the bundled local target. Juice Shop checks are GET-only and omit response data from scan events.
- Target `/admin/*` requires `127.0.0.1` + `X-Admin-Token == TARGET_ADMIN_TOKEN`, accepts only the 5 known mitigation IDs.

## Supported local target ports

Guard Gate accepts only the bundled GuardLoop service on port 5001 or the Juice Shop container on port 3000. Changing the target field to another host or port is blocked.

## Checks

```bash
C:\Python313\python.exe -m pytest apps/server/tests -q
C:\Python313\python.exe -m ruff check apps/server/guardloop apps/server/tests
C:\Python313\python.exe -m mypy apps/server/guardloop
C:\Python313\python.exe scripts/check_types.py
npm --prefix apps/web run build
npm --prefix apps/web run test -- --run
```

## End-to-end scan smoke test

Run this after the backend and bundled target are up. It resets the target, starts a scan, polls until completion, and exits non-zero if any endpoint stalls or any finding fails to reach `Reported`.

```bash
cd apps/server
C:\Python313\python.exe scripts/scan_smoke.py --email <verified-test-email> --password <password>
```

You can also pass `--token <neon-jwt>` or set `GUARDLOOP_TOKEN`, `GUARDLOOP_TEST_EMAIL`, and `GUARDLOOP_TEST_PASSWORD`. Use `--endpoints /v1/threads/2 /v1/rate-test` for a shorter focused run, or `--replay-count 4 --mutation-count 2 --max-attempts 2` for a faster smoke check.

## What was deliberately left out

- Full `shadcn/ui` CLI install: all required primitives live in `apps/web/src/components/ui/` (Base-UI-backed shadcn, `base-nova` style) with the app's slate/teal dark theme mapped onto the shadcn CSS variables in `globals.css`. Shared status/severity badges and the labeled select wrapper live in `src/components/` as thin shadcn customizations (variants + className only; generated files untouched).
- Real OpenRouter streaming/billing pages; cost is estimated from `usage.total_tokens`.
- Multi-target orchestration beyond the single local demo target (Guard Gate would need an explicit allowlist UI, which the safety rules forbid widening).
