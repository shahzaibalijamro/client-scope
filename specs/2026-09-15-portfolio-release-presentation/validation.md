# Portfolio Release and Presentation Validation

**Status:** Planned

## Highest-risk behavior

- Demo activation must fail closed and must not expose shared credentials, demo data, endpoints, or restrictions in ordinary deployments.
- Reset must be tenant-exact, single-flight, idempotent, session-preserving, and incapable of leaving mixed data or deleting another tenant's records/assets.
- Shared visitors must not alter canonical credentials, identities, ownership, or required memberships through any direct or stale request path.
- Concurrent quota enforcement must prevent overspend across API instances while keeping normal workflows coherent when a limit or provider fails.
- Public documentation and media must contain only synthetic data and must not leak secrets, real recipients, signed URLs, prompts, private attachments, or provider diagnostics.
- The final live frontend/backend must be traceable to the fully validated source and immutable backend image.

## Automated checks

### Configuration and isolation

- Verify absent/false demo configuration preserves ordinary behavior and makes demo status unavailable or explicitly disabled without credential data.
- Verify enabled mode rejects missing, malformed, duplicate, zero/negative, cross-environment, or unsafe configuration before demo initialization.
- Verify demo rules match only the immutable marked tenant and cannot be activated by a workspace name, request parameter, user-controlled flag, or forged membership.
- Scan committed files, bundles, logs, snapshots, and build output for configured passwords, reset tokens, provider keys, real addresses, and signed URLs.

### Seed and reset integrity

- Run initialization and reset repeatedly against empty, canonical, and visitor-modified fixtures; assert exactly two canonical identities, one canonical workspace, three projects, and no duplicate linked/history records.
- Assert active, completed, and archived projects contain the specified coherent lifecycle data, valid authorization, deterministic relationships, and reset-relative dates.
- Hold active sessions across reset and prove the same user IDs remain authenticated, stale generation is detected, and refreshed queries return only canonical data.
- Exercise concurrent reset calls, expired and active leases, workflow retries, stage failures, and process interruption; prove single-flight execution and either-old-or-new coherent data.
- Attempt reset against missing, ambiguous, unmarked, and non-demo tenant identifiers and asset folders; prove safe refusal and zero out-of-scope mutations.
- Inject Cloudinary deletion failures; prove database coherence, retained retry metadata, next-run cleanup, and no deletion outside the isolated demo folder/tag.
- Race normal mutations with every reset stage; prove accepted writes are coherent before cutover or rejected with `DEMO_RESET_IN_PROGRESS`, never silently lost into partial state.

### Authorization and identity protection

- As anonymous, ordinary user, Member, Participant, Approver, Owner, stale session, and direct API caller, attempt credential changes, account deletion, ownership transfer, canonical membership removal, and cross-tenant access.
- Verify only the approved Owner and Approver capabilities remain available and every protected attempt returns the stable safe error with no partial mutation or misleading history.
- Re-run the complete tenant-isolation, role-projection, workflow-transition, concurrency, history, versioning, attachment, AI-confirmation, email, export, completion, and archival suites.

### Quotas and real-provider boundaries

- Unit-test configuration and calculation for rolling 60-minute windows, UTC-day boundaries, retry times, byte arithmetic, malformed sizes, and clock-boundary cases.
- Integration-test atomic increments with concurrent requests and multiple service instances for each per-identity and deployment-wide limit.
- Verify validation/authorization failures consume nothing; dispatched provider operations and upload authorizations consume once; retries cannot double-spend or bypass ceilings.
- Verify the default limits: 3 emails/hour, 10 AI requests/hour, and 20 MiB uploads/hour per canonical identity; 30 emails/day, 100 AI requests/day, and 250 MiB uploads/day deployment-wide.
- Verify one identity's hourly usage does not consume the other's hourly allowance, while both contribute to the deployment daily ceiling.
- Verify quota errors name only the limited capability, include bounded retry guidance, and preserve the associated workflow state.
- Verify upload authorization and finalization cannot evade byte accounting through a size mismatch, abandoned request, duplicate finalization, or unsupported type.
- Retain deterministic fake-provider tests, then run controlled acceptance checks proving one real Gmail invitation, Gemini request for each supported AI workflow, and Cloudinary upload/download path below quota.

### UI, workflow, and delivery automation

