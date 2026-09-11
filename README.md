# ClientScope

ClientScope is a spec-driven application for keeping client scope, reviews, decisions, and delivery history clear. The current vertical slices implement global accounts, verification and recovery, workspaces, clients, projects, contextual access, invitations, requirements agreement, formal change control, and shared client-facing delivery milestones with immutable status history and terminal archives.

## Prerequisites

- Node.js 24.20.0 (the active LTS release pinned in `.nvmrc` and `.node-version`)
- npm 11.19.0 as bundled with Node.js 24.20.0
- MongoDB 8-compatible local replica set or a developer-owned MongoDB Atlas database for normal local development
- Docker Engine and Docker Compose v2 for the container and local-infrastructure path

The frontend and backend are independent applications. Their package commands run from their own directories, normally in separate terminals. There is intentionally no root npm workspace or combined package script. Compose is infrastructure orchestration and does not replace those application boundaries.

## First-time setup

Install each application from a clean checkout using its lockfile:

```text
cd backend
npm ci

cd ../frontend
npm ci
```

Create ignored local environment files from the tracked examples:

```text
backend/.env.example  -> backend/.env
frontend/.env.example -> frontend/.env.local
```

Replace the safe placeholders in `backend/.env`, especially `MONGODB_URI` and `SESSION_SECRET`. Keep them server-side and never commit them. `BACKEND_API_ORIGIN` is also server-only; it must never use the `NEXT_PUBLIC_` prefix. For live email, set `EMAIL_DELIVERY_MODE=gmail`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD` to a Gmail address and its Google App Password; never supply the account's normal password. Automated tests use a fake email provider, so Gmail credentials are not required for tests or builds.

## Run locally

In the backend terminal:

```text
cd backend
npm run dev
```

In the frontend terminal:

```text
cd frontend
npm run dev
```

Open `http://localhost:3000` to create or sign in to an account. Next.js proxies all browser `/api` traffic to Express, which remains the sole authentication, authorization, and business-logic boundary. The public service status remains available at `http://localhost:3000/health`.

```json
{
  "status": "ok",
  "database": "connected"
}
```

The health check is read-only. With `EMAIL_DELIVERY_MODE=local`, account emails remain in the in-memory development provider. Use the isolated Playwright environment below to exercise their links deterministically, or configure Gmail for a manual browser run. Never enable the test-email route on a shared or production server.

## Verification commands

Run these commands separately from both `frontend/` and `backend/`:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Backend integration tests use an isolated, ephemeral in-memory MongoDB instance. They do not read Atlas credentials or contact an external database. Normal development and future deployed environments use MongoDB Atlas. A production build validates code and configuration shape only; it does not connect to MongoDB or require either service to be running.

Install Chromium once, then run the isolated access, requirements-agreement, formal-change, and milestone journeys from `frontend/`:

```text
npx playwright install chromium
npm run test:e2e
```

To run one focused journey while developing:

```text
npm run test:e2e -- --grep "service assignment"
```

The Slice 1.2 API is served under `/api/v1/projects/:projectId/scope`. Draft mutations require the current opaque revision token. Submission, comments, decisions, and withdrawal are transactional; submitted versions and comments have no edit or delete endpoints. Email is attempted only after authoritative state commits, so the project view and `Your work` indicators remain the source of truth when delivery fails.

The Slice 1.4 API is served under `/api/v1/projects/:projectId/milestones`. Providers receive an opaque timeline revision for create, edit, status, complete-order, and archive mutations; clients receive the same shared progress and archive content without a mutation token. Overdue state is derived by Express from one UTC date per response. Milestone changes and their activity records commit transactionally, and milestone operations do not send email.

Playwright starts a disposable MongoDB replica set plus local backend and frontend servers on ports 4101 and 4200. It enables a non-production-only email inspection route so verification and invitation links are deterministic; that route is absent unless `NODE_ENV` is non-production and `E2E_TEST_MODE=1`. No Atlas database, Gmail mailbox, committed account credential, or reusable token is used.

## Safe failure checks

- If a required environment field is missing or malformed, the affected server command exits with a field-oriented configuration diagnostic. Secret values are not echoed.
- If Atlas is temporarily unreachable after valid configuration is loaded, Express remains available and `/api/v1/health` returns a safe `503` response. Restore connectivity and refresh the page to observe recovery.
- If the frontend cannot reach Express, receives another HTTP failure, or receives malformed success data, it shows the same non-technical unavailable state. There is no automatic or manual retry; refresh the page to check again.
- Builds do not contact Atlas. The frontend build still needs a syntactically valid `BACKEND_API_ORIGIN`; the local environment example or the safe CI placeholder supplies it.

## Run the production images locally

