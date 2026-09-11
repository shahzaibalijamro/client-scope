# Slice 1.5: Deliverables, Feedback, and Revisions Requirements

**Status:** Approved — 2026-09-11

## Outcome

After scope is approved, authorized providers can submit concrete client work as named deliverables containing private files, external links, and supporting notes. Clients can review the exact submitted version, discuss it, and an authorized Client Approver can either approve it or request a revision. Every submitted version, comment, review outcome, and significant provider action remains attributable and historically visible.

A deliverable represents a client-reviewable unit of work. It is not a milestone, requirement, internal task, change request, project-completion decision, or general-purpose file repository.

## Scope

### Included

- Stable project-scoped deliverables with provider-private drafts and immutable numbered submitted versions.
- Independent deliverable aggregate states and submitted-version outcomes.
- Version-specific notes, revision summaries, external links, and private stored attachments.
- Provider-neutral private-asset storage backed initially by Cloudinary.
- Plain-text review comments on the exact submitted version.
- Client Approver decisions to approve or request revision.
- Provider withdrawal, never-submitted draft discard, and preserved cancellation after submission.
- Project-scoped and per-deliverable numbering that is allocated atomically and never reused.
- Role-aware pending-work counts and transactional email for review requests and client decisions.
- Immutable activity for significant shared actions.
- Responsive, accessible provider authoring and client review experiences.

### Excluded

- Required or optional links from deliverables to milestones, individual requirements, or change-request items.
- Internal tasks, assignees, priorities, backlogs, boards, percentages, scheduling, or time tracking.
- File-level annotations, image markup, comment attachments, comment editing, or comment deletion.
- Approved-deliverable reopening, superseding approved versions, or later revisions of an approved deliverable.
- General project activity-history UI, project completion, project archival, or permanent project deletion.
- Deliverable archival distinct from terminal approval or cancellation.
- Public or permanent asset URLs, anonymous sharing, or access based only on possession of a URL.
- Rich text, Markdown rendering, embedded arbitrary content, or in-browser ZIP rendering.
- Malware-scanning infrastructure or a guarantee that uploaded content is malware-free.
- Notification centers, preferences, digests, automatic email retries, push notifications, or messaging integrations.
- AI assistance, automatic feedback analysis, or autonomous decisions.
- New queues, distributed workers, Redis, microservices, or persistent local file storage.

## Domain Model and Terminology

### Deliverable aggregate

A deliverable is the stable logical identity reviewed across one or more versions. It records:

- Workspace and project identifiers.
- An internal immutable identifier.
- An optional project-scoped deliverable number, absent until first successful submission.
- A title of 1–120 trimmed plain-text characters.
- One aggregate state: `draft`, `in-review`, `revision-draft`, `approved`, or `canceled`.
- Creator identity, display-name snapshot, provider-role snapshot, and creation time.
- The current mutable draft identifier when one exists.
- The current in-review version identifier when one exists.
- The terminal actor, time, and cancellation reason where applicable.
- Monotonic aggregate revision state needed for safe transitions.

Titles do not have to be unique. The internal identifier and allocated project number identify the deliverable. The title may change while the deliverable has never been submitted. The first successful submission freezes it permanently across all later revision versions and terminal history.

### Deliverable draft

A deliverable has at most one mutable provider draft. A draft records:

- The parent deliverable and project identifiers.
- An opaque optimistic revision token.
- Optional copied-from version provenance.
- Optional version notes of at most 5,000 trimmed plain-text characters.
- A revision summary of 1–2,000 trimmed plain-text characters when preparing version 2 or later.
- An ordered set of at most ten valid external links.
- An ordered set of at most ten finalized private-asset references.

The initial draft has no version number. A copied revision draft also has no next version number until submission succeeds. Draft creation, ordinary editing, link changes, attachment finalization, and draft attachment removal are provider-private and create no project activity.

### Submitted version

Each successful submission creates one immutable version beneath its deliverable. A submitted version records:

