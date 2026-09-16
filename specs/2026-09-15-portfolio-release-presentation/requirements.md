# Portfolio Release and Presentation Requirements

**Status:** Approved — 2026-09-15; hybrid-entry amendment approved — 2026-09-16

## Outcome and scope

Slice 3.3 turns the complete ClientScope product into a safe, reliable, and understandable portfolio artifact for engineering hiring teams. A visitor can enter a realistic public demo as either side of the provider/client relationship without setup, while a visitor who wants to use ClientScope personally can create a verified account and private workspace on the same deployment. Both paths exercise the actual application and managed-service boundaries without allowing shared-demo reset or quota behavior to cross tenant boundaries.

The slice includes:

- Explicitly enabled public-demo behavior with two published demo identities and one isolated, deterministic demo workspace.
- Three coherent seeded projects demonstrating active work with pending decisions, a completed full-history lifecycle, and an archived record.
- Real Gmail SMTP, Gemini, and Cloudinary integration in demo mode, protected by configurable server-enforced quotas.
- A protected, repeatable six-hour reset that preserves demo identities and sessions while replacing demo workspace data and visitor-created demo assets.
- Final hardening and validation of the existing Vercel, Northflank, private GHCR, MongoDB Atlas, Cloudinary, Gmail, Gemini, and GitHub Actions delivery path.
- A hiring-team-oriented README, architecture overview, portfolio narrative, six screenshots, and a three-to-five-minute walkthrough.

The slice excludes:

- New client-project domain workflows, roles, approval policies, analytics, integrations, or billing.
- Fake adapters in the public acceptance environment; fakes remain appropriate for automated tests and local development.
- Demo accounts or data in ordinary production, preview, development, or self-hosted deployments unless demo mode is intentionally enabled.
- Storing portfolio image or video binaries in Git. Public portfolio media is hosted in a dedicated Cloudinary folder.
- Treating the demo as a general-purpose free service or preserving visitor changes beyond the next reset.
- Applying demo reset, quota, identity, or tenant protections to ordinary users or their private workspaces.

## Decisions and business rules

### Demo activation and public entry

1. Demo behavior is disabled by default and enabled only when `DEMO_MODE_ENABLED=true` in backend configuration. The frontend derives demo availability from `GET /api/v1/demo`, which returns a disabled response in ordinary mode and the intentionally public demo metadata in enabled mode; it does not infer demo mode or receive provider secrets through build-time public environment variables.
2. When enabled, the sign-in screen clearly publishes credentials for exactly two canonical identities: a Workspace Owner and a Client Approver. It labels the environment as a shared resettable demo and states that changes are temporary.
3. Demo credentials are supplied through server-only configuration and must not be committed. In enabled mode, the demo response may disclose only each intentionally public display label, email address, and password plus the reset cadence and next scheduled reset. It must never return reset credentials, provider secrets, internal identifiers, or quota-counter details. The public passwords are demo-only credentials, must be unique to that deployment, and are never valid outside it. In disabled mode the response contains no identity or credential fields, and ordinary frontend bundles contain no demo credential.
4. Demo mode must fail closed. Missing, inconsistent, or unsafe demo configuration prevents demo initialization and leaves the ordinary application operational without exposing credentials or partial demo state.
5. The canonical identities are global users dedicated to the demo deployment. Their stable user IDs and sessions survive workspace resets.
6. The configuration contract uses `DEMO_MODE_ENABLED`, `DEMO_TENANT_ID`, `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`, `DEMO_APPROVER_EMAIL`, `DEMO_APPROVER_PASSWORD`, `DEMO_RESET_SECRET`, `DEMO_CLOUDINARY_FOLDER`, `DEMO_EMAILS_PER_USER_HOUR`, `DEMO_AI_REQUESTS_PER_USER_HOUR`, `DEMO_UPLOAD_MIB_PER_USER_HOUR`, `DEMO_EMAILS_PER_DAY`, `DEMO_AI_REQUESTS_PER_DAY`, and `DEMO_UPLOAD_MIB_PER_DAY`. Existing Gmail, Gemini, and Cloudinary provider variables remain unchanged. Exact deployment URLs and public portfolio asset URLs belong in deployment settings and the media manifest rather than backend secrets.
7. Valid demo mode is a hybrid public entry, not an exclusive demo-only deployment. The sign-in screen retains ordinary signup and password-recovery entry points alongside the shared identities. Newly verified ordinary users may create and retain private workspaces under the existing authorization and provider rules.

