# GuardLoop CO4 Unit Testing Report Brief

## Instructions for Claude

Create a polished Word report from this brief. Follow the course lab manual titled **SE LAB MANUAL UNIT TESTING (1)** and retain the facts, commands, and results exactly as stated. Do not invent a coverage percentage, failed test, student name, roll number, faculty name, date, or screenshots.

Use these placeholders on the title page where the student information is unknown:

- Student name: `[Student Name]`
- Roll number: `[Roll Number]`
- Division: `[Division]`
- Faculty name: `[Faculty Name]`
- Submission date: `[Submission Date]`

Use the title **Unit Testing of GuardLoop Local Security Training Platform**. State that the experiment maps to **CO4 Apply unit testing frameworks**. Use a formal academic style. Include a title page, table of contents, numbered headings, the detailed test-case table, the observation table, test evidence, changes made, answers to the lab questions, conclusion, and appendix with commands. Keep all headings black and use readable tables with visible borders.

## 1 Project under test

GuardLoop is a local cybersecurity training platform with four main parts:

1. React dashboard in `apps/web`.
2. Flask backend in `apps/server`.
3. Deliberately vulnerable local training target in `apps/target`.
4. Mock and live scan runtimes that coordinate guard, attack, verification, confirmation, and reporting steps.

The project deliberately limits scans to fixed loopback training targets. It supports a deterministic mock mode and a live mode that exercises only predefined checks against the local target.

## 2 Aim and objective

### Aim

To perform unit testing on selected GuardLoop modules and confirm that the core security controls, scan-state logic, persistence, authentication boundaries, and dashboard utilities produce the expected results.

### Objective

- Test individual functions and modules independently using automated test frameworks.
- Include normal, boundary, negative, and error-handling cases.
- Record actual test results.
- Review and document changes made during the project review.

## 3 Test environment

| Item | Value |
|---|---|
| Operating system | Windows local development environment |
| Backend language and framework | Python 3.13, Flask, Pydantic, SQLAlchemy |
| Backend test framework | pytest 8.3.4 |
| Frontend language and framework | TypeScript, React, Vite |
| Frontend test framework | Vitest 5.0.5 |
| Test database | Temporary SQLite database created by `apps/server/tests/conftest.py` |
| Runtime mode during backend tests | Mock mode |
| External I/O | Excluded from the unit-test setup; Neon credentials are replaced with test values |

The backend test fixture creates a temporary SQLite database, forces mock mode, supplies test-only Neon Auth values, and avoids a connection to a live Neon database. This keeps unit tests isolated and repeatable.

## 4 Test design technique

The selected tests use the following techniques specified in the lab manual:

- **Equivalence class partitioning:** valid local targets versus invalid external or unsupported targets.
- **Boundary value analysis:** behaviour at the LLM-call budget limit and around state-transition limits.
- **Decision table testing:** access is allowed only when the user is authenticated and owns the scan; unowned or unauthenticated requests are rejected.
- **Negative and exception testing:** invalid JWTs, malformed LLM output, invalid state transitions, blocked DNS resolution, and rejected external targets.

## 5 Modules selected for unit testing

| Module or function | Reason for selection |
|---|---|
| Finding state machine | Ensures a finding follows only valid lifecycle transitions. |
| Guard Gate target validation | Enforces the local-only scan policy. |
| Mock and live runtime helpers | Controls scan behaviour, cancellation, replay, LLM budget, and payload restrictions. |
| Flask API authorization | Prevents unauthenticated access and cross-user scan access. |
| Neon JWT validation | Verifies EdDSA tokens before creating or reading user-scoped data. |
| Database persistence helpers | Ensures scan findings remain separated by scan identifier. |
| Metrics calculation | Confirms reporting metrics are computed correctly. |
| Frontend finding utilities | Verifies filtering, search, sorting, and event-related UI logic. |

## 6 Detailed unit test cases

Use the following as the main test-case table. Set **Actual Result** to `Matched expected result` and **Status** to `Pass` for every row because the recorded test run passed all cases.

