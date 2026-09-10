# Slice 1.3: Formal Change Control Requirements

**Status:** Approved — 2026-09-10

## Purpose

This slice gives providers and clients a formal, reviewable way to propose material changes to an approved scope without rewriting the agreement that existed before the proposal. It establishes one stable change-request record, immutable submitted proposal versions, explicit client decisions, and an atomic path from an approved proposal to the next current scope version.

## Desired Outcome

A Workspace Owner and assigned Service-Team Members can privately prepare a change request from the exact current approved scope. The owner can submit an immutable proposal version for client review. Every active project member can understand and discuss the proposed effect, while only an active Client Approver can approve it, request revisions, or reject it. Approval creates the next immutable approved scope version and preserves the prior agreement, proposal versions, comments, decisions, actors, and provenance.

## Constitutional Constraints

1. Tenant and project boundaries are enforced by the Express backend on every protected read and write.
2. Approval authority is contextual. One valid decision from a currently active Client Approver is sufficient; voting, quorum, ordered approval, and approval chains remain excluded.
3. Approved scope and submitted proposal versions are historical facts. They are never silently edited or replaced.
4. A change request is pinned to one exact approved scope version for its complete lifecycle.
5. The current approved scope remains authoritative until an approval transaction successfully creates its successor.
6. Core behavior remains fully usable without Gemini or any other AI provider.
7. In-app state is authoritative. Transactional email only directs authorized recipients back to that state.
8. The slice uses the existing TypeScript, Next.js, Express, Zod, MongoDB, Mongoose, Nodemailer, and testing boundaries. It adds no infrastructure platform or shared package.
9. This is a scope-governance record, not a contract, e-signature, invoice, payment record, or compliance-grade audit facility.

## Scope

### In scope

- One active change request per project.
- Provider-private authoring from a copy of the exact current approved scope.
- A stable request title and project-scoped request number.
- Immutable numbered proposal versions within one change request.
- Version-specific rationale, optional impact summary, target scope, revision summary, and derived comparisons.
- Material additions, removals, content changes, group moves, and group-structure changes.
- Whole-proposal client review, request-level and derived-change-item comments, and first-decision-wins outcomes.
- Approval, requested changes, rejection, provider withdrawal, never-submitted discard, and post-submission cancellation.
- Atomic creation of a successor approved scope version with supersession and change-request provenance.
- Change-request-specific history, role-aware pending-action visibility, and decision-related transactional email.
- Responsive and accessible provider authoring and client review surfaces.

### Out of scope

- Billing, prices as structured monetary data, invoicing, payments, accounting, or commercial enforcement.
- Milestones, schedules as structured project plans, internal tasks, assignments, priorities, backlogs, or boards.
- Attachments, uploaded files, supporting links, Cloudinary integration, rich text, Markdown rendering, or embedded media.
- Item-level approval, partial acceptance, voting, quorum, ordered approvers, or approval chains.
- Client-authored or client-edited provider drafts.
- Multiple active change requests or parallel proposal reviews for one project.
- Editing the base approved scope or rebasing an existing change request to a later scope version.
- General activity-history UI, notification centers, preferences, digests, retries, push notifications, or messaging integrations.
- AI structuring, analysis, summarization, or autonomous actions.
- Permanent project deletion, export, milestones, deliverables, completion, or archival behavior from later slices.

## Domain Records and Metadata Ownership

### Change request

A change request is the stable container for one proposed scope change and all of its revisions. It belongs to one workspace and project and owns:

- A stable internal identifier.
- A project-scoped request number, allocated only on the first successful submission.
- A required plain-text title.
- The exact immutable identifier and number of the approved scope version used as its base.
- Its current request-level state.
- Creator identity and display-name snapshot, creation time, and terminal context where applicable.

The title may be edited while the request is a never-submitted `draft`. The first successful submission freezes the title for the remainder of the request lifecycle. Rationale, impact, and proposed scope are not request-level metadata because they may legitimately change between proposal versions.

### Working proposal draft

A working proposal draft is the only editable representation inside a change request. It is provider-private, unnumbered, and carries an opaque optimistic revision token. It contains:

- The editable request title only while the request has never been submitted.
- A required rationale.
- An optional impact summary.
- A complete target scope copied from the fixed base or the immediately preceding submitted proposal version.
- The identifier of the proposal version it was copied from, when applicable.
- A revision summary field that may be edited freely but is required only when submitting proposal version 2 or later.

The target scope is the desired complete result, not a mutable copy of any historical scope record. Editing it never changes the base scope or a submitted proposal.

### Submitted proposal version

Each successful submission creates one immutable proposal version within its change request. It owns a monotonically increasing version number and snapshots:

- The request title as displayed at submission time.
- The review-facing rationale.
- The optional impact summary.
- The complete proposed target groups and requirements.
- The required revision summary for version 2 and later.
- The exact fixed base approved-scope identifier and number.
- Immutable derived comparison items for total effect against the base scope.
- Immutable derived comparison items for changes since the immediately preceding submitted proposal version, when one exists.
- Submitter identity, display-name and role snapshots, submission time, terminal outcome, terminal actor context, comments, and decision/withdrawal context.

Only successful submissions receive proposal-version numbers. Terminal proposal-version numbers are never reused.

### Derived change item

A derived change item is an immutable, system-derived description of one material difference in one submitted proposal comparison. Each item records:

- A proposal-local immutable change-item identifier.
- Comparison kind: `base-scope` or `previous-proposal`.
- Entity kind: `group` or `requirement`.
- The stable group or logical requirement identity where present.
- One or more applicable change kinds.
- The relevant immutable before and after snapshots.
- Deterministic display position.

Derived items are created and persisted as part of submission so comments can remain attached to the exact item reviewed. They are not user-authored truth and cannot be edited independently of the immutable proposal version.

### Proposal decision

A proposal decision is exactly one Client Approver action against an `in-review` proposal version: `approved`, `changes-requested`, or `rejected`. It records the proposal version, outcome, note under the rules below, actor identifier, display-name and role snapshots, and decision time.

Provider withdrawal is a proposal-version terminal transition but not a client decision. Request cancellation is a request-level terminal transition performed only after submitted history exists and no proposal is in review.

## Change-Request Lifecycle

Change-request state is separate from proposal-version outcome.

| Request state | Classification | Meaning |
| --- | --- | --- |
| `draft` | Active | Never submitted, unnumbered, provider-private, and safely discardable. |
| `in-review` | Active | One exact immutable proposal version awaits a terminal transition. No editable draft exists. |
| `revision-draft` | Active | Submitted history exists and one copied provider draft awaits revision, resubmission, or cancellation. |
| `approved` | Terminal | One proposal version was approved and atomically incorporated into a successor scope version. |
| `rejected` | Terminal | One proposal version was rejected without changing approved scope. |
| `canceled` | Terminal | The owner canceled a request with submitted history while it was in `revision-draft`. |

### Active and terminal rules

1. Exactly `draft`, `in-review`, and `revision-draft` count as active.
2. Exactly `approved`, `rejected`, and `canceled` count as terminal.
3. A project has at most one active change request across all three active states.
4. Any number of terminal requests may remain visible in project history and do not block creation of a new request.
5. A terminal request cannot return to an active state.
6. A request can enter `approved` or `rejected` only through a decision on its current `in-review` proposal.
7. A request can enter `canceled` only from `revision-draft`; an in-review proposal must first be withdrawn before the request can be canceled.

## Proposal-Version Lifecycle

| Proposal-version state | Classification | Effect on request |
| --- | --- | --- |
| `in-review` | Open | Request is `in-review`; comments and one terminal action are allowed. |
| `changes-requested` | Terminal | Request becomes `revision-draft` and receives one copied working draft. |
| `withdrawn` | Terminal | Request becomes `revision-draft` and receives one copied working draft. |
| `rejected` | Terminal | Request becomes terminal `rejected`; no draft is created. |
| `approved` | Terminal | Request becomes terminal `approved` and the proposed target becomes the next current scope version. |

Rules:

1. Every submitted proposal version starts `in-review`.
2. It reaches exactly one terminal outcome and can never be reopened or have its outcome replaced.
3. At most one proposal version within a request is `in-review`.
4. A request never has an editable draft and an in-review proposal simultaneously.
5. Requested changes and withdrawal copy the exact reviewed proposal into one new working draft; they do not edit the submitted version.
6. Rejection and approval create no proposal draft.
7. The first valid conditional terminal transition wins. All later or competing decisions, withdrawals, comments, or stale mutations fail safely.