### Canonical demo story

1. The seeded workspace uses synthetic people, organizations, projects, email addresses, files, and comments. It contains no copied client data, developer credentials, signed asset URLs, or private operational diagnostics.
2. The Workspace Owner is the canonical owner and the Client Approver is assigned to all three projects. No additional published identity is required.
3. The active project demonstrates requirements, agreed scope, an accepted change request, milestones in different progress states, at least two deliverable versions, accumulated feedback, and a current decision requiring one of the demo identities.
4. The completed project demonstrates the full lifecycle from agreement through change control, revisions, deliverable approval, final completion, and chronological significant history.
5. The archived project demonstrates protected completed content, archival state, historical visibility, and export availability without requiring a visitor to alter it.
6. Seed timestamps and deadlines remain believable after every reset. Relative dates are derived from the reset time while record relationships, ordering, decisions, and narrative remain deterministic.
7. Seeding is idempotent: rerunning it cannot create duplicate canonical users, workspaces, projects, memberships, history entries, or assets.

### Real-provider use and quotas

1. Demo visitors may send actual invitation email through Gmail SMTP, request actual Gemini assistance, and upload actual supported files to Cloudinary. Existing provider validation, privacy minimization, attachment restrictions, and recoverable failure semantics remain authoritative.
2. Per canonical demo identity, a rolling 60-minute window permits at most 3 invitation emails, 10 Gemini requests, and 20 MiB of accepted upload bytes.
3. Across the demo deployment, each UTC calendar day permits at most 30 invitation emails, 100 Gemini requests, and 250 MiB of accepted upload bytes.
4. Each limit is server-configurable with the approved values as defaults when demo mode is enabled. Configuration must reject negative, zero, malformed, or internally inconsistent values. Ordinary mode does not apply demo quotas.
5. Quotas are enforced atomically in MongoDB so concurrent API instances or requests cannot overspend a limit. Per-identity and deployment-wide limits are checked before an external call or upload authorization is issued.
6. A successful provider dispatch or upload authorization consumes quota. Validation and authorization failures do not. A provider failure after dispatch does not automatically refund quota because delivery or processing may have occurred. Upload byte quota is reserved from the validated requested size and cannot be bypassed by declaring a smaller file than is finalized; existing finalization validation rejects mismatches.
7. Limit responses use a stable safe error code, identify the capability that is temporarily limited, include an appropriate retry time, and do not expose provider account state or other visitors' usage.
8. Manual adjustment of configured ceilings is operationally permitted. A new quota dashboard, billing system, or automatic purchasing is out of scope.

### Demo identity and tenant protections

1. Demo visitors cannot change either canonical identity's email address or password, delete either identity, transfer canonical workspace ownership, remove the Owner from the workspace, or remove the Approver's canonical project memberships.
2. The backend enforces these invariants regardless of hidden controls, direct requests, stale UI state, role, or current project state. Attempts return a stable demo-protection error without partial mutation or history corruption.
3. Other existing workspace, invitation, assignment, project, workflow, export, and profile capabilities remain available when authorized, subject to normal rules and demo quotas.
4. Demo-specific rules apply only to records explicitly marked as belonging to the configured demo tenant. They must never weaken or alter authorization for another workspace.
5. Canonical demo identities cannot create additional workspaces. Ordinary authenticated users may create workspaces normally; those workspaces are never seeded, reset, quota-limited, or protected merely because demo mode is enabled.

### Reset lifecycle

1. GitHub Actions invokes the reset every six hours using a schedule and an on-demand workflow dispatch. It calls `POST /api/v1/internal/demo/reset` over HTTPS with a dedicated server-side bearer secret. The operation exists only when demo mode is enabled, uses constant-time secret comparison, rejects missing/invalid credentials without revealing demo state, and is never callable through a user session.
2. Reset is single-flight. An atomic lease prevents overlapping scheduled, manual, or retried resets. A repeated invocation after successful completion is safe and produces the same canonical state.
3. Reset transitions through idle, preparing, replacing, cleaning-assets, completed, and failed states. While a reset holds the lease, demo-tenant mutations fail with HTTP 503 and code `DEMO_RESET_IN_PROGRESS`, a bounded `Retry-After`, and a user-facing refresh instruction. Read behavior may continue from the last coherent state until replacement begins; it must never expose a partial canonical dataset.
4. Workspace replacement is staged and committed as one logical cutover. The canonical users and their sessions are not deleted or revoked. Existing browser sessions remain authenticated and receive a clear stale/reset notice on their next demo request; clients invalidate demo queries and refresh canonical data.
5. Visitor-created and superseded demo Cloudinary assets use an isolated, deployment-specific demo folder/tag. After database cutover, reset deletes assets no longer referenced by the canonical seed. Failure to clean an asset does not roll back coherent database state; it records a safe retryable cleanup failure and the next reset retries it.
6. Reset must target the configured demo tenant by immutable identifier, verify that identifier before destructive work, and refuse to operate on an absent, ambiguous, non-demo, or production-owned tenant. It cannot delete or rewrite data or assets outside that tenant/folder.
7. Reset results and scheduled-workflow logs include time, source commit, reset run ID, stage, duration, counts, and success/failure without credentials, invitation recipients, prompts, file URLs, signed URLs, or private record contents.

