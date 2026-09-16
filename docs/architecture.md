# ClientScope Architecture

## System boundary

ClientScope is a TypeScript modular monolith with independent Next.js and Express applications. Browsers call only same-origin `/api` paths; Next.js proxies those requests to Express, which owns validation, authentication, authorization, business transitions, and public response projection. MongoDB is authoritative. There is no shared application package, background queue, Redis dependency, or client-side authorization boundary.

```text
Visitor browser
    │ secure same-origin cookie + CSRF
    ▼
Next.js App Router ── /api proxy ──► Express REST API
                                         │
                  contextual role checks ├── MongoDB Atlas state/history
                                         ├── Cloudinary authenticated assets
                                         ├── Gmail SMTP transactional email
                                         └── Gemini structured advisory output
```

## Identity, tenancy, and history

A user is global, while authority comes from the active workspace or project membership. Workspace owners see their tenant; service-team members and clients see only explicitly assigned projects. Express performs those checks for every protected operation and returns not-found responses where enumeration would cross a tenant boundary.

Mutable drafts use opaque revision tokens and transactional compare-and-set updates. Review submissions, decisions, comments, deliverable versions, completion rounds, and archive events are separate historical records. Later activity creates a successor or terminal outcome instead of rewriting an approved fact. The history is a strong product trace, not cryptographic immutability or legal evidence.

## External providers

Cloudinary stores private attachment bytes; MongoDB stores safe metadata and encoded provider identity. Upload authorization is short-lived, finalization verifies the signed provider result and exact byte/type claim, and every download receives a new short-lived authenticated URL. Public portfolio media uses a separate folder and never participates in private attachment or demo-reset cleanup.

Gmail SMTP and Gemini sit behind small service interfaces so tests use deterministic implementations. Email never becomes the source of truth. Gemini receives bounded minimum context and can create only private proposals or advisory output; a human must explicitly apply content, and no AI action can approve scope or delivery.

## Demo and reset trust boundary

`DEMO_MODE_ENABLED` is false by default. Valid demo configuration names one immutable marked workspace, two dedicated identities, isolated asset storage, quotas, and a reset secret. The shared entry coexists with ordinary signup and private workspaces; demo reset, quota, and protection decisions are scoped to the marked tenant and canonical identities. Invalid enabled configuration fails closed: the ordinary app starts, but no credentials, seed, reset behavior, or demo restrictions are exposed.

The reset endpoint accepts only a constant-time-checked bearer secret and no tenant parameter. A MongoDB lease provides single flight. The service prepares deterministic data, verifies the immutable tenant marker, and replaces tenant-owned collections plus the generation counter in one transaction. Existing user and session records sit outside that transaction. Authenticated demo responses carry the generation so clients invalidate cached data after cutover. Asset cleanup occurs afterward and is retryable; deletion candidates remain bound to the configured demo folder.

External demo actions reserve atomic MongoDB quota in per-user rolling-hour and deployment UTC-day ledgers before dispatch or upload authorization. Failed validation and authorization consume nothing; an ambiguous provider failure is not refunded.

## Delivery

Pull requests and `main` run frontend/backend types, lint, tests, production builds, critical Playwright journeys, both Docker builds, and backend-container health smoke verification. The stable CI gate authorizes delivery. A successful `main` run publishes the already-validated backend image privately to GHCR under the full commit SHA, then directs Northflank to deploy that exact image. Vercel builds Next.js natively and withholds production promotion until the same gate passes.

## Portfolio-scale tradeoffs

The system is designed for a small-team portfolio/demo workload. Scheduled reset runs synchronously within a bounded GitHub Actions job, quota ledgers favor clear correctness over high-volume optimization, and managed-service free-tier availability is acceptable. The design does not claim enterprise availability, formal compliance, multi-region operation, legal-evidence retention, or general-purpose file hosting.
