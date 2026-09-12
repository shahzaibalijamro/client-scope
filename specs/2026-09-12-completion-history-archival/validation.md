# Slice 1.6: Completion, History, and Archival Validation

## Highest-Risk Behavior

- Completion must never be requested from stale or incomplete authoritative project state.
- Only the Workspace Owner may request or withdraw; only a current exact-project Client Approver may decide; only the Owner may archive or restore.
- Final-review locking must preserve the reviewed content without delaying security-relevant access loss.
- The first valid approval, return, or withdrawal must win without duplicate outcomes, activity, numbering, or email.
- Final approval must permanently protect project content; archive/restore must never reopen work.
- Project history must preserve stable meaning without leaking arbitrary activity context, private drafts, or sensitive operational data.
- Lifecycle state and required activity must commit atomically; email failure must not undo committed state.

## Automated Checks

### 1. Readiness rule tests

Verify each blocker independently and in combination:

- `NO_APPROVED_SCOPE` when no current approved scope exists.
- `NO_APPROVED_DELIVERABLE` when there is no approved deliverable, including when only canceled deliverables exist.
- `NO_ACTIVE_CLIENT_APPROVER` when no current active Approver exists.
- `PENDING_SCOPE_REVIEW` for every mutable or nonterminal scope-review condition capable of altering authoritative work.
- `ACTIVE_CHANGE_REQUEST` for draft, in-review, or revision-draft/nonterminal requests and absence of the blocker for approved, rejected, or canceled requests.
- `OPEN_DELIVERABLE` for `draft`, `in-review`, and `revision-draft`, and absence for approved or canceled deliverables.
- `INCOMPLETE_ACTIVE_MILESTONE` for active upcoming/in-progress milestones, and absence for completed active milestones or any archived milestone.
- Multiple simultaneous blockers return one complete, deterministic blocker set.
- Readiness uses authoritative committed state rather than client-supplied counts or a previously fetched response.
- Provider responses may include safe blocker details; client responses reveal no private draft content.

Verify a project becomes ready only with a current approved scope, at least one approved deliverable, at least one active Approver, no pending scope review, no active change request, no open deliverable, and every active milestone completed.

### 2. Roles, tenant isolation, and current authority

Verify:

- Owner can read readiness, request, withdraw, archive, and restore only in valid lifecycle states.
- Assigned Service-Team Member can read readiness/blockers/history but cannot request, withdraw, decide, archive, or restore.
- Client Participant can read client-safe lifecycle/history but cannot see provider-private readiness detail or decide.
- Active Client Approver can decide the exact current round but cannot request, withdraw, archive, or restore.
- Pending invitees, inactive/removed members, unassigned team members, former Approvers, and users from another project/workspace receive safe denial.
- Owner implicit access and team/client contextual access are re-evaluated on every operation.
- Removed members retain immutable historical attribution but no current active, completed, archived, round, attachment, or activity access.

### 3. Completion request and numbering

Verify:

- A valid confirmed request creates one round, assigns round 1, snapshots the exact approved scope/deliverables/milestones, changes the project to `completion-in-review`, advances lifecycle revision, and creates one activity event atomically.
- Request summary is optional, trimmed, inert plain text, omitted when blank, and rejected above 2,000 characters.
- Missing confirmation, stale lifecycle token, invalid state, or any transaction-time blocker creates no round, number, activity, state change, or email.
- Concurrent valid requests produce exactly one round and one successful response.
- Returned/withdrawn rounds remain immutable; later valid requests allocate 2, 3, and so on without reuse.
- Injected round, project, or activity persistence failure rolls the complete request back, including number allocation.

### 4. Approver decisions and owner withdrawal

Verify:

- Approval with an optional valid note ends the exact round as `approved` and project as `completed` atomically.
- Return requires a 1–2,000 character reason, ends the round as `returned`, and returns the project to `active` atomically.
- Owner withdrawal requires a 1–2,000 character reason, ends the round as `withdrawn`, and returns the project to `active` atomically.
- Notes/reasons preserve inert plain text and actor/display-name/effective-role/time snapshots.
- Exact current round and lifecycle token are required.
- Two Approvers racing, an Approver racing Owner withdrawal, and repeated identical actions result in one winner and one terminal outcome.
- Losers receive a stale conflict and create no state, activity, note, email, or copied round.
- An Approver removed or demoted before commit cannot decide, even with a previously valid session/token.
- Injected persistence/activity failure rolls the transition back completely.

