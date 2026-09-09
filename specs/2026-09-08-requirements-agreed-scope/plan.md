# Slice 1.2: Requirements and Agreed Scope Implementation Plan

**Status:** Implemented; final CI acceptance pending — 2026-09-09

This plan breaks the approved Slice 1.2 behavior into vertical task groups. Each group must leave the repository coherent and keep tests near the rules they prove. Any newly discovered product ambiguity returns to `requirements.md` for review instead of becoming an undocumented implementation decision.

## 1. Establish Slice 1.2 contracts and module boundaries

1. Add a requirements/scope domain module behind the existing Express application boundary rather than expanding route handlers with business logic.
2. Define backend Zod schemas and TypeScript types for drafts, groups, requirements, acceptance criteria, submitted snapshots, comments, decisions, withdrawals, comparisons, pending-action summaries, and safe mutation results.
3. Mirror the public response contracts with strict frontend Zod schemas; do not introduce a shared package or Next.js business endpoints.
4. Extend the existing email service category boundary and activity-action vocabulary without coupling domain logic to Nodemailer.
5. Keep route names under the existing versioned `/projects/:projectId/...` REST boundary and reuse the common authentication, CSRF, validation, error-envelope, and diagnostic conventions.

## 2. Add persistence and database invariants

1. Add Mongoose records for the sole working draft, immutable scope versions/snapshots, review comments, and decisions/withdrawals, using existing timestamps and explicit indexes.
2. Represent stable logical requirement identity separately from immutable per-version snapshot identity.
3. Persist optional groups and ordered content in a form that supports validated references, copying, deterministic reads, and immutable historical snapshots.
4. Add uniqueness/partial-index or equivalent transactional protections for at most one draft, at most one in-review version, one decision per version, and unique project/version number.
5. Implement monotonic version allocation within submission so failed submissions consume no number and terminal versions are never reused.
6. Store the draft optimistic revision token and advance it conditionally on every mutation.
7. Include all new models in explicit index synchronization and test database cleanup.

## 3. Implement authorization and safe serialization

1. Centralize current effective-project-role resolution for scope reads and actions using the existing owner, workspace-membership, assignment, and client-membership records.
2. Implement separate guards for provider draft access, owner-only submission/withdrawal, active-project-member review/comment access, and active-approver decisions.
3. Recheck authority inside state-changing transactions where access or role can race with the action.
4. Build role-aware serializers that never return drafts, optimistic tokens, or provider-only metadata to client roles.
5. Preserve safe denied/not-found anti-enumeration behavior across cross-workspace, cross-project, inactive, and former-member access attempts.

## 4. Implement initial draft and optimistic editing

1. Add the explicit start-draft transition for `not-started` projects and reject duplicate, in-review, or approved-state attempts.
2. Add domain operations and REST mutations for group and requirement creation, update, deletion, regrouping, and keyboard-accessible reordering.
3. Enforce all count, text, acceptance-criterion, and same-draft reference validation at request and write time.
4. Require the current opaque revision token on mutations, atomically advance it after success, and return a stable stale-state conflict on mismatch.
5. Prevent group removal from cascading into requirement deletion; require an atomic reassignment/ungrouping choice.
6. Add focused unit and API integration tests for draft rules, role permissions, validation, and concurrent writes before proceeding.

## 5. Implement immutable submission and version numbering

1. Build the owner-only submission service with full draft validation, current revision check, active-approver check, and approved/in-review exclusion.
2. Require the revision summary only when the draft was copied from a prior reviewed version.
3. In one MongoDB transaction, allocate the next number, create immutable groups and requirement snapshots, preserve logical identities, remove the editable draft, mark the version in review, and write project activity.
4. Ensure the first version is v1 and every later successful submission increments from the highest submitted number regardless of terminal outcome.
5. Return the submitted version and any post-commit email warning through an explicit safe response contract.
6. Test rollback behavior for invalid data, missing approvers, conflicting submission, snapshot failure, and activity failure.

## 6. Implement review reads, history, and comparison

1. Add authorized reads for current workflow state, complete submitted-version history, version detail, scope comments, and deterministic comparison.
2. Compare each version after v1 to the immediately preceding submitted version by stable logical requirement identity.
3. Classify added, removed, and content-changed requirements exactly as specified; ignore requirement/group display-order-only differences.
4. Include revision summary and safe submitter/decision/withdrawal actor snapshots without exposing email or owner-only access data.
5. Keep deterministic ordering and ensure currently active late-joining members can read project history while former members cannot.
6. Unit-test comparison across title, description, acceptance criteria, group membership/name, reordering, additions, removals, and mixed changes.

## 7. Implement review comments

1. Add the comment command for active project members against the exact in-review version and optional requirement snapshot.
2. Validate target membership, body bounds, current access, and review state within the transaction.
3. Commit the immutable comment and project-shared activity together; expose no edit or delete routes.
4. Coordinate comment/state writes so a terminal transition prevents any later comment from committing.
5. Test scope and requirement comments, invalid/cross-version targets, role access, immutability, terminal-state locking, and comment-versus-decision races.

## 8. Implement first-decision-wins review transitions

