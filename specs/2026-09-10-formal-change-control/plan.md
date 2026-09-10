# Slice 1.3: Formal Change Control Implementation Plan

**Status:** Approved implementation plan — 2026-09-10

This plan breaks the approved Slice 1.3 behavior into vertical task groups. Each group must leave the repository coherent and keep tests close to the rules they prove. Any newly discovered product ambiguity returns to `requirements.md` for review rather than becoming an undocumented implementation choice.

## 1. Define contracts and separate lifecycle boundaries

1. Add change-request domain contracts that model request state independently from submitted proposal-version state.
2. Define strict backend Zod schemas and TypeScript types for request summaries, working drafts, proposal versions, target-scope snapshots, both comparison sets, derived items, comments, decisions, withdrawals, cancellation, permissions, pending actions, and safe mutation results.
3. Mirror public response contracts with strict frontend schemas without introducing a shared package or Next.js business endpoint.
4. Extend scope contracts to distinguish the sole current approved version from superseded versions and expose reciprocal change-request provenance.
5. Reuse the established error envelope, authentication, CSRF, plain-text, timestamp, identifier, and safe conflict conventions.
6. Add focused lifecycle unit tests before persistence work so valid and invalid request/proposal transitions are explicit.

## 2. Add persistence, invariants, numbering, and provenance

1. Add Mongoose records for stable change requests, their sole working draft, immutable proposal versions, immutable derived comparison items, proposal comments, and client decisions.
2. Store the fixed base scope identifier/number at request level and repeat immutable provenance on submitted proposal versions where required for safe historical reads.
3. Preserve stable group and logical requirement identities in copied target scopes while assigning immutable proposal snapshot and derived-item identities.
4. Add uniqueness or partial-index protections for at most one active request per project, one working draft per active request, one in-review proposal, one decision per proposal, unique project request numbers, and unique proposal numbers within a request.
5. Allocate the request number only on first successful submission and proposal numbers only on successful submissions; terminal numbers are never reused.
6. Extend scope-version persistence with `superseded` history and base/request/proposal/successor provenance while retaining original approval facts.
7. Ensure next scope-version allocation can occur atomically with approval without colliding with existing terminal scope-version numbers.
8. Include all new and amended models in explicit index synchronization and isolated test cleanup.

## 3. Implement contextual authorization and role-safe serialization

1. Reuse centralized effective-project-role resolution for every request read and action.
2. Add guards for provider draft access, owner-only submission/discard/withdrawal/cancellation, active-member historical review/comment access, and active-approver decisions.
3. Recheck current authority inside every significant state-changing transaction so removal, unassignment, inactivity, or role changes beat stale UI/session state.
4. Build role-aware serializers that never expose working drafts, optimistic tokens, provider-only metadata, or unrelated private history to client roles.
5. Enforce existing anti-enumeration behavior for cross-project, cross-workspace, inactive, former-member, and invalid nested identifiers.
6. Add API integration tests for the complete permissions table and mixed-role accounts across multiple projects.

## 4. Build copied-scope draft authoring and optimistic concurrency

1. Add the start-request transition, requiring a current approved scope and no active request, and pin that exact scope as the immutable base.
2. Copy complete groups and requirements into one provider-private working target while preserving stable identities and assigning a revision token.
3. Add domain operations and REST mutations for title-before-first-submission, rationale, optional impact, revision summary, group changes, requirement changes, moves, and keyboard-compatible reordering.
4. Reuse Slice 1.2 scope limits, same-draft reference validation, and explicit reassignment/ungrouping on group removal.
5. Require and conditionally advance the optimistic revision token on every draft mutation; explain stale conflicts without silently overwriting provider work.
6. Add owner-only confirmed discard for a never-submitted draft, deleting it without number, history, activity, or email.
7. Reject discard once a request has a number or submitted proposal history.
8. Test concurrent starts, edits, stale writes, fixed-base copying, identity preservation, draft privacy, and discard boundaries.

## 5. Implement deterministic material comparison and no-op validation

