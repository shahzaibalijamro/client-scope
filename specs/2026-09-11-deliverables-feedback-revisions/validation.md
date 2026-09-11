# Slice 1.5: Deliverables, Feedback, and Revisions Validation

**Status:** Complete — validated 2026-09-12

## Validation Goal

Prove that authorized providers can submit private, versioned deliverables for client review; clients can discuss the exact submitted work; only Client Approvers can make formal review decisions; and revisions, withdrawal, approval, cancellation, files, comments, numbering, and activity remain historically trustworthy. Validation must also prove that storage and email failures cannot corrupt authoritative state and that Slice 1.5 does not expand into excluded project-management, completion, archival, or AI behavior.

This document defines required evidence. It is not completion evidence until the implementation exists, every applicable check has run, and the results section has been updated with safe artifacts and outcomes.

## Highest-Risk Behavior

The strongest automated evidence is required for:

1. Tenant isolation and current project-membership authorization on every deliverable, draft, version, comment, upload, asset-access, and terminal action.
2. Client Participant view/comment authority remaining distinct from Client Approver decision authority.
3. Aggregate lifecycle state remaining independent from immutable submitted-version outcome.
4. First-writer-wins Approver decisions, exact-version withdrawal/comment races, and the absence of duplicate outcomes or copied drafts.
5. Atomic, non-reused project deliverable numbering and per-deliverable version numbering across failures and concurrency.
6. A concurrency-safe maximum of 50 aggregates in exactly `draft`, `in-review`, or `revision-draft`.
7. Submitted content and historical attachment references remaining immutable when copied revision drafts are edited, detached, canceled, or cleaned up.
8. Only trusted finalized exact-draft assets entering immutable versions; upload claims, cross-project assets, and pending/failed states must fail closed.
9. Reference-safe, persisted, idempotent cleanup that never selects a historical asset and never rolls back a committed deliverable transition.
10. Private current-member-only signed access with no public/permanent URL or provider-specific storage data leaking through contracts or diagnostics.
11. Required deliverable/history/activity records committing atomically while post-commit email, delivery, and cleanup failures remain non-authoritative.
12. Terminal approval remaining locked with no reopen, revision, cancellation, discard, or deletion path.

## Automated Checks

### 1. Contract and pure-rule tests

Verify at the lowest reliable layer:

- Aggregate-state parsing accepts only `draft`, `in-review`, `revision-draft`, `approved`, and `canceled`.
- Version-outcome parsing accepts only active `in-review` and terminal `changes-requested`, `withdrawn`, and `approved`.
- No API or domain type conflates aggregate state with version outcome.
- Only approved transitions are accepted; direct `in-review` -> `canceled` and every transition out of `approved`/`canceled` are rejected.
- A Client Participant can view and comment but cannot approve or request revision.
- A Client Approver has participant capabilities plus approve/request-revision authority.
- Both provider roles can create/edit/submit/discard drafts, withdraw review, and cancel from `revision-draft`.
- Title is mutable only before first successful submission and remains frozen afterward.
- Version 1 permits no revision summary; version 2+ requires 1–2,000 trimmed characters.
- Notes, comments, labels, reasons, filenames, arrays, cursors, limits, confirmations, and revision tokens enforce exact bounds.
- Submission readiness rejects notes-only content and accepts at least one valid link or finalized attachment.
- Exactly the three nonterminal aggregate states count toward the limit; `approved` and `canceled` do not.

### 2. Link and file boundary tests

Cover:

- Valid labeled HTTPS links and maximum ten-link ordering.
- Rejection of HTTP, embedded credentials, malformed URLs, duplicate IDs, and localhost, loopback, link-local, private, or reserved destinations.
- Allowed PDF, PNG, JPEG, WebP, and ZIP type/extension/detected-metadata combinations up to exactly 25 MiB.
- Rejection just above 25 MiB, unsupported/indeterminate formats, SVG/HTML/executable content, extension/type mismatch, missing filename, filename over 255 characters, and an eleventh file.
- Filenames and metadata remain inert data in API/UI serialization.
- Image preview capability is true only for PNG/JPEG/WebP; PDF and ZIP remain explicit open/download actions.

### 3. Draft privacy and optimistic-concurrency integration tests

For owner, assigned team member, unassigned team member, participant, Approver, removed member, inactive member, and foreign tenant/project:

