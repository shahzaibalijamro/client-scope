# ClientScope

ClientScope is a spec-driven application for keeping client scope, reviews, decisions, and delivery history clear. The current vertical slice implements global accounts, verification and recovery, workspaces, clients, projects, contextual access, invitations, and the unified `Your work` experience.

## Prerequisites

- Node.js 24.20.0 (the active LTS release pinned in `.nvmrc` and `.node-version`)
- npm 11.19.0 as bundled with Node.js 24.20.0
- MongoDB 8-compatible local replica set or a developer-owned MongoDB Atlas database for normal local development

The frontend and backend are independent applications. Run their commands from their own directories and start them in separate terminals. There is intentionally no root workspace or combined launcher.

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

Replace the safe placeholders in `backend/.env`, especially `MONGODB_URI` and `SESSION_SECRET`. Keep them server-side and never commit them. `BACKEND_API_ORIGIN` is also server-only; it must never use the `NEXT_PUBLIC_` prefix. For live email, set `GMAIL_USER` and `GMAIL_APP_PASSWORD` to a Gmail address and its Google App Password; never supply the account's normal password. Automated tests use a fake email provider, so Gmail credentials are not required for tests or builds.

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

The health check is read-only. Account emails are captured by the deterministic local provider unless Gmail SMTP credentials are configured.

## Verification commands

Run these commands separately from both `frontend/` and `backend/`:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Backend integration tests use an isolated, ephemeral in-memory MongoDB instance. They do not read Atlas credentials or contact an external database. Normal development and future deployed environments use MongoDB Atlas. A production build validates code and configuration shape only; it does not connect to MongoDB or require either service to be running.

## Safe failure checks

- If a required environment field is missing or malformed, the affected server command exits with a field-oriented configuration diagnostic. Secret values are not echoed.
- If Atlas is temporarily unreachable after valid configuration is loaded, Express remains available and `/api/v1/health` returns a safe `503` response. Restore connectivity and refresh the page to observe recovery.
- If the frontend cannot reach Express, receives another HTTP failure, or receives malformed success data, it shows the same non-technical unavailable state. There is no automatic or manual retry; refresh the page to check again.
- Builds do not contact Atlas. The frontend build still needs a syntactically valid `BACKEND_API_ORIGIN`; the local environment example or the safe CI placeholder supplies it.

## Specification workflow

Feature work follows this lifecycle:

> Interview and decisions → specification → approval → feature branch → implementation → automated tests → acceptance validation → completion

Start future feature documents from the lightweight [`specs/_template/`](specs/_template/) prompts. Product behavior must be approved before implementation, and material ambiguities return to the specification.

The focused Playwright journeys and live Gmail SMTP/browser-cookie inspection require the documented isolated acceptance environment. Live Vercel and Koyeb deployment remains deferred until Phase 3.
