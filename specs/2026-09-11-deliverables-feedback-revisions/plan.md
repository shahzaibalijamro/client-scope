# Slice 1.5: Deliverables, Feedback, and Revisions Implementation Plan

**Status:** Approved implementation plan — 2026-09-11

This plan breaks the approved Slice 1.5 behavior into vertical task groups. Each group must leave the repository coherent and keep verification close to the rule it proves. Newly discovered product ambiguity must return to `requirements.md` for approval rather than becoming undocumented behavior.

## 1. Define public contracts and pure lifecycle rules

1. Define aggregate states `draft`, `in-review`, `revision-draft`, `approved`, and `canceled` separately from submitted-version outcomes `in-review`, `changes-requested`, `withdrawn`, and `approved`.
2. Define strict Zod and TypeScript contracts for deliverables, provider drafts, immutable versions, comments, Approver outcomes, links, private-asset metadata, attachment references, cleanup state, permissions, pending summaries, cursor pages, and mutation results.
3. Mirror public response contracts in strict frontend schemas without introducing a shared package or Next.js business endpoint.
4. Encode title, notes, revision-summary, comment, reason, link, filename, allowed-format, byte-size, attachment/link-count, open-count, cursor, page-size, and confirmation validation exactly as approved.
5. Implement pure transition guards that keep aggregate state independent from version outcome and reject every transition outside the approved table.
6. Add rule tests for provider/client permissions, title freezing, v2+ summaries, submission readiness, direct-cancel rejection, terminal approval, open-state counting, and first-valid terminal outcomes.

## 2. Add persistence, counters, and reference integrity

1. Add focused Mongoose models for deliverable aggregates, mutable drafts, immutable versions, comments, Approver outcomes/provider withdrawals, private assets, upload reservations, and cleanup work.
2. Add project-scoped monotonic deliverable-number state and per-deliverable monotonic version allocation without changing previously committed numbers.
3. Add indexes and conditional invariants for one draft per aggregate, one current in-review version, unique deliverable numbers per project, unique version numbers per deliverable, single terminal outcome per version, deterministic pagination, single-use upload reservations, and unique idempotent cleanup work.
4. Represent version attachment references as immutable snapshots pointing to stable internal assets. Ensure draft copying and draft removal cannot update or delete historical version references.
5. Maintain an authoritative project open count or equivalent transactionally locked state so concurrent creates cannot commit more than 50 aggregates in `draft`, `in-review`, or `revision-draft`.
6. Add model/index synchronization through the existing domain-model boundary and verify no new infrastructure or local file persistence is introduced.

## 3. Implement draft creation and collaboration

1. Add project-scoped draft creation for the owner and active assigned Service-Team Members after rechecking approved scope and the open limit inside the transaction.
2. Create an unnumbered aggregate in `draft` with one provider-private mutable draft and an opaque revision token.
3. Add read projections that expose drafts only to authorized providers while allowing clients to see only previously submitted records and safe aggregate state.
4. Add optimistic draft editing for the unfrozen initial title, notes, required later-version revision summary, ordered links, and ordered finalized attachment references.
5. Reject no-op and stale updates without advancing revision state or creating activity.
6. Add confirmed discard for a never-submitted `draft`, removing it without numbering, submitted history, email, or project activity while transactionally recording cleanup work for newly unreferenced draft assets.

## 4. Add the provider-neutral private-asset boundary

1. Define an injectable storage interface for narrow signed upload authorization, trusted upload verification/finalization, five-minute authorized delivery, and idempotent deletion.
2. Implement the Cloudinary adapter behind that interface with all credentials, signatures, resource/provider identifiers, URLs, and raw failures contained inside the adapter.
3. Add a deterministic fake storage adapter for unit, integration, and browser tests; production configuration remains server-only and fails clearly when required storage configuration is absent.
4. Issue short-lived single-use upload reservations only to authorized providers for the exact current draft, using unpredictable server-controlled asset/provider identities and private storage constraints.
5. Finalize an upload only after verifying reservation ownership/expiry, provider result, private access, byte limit, allowed declared/detected type, filename, and exact draft association.
6. Attach finalized metadata through the draft revision boundary, enforce the ten-file limit atomically, and enqueue cleanup for a verified asset left unreferenced by stale or failed finalization.
7. Add attachment removal, discard, and cancellation logic that checks all authoritative draft/version references before creating idempotent cleanup work.
8. Attempt deletion outside the domain transaction; treat already-absent assets as success, persist safe retry state, and support bounded opportunistic retry or an explicit maintenance command without queues or workers.
9. Add current-member authorized signed access for exact submitted-version attachments, image-only preview capability, and safe PDF/ZIP open/download behavior without persistent or public URLs.

