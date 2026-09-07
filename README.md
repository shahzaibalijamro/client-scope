# ClientScope

ClientScope is a spec-driven application for keeping client scope, reviews, decisions, and delivery history clear. The current vertical slice implements global accounts, verification and recovery, workspaces, clients, projects, contextual access, invitations, and the unified `Your work` experience.

## Prerequisites

- Node.js 24.20.0 (the active LTS release pinned in `.nvmrc` and `.node-version`)
- npm 11.19.0 as bundled with Node.js 24.20.0
- MongoDB 8-compatible local replica set or a developer-owned MongoDB Atlas database for normal local development

The frontend and backend are independent applications. Their package commands run from their own directories, normally in separate terminals. There is intentionally no root npm workspace or combined package script; the pending Compose path is infrastructure orchestration and does not replace those application boundaries.

Phase 0 has been reopened by an approved delivery amendment. Its pending implementation adds production-oriented Dockerfiles, app-only Compose orchestration, container verification in CI, and CI-gated Vercel and Northflank production delivery without changing the applications' independent package boundaries.

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

Install Chromium once, then run the three isolated Slice 1.1 browser journeys from `frontend/`:

```text
npx playwright install chromium
npm run test:e2e
```

To run one focused journey while developing:

```text
npm run test:e2e -- --grep "service assignment"
```

Playwright starts a disposable MongoDB replica set plus local backend and frontend servers on ports 4101 and 4200. It enables a non-production-only email inspection route so verification and invitation links are deterministic; that route is absent unless `NODE_ENV` is non-production and `E2E_TEST_MODE=1`. No Atlas database, Gmail mailbox, committed account credential, or reusable token is used.

## Safe failure checks

- If a required environment field is missing or malformed, the affected server command exits with a field-oriented configuration diagnostic. Secret values are not echoed.
- If Atlas is temporarily unreachable after valid configuration is loaded, Express remains available and `/api/v1/health` returns a safe `503` response. Restore connectivity and refresh the page to observe recovery.
- If the frontend cannot reach Express, receives another HTTP failure, or receives malformed success data, it shows the same non-technical unavailable state. There is no automatic or manual retry; refresh the page to check again.
- Builds do not contact Atlas. The frontend build still needs a syntactically valid `BACKEND_API_ORIGIN`; the local environment example or the safe CI placeholder supplies it.

## Container and production delivery contract

The approved Phase 0 amendment defines the following implementation target; these capabilities remain pending until its validation evidence is recorded:

- A root Compose configuration runs the frontend and backend images together. It receives an external `MONGODB_URI` and does not create a MongoDB container.
- Pull requests and pushes to `main` run the complete GitHub `CI gate`: both applications' lint, typecheck, tests, and production builds; the critical Playwright journeys; both Docker builds; and a backend-image smoke test.
- Pull requests do not publish or deploy images. A successful `main` run publishes only the private backend image at `ghcr.io/<owner>/clientscope-backend:<full-github.sha>`; no moving tag or frontend production image is published.
- Northflank deploys that exact GHCR artifact and does not rebuild from the repository. Deployment automation verifies the image tag, readiness, and public health endpoint while preserving the current healthy release if the candidate fails.
- Vercel continues to build `frontend/` natively. Its production candidate is promoted only after the complete GitHub `CI gate` passes, and it never uses the frontend Dockerfile.

## Specification workflow

Feature work follows this lifecycle:

> Interview and decisions → specification → approval → feature branch → implementation → automated tests → acceptance validation → completion

Start future feature documents from the lightweight [`specs/_template/`](specs/_template/) prompts. Product behavior must be approved before implementation, and material ambiguities return to the specification.

The focused Playwright journeys run locally and in CI. Live Gmail SMTP and production-like browser-cookie inspection require an approved acceptance environment. Initial live Vercel and Northflank delivery now belongs to the reopened Phase 0 amendment; Phase 3 retains final deployment hardening, demo readiness, and portfolio presentation.
