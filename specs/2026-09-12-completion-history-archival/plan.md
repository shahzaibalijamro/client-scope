# Slice 1.6: Completion, History, and Archival Implementation Plan

Implement only after this approved specification has been reviewed against the constitution. Keep each task group coherent and keep verification close to the behavior it proves.

## 1. Establish lifecycle and history contracts

- Add explicit project lifecycle state, current completion-round reference, monotonic round counter, lifecycle revision, and immutable archive/restore records.
- Add immutable completion-review records, readiness snapshots, terminal actor/role/time context, project-scoped unique numbering, and indexes enforcing one current round.
- Define strict request/response schemas, lifecycle status types, readiness blocker codes, permissions, pending actions, archive metadata, and allow-listed activity item variants.
- Treat legacy projects without lifecycle state as `active` and provide an idempotent migration/materialization path.
- Add focused model, schema, index, and migration tests before exposing mutations.

## 2. Implement authoritative readiness and permissions

- Centralize completion readiness in a domain service that queries the current approved scope, active Approvers, change-request aggregates, deliverable aggregates, and active milestones.
- Return the complete blocker set and safe actionable details to Owner/team roles without exposing provider-private drafts to client roles.
- Add owner-only request/withdraw permissions, Approver-only decision permissions, owner-only archive/restore permissions, and read permissions for all current project members.
- Compose lifecycle and role-aware completion pending actions with existing scope, change-control, and deliverable summaries.
- Unit-test every blocker, non-blocking historical state, and role matrix.

## 3. Add atomic lifecycle transitions

- Implement completion request with transaction-time readiness recalculation, compare-and-set lifecycle token, round allocation, immutable snapshot, current-round assignment, and activity in one transaction.
- Implement approval, return, and withdrawal against the exact current round with atomic membership/role rechecks and first-writer-wins semantics.
- Implement owner archive and restore with exact-state/token checks, required reason, immutable actor/time record, and activity in one transaction.
- Ensure failures consume no number and write no partial lifecycle, round, archive, activity, or notification state.
- Add integration tests for successful paths, stale actions, concurrency races, numbering, idempotent retry behavior, and injected activity failures.

## 4. Enforce lifecycle locks across existing modules

- Add a reusable authoritative lifecycle guard to project metadata, scope, change-control, milestone, deliverable, comment, attachment, invitation, assignment, and role-management mutations.
- Block reviewed-content mutations during `completion-in-review` and all ordinary content/access-expansion mutations during `completed` and `archived`.
- Keep security-relevant account/session revocation, member removal/departure, unassignment, client removal/departure, and invitation revocation effective immediately.
- Recheck current authorization after every security change and ensure a removed Approver cannot decide from a stale session.
- Add regression/integration coverage for every guarded mutation family and every permitted revocation path.

## 5. Build the safe project activity projection

- Inventory existing project-audience event types and define an explicit server projection for each supported event.
- Add immutable actor-role and entity-label snapshots to new events; project existing older records conservatively without consulting mutable membership for historical claims.
- Implement newest-first `(occurredAt, id)` pagination with project-bound opaque cursors, default 20, maximum 50, and safe malformed/foreign cursor handling.
- Authorize every page against current exact-project access and exclude owner-only events, arbitrary context, free-form content, and sensitive operational fields.
- Test all event variants, redaction, chronology, concurrent inserts, pagination boundaries, current-member access, and cross-project isolation.

## 6. Integrate transactional email safely

- Resolve and deduplicate active Client Approvers for request/withdrawal notifications.
- Resolve and deduplicate the Workspace Owner plus active workspace-member/project-assigned team members for approval/return notifications.
- Exclude inactive, removed, pending, participant, unassigned, and foreign-project recipients.
- Send only after lifecycle commit, include minimum safe context, emit no archive/restore email, and return one safe warning for partial or total SMTP failure.
- Test recipient matrices, normalized-address deduplication, no-email actions, and dependency failure without state rollback.

## 7. Deliver lifecycle, history, and archive UI

- Separate accessible projects into active/in-review, completed, and archived collections without losing workspace context or existing pending indicators.
- Add provider readiness UI with explicit blockers; show request/withdraw controls only to the Owner and read-only readiness/review state to assigned team members.
- Add exact-round final decision UI only for active Approvers, with confirmation, optional approval note, and required return reason.
- Add permanently read-only completed/archived project presentation, owner-only archive/restore dialogs with required reasons, and no misleading reopen controls.
- Add paginated project activity with stable actor/time/entity context and safe handling for older events with unavailable optional snapshots.
- Cover loading, empty, stale, conflict, validation, email-warning, inaccessible, and unexpected failure states with accessible recovery.

## 8. Validate, document, and hand off

- Add the risk-focused unit, API integration, frontend behavior, and focused Playwright coverage defined in `validation.md`.
- Run backend and frontend type checks, lint, tests, production builds, existing slice regressions, Docker builds, and the backend-container health smoke test.
- Manually review responsive layouts, keyboard behavior, dialogs, focus restoration, status announcements, text wrapping, and read-only clarity.
- Update relevant application/repository documentation only where implementation changes public behavior or setup.
- Record safe implementation evidence in `validation.md` after checks actually run.
- Mark Slice 1.6 complete in the roadmap only after all approved acceptance criteria and merge gates are validated.
