# Slice 1.2: Requirements and Agreed Scope Requirements

**Status:** Approved — 2026-09-09

## Purpose

This slice gives a provider and client one clear, shared process for defining project requirements, reviewing a complete proposed scope, recording an authorized decision, and preserving every submitted version. It establishes the agreed-scope baseline that Slice 1.3 will later protect through formal change control.

## Desired Outcome

A Workspace Owner and assigned Service-Team Members can prepare a structured scope privately. The owner can submit one immutable version for client review. Every active project member can understand the proposal and discuss it, while only an active Client Approver can approve the whole version or request changes. The resulting decision, reviewed content, comments, and actor context remain historically visible without overwriting earlier versions.

## Constitutional Constraints

1. Tenant and project boundaries are enforced by the Express backend on every protected read and write.
2. Approval authority is contextual. A global account or general project participation does not grant approval authority.
3. One valid decision from any active Client Approver is sufficient; voting, ordered approval, quorum, and multi-step approval are excluded.
4. Submitted and approved facts are historical records. Revisions create new snapshots instead of modifying reviewed content.
5. Core behavior does not depend on AI and remains usable when Gemini is disabled or unavailable.
6. In-app project state is authoritative. Transactional email only directs recipients back to that state.
7. The slice uses the existing TypeScript, Next.js, Express, Zod, MongoDB, Mongoose, Gmail SMTP/Nodemailer, and test boundaries. It adds no infrastructure platform or shared package.
8. This is a feature specification, not legal evidence, an e-signature system, or a compliance-grade audit facility.

## Scope

### In scope

- One private, unnumbered provider working draft per project.
- Ordered requirements with optional ordered groups.
- Required title, required description, and one or more required acceptance criteria per requirement.
- Owner and assigned Service-Team Member draft collaboration.
- Owner submission and withdrawal authority.
- Whole-version client review, comments, approval, and requested changes.
- Immutable numbered submitted snapshots and preserved version history.
- Stable logical requirement identity and revision comparison.
- Pending-action visibility in the project and existing `Your work` experience.
- Project-shared history for significant scope and review actions.
- Transactional email for review and decision events.
- Responsive and accessible provider authoring and client review surfaces.

### Out of scope

- Requirement attachments, file uploads, rich text, Markdown rendering, or embedded media.
- Item-level approval, partial approval, voting, quorum, ordered approvers, or approval chains.
- Sharing live drafts with clients or allowing clients to edit requirements.
- Provider self-approval or Client Participant approval authority.
- Reopening, replacing, editing, or invalidating approved scope.
- Formal change requests or any other Slice 1.3 behavior.
- General activity-history UI; this slice persists required events and exposes scope-specific history only.
- Notification centers, notification preferences, digests, automatic email retry, push notifications, or messaging integrations.
- AI structuring, quality review, summarization, or any other Phase 2 behavior.
- Requirement templates, import/export, bulk upload, dependencies, priority, assignments, task status, estimates, or internal project-management fields.

## Domain Terms and Records

### Provider working draft

A working draft is the only editable scope representation. It belongs to one project, is visible only to the Workspace Owner and active Service-Team Members assigned to that project, has no public version number, and carries an opaque optimistic revision token.

The first working draft is created by an explicit provider action and may initially be empty. A copied draft is created automatically only after requested changes or withdrawal. A project can never have a working draft while a version is actively in review.

### Logical requirement

Each requirement receives a stable logical identifier when first created. That identifier is preserved when a reviewed version is copied into a later draft. Edits do not create a new logical identity. A newly added requirement receives a new identity; deleting a requirement from a later draft does not delete it from earlier snapshots.

The logical identifier is internal project-scoped identity, not a user-editable label and not a cross-project identifier.

### Submitted scope version

A successful submission converts the current draft content into an immutable numbered snapshot. A submitted version contains its version number, groups, requirement snapshots, stable logical requirement identities, owner-provided submission context where required, submitter identity snapshot, and submission time.