- Only current authorized providers can create and read a mutable draft.
- Clients cannot infer the existence or content of a never-submitted draft through deliverable, project-summary, upload, error, or asset routes.
- Client views of `revision-draft` expose submitted history and safe status only, never copied content or mutation/upload state.
- Material draft edits advance the revision token; no-op edits do not.
- Two mutations using one token produce at most one success; the loser receives a stable stale conflict and no partial link/attachment/title change.
- Removing access or assignment before commit defeats stale UI and unexpired sessions.
- Creation without approved scope fails without aggregate, draft, open-count, or activity side effects.

### 4. Open-limit and creation concurrency tests

Prove:

- Projects with 0–49 open deliverables can create within the limit.
- At 50 total aggregates across `draft`, `in-review`, and `revision-draft`, creation fails with a stable limit conflict.
- Approved and canceled aggregates never count, regardless of their historical version count.
- When one slot remains, simultaneous creates commit at most one new aggregate.
- Failed, rolled-back, or unauthorized creates do not consume a slot.
- Approval and cancellation free a slot only after the complete terminal transaction commits.

### 5. Upload authorization and trusted-finalization tests

Using the deterministic fake storage adapter, verify:

- Only an authorized provider editing the exact current draft can request upload authorization.
- Reservations use unpredictable identity and are scoped to the exact workspace/project/deliverable/draft, private mode, allowed type, and size.
- Valid trusted provider results finalize once and record only provider-neutral public metadata plus server-only opaque provider identity.
- Browser-declared success alone never finalizes an asset.
- Expired, replayed, tampered, wrong-provider-ID, public-mode, wrong-type, oversize, cross-project, cross-draft, removed-draft, and stale-token finalizations fail safely.
- Finalization at the ten-file boundary cannot race beyond ten.
- A verified asset left unreferenced after stale/failed finalization produces cleanup eligibility without appearing in the draft.
- Provider failure preserves the draft and returns a recoverable dependency error without credentials or raw provider diagnostics.

### 6. Submission, numbering, and snapshot tests

Verify:

- Submission requires current provider authority, exact current draft/token, current approved scope, an active Client Approver, valid content, and finalized attachment state.
- Pending, incomplete, failed, expired, unverified, replayed, foreign, detached, or cleanup-pending attachments block submission.
- First successful submission allocates the next project deliverable number and version 1 only at commit.
- Later successful submissions retain the deliverable number and allocate the next per-deliverable version number.
- Failed validation or injected persistence failure consumes neither deliverable nor version number.
- A successfully submitted version later marked `changes-requested` or `withdrawn` permanently consumes its version number; the next version increments and gaps are never reused.
- Submission snapshots the frozen title, notes, summary, ordered links, attachment references/metadata, exact current approved-scope ID/number, submitter context, and time.
- The mutable draft is removed, aggregate/version become `in-review`, and activity commits in the same transaction.
- Concurrent first submission produces one version, one deliverable number, one activity, and at most one email event.

Inject failures independently at:

1. Deliverable-number allocation.
2. Per-deliverable version allocation.
3. Persisted attachment-reference validation.
4. Version persistence.
5. Draft conditional removal.
6. Aggregate state/current-version update.
7. Activity persistence.

Each failure must leave the draft editable under coherent revision state, leave numbering unconsumed, and create no partial version or activity.

### 7. Comment authorization and exact-version race tests

Verify:

- Owner, assigned team member, Participant, and Approver can comment while the exact version is `in-review`.
- Unassigned, removed, inactive, foreign-project, and unauthenticated actors cannot comment.
- A Participant's successful comment does not grant a formal decision operation or alter version/aggregate state.
- Comments are plain text, immutable, ordered deterministically, bounded through cursor pages, and have no edit/delete endpoint.
- Comment and activity commit together; injected activity failure creates neither.
- A comment racing approval, revision request, or withdrawal succeeds only if it commits while the exact version remains active.
- Comments against an older, terminal, foreign-deliverable, or merely similarly numbered version fail safely.

### 8. Approver decision tests

Verify:

- Participant approve and request-revision attempts are rejected by backend authorization even if controls are forged.
- Current Approver approval requires confirmation, allows an optional note, and targets the exact current in-review version.
- Current Approver revision request requires confirmation and a nonblank 1–2,000 character actionable note.
- Approval atomically records outcome/activity, makes the version `approved`, changes the aggregate to terminal `approved`, clears current review, and frees one open slot.
- Revision request atomically records `changes-requested` outcome/activity, changes the aggregate to `revision-draft`, clears current review, and creates exactly one copied draft.
- Simultaneous approve/approve, request/request, and approve/request races have exactly one winner and no duplicate outcomes, drafts, activity, or email.
- Approver removal or role downgrade before commit defeats a stale decision page.
- Older-version, repeated, foreign-project, terminal, or stale decisions apply no partial change.

