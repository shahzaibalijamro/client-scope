# Phase 0: Repository and Delivery Foundation Plan

This plan implements the approved behavior in `requirements.md`. Task groups are ordered; each group should leave the repository in a coherent state. Any newly discovered product ambiguity must return to the specification for approval before implementation continues.

## 1. Establish repository and toolchain boundaries

1. Confirm the repository uses `main` as its primary branch and perform implementation on the Phase 0 feature branch.
2. Add a root `.gitignore` that excludes dependencies, environment files, build/test output, logs, and common local artifacts while retaining environment examples.
3. Select the active Node.js LTS release at implementation time and pin it in repository version metadata, both application engine declarations, and CI.
4. Record the expected npm version or package-manager behavior needed for reproducible lockfiles.
5. Preserve `frontend/`, `backend/`, and `specs/` as independent top-level boundaries; do not add workspaces, a shared package, or root application orchestration.

## 2. Scaffold the independent frontend application

1. Create the Next.js App Router application with TypeScript, React, and Tailwind CSS.
2. Add the constitution-selected frontend dependencies: TanStack Query, React Hook Form, and Zod, without creating placeholder product behavior.
3. Configure strict, maintainable TypeScript and application-local scripts for development, type checking, linting, tests, and production builds.
4. Add the minimal providers needed for TanStack Query and ensure health requests have polling and automatic retries disabled.
5. Keep the application free of a product shell, navigation, authentication assumptions, and component-library commitments.

## 3. Scaffold the independent backend application

1. Create the Express TypeScript application with clear boundaries for configuration, HTTP/app setup, server lifecycle, database connectivity, validation, and errors.
2. Add Mongoose and Zod and configure application-local development, type-check, lint, test, and build scripts.
3. Validate required configuration once at startup, distinguish configuration failures from runtime service unavailability, and ensure imports/builds do not open database connections.
4. Add MongoDB connection-state handling that permits Express to report `503` during temporary outages and permits recovery when connectivity returns.
5. Add bounded graceful shutdown for the HTTP server and MongoDB connection.
6. Implement centralized unknown-route and unexpected-error handling using the approved REST envelope.
7. Add minimal structured server diagnostics with explicit secret and sensitive-data exclusions.

## 4. Implement the health boundary

1. Add the read-only `GET /api/v1/health` backend route.
2. Return the approved `200` healthy representation only when Mongoose is connected.
3. Return the approved `503 SERVICE_UNAVAILABLE` error envelope when MongoDB is not connected.
4. Ensure both responses expose only the documented public fields and never raw provider or driver data.
5. Add the server-side Next.js `/api` proxy configuration so browser requests use a same-origin URL and the upstream Express origin remains private to frontend server configuration.

## 5. Implement the minimal status page

1. Build the root responsive page with checking, available, and unavailable states.
2. Fetch the proxied health endpoint once through TanStack Query with retry, polling, and focus-triggered refetch behavior disabled for this status check.
3. Validate successful response data with Zod before showing the available state.
4. Treat HTTP failures, proxy/network failures, and invalid payloads as unavailable without displaying raw technical details.
5. Provide semantic, text-based state communication and baseline keyboard, focus, contrast, mobile, and desktop behavior.
6. Do not add a retry control, product navigation, application shell, or placeholder form.

## 6. Establish practical automated tests

1. Configure Vitest independently in frontend and backend.
2. Configure Supertest and a test-only ephemeral in-memory MongoDB lifecycle for backend integration tests.
3. Test valid and invalid configuration without using real credentials.
4. Test healthy, disconnected, not-found, and unexpected-error API behavior, including status codes and exact safe response boundaries.
5. Test the status page's checking, available, unavailable, network-failure, and malformed-response behavior with React Testing Library at the lowest useful layer.
6. Test or statically verify that the status request does not retry or poll and that no manual retry control exists.
7. Keep fixtures and helpers focused on repeated setup; do not add a generalized test framework or coverage threshold.
8. Do not add Playwright in Phase 0.

## 7. Add continuous integration

1. Create GitHub Actions workflows triggered for pushes and pull requests.
2. Use the same pinned Node.js release and deterministic npm installation for each independent application.
3. Run frontend and backend type checking, linting, tests, and production builds.
4. Ensure backend integration tests use ephemeral MongoDB and CI requires no Atlas, Cloudinary, Gmail SMTP, Gemini, or deployment credentials.
5. Confirm jobs fail visibly when any required check fails and avoid deployment steps.
6. Keep caching and job structure understandable and proportionate to a two-application repository.

## 8. Document setup and the specification workflow

