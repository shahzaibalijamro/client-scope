# Slice 1.4: Client-Facing Milestones Requirements

**Status:** Approved — 2026-09-10

## Outcome

After scope is approved, the Workspace Owner and active assigned Service-Team Members can maintain a simple, shared sequence of client-facing milestones. Every active project member can see where delivery stands, which stages are upcoming, in progress, completed, or overdue, and when the latest status transition occurred.

Milestones communicate **where the project is in delivering the agreed work**. Requirements and change requests continue to define **what the project is agreed to deliver**. A milestone is not a requirement, approval, deliverable, internal task, or scheduling commitment.

## Scope

### Included

- One manually ordered active milestone timeline per project.
- Immediately shared milestone creation and detail edits.
- `upcoming`, `in-progress`, and `completed` progress states.
- Provider-controlled status transitions in any direction.
- Optional date-only targets and a deterministic derived overdue indicator.
- Optional immutable notes attached to exact status-transition events.
- Terminal milestone archival with a required reason.
- A newest-archived-first, cursor-paginated archive available to every active project member.
- Immutable project activity for creation, detail edits, status transitions, reorder operations, and archival.
- Backend-enforced contextual authorization, optimistic concurrency, validation, and tenant isolation.
- Responsive, accessible provider controls and client read-only presentation.

### Excluded

- Draft or publish workflows for milestones.
- Client comments, acknowledgements, approvals, or revision requests on milestones.
- Transactional milestone email, notification-center behavior, or scheduled reminders.
- Requirement or change-request links, automatic synchronization, or coverage calculations.
- Deliverable, attachment, external-link, or Cloudinary behavior.
- Assignees, owners per milestone, priorities, dependencies, subtasks, checklists, boards, backlogs, sprints, or internal work tracking.
- Percent-complete progress, effort estimates, time tracking, start dates, date ranges, calendar scheduling, or automatic status transitions.
- AI generation, analysis, or summarization.
- Milestone restoration or permanent deletion.
- General project activity-history presentation, which remains part of Slice 1.6.
- Project completion, final approval, archival, or permanent deletion.

## Domain Concepts

### Milestone timeline

Each project has one logical milestone timeline. The timeline owns:

- An ordered collection of at most 50 active milestones.
- An opaque optimistic revision token returned to authorized provider roles.
- Archived milestones retained outside the active count and manual order.

The timeline may be empty. It becomes writable only after the project has a current approved scope. A current approved scope remains authoritative while a change request is open, so an open `draft`, `revision-draft`, or `in-review` change request does not disable milestone creation or management.

### Active milestone

An active milestone contains:

- A stable public identifier.
- The project and workspace context.
- A required trimmed plain-text title of 1–120 characters.
- An optional trimmed plain-text description of at most 2,000 characters; blank input is stored as absent and line breaks are preserved.
- An optional target date stored as a valid `YYYY-MM-DD` calendar date; past and future dates are both valid.
- A stored status of `upcoming`, `in-progress`, or `completed`.
- An explicit zero-based position within the complete active sequence.
- Created and last-updated timestamps.
- The latest status-transition context when one exists.

New milestones always start as `upcoming` and are appended to the end of the active sequence. Creation cannot directly create an `in-progress` or `completed` milestone. More than one active milestone may be `in-progress` at the same time.

### Status-transition event

Every successful status change creates an immutable transition event containing:

- Stable event and milestone identifiers.
- Previous and next status.
- Actor identifier and display-name snapshot.
- Effective provider role snapshot.
- Transition timestamp.
- An optional trimmed plain-text note of at most 2,000 characters.

The note belongs only to this event. It is not a mutable field on the milestone and cannot be edited, replaced, or deleted. The milestone read model may surface the latest transition event and note; all earlier transition events remain preserved for the later project activity experience.

### Archived milestone

Archival is a terminal record state separate from milestone progress status. An archived milestone retains its last stored progress status, content, former active position, created and updated timestamps, transition history, and immutable activity context. It additionally records:

- The archiving actor identifier, display-name snapshot, and effective provider role snapshot.
- Archive timestamp.
- A required trimmed plain-text reason of 1–2,000 characters.

Archived milestones have no manual archive position. Archive reads are ordered by `archivedAt` descending and then stable identifier descending as a deterministic tie-breaker. There is no restore or hard-delete operation in this slice.

## Business Rules

### Prerequisite and independence from change control