## 5. Implement submission, numbering, and immutable snapshots

1. Permit both provider roles to submit only from the exact `draft` or `revision-draft` with the current revision token.
2. Recheck provider authority, current approved scope, active Approver existence, aggregate state, title/content rules, revision summary, and every attachment's trusted finalized state inside the transaction.
3. Require at least one valid link or finalized attachment; reject notes-only and any pending, failed, expired, replayed, foreign, detached, or cleanup-pending upload state.
4. On first submission, atomically allocate the next project deliverable number and version 1. On later submissions, retain the deliverable number and allocate the next per-deliverable version number.
5. Snapshot the frozen title, notes, revision summary, ordered links, immutable attachment metadata/references, current approved-scope ID/number, submitter context, and time.
6. Remove the mutable draft, set the exact version and aggregate to `in-review`, freeze the logical title, decrement no open slot, and create project activity in the same transaction.
7. Ensure any validation, authorization, counter, version, attachment-reference, draft removal, aggregate, or activity failure rolls back the complete submission and consumes no new number.

## 6. Implement comments and exact-version review outcomes

1. Allow all current project roles to post immutable plain-text comments only on the aggregate's exact current `in-review` version.
2. Commit each comment and its safe activity entry together; a terminal race succeeds only for the transaction that validly claims the still-active exact version.
3. Enforce that Client Participants can never approve or request formal revision, while current Client Approvers can perform both actions.
4. Add confirmed Approver approval with an optional note, atomically recording the exact immutable outcome/activity and changing the aggregate to terminal `approved`.
5. Add confirmed Approver revision request with a required note, atomically recording `changes-requested`, clearing current review, changing the aggregate to `revision-draft`, creating exactly one copied draft, and writing activity.
6. Copy version notes, links, and attachment references into the revision draft without mutating source snapshots; require a new revision summary before later submission.
7. Condition every terminal action on the exact version still being current and `in-review` so the first valid Approver outcome wins without duplicates or partial copied drafts.

## 7. Implement provider withdrawal and preserved cancellation

1. Allow either current provider role to withdraw the exact in-review version with confirmation and a required reason.
2. Atomically record `withdrawn` actor/time/reason and activity, clear current review, change the aggregate to `revision-draft`, and create exactly one copied draft.
3. Reject direct cancellation from `in-review`, requiring the provider to withdraw first.
4. Allow either provider role to cancel only from `revision-draft`, with confirmation and a required reason.
5. Atomically remove only the mutable draft, preserve every submitted version/comment/outcome/number/reference, create cleanup work only for newly unreferenced assets, change the aggregate to terminal `canceled`, decrement the open count, and write activity.
6. Expose no operation to reopen, revise, withdraw, cancel, discard, or delete an `approved` deliverable.

## 8. Add REST routes, authorization, and bounded reads

1. Register the deliverable router under the existing `/api/v1/projects/:projectId/deliverables...` boundary and reuse session, CSRF/mutation, validation, error-envelope, anti-enumeration, and diagnostic conventions.
2. Add open-collection and terminal-history reads with role-aware projections, deterministic ordering, open count/limit, permissions, and opaque cursor pagination.
3. Add bounded per-deliverable submitted-version and comment history reads so historical records are never silently truncated or returned without limits.
4. Add routes for create/edit/discard draft, upload authorization/finalization/detachment, submission, exact-version comment, Approver decision, provider withdrawal, revision-draft cancellation, and exact-version attachment access.
5. Return provider mutation tokens only to authorized providers. Never serialize drafts, upload claims, provider identifiers, storage signatures, cleanup records, or permanent URLs to clients.
6. Recheck current workspace/project access and role on every route and again inside significant state-changing transactions.
7. Add stable validation, stale, prerequisite, limit, dependency, and not-found error codes/messages without revealing private resource existence or storage details.

