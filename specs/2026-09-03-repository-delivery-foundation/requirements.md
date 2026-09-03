# Phase 0: Repository and Delivery Foundation Requirements

**Status:** Approved  
**Approved:** 2026-09-03  
**Roadmap scope:** Phase 0 — Repository and Delivery Foundation

## Purpose

Establish the smallest reliable technical foundation needed to build ClientScope as two independent applications and to verify the first complete browser-to-database path. The foundation must make later feature work repeatable, testable, and consistent without prematurely building product workflows or infrastructure.

## Desired Outcome

A developer can configure MongoDB Atlas, start the frontend and backend independently, open a public system-status page, and observe a successful request traveling through the frontend's same-origin `/api` boundary to the Express API and MongoDB. The repository also provides reproducible toolchain settings, baseline validation and error handling, practical automated tests, CI checks, and a lightweight specification workflow.

## Constitutional Constraints

This feature must remain consistent with:

- `specs/mission.md`, especially privacy by default, correctness, backend-enforced security boundaries, core independence from AI, and spec-driven development.
- `specs/tech-stack.md`, including the independent Next.js and Express applications, TypeScript/Node.js/npm stack, REST API, MongoDB/Mongoose, Zod, selected test tools, same-origin proxy, and GitHub Actions.
- `specs/roadmap.md`, especially the Phase 0 outcomes, required specification lifecycle, risk-based verification, and prohibition against building technical layers that no current slice needs.

When convenience conflicts with these sources, security, data integrity, explicit behavior, and testability take priority.

## Scope

### In scope

- A Git repository whose primary branch is `main` and whose feature work occurs on a dedicated feature branch.
- Independent `frontend/` and `backend/` applications, each with its own `package.json`, lockfile, dependencies, and scripts.
- A pinned active Node.js LTS release expressed in repository version metadata, application engine requirements, and CI.
- A Next.js App Router frontend using TypeScript and Tailwind CSS.
- TanStack Query as the remote-state boundary used by the status check, with automatic retries and polling disabled for this request.
- Frontend Zod validation at the API-response boundary.
- React Hook Form available for later feature forms without adding a placeholder form to Phase 0.
- An Express TypeScript API with versioned routes, Mongoose connectivity, Zod configuration/request validation foundations, centralized not-found and error handling, and graceful shutdown behavior.
- A server-side same-origin Next.js `/api` proxy to the Express API; browser code must not need or expose the Express service origin.
- A public, minimal, responsive, accessible system-status page and `GET /api/v1/health` endpoint.
- MongoDB Atlas for normal development and future deployed environments, configured only through environment variables.
- A test-only ephemeral in-memory MongoDB instance for backend integration tests and CI.
- A common REST error response contract.
- Basic structured server-side diagnostics that exclude secrets and sensitive internals.
- Vitest, Supertest, React Testing Library, and a practical initial automated test suite.
- GitHub Actions checks for type checking, linting, automated tests, and production builds in both applications.
- Environment examples, local setup guidance, application commands, and troubleshooting guidance sufficient to run and verify the foundation.
- A minimal reusable feature-specification template under `specs/_template/`, containing `requirements.md`, `plan.md`, and `validation.md`.
- A concise root README explanation of the specification lifecycle with a link to the template.

### Out of scope

- Authentication, authorization infrastructure, sessions, email verification, password reset, invitations, or user records.
- Workspaces, clients, projects, memberships, project access, or any other Phase 1 domain behavior.
- An application shell, product navigation, dashboard, component library, or placeholder product screens.
- Forms created only to demonstrate React Hook Form.
- Cloudinary, Resend, Gemini, or their credentials and service integrations.
- Playwright installation or end-to-end tests; these begin with the first meaningful user journey in Slice 1.1.
- Live Vercel, Koyeb, or other environment deployment. Live deployment is deferred until Phase 3.
- Docker, a local MongoDB installation path, npm workspaces, a shared package, Turborepo, or repository-level application orchestration.
- Coverage-percentage targets, a large testing abstraction layer, a broad error taxonomy, advanced logging/telemetry, or enterprise operational infrastructure.
- Application business logic beyond what is necessary for configuration, connectivity, status reporting, and safe errors.

## Repository and Tooling Decisions