Only successfully submitted snapshots receive version numbers. A submitted version retains its number after approval, requested changes, or withdrawal. Numbers increase monotonically without reuse; terminal versions remain in the sequence. For example, if v2 is withdrawn, the next successful submission is v3.

### Requirement snapshot

Each requirement snapshot has its own immutable snapshot identifier plus the preserved logical requirement identifier, group association if present, title, description, acceptance criteria, and display order as submitted. Comments target the immutable snapshot identifier so their historical context cannot drift.

### Decision

A decision is exactly one terminal Client Approver action against an actively in-review version: `approved` or `changes-requested`. It records the acting user, display-name snapshot, effective role at decision time, timestamp, version identity, outcome, and optional or required note according to the rules below.

Withdrawal is an owner transition, not a client decision, but it is recorded with equivalent historical context.

## Requirement and Group Rules

1. A draft may contain at most 50 groups and 200 requirements.
2. A group has a stable draft/snapshot identifier, required trimmed plain-text name of 1–120 characters, and explicit order.
3. A requirement has:
   - A stable logical identifier.
   - A required trimmed plain-text title of 1–120 characters.
   - A required trimmed plain-text description of 1–5,000 characters with line breaks preserved.
   - Between 1 and 50 acceptance criteria.
   - An optional reference to one group in the same draft.
   - Explicit order within its grouped or ungrouped placement.
4. Each acceptance criterion is required trimmed plain text of 1–2,000 characters. Criteria preserve their submitted order.
5. Group and requirement names need not be globally unique; stable identifiers distinguish records.
6. The backend validates group references, bounds, and complete requirement content on every relevant write. Submission revalidates the whole draft atomically.
7. Reordering changes only presentation order. It does not change logical identity and is not classified as a content change in revision comparison.
8. Removing a group from a draft requires explicitly moving its requirements to another valid group or to the ungrouped area in the same write; it must not cascade-delete requirements.
9. Draft items may be created, edited, reordered, regrouped, or deleted. No such edit changes an earlier submitted snapshot.
10. User-authored content is treated as plain text on input and output. It must not execute markup, scripts, or embedded content.

## Scope Lifecycle and Invariants

### States

- `not-started` — the project has no draft and no submitted version.
- `draft` — one unnumbered provider working draft exists and no version is in review.
- `in-review` — one numbered immutable version awaits a decision and no editable draft exists.
- `changes-requested` — a submitted version reached that terminal outcome; one copied unnumbered draft is created atomically.
- `withdrawn` — the owner ended review; one copied unnumbered draft is created atomically.
- `approved` — a submitted version is the immutable agreed scope; no draft or in-review version exists.

The project-level current state is derived from the sole active draft, sole active review, and latest terminal submitted outcome. Historical versions retain their own terminal status.

### Required invariants

1. A project has at most one provider working draft.
2. A project has at most one scope version actively in review.
3. A project never has a working draft and an in-review version at the same time.
4. Submitted snapshots are immutable.
5. Historical versions are never overwritten or renumbered.
6. Only successful submission allocates the next version number.
7. The first valid, authorized Client Approver decision ends review.
8. A submitted version has at most one decision.
9. Approved scope cannot be directly edited, withdrawn, superseded, or reopened in this slice.
10. Requested changes and withdrawal create a new draft rather than modifying the reviewed version.
11. Comments always belong to one submitted version and optionally one requirement snapshot in that version.
12. Invariants are protected by MongoDB transaction boundaries, indexes or equivalent write-time constraints, and conditional state updates rather than frontend behavior alone.

### Start and draft editing

1. The Workspace Owner or an active assigned Service-Team Member may explicitly start the initial draft when the project is `not-started`.
2. Starting a draft is rejected if a draft or in-review version already exists or approved scope exists.
3. Draft reads and mutations require current provider-side project authority on every request.
4. Every draft mutation supplies the last-read optimistic revision token. A successful write advances the token. A stale token returns the stable stale/conflict response and applies no partial change.
5. Concurrent attempts to start or create a second draft produce one valid draft and a safe conflict for other callers.
6. Ordinary draft edits do not create project activity entries or transactional email.