1. Add safe frontend and backend environment example files with placeholders and explanatory comments where appropriate.
2. Write concise root README instructions for prerequisites, independent installation/startup, Atlas configuration, the status-path verification, tests, builds, and common safe failure cases.
3. Document that normal development and future deployed environments use Atlas while tests use ephemeral MongoDB.
4. Add lightweight `requirements.md`, `plan.md`, and `validation.md` templates under `specs/_template/`.
5. Link the README's concise specification lifecycle to the template without duplicating it.
6. State explicitly that live deployment is deferred to Phase 3 and Playwright begins with Slice 1.1.

## 9. Execute acceptance validation and prepare handoff

1. Run all automated checks listed in `validation.md` from the documented application directories.
2. Perform the full local frontend-to-proxy-to-Express-to-Atlas happy-path check using a developer-supplied Atlas URI.
3. Exercise the documented unavailable and configuration-failure cases without exposing credentials.
4. Inspect browser-visible output, logs, tracked files, and build artifacts for secret or internal-detail leakage.
5. Review the implementation against all acceptance criteria and the three constitution files.
6. Record validation evidence and any justified exceptions in `validation.md` before requesting merge approval.

## Approved 2026-09-08 Amendment — Containerized CI/CD

The task groups below implement the approved amendment in `requirements.md`. They supersede the original plan's prohibitions on root orchestration and deployment work while leaving the completed repository and product foundation intact.

## 10. Add production-oriented container artifacts

1. Add application-local Docker ignore rules and multi-stage Dockerfiles pinned to the repository's Node.js release and deterministic npm installs.
2. Build the backend into a minimal non-root runtime image that runs the compiled Express entrypoint and preserves graceful termination.
3. Configure Next.js standalone output and build a minimal non-root frontend runtime image suitable for local infrastructure.
4. Keep secrets and local environment files outside all build contexts, layers, labels, and generated image metadata.

## 11. Add app-only Compose orchestration

1. Add a root Compose configuration containing only `frontend` and `backend` services built from their application directories.
2. Route the frontend server-side proxy to the internal backend service while publishing the frontend for host-browser access.
3. Pass the external MongoDB URI and other runtime values through ignored environment configuration; do not add a MongoDB service or embed defaults suitable only for tests.
4. Document build, start, stop, log, configuration, and safe failure commands without introducing a root npm workspace or combined package script.

## 12. Make the GitHub gate container-aware

1. Limit required workflow triggers to pull requests and pushes to `main`, preserving deterministic installs and the existing frontend, backend, and browser checks.
2. Add Docker builds for both applications after the application checks succeed.
3. Start the backend image with safe configuration and ephemeral MongoDB, wait for readiness, and verify the exact public health contract before accepting the image.
4. Add a stable, always-reported `CI gate` result that fails unless every required job for the commit succeeds, and require it in the `main` branch ruleset.
5. Ensure pull-request runs cannot request package-write permission, authenticate to GHCR, access deployment secrets, publish artifacts, or invoke production providers.

## 13. Publish and deploy the backend artifact

1. On a successful `main` gate, tag the already validated backend image only as `ghcr.io/<owner>/clientscope-backend:<full-github.sha>` and push it to a private GHCR package using narrowly scoped workflow permission.
2. Configure the Northflank deployment service to pull from GHCR using stored registry credentials, with no linked build service or repository-triggered build/deployment rule.
3. Use a least-privilege Northflank API token from GitHub Actions to update the existing service to the exact SHA image.
4. After the update, verify the configured image tag, wait for rollout readiness, and call the public health endpoint; surface failures in the workflow.
5. Configure rollout behavior so an unhealthy candidate does not take traffic from the current healthy version.
6. Add newest-wins production concurrency so a superseded run cannot become the final deployed version.

## 14. Gate native Vercel promotion

1. Connect the Vercel project to the GitHub repository with `frontend/` as its root and `main` as its production branch.
2. Select the stable GitHub `CI gate` as a required Vercel Deployment Check while retaining automatic production-domain assignment after the check passes.
3. Confirm Vercel performs its own Next.js build and neither consumes nor publishes the frontend Docker image.
4. Confirm a failed gate leaves the previous deployment current and a successful gate promotes the candidate for the same commit.

## 15. Validate the amended foundation and close Phase 0

1. Exercise pull-request and `main` behavior, including controlled failures at every gate category and proof that pull requests cannot publish or deploy.
2. Record the immutable GHCR tag, matching Northflank service image, rollout result, public health result, and Vercel promotion result without recording credentials.
3. Exercise an unhealthy backend candidate and overlapping `main` runs to prove previous-release preservation and newest-wins behavior.
4. Run the documented Compose path against an external MongoDB and confirm same-origin browser-to-API behavior.
5. Review tracked files, image history/metadata, workflow logs, and provider configuration for secrets and bypass paths.
6. Update `validation.md` with evidence and return the roadmap status to Complete only after every amendment acceptance criterion passes.
