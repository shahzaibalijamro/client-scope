# Slice 1.6: Completion, History, and Archival Requirements

**Status:** Approved — 2026-09-12

## Outcome

Workspace Owners can submit an authoritatively ready project for final client acceptance. A currently authorized Client Approver can approve completion or return the project to active work. Every completion attempt is preserved as an immutable numbered review round, and the first valid decision wins.

After approval, the project becomes a permanently read-only record. The Workspace Owner may move that record between completed and archived collections without reopening it. Current project members can understand the significant project story through a safe, paginated activity history.

## Scope

### Included

- Explicit project lifecycle states: `active`, `completion-in-review`, `completed`, and `archived`.
- Authoritative completion-readiness evaluation with explicit blocker codes.
- Immutable, monotonically numbered completion-review rounds.
- Workspace-Owner-only completion request and withdrawal.
- Client-Approver-only final approval or return to active work.
- Project workflow locking while final review is pending.
- Permanent project-content protection after final approval.
- Workspace-Owner-only archive and restore with required reasons.
- Separate active/in-review, completed, and archived project collections.
- A safe newest-first project activity feed built from existing and new project-audience activity.
- Role-aware completion pending actions and transactional email for completion-review events.
- Backend authorization, validation, atomicity, concurrency protection, frontend behavior, and automated tests.

### Excluded

- Reopening or editing a completed or archived project.
- Returning an archived project to `active` or `completion-in-review`.
- Permanent project deletion or destructive retention controls.
- Project-record export, legal evidence, compliance-grade audit guarantees, or cryptographic immutability.
- New comments or other project-content mutations after completion.
- General notification preferences, notification centers, digests, retries, push, SMS, or messaging integrations.
- AI assistance, autonomous lifecycle decisions, or AI-generated history.
- Internal tasks, checklists, assignees, priorities, boards, sprints, time tracking, or post-completion work management.
- Changes to the project roadmap status before implementation acceptance validation is complete.

## Domain Model and Terminology

### Project lifecycle

Every project has one authoritative lifecycle state:

| State | Meaning | Ordinary project content mutable | Terminal |
| --- | --- | --- | --- |
| `active` | Normal project workflows may proceed under their domain rules | Yes | No |
| `completion-in-review` | One immutable completion round awaits a final client decision | No | No |
| `completed` | A Client Approver finally approved the project | No | Yes |
| `archived` | A completed project is removed from normal collections for organization | No | Yes |

Existing projects without an explicit lifecycle value are treated as `active` during migration. The implementation must migrate or safely materialize that value without changing historical workflow records.

### Completion-review round

A completion-review round is an immutable project-scoped record containing:

- Project and workspace identifiers.
- A positive project-scoped round number.
- Status `in-review`, `approved`, `returned`, or `withdrawn`.
- Requester identity, display-name snapshot, `workspace-owner` role snapshot, and request time.
- An optional trimmed plain-text request summary.
- A readiness snapshot identifying the approved scope version, approved deliverables and versions, active milestones, and authoritative readiness evaluation time.
- For a terminal round: terminal actor identity, display-name and effective-role snapshot, terminal time, terminal outcome, and the required or optional note defined below.

Round numbers increase monotonically within a project, are allocated only by a successful request transaction, and are never reused. A failed request consumes no number. A returned or withdrawn round remains terminal and immutable; a later request creates the next round rather than reopening or rewriting the earlier one.

The project refers to at most one current `in-review` round. Terminal rounds remain readable to current project members in newest-first order.

### Archive lifecycle record

Archive and restore each preserve:

- The acting Workspace Owner's identifier, display-name snapshot, and role snapshot.
- The action time.
- A required trimmed plain-text reason.
- The project state before and after the action.

Archive/restore records are immutable project lifecycle history. Repeated archive/restore cycles create new records rather than overwriting earlier context.

### Project activity view

The project activity feed is a read projection over records whose audience is `project`. It is not a raw serialization of the activity collection or arbitrary `context` values.

Each public activity item contains only an allow-listed, event-specific shape:

