# Phase 0: Repository and Delivery Foundation Validation

## Validation Goal

Prove that the repository foundation is reproducible, that the complete frontend-to-database status path works, and that failures remain safe and understandable. Validation is risk-based: it prioritizes configuration correctness, the API boundary, MongoDB availability behavior, secret protection, and repeatable delivery checks rather than a coverage percentage.

## Evidence Recording

During implementation, record the command, environment category, result, and any relevant artifact for each executed check. Never paste real connection strings, secret values, raw provider errors, or other sensitive diagnostics into this file.

| Check | Evidence | Result |
| --- | --- | --- |
| Frontend automated checks | `frontend`: `npm run typecheck`, `npm run lint`, `npm test` (8 tests) | Pass |
| Backend automated checks | `backend`: `npm run typecheck`, `npm run lint`, `npm test` (19 tests, including isolated MongoDB integration) | Pass |
| Production builds | `frontend`: `npm run build` with a safe server-only local origin; `backend`: `npm run build` | Pass |
| Full local Atlas path | No developer Atlas URI was supplied. Per the 2026-09-04 validation direction, the practical substitute used the full Next.js proxy -> Express -> isolated MongoDB path and observed `200`, safe `503` during outage, and recovery to `200` without restarting Express. | Pass with approved practical substitution |
| Failure and security review | Missing frontend/backend configuration exited non-zero; API boundary tests verified exact safe envelopes; browser HTML/client static output did not expose the configured upstream origin; tracked-file hygiene reviewed. | Pass |
| CI run | `.github/workflows/ci.yml` reviewed for push/PR triggers, independent deterministic installs, both applications' four gates, pinned Node version, and no provider credentials or deployment steps. A hosted run requires pushing the branch. | Pass by configuration review; hosted run pending |

### Validation environment and justified exceptions

- Practical checks were run in the available development environment, as directed on 2026-09-04. The repository and CI pin Node.js `24.20.0` and npm `11.19.0`; no further portable-runtime or synthetic restricted-filesystem certification was performed.
- The Atlas-specific manual check was replaced by the same complete local request path using the test-only ephemeral MongoDB because no developer-owned Atlas URI was available. No external database credentials were used or recorded.
- The GitHub Actions definition was reviewed locally but cannot produce a hosted run until the feature branch is pushed.

## Automated Validation

### Backend configuration tests

- Valid test configuration is accepted and normalized without starting network or database work during module import.
- Each required missing configuration value causes a deterministic startup/configuration failure.
- Syntactically invalid URLs, ports, modes, or other bounded configuration values are rejected.
- Configuration errors do not include secret values in public responses or captured diagnostics.
- Test configuration can substitute the ephemeral MongoDB URI without reading Atlas credentials.

### Backend API integration tests

Use Vitest, Supertest, and an isolated ephemeral in-memory MongoDB instance.

- `GET /api/v1/health` returns `200` and exactly the required safe healthy fields while the test database is connected.
- The same endpoint returns `503` with `SERVICE_UNAVAILABLE`, the safe message, and generic `database: disconnected` detail when the database is unavailable.
- The healthy response is never returned for connecting, disconnecting, disconnected, or unknown database states.
- The health check does not write application records.
- An unknown API route returns `404` through the standard error envelope.
- A deliberately induced unexpected application error returns a generic `5xx` envelope and does not expose a stack trace, file path, database error, or configuration value.
- Safe validation details are included only for a controlled validation failure; unnecessary `details` fields are absent.
- Database and HTTP resources are closed after tests so the command exits without hanging handles.
- Tests run successfully with Atlas credentials absent and without external network/database access.

### Frontend behavior tests

Use Vitest and React Testing Library with controlled API responses at the frontend boundary.

- The page initially exposes an understandable checking state.
- A valid healthy response changes the page to the available state.
- A `503` error envelope changes the page to the unavailable state without rendering raw response diagnostics.
- Other HTTP failures and proxy/network rejection produce the same safe unavailable state.
- An HTTP `200` response with a malformed or unexpected body is treated as unavailable.
- The request configuration has no automatic retry, polling, or focus-triggered refetch for this check.
- No manual retry button or equivalent retry control is rendered.
- Status meaning is present in text and does not depend on color alone.
- The status page does not expose the upstream Express origin or an Atlas configuration value.

