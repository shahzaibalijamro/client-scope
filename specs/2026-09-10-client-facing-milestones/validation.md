# Slice 1.4: Client-Facing Milestones Validation

**Status:** Approved validation plan — 2026-09-10

## Validation Goal

Prove that milestones give every active project member a clear, safe delivery-progress view after scope approval while preserving provider-only mutation authority, deterministic UTC overdue behavior, immutable change history, terminal archives, and concurrency-safe ordering and limits. Validation must also prove that the slice does not become task management, an approval workflow, or a dependency of scope/change control.

## Highest-Risk Behavior

The strongest automated evidence is required for:

1. Tenant isolation and current project-membership authorization on every read and mutation.
2. A concurrency-safe maximum of 50 active milestones.
3. Timeline-wide optimistic concurrency that prevents lost edits and partial reorder/archive results.
4. Exact complete-set reorder validation and proof that reorder changes positions only.
5. Atomic milestone, transition, archive, timeline, and activity writes.
6. Immutable completion, reopening, transition-note, and archive history.
7. Server-derived overdue state using one UTC calendar date with no browser-dependent result.
8. Terminal archival and lossless, deterministic cursor pagination.
9. Continued milestone availability while a formal change request is open.
10. Absence of client mutations and excluded task-management, notification, attachment, approval, and AI behavior.

## Evidence Recording

For each validation run, record:

- Source branch and commit SHA.
- Node and npm versions used by each application.
- Test category, exact command, result, and relevant non-sensitive artifact path.
- Database category used for integration tests without connection strings or credentials.
- Browser/device profile used for manual or Playwright checks.
- Any approved exception, its risk, owner, and follow-up condition.

Never record passwords, cookies, CSRF values, session tokens, milestone revision tokens, archive cursors, private project text, email addresses, MongoDB URLs, or provider credentials.

## Automated Validation

### Domain contracts and validation

- Accept exactly `upcoming`, `in-progress`, and `completed` as stored progress statuses.
- Reject `overdue`, `archived`, unknown casing, and unknown values as stored progress statuses.
- Accept trimmed titles from 1 through 120 characters and reject blank or longer titles.
- Normalize blank descriptions and transition notes to absent; accept nonblank values through 2,000 characters and reject longer values.
- Accept archive reasons from 1 through 2,000 trimmed characters and reject blank or longer reasons.
- Accept real date-only values in exact `YYYY-MM-DD` form, including past and future dates.
- Reject impossible dates, timestamps, locale-formatted dates, and otherwise malformed targets.
- Validate public identifiers, opaque revision tokens, confirmation literals, reorder arrays, archive cursors, and limits.
- Accept archive page limits `1..50`, apply default `20`, and reject values outside the range.

### Lifecycle and overdue unit tests

- New milestones always start `upcoming`; caller-supplied initial status is rejected or ignored by a contract that does not accept it.
- Exercise all six directed transitions between the three statuses.
- Reject or short-circuit same-status transitions without a transition event, activity, or revision change.
- Allow multiple milestones to be `in-progress` simultaneously.
- Permit title, description, target-date, and position changes while `completed` without changing status.
- Complete, reopen, and complete again while retaining all three immutable transition events in order.
- Bind each optional note to its exact transition and expose no note-edit operation.
- With an injected clock around UTC midnight, prove that yesterday is overdue, today is not, tomorrow is not, and missing target is not.
- Prove completed-past-date is not overdue and reopened-past-date is overdue immediately.
- Prove one response derives every item using one UTC date even if the clock source would cross a day boundary during serialization.

### Active timeline and prerequisite API tests

- Return a readable pre-approval state for all active project roles and reject creation without current approved scope.
- Create the first milestone after scope approval and append later milestones deterministically.
- Keep milestone reads and mutations available while change requests are in draft, in review, revision draft, or otherwise active.
- Prove change-request approval does not mutate milestone identity, content, status, order, or history.
- Return all active milestones in the same order for every active role.
- Return active count, limit, stable identifiers, timestamps, positions, latest transition context, and server-derived overdue values.
- Return the opaque timeline revision only to authorized provider roles.
- Apply no database write merely by reading an absent or empty timeline.

### Authorization and tenant-isolation tests