Copy `compose.env.example` to the ignored `compose.env` file and replace its placeholders. `MONGODB_URI` must reach an external MongoDB instance from Docker; Compose intentionally does not create a database container.

Build either image independently from the repository root:

```text
docker build --tag clientscope-backend:local ./backend
docker build --build-arg BACKEND_API_ORIGIN=http://backend:4000 --tag clientscope-frontend:local ./frontend
```

Or build and run both applications together:

```text
docker compose --env-file compose.env up --build --wait
docker compose --env-file compose.env logs --follow
docker compose --env-file compose.env down
```

Open `http://localhost:3000`. The browser continues to use same-origin `/api` paths, while the containerized Next.js server routes them to `http://backend:4000` on the internal Compose network. Only the frontend port is published to the host. To inspect a failed startup, omit `--wait`, run the logs command, and correct the external configuration without putting credentials in tracked files or image build arguments.

The application-local Dockerfiles are deterministic multi-stage builds based on Node.js 24.20.0. Both runtime images run without root privileges. The frontend image is a portability/local-infrastructure artifact; Vercel does not use it.

## Production delivery configuration

The GitHub workflow reports a stable `CI gate` for pull requests and pushes to `main`. Protect `main` with a repository ruleset that requires a pull request and that exact check. Pull requests have read-only repository permissions and cannot publish or deploy.

After a successful `main` gate, the workflow publishes only `ghcr.io/<owner>/clientscope-backend:<full-commit-sha>` to GHCR, then deploys that exact artifact. Keep the package private and grant Northflank's saved registry credential read access. Configure these GitHub values:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `GHCR_PUBLISH_TOKEN` | Classic GitHub PAT owned by the package owner, limited to `write:packages` and `read:packages` |
| Secret | `NORTHFLANK_API_KEY` | Least-privilege Northflank service deployment/read token |
| Variable | `NORTHFLANK_PROJECT_ID` | Existing Northflank project ID |
| Variable | `NORTHFLANK_SERVICE_ID` | Existing deployment-service ID |
| Variable | `NORTHFLANK_REGISTRY_CREDENTIALS_ID` | Saved private-GHCR credential ID |
| Variable | `BACKEND_PUBLIC_URL` | Public backend origin, without the health path |

The dedicated GHCR publishing token prevents the package from inheriting the visibility of a public source repository. Do not grant it `repo` or `delete:packages`; store it only as an Actions secret and rotate it before expiration. The workflow verifies that GitHub reports the package as private before allowing deployment.

The Northflank target must be a deployment service, not a combined/build service. Northflank requires an initial image when a deployment service is created in its current UI. For this one-time bootstrap, select **External image** and use `docker.io/library/node:24.20.0-bookworm-slim` without a registry integration. The placeholder is only used to create the service and is not a production release; it may remain unready because it does not serve the backend health endpoint. The first eligible GitHub deployment replaces it with the exact private GHCR image. Do not link a repository or build service, and leave provider CI/CD disabled. Configure an HTTP readiness probe for port `4000` and `/api/v1/health`; after the first healthy backend release, Northflank keeps that version serving until each subsequent candidate is ready. Before deployment the workflow requires a deployment service with no linked internal build and the readiness control, and after deployment it requires the expected registry credential, exact image, completed rollout, and public health body. It also cancels an older in-progress deployment job when a newer eligible commit arrives.

Connect Vercel directly to this repository with `frontend/` as the project root and `main` as the production branch. Configure the stable GitHub `CI gate` as the project's required deployment check so Vercel can build a candidate natively but cannot assign it to the production domain until the full gate succeeds. Do not configure a frontend container registry or Docker deployment.

Provider credentials, GHCR privacy and pull access, the GitHub ruleset, Northflank rollout behavior, and the Vercel deployment check are external settings. Phase 0 was completed on 2026-09-08 after the hosted gate, private immutable backend publication, exact-image Northflank deployment, public health check, and CI-gated Vercel promotion were validated. The approved completion amendment does not require a live Compose startup, an intentionally unhealthy production deployment, or overlapping production deployments.

## Specification workflow

Feature work follows this lifecycle:

> Interview and decisions → specification → approval → feature branch → implementation → automated tests → acceptance validation → completion

Start future feature documents from the lightweight [`specs/_template/`](specs/_template/) prompts. Product behavior must be approved before implementation, and material ambiguities return to the specification.

The focused Playwright journeys run locally and in CI. Live Gmail SMTP and production-like browser-cookie inspection require an approved acceptance environment. Initial live Vercel and Northflank delivery now belongs to the reopened Phase 0 amendment; Phase 3 retains final deployment hardening, demo readiness, and portfolio presentation.