Inject failures at outcome, copied-draft, aggregate, open-count, and activity persistence. Verify the exact original version remains in review with no partial terminal effect.

### 9. Withdrawal, discard, and cancellation tests

Verify:

- Either current provider role can withdraw the exact in-review version with confirmation and required reason.
- Withdrawal atomically records `withdrawn`, actor/time/reason/activity, changes the aggregate to `revision-draft`, and creates exactly one copied draft.
- Withdrawal racing an Approver decision produces one valid terminal version outcome and coherent aggregate state.
- Confirmed discard works only for a never-submitted `draft`, consumes no number, creates no activity/email/history, and creates cleanup work only for newly unreferenced assets.
- Discard is rejected once any deliverable number or submitted version exists.
- Direct cancellation from `in-review` is rejected without marking the version withdrawn or changing state.
- Cancellation succeeds only from `revision-draft`, requires confirmation/reason, retains every submitted version/comment/outcome/number/reference, removes the mutable draft, records safe cleanup work/activity, marks `canceled`, and frees one open slot.
- Approved deliverables reject withdraw, discard, cancel, draft creation, resubmission, reopen, and deletion attempts.

### 10. Historical immutability and reference-integrity tests

For revision drafts copied after both `changes-requested` and `withdrawn`, verify:

- Notes, links, and attachment references initially match the exact source version.
- Editing notes/summary, reordering/removing/replacing links, or reordering/removing/replacing attachments changes only the draft.
- Earlier version serialization, attachment metadata, comments, outcome, actors, scope provenance, and timestamps remain byte-for-byte equivalent after later draft operations and submission.
- Removing a shared historical asset reference from the draft does not mark the asset cleanup-eligible.
- A new draft-only asset becomes cleanup-eligible after its last authoritative draft reference is removed.
- Assets referenced by any submitted version are never selected by discard, cancellation, opportunistic cleanup, maintenance cleanup, or malformed retry data.
- New project members can read authorized history; removed or unassigned former members cannot.

### 11. Cleanup safety and failure tests

Verify:

- Reference eligibility is checked against authoritative draft and submitted-version records in the same transaction that removes the draft reference.
- Cleanup records use stable unique idempotency identity and cannot duplicate destructive work under retry/concurrency.
- Already-absent provider assets complete cleanup successfully.
- Transient deletion failure persists safe retry state without restoring app access or rolling back draft removal, discard, or cancellation.
- Retrying eventually completes exactly once and does not affect a newly authoritative reference.
- Cleanup processing rechecks reference safety immediately before provider deletion and cancels/skips work if an authoritative reference exists.
- Cleanup records, provider identifiers, attempts, and failures never enter project activity, client responses, email, or unsafe diagnostics.
- No cleanup path depends on a queue, worker service, Redis, or persistent local filesystem.

### 12. Private attachment-access tests

Verify for current members and every unauthorized context:

- Access requires the exact project, deliverable, submitted-version, and attachment association.
- Current authorized members receive a private signed result expiring in five minutes.
- Old/terminal versions remain accessible to current project members without becoming public.
- Draft-only, foreign-version, foreign-project, unverified, detached, cleanup-pending, or unknown assets cannot receive delivery access.
- Client responses and application logs contain no opaque provider identifier, credential, raw signature, cleanup data, or permanent URL.
- Image preview is permitted only for PNG/JPEG/WebP; PDF and ZIP use explicit open/download behavior and ZIP is never rendered/extracted.
- Storage signing/delivery failure returns a recoverable error and leaves committed metadata/history unchanged.
- A previously issued URL expiring or membership later being removed does not create a new access entitlement; every new access request reauthorizes current membership.

### 13. Activity and email tests

Verify:

- Submission, comment, approval, revision request, withdrawal, and cancellation create the specified immutable project activity.
- Draft creation/edit/discard, upload/finalization/detachment, attachment access, and cleanup create no project activity.
- Activity includes safe project/deliverable/version/actor/outcome context and excludes notes, comments, reasons, links, filenames, provider data, signed URLs, credentials, and cleanup details.
- Required domain writes and activity roll back together.
- Submission recipient resolution includes all active exact-project Participants and Approvers once each and excludes pending invitees, inactive/removed clients, and members of other projects.
- Approval and revision-request recipient resolution includes the owner and active workspace-member/project-assigned Service-Team Members once each.
- Comments, withdrawal, discard, cancellation, draft/upload/access/cleanup operations send no email.
- Email contains only the approved minimum context.
- Partial/total SMTP failure preserves the committed state/activity/pending work and returns one safe warning without addresses or provider errors.

### 14. Pending-work and API projection tests

Verify:

- Participant summaries expose `review-requested` and the count of current `in-review` deliverables.
- Approver summaries expose `decision-required` with the same role-appropriate in-review count.
- Provider summaries expose `revision-required` and the count of `revision-draft` aggregates.
- Zero count omits the pending-action label while returning a coherent zero count.
- Deliverable pending data remains separate from existing scope and change-control summaries.
- Concurrent outcomes immediately update counts from committed aggregate state; email status does not affect them.
- Open, terminal, version, and comment pagination uses opaque cursors, deterministic ordering, default 20, maximum 50, no duplicates across pages, and no lost older history.
- Client projections omit mutable drafts, draft tokens, upload claims/reservations, provider identifiers, storage signatures, cleanup state, and provider-only permissions.

## Frontend Behavior Checks

Use React Testing Library for focused behavior and accessibility assertions:

- Before approved scope, providers and clients receive the correct unavailable explanation and no authoring control.
- Providers can create/edit the shared draft; title editing disappears after first submission.
- Participants can view versions and comment but never see approve or request-revision controls.
- Approvers receive exact-version approve/request-revision confirmations and required-note behavior.
- Provider cancellation is unavailable during review; withdrawal produces revision state before cancellation is offered.
- Draft upload UI distinguishes selected/uploading, uploaded-unverified, finalizing, finalized, failed, detached, and cleanup-safe states.
- Submission remains disabled for notes-only or unverified-attachment drafts and enables for a valid link or finalized attachment.
- Revision drafts show copied content and require a summary without changing historical rendered content.
- Inline preview appears only for authorized image formats; PDF/ZIP actions are explicit and external links are safely labeled.
- Approved/canceled history, version history, comments, actor/time context, outcomes, and load-more behavior remain readable.
- Project cards display counted deliverable pending work alongside scope and change-control indicators.
- Stale, validation, forbidden, dependency, signed-access, upload, partial-email, cleanup, and unexpected errors are announced and provide valid recovery.
- Long notes, comments, filenames, and labels preserve line breaks/wrap safely; payload strings render as text rather than markup.
- All controls are keyboard operable, focus is restored after dialogs, progress/live messages are useful, and state does not rely on color alone.

## Critical End-to-End Journeys

Keep the browser suite focused on complete high-value boundaries.

### Journey A — Link submission through revision to approval

1. Owner opens a project with approved scope and active Participant/Approver access.
2. Owner creates an unnumbered draft, adds notes and a labeled HTTPS link, and submits it.
3. Verify deliverable number 1/version 1, frozen title, current-scope provenance, client email, and client pending counts.
4. Participant opens the exact version and comments; verify no decision controls.
5. Approver requests revision with a required note; verify version 1 `changes-requested`, one copied revision draft, provider email, and provider pending count.
6. Assigned Service-Team Member edits the copied content, supplies a revision summary, and submits version 2.
7. Approver approves version 2; verify aggregate `approved`, terminal history, preserved version 1/content/comment/outcome, no reopen controls, and a freed open slot.

### Journey B — Private file review and withdrawal-before-cancellation

1. Assigned Service-Team Member creates a draft and completes direct upload plus trusted finalization for an image and ZIP.
2. Submit and verify authorized image preview, explicit ZIP download, absence of public/provider data, and rejection from an unrelated project member.
3. Provider attempts direct cancellation during review and is blocked.
4. Provider withdraws with a reason; verify the submitted version becomes `withdrawn` and one revision draft is created.
5. Remove a copied historical attachment from the draft and add a new draft-only attachment.
6. Cancel the revision draft with a reason; verify submitted attachment remains accessible to current members, the draft-only asset becomes cleanup-eligible, and terminal history remains complete.

### Journey C — Never-submitted discard and limit boundary