## 9. Integrate activity, email, and project pending work

1. Extend project activity actions for submission, comment, approval, revision request, withdrawal, and cancellation using minimal safe context.
2. Verify each authoritative action and required activity commit or roll back together; keep draft/upload/access/cleanup operations out of project activity.
3. Extend the email command boundary with deliverable-review and deliverable-result categories without coupling domain logic to Gmail/Nodemailer details.
4. After successful submission, notify all active exact-project Client Participants and Client Approvers once each.
5. After successful approval or revision request, notify the Workspace Owner and active assigned Service-Team Members once each.
6. Keep comments, withdrawal, discard, cancellation, draft changes, upload, cleanup, and access email-free.
7. Return one safe post-commit warning for partial or total SMTP failure while keeping state and pending work authoritative.
8. Extend project summaries with a separate deliverables `pendingAction` and `pendingCount`: participant `review-requested`, Approver `decision-required`, and provider `revision-required`.
9. Update `Your work` to render this counted badge alongside existing scope and change-control indicators rather than replacing them.

## 10. Build the provider and client deliverable experience

1. Add a project deliverables section separate from scope, change control, and milestones, with an approved-scope prerequisite state.
2. Build provider draft creation/editing for title, notes, v2+ revision summary, labeled HTTPS links, and attachments with keyboard-operable ordering/removal.
3. Present upload selection, progress, uploaded-unverified, finalizing, finalized, failed, detached, and cleanup-safe retry states without treating browser upload success as submission-ready.
4. Show clients only submitted content and safe revision-in-progress state; never render draft data or provider-only controls.
5. Build exact-version discussion for all roles, Approver-only approve/request-revision confirmations, and provider-only withdrawal/cancellation confirmations with required notes/reasons.
6. Show immutable version history, scope provenance, actor/time context, revision summaries, comments, outcomes, links, and attachment metadata.
7. Use authorized inline preview only for supported images; provide explicit signed access for PDF/ZIP and clear safe external-link behavior.
8. Add separate newest-first approved/canceled history with load-more pagination and no restore/delete action.
9. Handle empty, loading, upload, stale, validation, forbidden, storage-unavailable, signed-access, partial-email, cleanup, and unexpected failures with useful recovery paths.
10. Verify semantic labels, keyboard access, focus management, live announcements, non-color status meaning, line wrapping, and narrow-mobile layouts.

## 11. Complete risk-based automated verification

1. Add backend rule tests for state separation, transitions, title freezing, roles, limits, validation, numbering, link safety, file eligibility, reference counting, and cleanup idempotency.
2. Add Supertest integration coverage for tenant isolation, current authority, draft privacy, approved-scope/Approver gates, optimistic concurrency, exact-version races, transactions, pagination, activity, notification recipients, and dependency failures.
3. Inject failures at number allocation, version persistence, attachment-reference validation, draft removal, aggregate transition, outcome, copied-draft creation, cleanup-record creation, comment, and activity boundaries to prove complete rollback.
4. Add storage-adapter tests for signed upload constraints, trusted finalization, replay/expiry/mismatch rejection, five-minute delivery, private access, safe provider failures, deletion idempotency, and retry state.
5. Add frontend behavior tests for every role projection, pending counts, upload lifecycle, exact confirmations, history, preview/download, stale recovery, errors, accessibility, and responsive presentation.
6. Add focused Playwright journeys for submission, participant comment, Approver revision request, provider v2 resubmission, approval, preserved history, and blocked unauthorized paths.
7. Run backend and frontend lint, typecheck, tests, production builds, Playwright checks, Docker builds, and backend-container smoke validation.

## 12. Validate, document, and hand off

1. Execute `validation.md` against the completed implementation and record commands, environment category, counts, and safe evidence without secrets or signed URLs.
2. Exercise a configured private Cloudinary test environment for real upload, verification, authorized preview/download, expiry, removal, and idempotent cleanup behavior.
3. Review implementation and tests line by line against the approved requirements, constitution, exclusions, and acceptance criteria.
4. Update README/API documentation only where the implemented public workflow requires it; do not mark Slice 1.5 complete until all acceptance evidence and merge gates pass.
5. Return newly discovered behavioral ambiguity to the approved specification before changing product policy.
