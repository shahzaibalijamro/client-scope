# Slice 1.3: Formal Change Control Validation

**Status:** Approved validation contract — 2026-09-10

## Validation Goal

Prove that Slice 1.3 provides tenant-isolated and historically trustworthy change control: request and proposal lifecycles remain distinct, one fixed approved base governs every revision, comparisons are correct and immutable, only current authorized users can act, one terminal transition wins, and approval either creates one fully traceable successor scope or changes nothing.

## Highest-Risk Behavior

1. Cross-workspace or cross-project access exposing provider drafts, submitted proposals, comments, comparisons, decisions, or scope provenance.
2. Client roles receiving provider-only draft content or optimistic revision tokens.
3. Removed, inactive, unassigned, or role-changed users acting through stale UI or session state.
4. Two active requests, two working drafts, or two in-review proposal versions existing for one project.
5. Request state and proposal-version outcome becoming contradictory.
6. An existing request silently rebasing to a different approved scope.
7. Incorrect material comparisons caused by using titles, names, or positions as identity.
8. Order-only changes being submitted as material, or material group moves/name changes being omitted.
9. Historical derived items changing after comments have targeted them.
10. Request, proposal, or scope-version numbers being duplicated, reused, or consumed by failed transactions.
11. Submitted proposal metadata, target scope, comparison items, comments, decisions, actor snapshots, or provenance being edited or deleted.
12. Multiple Client Approver decisions, or a decision and owner withdrawal, both succeeding.
13. Requested changes or withdrawal committing without exactly one copied revision draft.
14. A never-submitted draft being retained as false history, or cancellation deleting submitted history.
15. Approval partially committing a decision, new scope, supersession, provenance, request closure, or activity.
16. Approved successor content differing from the exact reviewed proposal target.
17. Comment creation after review closure or against an item outside the exact proposal/comparison.
18. Email failure rolling back authoritative state or incorrect recipients receiving private project context.

## Evidence Recording

For each validation run, record:

- Source commit SHA and branch.
- Environment category and Node.js version without secrets or connection strings.
- Frontend and backend commands, outcomes, and relevant test counts.
- Browser fixtures used for manual and end-to-end checks.
- Safe artifact paths for screenshots, traces, or reports when retained.
- Any failure, approved exception, specification amendment, and successful rerun.

Never record credentials, cookies, CSRF values, raw session or invitation tokens, SMTP secrets, private database URLs, private email addresses, full request bodies, proposal content, comments, decision notes, or cancellation/withdrawal reasons.

## Automated Validation

### Contract, validation, and lifecycle unit tests

- Request-state contracts accept exactly `draft`, `in-review`, `revision-draft`, `approved`, `rejected`, and `canceled`.
- Proposal-version contracts accept exactly `in-review`, `changes-requested`, `withdrawn`, `rejected`, and `approved`.
- Only `draft`, `in-review`, and `revision-draft` are classified active; only `approved`, `rejected`, and `canceled` are request-terminal.
- The transition table accepts start, submission, requested changes, withdrawal, resubmission, approval, rejection, discard, and cancellation only from their specified states.
- A terminal request cannot reopen, and cancellation is valid only from `revision-draft`.
- Request title, rationale, impact, revision summary, notes, reasons, comments, groups, requirements, and acceptance criteria enforce their exact trimming and length bounds.
- Version 1 accepts no revision summary; version 2+ rejects a missing or blank summary.
- Scope structures enforce 50 groups, 200 requirements, 50 criteria per requirement, valid group references, unique stable identities, and at least one requirement at submission.
- Plain text preserves intended line breaks and is serialized without executable markup behavior.

### Material-comparison unit tests