1. Create one comparison service that evaluates stable group and logical requirement identities instead of names, titles, or positions.
2. Classify requirement additions, removals, content changes, and effective-group moves; allow multiple change kinds on one requirement.
3. Classify group additions, removals, and name changes while excluding group order and same-group requirement order.
4. Produce total-effect items against the fixed base and, for proposal version 2+, a separate item set against the immediately previous submitted proposal.
5. Include before/after immutable snapshots, comparison kind, entity kind, applicable change kinds, deterministic position, and proposal-local item identity.
6. Surface rationale and impact changes separately in previous-proposal comparison context.
7. Reject submission when total base effect is empty, including order-only changes, while allowing a revised proposal whose material target is unchanged from its predecessor.
8. Add exhaustive unit tests for individual and mixed classifications, identity collisions, grouping changes, empty groups, order-only edits, deterministic output, and dual comparison behavior.

## 6. Implement atomic submission and immutable proposal history

1. Add owner-only submission for `draft` and `revision-draft` with current revision token, full target validation, active-approver check, material-effect check, and fixed-base-current check.
2. Freeze the request title and allocate its project-scoped number only during the first successful submission.
3. Require a revision summary on proposal version 2 and later and allocate the next proposal number from the highest submitted version in the request.
4. In one transaction, snapshot proposal metadata and target scope, persist both comparison sets/items, remove the editable draft, change the request to `in-review`, and create project activity.
5. Return the exact proposal version and any post-commit email warning through an explicit response contract.
6. Ensure failed validation, comparison, authority, numbering, history, or persistence preserves the draft and consumes no number.
7. Test request/proposal numbering, title freezing, immutable metadata, no parallel review/draft, resubmission, and injected rollback failures.

## 7. Add exact-proposal and exact-item review comments

1. Add proposal-level comments and derived-item comments for every active project role against the exact in-review proposal.
2. Validate that an item belongs to the exact proposal and declared `base-scope` or `previous-proposal` comparison.
3. Persist immutable item identifiers and comparison context with comments so later revisions cannot move their meaning.
4. Commit each comment and its safe project activity entry together; expose no edit or delete routes.
5. Lock comment creation when the proposal reaches any terminal outcome while retaining readable historical comments.
6. Coordinate comment/state writes so comment-versus-decision or withdrawal races have one valid serialized result.
7. Test request/item comments, both comparison kinds, invalid nested targets, immutability, terminal locking, access changes, and concurrency.

## 8. Implement first-decision-wins transitions, withdrawal, and cancellation

1. Add a shared conditional proposal-terminal boundary for approval, requested changes, rejection, and owner withdrawal.
2. Add exact-version Client Approver decisions with optional approval note and required requested-changes or rejection note.
3. For requested changes, atomically record decision/activity, end the proposal, set the request to `revision-draft`, and create one copied working draft.
4. For rejection, atomically record decision/activity, end the proposal, close the request as `rejected`, and create no draft or scope change.
5. For owner withdrawal, atomically record actor/reason/activity, end the proposal as `withdrawn`, set the request to `revision-draft`, and create one copied draft without creating a client decision.
6. Add owner-only confirmed cancellation from `revision-draft`, removing only the mutable draft while retaining every submitted record and setting terminal `canceled` with activity.
7. Reject cancellation from `draft`, `in-review`, or any terminal state and reject direct cancellation of an active review.
8. Ensure the first valid terminal transition wins and all later or competing transitions preserve the winner unchanged.
9. Test decision/decision, decision/withdrawal, role-change/decision, comment/decision, copied-draft failure, cancellation, and stale-state races.

## 9. Implement atomic approval and scope supersession