- A monotonically increasing positive version number unique within the deliverable.
- Outcome `in-review` while active, followed by exactly one terminal outcome: `changes-requested`, `withdrawn`, or `approved`.
- The frozen deliverable title snapshot.
- Immutable notes, revision summary where required, ordered links, and ordered attachment references.
- The exact current approved-scope version identifier and number at submission time.
- Submitter identity, display-name snapshot, effective provider-role snapshot, and submission time.
- Terminal actor identity, display-name snapshot, effective role snapshot, time, and required or optional note as defined below.
- Immutable comments attached to that exact version.

Aggregate state and version outcome are separate concepts. For example, a version may end `changes-requested` while its deliverable aggregate becomes `revision-draft`; a version may end `withdrawn` while its aggregate also becomes `revision-draft`; and a version may end `approved` while its aggregate becomes `approved`.

### External link

Each version link has an immutable internal identifier, label, normalized URL, and manual order. A label is 1–120 trimmed plain-text characters. A URL is at most 2,048 characters and must use HTTPS, contain no embedded credentials, and must not target localhost, loopback, link-local, private-network, or reserved address space. ClientScope does not fetch or copy external-link content. Links open as clearly identified external destinations.

### Private asset and attachment reference

The storage boundary owns provider-specific operations. Domain records describe a private stored asset using an internal asset identifier, opaque provider identifier, original filename, verified media type, verified byte size, creation/finalization timestamps, and lifecycle state. Cloudinary-specific request fields, signatures, URLs, resource types, and deletion responses do not become deliverable business concepts or public deliverable contracts.

A draft or submitted version refers to an asset through an ordered attachment reference. A submitted attachment reference and its displayed metadata are immutable. The same private asset may be referenced by historical submitted versions and a copied revision draft without duplicating the external file.

Allowed verified formats are:

- PDF (`application/pdf`).
- PNG (`image/png`).
- JPEG (`image/jpeg`).
- WebP (`image/webp`).
- ZIP (`application/zip`).

Each file is at most 25 MiB (26,214,400 bytes), and each draft or submitted version may reference at most ten files. Original filenames are required, sanitized for display and download, and limited to 255 characters. SVG, HTML, executable content, and every unlisted or indeterminate type are rejected.

### Review comment and outcome

A comment records the exact project, deliverable, and submitted-version identifiers; immutable body; author identity, display-name snapshot, effective project-role snapshot; sequence; and post time. Comment bodies contain 1–2,000 trimmed plain-text characters.

An Approver review outcome records `approved` or `changes-requested`, the exact submitted version, actor snapshots, and decision time. Approval may include an optional note up to 2,000 characters. A revision request requires an actionable note of 1–2,000 characters. Provider withdrawal is an immutable provider outcome, not a client decision, and requires a reason of 1–2,000 characters.

### Cleanup work

Cleanup work records an internal asset identifier, opaque provider identifier, reason, idempotency identity, attempt state, safe retry metadata, and completion time. It contains no public delivery URL or secret. Cleanup work is operational metadata, not project activity or client-visible deliverable history.

## State Model

### Aggregate states

| State | Meaning | Mutable draft | Current review | Terminal |
| --- | --- | --- | --- | --- |
| `draft` | Never submitted; provider preparation only | Yes | No | No |
| `in-review` | One immutable submitted version awaits an Approver decision | No | Yes | No |
| `revision-draft` | Submitted history exists and providers are preparing a later version | Yes | No | No |
| `approved` | An Approver approved the final submitted version | No | No | Yes |
| `canceled` | Providers ended a previously submitted deliverable with preserved history | No | No | Yes |

Only `draft`, `in-review`, and `revision-draft` count toward the project maximum of 50 open deliverables. `approved` and `canceled` do not count toward that limit.

### Valid transitions

1. Create initial draft: no aggregate -> `draft`.
2. Submit initial draft: `draft` -> `in-review`, creating version 1 and allocating the deliverable number.
3. Approver requests revision: `in-review` -> `revision-draft`; the reviewed version becomes `changes-requested`, and exactly one copied draft is created.
4. Provider withdraws review: `in-review` -> `revision-draft`; the reviewed version becomes `withdrawn`, and exactly one copied draft is created.
5. Submit later draft: `revision-draft` -> `in-review`, creating the next version.
6. Approver approves: `in-review` -> `approved`; the reviewed version becomes `approved`.
7. Cancel preserved work: `revision-draft` -> `canceled`, removing the mutable draft while retaining submitted history.
8. Discard never-submitted work: `draft` -> no aggregate record.