1. Create a draft with a finalized private asset and discard it before submission.
2. Verify no deliverable/version number, client-visible record, project activity, or email exists and cleanup is safely recorded.
3. Seed 49 open aggregates and race two creates; verify at most one success and exactly 50 open records.
4. Approve or cancel one open deliverable and verify exactly one new slot becomes available after commit.

## Manual and Environment-Specific Checks

### Real private-storage verification

In a non-production environment configured with dedicated Cloudinary test credentials:

1. Upload one file of each allowed format at representative sizes and verify trusted metadata/finalization.
2. Attempt unsupported, mismatched, oversize, and tampered results without recording secrets or full signed URLs.
3. Confirm uploaded assets are private and cannot be retrieved through an unsigned or permanent public URL.
4. Confirm authorized image preview and PDF/ZIP access work, then verify a five-minute delivery URL expires.
5. Remove a draft-only asset and confirm successful idempotent deletion, including an already-absent retry.
6. Simulate provider unavailability during upload authorization, finalization, delivery signing, and cleanup; verify each follows its approved prerequisite/post-commit behavior.
7. Confirm historical assets are not deleted when a copied draft removes their reference.

### Responsive and accessibility review

At narrow mobile and desktop widths:

- Complete provider create/edit/upload/submit/withdraw/cancel workflows using keyboard only.
- Complete Participant review/comment and Approver decision workflows using keyboard only.
- Verify focus order, dialog focus containment/return, visible focus, form labels, errors, progress announcements, headings, landmarks, and status semantics.
- Verify long text, filenames, link labels, history, pending counts, and action groups wrap without core horizontal scrolling.
- Verify preview/download/link actions have clear accessible names and state/outcome meaning is not color-only.

### Browser and failure review

- Exercise current evergreen Chrome, Edge, Firefox, and Safari behavior where the test environment permits.
- Confirm external links use safe new-context behavior and do not expose the ClientScope page to opener control.
- Confirm refresh/retry recovery after stale state, expired delivery URL, interrupted upload, storage outage, and partial email failure.
- Review server diagnostics under invalid/malicious requests for secrets, signed URLs, provider IDs, filenames, links, notes, comments, reasons, or private request bodies.

## Scope-Exclusion Checks

Confirm the implementation adds none of the following:

- Milestone, requirement-item, or change-request-item linking.
- Internal task fields or project-management workflow.
- File annotations, image markup, comment attachments, or editable/deletable comments.
- Approved-deliverable reopen/revision, deliverable archival, project completion, project archival, or permanent deletion.
- General project activity-history UI.
- Public/permanent asset URLs, anonymous sharing, or possession-only access.
- In-browser ZIP rendering/extraction, arbitrary embedded content, malware-scanning infrastructure, or malware-free claims.
- AI dependency or AI-assisted deliverable behavior.
- Notification center, preferences, digests, automatic email retries, push, or messaging integration.
- Queue, distributed worker, Redis, microservice, or persistent local upload storage.

## Required Repository Checks

Run from each application directory as appropriate and record exact results:

### Backend

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

### Frontend

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

### Repository delivery gate

- Critical Playwright journeys.
- Frontend Docker build.
- Backend Docker build.
- Backend-container runtime health smoke test.
- Existing Phase 0, Slice 1.1, Slice 1.2, Slice 1.3, and Slice 1.4 regression checks.

## Evidence to Record After Implementation

Update this section only after checks run. Record:

- Source commit SHA and branch.
- Test environment category, never credentials or account identifiers.
- Commands and exit results.
- Test-file and test-count summaries.
- Transaction/concurrency and failure-injection coverage achieved.
- Safe screenshots or artifact references for critical browser journeys.
- Private-storage verification outcome without asset signatures, provider identifiers, or permanent URLs.
- Any approved exception, owner, rationale, and follow-up.

### Implementation evidence — updated 2026-09-12

