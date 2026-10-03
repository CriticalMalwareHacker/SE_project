# GuardLoop — closed-loop AI security platform (local)

Four parts: React dashboard (`apps/web`), Flask backend (`apps/server`), vulnerable demo target (`apps/target`), LLM via OpenRouter.

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

## Modes

- No `OPENROUTER_API_KEY` in `apps/server/.env` → **Mock mode** badge, deterministic `MockRuntime` simulation.
- Key set → **Live agents** badge, `LiveRuntime` really exploits `http://127.0.0.1:5001`.
- `GET /api/mode` exposes the mode. Model IDs come from env (`MODEL_ATTACK`, `MODEL_VERIFY`, `MODEL_FIX`, `MODEL_REPORT`, `MODEL_TARGET`); pick cheap/free IDs from openrouter.ai/models.

## Safety rules (enforced in code + tests)

- Server attacks only `127.0.0.1`/`localhost` on the demo port. Hostnames are DNS-resolved and must be loopback; redirects disabled (`follow_redirects=False`). Anything else → Guard Gate `guard_blocked` "out of scope" event.
- `OPENROUTER_API_KEY` lives only in `apps/server/.env`, never sent to the browser; redacted in logs/errors.
- Attack payloads only ever go to the local demo target.
- Target `/admin/*` requires `127.0.0.1` + `X-Admin-Token == TARGET_ADMIN_TOKEN`, accepts only the 5 known mitigation IDs.

## Pointing at a different local target later

Change `TARGET_BASE_URL` in `apps/server/.env` to another `http://127.0.0.1:<port>` and update the scan's target field; Guard Gate still refuses anything non-loopback, so only local ports work by design.

## Checks

```bash
C:\Python313\python.exe -m pytest apps/server/tests -q
C:\Python313\python.exe -m ruff check apps/server/guardloop apps/server/tests
C:\Python313\python.exe -m mypy apps/server/guardloop
C:\Python313\python.exe scripts/check_types.py
npm --prefix apps/web run build
npm --prefix apps/web run test -- --run
```

## What was deliberately left out

- Full `shadcn/ui` CLI install: all required primitives live in `apps/web/src/components/ui/` (Base-UI-backed shadcn, `base-nova` style) with the app's slate/teal dark theme mapped onto the shadcn CSS variables in `globals.css`. Shared status/severity badges and the labeled select wrapper live in `src/components/` as thin shadcn customizations (variants + className only; generated files untouched).
- Real OpenRouter streaming/billing pages; cost is estimated from `usage.total_tokens`.
- Multi-target orchestration beyond the single local demo target (Guard Gate would need an explicit allowlist UI, which the safety rules forbid widening).