No other transition is valid. In particular, `in-review` cannot transition directly to `canceled`; the current version must first be withdrawn. `approved` and `canceled` have no outgoing transition in this slice.

## Business Rules

### Availability and open limit

1. A provider may create a deliverable only when the project has a current approved scope at authoritative transaction time.
2. Deliverables remain independent of milestones and individual scope items. An open change request does not block deliverable work while a current approved scope exists.
3. The project may contain at most 50 aggregates whose state is `draft`, `in-review`, or `revision-draft`.
4. The open count is enforced inside the creation transaction against authoritative state. Concurrent creates cannot commit a fifty-first open deliverable.
5. Approval or cancellation frees an open slot only when its complete terminal transaction commits.
6. Terminal history is never pruned because of the open limit.

### Draft collaboration and privacy

1. The Workspace Owner and active assigned Service-Team Members share read and mutation authority over the one current draft.
2. A draft and its links, notes, revision summary, attachments, upload state, and revision token are completely hidden from client roles.
3. A client may see a previously submitted deliverable is in `revision-draft`, its submitted history, and its client-visible outcome context, but never the copied mutable draft.
4. Every draft mutation supplies the last-read opaque revision token. A material successful mutation advances it. A stale mutation applies no partial change and tells the provider to refresh.
5. A no-op edit returns an explicit unchanged result or validation response and does not advance revision state.

### Submission, scope provenance, and numbering

1. Either authorized provider role may submit the current draft.
2. Submission requires:
   - Current provider authority.
   - Aggregate state `draft` or `revision-draft` with the exact current draft and revision token.
   - A current approved scope.
   - At least one active Client Approver for the project.
   - At least one finalized valid attachment or valid external link.
   - No pending, incomplete, failed, expired, unverified, foreign-project, foreign-draft, detached, or cleanup-pending attachment reference.
   - A valid revision summary for version 2 or later.
3. First successful submission atomically allocates the next monotonically increasing project-scoped deliverable number and version 1. Draft creation and failed submission consume neither number.
4. Every later successful submission atomically allocates the next version number beneath that deliverable. The deliverable number never changes.
5. Versions that later become `changes-requested` or `withdrawn` retain and consume their version numbers. Deliverable and version numbers are never reused after any successful submission or terminal outcome.
6. Submission snapshots all version content and the exact current approved-scope identifier and number, removes the mutable draft, moves the aggregate to `in-review`, and creates required activity in one transaction.
7. The first successful submission freezes the logical title. Later drafts cannot edit it.
8. A submitted version is immutable immediately after commit. Later drafts and submissions create new records rather than changing it.

### Review comments

1. Every currently active project role may post a plain-text comment while the exact submitted version remains `in-review`.
2. Client Participant comment authority does not include approval or formal revision-request authority.
3. Comments apply to the complete exact version. There are no attachment-, link-, region-, or annotation-level targets.
4. Comments have no edit or delete operation and remain readable after every terminal version or aggregate outcome.
5. A comment racing a terminal action succeeds only if it atomically commits while that exact version remains `in-review`; otherwise it fails safely as stale.
6. Comment creation and required activity commit together or not at all.

### Approver decisions

1. Only a currently active Client Approver for the exact project may approve or request revision.
2. A Client Participant may never make either formal decision, even if that user commented, received a review email, or previously held Approver authority.
3. Approval requires explicit confirmation against the exact deliverable and current in-review version. Its note is optional.
4. Requesting revision requires explicit confirmation and a nonblank actionable note against the exact current in-review version.
5. The first valid Approver decision that atomically claims the in-review version wins. A concurrent or repeated decision fails as stale and creates no second outcome, copied draft, activity, or email.
6. Approval atomically records the immutable outcome and actor context, changes the aggregate to `approved`, removes the current-review reference, and creates activity.
7. Revision request atomically records the immutable `changes-requested` outcome and actor context, changes the aggregate to `revision-draft`, creates exactly one copied draft, removes the current-review reference, and creates activity.
8. The copied draft begins from the reviewed version's notes, links, and attachment references. Providers may edit that draft without altering the submitted source version.