- Exercise read and mutation capabilities for Workspace Owner, active assigned Service-Team Member, active Client Participant, and active Client Approver.
- Prove both client roles can read active/archive data and cannot create, edit, transition, reorder, or archive.
- Prove an unassigned team member, pending invitee, inactive member, removed member, and unrelated authenticated user receive established safe failures.
- Revoke membership or assignment after a read and before a mutation; the stale revision and live session must not preserve authority.
- Attempt reads and writes using workspace, project, milestone, and cursor data from another tenant or project without confirming private resource existence.
- Prove historical actor/role snapshots never confer present authority.

### Creation, limit, and concurrency tests

- Create valid milestones with absent description/date and with maximum-length valid fields.
- Confirm creation stores `upcoming`, appends final position, increments count, advances revision, and creates exactly one activity record.
- Reject stale-revision creation without a milestone, reserved position, count change, revision advance, or activity.
- Fill a timeline to 50 active milestones and reject the fifty-first atomically.
- At 49 active milestones, issue two simultaneous valid creates and prove exactly one succeeds, final active count is 50, positions remain unique/contiguous, and only one activity is added.
- At counts below 49, prove timeline revision concurrency still prevents silent lost writes and permits retry after refresh.
- Inject failures after prospective count/position changes and prove the complete create rolls back.

### Detail-edit API tests

- Edit title, description, and target date independently and together in each progress status.
- Clear optional description and date according to the public contract.
- Prove a detail edit cannot change status, position, archive state, latest transition note, or unrelated data.
- Verify one material edit advances revision and creates one activity with accurate changed-field before/after values.
- Submit identical normalized values and prove no misleading activity or revision advance occurs.
- Race edits against edits, status transitions, reorder, archive, access removal, and scope-state changes; at most one operation using one revision succeeds.
- Inject milestone or activity persistence failure and prove no partial edit survives.

### Status-transition and immutable-history tests

- Verify every successful transition preserves title, description, target date, and position.
- Verify one transition changes status, advances revision, stores one immutable transition event, and creates one activity in the same transaction.
- Verify the latest-transition read model changes to the winning event while prior events remain stored.
- Verify notes preserve trimmed line breaks and cannot be edited or deleted through any route.
- Reopen a completed milestone and confirm the original completion event, actor, role, time, and note remain unchanged.
- Race two transitions and transition versus archive; one current-revision operation wins and the loser produces no partial transition/history.
- Inject transition or activity failure and prove status and latest-transition context remain unchanged.

### Reorder tests

- Reorder mixed upcoming, in-progress, and completed milestones successfully.
- Prove the stored and returned order matches the exact requested sequence with contiguous positions.
- Reject payloads with missing, duplicate, unknown, archived, extra, or foreign-project identifiers.
- Reject a sequence based on a stale revision after create, edit, transition, reorder, or archive.
- Treat the current sequence as a no-op without changing revision, timestamps, or activity.
- For one material reorder, verify exactly one activity record with complete before/after identifier sequences.
- Snapshot every non-position field before reorder and prove status, transition history, completion state, title, description, target date, archive facts, and content timestamps are unchanged afterward.
- Race reorder with reorder and reorder with another mutation; prove one atomic winner and contiguous final positions.
- Inject a position or activity failure and prove the original complete order remains.

### Archive and pagination tests

- Archive upcoming, in-progress, and completed milestones with explicit confirmation and valid reasons.
- Prove archival retains final content/status/transitions, records actor/role/time/reason, compacts active positions, decrements count, advances revision, and creates one activity atomically.
- Prove archiving from a 50-item timeline frees one slot only after commit and permits a later valid creation.
- Reject missing confirmation, blank/oversized reason, stale revision, inaccessible milestone, and already archived milestone without change.
- Prove no restore or hard-delete route exists and archived records reject active mutations safely.
- Return archives newest-first with stable identifier tie-breaking when timestamps match.
- Verify default 20-item pages, accepted custom limits, next-cursor presence only when needed, non-overlapping pages, and eventual retrieval of all older records.
- Reject malformed or foreign-context cursors safely without exposing database keys.
- Add new archives between page requests and prove cursor semantics remain deterministic without loss or duplication relative to the defined ordering contract.
- Inject archive/activity failure and prove the milestone remains active at its original position and capacity is not freed.

### Activity and side-effect tests

- Verify exactly one project-shared activity record for create, material edit, status transition, material reorder request, and archive.
- Verify no activity for reads, invalid/no-op edits, same-status requests, identical reorder, or failed/stale mutations.
- Verify activity stores stable project/milestone, actor display-name and role snapshots, timestamp, action, and approved minimal context.
- Verify detail-edit activity has correct before/after changed fields and no unnecessary private request content.
- Verify reorder activity is one record with complete before/after sequences, not one record per milestone.
- Verify transition notes and archive reasons are immutable and attached to the correct exact event.
- Make activity persistence fail and prove the corresponding domain mutation rolls back.
- Spy on the email boundary and prove milestone operations never invoke it.