1. Build approval as one transaction that locks the exact request, proposal, current fixed base, and approver authority.
2. Revalidate the immutable target and ensure the base is still the sole current approved scope before any authoritative write.
3. Allocate the next scope-version number and create an immutable approved scope version whose content exactly matches the reviewed proposal target.
4. Preserve proposal group and logical requirement identities in the successor without regenerating or inferring content.
5. Mark the former current scope `superseded` while retaining its original content and approval decision.
6. Record reciprocal base/successor/request/proposal provenance, proposal submitter context, approving actor context, request terminal state, decision, and project activity.
7. Ensure a failed validation, conditional update, number allocation, scope creation, supersession, provenance, decision, or activity write rolls back everything and leaves the proposal in review with the base current.
8. Update scope reads and history to identify exactly one current approved version and clearly label superseded versions.
9. Add integration tests for exact-target fidelity, numbering, provenance, full rollback, stale bases, duplicate approval, and historical immutability.

## 10. Integrate activity, transactional email, and pending actions

1. Extend activity actions for proposal submission, comment, requested changes, rejection, approval/scope succession, withdrawal, and submitted-request cancellation.
2. Keep activity context minimal but sufficient to identify request, proposal, comparison/item target, outcome, and base/successor scope where applicable.
3. Resolve submission, resubmission, withdrawal, and cancellation recipients to deduplicated current active Client Approvers after commit.
4. Resolve approval, requested-changes, and rejection recipients to exactly the Workspace Owner plus users with active workspace membership and active project assignment.
5. Send minimum-context email only after successful domain commits; aggregate partial or total failure into a safe actor warning without addresses or provider diagnostics.
6. Extend project summaries and `Your work` with role-aware `decision-required`, `change-revision`, and owner submission indicators without creating a notification center.
7. Refresh member-sensitive summaries after submissions, comments where relevant, decisions, withdrawal, cancellation, access changes, and scope supersession.
8. Test exact activity, recipient sets, deduplication, excluded users/content, email failure, and authoritative pending state.

## 11. Build provider and client change-control experiences

1. Add a provider-only request-start and target-scope editor from the project’s current approved scope.
2. Reuse accessible scope authoring patterns for groups, requirements, descriptions, criteria, moves, and reorder controls while adding rationale, impact, and revision-summary fields.
3. Explain fixed-base context, private-draft state, owner/team authority differences, validation blocks, no-op changes, and optimistic conflicts.
4. Build review views that lead with request number/title, proposal version, rationale, impact, total base effect, and full resulting scope.
5. For revised proposals, separately show changes since the previous submitted proposal and keep comment threads visually bound to their exact comparison/item.
6. Show comment controls to all active roles only during review and decision controls only to Client Approvers.
7. Provide distinct confirmed approval, requested-changes, and rejection actions; owner-only withdrawal, discard, and cancellation actions; and safe stale/error recovery.
8. Keep the current approved scope visible and authoritative until approval, then show the new current version and superseded base with provenance.
9. Render complete request/proposal history, actor/time/outcome context, and immutable comments after terminal outcomes.
10. Verify narrow-screen client use, keyboard-only authoring, focus-managed confirmations, semantic statuses, safe text wrapping, and no color-only meaning.

## 12. Complete validation and specification handoff

1. Add domain unit tests for both state machines, validation, comparison, copying, identity, numbering, and transition rules.
2. Add Supertest integration coverage for REST contracts, tenant isolation, authorization, transactions, comments, decisions, cancellation, fixed-base checks, atomic supersession, activity, and email failure.
3. Add React Testing Library coverage for role-aware authoring/review, dual comparisons, exact comment targets, confirmations, stale states, accessibility semantics, and pending work.
4. Add focused Playwright journeys for initial approval, requested revisions/resubmission, rejection, withdrawal/cancellation, concurrency, and access loss.
5. Execute every check in `validation.md`, including frontend/backend lint, type checking, tests, builds, Docker builds, backend smoke test, and critical browser journeys.
6. Record safe implementation evidence without credentials, private content, raw tokens, or provider diagnostics.
7. Review implementation against every acceptance criterion and explicit exclusion; amend and re-approve the specification before implementing any newly discovered behavior.
8. Leave the roadmap status unchanged until implementation, automated validation, manual acceptance, and final review are complete.