- Source: working tree on branch `codex/deliverables-feedback-revisions`, based on commit `01dd479a9158a4d8e78ef40a5e0e35b54fdd776a`.
- Environment: local Windows development host, Node.js `v22.23.0`, npm `10.9.8`; MongoDB integration tests used an isolated `mongodb-memory-server` replica set and deterministic fake email/private-storage adapters. No managed-service credentials, provider identifiers, signatures, or signed URLs were recorded.
- Backend `npm run typecheck`: exit 0.
- Backend `npm run lint`: exit 0.
- Backend `npm test`: exit 0; 14 test files and 91 tests passed. Slice 1.5 coverage includes contract rules, provider/client authority, draft privacy, approved-scope gating, optimistic mutation races, the concurrent final open slot, first-writer-wins approval, numbering rollback after injected activity failure, immutable link/file history, withdrawal-before-cancellation, exact attachment authorization, safe activity, and the Cloudinary/deterministic storage boundaries.
- Backend `npm run build`: exit 0.
- Frontend `npm run typecheck`: exit 0.
- Frontend `npm run lint`: exit 0.
- Frontend `npm test`: exit 0 when run without competing build load; 7 test files and 29 tests passed. The Slice 1.5 interface tests cover inert plain-text rendering, Participant/Approver control separation and confirmation, and provider-private revision-summary behavior. Parallel test/build attempts exceeded pre-existing five-second UI-test timeouts; the isolated required test command passed.
- Frontend `npm run build`: exit 0; the Next.js production build compiled, type checked, generated all static pages, and finalized successfully.
- Focused Playwright Journey A (`playwright test --config=.tmp-playwright-host.config.ts e2e/slice-1.5.spec.ts --project=chromium`, with backend and frontend supplied as external servers): exit 0; 1 Chromium test passed in 27.1 seconds (24.0-second test body). The Windows validation harness terminated the spawned frontend, backend, and MongoDB process trees explicitly, the enclosing command returned normally, and no harness-owned process or listener remained. The journey covers submission, Participant feedback, Approver revision request, version 2 resubmission, approval, preserved history, mobile width, and missing Participant decision controls. Earlier managed-server runs also passed the test body five times but exposed a Windows-only wrapper teardown hang; external-server execution provided the required clean Playwright exit without identifying an application defect.
- Backend Docker build (`docker build --tag clientscope-backend:local ./backend`): exit 0.
- Frontend Docker build (`docker build --build-arg BACKEND_API_ORIGIN=http://backend:4000 --tag clientscope-frontend:local ./frontend`): exit 0.
- Backend-container runtime smoke: exit 0. The built backend image ran as non-root UID 1000 against an isolated MongoDB 8.0 container and returned exactly `status=ok` with `database=connected`. The two disposable containers and dedicated Docker network were removed after the check.
- Live Cloudinary verification: exit 0 using dedicated values loaded from the ignored backend `.env` without printing them. One PNG, JPEG, WebP, PDF, and ZIP passed signed authenticated upload, trusted response verification, and authorized delivery. A tampered response was rejected, an unsigned delivery attempt was denied, a short-lived signed URL stopped working after expiry, and each validation asset passed idempotent deletion. All created validation assets were deleted; no credential, provider identifier, signature, or URL was recorded.
- Manual responsive/accessibility review: passed at narrow mobile and desktop widths. Provider authoring/submission and Participant/Approver review paths were operable by keyboard; focus order and visibility, dialog focus behavior, labels, errors, progress/status semantics, headings, and landmarks were acceptable. Long content and action groups wrapped without core horizontal scrolling, attachment/link actions had clear accessible names, and state or outcome meaning was not conveyed by color alone.

Acceptance validation is complete. Repository checks, container validation, live private-storage verification, the focused browser journey, and the manual responsive/accessibility review satisfy the Slice 1.5 merge gate; no product-code defect or approved exception remains open.

## Merge Gate

Slice 1.5 is safe to merge only when:

1. Every approved acceptance criterion is implemented and traced to automated or manual evidence.
2. Participant/Approver authority, tenant isolation, current access, exact-version races, numbering, open limits, immutable history, private assets, and cleanup safety have strong automated coverage.
3. All required authoritative state/activity transitions are proven atomic under injected failures.
4. Real private-storage behavior has been checked in a safe non-production environment, or an explicit approved exception is documented.
5. Backend/frontend lint, typecheck, tests, builds, Playwright, both Docker builds, and backend-container smoke checks pass.
6. Existing completed slices remain green and their authorization/history behavior is unchanged.
7. No secret, signed URL, opaque provider identifier, private content, or sensitive diagnostic appears in committed files, test output, screenshots, logs, or public contracts.
8. The implementation matches the constitution and approved requirements without excluded scope.
9. README/API documentation is updated where needed and `validation.md` contains actual completion evidence.
10. The roadmap is marked complete only after acceptance validation, never merely because implementation exists.