### Withdrawal, discard, and cancellation

1. Either currently authorized provider role may withdraw the exact current in-review version with explicit confirmation and a required reason.
2. Withdrawal races decisions and comments under the same exact-version state boundary. It succeeds only while the exact version remains `in-review`.
3. Successful withdrawal atomically marks that version `withdrawn`, records actor/time/reason, changes the aggregate to `revision-draft`, creates exactly one copied draft, clears the current-review reference, and creates activity.
4. Either provider role may confirm-discard a never-submitted `draft`. Discard removes the unnumbered aggregate and draft, creates no submitted history or project activity, and consumes no number.
5. An aggregate with a deliverable number or any submitted version can never use discard.
6. Either provider role may cancel only from `revision-draft`, with explicit confirmation and a required reason.
7. An in-review deliverable cannot be canceled directly. A provider must first withdraw the current review, preserving the submitted version as `withdrawn`, and then cancel the resulting revision draft.
8. Cancellation atomically removes only the mutable draft, changes the aggregate to terminal `canceled`, records actor/time/reason and activity, and retains all submitted versions, comments, outcomes, numbering, scope provenance, and historical attachment references.
9. Approved deliverables cannot be discarded, canceled, withdrawn, reopened, or revised.

### Historical immutability and copied content

1. Submitted notes, revision summaries, links, attachment references, verified attachment metadata, comments, outcomes, actor snapshots, scope provenance, numbering, and timestamps never change through ordinary application operations.
2. Copying a submitted version into a revision draft creates mutable draft content or references; it does not transfer mutability to the source version.
3. Removing, reordering, or replacing a draft attachment or link never changes the earlier submitted version.
4. Removing a historical project member does not rewrite actor snapshots. Historical participation never grants current access.
5. Current project members may read submitted history even if they joined after submission. Former, removed, inactive, or unassigned users have no continuing access.

## Roles and Permissions

| Capability | Workspace Owner | Active assigned Service-Team Member | Active Client Participant | Active Client Approver |
| --- | --- | --- | --- | --- |
| View submitted versions and terminal history | Yes | Yes | Yes | Yes |
| Access authorized submitted attachments | Yes | Yes | Yes | Yes |
| View current provider draft | Yes | Yes | No | No |
| Create, edit, or discard never-submitted draft | Yes | Yes | No | No |
| Authorize/finalize/remove draft uploads | Yes | Yes | No | No |
| Submit a version | Yes | Yes | No | No |
| Comment on exact in-review version | Yes | Yes | Yes | Yes |
| Approve exact in-review version | No | No | No | Yes |
| Request formal revision | No | No | No | Yes |
| Withdraw exact in-review version | Yes | Yes | No | No |
| Cancel from `revision-draft` | Yes | Yes | No | No |
| Reopen or revise approved deliverable | No | No | No | No |

Rules:

1. Workspace Owner access remains implicit through workspace ownership.
2. A Service-Team Member requires active workspace membership and active assignment to the exact project.
3. A client role requires active membership in the exact project.
4. Current access, role, aggregate state, exact version, approved-scope prerequisite, and Approver availability are re-evaluated within the authoritative mutation boundary where relevant.
5. Stale UI, an unexpired session, prior access, actor snapshots, or membership elsewhere never grants authority.
6. Cross-workspace and cross-project reads, mutations, asset references, and access requests use established safe not-found and anti-enumeration behavior.
7. Client response projections omit drafts, draft revisions, upload claims, provider identifiers, cleanup metadata, storage signatures, and provider mutation tokens.

## Private-Asset Storage and Cleanup

### Storage abstraction

