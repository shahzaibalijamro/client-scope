# Slice 1.4: Client-Facing Milestones Implementation Plan

**Status:** Approved implementation plan — 2026-09-10

This plan breaks the approved Slice 1.4 behavior into vertical task groups. Each group must leave the repository coherent and keep verification close to the rule it proves. Newly discovered product ambiguity must return to `requirements.md` for approval rather than becoming an undocumented implementation choice.

## 1. Define milestone contracts and lifecycle rules

1. Define the `upcoming`, `in-progress`, and `completed` status type separately from active/archive record state and derived overdue state.
2. Add strict backend Zod schemas and TypeScript types for active milestones, archived milestones, latest transition context, timeline summary, permissions, cursor pages, and mutation results.
3. Define inputs for create, detail edit, status transition, complete-list reorder, and confirmed archive operations, including the expected timeline revision.
4. Mirror public response contracts in strict frontend schemas without adding a shared package or Next.js business endpoint.
5. Encode title, description, note, reason, date-only, status, list-size, archive-page, and cursor validation exactly as approved.
6. Add pure lifecycle and UTC-overdue rule tests before persistence or route work.

## 2. Add persistence, indexes, and timeline concurrency

1. Add Mongoose records for milestone timeline state, active/archived milestone records, and immutable status-transition context where it is not fully represented by project activity.
2. Store stable project/workspace identifiers, explicit active position, progress status, archive facts, actor snapshots, and timestamps without requirement or change-request references.
3. Add database protections for one timeline per project, deterministic active positions, and indexes supporting project active order and newest-first archive pagination.
4. Represent the opaque timeline revision independently from client-visible domain fields and prevent clients from receiving a usable mutation token.
5. Include new models and indexes in explicit startup synchronization and isolated test cleanup.
6. Add a testable clock boundary whose UTC date is used once per read response for all overdue calculations.

## 3. Centralize contextual authorization and role-safe serialization

1. Reuse effective project-role resolution for all milestone reads and writes.
2. Permit reads for the Workspace Owner, active assigned Service-Team Members, active Client Participants, and active Client Approvers.
3. Permit mutations only for the owner and active assigned team members; treat both client roles as read-only.
4. Recheck current access and current approved-scope existence inside state-changing transactions.
5. Build serializers that expose common milestone/history data to all active roles, provider permissions and timeline revision only where authorized, and no storage internals.
6. Preserve established safe not-found behavior for foreign, inaccessible, archived-as-active, and cross-project identifiers.
7. Add integration tests for the full permission matrix, mixed-role users, access removal, and tenant isolation.

## 4. Implement active timeline reads and deterministic overdue state

1. Return the complete active list in explicit manual order with count, limit, role-aware permissions, and provider-only timeline revision.
2. Derive `isOverdue` on the backend using the request’s single injected UTC calendar date and never persist it as a status or field.
3. Include latest immutable transition context while leaving the full general activity timeline deferred.
4. Expose a clear pre-approval state and an empty post-approval timeline without creating records on read.
5. Ensure active reads remain bounded by the hard 50-record limit and deterministic position/id tie-breaking.
6. Test UTC day boundaries, date equality, missing dates, completion, reopening, and consistent multi-item results.

## 5. Implement atomic creation and the active limit

1. Add creation as `upcoming` at the end of the current active sequence, with no client-selectable initial status.
2. Validate the current timeline revision, approved-scope prerequisite, fields, and authoritative active count inside one transaction.
3. Atomically reserve the position, enforce the 50-active maximum, persist the milestone, advance the timeline revision, and write one project activity entry.
4. Make concurrent creates serialize safely so one remaining slot yields at most one success and no partial losing records.
5. Return the new milestone, updated count/order context, and new revision without any email side effect.
6. Test initial creation, past and future dates, append order, missing scope, the exact limit, concurrent near-limit creation, stale revisions, and injected rollback failures.

## 6. Implement detail editing and immutable change context

1. Add an edit operation limited to title, optional description, and optional target date.
2. Permit edits in all three progress statuses, including completed milestones.
3. Reject or explicitly short-circuit no-op edits without advancing revision or writing activity.
4. Atomically apply material field changes, advance timeline revision, and write one before/after activity snapshot containing only relevant shared values.
5. Ensure edits cannot change status, position, archive state, transition note, or unrelated timestamps.
6. Test each field independently and together, blank normalization, invalid dates and lengths, completed-item edits, no-op behavior, stale conflicts, access loss, and rollback.

## 7. Implement status transitions and event-bound notes