## Fixed Base Approved Scope

1. Starting a request requires one current approved scope version and records its exact immutable identifier and number as the base.
2. The base remains fixed across every working draft and submitted proposal version in the request.
3. A request cannot be rebased. If its base is no longer current for any reason, submission and approval fail with a stale/conflict result; the request is not silently rewritten.
4. Every submission rechecks that the fixed base is still the current approved scope before creating a proposal version.
5. Approval rechecks the same condition inside the authoritative transaction before creating the successor scope.
6. Drafting, requested changes, withdrawal, rejection, and cancellation never alter the base or current approved scope.

## Target-Scope and Content Rules

The target scope reuses Slice 1.2 structures and limits:

1. A target may contain at most 50 groups and 200 requirements and must contain at least one complete requirement at submission.
2. A group has a stable identifier, required trimmed plain-text name of 1–120 characters, and explicit order.
3. A requirement has a stable logical identifier, required title of 1–120 characters, required description of 1–5,000 characters, between 1 and 50 acceptance criteria, an optional group reference, and explicit order.
4. Each acceptance criterion is required trimmed plain text of 1–2,000 characters.
5. Existing base identities are preserved in the initial copy and every later revision copy. New groups and requirements receive new identities that remain stable through later proposal revisions and the approved successor scope.
6. Removing a group requires its requirements to be removed, moved to another valid group, or made ungrouped in the same write; removal never cascades silently.
7. User-authored content is plain text and cannot execute markup or scripts.
8. The complete target is validated on every write and fully revalidated at submission.

## Request and Narrative Validation

1. Request title is required trimmed plain text of 1–120 characters.
2. Proposal rationale is required trimmed plain text of 1–5,000 characters.
3. Impact summary is optional trimmed plain text of at most 2,000 characters; blank input is stored as absent.
4. Proposal version 1 requires no revision summary. Version 2 and later require a trimmed plain-text revision summary of 1–2,000 characters.
5. Approval accepts an optional trimmed plain-text note of at most 2,000 characters.
6. Requested changes and rejection require a trimmed plain-text note of 1–2,000 characters.
7. Withdrawal and cancellation require explicit confirmation and a trimmed plain-text reason of 1–2,000 characters.
8. A review comment is required trimmed plain text of 1–2,000 characters.

## Material Comparison Rules

### Total effect against the base scope

Every submitted proposal version is compared with the request's unchanged base approved scope.

Material requirement changes are:

- `added` — a logical requirement identity exists in the target and not in the base.
- `removed` — a logical requirement identity exists in the base and not in the target.
- `content-changed` — the same logical identity has a different title, description, or ordered acceptance-criterion content.
- `moved` — the same logical identity has a different effective group identity, including grouped-to-ungrouped and ungrouped-to-grouped moves.

Material group changes are:

- `added` — a group identity exists in the target and not in the base.
- `removed` — a group identity exists in the base and not in the target.
- `content-changed` — the same group identity has a different name.

One entity may carry multiple applicable change kinds, such as a requirement that is both content-changed and moved. Group membership changes are represented by requirement `moved` items rather than treating group membership arrays as separate group content.

Non-material changes are:

- Reordering requirements within the same effective group.
- Reordering groups.
- Changes to order fields without another material difference.

Submission requires at least one material total-effect item. A target that differs from the base only by non-material ordering is rejected without allocating a request or proposal number.

### Changes since the immediately previous proposal

1. Proposal version 1 has no previous-proposal comparison.
2. Version 2 and later compare their complete target and version-specific rationale/impact with the immediately preceding submitted proposal version.
3. Target-scope changes use the same material classifications and order exclusions as the base comparison.
4. Changed rationale or impact is surfaced as immutable proposal-metadata comparison context, not misclassified as a scope entity change.
5. A revised proposal may retain the same target as its predecessor when its total effect against the base remains material; the required revision summary and metadata comparison explain the revision.
6. Both comparison perspectives remain readable with the exact proposal version after review closes.

### Determinism and item identity