| ID | Test case name | Objective and test type | Input or condition | Expected result |
|---|---|---|---|---|
| UT01 | Valid state-machine transitions | Functional and negative test for finding lifecycle | Candidate to Verifying; Verifying to Rejected or Fixing; invalid Candidate to Reported transition | Allowed transitions succeed; invalid transitions raise `ValueError`. |
| UT02 | Hallucination threshold | Boundary test for reproducibility logic | Scores 0.1 and 0.9 with threshold 0.6 | 0.1 is rejected; 0.9 is accepted as reproducible. |
| UT03 | Loopback and maximum attempts | Functional test of remediation lifecycle | Retesting to Fixing and Retesting to Fix Failed | Both lifecycle paths are permitted. |
| UT04 | Non-local target rejection | Negative security test | `http://example.com:5001/x` and local loopback URLs | External target is rejected; approved loopback target is accepted. |
| UT05 | DNS trick rejection | Negative security test | Host resolving to a public IP address | Target is rejected with a non-loopback reason. |
| UT06 | Vulnerable target mitigations | Functional test | Prompt injection, unescaped HTML, metadata access, BOLA, and invalid admin token | Baseline weaknesses are observed; each known mitigation blocks its related local check; invalid admin token returns 403. |
| UT07 | LLM malformed-output fallback | Error-handling test | Non-JSON model response | Safe fallback model is returned and the fallback flag is set. |
| UT08 | LLM budget enforcement | Boundary and exception test | Call budget already at its limit | `BudgetExceeded` is raised. |
| UT09 | Mock scan determinism | Functional test | Fixed seed and authorized local scan | Scan state is created and can be halted safely. |
| UT10 | Kill switch behaviour | Functional safety test | Halt a running scan | At most one additional halt event appears after the kill switch. |
| UT11 | SSE event replay | Functional test | Two stored events and a last event identifier | Only events after the supplied identifier are replayed. |
| UT12 | API rejects non-local scan | Integration-style API boundary test | Authenticated request with `http://evil.com:5001/x` | API returns HTTP 403 and `out_of_scope`. |
| UT13 | Authentication and scan ownership | Decision-table authorization test | Unauthenticated, Alice, and Bob requests | Unauthenticated scan request returns 401; Alice sees her scan; Bob receives 404 for Alice's scan. |
| UT14 | Neon EdDSA JWT validation | Authentication test | Valid signed JWT and invalid token | Valid token returns the user; invalid token returns no user. |
| UT15 | Juice Shop fixed-check mapping | Configuration test | Fixed Juice Shop adapter list | Four fixed endpoints exist and map to at least three OWASP categories. |
| UT16 | Per-scan finding persistence | Data-isolation test | Same runtime finding identifier under two scans | Two distinct stored rows are created, one for each scan. |
| UT17 | Live payload validation | Negative and functional test | Safe built-in payloads and invalid payload proposals | Built-in payloads are accepted; unsafe proposals are rejected. |
| UT18 | Metrics calculation | Functional test | One verified finding and one rejected finding | Verified remediation rate is 1.0 and completion metrics are calculated. |
| UT19 | Filter findings by status | Frontend functional test | Reported and Rejected findings, status filter `Rejected` | Exactly one rejected finding is returned. |
| UT20 | Filter findings by search term | Frontend functional test | Search for `F-002` | Exactly the matching finding is returned. |
| UT21 | Sort findings by identifier | Frontend functional test | Findings F-001 and F-002, descending order | F-002 appears first. |
| UT22 | Loopback event marker | Frontend event test | Event with type `loopback` | The event is recognised as a loopback event. |

## 7 Test execution procedure

Run the backend tests from the repository root:

```powershell
C:\Python313\python.exe -m pytest apps/server/tests -q
```

Run the frontend tests from `apps/web`:

```powershell
npm.cmd run test
```

Run the frontend production build and TypeScript check:

```powershell
npm.cmd run build
```

## 8 Recorded test results

### Backend unit test execution

Command executed:

```text
C:\Python313\python.exe -m pytest apps/server/tests -q
```

Recorded output:

```text
18 passed in 3.63s
```

### Frontend unit test execution

Command executed from `apps/web`:

```text
npm.cmd run test
```