1. `frontend/`, `backend/`, and `specs/` remain explicit top-level boundaries.
2. Frontend and backend commands are run from their respective directories, normally in separate terminals.
3. There is no root package manager workspace or root script that starts both applications.
4. The active Node.js LTS version at implementation time is pinned consistently. Exact framework and package versions are captured by each application's lockfile.
5. Each application exposes consistently named scripts for `dev`, `typecheck`, `lint`, `test`, and `build`. Extra narrowly scoped scripts are allowed where useful.
6. No code-sharing package is introduced. Cross-application contracts are kept consistent through this approved specification and boundary tests.
7. Generated files, local environment files, logs, build output, coverage output, and editor/OS artifacts are excluded from Git. Environment example files remain tracked and contain placeholders only.

## Configuration and Environment Rules

1. Normal backend operation reads its MongoDB Atlas URI and other environment-dependent settings from validated server configuration.
2. Real credentials and connection strings must never be committed, embedded in client bundles, copied into test fixtures, or printed in logs and API responses.
3. The browser calls only the same-origin `/api` path. The upstream Express origin is server-side frontend configuration.
4. Required configuration is validated once at process startup. Missing values or syntactically invalid values produce a clear server-side diagnostic and a non-zero exit.
5. A configured Atlas service that is temporarily unreachable, rejects a runtime connection, or later disconnects is an operational availability failure rather than a configuration disclosure opportunity.
6. Backend tests substitute an ephemeral in-memory MongoDB URI and do not require Atlas credentials or network access.
7. Production builds and static checks must not require a live database connection.
8. Environment examples must distinguish frontend server configuration from backend configuration and explain where the developer supplies the Atlas URI.

## Health Workflow and Business Rules

### Endpoint

- The canonical backend endpoint is `GET /api/v1/health`.
- The frontend accesses it at the same path through the Next.js `/api` proxy.
- The endpoint is public because Phase 0 has no identity model and its response contains no private project or infrastructure data.
- The check must determine whether the API is responsive and Mongoose currently considers MongoDB connected.
- The endpoint must be read-only and must not create or alter database records.
- Responses must not reveal hostnames, database names, account identifiers, connection strings, driver errors, stack traces, version inventories, or provider-specific diagnostics.

### Healthy response

When the API and MongoDB are ready, the endpoint returns HTTP `200` with this stable minimum representation:

```json
{
  "status": "ok",
  "database": "connected"
}
```

Additional response fields require a demonstrated operational need and must be safe for a public caller.

### Unavailable response

When Express is running but MongoDB is not connected, the endpoint returns HTTP `503` through the common error contract:

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service is temporarily unavailable.",
    "details": {
      "database": "disconnected"
    }
  }
}
```

The database detail is a deliberately generic public status. Internal connection failures remain server-side.

### Process behavior

- Once required configuration has passed validation, Express remains available during a temporary database outage so readiness can return `503` and the driver can recover when connectivity returns.
- API operations that require MongoDB must never be represented as successful while the database is unavailable.
- The process handles termination signals by stopping new work, closing the HTTP server and database connection when present, and exiting cleanly within a bounded interval.

## Status Page

The root frontend page is a minimal system-status surface, not a product dashboard.

It has these observable states:

1. **Checking:** shown while the one initial request is pending.
2. **Available:** shown after a valid HTTP `200` healthy response.
3. **Unavailable:** shown after `503`, another HTTP failure, a network/proxy failure, or an invalid response shape.

Rules:

- The page performs one health request when loaded.
- It does not poll, automatically retry, or present a manual retry control. A user may refresh the page to check again.
- It uses plain, non-technical language and does not display raw errors or infrastructure details.
- The states are conveyed with text rather than color alone and meet baseline keyboard, semantic HTML, focus, and contrast expectations.
- The layout remains understandable on current mobile and desktop viewport sizes.

## REST Error Contract

All API errors introduced in Phase 0 use this envelope:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe human-readable message",
    "details": {}
  }
}
```

Rules:

1. `code` is stable and suitable for programmatic handling.
2. `message` is safe to show to a user and must not contain sensitive internals.
3. `details` is omitted unless its content is both safe and useful to the caller.
4. Expected validation failures may include field-oriented details when doing so does not disclose internals.
5. Unknown routes and unexpected errors use this same envelope.
6. Unexpected internal errors return a generic message. Stack traces, database/provider errors, file paths, configuration contents, and secret values remain in controlled server-side diagnostics only.
7. Phase 0 defines only the common envelope and the few codes needed by its own behavior. Later feature specifications add feature-specific codes.

