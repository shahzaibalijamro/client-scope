# Portfolio Release and Presentation Implementation Plan

**Status:** Approved — 2026-09-15; hybrid-entry amendment approved — 2026-09-16

## 1. Correct governance and lock configuration contracts

1. Mark Slice 3.2 complete with its 2026-09-15 merged implementation and validation evidence; keep Slice 3.3 incomplete.
2. Add fail-closed backend demo configuration for activation, immutable demo tenant identity, canonical accounts, reset authentication, isolated Cloudinary locations, and the approved configurable quotas.
3. Define `GET /api/v1/demo`, the internal reset request/response, stable demo-protection, quota, and reset-in-progress errors, and frontend parsing for those contracts. The enabled demo response contains only the intentionally public credentials and reset metadata approved by the requirements.
4. Document all new environment values by purpose and sensitivity without committing working credentials.

## 2. Build deterministic demo seeding and reset

1. Model an explicit demo-tenant marker, reset lease/run metadata, quota state, and the minimum reset-generation/version data required for safe cutover and stale-client refresh.
2. Implement idempotent creation and reconciliation of the stable Owner and Approver identities and their protected canonical memberships.
3. Build the deterministic three-project seed story with reset-relative dates, coherent version/history relationships, and safe representative attachment metadata/files.
4. Stage and atomically cut over demo workspace data while preserving the canonical user IDs and sessions; reject demo mutations during the reset window.
5. Isolate demo uploads and remove unreferenced visitor-created assets after cutover, retaining retryable cleanup state without rolling back coherent data.
6. Verify the immutable target and demo marker before any replacement or asset deletion and refuse ambiguous or non-demo targets.

## 3. Enforce demo identity and quota safeguards

1. Centralize canonical credential, identity, ownership, and membership protections in backend authorization/business rules rather than UI visibility.
2. Add atomic MongoDB quota accounting for per-identity rolling-hour and deployment-wide UTC-day email, AI, and upload-byte limits.
3. Reserve/consume quota at the approved provider boundaries and return capability-specific retry guidance without exposing shared usage or provider details.
4. Present published Owner and Approver credentials, shared-demo/reset messaging, maintenance feedback, and quota feedback only when the backend reports valid demo mode.
5. Invalidate/refetch demo data after reset generation changes while keeping existing sessions authenticated.
6. Keep ordinary signup, password recovery, and private workspace creation available in valid demo mode while retaining canonical-identity workspace restrictions and tenant-exact reset/quota boundaries.

## 4. Automate resets and operational diagnostics

1. Implement the demo-only internal reset endpoint with HTTPS deployment use, constant-time bearer-secret validation, single-flight lease behavior, and bounded responses.
2. Add a six-hour scheduled and manually dispatchable GitHub Actions workflow with concurrency control, timeouts, least-privilege secrets, and no caller-supplied tenant target.
3. Emit privacy-safe structured reset diagnostics and workflow summaries covering run ID, revision, stage, duration, counts, cleanup outcome, and failure class.
4. Document safe manual recovery, quota adjustment, failed asset-cleanup retry, secret rotation, and demo disablement procedures without introducing a new monitoring platform.

## 5. Harden and verify the release path

1. Re-run and fix regressions across all prior slice unit, API, UI, and end-to-end coverage, with focused additions for demo isolation, reset, identity protection, quotas, and provider boundaries.
2. Validate real Gmail, Gemini, and Cloudinary flows below quota in a controlled acceptance deployment and verify safe behavior at provider and quota failures.
3. Validate MongoDB Atlas isolation, private Cloudinary delivery, Vercel promotion gating, private immutable GHCR publication, exact-image Northflank deployment, readiness, and public health.
4. Complete cross-browser, responsive, accessibility, privacy, error-handling, and long-content review on the canonical seeded experience.

## 6. Produce portfolio documentation and media

1. Rewrite the README landing experience for engineering hiring teams with product narrative, demo access, feature journey, architecture summary/diagram, stack, setup, verification, deployment, and artifact links.
2. Add the detailed architecture document and concise portfolio narrative, including trust boundaries, data flow, key decisions, challenges, tradeoffs, limitations, and learning.
3. Create a versioned public-media manifest plus capture checklist, alt text, and privacy review for the six approved screenshots.
4. Create the three-to-five-minute walkthrough script, shot list, timing, recording checklist, and privacy review; record against the validated canonical demo.
5. Upload screenshots and video to the dedicated public Cloudinary portfolio folder and verify stable unauthenticated HTTPS delivery before inserting their URLs.

## 7. Record acceptance and complete the roadmap

1. Record the source commit, exact deployed image SHA, environment categories, commands, test counts, browser/provider results, reset evidence, media revision, and safe artifact links in `validation.md`.
2. Review the final diff and live deployment against every requirement, prior specification, constitution constraint, privacy rule, and portfolio claim.
3. Obtain product-owner manual acceptance and record any explicit exception with rationale, owner, risk, and follow-up condition.
4. Mark Slice 3.3 complete only after the live demo, documentation, public media, walkthrough, deployment traceability, and complete validation gate all correspond to the accepted revision.