### Submission

1. Only the Workspace Owner may submit.
2. Submission is allowed only when exactly one draft exists, no version is in review, approved scope does not exist, the optimistic revision token is current, and at least one active Client Approver exists at commit time.
3. The draft must contain at least one requirement and every group, requirement, reference, and criterion must pass full validation.
4. The first submission does not require a revision summary. Submission of any copied revision draft requires a trimmed plain-text revision summary of 1–2,000 characters.
5. Submission atomically allocates the next version number, creates the immutable version and snapshots, removes the editable draft, changes the project workflow to `in-review`, and creates the project-shared submission activity entry.
6. There is no parallel editable draft after submission.
7. Failed validation, authorization, concurrency, history creation, or persistence leaves the draft intact and allocates no version number.

### Approval

1. Only a currently active Client Approver for the project may approve.
2. Approval requires explicit confirmation against the exact in-review version. An optional trimmed plain-text note may contain up to 2,000 characters.
3. The decision transaction rechecks project access, current role, version state, and absence of a prior decision.
4. Approval atomically records the decision, changes the version to `approved`, establishes that immutable version as agreed scope, and creates the project-shared activity entry.
5. Approval creates no draft.
6. After commit, all later approve or request-changes attempts for that version fail with a stable stale/conflict response and cannot change the recorded outcome.

### Request changes

1. Only a currently active Client Approver for the project may request changes.
2. The action requires explicit confirmation and a trimmed plain-text note of 1–2,000 characters.
3. The transaction performs the same authority and first-decision checks as approval.
4. The action atomically records the `changes-requested` decision, terminates review, creates the project-shared activity entry, and creates one unnumbered provider-only draft copied from the reviewed snapshot.
5. The copied draft preserves logical requirement identities, groups, content, acceptance-criterion ordering, and requirement ordering. It receives a new optimistic revision token and no version number.
6. The decision note is review history, not the copied draft’s revision summary. Provider members may edit the copied draft immediately. The owner supplies the required revision summary only when submitting it.
7. Failure to create any required record rolls back the complete transition and leaves the version in review.

### Withdrawal

1. Only the Workspace Owner may withdraw the currently in-review version.
2. Withdrawal requires explicit confirmation and a trimmed plain-text reason of 1–2,000 characters.
3. Withdrawal atomically changes the version to `withdrawn`, records actor/time/reason, creates the project-shared activity entry, and creates one copied unnumbered provider draft under the same copying rules as requested changes.
4. The withdrawn version remains immutable, visible, and numbered. Its number is never reused.
5. Withdrawal cannot race past a client decision. If a valid decision commits first, withdrawal fails as stale/conflicting state and creates no draft. If withdrawal commits first, later decisions fail equivalently.

## Revision Comparison

1. Version 2 and later compare against the immediately preceding submitted version, including when that prior version was withdrawn or changes-requested.
2. Comparison uses stable logical requirement identity, never titles or array positions.
3. `added` means the logical requirement is present in the newer version and absent from the comparison version.
4. `removed` means the logical requirement is absent from the newer version and present in the comparison version.
5. `content-changed` means the same logical requirement exists in both versions but its title, description, ordered acceptance-criterion content, effective group association, or effective group name differs.
6. Requirement order and group display order alone do not produce `content-changed`.
7. Unchanged requirements are available in the complete snapshot but need not be emphasized in the change summary.
8. The comparison is deterministic and derived from immutable snapshots. It is not stored as user-authored truth.
9. The client review UI shows the owner-authored revision summary alongside distinct, text-labeled added, removed, and content-changed results. Meaning may not depend on color alone.

## Comments