- A new logical requirement identity is `added` even when its content matches a base requirement.
- A missing logical identity is `removed` even when another target requirement has identical content.
- The same identity with changed title, description, acceptance-criterion content, or criterion order is `content-changed`.
- Moving a requirement between two groups, grouped to ungrouped, or ungrouped to grouped is `moved`.
- A requirement can be both `content-changed` and `moved` in one derived item.
- Requirement reordering within the same group is non-material.
- A new group identity is `added`, a removed identity is `removed`, and a changed name on the same identity is `content-changed`.
- Group reordering alone is non-material.
- A group name match does not make a new identity unchanged, and a renamed stable identity is not added/removed.
- Removing a group while moving or removing its requirements reports both the correct group and requirement effects.
- Empty group additions/removals remain material group changes under the specified rules.
- Mixed group and requirement changes produce deterministic item order and stable proposal-local identifiers.
- Order-only target changes produce no total-effect items and fail submission eligibility.
- Proposal version 1 has no false previous-proposal comparison.
- Later proposals compare against both the unchanged base and immediately previous submitted proposal, including a prior withdrawn version.
- Rationale and impact changes appear only in previous-proposal metadata comparison context.
- A later proposal may retain its predecessor’s target when the total base effect remains material and the revision summary is valid.
- Persisted before/after snapshots and comparison kind cannot drift when later drafts or scopes change.

### Request creation, draft, and submission API integration tests

- Owner and active assigned Service-Team Member can start a request only after scope approval and only when no active request exists.
- Client roles, unassigned team members, former members, and unrelated users cannot start or read a draft.
- Starting pins the exact current approved scope identifier/number and copies its complete content and stable identities.
- Simultaneous starts create exactly one active request and draft.
- Provider users can edit title before first submission, rationale, impact, target scope, and later revision summary.
- Client responses omit draft content, optimistic tokens, and provider-only metadata.
- Every draft mutation requires CSRF protection and the current optimistic revision token.
- Two writes against one token yield one success; the losing write returns the stable stale conflict without overwriting the winner.
- Only the owner can submit, discard, withdraw, or cancel; assigned team members retain editing authority only.
- Confirmed discard deletes an unnumbered never-submitted request with no activity or email.
- Discard is rejected after any successful submission.
- Submission rejects missing approver, stale token, stale base, invalid content, invalid identity/reference, missing revision summary, and no material total effect while preserving the draft.
- First successful submission allocates the next request number and proposal version 1, freezes title, creates immutable comparisons/activity, removes the draft, and enters review.
- Failed first submission consumes neither request nor proposal number.
- Resubmission retains request/base/title, allocates the next proposal number, and requires the revision summary.
- Simultaneous submissions cannot create duplicate numbers or parallel reviews.
- Injected proposal, comparison-item, activity, or transaction failure rolls back the submission and preserves the draft.

### Review, comments, and historical-read API integration tests

- Every currently active project role can read submitted request/proposal history, both comparison perspectives, comments, outcomes, and scope provenance.
- A later-joining active project member can read history; a former member cannot.
- Request-level comments commit against the exact in-review proposal.
- Item comments require an item in the exact proposal and declared comparison kind.
- A base-comparison item identifier cannot be substituted into previous-proposal context and vice versa.
- Prior-version, other-request, other-project, fabricated, and cross-workspace item identifiers fail safely.
- Comment and activity commit together; injected activity failure creates neither.
- Posted comments have no edit/delete API and remain byte-for-byte unchanged after revisions and terminal request states.
- Comments remain displayed with the exact proposal/comparison/item they targeted.
- Comments cannot be created after changes requested, withdrawal, rejection, or approval.
- A comment racing a terminal action commits only if it wins while the proposal is still in review.
- Submitted proposal title/rationale/impact/target/comparisons/actors/timestamps/outcomes remain immutable after every later action.

### Decision, withdrawal, discard, and cancellation integration tests

