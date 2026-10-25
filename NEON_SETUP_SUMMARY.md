# Neon Setup Summary

## Changes made

- Linked the repository to the requested Neon project and `production` branch, and configured the Postgres and Neon Auth services in `neon.ts`.
- Ran `neon deploy`. Neon reported that the production branch already matched the service configuration and pulled five environment variables into the ignored root `.env.local` file. Secret values are not included here.
- Added Neon Auth to the web app. The login and registration page now uses Neon Auth for sign-in, sign-up, session checks, and sign-out. It was also restyled with a centered card, a soft patterned background, and clearer form controls.
- Added bearer-token handling to the web API client and authenticated scan event stream.
- Added backend JWT verification against Neon Auth's JWKS endpoint and maps verified Neon users to GuardLoop user records.
- Added Neon Postgres connection handling and startup migrations, with SQLite retained for local tests and fallback development use.
- Updated the example environment file, dependencies, migrations, and authentication tests.

## Validation completed

- `npm run build` — passed.
- Vitest — 4 passed.
- Server tests — 16 passed using an isolated SQLite database.
- Ruff — passed.
- Mypy — no issues found in 21 source files.
- Local smoke check — `/health` returned HTTP 200 and unauthenticated `/api/scans` returned HTTP 401.
- `neon deploy` — succeeded and reported Postgres and Neon Auth as utilized services.

## Issues and remaining verification

- The Neon CLI's automatic agent-skill installation stalled during `neon init`. Initialization completed with `--no-agent-setup`; the integration was implemented using Neon documentation.
- The Neon skills installer required Node.js 22.20 or newer; the available version was 22.18.0.
- A live connection to the Neon database could not be established from this machine: DNS resolution for the Neon database and Auth hosts was refused (`getaddrinfo failed` / `RCODE_REFUSED`). As a result, the Alembic migration was not applied to the live Neon database, and Neon sign-in plus a database-backed scan were not verified end to end.

After DNS access to Neon is available, run `python -m alembic upgrade head` from `apps/server` (or start the server, which applies migrations at startup), then verify sign-up/sign-in and a scan against Neon.

## Configuration notes

Neon-generated variables are stored in the root `.env.local`, which is ignored by Git. Do not commit that file or copy its secret values into this document. The frontend only receives the public Neon Auth URL; database credentials and the JWKS URL remain server-side.