1. A milestone may be created only when the project has a current approved scope at authoritative transaction time.
2. A project without approved scope exposes milestone read state but cannot create a milestone.
3. Starting, submitting, revising, deciding, withdrawing, rejecting, canceling, or otherwise processing a change request does not freeze or reset the milestone timeline.
4. Change-request approval and creation of a successor approved scope do not automatically create, edit, archive, reorder, or relink milestones.
5. Milestones contain no requirement, scope-version, or change-request references beyond ordinary project context.

### Editing

1. Every successful save is immediately visible to all active project members; there is no provider-private representation.
2. Title, description, and target date may be edited while the milestone is `upcoming`, `in-progress`, or `completed`.
3. Completing a milestone does not freeze its content or position.
4. A detail edit never changes status, position, transition context, archive state, or any other field not included in the edit operation.
5. A no-op detail edit is rejected or returns an explicit unchanged result and must not advance the timeline revision or create activity.
6. Each material detail edit creates one immutable activity entry with sufficient before/after field snapshots to explain the shared change later.

### Status transitions

1. Any stored status may transition to either of the other statuses.
2. A same-status request is not a transition and must not create an event or activity entry.
3. Status changes do not change title, description, target date, or position.
4. A successful status change and its transition/activity records commit atomically.
5. Reopening a completed milestone preserves the original completion event and adds a distinct immutable reopening event.
6. Moving a reopened milestone back to `completed` adds another completion event; it does not rewrite the earlier one.
7. The latest transition context is determined by the most recently committed transition, not by editable milestone text.

### Ordering

1. All active statuses share one manual sequence; status never determines position.
2. Reordering may include upcoming, in-progress, and completed milestones.
3. A reorder request supplies every currently active milestone identifier exactly once in the desired order.
4. Missing, duplicate, archived, foreign-project, or unknown identifiers invalidate the complete reorder.
5. A successful reorder changes positions only. It cannot change milestone status, completion history, title, description, target date, timestamps unrelated to ordering, or transition notes.
6. Reordering the already-current sequence is a no-op and creates no activity.
7. One successful reorder request creates exactly one significant activity entry, not one entry per affected milestone.
8. The reorder activity preserves complete before/after active identifier sequences and actor/time context sufficient for later project history display.

### Active limit

1. A project may contain at most 50 active milestones.
2. Archived milestones do not count toward the active limit and are never discarded because of it.
3. The limit is enforced against authoritative state inside the creation transaction, not only by frontend validation or a prior count.
4. Concurrent creates near the limit cannot commit more than 50 active milestones. When only one slot remains, at most one competing create succeeds; the others receive a stable conflict and create no milestone, position, activity, or partial state.
5. Archiving a milestone frees one active slot only after the complete archive transaction commits.

### Overdue calculation

1. `overdue` is derived display state, not a fourth stored progress status.
2. The backend derives one current UTC calendar date as `YYYY-MM-DD` from its authoritative injected clock for the complete request.
3. A milestone is overdue exactly when it has a target date earlier than that UTC date and its stored status is not `completed`.
4. A target date equal to the current UTC date is not overdue.
5. A completed milestone is not overdue even when its target date is earlier than the current UTC date.
6. Reopening a completed milestone immediately makes it overdue when its unchanged or edited target date is earlier than the current UTC date.
7. API responses expose the server-derived boolean. Frontends must not recompute it from browser time, locale, or timezone.
8. No scheduled process changes overdue state or emits activity; it is recalculated on read.

### Archival

1. Any active milestone may be archived regardless of progress status.
2. Archival requires explicit confirmation and a reason of 1–2,000 characters.
3. Archival removes the milestone from the active sequence, closes the position gap deterministically, advances the timeline revision, and creates one immutable activity entry in one transaction.
4. Archival does not rewrite the milestone’s final stored progress status or transition history.
5. Archived milestones remain readable by all currently active project members, including members who joined after archival.
6. Former, inactive, removed, or unassigned users retain no access because historical participation does not grant current authority.
7. Archived retrieval is cursor-paginated, defaults to 20 items, accepts a limit from 1 through 50, and never truncates or deletes older archive history.
8. The cursor is opaque and identifies the last item’s deterministic archive ordering position. Invalid cursors fail validation without exposing storage internals.

## Roles and Permissions