1. Comparisons use stable identities, never names, titles, or array positions as identity.
2. Before and after data comes only from immutable snapshots.
3. Added and changed items follow target display order; removed items follow source display order, with stable identifiers used as deterministic tie-breakers.
4. Base-scope and previous-proposal items use distinct identifiers and explicitly record their comparison kind.
5. An immutable submitted proposal cannot have its derived item set recomputed into a different historical result by later edits or code paths.

## Start, Edit, and Discard

1. A Workspace Owner or active assigned Service-Team Member may start a request when the project has a current approved scope and no active request.
2. Starting creates one `draft`, pins the current approved scope, copies its complete content and stable identities, and issues an optimistic revision token.
3. The owner and active assigned Service-Team Members may read and edit the working draft.
4. Each mutation supplies the last-read revision token. A successful write advances it; a stale token returns the established stale/conflict response and applies no partial change.
5. The owner alone may discard a never-submitted `draft`, with explicit confirmation.
6. Discard permanently removes the unnumbered request and draft, creates no project history, and sends no email because no client-visible record ever existed.
7. A request with a number or any submitted proposal history can never use discard.

## Submission and Proposal Numbering

1. Only the Workspace Owner may submit.
2. Submission requires an active `draft` or `revision-draft`, a current revision token, complete valid content, at least one material total effect, the fixed base still current, and at least one active Client Approver at commit time.
3. First submission atomically allocates the next project-scoped request number and proposal version 1. Failed submissions allocate neither number.
4. Later submissions retain the request number and atomically allocate the next proposal-version number from the highest submitted version in that request.
5. Request and proposal numbers are monotonically increasing and never reused after terminal outcomes.
6. Submission snapshots version-specific metadata and target scope, creates both required immutable comparison sets, removes the editable draft, changes the request to `in-review`, and creates project-shared activity in one transaction.
7. Failed validation, authority, base-state, comparison, history, or persistence leaves the working draft intact and consumes no number.

## Review Comments

1. Every currently active project member may post a comment while the exact proposal version is `in-review`.
2. A comment targets the whole proposal version or exactly one derived change item belonging to that version.
3. Item comments record the item's comparison kind and immutable item identifier. An item from another proposal, comparison, project, or request is invalid.
4. The UI clearly distinguishes comments on total base effect from comments on changes since the previous proposal.
5. Comments are immutable and have no edit or delete operation.
6. Comments remain readable with their exact proposal version and item after all terminal outcomes and later revisions.
7. No comment can be created after the proposal reaches a terminal outcome.
8. Comment creation and its project activity entry succeed or fail together. A comment racing a terminal action succeeds only if it commits while the proposal remains in review.

## Client Decisions

### Approval

1. Only a currently active Client Approver for the project may approve.
2. Approval requires explicit confirmation against the exact request and in-review proposal version. The note is optional.
3. One transaction rechecks current project access and role, request/proposal states, absence of a prior decision, fixed base identity, current approved-scope identity, target validity, and next scope-version allocation.
4. The transaction then:
   - Records the immutable `approved` proposal decision and actor context.
   - Creates the next immutable approved scope version from the exact reviewed target snapshot.
   - Preserves existing logical requirement and group identities and assigns no new identity beyond those already captured in the proposal.
   - Marks the former current approved scope `superseded` while preserving its original approval decision and content.
   - Records when it was superseded and the exact change request, proposal version, and successor scope version responsible.
   - Records reciprocal provenance on the new scope version, including its base scope, request, proposal version, proposal submitter, and approving client.
   - Changes the request to terminal `approved` and creates the required project activity.
5. The new scope version receives the next project scope-version number and is immediately the sole current approved scope. It does not undergo a second scope review because the approver reviewed the exact target snapshot.
6. A failure in any validation, conditional update, scope creation, supersession, provenance, numbering, decision, or activity write rolls back the entire transaction. The old scope remains current, the proposal remains in review, and no partial decision or new version exists.

### Requested changes

1. Only a currently active Client Approver may request changes against the exact in-review proposal.
2. The action requires explicit confirmation and a required note.
3. It atomically records the proposal outcome and decision, changes the request to `revision-draft`, creates project activity, and creates exactly one copied working draft from the reviewed proposal.
4. The copy retains the fixed base, target identities/content, rationale, and impact; it receives a new revision token and no proposal-version number.
5. The decision note is history and is not substituted for the owner-authored revision summary required at resubmission.