- Client Participant, owner, team member, unrelated approver, inactive approver, and removed approver cannot decide.
- A current Client Approver can approve with no note or a bounded optional note.
- Requested changes and rejection require confirmation and a nonblank bounded note.
- Requested changes atomically creates one decision/activity, marks the proposal terminal, sets request `revision-draft`, and creates exactly one copied draft.
- The copied draft preserves fixed base, target identities/content, rationale, and impact but receives a new revision token and no proposal number.
- Rejection atomically records decision/activity, closes the request as `rejected`, creates no draft, and leaves current scope unchanged.
- Owner withdrawal requires confirmation/reason, creates no decision, and atomically records outcome/activity plus one copied `revision-draft`.
- A withdrawn proposal remains numbered and is used as the immediately previous proposal after resubmission.
- Owner cancellation succeeds only from `revision-draft`, requires confirmation/reason, removes only the editable draft, and preserves submitted history.
- Cancellation is rejected for never-submitted draft, in-review proposal, terminal request, team member, and client roles.
- A canceled request remains readable, cannot reopen, leaves scope unchanged, and no longer blocks a new request.
- Concurrent approve/approve, approve/request-changes, approve/reject, requested-changes/reject, and decision/withdrawal calls yield exactly one terminal proposal outcome.
- Later or stale actions cannot change the winning outcome, actor, note, timestamp, draft state, scope, history, or request state.
- Role downgrade, removal, or access change racing an action is resolved from current committed authority.
- Injected decision, activity, or copied-draft failure rolls back the complete transition and leaves review active.

### Atomic approval and scope-supersession integration tests

- Approval verifies the exact request/proposal pair, current approver authority, in-review state, first-decision condition, and fixed base.
- Approval fails stale if the pinned base is not the current approved scope and makes no changes.
- Successful approval creates exactly one next-numbered scope version whose groups, requirements, content, order, and stable identities exactly match the reviewed proposal target.
- The previous current approved scope becomes `superseded` without changing its content or original approval decision.
- Prior scope records superseded time, request, proposal, and successor scope; successor records base, request, proposal, proposal submitter, and approving actor.
- The new scope becomes the sole current approved scope and the request/proposal become terminal `approved`.
- No second scope review, editable scope draft, or proposal draft is created.
- An approved request no longer blocks a new request, and the new request pins the successor scope.
- Concurrent approval attempts cannot create duplicate scope numbers, duplicate successors, or multiple decisions.
- Inject failures independently at decision creation, scope-number allocation, successor creation, prior-scope update, reciprocal provenance, request closure, and activity creation.
- Every injected failure leaves the prior scope current, proposal in review, request active, and all approval-related records absent.
- Historical scope reads clearly identify exactly one current approved scope and retain all superseded scope/proposal provenance.

### Active-request and fixed-base invariant tests

Create terminal approved, rejected, and canceled requests and active draft, review, and revision-draft fixtures. Verify:

- Each active state blocks a second request.
- Each terminal state permits a new request.
- A project cannot have two active request records even under concurrent starts.
- A request cannot have both a draft and in-review proposal.
- A request cannot have more than one in-review proposal.
- Requested changes and withdrawal transition to `revision-draft`; approval and rejection transition directly to their terminal request states.
- Fixed base identifier/number never changes across proposal versions, drafts, outcomes, cancellation, or reads.
- Tampered or stale base references fail without leaking another project’s scope or mutating the request.

### Tenant-isolation, authorization, and privacy tests

Use at least two workspaces, multiple projects per workspace, and accounts with owner, assigned/unassigned team, Client Participant, Client Approver, removed, inactive, and mixed roles. Verify:

- IDs from another project/workspace cannot read or mutate requests, drafts, proposals, comparison items, comments, decisions, or provenance.
- Authority in Project A grants nothing in Project B.
- Workspace membership without active project assignment exposes no provider draft.
- Historical authorship, proposal submission, or approval snapshots grant no current access.
- Safe denied/not-found behavior does not confirm whether a private entity exists.
- Owner-only and provider-only fields are absent from unauthorized serializers and database projections where practical.
- Errors and diagnostics exclude content bodies, rationale, impact, comments, decision notes, reasons, emails, cookies, tokens, credentials, and provider internals.

### Activity and email integration tests

- Submission, resubmission, comment, requested changes, rejection, approval/scope succession, withdrawal, and cancellation each create the specified immutable activity with safe context.
- Draft creation/edit and never-submitted discard create no project activity.
- Required activity and its corresponding domain transition commit or roll back together.
- Submission/resubmission/withdrawal/cancellation resolve all and only current active Client Approvers.
- Approval/requested-changes/rejection resolve exactly the owner plus active workspace members actively assigned to the project.
- Client Participants, pending invitees, removed/inactive clients, inactive workspace members, and unassigned team members receive no decision email.
- Recipient resolution deduplicates users.
- Emails exclude target scope, comparisons, rationale, impact, comments, notes/reasons, other members, internal metadata, and secrets.
- Email is never attempted before commit and is not sent for failed or stale actions.
- Partial and total SMTP failures preserve domain state/activity and return a safe warning without recipient addresses or provider errors.
- In-app pending state remains correct when all email delivery fails.