1. Add a status-transition operation that accepts either of the other two statuses from every active status.
2. Validate and normalize the optional note, then store it only on the immutable transition/activity event.
3. Atomically change status, preserve all milestone details and position, append transition history, advance revision, and create activity.
4. Surface the latest transition context through the active and archived read models without exposing an edit path for any transition note.
5. Treat same-status requests as invalid or unchanged without creating history.
6. Test all six directed transitions, multiple simultaneous in-progress milestones, completion/reopening/recompletion history, past-due reopening, note immutability, stale races, and rollback.

## 8. Implement complete-sequence reordering

1. Add one reorder operation whose payload contains every active milestone identifier exactly once in desired order plus the expected timeline revision.
2. Revalidate the complete set against authoritative project records inside the transaction.
3. Reject missing, duplicate, archived, unknown, foreign-project, stale, or extra identifiers without changing any position.
4. Update positions and timeline revision atomically while leaving status, detail fields, transition history, and archive facts unchanged.
5. Create exactly one project activity entry containing complete before/after identifier sequences and actor/time context.
6. Treat an identical sequence as a no-op without revision or activity changes.
7. Test keyboard-compatible up/down orders, mixed-status sequences, single-item and empty timelines, invalid sets, simultaneous reorder/edit, one-event history, and non-order field preservation.

## 9. Implement terminal archive and paginated history reads

1. Add confirmed archival for an active milestone in any progress status with a required reason.
2. Atomically preserve the final milestone snapshot and status, record archive actor/time/reason, remove it from active order, compact positions, decrement active count, advance revision, and write activity.
3. Expose no restore or hard-delete operation and reject later mutations against archived milestones safely.
4. Add archive reads ordered by `archivedAt` descending and stable identifier descending, defaulting to 20 and accepting limits from 1 through 50.
5. Use opaque cursors and return a next cursor only when older records remain; never discard archived data because it falls outside a page.
6. Make archived records readable by every currently active project role and inaccessible after membership or assignment ends.
7. Test every source status, reason validation, freed active capacity, stable ordering/ties, multiple pages, invalid cursors, terminal behavior, stale archive races, access changes, and rollback.

## 10. Integrate project activity without email or general history UI

1. Add distinct activity actions for creation, material detail edit, status transition, reorder, and archive.
2. Store stable milestone identity, actor/role/time snapshots, safe before/after context, and immutable transition or archive notes as required.
3. Ensure one reorder request always produces zero or one activity record, never per-milestone activity fan-out.
4. Keep activity writes inside the authoritative domain transaction so failure rolls back the milestone operation.
5. Do not call the email service, resolve notification recipients, or add pending-decision indicators for milestone events.
6. Do not add a general activity timeline; expose only latest transition context and the milestone archive required by this slice.
7. Test exact activity count/content, immutable notes, minimal context, failure rollback, and absence of email calls.

## 11. Build the provider and client milestone experience

1. Add a milestone panel to the project page, visually and semantically separate from agreed scope and formal change control.
2. Present the conceptual boundary: scope describes agreed delivery; milestones describe delivery progress.
3. Show pre-approval, post-approval empty, loading, populated, stale, success, validation, and error states appropriate to the current role.
4. Show every active milestone in shared manual order with status text, optional description/date, server-provided overdue text, and latest transition context.
5. Give provider roles create, edit, status-change, keyboard reorder, and confirmed archive controls, including controls on completed milestones.
6. Give both client roles the same read content without mutation, comment, acknowledgement, or approval controls.
7. Add a separate newest-first archived view with actor/time/reason, final status, retained content, and load-more pagination.
8. Refresh timeline and relevant project queries after mutations; on stale conflicts, explain the change and reload authoritative state rather than overwriting it.
9. Preserve long-line wrapping and line breaks, support narrow mobile review, manage form/dialog focus, announce async states, and avoid color-only status meaning.

## 12. Complete automated and manual validation

1. Add domain unit tests for validation, lifecycle transitions, UTC overdue derivation, ordering, archive rules, and the active limit.
2. Add Supertest integration coverage for REST contracts, authorization, tenant isolation, transactions, concurrency, activity, and pagination.
3. Add React Testing Library coverage for provider controls, client read-only behavior, completed-item editing, overdue presentation, keyboard reorder, archive paging, accessibility semantics, and stale recovery.
4. Add focused Playwright journeys for provider/client visibility, progress and reopening, reorder/archive behavior, and access loss or stale state.
5. Execute every check in `validation.md`, including frontend/backend lint, type checking, tests, production builds, Docker builds, backend smoke validation, and critical browser journeys.
6. Record safe implementation evidence without credentials, private project content, raw revision tokens, cursors, cookies, or internal diagnostics.
7. Review the implementation against every acceptance criterion and exclusion; amend and re-approve the specification before implementing any new behavior.
8. Leave Slice 1.4 marked incomplete in `specs/roadmap.md` until implementation and acceptance validation are finished.