Recorded output:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
Duration    4.94s
```

### Frontend build verification

Command executed from `apps/web`:

```text
npm.cmd run build
```

Result: the TypeScript check and Vite production build completed successfully. Vite produced non-blocking deprecation and bundle-size warnings, but the build passed.

### Overall result

| Test group | Executed | Passed | Failed | Result |
|---|---:|---:|---:|---|
| Backend pytest suite | 18 | 18 | 0 | Pass |
| Frontend Vitest suite | 4 | 4 | 0 | Pass |
| Total automated unit tests | 22 | 22 | 0 | Pass |

## 9 Observation table

| Module name | Test cases executed | Passed | Failed | Code coverage percentage |
|---|---:|---:|---:|---|
| Backend core and API modules | 18 | 18 | 0 | Not measured in this run |
| Frontend store utilities | 4 | 4 | 0 | Not measured in this run |
| Overall | 22 | 22 | 0 | Not measured in this run |

### Coverage note

The manual expects at least 90% code coverage. The current Python dependency list does not include `coverage` or `pytest-cov`, so a valid coverage percentage was not produced during this recorded run. Do not replace `Not measured` with an estimate.

To complete this requirement in a future run, add `pytest-cov` to `apps/server/requirements.txt` and run a scoped measurement such as:

```powershell
C:\Python313\python.exe -m pytest apps/server/tests -q --cov=apps/server/guardloop --cov-report=term-missing
```

The resulting terminal percentage may be entered in the observation table only after it has been measured. Additional tests may be needed to reach 90% coverage.

## 10 Changes made during the reviewed implementation

### Change 1 JWT token retrieval correction

File changed: `apps/web/src/auth.ts`.

Problem identified during code review: the Neon authentication fallback used `authClient.token()` after a session lookup. The installed Neon client may satisfy that request from a cached session response, which has no `data.token` field. This made `getNeonJwt()` return `null`, causing protected scan API calls to be sent without a bearer token.

Change implemented: the fallback now calls the token endpoint with the `X-Force-Fetch: true` header. This bypasses the session cache and requests a fresh JWT.

Verification: the frontend TypeScript check and production build passed after the change.

### Change 2 Environment-file protection

File changed: `.gitignore`.

Change implemented: added `.env` and `.env.*` ignore rules while explicitly allowing `.env.example` and `.env.*.example` templates. Local `.env.local`, `apps/server/.env`, and `.neon` configuration are ignored, protecting local credentials from an accidental Git push.

### Test-result interpretation

No failing automated test was observed in the recorded final run. The authentication issue above was found through code review and corrected before the final test and build evidence was recorded. Therefore, the report must not claim a fabricated before-and-after failed test result.

## 11 Known limitations and follow-up tests

- Mock mode validates the scan workflow without contacting the target; it is useful for a predictable demonstration but is not a real target scan.
- Live mode is intentionally limited to predefined local checks and is not a general-purpose vulnerability scanner.
- The demo target applies mitigations in memory. Restarting the target or calling its reset endpoint removes the changes.
- Add a unit test that confirms a failed `/admin/patch` request is reported as a failed remediation. The current live runtime should not label a patch as applied when the local target rejects it.
- Add focused tests for the new forced JWT-token retrieval path.
- Add coverage tooling and write additional tests until measured coverage satisfies the lab manual's 90% target.

## 12 Answers to the lab-manual questions

### What is unit testing?

Unit testing checks the smallest independently testable part of a program, such as a function, class, or method. It verifies expected behaviour in isolation and helps detect defects early.

### Differentiate between unit and integration testing.

Unit testing evaluates one component with controlled dependencies. Integration testing checks whether multiple components work correctly together, for example whether a frontend request, backend API, database, and authentication service exchange data correctly.

### What is the role of mocks and stubs?

Mocks and stubs replace real dependencies during a test. They make tests faster, deterministic, and independent from network services, databases, or external providers. GuardLoop uses a temporary SQLite database, mock mode, and patched authentication or DNS behaviour in selected tests to isolate the unit under test.

### What is code coverage and why is it important?

Code coverage measures how much executable code is exercised by automated tests. It helps identify untested paths, but high coverage alone does not prove correctness. Tests must also assert meaningful behaviour, negative cases, and boundary conditions.

### Explain boundary value testing with an example.

Boundary value testing focuses on values at or near a decision limit. In GuardLoop, the LLM budget test checks behaviour when the number of used calls equals the permitted limit. The expected result is that the system raises `BudgetExceeded` instead of allowing another call.

## 13 Conclusion

The recorded unit-test execution confirms that the selected GuardLoop modules behaved as expected: all 18 backend tests and all 4 frontend tests passed. The suite covers core state transitions, local-scan safety checks, cancellation, SSE replay, user ownership, JWT validation, persistence, metrics, and frontend filtering and sorting. The review also corrected JWT-token retrieval and strengthened environment-file protection. The next required quality step is to add coverage tooling, measure coverage, and expand tests until the manual's 90% coverage target is demonstrably met.

## 14 Source files for the report appendix

List these files in an appendix titled **Test Artefacts**:

- `apps/server/tests/test_all.py`
- `apps/server/tests/conftest.py`
- `apps/web/src/store.test.ts`
- `apps/web/src/auth.ts`
- `.gitignore`
- `SE LAB MANUAL UNIT TESTING (1).docx`