- Stable activity identifier and event type.
- Occurrence time.
- Immutable actor identifier, display-name snapshot, and effective-role snapshot when an actor exists.
- Safe entity references and labels needed to understand the event, such as scope version number, change-request number, milestone title snapshot, deliverable/version number, or completion-round number.
- A concise product-authored description or structured fields from which the frontend produces that description.

Free-form notes, comments, reasons, provider draft content, email addresses, access tokens, revision tokens, storage identifiers, signed URLs, credentials, cleanup state, provider errors, and arbitrary stored activity context are never returned by the activity feed. Authorized users read approved notes or reasons from the associated domain history instead of duplicated activity payloads.

## State Model

### Valid project transitions

1. Request completion: `active` -> `completion-in-review`, creating the next immutable round as `in-review`.
2. Client approval: `completion-in-review` -> `completed`, ending the exact current round as `approved`.
3. Client return: `completion-in-review` -> `active`, ending the exact current round as `returned`.
4. Owner withdrawal: `completion-in-review` -> `active`, ending the exact current round as `withdrawn`.
5. Archive: `completed` -> `archived`, creating an archive lifecycle record.
6. Restore: `archived` -> `completed`, creating a restore lifecycle record.

No other transition is valid. In particular, `completed` and `archived` cannot return to active work, `active` cannot be archived, and archive/restore never creates or reopens a completion round.

### Completion-round outcomes

| Status | Meaning | Note rule |
| --- | --- | --- |
| `in-review` | Awaiting one final Client Approver decision | Request summary optional |
| `approved` | Exact round received final approval | Approval note optional |
| `returned` | Client returned the project to active work | Reason required |
| `withdrawn` | Workspace Owner withdrew the pending request | Reason required |

The first transaction that validly moves the exact current round out of `in-review` wins. Every later, repeated, or competing action against that round fails as stale and creates no lifecycle change, domain record, activity, numbering effect, or email.

## Completion Readiness

### Authoritative blockers

The server evaluates readiness from current authoritative records. A project is ready only when the blocker list is empty.

| Code | Blocking condition |
| --- | --- |
| `NO_APPROVED_SCOPE` | The project has no current approved scope version. |
| `NO_APPROVED_DELIVERABLE` | The project has zero deliverables in terminal `approved` state. |
| `NO_ACTIVE_CLIENT_APPROVER` | The project has no currently active Client Approver membership. |
| `PENDING_SCOPE_REVIEW` | A scope draft or nonterminal scope review exists that could change authoritative project work. |
| `ACTIVE_CHANGE_REQUEST` | A change-request aggregate exists outside terminal `approved`, `rejected`, or `canceled`. |
| `OPEN_DELIVERABLE` | A deliverable exists in `draft`, `in-review`, or `revision-draft`. |
| `INCOMPLETE_ACTIVE_MILESTONE` | An active milestone has a status other than `completed`. |

The readiness response may include safe counts and stable identifiers for provider roles so the blockers are actionable. It must not expose provider-private draft contents to client roles.

### Non-blocking history

The following historical records do not block completion:

- Rejected or canceled change requests and their withdrawn or changes-requested proposals.
- Superseded, rejected, withdrawn, or changes-requested scope versions when a current approved scope exists and no mutable/pending scope review remains.
- Approved or canceled deliverables and terminal earlier deliverable versions.
- Archived milestones, regardless of their final milestone status.
- Historical comments, access records, invitations, activity, and earlier completion rounds.

Canceled deliverables neither block readiness nor satisfy `NO_APPROVED_DELIVERABLE`. Only active milestones participate in the milestone readiness rule.

### Request-time rules

1. Readiness is advisory when displayed and authoritative only when recalculated inside the request transaction.
2. Only the Workspace Owner may request completion.
3. The request requires explicit confirmation, the latest lifecycle revision token, and an optional request summary of at most 2,000 trimmed plain-text characters.
4. The project must be `active`, and all authoritative blockers must be absent in the same transaction that allocates the round and changes project state.
5. The transaction snapshots the exact current approved scope, approved deliverables/versions, active milestones, requester, number, and time; creates project activity; and enters `completion-in-review` atomically.
6. A stale token, state change, newly introduced blocker, or concurrent request fails without consuming a round number.