### Rejection

1. Only a currently active Client Approver may reject the exact in-review proposal.
2. Rejection requires explicit confirmation and a required note.
3. It atomically records the proposal outcome and decision, changes the request to terminal `rejected`, creates project activity, and creates no draft or scope change.
4. A rejected request cannot be revised or reopened. A later proposal requires a new request pinned to the then-current approved scope.

## Provider Withdrawal and Cancellation

### Withdrawal

1. Only the Workspace Owner may withdraw the exact in-review proposal.
2. Withdrawal requires explicit confirmation and a required reason.
3. It atomically records the proposal as `withdrawn`, records actor/time/reason and activity, changes the request to `revision-draft`, and creates exactly one copied working draft.
4. Withdrawal is not a client decision and does not create a decision record.
5. The withdrawn proposal remains numbered, immutable, readable, and included in both later history and previous-proposal comparison.

### Cancellation

1. Only the Workspace Owner may cancel a request in `revision-draft`.
2. Cancellation requires explicit confirmation and a required reason.
3. It atomically removes the editable revision draft, changes the request to terminal `canceled`, and records actor/time/reason and project activity.
4. Every submitted proposal version, comment, decision or withdrawal outcome, number, and actor snapshot remains readable and immutable.
5. Cancellation never alters the current approved scope and cannot be undone.

## Roles and Permissions

| Capability | Workspace Owner | Active assigned Service-Team Member | Active Client Participant | Active Client Approver |
| --- | --- | --- | --- | --- |
| View working proposal draft | Yes | Yes | No | No |
| Start or edit draft | Yes | Yes | No | No |
| Discard never-submitted draft | Yes | No | No | No |
| Submit proposal | Yes | No | No | No |
| Withdraw in-review proposal | Yes | No | No | No |
| Cancel revision-draft request | Yes | No | No | No |
| View submitted request/version history | Yes | Yes | Yes | Yes |
| Comment during exact proposal review | Yes | Yes | Yes | Yes |
| Approve, request changes, or reject | No | No | No | Yes |
| Read resulting/superseded scope provenance | Yes | Yes | Yes | Yes |

Rules:

1. Workspace Owner access remains implicit through workspace ownership.
2. A Service-Team Member needs active workspace membership and active assignment to the project.
3. A client role needs active membership in the exact project.
4. Client responses never contain working drafts, optimistic tokens, or provider-only metadata.
5. Current authority is re-evaluated inside every action. Stale UI, sessions, historical roles, or actor snapshots grant no authority.
6. Currently active project members may read historical submitted requests even if they joined later. Former members have no continuing access.
7. Cross-workspace and cross-project access follows the existing anti-enumeration behavior.

## Project and Pending-Action Experience

1. The project view shows the current approved scope separately from any active proposed change.
2. Provider members see private draft status and editing availability; only the owner sees submit, withdraw, discard, and cancel controls as applicable.
3. During review, all active members see the request number/title, exact proposal version, rationale, impact, total base effect, complete resulting scope, previous-proposal changes where applicable, and discussion.
4. Client Approvers see an explicit decision-required state and three distinct decisions. Client Participants see review and comment behavior without decision controls.
5. `Your work` shows a concise decision-required indicator to active Client Approvers for an in-review proposal.
6. Owners and assigned team members see a revision-work indicator in `revision-draft`; only the owner sees submission authority.
7. Terminal views clearly distinguish approved, rejected, and canceled requests and retain their submitted version history.
8. Scope history marks exactly one approved version current and shows superseded versions with the request/proposal provenance that changed them.
9. Confirmation surfaces identify the exact request and proposal version and explain the historical or scope-changing effect before submission, decisions, withdrawal, discard, or cancellation.

## Activity History

This slice persists project-shared activity entries for:

- Proposal version submitted or resubmitted.
- Review comment posted, including request-level or exact comparison/item context without duplicating unnecessary comment text.
- Changes requested.
- Proposal rejected.
- Proposal approved and the successor scope version established, including safe base/successor/request/version context.
- Proposal withdrawn.
- Submitted request canceled.