1. Every currently active project member may post a comment while a version is `in-review`.
2. A comment targets the submitted version and may additionally target exactly one requirement snapshot belonging to that version.
3. Scope-level comments discuss the whole submission. Requirement-level comments remain displayed with that requirement and in the version’s discussion context.
4. Comment body is required trimmed plain text of 1–2,000 characters.
5. Posting rechecks current project access, active review state, and target membership in the version within the same transaction.
6. A posted comment is immutable: no edit or delete operation is provided in any version state.
7. Comments are readable by currently active project members after review ends and remain attached to the historical submitted version.
8. No new comment can be created after approval, requested changes, or withdrawal. A comment racing with a terminal transition succeeds only if it commits while the version remains in review; otherwise it fails safely.
9. Each comment records immutable identity, author user identifier, author display-name snapshot, effective role snapshot, timestamp, version, optional requirement snapshot, and body.
10. Posting a comment and its project-shared activity entry succeed or fail together.

## Roles and Permissions

| Capability | Workspace Owner | Active assigned Service-Team Member | Active Client Participant | Active Client Approver |
| --- | --- | --- | --- | --- |
| View provider draft | Yes | Yes | No | No |
| Start or edit draft | Yes | Yes | No | No |
| Submit draft | Yes | No | No | No |
| Withdraw active review | Yes | No | No | No |
| View submitted versions and comparison | Yes | Yes | Yes | Yes |
| Comment during active review | Yes | Yes | Yes | Yes |
| Approve or request changes | No | No | No | Yes |
| Read historical comments and decisions | Yes | Yes | Yes | Yes |

Rules:

1. Workspace Owner access remains implicit through ownership.
2. A Service-Team Member needs both active workspace membership and an active assignment to this project.
3. A client-side user needs active membership in this project. Membership in another project or workspace grants nothing.
4. Client Participant and Client Approver reads never include provider drafts, optimistic tokens, or draft-only metadata.
5. Current authority is re-evaluated at action time. Removed, unassigned, inactive, or role-changed access cannot be preserved by stale UI data or an existing session.
6. A current project member may read historical versions and comments even if they joined after those events. A former member has no continuing access.
7. Historical actor and role snapshots do not grant present authority and are not rewritten when membership later changes.

## Project and Pending-Action Experience

1. The project view shows a clear scope state, the next valid action for the current role, the current draft or review when authorized, and access to submitted-version history.
2. Provider members see private-draft status and editing availability. Only the owner sees submit and withdraw controls.
3. During active review, Client Approvers see an explicit decision-required state and approve/request-changes actions. Client Participants see review and comment actions without approval controls.
4. `Your work` shows a concise pending-decision indicator to active Client Approvers when a project has a version in review.
5. After requested changes or withdrawal, the owner and active assigned Service-Team Members see that a provider revision draft exists. The UI distinguishes the team’s editing action from the owner’s eventual submission authority.
6. Approved projects clearly identify the approved version, approving user, and approval time without offering edit or reopen actions.
7. Version history shows version number, status, submitter, submitted time, terminal actor/time where applicable, revision summary where applicable, and readable discussion.
8. Confirmation surfaces identify the exact version and explain the historical effect before approval, request changes, or withdrawal.

## Activity History

This slice persists project-shared activity entries for:

- Scope version submitted.
- Review comment posted, including whether it targets the scope or a requirement but not duplicating unnecessary comment text.
- Scope version approved.
- Changes requested.
- Scope review withdrawn.

Each entry follows the existing activity qualities: immutable identity/time, actor identity and display-name snapshot, project/workspace/entity context, fixed project audience, version and safe outcome context, and no secrets or unnecessary personal data. Required domain records and activity entries commit atomically. Draft creation and editing do not create activity entries.

The general project activity timeline remains deferred. Scope-specific version, comment, and decision history is visible through the scope experience.

## Transactional Email