### Portfolio documentation and media

1. The repository README explains the product problem, target users, feature story, demo access, temporary-data warning, key technologies, local setup, environment groups, test commands, deployment path, architecture summary, and links to the live application, detailed architecture document, screenshots, and walkthrough.
2. The architecture document covers the Next.js-to-Express boundary, contextual authorization, MongoDB state/history, Cloudinary private attachments versus public portfolio media, Gmail and Gemini service boundaries, demo/reset trust boundary, CI/CD path, key tradeoffs, and known portfolio-scale limitations. The README includes a concise diagram and links to this document.
3. A concise portfolio narrative explains the problem, decisions, engineering challenges, security/history guarantees, testing strategy, delivery approach, and learnings for an engineering hiring audience. It makes no unsupported scale, compliance, availability, or legal-evidence claims.
4. Six curated screenshots cover My Work, project Overview, agreed Scope, formal Changes, Deliverable review, and Activity/history. The set includes representative desktop and mobile presentation. Each asset has meaningful alt text and uses canonical synthetic demo data.
5. The walkthrough is three to five minutes and follows the provider/client story: enter as Owner, inspect agreement and change control, show revision/delivery context, switch to Approver, make or inspect a binding decision, and show preserved history. It briefly explains architecture and CI/deployment quality without exposing secrets or administrative consoles.
6. Screenshots and video are public assets under a dedicated Cloudinary portfolio folder separate from private application uploads and the resettable demo folder. The repository stores a versioned manifest of stable HTTPS URLs, media purpose, alt text, capture version/source commit, and dimensions/duration, plus the screenshot checklist and walkthrough script/shot list.
7. Broken, access-controlled, expiring, or transformation-only URLs do not satisfy the portfolio gate. Public media must load without a Cloudinary account or signed request.

### Roadmap and completion governance

1. Implementation first corrects Slice 3.2 to `Complete — validated 2026-09-15`, referencing the merged UI redesign evidence. This documentation correction does not retroactively change its approved scope.
2. Slice 3.3 remains without a completion status until every acceptance criterion and validation gate below passes and product-owner manual acceptance is recorded.
3. Completion evidence records the exact source commit and deployed backend image SHA. The roadmap is marked complete only after the live demo and public portfolio artifacts correspond to that validated revision.

## Roles and permissions

- **Public visitor:** may read demo availability and intentionally published credential guidance only; receives no project data without authentication.
- **Ordinary visitor:** may choose ordinary signup or password recovery while demo mode is enabled, then use a verified private account under the existing product rules.
- **Demo Workspace Owner:** has the existing Owner capabilities within the demo workspace except for canonical identity, ownership, and membership protections; external actions are quota-limited.
- **Demo Client Approver:** has existing participant and binding-approval capabilities on the three canonical projects, except for canonical identity and membership protections; external actions are quota-limited where applicable.
- **Ordinary authenticated user:** retains all existing contextual permissions. Demo-only visibility, quotas, protections, and reset behavior do not apply outside the marked demo tenant.
- **Reset automation:** may invoke only the authenticated demo reset operation. It receives no general administration authority and cannot name an arbitrary tenant or asset folder in its request.
- **Repository maintainer:** configures server-side demo credentials, quotas, reset secret, provider credentials, schedule, and public media URLs through deployment/GitHub settings without committing secrets.

## States