1. Domain and application logic depend on a small private-asset storage interface for signed upload authorization, trusted finalization verification, short-lived authorized delivery, and idempotent deletion.
2. Cloudinary is the initial adapter. Provider-specific credentials, signatures, response shapes, and errors remain inside that adapter and server-only configuration.
3. MongoDB stores authoritative application metadata and references; uploaded bytes are never stored in MongoDB or the local application filesystem.
4. Tests use an injected deterministic fake adapter and do not depend on external Cloudinary access.

### Upload and finalization

1. Only an authorized provider editing the exact current draft may request a short-lived, narrowly scoped direct-upload authorization.
2. The server issues an unpredictable internal reservation and provider identifier restricted to that workspace, project, deliverable draft, allowed type, maximum size, and private storage mode.
3. Browser upload completion alone does not attach or trust an asset. Finalization must present the server-issued reservation and provider result for backend verification through the storage abstraction.
4. Finalization verifies ownership, draft identity, expiration, provider identity, private access, byte size, allowed declared type, and trusted detected type before recording the asset and attaching it to the exact current draft.
5. A reservation is single-use. Replayed, expired, tampered, foreign, already-finalized, or mismatched results fail safely.
6. Finalization and attachment of verified metadata use the current draft revision token and enforce the ten-file limit atomically. A stale or over-limit finalize does not attach the uploaded asset and makes an otherwise unreferenced verified asset eligible for cleanup.
7. Submission never calls the external storage provider inside the database transaction. It accepts only already finalized authoritative asset records that still reference the exact draft.

### Access and rendering

1. Every attachment access request rechecks current project membership and exact submitted-version association before asking storage for a signed delivery URL.
2. Signed delivery URLs expire after five minutes and are never persisted in domain records, activity, logs, or frontend cache beyond their useful lifetime.
3. PNG, JPEG, and WebP may use authorized inline preview delivery. PDF and ZIP use explicit signed open/download actions. ZIP content is never rendered or extracted by ClientScope.
4. Filenames and metadata are escaped as data. Non-preview downloads use safe content-disposition behavior and cannot supply executable application markup.
5. Failure to create a delivery URL or retrieve a committed asset returns a recoverable error without changing or deleting historical metadata.

### Reference-safe cleanup

1. A submitted or historical attachment is never a cleanup candidate merely because a later draft removes or replaces it.
2. Detaching an asset from a draft first removes only that draft reference. The system checks authoritative draft and submitted-version references before cleanup eligibility is recorded.
3. An asset becomes cleanup-eligible only when no authoritative draft or submitted-version reference remains.
4. Discard and cancellation apply the same reference check to every removed draft attachment.
5. Authoritative draft detachment, discard, or cancellation commits without waiting for provider deletion. A cleanup record is persisted atomically whenever an unreferenced stored asset requires deletion.
6. Cleanup uses a stable idempotency identity, treats already-absent provider assets as success, and can be retried through bounded opportunistic processing or an explicit maintenance command without queue or worker infrastructure.
7. Cleanup failure records safe retry state and diagnostics. It never restores a draft reference, exposes the asset through the application, rolls back the completed deliverable action, or corrupts submitted history.

## Activity History

This slice persists project-shared immutable activity for:

- First or later deliverable-version submission.
- Review comment posting, without duplicating the comment body.
- Approver approval.
- Approver revision request.
- Provider withdrawal.
- Cancellation of a previously submitted deliverable.

Activity identifies the workspace, project, deliverable, allocated deliverable number where available, exact version where applicable, actor and role snapshots, action time, and safe outcome context. It may include scope-version provenance, but not file bytes, signed URLs, provider identifiers, cleanup data, comments, version notes, decision notes, external-link targets, credentials, or unnecessary personal data.

Required domain and activity records commit together or not at all. Never-submitted draft creation/edit/discard, upload authorization/finalization, draft attachment/link changes, attachment access, and cleanup attempts create no project activity. The general activity-history interface remains deferred to Slice 1.6; deliverable-specific history exposes the records required here.

## Pending Work and Transactional Email

### Pending work