1. Add explicit Client Approver commands for whole-version approval and requested changes with exact-version confirmation.
2. Share one conditional terminal-transition boundary that rechecks active role, review state, and absence of a prior decision.
3. For approval, atomically record the optional note, terminal decision, agreed-scope reference/state, and project activity without creating a draft.
4. For requested changes, require the note and atomically record the decision/activity plus one copied unnumbered draft preserving all logical identities and ordering.
5. Ensure any later approval or requested-changes attempt returns the stable stale/conflict result without modifying the first outcome.
6. Cover simultaneous approve/approve, approve/request-changes, role-change/decision, and membership-removal/decision cases with integration tests.

## 9. Implement preserved owner withdrawal

1. Add owner-only withdrawal of the exact in-review version with explicit confirmation and required reason.
2. Atomically mark the numbered snapshot withdrawn, record actor/reason/activity, and create one copied unnumbered draft.
3. Use the same conditional review-state boundary as decisions so withdrawal and approver actions cannot both succeed.
4. Preserve the withdrawn number and require the next copied-draft submission to use the next number and include a revision summary.
5. Test decision-versus-withdrawal races, copying failure rollback, numbering, permissions, and immutable withdrawn history.

## 10. Integrate transactional email and warning behavior

1. Add minimum-context templates for submission, withdrawal, approval, and requested changes.
2. Resolve submission/withdrawal recipients to deduplicated current active Client Approvers after commit.
3. Resolve approval/requested-changes recipients to exactly the Workspace Owner plus users with both active workspace membership and active project assignment after commit.
4. Dispatch only after domain success; aggregate partial/complete failures into a safe actor-facing warning without addresses or provider diagnostics.
5. Add integration tests for exact recipient sets, inactive/pending/removed exclusions, deduplication, minimum email content, partial failure, total failure, and unchanged authoritative state.

## 11. Build provider draft authoring

1. Extend the existing project surface with role-aware requirements state, an explicit start action, and a provider-only draft editor.
2. Provide labeled plain-text controls for groups, requirements, descriptions, and ordered acceptance criteria with inline/server validation.
3. Support add, edit, delete, regroup, and reorder interactions through keyboard-accessible controls; pointer enhancement must not be the only path.
4. Show collaboration conflicts clearly, preserve unsaved local input where safe, refresh authoritative data, and prevent silent overwrites.
5. Distinguish Service-Team Member editing authority from owner-only submission and explain why submission is blocked when requirements or approvers are missing.
6. Require owner confirmation and the conditional revision summary on submission, then remove the editor when review begins.

## 12. Build client review, decisions, and version history

1. Render submitted scope, groups, acceptance criteria, review discussion, actor/time/status context, and historical versions for all active project roles.
2. Provide scope-level and requirement-level comment forms only during active review and retain read-only threads afterward.
3. Show approve/request-changes actions only to active Client Approvers, with exact-version confirmation, optional approval note, and required change note.
4. Show owner-only withdrawal with exact-version confirmation and required reason.
5. Display revision summary and text-labeled added/removed/content-changed comparison without color-only meaning.
6. Show approved scope as immutable and provide no reopen, edit, or replacement action.
7. Handle stale decisions, stale withdrawal, removed access, email warnings, loading, empty, and unexpected failure states with useful refresh/recovery paths.

## 13. Add pending-action visibility

1. Extend project summaries and `Your work` contracts with the minimum role-aware scope status/pending-action data.
2. Show active Client Approvers a decision-required indicator for in-review projects without creating a notification center.
3. Show provider members that a copied revision draft needs work after requested changes or withdrawal, while reserving submission affordances for the owner.
4. Ensure cached indicators refresh after submission, comments where relevant, decisions, withdrawal, role changes, assignment changes, and access removal.
5. Test that client participants, unrelated members, and inactive users do not receive unauthorized pending-action data.

## 14. Complete risk-based automated coverage

1. Add domain unit tests for lifecycle transitions, full validation, comparison, identity preservation, copying, and conflict classification.
2. Add Supertest integration suites for persistence, REST contracts, authorization, tenant isolation, atomic history, sequential numbering, immutable snapshots, and concurrency.
3. Add React Testing Library coverage for provider/client role surfaces, forms, confirmations, comparisons, stale states, and accessible status behavior.
4. Add focused Playwright journeys for initial agreement, requested changes/resubmission/approval, and withdrawal/concurrency/access boundaries.
5. Keep tests at the lowest reliable layer and use the isolated MongoDB replica-set approach required for transactional behavior.

## 15. Validate scope and prepare implementation handoff

1. Execute every check in `validation.md` and record evidence without secrets or private diagnostics.
2. Run frontend/backend lint, type checks, tests, production builds, critical browser journeys, Docker builds, and the backend-container smoke test through the established commands/CI gate.
3. Review backend serialization and state transitions against every permissions and historical-preservation rule.
4. Review responsive client use, keyboard access, focus, labels, semantic statuses, wrapping, contrast, and no-color-only comparison behavior.
5. Confirm the implementation adds no attachments, general activity timeline, notification center, formal change control, post-approval editing, AI dependency, or other later-slice behavior.
6. Update implementation evidence and request acceptance review; update the specification first if any approved behavior must change.