1. Email is sent through the existing application email boundary only after the authoritative domain transaction commits.
2. Successful submission attempts email to every currently active Client Approver for that project.
3. Successful withdrawal attempts email to every currently active Client Approver for that project so a previous review request is not left appearing actionable.
4. Successful approval or requested changes attempts email to exactly:
   - The Workspace Owner.
   - Every Service-Team Member who has both active workspace membership and an active assignment to that project at notification-recipient resolution time.
5. Client Participants are not decision-email recipients. Inactive, removed, unassigned, or pending invitees receive no email.
6. A user receives at most one copy for one event even if malformed historical data would otherwise resolve duplicate paths.
7. Email includes only the minimum project, version, action, and return-path context. Requirement content, comments, other members, internal client metadata, and decision-note text are excluded.
8. Partial or complete delivery failure never rolls back or disguises the committed action. The acting user receives a safe warning identifying that some notification email could not be sent without exposing recipient addresses or provider diagnostics.
9. There is no queue or automatic retry in this slice. In-app state and pending-action indicators remain authoritative.

## REST and Data Boundary Requirements

The versioned REST API must expose capabilities, under the existing project boundary, to:

- Read the current scope state and authorized current draft or in-review version.
- List and read submitted versions and their scope-specific history.
- Start the initial draft.
- Create, update, delete, regroup, and reorder draft groups and requirements.
- Submit the current draft with its optimistic revision token and required revision summary where applicable.
- Withdraw the current in-review version.
- Post a scope-level or requirement-level review comment.
- Approve or request changes for the exact in-review version.
- Read deterministic comparison data for a revision.

Requirements:

1. Routes use the existing common error envelope, request validation middleware, browser mutation/CSRF protection, authentication, and safe not-found/denied convention.
2. Request and response schemas are explicit and strict at backend and frontend boundaries.
3. Mutation payloads identify the expected draft revision or exact submitted version as applicable.
4. Provider-only fields are excluded when serializing for client-side roles; they are not merely hidden by the frontend.
5. Responses use stable public identifiers and ISO timestamps. MongoDB internals and concurrency implementation details are not exposed.
6. List ordering is deterministic. The complete version history is bounded by at most 200 requirements per version; pagination is not required for this slice’s project scale.
7. Exact route names may follow existing `/projects/:projectId/...` conventions during implementation, but they must not change the behavior or authority defined here.

## Transactionality and Concurrency

1. Draft uniqueness, active-review uniqueness, next-version allocation, terminal transitions, copied-draft creation, required activity, and single-decision behavior are enforced at the database boundary.
2. Submission, approval, requested changes, withdrawal, and comment creation use transactions for all authoritative records they require.
3. Conditional writes must include the expected current state. A stale state returns the existing stable `STALE_STATE`-style conflict response and no partial records.
4. Draft mutations use optimistic concurrency. The server returns the new opaque revision token after each successful mutation.
5. Concurrent valid draft mutations against the same token yield one success and conflicts for the rest. The UI refreshes and explains that the draft changed rather than silently overwriting work.
6. Concurrent submission attempts cannot allocate duplicate numbers or create multiple reviews.
7. Concurrent approval, requested-changes, and withdrawal attempts produce exactly one terminal outcome and at most one copied draft when that outcome requires one.
8. Email is outside the domain transaction and runs only after commit.

## Validation and Failure Behavior

1. All identifiers, strings, arrays, references, counts, state expectations, and confirmation values are validated with Zod before business execution and rechecked as needed inside the authoritative transaction.
2. Submission without an active Client Approver returns an understandable conflict and leaves the draft unchanged.
3. Empty or incomplete drafts return safe field/collection validation details and are not numbered.
4. An invalid group or requirement-snapshot reference is rejected without revealing another project’s data.
5. Cross-workspace and cross-project access follows the existing anti-enumeration behavior and never confirms private resource existence.
6. Stale draft tokens and completed/replaced review states return stable conflicts that prompt a refresh.
7. A failed copied-draft creation leaves the reviewed version in review; it must never record requested changes or withdrawal without its required successor draft.
8. A failed activity write rolls back its corresponding domain transition or comment.
9. Email/provider failures expose only a safe warning after domain success. Raw SMTP errors, addresses, credentials, cookies, CSRF values, request bodies, and private content are excluded from responses and diagnostics.
10. Unexpected failures use the established error handler and leave no contradictory scope state.