1. Project summaries add a separate deliverables summary without replacing existing scope or change-control summaries.
2. An active Client Participant sees `review-requested` with the number of deliverables currently `in-review` that the participant may view and comment on.
3. An active Client Approver sees `decision-required` with the number of deliverables currently `in-review` on which the approver may decide.
4. An authorized provider sees `revision-required` with the number of deliverables currently in `revision-draft`.
5. When the role-relevant count is zero, `pendingCount` is zero and no deliverable pending-action label is exposed.
6. The `Your work` project card shows the deliverable badge and count alongside any scope and change-control indicators rather than choosing one workflow by precedence.
7. Pending state is derived from current authoritative aggregates and current access. Email delivery state never controls it.

### Transactional email

1. Email is attempted only after the authoritative domain transaction commits.
2. Successful submission attempts one deduplicated email to every active Client Participant and Client Approver for the exact project.
3. Successful approval or revision request attempts one deduplicated email to the Workspace Owner and every Service-Team Member with active workspace membership and an active exact-project assignment at recipient-resolution time.
4. Comments, provider withdrawal, discard, cancellation, draft changes, uploads, cleanup, and attachment access send no email.
5. Email contains only minimum project, deliverable number/title, version number, event, and return-path context. It excludes notes, comments, decision reasons, filenames, links, asset metadata, provider identifiers, and other members.
6. Partial or complete SMTP failure does not roll back or disguise the committed action. The actor receives one safe warning without recipient addresses or provider diagnostics.
7. There is no email queue or automatic retry. In-app state remains authoritative.

## REST and Data Boundary Requirements

The versioned REST API must expose project-scoped capabilities to:

- Read the open deliverable collection with role projection, exact current state, current submitted version, relevant permissions, open count/limit, and provider-only draft data where authorized.
- Read approved and canceled deliverables in deterministic newest-terminal-first cursor pages.
- Read one deliverable's submitted-version history and immutable comments in bounded cursor pages.
- Create and edit a provider draft, discard a never-submitted draft, and cancel a revision draft.
- Request a narrowly scoped signed upload authorization, finalize trusted upload results, and detach draft attachments.
- Submit the exact current draft.
- Post a comment on the exact in-review version.
- Approve or request revision as a Client Approver against the exact in-review version.
- Withdraw the exact in-review version as a provider.
- Request short-lived signed access to an attachment associated with an exact submitted version.

Requirements:

1. Routes remain under `/api/v1/projects/:projectId/deliverables...` and reuse established authentication, same-origin browser mutation/CSRF protection, strict Zod validation, error envelopes, safe not-found behavior, and diagnostics.
2. Request and response schemas distinguish aggregate state, submitted-version outcome, mutable draft, review outcome, and asset lifecycle. One field must never ambiguously represent more than one of these concepts.
3. Public attachment contracts expose internal attachment ID, safe filename, verified type, size, order, preview capability, and access action. They never expose provider identifiers, credentials, signatures, cleanup state, or permanent URLs.
4. Provider draft mutations require opaque optimistic revision tokens. Successful material mutations return the new token; stale requests return the established `STALE_STATE`-style conflict.
5. Comment, decision, and withdrawal operations identify the exact deliverable and submitted-version IDs. Their database conditions require that version to remain the aggregate's current `in-review` version.
6. Open-count, terminal-history, version-history, and comment reads are bounded. Cursor pages default to 20, accept limits from 1 through 50, use deterministic time-plus-identifier ordering, and expose only opaque cursors.
7. Project summaries expose an optional deliverables object with role-appropriate `pendingAction` and integer `pendingCount`; existing scope and change-control objects remain intact.
8. Exact route suffixes may follow the established router conventions, but the approved capabilities, authority, state distinctions, concurrency, privacy, and bounded-read behavior cannot change.

## Transactionality and Concurrency