### Frontend component and behavior tests

- Every role sees only authorized start, draft, submit, discard, withdraw, cancel, comment, and decision controls.
- Provider forms expose labeled title, rationale, impact, target scope, and conditional revision summary with inline/server errors.
- Title becomes read-only after first submission while version-specific metadata remains editable in revision drafts.
- Keyboard controls can add, remove, regroup, ungroup, move, and reorder content without drag-only interaction.
- Stale draft conflicts refresh authoritative state, explain the conflict, and preserve unsaved local input where safe.
- Review displays request number/title, exact proposal version, rationale, impact, total base effect, and complete resulting scope.
- Revised review distinctly labels the previous-proposal comparison and metadata changes.
- Material change labels use text and allow one item to expose both content-changed and moved status.
- Order-only changes do not produce false change labels or allow submission.
- Comment forms visually identify proposal-level, base-item, or previous-proposal-item context and appear only during review.
- Client Participant and Client Approver surfaces clearly distinguish participation from binding decision authority.
- Approval uses optional note; requested changes, rejection, withdrawal, and cancellation enforce required text and exact-target confirmation.
- Current and superseded scopes show truthful status and provenance without offering historical edit controls.
- Query invalidation refreshes request history, proposal detail, comments, comparisons, scope history, permissions, project summary, and `Your work` indicators.
- Loading, empty, validation, authorization-loss, stale, success, and email-warning messages use suitable status/alert semantics.
- Long plain text wraps safely and markup is not executed.

## Focused Playwright Journeys

### Journey 1: Initial change request and atomic approval

1. Begin with an approved scope and active owner, assigned team member, Client Participant, and Client Approver.
2. As the team member, start a request and edit the copied target to add, remove, change, and move requirements and rename a group.
3. Verify both client roles cannot see the draft and the team member cannot submit.
4. As owner, submit proposal v1 and verify the request receives its first number, title freezes, and no editable draft remains.
5. As both client roles, review the total effect and resulting scope, post request/item comments, and verify only the approver sees decision controls.
6. Approve the exact proposal and verify the successor scope exactly matches it, the prior scope is superseded with provenance, the request closes, and comments lock.
7. Start a new request and verify it pins the newly approved scope.

### Journey 2: Requested changes, dual comparison, and resubmission

1. Submit proposal v1 and request changes as an active Client Approver with the required note.
2. Confirm v1 and its comments remain immutable and one provider-only `revision-draft` exists.
3. Modify rationale, impact, target content, and ordering; verify version 2 submission requires a revision summary.
4. Submit v2 and verify total effect still compares to the original fixed base while the second comparison describes differences from v1.
5. Confirm order-only edits are excluded and item comments remain attached to the exact proposal/comparison/item.
6. Approve v2 and verify complete version, decision, numbering, scope-provenance, activity, and recipient history.

### Journey 3: Rejection and a new independent request

1. Submit a material proposal and reject it as the Client Approver with a required note.
2. Verify the request is terminal `rejected`, current scope is unchanged, no draft exists, comments are locked, and provider recipients are notified.
3. Verify resubmission/reopen attempts fail safely.
4. Start a new request and confirm it receives a distinct request identity and remains pinned to the unchanged current scope.

### Journey 4: Withdrawal, cancellation, and never-submitted discard

1. Start and discard a never-submitted draft; verify no request number, history, activity, or client email remains.
2. Start another request, submit v1, and withdraw it as owner with a required reason.
3. Verify v1 remains immutable/withdrawn and one copied `revision-draft` exists.
4. Cancel the request with a required reason and verify the draft alone is removed while submitted history remains visible and clients receive minimum-context notification.
5. Verify the canceled request cannot reopen and does not block a new request.

### Journey 5: Concurrency, stale base, and access loss