### Static and build checks

Run from both `frontend/` and `backend/`:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Verify:

- Both applications use their own manifests and lockfiles.
- Deterministic clean installation succeeds in each application using the documented npm command.
- The pinned Node.js version, both `engines` declarations, and CI version agree.
- Type checking and linting report no errors.
- Tests pass without a coverage threshold.
- Production builds complete without connecting to Atlas or another live service.
- No root npm workspace, shared package, orchestration tool, or combined application launcher exists.
- No Playwright dependency, configuration, browser artifact, or end-to-end test is added.

## Manual Acceptance Checks

### Full happy path with Atlas

1. Start from a clean checkout using the pinned Node.js release.
2. Create ignored local environment files from the tracked examples.
3. Supply a valid developer-owned Atlas connection string only in the backend environment.
4. Install and start the backend and frontend independently in separate terminals using the README instructions.
5. Open the frontend root page in a current evergreen browser.
6. Confirm the browser calls the same-origin `/api/v1/health` path rather than the Express origin.
7. Confirm the page progresses from checking to available.
8. Confirm the API returns `200` with `status: ok` and `database: connected` and no undocumented infrastructure information.
9. Confirm the health request creates or changes no application data.

### Runtime database outage

1. With valid configuration loaded, make the development database temporarily unreachable using a safe, reversible method.
2. Confirm Express remains running and the health endpoint returns `503` with the approved error envelope.
3. Confirm the status page shows unavailable after a fresh page load and offers no retry control.
4. Confirm public output contains no raw Mongoose/Atlas error, host, database name, username, connection string, stack trace, or file path.
5. Restore connectivity and confirm the driver can recover and a subsequent browser refresh shows available without restarting solely to clear application state.

### Invalid configuration

1. Start each affected application with a required environment value absent, then with a syntactically invalid value.
2. Confirm startup exits non-zero before accepting traffic.
3. Confirm diagnostics identify the configuration field/problem without echoing a supplied secret.
4. Confirm build and static-analysis commands remain independent of runtime service availability.

### Proxy and frontend failures

- Point frontend server configuration at an unavailable local backend and confirm a fresh page load shows unavailable without raw network text.
- Return a controlled malformed `200` health payload in a development/test setup and confirm it is not represented as healthy.
- Confirm there is exactly one initial health request under normal rendering and no timed or focus-driven follow-up request.

### Accessibility and responsive review

- Navigate the page using a keyboard and confirm no interaction trap or hidden required control exists.
- Inspect semantic headings/status text and confirm assistive technology can discover the current state.
- Verify visible focus where focusable browser/page elements exist.
- Verify available and unavailable meaning remains clear without color.
- Inspect representative narrow mobile and desktop widths for readable, non-overflowing content.

### Secret and repository hygiene

- Inspect tracked files for local `.env` files, Atlas credentials, service origins containing credentials, logs, build output, coverage output, and ephemeral database artifacts.
- Inspect the browser bundle/network-visible configuration to confirm the upstream Express origin and Atlas URI are not exposed.
- Exercise safe error cases and inspect API responses for stack traces, raw database/provider errors, file paths, or configuration values.
- Review server diagnostics to confirm request/response bodies, cookies, authorization values, and secrets are not logged.
- Confirm environment example files contain placeholders only.

### Documentation review

- Follow the README from a clean checkout and confirm that prerequisites, independent install/start commands, environment setup, verification, and tests are sufficient.
- Confirm the README links to `specs/_template/` and does not duplicate the full template.
- Confirm each template file contains lightweight prompts rather than rigid boilerplate.
- Confirm documentation identifies Atlas as the normal database, ephemeral MongoDB as test-only, Playwright as deferred to Slice 1.1, and live deployment as deferred to Phase 3.

## Continuous Integration Validation