Required domain and activity records commit atomically. Draft creation, editing, and never-submitted discard create no activity entries. The general activity-history UI remains deferred; request- and scope-specific histories expose the records required by this slice.

## Transactional Email

1. Email is attempted only after the authoritative domain transaction commits.
2. Proposal submission and resubmission notify every currently active Client Approver for the project.
3. Proposal withdrawal and submitted-request cancellation notify every currently active Client Approver that the pending or expected review is no longer active.
4. Approval, requested changes, and rejection notify exactly the Workspace Owner plus Service-Team Members with both active workspace membership and active project assignment.
5. Comments and draft actions send no email.
6. Client Participants, pending invitees, inactive or removed members, and unassigned team members receive no decision email.
7. Recipients are deduplicated and resolved from current access after commit.
8. Email contains only minimum project, request number/title, proposal version, action, and return-path context. It excludes scope content, rationale, impact, comments, decision notes, cancellation/withdrawal reasons, and other members.
9. Partial or total delivery failure never rolls back or disguises the action. The actor receives one safe warning without addresses or provider diagnostics.
10. There is no queue or automatic retry. In-app state and pending actions remain authoritative.

## REST and Data Boundary Requirements

The versioned REST API must expose project-scoped capabilities to:

- Read current change-request state, authorized working draft, submitted history, exact proposal detail, comparisons, comments, permissions, and pending action.
- Start and update a working proposal draft.
- Discard a never-submitted request.
- Submit the current draft against its optimistic revision token.
- Post a proposal-level or exact derived-item comment.
- Approve, request changes, or reject the exact in-review proposal.
- Withdraw the exact in-review proposal and cancel a revision-draft request.
- Read current and superseded scope versions with change-request provenance.

Requirements:

1. Routes reuse existing authentication, CSRF protection, strict Zod validation, error envelope, safe not-found convention, and versioned `/projects/:projectId/...` boundary.
2. Request and response contracts explicitly distinguish request state from proposal-version state.
3. Mutations identify the expected revision token or exact request/proposal version and require explicit confirmation for historically significant actions.
4. Provider-only data is omitted at backend serialization boundaries for client roles.
5. Stable public identifiers and ISO timestamps are returned; MongoDB and concurrency internals are not exposed.
6. Ordering is deterministic. At portfolio project scale, pagination is not required for one project's bounded request history in this slice.

## Transactionality and Concurrency

1. Database indexes, conditional writes, and transactions enforce one active request, one draft per active request, one in-review proposal, unique request numbers, unique proposal-version numbers, and one decision per proposal.
2. Draft writes use optimistic concurrency; simultaneous writes against one token yield one success and safe conflicts for the rest.
3. Submission, comments, decisions, withdrawal, cancellation, approval/scope supersession, and required activity use transaction boundaries appropriate to their complete authoritative effect.
4. Current project access and relevant state are rechecked within state-changing transactions.
5. The first valid approval, requested-changes, rejection, or withdrawal transition against an in-review proposal wins. All later competing transitions fail stale/conflicting without altering the winner.
6. A comment and terminal transition may race; the comment commits only if it locks the proposal while still in review.
7. Request and proposal numbering occurs only inside successful submission transactions. Scope-version numbering occurs only inside a successful approval transaction.
8. Copied-draft creation is mandatory for requested changes and withdrawal. Failure to create it rolls back the outcome and leaves the proposal in review.
9. Approval is indivisible: decision, scope creation, prior-scope supersession, reciprocal provenance, request closure, and activity either all commit or none commit.

## Validation and Failure Behavior

1. All identifiers, strings, arrays, counts, references, confirmation values, expected states, and revision tokens are validated before business execution and rechecked where authoritative state may race.
2. Starting without a current approved scope or while another active request exists returns an understandable conflict.
3. Submission with no active Client Approver, no material base difference, incomplete target, invalid identity/reference, missing later-version summary, stale draft token, or stale base preserves the draft and allocates no number.
4. Cross-request, cross-proposal, cross-comparison, and cross-project comment targets fail safely without revealing private data.
5. Invalid or stale decisions, withdrawal, cancellation, or discard apply no partial transition.
6. Historical versions, comparisons, decisions, comments, actor snapshots, request title, base identity, and provenance have no ordinary edit or delete operation.
7. Unexpected and dependency failures use established safe errors and diagnostics without exposing cookies, CSRF values, credentials, email addresses, private content, or provider details.
8. Email failure is reported only after domain success and never changes authoritative state.