## Accessibility and Responsive Behavior

1. Provider authoring is usable with keyboard-only interaction, including adding, editing, regrouping, and reordering without requiring pointer-only drag and drop.
2. Every field has a programmatic label and associated error. Validation summaries move or direct focus meaningfully.
3. Review state, version status, pending action, and comparison categories use text and semantics rather than color alone.
4. Confirmation dialogs manage focus, expose clear names/descriptions, and return focus appropriately.
5. Loading, empty, stale, success, email-warning, and error states are announced through suitable status or alert semantics.
6. Client review and decision actions are convenient on narrow mobile screens without horizontal scrolling for core content.
7. Requirement content preserves intentional line breaks, wraps long plain text safely, and does not rely on hover interactions.

## Acceptance Criteria

1. An authorized provider can explicitly create one empty unnumbered draft for a project with no existing scope workflow.
2. The owner and active assigned Service-Team Members can create, edit, group, ungroup, reorder, and delete valid draft requirements; clients cannot see or mutate the draft.
3. A stale concurrent draft write fails without overwriting the winning edit and gives the caller a refresh path.
4. The owner cannot submit an empty/incomplete draft, a stale draft, a draft with invalid references, or a project without an active Client Approver.
5. A valid owner submission atomically creates the next immutable numbered snapshot, removes the draft, records activity, and leaves no parallel draft.
6. Failed submission allocates no version number and leaves the editable draft intact.
7. Every active project member can read submitted versions and review comments, while former and cross-project users cannot.
8. Every active project member can post immutable scope-level or requirement-level comments only while the target version remains in review.
9. A Client Participant cannot approve or request changes; an active Client Approver can perform either action for the complete current version.
10. The first valid approver decision commits exactly once. Any later or concurrent decision attempt fails stale/conflicting and cannot alter the outcome.
11. Approval records the immutable agreed version and creates no draft; the approved scope exposes no direct edit, withdraw, or resubmit path.
12. Requesting changes requires a note and atomically preserves the terminal numbered version, activity, decision, and one unnumbered copied draft with stable logical requirement identities.
13. Owner withdrawal requires a reason and atomically preserves the numbered version, activity, withdrawal record, and one unnumbered copied draft.
14. A revision draft can be edited without a revision summary, but only the owner can submit it and submission requires a valid summary.
15. A withdrawn version consumes its number, and the next successful submission receives the next higher number without reuse.
16. Revision comparison correctly distinguishes added, removed, and content-changed logical requirements; reordering alone produces no content change.
17. Comments and all submitted content remain readable but immutable after review terminates.
18. Submission and withdrawal notify current active Client Approvers; approval and requested changes notify exactly the Workspace Owner and active assigned Service-Team Members.
19. Email delivery failure leaves committed state/history intact and gives the acting user a safe non-sensitive warning.
20. Project and `Your work` surfaces clearly distinguish provider draft work, owner submission authority, client pending decisions, terminal outcomes, and approved scope.
21. Current backend membership state controls every read and action despite stale frontend data, role changes, removal, unassignment, or an unexpired login session.
22. Required domain state and project-shared activity commit atomically, while ordinary draft edits create no activity entries.
23. Automated and manual validation proves tenant isolation, authorization, state, versioning, identity preservation, concurrency, history, notification failure, accessibility, and responsive client review.
24. Slice 1.2 remains fully usable without Gemini and includes none of the explicitly excluded Slice 1.3, attachment, notification-center, or AI behavior.