## Diagnostics

- Server diagnostics are structured and distinguish startup/configuration failures, request outcomes, database connection state changes, and unexpected errors.
- Request diagnostics include only operationally useful fields such as timestamp, severity, method, route/path, status, duration, and stable error code where available.
- Secrets, cookies, authorization values, connection strings, request/response bodies, stack traces in production-facing responses, and unnecessary personal data are never logged.
- Development diagnostics may include an internal stack trace server-side, but production behavior must remain safe.
- Phase 0 does not require an external telemetry platform, durable log store, dashboard, or alerting system.

## Roles and Permissions

Phase 0 introduces no accounts, memberships, roles, or tenant data.

| Capability | Anonymous visitor | Future authenticated user |
| --- | --- | --- |
| View the system-status page | Allowed | Allowed |
| Call the health endpoint | Allowed | Allowed |
| View configuration, credentials, raw errors, or internal diagnostics | Denied | Denied |
| Mutate application or database state | Not provided | Not provided |

Public health access is not precedent for later domain endpoints. Slice 1.1 must introduce and enforce contextual authorization for private product data.

## Validation Rules

- Server configuration is validated with Zod before use.
- API inputs introduced now or later pass through an explicit validation boundary; Phase 0 must provide a reusable convention without predicting all future schemas.
- The frontend validates the health response before treating the service as available.
- An HTTP `200` response with a malformed or unexpected body is shown as unavailable, not healthy.
- Only the explicit connected Mongoose state produces the healthy response.
- Unsupported API routes return a safe `404` error envelope.
- Malformed API requests and unexpected server failures return safe error envelopes with suitable `4xx` or `5xx` status codes.

## Documentation and Specification Workflow

The README briefly documents this lifecycle:

> Interview and decisions → specification → approval → feature branch → implementation → automated tests → acceptance validation → completion

The README links to `specs/_template/` rather than duplicating template guidance. The template contains lightweight headings and prompts for:

- Scope, decisions, business rules, roles/permissions, states, validation, and acceptance criteria in `requirements.md`.
- Numbered implementation task groups in `plan.md`.
- Risk-based automated and manual evidence plus merge gates in `validation.md`.

The template must guide consistent thinking without prescribing unnecessary sections or implementation details for every feature.

## Acceptance Criteria

1. Given a clean checkout with the pinned Node.js version and documented prerequisites, a developer can install each application's dependencies using its own npm commands.
2. Given valid backend configuration containing an Atlas URI, the backend and frontend start independently using their documented development commands.
3. Given a connected Atlas database, loading the frontend status page results in a same-origin browser request through `/api` and displays an available state after the Express health endpoint returns `200`.
4. Given Express is running while MongoDB is disconnected, the health endpoint returns `503` with `SERVICE_UNAVAILABLE`, the approved generic message and database detail, and the frontend displays an unavailable state.
5. Given a proxy/network failure or malformed success payload, the frontend displays the same safe unavailable state without raw technical details.
6. The status page makes only the initial health request and contains no automatic retry, polling behavior, or retry button.
7. Given missing or syntactically invalid required configuration, the affected server process exits non-zero with a useful server-side diagnostic that does not reveal secrets.
8. API not-found, validation, availability, and unexpected error responses use the standard REST error envelope; `details` appears only when safe and useful.
9. Frontend browser output and public API responses contain no Atlas URI, upstream backend origin, stack trace, raw driver error, or other sensitive internal data.
10. Backend integration tests run against an isolated ephemeral MongoDB instance and require no Atlas credentials or external database access.
11. Practical automated tests prove the Phase 0 health, failure, configuration, error-boundary, and status-page behaviors described in `validation.md`.
12. Both application directories provide working type-check, lint, test, and production-build scripts.
13. GitHub Actions runs the required checks for both applications on pushes and pull requests without Atlas credentials or live provider services.
14. A production build does not attempt to connect to MongoDB or depend on a running external service.
15. The README documents independent local startup, environment setup, verification commands, and the concise spec-driven lifecycle, and links to the minimal three-file template.
16. The repository contains no committed secret, generated build output, test database artifact, or local environment file.
17. No authentication, domain workflow, product shell, Playwright suite, live deployment configuration, or unrelated infrastructure is introduced.