### Frontend component and behavior tests

- Render the conceptual separation among agreed scope, formal change control, and delivery milestones.
- Render pre-approval and post-approval empty states appropriate to provider and client roles.
- Show active milestones in API order with text status, optional target/description, server-supplied overdue indication, and latest transition context.
- Never derive overdue from mocked browser time; render the boolean supplied by the API.
- Show provider create/edit/transition/reorder/archive controls for upcoming, in-progress, and completed milestones.
- Show no mutation, comment, acknowledgement, approval, attachment, or notification controls to either client role.
- Verify optional transition note is entered only during a status action and historical note text has no edit control.
- Verify keyboard-accessible up/down reorder, correct disabled boundaries, and refreshed shared order.
- Verify archive confirmation names the milestone, requires reason, manages focus, and moves the item to the archive view after success.
- Verify newest-first archive pages append through a load-more control without dropping earlier rendered records.
- Verify loading, empty, validation, stale, success, and unexpected-error messages use status/alert semantics and useful recovery actions.
- Verify long text wrapping, preserved line breaks, semantic labels, focus behavior, and no color-only meaning.

## Focused Playwright Journeys

### Journey 1: Approved scope to shared progress

1. Establish a project with approved scope and all four active roles.
2. As the owner, create two milestones and verify both begin upcoming in append order.
3. As an assigned team member, edit a milestone and transition both milestones to in progress.
4. As Client Participant and Client Approver, verify the same order/content/status and no mutation controls.
5. Open a change request and verify milestone management remains available and unchanged.

### Journey 2: Completion, edit, and reopening

1. Transition a past-target milestone to completed with a note.
2. Edit its title, description, target date, and position while it remains completed.
3. Verify it is not overdue while completed.
4. Reopen it to in progress with a second note and verify the server-provided overdue indicator.
5. Verify the latest note is shown and inspect safe test data to prove the original completion and reopening events both remain immutable.

### Journey 3: Reorder and archive

1. Create mixed-status milestones and reorder them using keyboard controls.
2. Verify clients see the new shared order and all non-order values remain unchanged.
3. Archive one milestone with confirmation/reason and verify active compaction.
4. Load archived records and verify newest-first retained content, final status, archive context, and absence of restore/delete controls.
5. Navigate through enough seeded archive records to verify bounded load-more behavior.

### Journey 4: Stale state and access loss

1. Open the same timeline in two provider sessions using one revision.
2. Commit a mutation in the first session and attempt a conflicting edit or reorder in the second.
3. Verify the second receives a clear stale message, refreshes authoritative state, and does not overwrite the winner.
4. Remove or unassign the second provider before another mutation and verify the live session no longer authorizes it.
5. Verify another project’s identifiers reveal no private milestone information.

## Manual Acceptance Checks

### Provider experience

- Confirm milestone language consistently describes client-facing delivery stages rather than internal work.
- Create, edit, transition, reorder, and archive with both owner and assigned-team accounts.
- Confirm completed records retain every provider control approved by the requirements.
- Confirm an open change request does not disable or visually confuse milestone management.
- Confirm the 50-item limit and stale-recovery messages explain what the provider can do next.

### Client and responsive experience

- Review active and archived milestones as both client roles on desktop and a narrow mobile viewport.
- Confirm the shared order, status, target, overdue text, latest update, and archive facts are understandable without project-management expertise.
- Confirm no client mutation or discussion affordance appears.
- Confirm long titles/descriptions/notes/reasons wrap without horizontal scrolling.

### Accessibility

- Complete every provider action by keyboard without drag and drop.
- Verify logical focus order, visible focus, dialog focus trapping/return, labeled fields, described errors, and live-region announcements.
- Verify status, overdue, archive, disabled actions, and errors remain understandable without color.
- Inspect semantic headings, lists, buttons, dates, and status text with a screen reader.

### Persistence and privacy inspection

- Confirm active positions are contiguous and archive ordering/indexes match the specification.
- Confirm transition notes and archive reasons exist only in their immutable event/archive contexts.
- Confirm client responses omit usable revision tokens and database internals.
- Confirm logs and API errors omit private project content, raw tokens/cursors, cookies, CSRF values, and database details.
- Confirm no milestone email is attempted and no notification-center or general activity UI is introduced.