### 5. Review locking and security-revocation exception

While `completion-in-review`, verify rejection of every supported mutation for:

- Project metadata.
- Scope drafts, submissions, comments, decisions, and withdrawals.
- Change-request drafts, submissions, comments, decisions, withdrawals, cancellations, and scope application.
- Milestone creation, editing, state transition, reorder, and archive.
- Deliverable creation/draft edit/upload/finalization/submission/comment/decision/withdraw/cancel and attachment mutation.
- New project invitation, assignment, access expansion, and role elevation/change.

Also verify:

- Reads remain available to current members.
- Workspace removal/departure, unassignment, client removal/departure, invitation revocation, session revocation, and supported account deactivation take effect immediately.
- Revocation does not alter reviewed project content or completion-round history.
- A revoked user cannot read, comment, decide, withdraw, or obtain a new attachment-access result afterward.
- If the last Approver is removed, the round remains pending until the Owner withdraws; revocation itself is not blocked.

### 6. Completed and archived protection

Verify after approval that every ordinary project/content/access-expansion mutation is rejected, including new comments and attempts to reopen scope, change requests, milestones, or deliverables.

Verify:

- Current members retain authorized read access to preserved content, versions, comments, attachments, decisions, rounds, and activity.
- Security-relevant access removal remains effective.
- Only Owner can archive from `completed` and restore from `archived`.
- Archive/restore require confirmation, current lifecycle token, and 1–2,000 character reason.
- Each action preserves immutable actor/role/time/reason, advances lifecycle revision, and creates exactly one safe activity atomically.
- Archive moves the project only to the archived collection; restore moves it only to completed.
- Restore never enables mutation, returns to active, or creates a completion round.
- Repeated/stale/wrong-state archive or restore creates no record, activity, email, or partial state.
- Archive/restore persistence or activity failure rolls back completely.

### 7. Activity projection and pagination

For every allow-listed access, scope, change-control, milestone, deliverable, completion, archive, and restore event, verify:

- The response uses its explicit event-specific projection and contains stable id/type/time/actor/entity context.
- New actor-role and display-label snapshots remain unchanged after membership, role, entity state, or project collection changes.
- Older events lacking optional snapshots remain truthful and understandable without inferred historical roles.
- Free-form notes/comments/reasons, provider drafts, email addresses, tokens, storage/provider identifiers, signed URLs, credentials, cleanup details, arbitrary context keys, and diagnostics are absent.
- Owner-only events never enter the project feed.
- Current exact-project members can read; removed, inactive, unassigned, foreign-project, and cross-workspace users cannot.
- Ordering is `occurredAt` descending then identifier descending.
- Default limit is 20, maximum is 50, and bounds are validated.
- Opaque cursors are bound to the project and sort tuple; malformed, tampered, and foreign-project cursors fail safely.
- Paging has no duplicates or missing older events, including when newer events commit between page requests.

### 8. Notification tests

Verify recipient resolution and normalized-address deduplication:

- Request and withdrawal include all and only active exact-project Client Approvers.
- Approval and return include the Workspace Owner plus all and only active team members with both active workspace membership and exact-project assignment.
- Participants, pending invitees, removed/inactive clients, unassigned/inactive team members, and foreign-project users are excluded.
- A person reachable through duplicate source records receives one message.
- Archive and restore emit no email command.
- Emails contain minimum safe project/action/round/navigation context and omit optional notes, reasons, private work, addresses of other recipients, and secrets.
- Email starts only after commit.
- Partial/total SMTP failure preserves state, round, numbering, activity, and pending summaries and returns one safe warning without addresses or provider diagnostics.

### 9. Project summaries and collection tests

Verify:

- Lifecycle state and completion pending action compose with existing scope, change-control, and deliverable summaries.
- Ready Owner receives the request action; assigned team receives readiness visibility without the action.
- During review, Owner/team/Participant see an accurate pending state and Approver sees decision-required.
- Completed and archived summaries expose terminal read-only state and only valid Owner organization controls.
- Active and `completion-in-review` projects appear in the normal collection, completed projects in completed, and archived projects only in archived.
- Collection placement updates immediately after each committed transition and email outcome does not affect it.
- All collections enforce current contextual access and do not leak projects through counts or empty groups.

### 10. Frontend behavior and accessibility tests

Use React Testing Library to verify:

- Readiness blockers are understandable, complete, and actionable for provider roles.
- Owner-only request and withdrawal controls and Approver-only decision controls render correctly.
- Required reasons, optional notes, exact-action confirmation, stale conflicts, and safe email warnings are announced accessibly.
- Team members and Participants never receive hidden authority through keyboard, direct event calls, or stale cached data.
- Review, completed, and archived states clearly suppress all prohibited content controls.
- Archive/restore dialogs require reasons and restore communicates that the project remains completed/read-only.
- Activity loading, empty, pagination, unavailable historical snapshots, and failure states remain understandable.
- Active/completed/archived collections, status badges, and pending actions do not rely on color alone.
- Long names, labels, and plain-text notes/reasons wrap safely and render without markup execution.
- Dialog focus containment/return, visible focus, headings, landmarks, labels, live regions, and keyboard operation are correct.

## Critical End-to-End Journeys

### Journey A — Return, correction, and new completion round

1. Owner opens an authoritatively ready active project and requests completion with an optional summary.
2. Verify round 1, locked project workflows, Approver pending action, and deduplicated request email.
3. Participant sees the pending review but no decision controls.
4. Approver returns round 1 with a required reason; verify project becomes active and providers are notified.
5. Provider completes the required ordinary workflow correction.
6. Owner requests completion again; verify immutable returned round 1 and current round 2.
7. Approver approves round 2; verify permanent completed/read-only state, preserved histories, activity, and provider notification.

### Journey B — First-writer-wins and revocation during review

1. Owner requests completion for a project with two active Approvers.
2. Remove or demote one Approver through the permitted security-authority path while review remains pending.
3. Verify the removed Approver immediately loses read and decision authority.
4. Race approval by the remaining Approver against Owner withdrawal.
5. Verify exactly one outcome, one project transition, one activity event, correct notification command, and a stale safe failure for the loser.

### Journey C — Archive and restore remain read-only

1. Owner archives a completed project with confirmation and reason.
2. Verify it leaves completed and appears in archived for every current member, with no email.
3. Verify all content mutation attempts remain blocked while reads and authorized historical attachments remain available.
4. Owner restores with confirmation and reason.
5. Verify it returns only to completed, remains permanently read-only, preserves both lifecycle records/activity, creates no completion round, and sends no email.

### Journey D — Activity pagination and access loss

1. Read a multi-page project feed containing events from all completed slices and Slice 1.6.
2. Insert a newer safe event after page one, then continue with the existing cursor and verify no duplicate or skipped older event.
3. Verify projected events contain stable actor/entity meaning and no forbidden context.
4. Remove the reader's project access and verify subsequent page and direct history requests fail safely.

## Manual Checks

### Responsive and accessibility review

At narrow mobile and desktop widths:

- Complete Owner request/withdraw/archive/restore and Approver return/approval flows using keyboard only.
- Verify focus order, dialog containment and restoration, visible focus, labels, error association, live announcements, headings, landmarks, and status semantics.
- Confirm readiness blockers, lifecycle status, immutable rounds, collection navigation, activity items, and long text wrap without core horizontal scrolling.
- Confirm read-only states and role authority are understandable without relying on color.

### Browser and failure review

- Exercise current evergreen Chrome, Edge, Firefox, and Safari where available.
- Confirm refresh/retry recovery after stale transitions, competing decisions, expired sessions, and partial email failure.
- Review logs and client responses under malformed and malicious requests for private draft content, free-form history payloads, tokens, credentials, provider identifiers, email addresses, and database/provider diagnostics.