- The workflow runs on pushes and pull requests.
- Frontend and backend type-check, lint, test, and build gates are visible and required by the workflow definition.
- CI uses the same pinned Node.js release as local development.
- Dependency installation is deterministic and uses each application's lockfile.
- Backend integration tests use ephemeral MongoDB and require no Atlas secret.
- No Cloudinary, Gmail SMTP, Gemini, Vercel, Koyeb, or other deployment/provider secret is required.
- A controlled failing check makes its CI job fail; restoring the check returns CI to green.
- CI contains no deployment action in Phase 0.

## Constitution and Scope Review

Before merge, verify:

- The frontend remains Next.js and the sole browser-facing API URL is the same-origin proxy.
- Express remains the API and business-logic boundary.
- MongoDB/Mongoose and the selected TypeScript/Node/npm stack match `tech-stack.md`.
- The applications are independent and no excluded infrastructure or monorepo abstraction was introduced.
- The implementation contains no authentication, workspace/project domain behavior, product shell, AI dependency, attachment/email integration, or live deployment.
- Error handling, diagnostics, validation, and status behavior match `requirements.md`.
- Documentation and tests reflect actual commands and behavior.

## Merge Gate

Phase 0 is safe to merge only when:

1. Every acceptance criterion in `requirements.md` is satisfied or an explicitly approved specification amendment records the change.
2. All required frontend and backend type-check, lint, test, and build commands pass.
3. The full same-origin frontend → Express → Atlas path has been demonstrated manually.
4. Automated integration tests pass without Atlas credentials or external database access.
5. Runtime database outage and invalid-configuration behavior fail safely as specified.
6. No secret or sensitive internal detail is found in tracked files, browser-visible configuration, public responses, or inappropriate logs.
7. CI passes all required checks and performs no deployment.
8. README and template documentation are accurate and usable.
9. The implementation has been reviewed against `mission.md`, `tech-stack.md`, `roadmap.md`, and this approved specification.

## 2026-09-08 Amendment Validation — Complete

### Status and relationship to prior evidence

The evidence above remains the truthful record of the original Phase 0 implementation. The approved containerized CI/CD amendment superseded its no-Docker and no-deployment constraints; it does not retroactively change what was tested in 2026-09-04.

The approved 2026-09-08 completion amendment removed three live exercises from the Phase 0 completion gate: starting Compose against an external MongoDB, deliberately deploying an unhealthy production candidate, and creating overlapping eligible production deployments. No evidence for those exercises is claimed below. The implemented Compose artifact, Northflank readiness controls, and newest-wins concurrency remain documented delivery behavior.