## Final Review and Locking

### Workflow lock

While a project is `completion-in-review`, reject ordinary mutations that could change the reviewed project, including:

- Project name, description, deadline, or other project metadata changes.
- Scope drafts, submissions, comments, decisions, or withdrawals.
- Change-request drafts, submissions, comments, decisions, withdrawals, cancellations, or resulting scope changes.
- Milestone creation, editing, transition, reordering, or archival.
- Deliverable drafts, uploads, submissions, comments, decisions, withdrawals, cancellation, or attachment changes.
- New project invitations, assignments, client-role changes, or other ordinary access expansion/administration.

Reads remain available to currently authorized project members. The completion request itself may only transition through approval, return, or owner withdrawal.

### Security-authority exception

The final-review lock must never preserve authority that has been revoked. Security-relevant loss of access remains effective immediately, including account deactivation where supported, workspace-member removal or departure, project unassignment, client-member removal or departure, invitation revocation, session revocation, and equivalent access termination.

Every read and write rechecks current account, workspace, assignment, membership, project, lifecycle, and exact-round authority as applicable. A user removed during review immediately loses access. A Client Approver removed or demoted before deciding cannot decide, even if the session and page predate the change.

Security-relevant revocation activity remains recorded under the established access rules. Access expansion, replacement invitations, reassignment, or role elevation waits until the project returns to `active`; completed and archived projects never accept those ordinary mutations.

### Client decision

1. Only a currently active Client Approver for the exact project may approve or return the exact current round.
2. A Client Participant, provider role, former Approver, pending invitee, or Approver on another project has no decision authority.
3. Approval requires explicit confirmation and the exact round identifier/revision token. Its trimmed plain-text note is optional and at most 2,000 characters.
4. Return requires explicit confirmation and a reason of 1–2,000 trimmed plain-text characters.
5. Current membership/role, project state, exact current round, and revision token are rechecked in the authoritative transaction.
6. Approval atomically ends the round as `approved`, records actor/time/note, changes the project to `completed`, and creates project activity.
7. Return atomically ends the round as `returned`, records actor/time/reason, changes the project to `active`, and creates project activity.
8. Multiple Approvers do not vote. The first valid final decision is sufficient and wins concurrent races.

### Owner withdrawal

1. Only the current Workspace Owner may withdraw the exact current round.
2. Withdrawal requires explicit confirmation, the exact round identifier/revision token, and a reason of 1–2,000 trimmed plain-text characters.
3. Withdrawal atomically ends the round as `withdrawn`, records actor/time/reason, returns the project to `active`, and creates project activity.
4. Withdrawal races client decisions under the same first-writer-wins boundary.

## Completed and Archived Protection

1. Final approval permanently closes ordinary project work. Scope, change requests, milestones, deliverables, comments, project metadata, project membership expansion, invitations, and other project content cannot be created, edited, reopened, removed, or decided.
2. Existing project history, approved attachments, versions, comments, decisions, and activity remain readable to currently authorized members under their established access rules.
3. Security-relevant access loss remains allowed and immediate after completion or archival. Historical actor snapshots are never rewritten.
4. Only the Workspace Owner may archive a `completed` project or restore an `archived` project.
5. Archive and restore each require explicit confirmation, the latest lifecycle revision token, and a reason of 1–2,000 trimmed plain-text characters.
6. Archive/restore atomically changes lifecycle state, preserves actor/time/reason in a new immutable lifecycle record, and creates safe project activity.
7. Archive removes the project from active/in-review and completed collections and places it in the archived collection.
8. Restore removes it from the archived collection and returns it to the completed collection. It never returns to `active`, unlocks content, or creates a completion round.
9. Archive and restore send no email.

## Roles and Permissions

