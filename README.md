# ClientScope

ClientScope is a spec-driven application for keeping client scope, reviews, decisions, and delivery history clear. This repository currently contains the Phase 0 delivery foundation: a minimal Next.js status page, an Express health API, and a MongoDB connectivity check.

## Prerequisites

- Node.js 24.20.0 (the active LTS release pinned in `.nvmrc` and `.node-version`)
- npm 11.19.0 as bundled with Node.js 24.20.0
- A developer-owned MongoDB Atlas database for normal local development

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

Replace the `MONGODB_URI` placeholders in `backend/.env` with a valid Atlas connection string. Keep that URI server-side and never commit it. `BACKEND_API_ORIGIN` is also server-only; it must never use the `NEXT_PUBLIC_` prefix.

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

Open `http://localhost:3000`. The page first says it is checking, then reports whether ClientScope is available. The browser requests only the same-origin `/api/v1/health` path; Next.js proxies that request to Express. A healthy API response is:

```json
{
  "status": "ok",
  "database": "connected"
}
```

The health check is read-only. It does not create application data.

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

Playwright begins with Slice 1.1, when the first meaningful user journey exists. Live Vercel and Koyeb deployment is deferred until Phase 3.