- Test sign-in demo guidance for enabled, disabled, loading, malformed, and unavailable status; verify no credential is present in ordinary bundles.
- Test reset-in-progress feedback, post-reset query invalidation, authenticated-session continuity, quota feedback, keyboard access, and accessible announcements.
- Run frontend and backend lint, type checks, unit/integration tests, production builds, both Docker builds, backend-container health smoke, and the repository's complete CI gate.
- Run the critical Playwright journey in Chromium, Firefox, and WebKit using both canonical roles and all three projects; retain prior critical journeys as regressions.
- Validate the scheduled workflow's authentication, schedule, manual dispatch, concurrency, timeout, failure result, secret masking, and inability to select another tenant.
- Verify CI-gated Vercel promotion and the Northflank deployment of the exact private GHCR image tagged with the validated full source SHA.

### Documentation and media

- Check internal documentation links and all public HTTPS application/media links from a clean unauthenticated session.
- Validate the public-media manifest schema, six unique screenshot entries, meaningful alt text, dimensions, source commit, and one walkthrough entry with three-to-five-minute duration.
- Verify README setup, environment grouping, commands, architecture links, and deployment description against the repository and acceptance environment.
- Review architecture diagrams and narrative against the implemented boundaries; reject unsupported security, compliance, scale, availability, or legal claims.

## Manual checks

### Canonical visitor journeys

1. Open the live site in a clean browser, understand that it is shared/resettable, and sign in with each published identity without maintainer assistance.
2. As Owner, use My Work and inspect the active project's agreement, accepted change, milestone progress, deliverable versions, pending action, and activity history.
3. Exercise a real Gemini assistance flow, upload a safe test file through Cloudinary, and send a Gmail invitation to a controlled recipient; verify user-facing results and source-of-truth state.
4. As Approver, review the client projection, make an authorized decision, and confirm the actor, version, time, and result appear in preserved history.
5. Inspect the completed project from agreement through final completion and inspect the archived project and its export without finding mutable protected controls.
6. Reach an hourly quota in a controlled run and verify the explanation, retry guidance, and unaffected manual workflows.
7. Keep both roles signed in across a manually dispatched reset; verify temporary mutation blocking, session continuity, refresh guidance, canonical restoration, and removal of visitor-created content/assets.

### Responsive, accessibility, browser, and privacy review

- Review representative 320, 390, 768, 1024, and 1440 pixel layouts, long seeded content, dialogs/drawers, tables/cards, forms, errors, and public-demo notices without core horizontal overflow.
- Complete keyboard-only navigation, visible-focus, skip-link, modal focus, route-heading, screen-reader announcement, semantic structure, contrast, reduced-motion, and non-color state checks.
- Review current Chrome/Edge and Firefox manually; use automated WebKit and record whether a real Safari check was available.
- Inspect browser storage, HTML, JavaScript bundles, network responses, console output, downloadable exports, email content, and Cloudinary URLs for unauthorized or sensitive data.
- Confirm another ordinary workspace remains invisible and unchanged throughout demo use and reset.

### Portfolio artifact review

- Verify all six screenshots are sharp, consistently framed, use only canonical synthetic data, collectively include desktop/mobile views, and accurately show My Work, Overview, Scope, Changes, Deliverables, and Activity/history.
- Watch the complete three-to-five-minute video from its public Cloudinary URL on desktop and mobile; verify pacing, audio/readability, provider/client story, architecture/CI explanation, and absence of secrets or private consoles.
- Review README and architecture content as an engineering hiring manager: the product problem, technical boundaries, notable decisions, testing depth, deployment traceability, tradeoffs, and limitations must be understandable without repository archaeology.
- Verify all public Cloudinary assets reside in the dedicated portfolio folder, not private attachment or resettable demo storage, and load without signed or expiring URLs.

## Evidence

### Local implementation evidence — 2026-09-16