| Capability | Workspace Owner | Active assigned Service-Team Member | Active Client Participant | Active Client Approver |
| --- | --- | --- | --- | --- |
| View active milestone timeline | Yes | Yes | Yes | Yes |
| View archived milestones | Yes | Yes | Yes | Yes |
| View latest transition context | Yes | Yes | Yes | Yes |
| Create milestone after scope approval | Yes | Yes | No | No |
| Edit active milestone details | Yes | Yes | No | No |
| Change active milestone status | Yes | Yes | No | No |
| Reorder active milestones | Yes | Yes | No | No |
| Archive active milestone | Yes | Yes | No | No |
| Restore or permanently delete | No | No | No | No |

Rules:

1. Workspace Owner access remains implicit through workspace ownership.
2. A Service-Team Member needs both active workspace membership and active assignment to the exact project.
3. A client role needs active membership in the exact project; Client Approver authority does not add milestone mutation rights.
4. Current authority and the approved-scope prerequisite are re-evaluated inside each mutation transaction.
5. Stale UI data, historical roles, actor snapshots, existing sessions, or access to another project never grant access.
6. Cross-workspace and cross-project access follows the established safe not-found and anti-enumeration behavior.
7. Client responses omit the provider mutation revision token and mutation permissions beyond read-only false values; hiding controls in the frontend is not the security boundary.

## Activity History

This slice atomically persists project-shared activity for:

- Milestone creation, including the created content and initial status.
- Material detail editing, including changed fields and before/after values.
- Status transition, including old/new status and the immutable optional transition note.
- Active-sequence reorder as one event with complete before/after identifier order.
- Archival, including the final record snapshot, former position, and required reason.

Activity contains stable workspace, project, milestone, actor, role, and time context without secrets or unrelated personal data. Required milestone, timeline, transition, archive, and activity changes commit together or not at all. Activity entries and transition notes have no edit or delete operation.

The milestone experience surfaces current active records, the latest transition context, and archived records. It does not add the general project activity timeline reserved for Slice 1.6.

## REST and Data Boundary Requirements

The versioned REST API must expose project-scoped capabilities to:

- Read all active milestones in manual order with the server-derived overdue value, active count/limit, relevant permissions, and a provider-only opaque timeline revision.
- Read archived milestones in deterministic newest-first cursor pages.
- Create an upcoming milestone at the end of the active sequence.
- Edit title, description, and target date without changing other fields.
- Transition one active milestone to a different status with an optional transition note.
- Replace the complete active ordering.
- Archive one active milestone with explicit confirmation and reason.

Requirements:

1. Routes follow the established `/projects/:projectId/...` boundary and reuse authentication, browser mutation/CSRF protection, strict Zod validation, error envelope, and safe not-found convention.
2. Request and response schemas explicitly distinguish stored status, archived state, and derived overdue state.
3. Active reads return stable identifiers, ISO timestamps, manual positions, latest transition context, active count `0..50`, limit `50`, and provider permissions.
4. All provider mutations include the last-read opaque timeline revision. Successful material writes return the new revision; stale writes return the established `STALE_STATE`-style conflict with no partial change.
5. Archived pages return an opaque next cursor only when more records exist. Storage keys and MongoDB internals are never exposed.
6. Server serialization derives overdue once per response from the injected clock and supplies it to all roles.
7. Client-role serialization never exposes a usable mutation token, internal counters, storage internals, or provider-only controls.
8. Exact route names may follow existing conventions during implementation but cannot change the approved authority, concurrency, pagination, or behavior.

## Transactionality and Concurrency

1. Timeline state, database constraints, conditional writes, and transactions jointly enforce unique active positions, a maximum of 50 active records, and one current revision per project.
2. Creation conditionally advances timeline state, checks approved scope and active count, assigns the final position, creates the milestone, and writes activity atomically.
3. Detail edits, status transitions, reorder, and archival conditionally match the expected timeline revision; simultaneous writes against one revision produce at most one success.
4. Reorder validates its complete identifier set against authoritative active records inside the same transaction that changes positions and records activity.
5. Archival conditionally changes record state, compacts active positions, decrements authoritative active count, advances revision, and writes activity in one transaction.
6. Current access and prerequisite state are rechecked in the transaction. Removal, unassignment, inactivity, or loss of approved scope before commit wins over stale UI.
7. A failed milestone, transition, timeline, position, archive, or activity write rolls back the complete operation.
8. No email or external provider call participates in milestone transactions.

## Validation and Failure Behavior