| Capability | Workspace Owner | Active assigned Service-Team Member | Active Client Participant | Active Client Approver |
| --- | --- | --- | --- | --- |
| View lifecycle state and completion history | Yes | Yes | Yes | Yes |
| View detailed readiness blockers | Yes | Yes | No | No |
| View client-safe pending final review | Yes | Yes | Yes | Yes |
| Request completion | Yes | No | No | No |
| Withdraw current completion review | Yes | No | No | No |
| Approve or return current completion review | No | No | No | Yes |
| View project activity history | Yes | Yes | Yes | Yes |
| Archive or restore | Yes | No | No | No |
| Mutate content after completion | No | No | No | No |

Workspace Owner access remains implicit through ownership. Service-Team Members require active workspace membership and active assignment to the exact project. Client roles require active membership in the exact project. Current authorization is checked on every request; historical participation or an immutable actor snapshot never grants access.

Unauthorized and cross-tenant reads or mutations use the established safe not-found behavior. Validly authorized users attempting a lifecycle-invalid action receive a conflict response that reveals no foreign data.

## Activity History

1. All current project members may read project-audience activity for the exact project, including members who joined after an event occurred.
2. Removed, inactive, departed, or unassigned users immediately lose activity access.
3. Owner-only workspace administration is excluded even if it is related to a person who later gained project access.
4. The feed includes existing allow-listed access, scope, change-control, milestone, and deliverable events plus:
   - `project.completion-requested`
   - `project.completion-approved`
   - `project.completion-returned`
   - `project.completion-withdrawn`
   - `project.archived`
   - `project.restored`
5. Existing activity that lacks a reliable role or label snapshot must be projected conservatively. The API may omit an unavailable optional field but must never infer historical identity or role from mutable current membership.
6. New events include immutable actor-role and display-label snapshots needed for stable future projection.
7. Results sort by `occurredAt` descending and then immutable identifier descending.
8. Pagination uses an opaque cursor bound to the exact project and sort tuple, with default limit 20 and maximum 50.
9. Concurrent newer inserts must not duplicate, skip, or reorder the older continuation represented by an already issued cursor.
10. Invalid, malformed, foreign-project, or context-mismatched cursors fail safely.

## Notifications and Pending Actions

### Email recipients

Recipients are resolved from authoritative current membership after the lifecycle transaction commits and are deduplicated by normalized email address:

- Completion request: all active Client Approvers for the exact project.
- Client approval: Workspace Owner plus active Service-Team Members who retain both workspace membership and exact-project assignment.
- Client return: Workspace Owner plus active Service-Team Members who retain both workspace membership and exact-project assignment.
- Owner withdrawal: all active Client Approvers for the exact project.
- Archive or restore: no email.

Pending invitees, inactive or removed members, participants, unassigned team members, and users from other projects are excluded. Messages contain only minimum safe project, action, actor, round, and navigation context; optional notes and required reasons are not emailed.

SMTP runs outside the authoritative database transaction. Partial or total email failure never rolls back committed lifecycle state, round history, numbering, or activity. The successful API response includes one safe warning without recipient addresses or provider diagnostics when delivery is incomplete.

### Project summaries

Lifecycle and completion pending actions compose with, rather than replace, existing scope, change-control, and deliverable summaries.

- Owner on a ready `active` project: completion readiness is actionable.
- Owner on `completion-in-review`: pending client decision, with withdrawal available.
- Assigned Service-Team Member on `completion-in-review`: pending client decision, read-only.
- Client Approver on `completion-in-review`: final decision required.
- Client Participant on `completion-in-review`: final review pending, without decision authority.
- `completed` and `archived`: terminal read-only lifecycle state with owner-only organization controls where valid.

Work responses separate active and `completion-in-review` projects, completed projects, and archived projects while preserving existing workspace grouping and current access rules.

## API Behavior

The versioned REST API must expose coherent operations equivalent to:

- Read lifecycle/readiness and completion-round history for an accessible project.
- Request completion as Workspace Owner.
- Withdraw the exact current round as Workspace Owner.
- Approve or return the exact current round as Client Approver.
- Archive a completed project and restore an archived project as Workspace Owner.
- Read safe project activity with cursor pagination.