1. Open one proposal concurrently for two approvers; commit one decision and verify the competing action fails stale without changing the winner.
2. Race an owner withdrawal with an approver decision and verify exactly one terminal proposal outcome and only its required side effects.
3. Race a comment with a terminal action and verify serialized comment visibility.
4. Remove or downgrade an acting member before a protected action and verify current backend authority blocks stale UI/session behavior.
5. Simulate a stale/non-current fixed base and verify submission/approval fail without partial state or data leakage.
6. Attempt cross-project reads and actions with known nested identifiers and verify safe denial.

## Manual Acceptance Checks

### Provider authoring

- Confirm the copied-base explanation makes clear that the current approved scope is not being edited.
- Author grouped and ungrouped changes near limits and verify line breaks, errors, save feedback, and derived-change preview remain usable.
- Complete all add, remove, move, regroup, ungroup, and reorder operations using only the keyboard.
- Edit in two browser sessions and verify stale recovery does not silently lose work.
- Confirm assigned team members understand their edit authority and the owner-only submit/discard/withdraw/cancel boundaries.
- Confirm title is editable before first submission and visibly stable afterward.

### Client review and mobile behavior

- Review rationale, impact, total base effect, resulting scope, previous-proposal comparison, comments, and decisions at narrow mobile widths without core horizontal scrolling.
- Confirm comparison headings make the fixed-base and since-last-review perspectives unmistakable.
- Verify proposal number, request state, proposal outcome, pending action, and next action are understandable without project-management expertise.
- Confirm request-, base-item-, and previous-item-level comments cannot be confused across versions.
- Verify Client Participant comments do not appear to be approvals.

### Accessibility

- Inspect headings, landmarks, lists/tables, forms, labels, descriptions, errors, buttons, comparison groups, and confirmation-dialog names.
- Verify visible focus, logical tab order, focus placement after errors/stale responses, and restoration after dialogs.
- Use a screen reader to check request/proposal states, current/superseded scope, comparison kind/change kind, comments, loading, success, conflict, and email warnings.
- Check contrast and confirm state/comparison meaning never depends on color alone.

### Persistence, history, and privacy inspection

- Inspect records after start, edits, discard, submission, comments, requested changes, resubmission, withdrawal, cancellation, rejection, and approval.
- Confirm request state and proposal outcome remain separate and consistent.
- Confirm base identity, submitted snapshots, comparisons, item identifiers, comments, actors, times, numbers, and provenance never change after becoming historical.
- Confirm exactly one current approved scope exists after approval and prior approval facts survive supersession.
- Confirm client API/browser data contains no provider draft, optimistic token, hidden membership, SMTP detail, or unrelated content.
- Confirm no general activity timeline, attachment surface, milestone behavior, billing field, or AI dependency appears.

### Dependency failure

- Exercise partial and complete email failure through a non-production boundary.
- Confirm the authoritative action remains final, the actor sees a safe warning, addresses remain hidden, and no retry/queue behavior appears.
- Inject transaction failures around copied drafts and approval/supersession and inspect that no partial authoritative records remain.

## Static, Build, Browser, and Container Checks

Run the established commands:

### Backend

- `cd backend && npm run typecheck`
- `cd backend && npm run lint`
- `cd backend && npm test`
- `cd backend && npm run build`

### Frontend

- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm test`
- `cd frontend && npm run build`
- `cd frontend && npm run test:e2e`

### Containers and CI

- Build both production Dockerfiles using the established CI arguments.
- Run the backend-container health smoke test against ephemeral MongoDB.
- Confirm the GitHub Actions frontend, backend, critical browser, container, and required `CI gate` jobs pass.
- Do not publish images or invoke deployment providers from a pull request validation run.

## Constitution and Scope Review

Verify before merge that:

- Backend authorization protects every private record and action.
- Current contextual membership is rechecked for significant actions.
- Request and proposal lifecycles are distinct and cannot contradict each other.
- Every request remains pinned to one exact approved base.
- Submitted proposals, comparisons, comments, decisions, approvals, and superseded scopes remain historical.
- First valid terminal transition wins and stale actions fail safely.
- Approval/scope supersession is one atomic transaction.
- The client experience is clear, accessible, and mobile usable.
- Core workflows have no AI dependency.
- No billing, milestone, attachment, link, notification-center, general activity-history UI, or later-slice behavior was added.
- No microservice, queue, Redis, persistent local file storage, or other excluded infrastructure was introduced.

## Merge Gate

Slice 1.3 is safe to merge only when:

1. `requirements.md` is explicitly approved and implementation matches it.
2. Every acceptance criterion has automated or recorded manual evidence, or an approved specification amendment explains an exception.
3. Tenant isolation, contextual authorization, fixed-base integrity, state separation, immutable comparison items, numbering, concurrency, copied-draft atomicity, and full approval rollback have passing high-risk tests.
4. Frontend and backend lint, type checks, tests, production builds, Playwright journeys, Docker builds, and backend smoke test pass through the existing CI gate.
5. Responsive and accessibility checks pass at the constitution’s stated quality level.
6. No credentials, secrets, sensitive diagnostics, or private test data are committed or retained in evidence.
7. Required documentation and safe validation evidence are updated.
8. The roadmap remains unchanged until implementation and acceptance validation are complete.

## Implementation Evidence

### Local implementation run — 2026-09-10

- Source baseline: `fe7062c370eb463d325d383b7f83d1de82a1be23` on `codex/slice-1-3-formal-change-control`, with the Slice 1.3 implementation present as uncommitted workspace changes.
- Environment: local Windows workspace with Node.js `v22.23.0` and npm `10.9.8`; both production Docker builds used the pinned `node:24.20.0-bookworm-slim` image.
- Backend: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed. The final full test run reported 9 files and 75 tests passing. Transaction-failure coverage proves rollback for comparison persistence, copied revision drafts, decision persistence, scope-number allocation, prior-scope supersession, successor creation, proposal closure, request closure, and activity persistence. Successor provenance is stored in the same atomic insert as the successor rather than a separate write; the successor-insert failure covers that boundary, while the successful retry asserts reciprocal base/successor provenance. Additional checks cover stale writes, invalid item targets, current-authority loss, notification exceptions, recipient exclusion, numbering preservation, and retry after rollback.
- Frontend: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed. The test run reported 5 files and 23 tests passing.
- Browser: the first full Chromium run passed the six existing critical journeys. The new formal-change journey initially exposed an ambiguous test locator; after narrowing it to semantic heading/region targets, its focused rerun passed. The rerun also exercised keyboard activation for authoring and a 390×844 client viewport with no document-level horizontal overflow. The local Windows Playwright process required manual interruption during web-server teardown after reporting the test result, so the clean Linux CI job remains required before merge.
- Containers: both production Dockerfiles built successfully with the established frontend backend-origin argument. The backend image was started against an isolated ephemeral MongoDB 8.0 container and returned exactly `{ "status": "ok", "database": "connected" }` from `/api/v1/health`; the temporary containers and network were removed afterward.
- Pull-request CI: GitHub Actions run `34474229896` for PR `#5` completed successfully at commit `cf46d9fb90e2a8cdc1fc87c51100ec3f824c223b`. Frontend, backend, critical browser, container, and required `CI gate` jobs all passed; publication and deployment jobs were correctly skipped for the pull request.
- Follow-up pull-request CI: GitHub Actions run `34476037435` for PR `#5` completed successfully at commit `563710a02d7a6f15ed08643e4010a024dfd55448`. Frontend, backend, critical browser, container, and required `CI gate` jobs all passed after the exhaustive approval rollback matrix was added; publication and deployment jobs were correctly skipped for the pull request.
- Static diff hygiene: `git diff --check` passed. No browser screenshots or traces were retained.
- Manual UI inspection: on 2026-09-10, the user reported `Manual acceptance passed on commit 563710a` after completing the documented responsive, keyboard-only, dialog-focus, and screen-reader acceptance flow. This supplies the manual evidence that could not be collected through the unavailable Windows computer-use helper.
- Acceptance conclusion: the implementation, high-risk automated evidence, Linux CI, responsive behavior, keyboard behavior, and screen-reader review satisfy the Slice 1.3 merge gate. The roadmap may now record Slice 1.3 as complete.