1. Identifiers, revision tokens, strings, dates, statuses, arrays, counts, cursors, limits, and confirmation values are validated before business execution and rechecked against authoritative state where required.
2. Plain-text fields are trimmed. Blank optional description or transition note becomes absent; blank title or archive reason is invalid.
3. Target dates must be real calendar dates in exact `YYYY-MM-DD` form. Time components, locale dates, and impossible dates are rejected.
4. Unknown enum values and attempts to store `overdue` as status are rejected.
5. Creation without approved scope or at the active limit returns an understandable conflict and applies no partial state.
6. Mutations against archived, foreign-project, missing, or stale milestones fail safely and do not reveal private resource existence.
7. Stale timeline revisions and incomplete reorder sets return stable conflicts that tell the provider to refresh rather than silently overwriting work.
8. Invalid archive input leaves the milestone active and ordered exactly as before.
9. Unexpected failures use established safe diagnostics without exposing cookies, CSRF values, revision tokens, private project content, request bodies, or database details.

## Project Experience

1. The project page presents milestones separately from agreed requirements and change requests and explains that they communicate delivery progress.
2. Before scope approval, every active member sees a clear unavailable or empty state; authorized providers are told that approved scope is required.
3. After scope approval, an empty timeline gives provider roles a create action and clients a neutral no-milestones state.
4. Active milestones appear in the same manual order for every role with text labels for status, target date, and overdue state.
5. Provider roles can create, edit, change status, move items using keyboard-operable controls, and archive with a focus-managed confirmation.
6. Completed milestones retain edit, reorder, reopen, and archive controls for provider roles.
7. Client roles receive no milestone mutation, comment, acknowledgement, or approval controls.
8. The latest transition context shows previous/new status, actor display-name snapshot, time, and note when present; the note is never edited in place.
9. Archived milestones are hidden from the active timeline and available in a separate newest-first view with load-more pagination, archive actor/time/reason, final status, and retained content.
10. Loading, empty, stale, success, validation, forbidden, and unexpected-error states use suitable status or alert semantics and provide safe refresh/retry paths.
11. Long content preserves line breaks, wraps without horizontal scrolling, and remains readable on narrow mobile screens.
12. Status and overdue meaning uses text and semantics rather than color alone.

## Accessibility and Responsive Behavior

1. All fields have programmatic labels and associated validation messages.
2. Milestone creation, editing, status changes, reorder, pagination, and archive are usable by keyboard. Drag and drop cannot be the sole reorder method.
3. Reorder controls expose each item’s identity, movement direction, disabled boundaries, and resulting order to assistive technology.
4. Confirmation and edit surfaces manage focus predictably and return focus to a useful control after closing.
5. Async loading, stale conflicts, successful updates, and errors are announced without relying on visual placement alone.
6. Upcoming, in-progress, completed, overdue, and archived meaning remains distinguishable without color.
7. The active timeline and archived view require no horizontal scrolling for core information or actions on supported mobile widths.

## Acceptance Criteria

1. Slice 1.4 remains unavailable for creation until a current approved scope exists, and open change requests do not disable it afterward.
2. An authorized provider can create a valid milestone as `upcoming`; the save is immediately visible to every active project role.
3. The active sequence is shared, manual, deterministic, and limited to 50 milestones without a concurrency path beyond the limit.
4. Owners and active assigned team members can edit details, reorder, transition, and archive; both client roles are read-only.
5. Completed milestones remain editable and reorderable, and providers can reopen them without erasing their original completion history.
6. Any different-status transition is valid, multiple milestones may be in progress, and an optional note is immutable on its exact transition event.
7. Overdue is derived by the backend from the UTC calendar date exactly as specified and is not recomputed by clients.
8. One reorder changes only positions, validates the complete active ID set, and creates exactly one before/after activity event.
9. Archive requires confirmation and reason, is terminal, retains final progress state and all history, frees an active slot atomically, and exposes no hard delete or restore.
10. Archived milestones are available to all current project members newest-first through stable bounded pagination without loss of older records.
11. Every material shared mutation and its required immutable activity either commit together or not at all.
12. Stale, unauthorized, invalid, cross-project, over-limit, and injected persistence-failure cases apply no partial or contradictory change.
13. Current backend membership controls every read and action despite stale frontend data, role changes, removal, unassignment, or an unexpired session.
14. The milestone UI is responsive, keyboard usable, semantically labeled, and presents status, overdue state, errors, and confirmations accessibly.
15. No excluded task-management, requirement-linking, discussion, approval, attachment, email, notification, scheduling, percentage, AI, deliverable, completion, or general-history feature is introduced.
16. Backend and frontend lint, type checking, automated tests, production builds, critical browser checks, Docker builds, and backend container smoke validation pass before merge.