- **Demo deployment:** disabled, misconfigured/fail-closed, initializing, ready, resetting, or degraded-provider.
- **Demo data:** absent, canonical, visitor-modified, staged-replacement, or canonical-after-cutover.
- **Reset run:** idle, lease-acquired/preparing, replacing, cleaning-assets, completed, failed-retryable, or refused-safe.
- **Quota:** available, per-identity exhausted, daily deployment exhausted, or reset at its defined time boundary.
- **Canonical identity:** available and protected; its credentials and required memberships have no user-driven transition.
- **Portfolio artifact:** planned, captured, privacy-reviewed, published, verified, or rejected for recapture.

## Validation and failure behavior

1. Demo configuration is parsed and cross-validated at startup. Enabled mode requires both canonical identities, an immutable demo tenant ID, reset secret, quota values, reset cadence metadata, and isolated Cloudinary demo/public-media locations.
2. Demo email addresses are valid and distinct. Published credentials cannot match documented examples or repository defaults, and secrets never appear in logs, API diagnostics, build output, test snapshots, or committed artifacts.
3. Reset authentication, tenant targeting, lease acquisition, replacement, and cleanup fail safely and idempotently. A failed run leaves either the prior coherent dataset or the newly committed coherent dataset, never a mixed partial story.
4. Quota checks remain correct under concurrent requests, multiple backend instances, UTC day rollover, rolling-window expiry, retries, and provider failures.
5. Demo protection errors are distinguishable from authorization, validation, concurrency, quota, maintenance, and provider errors while remaining concise and non-enumerating.
6. Gmail, Gemini, Cloudinary, MongoDB Atlas, Vercel, Northflank, GHCR, and GitHub failures preserve in-app truth, prevent unsafe partial transitions, and provide actionable diagnostics without leaking secrets.
7. The scheduled reset workflow has bounded timeouts, concurrency control, least-privilege secrets, and visible failure status. It must not trigger application deployment or accept untrusted tenant parameters.
8. All public URLs use HTTPS. Link checks and manual clean-session checks verify the live app, architecture document, six screenshots, and video without relying on maintainer authentication.
9. Responsive, keyboard, focus, screen-reader, contrast, overflow, reduced-motion, long-content, and evergreen-browser requirements from prior slices remain release gates.
10. Public screenshots, video, documentation, logs, and test artifacts are reviewed for credentials, real email addresses, private data, signed URLs, provider diagnostics, and unsupported claims before publication.

## Acceptance criteria

1. With demo mode disabled, no demo account, credential hint, reset endpoint behavior, seed data, quota rule, or demo-specific protection is exposed or applied.
2. With valid demo mode enabled, a new visitor can use the published Owner and Approver credentials and reach the canonical workspace without setup.
3. With valid demo mode enabled, a visitor can instead create and verify an ordinary account, create a private workspace, and retain that workspace unchanged across canonical demo resets.
4. The three projects visibly demonstrate the approved active, completed, and archived stories with internally consistent requirements, decisions, milestones, deliverables, feedback, approvals, and history.
5. Repeated initialization and reset runs are idempotent and preserve canonical user IDs and active sessions.
6. A reset never mutates another tenant and never exposes a partially rebuilt demo; mutation attempts during reset receive the approved recoverable response.
7. Reset removes noncanonical demo records and unreferenced demo assets, restores relative dates and deterministic relationships, and safely retries asset-cleanup failures.
8. Canonical credentials, identities, ownership, and required memberships cannot be altered through the UI or direct API requests.
9. Below quota, real Gmail invitation, Gemini assistance, and Cloudinary upload flows work end to end. Per-identity hourly and deployment daily ceilings are atomically enforced with safe retry guidance.
10. Existing authorization, tenant isolation, workflow transitions, history, versioning, concurrency, attachment privacy, AI human-confirmation, email, export, completion, and archival guarantees do not regress.
11. The scheduled and manually dispatched GitHub reset workflow succeeds against the acceptance deployment and records privacy-safe evidence.
12. The live frontend is traceable to the validated source revision and the live backend serves the exact private GHCR image tagged with that full commit SHA through the existing Northflank path.
13. README and architecture documentation are accurate, complete, reproducible, and oriented to engineering hiring teams.
14. Six privacy-reviewed screenshots and one three-to-five-minute walkthrough load publicly from the dedicated Cloudinary portfolio folder and match the validated release.
15. The walkthrough demonstrates the approved provider/client story and the portfolio narrative accurately describes product value, architecture, challenges, testing, delivery, and limitations.
16. All automated repository checks, critical cross-browser journeys, Docker builds, backend smoke validation, live-provider checks, responsive/accessibility review, privacy review, and product-owner acceptance pass before Slice 3.3 is marked complete.