## Scope-Exclusion Checks

Confirm implementation adds none of the following:

- Completed-project reopening, post-completion comments, or mutable terminal content.
- Permanent project deletion or destructive retention controls.
- Project export or compliance/legal-evidence claims.
- AI dependency or AI-directed lifecycle decisions.
- Notification preferences, notification center, digests, retries, push, SMS, or messaging integrations.
- Internal tasks, checklists, assignments of work, priorities, boards, sprints, or time tracking.
- Email for archive/restore.
- Raw activity-context exposure or a generic unvalidated activity serializer.

## Required Repository Checks

Run from each application directory as appropriate and record exact results.

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

- Focused Slice 1.6 Playwright journeys.
- Existing Phase 0 and Slice 1.1–1.5 regression journeys.
- Frontend Docker build.
- Backend Docker build.
- Backend-container runtime health smoke test.

## Implementation Evidence

### 2026-09-12 implementation run

- Backend lifecycle models, readiness evaluation, exact-round transitions, workflow locking, safe activity projection, notification routing, and project collection placement were implemented with focused rule and API integration coverage.
- Frontend lifecycle/readiness controls, immutable completion and archive histories, paginated activity, read-only presentation, and active/completed/archived collections were implemented with React Testing Library coverage.
- Backend required checks passed: typecheck, lint, 16 Vitest files / 99 tests, and production TypeScript build.
- Frontend required checks passed: typecheck, lint, 8 Vitest files / 32 tests, and Next.js production build.
- The focused Slice 1.6 Chromium journey passed, covering authoritative readiness, final-review locking, client approval, permanent completion protection, archive, and restore.
- The ten existing and new Chromium journeys were exercised. After correcting an active-project fallback label exposed by two Slice 1.1 checks, all three Slice 1.1 journeys passed on rerun; the other seven regression/lifecycle journeys passed in the preceding full run. On this Windows host, Playwright's child web servers did not exit after reporting results and the runner required manual termination after completion output.
- Frontend and backend Docker builds and the backend-container smoke test were initially unavailable because the Docker Desktop Linux engine was not running (`dockerDesktopLinuxEngine` pipe not found).
- Responsive/manual multi-browser review remained outstanding beyond the automated Chromium and component-level accessibility checks at the end of this run.

The roadmap status remained unchanged after this implementation run pending the Docker and manual acceptance gates.

### 2026-09-13 completion gate

- The user confirmed the responsive/manual acceptance review is complete.
- The production backend image built successfully as `clientscope-backend:slice-1.6` from the pinned Node.js `24.20.0` Dockerfile.
- The production frontend image built successfully as `clientscope-frontend:slice-1.6` with `BACKEND_API_ORIGIN=http://backend:4000`.
- The backend image ran against a disposable MongoDB 8.0 container on an isolated Docker network and returned exactly `{"status":"ok","database":"connected"}` through `127.0.0.1:4400`.
- The disposable backend container, MongoDB container, and isolated network were removed after the successful smoke check. The locally built validation images remain available.
- The Windows Playwright child-process teardown behavior did not invalidate the reported passing browser assertions; all required journeys and regression checks are accepted as passed.
- The complete Slice 1.6 acceptance and repository delivery gates now pass. The roadmap status is updated to complete.

## Merge Gate

- Every approved acceptance criterion is implemented and validated.
- Readiness, owner/Approver authority, tenant isolation, locking, revocation, concurrency, terminal protection, and activity redaction have automated coverage at the lowest reliable layers.
- Required domain state and activity are proven atomic under injected failures.
- Notification recipient and SMTP-failure behavior match the specification exactly.
- Responsive, accessibility, browser, and critical end-to-end journeys pass.
- Backend/frontend types, lint, tests, builds, regression suites, Docker builds, and backend smoke checks pass.
- Implementation evidence is recorded safely after validation.
- No excluded behavior or unrelated infrastructure is added.
- Roadmap status changes only after the complete acceptance gate passes.