1. Project-scoped counters, conditional writes, indexes, and MongoDB transactions jointly enforce unique non-reused deliverable numbers, unique version numbers within a deliverable, one mutable draft, one current in-review version, and at most 50 open aggregates.
2. Draft creation conditionally checks current provider authority, current approved scope, and the open limit before creating an unnumbered aggregate and draft.
3. Submission atomically validates the exact draft and finalized attachments, allocates required numbers, snapshots version content and scope provenance, removes the draft, changes aggregate state, and creates activity.
4. Approver decision atomically claims the exact in-review version. The first valid concurrent decision wins; every later or racing terminal request fails without partial state.
5. Revision request and withdrawal atomically close the exact version, update aggregate state, create exactly one copied draft, and write activity.
6. Cancellation atomically removes the revision draft, records cleanup work for newly unreferenced assets, changes aggregate state, and writes terminal activity while retaining history.
7. Comment creation conditionally commits only while the exact version remains in review and commits with activity.
8. Current membership and role are rechecked within significant mutation transactions. Removal, unassignment, inactivity, or role change before commit wins over stale UI or session state.
9. A failure in validation, authorization, counters, version persistence, attachment-reference checks, outcome persistence, copied-draft creation, aggregate transition, cleanup-record persistence, or activity persistence rolls back the complete authoritative transition.
10. Direct upload, signed delivery, cleanup deletion, and email occur outside MongoDB transactions. Their failures follow the explicit prerequisite and post-commit rules rather than pretending to be atomically coupled to database state.

## Validation and Failure Behavior

1. All identifiers, revision tokens, states, outcomes, strings, arrays, limits, cursors, confirmation values, links, filenames, media types, byte sizes, upload reservations, and provider claims receive strict boundary validation.
2. Plain-text fields are trimmed. Required blank values fail validation; optional blank notes become absent.
3. Version 1 does not require a revision summary. Version 2 and later require a 1–2,000 character summary.
4. Submission rejects notes-only drafts and requires at least one valid finalized file or valid link.
5. Duplicate link or attachment identifiers within one draft are rejected. Ordering must be complete, unique, and within the ten-item limit.
6. Client-supplied media type, extension, size, provider identifier, or upload-success claims are never trusted without server-side finalization verification.
7. Type validation checks allowed extension, declared type, and trusted detected/provider metadata consistently. Mismatch or indeterminate content fails closed.
8. Invalid, expired, replayed, cross-project, cross-draft, detached, cleanup-pending, or unverified assets cannot be submitted or accessed.
9. Unknown, archived-project behavior from later slices, foreign-project resources, terminal versions, and stale transitions fail safely without revealing private existence.
10. Storage failure before required upload verification prevents finalization or submission while preserving the editable draft. Storage failure after an authoritative commit returns a recoverable access/cleanup error and does not rewrite history.
11. Email failure returns the established safe warning after commit and never changes pending state or outcome.
12. Unexpected failures use structured safe diagnostics without cookies, CSRF values, signed URLs, provider credentials/identifiers, upload claims, private content, filenames, external URLs, decision notes, or request bodies.

## Project Experience

1. The project page presents deliverables separately from scope, change requests, and milestones and explains that deliverables are concrete items awaiting client review.
2. Before approved scope, all roles see an unavailable state; providers are told approved scope is required.
3. Providers see shared drafts and draft controls. Clients never see a never-submitted deliverable or mutable draft content.
4. Open deliverables clearly distinguish provider draft, awaiting review, and revision-in-progress states. Terminal approved/canceled history is separate and newest first.
5. Submitted-version history shows deliverable/version numbers, submitter, scope-version provenance, notes, revision summary, links, attachments, comments, outcome, and actor/time context.
6. Client Participants see review content and comment controls only. Client Approvers additionally see approve and request-revision controls with clear confirmation of the exact version.
7. Providers can withdraw the exact review. The UI makes clear that cancellation requires withdrawal first and preserves all submitted history.
8. Draft attachment UI distinguishes uploading, uploaded-but-unverified, finalizing, finalized, failed, detached, and cleanup-pending states. Only finalized draft attachments count toward submission readiness.
9. Images may preview inline only through authorized short-lived access. PDF and ZIP use explicit open/download actions; external links are clearly labeled and open safely.
10. Loading, empty, upload progress, stale, success, validation, forbidden, dependency-unavailable, partial-email-warning, and unexpected-error states provide safe retry or refresh paths.
11. Long plain text preserves line breaks and wraps without horizontal scrolling. Filenames and URLs cannot break narrow layouts.
12. The deliverable pending badge and count remain separate from existing scope and change-control indicators.