- Working branch: `codex/portfolio-release-presentation`; implementation started from commit `2cac9bb411a6361a4aabd9fb3deaa801e2d9fe9e`. The working tree is intentionally uncommitted, so no deployed source revision is claimed.
- Local environment: Windows 10.0.19045, Node.js 22.23.0, npm 10.9.8, Playwright 1.62.1. Production container builds used the pinned Node.js 24.20.0 base image.
- Backend verification: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed. The full suite reported 25 files and 141 tests passing, including Slice 3.3 configuration, fail-closed initialization, deterministic reset/session continuity, protected mutations, public/internal contracts, and quota coverage.
- Frontend verification: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed. The full suite reported 15 files and 51 tests passing, including demo entry, ordinary-mode isolation, generation invalidation, and retained prior UI coverage.
- Container verification: final backend and frontend images built as `clientscope-backend:slice-3.3` and `clientscope-frontend:slice-3.3`. The local backend image embeds `SOURCE_COMMIT=local-validation`; its final manifest-list digest was `sha256:588974ccf10e3307012d79ffd4da031055051164ecf3d1f2ddebb3615bf31c70`. The final frontend manifest-list digest was `sha256:0a45ccd2e368ff44dfe2366d6d28fdff29724fc032d1ee329bc680f4486623de`.
- Backend-container smoke: the rebuilt backend image returned exactly `{ "status": "ok", "database": "connected" }` against an isolated MongoDB 8 container. Temporary containers and networks were removed afterward.
- Secret-pattern scan: no Gemini API key, Cloudinary URL credential, GitHub personal token, private-key header, or MongoDB SRV credential pattern was found in committed/untracked project files outside generated/dependency directories.
- Browser automation: the canonical Chromium journey passed in the initial local matrix attempt; the WebKit test body subsequently passed in 27.7 seconds. Windows process teardown did not return cleanly, and the Firefox attempt stalled, so the three-engine browser gate remains pending for CI/acceptance rather than being recorded as passed.
- Documentation artifacts added locally: hiring-oriented README, architecture notes, portfolio narrative, demo operations runbook, versioned planned media manifest, privacy/capture checklist, and timed walkthrough script.

### Required release evidence still pending

- Controlled acceptance deployment and immutable source/image revision matching.
- Real Gmail invitation, all three Gemini workflows, and private Cloudinary upload/access plus quota/provider-failure exercises.
- Scheduled and manual reset evidence, cleanup retry, session continuity, tenant isolation, Vercel promotion, and exact GHCR-to-Northflank traceability.
- Complete Chromium/Firefox/WebKit CI result and the manual responsive, accessibility, browser, link, and privacy reviews.
- Six public screenshots and the three-to-five-minute public walkthrough in the separate Cloudinary portfolio folder; manifest URLs, dimensions/duration, and capture commit remain intentionally null.
- Product-owner acceptance against that same live revision. Slice 3.3 and the roadmap therefore remain incomplete.

Record for the controlled acceptance release:

- Source commit, branch, deployed frontend revision, full GHCR image tag/digest, and Northflank-selected image.
- Node.js, npm, operating system, browser engines, container engine, and acceptance-environment category.
- Commands, exit results, test counts, and safe artifact paths for every automated check.
- Seed/reset run IDs, stage timings, canonical record counts, session-continuity result, isolation result, cleanup result, and scheduled/manual workflow links with secrets removed.
- Quota boundary/concurrency results and controlled real Gmail, Gemini, and Cloudinary outcomes without recipient addresses, prompts, filenames, signed URLs, or provider diagnostics.
- Manual viewport, keyboard, screen-reader, browser, role, privacy, lifecycle, export, and failure-mode results.
- Public live-app, architecture, six screenshot, and walkthrough links; media manifest revision; capture source commit; privacy reviewer/result.
- Product-owner acceptance and any approved exception with owner, rationale, risk, and follow-up condition.

## Merge gate

Slice 3.3 is safe to merge and mark complete only when:

1. Every acceptance criterion in `requirements.md` passes or has an explicit product-owner exception.
2. Demo-disabled isolation, tenant-exact reset, session preservation, canonical identity protection, quota atomicity, and Cloudinary cleanup have automated integration evidence.
3. Real Gmail, Gemini, and Cloudinary checks pass below quota in the controlled acceptance deployment, and quota/provider failures remain safe.
4. Frontend/backend lint, types, tests, production builds, existing workflow regressions, Chromium/Firefox/WebKit journeys, Docker builds, and backend-container smoke all pass.
5. The scheduled and manual reset paths pass, retain privacy-safe evidence, and cannot operate on an arbitrary tenant.
6. Vercel promotion and the private immutable GHCR-to-Northflank path are healthy and traceable to the validated revision.
7. Responsive, keyboard, focus, screen-reader, contrast, overflow, reduced-motion, long-content, evergreen-browser, role, tenant, and privacy reviews have no unresolved release-blocking defect.
8. README, architecture document, portfolio narrative, public-media manifest, capture checklist, and walkthrough script are complete and accurate.
9. Six screenshots and the three-to-five-minute walkthrough are publicly accessible from the dedicated Cloudinary portfolio folder and pass content/privacy review.
10. Slice 3.2 is correctly recorded as complete; Slice 3.3 is marked complete only after product-owner manual acceptance of the matching live revision.