## Static, Build, Browser, and Container Checks

Run from `backend/`:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

Run from `frontend/`:

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Run repository CI-equivalent Docker and smoke checks defined by the Phase 0 delivery specification:

- Build the backend production image.
- Start it with safe test configuration and verify the public health endpoint.
- Build the frontend production image as the required portability artifact.
- Confirm no image is published and no deployment provider is invoked during pull-request validation.

## Constitution and Scope Review

Confirm before merge that:

- Backend authorization, tenant isolation, validation, and transactions remain authoritative.
- Milestones remain useful with Gemini disabled or unavailable and contain no AI dependency.
- Shared changes and history are not silently erased.
- Requirements/change requests still define agreed work, while milestones describe delivery progress only.
- No internal tasks, assignees, priorities, dependencies, percentages, schedules, approval chains, discussions, attachments, notification center, or general activity view was added.
- MongoDB stores milestone and file-free metadata only; Cloudinary is not introduced by this slice.
- The Express API remains the sole business boundary and the frontend continues to use the same-origin `/api` proxy.
- Accessibility, mobile client review, predictable errors, and maintainable explicit rules meet constitution priorities.
- `specs/roadmap.md` still does not mark Slice 1.4 complete before implementation acceptance.

## Merge Gate

Slice 1.4 implementation is safe to merge only when:

1. Every acceptance criterion in `requirements.md` has recorded evidence.
2. Highest-risk authorization, concurrency, limit, ordering, history, archive, and UTC-date behaviors pass automated tests.
3. Frontend and backend lint, type checks, tests, and production builds pass.
4. Critical Playwright journeys, both Docker builds, and the backend image smoke test pass.
5. Manual responsive and accessibility checks have no unresolved release-blocking issue.
6. No unexpected secrets, private data, raw tokens/cursors, or provider diagnostics appear in artifacts or logs.
7. No excluded behavior or application-level ambiguity was implemented without specification amendment and approval.
8. The implementation diff, documentation, and evidence have been reviewed against the mission, technology stack, roadmap, and this approved feature specification.

## Implementation Evidence

### Local implementation run — 2026-09-11

- Source baseline: `f3708c9e60b9aad35eb9440ff3de2c237262d735` on `codex/client-facing-milestones`, with the approved Slice 1.4 specification and implementation present as uncommitted workspace changes.
- Environment: local Windows workspace with Node.js `v22.23.0` and npm `10.9.8`; production Docker builds used the repository-pinned `node:24.20.0-bookworm-slim` image.
- Backend: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` passed. The final suite reported 11 files and 83 tests passing. Slice-specific evidence covers strict contracts and date validation, all directed lifecycle rules, pre-approval reads without persistence, provider/client authority, server-overdue serialization, stale writes, no-op edits, invalid complete-order requests, open-change-request independence, immutable completion/reopening events, deterministic archive pagination and invalid cursors, tenant-safe failures, access revocation, exact activity counts, no milestone email, rollback on activity failure, and competing creation at the 50-item boundary.
- Frontend: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` passed. The final suite reported 6 files and 26 tests passing. Slice-specific component tests cover client read-only rendering, use of the API-supplied overdue boolean, preserved line breaks and safe text rendering, completed-item provider controls, keyboard-operable ordering, transition/archive dialogs, and archive load-more behavior.
- Browser: all eight Chromium journeys reported passing, including the new milestone journey for scope approval, create/order/status/reopen/archive behavior, immutable latest-note presentation, a 390×844 client view, read-only client controls, and no document-level horizontal overflow. As in the previous slice's local Windows run, the Playwright process required manual interruption after every test had reported `ok` while its managed web servers were tearing down; the clean Linux CI job remains required before merge.
- Containers: both production Dockerfiles built successfully with the established frontend backend-origin argument. The backend image started against a temporary MongoDB 8.0 container and returned exactly `status=ok` and `database=connected` from `/api/v1/health`; both explicitly named temporary containers and their network were removed afterward. No image was published and no deployment provider was invoked.
- Static diff hygiene: `git diff --check` passed. No Playwright failure screenshots or traces were retained.
- Manual acceptance and pull-request CI have not yet been recorded. The roadmap therefore remains unchanged and Slice 1.4 must not be marked complete until the approved responsive, keyboard, focus, screen-reader, privacy inspection, and Linux CI checks are completed.