## Accessibility and Responsive Behavior

1. Every field, file input, link editor, decision note, and cancellation/withdrawal reason has a programmatic label and associated validation message.
2. Draft editing, file selection, upload/finalization, attachment/link reordering and removal, submission, comments, decisions, withdrawal, cancellation, history pagination, preview, and download are keyboard usable.
3. Drag and drop may supplement but cannot replace a labeled file input or keyboard-operable ordering controls.
4. Confirmation surfaces identify the exact deliverable and version, describe the historical effect, trap/manage focus appropriately, and restore focus meaningfully.
5. Upload progress, finalization, stale conflicts, pending actions, successful updates, warnings, and errors are announced through suitable live semantics without excessive repetition.
6. State, outcome, file type, and pending-action meaning never rely on color alone.
7. The provider draft and client review experience requires no horizontal scrolling for core content or actions on supported mobile widths.

## Acceptance Criteria

1. Deliverables cannot be created before approved scope, and open change control does not independently disable them afterward.
2. Owner and active assigned team members can share one private draft; neither client role can access any draft content or upload state.
3. First successful submission requires an active Approver plus a finalized file or valid link, allocates the project deliverable number and version 1 atomically, freezes the title, and snapshots current approved-scope provenance.
4. Later submissions allocate increasing per-deliverable version numbers, require revision summaries, and never reuse numbers consumed by changes-requested or withdrawn versions.
5. Aggregate states and submitted-version outcomes remain distinct and follow only the approved transition table.
6. Exactly `draft`, `in-review`, and `revision-draft` count toward the concurrency-safe maximum of 50 open deliverables; approved and canceled history does not.
7. Every active project role can comment on the exact in-review version, but Client Participants cannot approve or formally request revision.
8. Only a current Client Approver can approve or request revision; the first valid racing Approver decision wins and no duplicate outcome or copied draft can exist.
9. Revision request requires a note and atomically preserves `changes-requested` history plus exactly one copied revision draft. Approval is terminal and exposes no reopen, revise, cancel, or delete operation.
10. Provider withdrawal requires a reason and creates a preserved `withdrawn` version plus exactly one revision draft. Direct cancellation from `in-review` is rejected.
11. Never-submitted discard consumes no number and creates no shared history. Post-submission cancellation is allowed only from `revision-draft`, requires a reason, and retains all submitted versions, comments, outcomes, numbering, and activity.
12. Submitted notes, summaries, links, attachment references, metadata, comments, outcomes, actors, scope provenance, and times remain immutable regardless of later draft edits or membership changes.
13. Only trusted finalized assets from the exact draft can enter a version. Pending, incomplete, failed, expired, unverified, replayed, cross-project, detached, or cleanup-pending assets are rejected.
14. Private assets are accessed only after current backend authorization through five-minute signed delivery; no public URL, provider identifier, signature, or cleanup metadata enters public contracts.
15. Historical assets remain referenced when later drafts remove them. Cleanup begins only for assets with no authoritative draft or version references and is persisted, idempotent, retryable, and non-authoritative to committed deliverable state.
16. Submission emails all active client members; approval and revision-request emails current authorized providers. Recipient deduplication and SMTP failure behavior follow the approved rules.
17. Project cards show a separate role-aware deliverable pending badge and count without hiding scope or change-control work.
18. Tenant isolation, current authority, exact-version races, optimistic draft concurrency, numbering, open limits, state/history writes, and cleanup-record creation fail atomically and safely.
19. The interface is responsive, keyboard usable, semantically labeled, and provides understandable upload, preview/download, confirmation, stale, dependency, and error behavior.
20. No excluded milestone/requirement linking, annotations, comment attachments, approved-item reopening, general activity UI, AI, public asset URLs, malware infrastructure, completion, archival, or unrelated workflow is introduced.
21. Before merge, backend and frontend lint, type checking, automated tests, production builds, critical browser checks, Docker builds, and backend-container smoke validation pass.