## Accessibility and Responsive Behavior

1. Provider authoring is keyboard usable for adding, editing, regrouping, ungrouping, removing, and reordering target content; drag and drop cannot be the sole method.
2. Fields have programmatic labels and associated validation errors. Error summaries and confirmations manage focus meaningfully.
3. Request state, proposal outcome, comparison kind, change kind, pending action, current scope, and superseded scope use text and semantics rather than color alone.
4. Review works on narrow mobile screens without horizontal scrolling for core content or decision actions.
5. The two comparison perspectives are clearly named and do not visually merge comments from different proposal versions or items.
6. Loading, empty, stale, success, email-warning, and error states are announced through appropriate status or alert semantics.
7. Long plain text preserves line breaks, wraps safely, and requires no hover interaction.

## Acceptance Criteria

1. An authorized provider can start one unnumbered private change-request draft only when a current approved scope exists and no active request exists.
2. The new request pins and copies the exact current approved scope while preserving stable group and logical requirement identities.
3. Owners and assigned team members can edit valid target scope and version-specific metadata with optimistic concurrency; clients cannot read the draft.
4. Only the owner can discard a never-submitted draft, which leaves no number, request history, activity, or email.
5. Submission rejects invalid, incomplete, stale, approver-less, rebased, or ordering-only proposals without consuming request or proposal numbers.
6. First submission freezes the request title, assigns the next request number and proposal version 1, stores immutable target/comparison snapshots, removes the draft, and starts review atomically.
7. Later successful submissions retain the request/base identity, require a revision summary, and allocate the next proposal number without reuse.
8. Total-effect comparison correctly reports material requirement and group changes against the unchanged base while ignoring order-only differences.
9. Revised proposals also preserve a distinct comparison against the immediately previous submitted proposal, including rationale/impact changes.
10. Every active project member can read submitted versions and comment on the exact in-review proposal or one exact derived item; former and unrelated users cannot.
11. Comments remain attached to the exact proposal/comparison/item, are immutable, and cannot be added after review closes.
12. Client Participants cannot decide. A current Client Approver can approve, request changes, or reject the complete exact proposal.
13. The first valid decision or competing withdrawal commits once; later decisions and stale actions cannot alter its outcome or history.
14. Requested changes require a note and atomically preserve the proposal outcome/activity plus one copied `revision-draft`.
15. Owner withdrawal requires a reason and atomically preserves the proposal outcome/activity plus one copied `revision-draft`.
16. Rejection requires a note, creates no draft or scope change, and closes the request terminally.
17. Owner cancellation is allowed only in `revision-draft`, requires a reason, removes only the editable draft, and preserves every submitted historical record.
18. Approval validates the exact reviewed proposal and fixed current base, then atomically creates the next current approved scope, supersedes the prior scope, records reciprocal provenance/decision/activity, and closes the request.
19. Any approval failure leaves the original scope current and the proposal in review with no partial successor, supersession, decision, or activity.
20. Approved target content exactly matches the reviewed immutable proposal snapshot and preserves its stable identities.
21. Terminal requests remain readable and permit a new request to start from the then-current approved scope; active requests block a second start.
22. Project and `Your work` surfaces clearly distinguish current approved scope, private provider work, client decision work, revision work, and terminal outcomes.
23. Submission/withdrawal/cancellation and decision emails reach only the specified current recipients; delivery failures preserve state and return safe warnings.
24. Current backend membership controls every read and action despite stale frontend data, role changes, removal, unassignment, or an unexpired session.
25. Automated and manual validation proves tenant isolation, authorization, fixed-base integrity, state separation, numbering, comparison, comments, concurrency, atomic supersession, history, notification failure, accessibility, and responsive review.
26. Slice 1.3 remains usable without AI and includes none of the explicitly excluded billing, milestone, attachment, link, notification-center, general-timeline, or later-slice behavior.