| Amendment check | Recorded evidence | Result |
| --- | --- | --- |
| Container builds | The `Container checks` job built both application images for deployed commit `6f8af91c8d26bcd753ad2cf3b51e678186eb5bba`. | Pass |
| Backend image smoke test | The same job started the production backend image with safe ephemeral MongoDB configuration and required the exact approved health response. | Pass |
| Compose definition | `compose.yaml` defines only `frontend` and `backend`, routes the server-side proxy through the internal backend service, and requires an externally supplied `MONGODB_URI`; no runtime Compose exercise is required by the completion amendment. | Pass by configuration review |
| Pull-request gate | [Run 34250537168](https://github.com/shahzaibalijamro/client-scope/actions/runs/34250537168) passed application, browser, container, and `CI gate` jobs for commit `8df4e32bb22effd21695bc0ad93a07255225d6ca`; publication and deployment did not run. | Pass |
| Protected `main` | The configured ruleset requires a pull request and the stable `CI gate`. [Run 34166611293](https://github.com/shahzaibalijamro/client-scope/actions/runs/34166611293) demonstrated a container-check failure propagating to a failed gate; later corrected runs passed. | Pass |
| GHCR publication | [Run 34251092986](https://github.com/shahzaibalijamro/client-scope/actions/runs/34251092986) published only `ghcr.io/shahzaibalijamro/clientscope-backend:6f8af91c8d26bcd753ad2cf3b51e678186eb5bba`; its privacy check passed, and anonymous backend-package access returned `404`. No frontend image was published. | Pass |
| Northflank deployment | The production job in run 34251092986 verified the deployment service had no linked source build, selected the exact GHCR image, completed rollout, and passed the public health check. Independent verification returned `200` with `{"status":"ok","database":"connected"}`. | Pass |
| Vercel promotion | The same commit's Vercel status reported `Waiting for checks to complete` before changing to success. The native deployment completed and `https://client-scope-v1.vercel.app/` returned `200`. | Pass |
| Secret and bypass review | Provider credentials remain in provider/GitHub secret stores; tracked files contain identifiers and placeholders only. The workflow uses a dedicated package-scoped publishing token, and Northflank's safety check rejects a linked source build. | Pass |

### Container and Compose evidence

- The successful `Container checks` job built the backend and frontend Dockerfiles from their application contexts.
- The backend image used non-secret test configuration and an ephemeral MongoDB, then returned exactly `{"status":"ok","database":"connected"}` from `GET /api/v1/health`.
- The validated backend image was exported from that job and downloaded for publication rather than rebuilt before the GHCR push.
- Repository inspection confirmed that `.dockerignore` files exclude local environments, dependencies, build output, logs, and test artifacts and that both runtime stages use non-root users.
- Repository inspection confirmed that Compose contains only the two application services, uses internal service networking, and receives MongoDB and runtime values from external environment configuration.
- A runtime Compose startup was not performed and is not required by the approved completion amendment.

### GitHub Actions evidence

- Pull-request run 34250537168 passed frontend and backend lint, typecheck, tests, and production builds; the critical Playwright journeys; both Docker builds; the backend-container smoke test; and the stable `CI gate`.
- Its `Publish immutable backend image` and `Deploy backend to Northflank` jobs were skipped as required.
- Failed pull-request run 34166611293 showed that a required container failure makes `CI gate` fail. The gate's explicit dependency-result checks apply the same blocking behavior to every required job.
- The `main` ruleset was configured to require a pull request and `CI gate` before merge.
- Main run 34251092986 passed all seven jobs in order: the three application/browser jobs, container verification, `CI gate`, immutable publication, and exact-image deployment.

### GHCR and Northflank evidence

- Main run 34251092986 exported the smoke-tested backend image, published it under the full commit SHA, and successfully verified that GitHub reported the package as private.
- The workflow publishes no `latest`, branch, or other moving tag and contains no frontend publication path. Anonymous checks returned `404` for both backend and frontend package pages.
- The Northflank job verified a deployment service with no linked internal build and used the saved `clientscope-ghcr-read` credential to select `ghcr.io/shahzaibalijamro/clientscope-backend:6f8af91c8d26bcd753ad2cf3b51e678186eb5bba`.
- The deployment completed successfully, and `https://http--clientscope-backend--298pw9ggfpy6.code.run/api/v1/health` independently returned `200` with the approved safe body.
- No deliberate unhealthy candidate or overlapping production deployment was exercised, as permitted by the approved completion amendment.

### Vercel evidence

- The Git-connected project uses `frontend/` as its root and builds Next.js natively; `output: "standalone"` is limited to the Docker/local-infrastructure path.
- The commit status for `6f8af91c8d26bcd753ad2cf3b51e678186eb5bba` first reported `Waiting for checks to complete`, then reported `Deployment has completed` after `CI gate` succeeded.
- The stable production URL `https://client-scope-v1.vercel.app/` independently returned `200` and served ClientScope content.
- No frontend container registry or Docker-based Vercel deployment path exists.

### Amendment completion determination

Phase 0 returned to **Complete** on 2026-09-08 because:

1. Every acceptance criterion retained by the approved completion amendment has passing evidence above.
2. The original application checks and current critical browser journeys passed on the deployed commit.
3. Both Dockerfiles passed CI, the backend runtime image passed its smoke test, and the app-only Compose definition passed configuration review.
4. Pull requests cannot publish or deploy, and the protected `main` gate blocks both production paths when a required dependency fails.
5. The backend image tested by CI, published privately under the full commit SHA, and deployed by Northflank is the same artifact.
6. Vercel demonstrably waited on the complete GitHub gate before successful production deployment.
7. Provider configuration and tracked delivery files expose no credential or parallel repository-build deployment path.
8. The README, technology stack, roadmap, and this specification describe the implemented delivery system consistently.