Mutation inputs use strict schemas, explicit confirmation, exact identifiers, and opaque lifecycle revision tokens. Unknown fields are rejected. State-changing responses return the new lifecycle projection and any safe email warning. The implementation may align exact paths with established route conventions, but must not combine semantically distinct actions into an ambiguous generic update endpoint.

Expected failure categories include:

- Safe not-found for nonexistent, inaccessible, cross-workspace, or cross-project resources.
- Forbidden/no-authority where an accessible actor lacks the required role.
- Validation failure for absent confirmation, invalid outcome, malformed identifier/token/cursor, blank required reason, excessive text, or unknown fields.
- Readiness conflict with the complete current blocker list.
- Lifecycle conflict for an invalid source state.
- Stale conflict for an outdated lifecycle token, noncurrent round, or already-decided round.

No failure may partially change project state, consume a round number, create a terminal outcome, write activity, or send lifecycle email.

## Data Integrity and Concurrency

1. Project lifecycle state, current-round reference, next round number, and lifecycle revision support authoritative compare-and-set transitions.
2. Unique indexes prevent duplicate round numbers within a project and more than one current round.
3. Request readiness, round-number allocation, round creation, state transition, and activity commit atomically.
4. Approval, return, or withdrawal updates the exact current round, project state, and activity atomically.
5. Archive/restore state, lifecycle record, and activity commit atomically.
6. Required activity failure rolls back its associated domain transition.
7. Email begins only after a successful commit and is never treated as authoritative project state.
8. Retry after an unknown transport result must first refresh lifecycle state. Repeating a completed mutation never creates a second round, decision, lifecycle record, activity, or email command.

## Validation and Failure Behavior

- Optional request summaries and approval notes are trimmed, omitted when blank, and limited to 2,000 characters.
- Return, withdrawal, archive, and restore reasons contain 1–2,000 trimmed plain-text characters.
- All user-provided text renders as inert plain text with preserved wrapping; no Markdown, HTML, or script execution is supported.
- Readiness failures identify all current authoritative blocker codes in one response for authorized provider roles.
- A disappearing last Approver during final review prevents that user from deciding and may leave the project pending until the Owner withdraws; security revocation is never rejected merely to preserve decision availability.
- Unexpected database or email diagnostics are logged safely and are not exposed to clients.
- Activity descriptions remain understandable when referenced records later become terminal, are archived, or are no longer otherwise mutable.

## Acceptance Criteria

- The Workspace Owner can see explicit readiness blockers and cannot request completion until every authoritative blocker is absent.
- An approved scope, at least one approved deliverable, at least one active Approver, no active change request, no open deliverable, no pending mutable scope review, and all active milestones completed permits one completion request.
- Historical terminal scope, change, deliverable, milestone, and earlier completion records do not block a request.
- A successful request creates exactly one numbered immutable round, snapshots readiness, locks workflow mutations, records project activity, and notifies deduplicated active Approvers.
- Assigned Service-Team Members can see readiness and review state but cannot request or withdraw completion.
- A current Client Approver can approve or return the exact current round; a Participant or stale/former Approver cannot.
- Concurrent or repeated decisions are first-writer-wins and produce exactly one terminal outcome and one state transition.
- Client return and owner withdrawal require reasons, preserve the terminal round, return the project to `active`, and allow a later request with the next never-reused number.
- Security-relevant revocation takes effect during review and after completion without unlocking or mutating project content.
- Client approval permanently makes the project content read-only and notifies the Owner and deduplicated active assigned team members.
- Only the Owner can archive/restore; both require reasons and preserve actor/time context, send no email, and never reopen content.
- Active/in-review, completed, and archived collections display projects in the correct collection under current access rules.
- Current project members can page through a safe, deterministic, newest-first project activity feed; former or foreign users cannot.
- Activity responses expose only allow-listed event fields and stable historical snapshots, never arbitrary context or sensitive/private values.
- SMTP failure leaves committed lifecycle state and activity intact and returns a safe warning.
- Automated and manual validation passes without application behavior outside this specification being added.
