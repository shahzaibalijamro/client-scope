# Phase 0: Repository and Delivery Foundation Validation

## Validation Goal

Prove that the repository foundation is reproducible, that the complete frontend-to-database status path works, and that failures remain safe and understandable. Validation is risk-based: it prioritizes configuration correctness, the API boundary, MongoDB availability behavior, secret protection, and repeatable delivery checks rather than a coverage percentage.

## Evidence Recording

During implementation, record the command, environment category, result, and any relevant artifact for each executed check. Never paste real connection strings, secret values, raw provider errors, or other sensitive diagnostics into this file.

| Check | Evidence | Result |
| --- | --- | --- |
| Frontend automated checks | Pending implementation | Pending |
| Backend automated checks | Pending implementation | Pending |
| Production builds | Pending implementation | Pending |
| Full local Atlas path | Pending implementation | Pending |
| Failure and security review | Pending implementation | Pending |
| CI run | Pending implementation | Pending |

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
- No Cloudinary, Resend, Gemini, Vercel, Koyeb, or other deployment/provider secret is required.
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

