# Slice 1.2: Requirements and Agreed Scope Validation

**Status:** Approved validation contract — 2026-09-09

## Validation Goal

Prove that Slice 1.2 creates a trustworthy, tenant-isolated requirements agreement: provider drafts stay private, every submitted version is immutable and truthfully numbered, only current authorized roles can act, one decision wins, revisions preserve identity and history, comments remain contextual, and dependency failures cannot corrupt authoritative state.

## Highest-Risk Behavior

1. Cross-workspace or cross-project access exposing private drafts, submitted scope, comments, or pending-action data.
2. Client roles receiving provider draft content or optimistic concurrency metadata.
3. Removed, unassigned, inactive, or role-changed users acting through stale UI/session state.
4. Parallel drafts, parallel in-review versions, duplicate version numbers, or reused terminal version numbers.
5. Mutation of submitted snapshots, approved scope, decisions, comments, or historical actor context.
6. Lost provider edits caused by concurrent draft writes.
7. Multiple approver outcomes or a withdrawal and decision both succeeding.
8. A changes-requested or withdrawn outcome committing without its required copied draft.
9. Stable logical requirement identity being lost across revision copies, producing false added/removed comparisons.
10. Incorrect comparison caused by titles, order, or positions being used as identity.
11. Comment creation after review ends or against a requirement outside the submitted version.
12. Domain state committing without required project activity, or email failure rolling back committed state.
13. Incorrect email recipients exposing project activity or leaving stale review requests unexplained.

## Evidence Recording

For each validation run, record:

- Source commit SHA and branch.
- Environment category and Node.js version, without secrets or connection strings.
- Frontend and backend command, result, and relevant test count.
- Browser/project fixtures used for manual and end-to-end checks.
- Safe artifact paths for screenshots, traces, or reports when retained.
- Any failure, approved exception, specification amendment, and rerun result.

Do not record credentials, cookies, CSRF values, raw session or invitation tokens, SMTP secrets, private database URLs, private email addresses, full request bodies, or unnecessary requirement/comment content.

## Automated Validation

### Domain and validation unit tests

- Draft/group/requirement schemas accept all minimum valid forms and reject whitespace-only or over-limit strings.
- Limits of 50 groups, 200 requirements, and 50 acceptance criteria per requirement are enforced at their boundaries.
- Descriptions accept up to 5,000 characters; other narrative fields accept up to 2,000; names/titles accept up to 120.
- Submission rejects empty drafts, incomplete requirements, invalid group references, invalid counts, missing revision summary on copied drafts, and stale revision tokens.
- First submission needs no revision summary; subsequent copied-draft submission does.
- Plain text preserves intended line breaks and is serialized without executable markup behavior.
- The lifecycle accepts only the specified transitions and rejects draft/review coexistence, duplicate starts, post-approval actions, and direct historical edits.
- Copying preserves logical requirement identity, groups, content, acceptance criteria, and ordering while producing new mutable-draft record identities and no version number.
- Version allocation advances only on successful submission and never reuses approved, changes-requested, or withdrawn numbers.

### Revision-comparison unit tests

- A new logical identity is `added` even when its title matches an old requirement.
- An omitted logical identity is `removed` even when another requirement has identical content.
- The same identity with title, description, acceptance-criterion content/order, group association, or effective group-name changes is `content-changed`.
- Requirement reordering alone is not `content-changed`.
- Group display reordering alone is not `content-changed`.
- Unchanged identities remain unchanged regardless of surrounding additions/removals.
- Mixed added, removed, changed, and reordered cases return deterministic classifications and ordering.
- Version 2+ compares against the immediately prior submitted version, including a prior withdrawn version.
- Version 1 returns no misleading prior-version comparison.

### Draft and submission API integration tests

- Owner and active assigned Service-Team Member can start/read/edit the sole provider draft.
- Unassigned Service-Team Member, Client Participant, Client Approver, former member, and unrelated authenticated user cannot read draft data.
- Only the owner may submit; an assigned team member receives no owner authority.
- Draft mutations cover create, edit, delete, regroup, ungroup, group removal with explicit reassignment, and reordering.
- Every mutation requires CSRF protection and the current optimistic revision token.
- Two writes using one token yield exactly one success; the loser receives the stable stale-state conflict and the winning data remains intact.
- Simultaneous initial-draft creation leaves exactly one draft.
- Submission with no active Client Approver fails and preserves the draft without allocating a number.
- Valid submission produces v1, immutable snapshots, activity, `in-review` state, and no editable draft.
- Two simultaneous submissions cannot create duplicate versions or parallel reviews.
- Injected snapshot/activity/transaction failure rolls back the submission, preserves the draft, and consumes no number.
- Copied revision submission requires a summary and receives the next number.
- Cross-project identifiers in draft references fail safely without confirming private records.

### Review, comment, and history API integration tests

- Every currently active project role can read submitted version history, comparison, decisions/withdrawals, and historical comments.
- A user who joins later can read project history; a user whose current access ends cannot.
- Client responses never contain draft data, optimistic tokens, owner-only member information, or unrelated project content.
- Each active project role can post scope-level and valid requirement-level comments during review.
- Comment target must be a snapshot in the exact submitted version; draft, prior-version, and cross-project targets fail safely.
- Comment and activity commit together; injected activity failure creates neither.
- Posted comments have no edit/delete API and persisted content is unchanged after all terminal outcomes.
- Comments cannot be posted after approval, requested changes, or withdrawal.
- A comment racing a terminal action commits only if it wins while review is active; no comment appears after terminal state.
- Version history remains immutable and deterministically ordered after later submissions.

### Decision and withdrawal API integration tests

- Client Participant, owner, Service-Team Member, unassigned user, and unrelated Client Approver cannot make a decision.
- A currently active Client Approver can approve the exact in-review version with no note or a valid optional note.
- Approval atomically creates one decision/activity, marks agreed scope, and creates no draft.
- Requesting changes requires confirmation and a nonblank bounded note.
- Requested changes atomically creates one decision/activity and exactly one copied unnumbered draft.
- Provider users can edit the copied draft before a revision summary exists; only owner submission requires it.
- Owner withdrawal requires confirmation and a nonblank bounded reason.
- Withdrawal atomically creates the terminal record/activity and exactly one copied unnumbered draft.
- Withdrawn v2 remains v2; the next successful submission is v3.
- Approval/request-changes attempts after a committed decision return a stale/conflict result and cannot alter actor, note, timestamp, outcome, history, or draft state.
- Concurrent approve/approve and approve/request-changes calls yield one decision and one terminal outcome.
- Concurrent decision/withdrawal calls yield one terminal outcome and at most the one copied draft required by that outcome.
- Role downgrade, membership removal, or assignment/access change racing an action is resolved from the current committed authority, never cached authority.
- Injected decision/activity/copied-draft failures roll back the whole transition and leave review active.
- Approved scope rejects withdrawal, editing, resubmission, reopening, or replacement.

### Tenant-isolation and privacy integration tests

Create at least two workspaces, multiple projects per workspace, and accounts that are owner, assigned/unassigned team member, Client Participant, Client Approver, removed member, and mixed-role across contexts. Verify:

- IDs from another project/workspace cannot be used to read or mutate drafts, versions, snapshots, comments, comparisons, decisions, or pending states.
- One account’s authority in Project A grants no authority in Project B.
- Workspace membership without project assignment exposes no provider scope data.
- Historical authorship or role snapshots grant no current access.
- Safe denied/not-found behavior does not reveal whether a private scope entity exists.
- Owner-only and provider-only fields are absent at query/serialization boundaries.
- Logs and API errors exclude content bodies, emails, cookies, tokens, credentials, MongoDB/provider errors, and private internal identifiers.

### Activity and email integration tests

- Submission, comment, approval, requested changes, and withdrawal each create one immutable project-shared activity entry with actor/time/project/version and safe action context.
- Draft creation and edits create no activity entries.
- Submission and withdrawal resolve all and only currently active Client Approvers.
- Approval and requested changes resolve exactly the Workspace Owner plus every user with active workspace membership and active assignment to that project.
- Client Participants, pending invitees, removed/inactive client members, inactive workspace members, and unassigned team members receive no event email.
- Recipient resolution deduplicates users.
- Email excludes requirement content, comments, notes/reasons, other members, internal client metadata, and secrets.
- Email is never attempted before a transaction commits and is not sent for failed/stale actions.
- Partial and complete SMTP failures preserve domain state/activity and return a safe warning to the actor without exposing recipient addresses or raw provider errors.
- In-app pending state remains correct when every email attempt fails.

### Frontend component and behavior tests

- Each role sees only its authorized draft, review, comment, submit, withdraw, and decision controls.
- Provider draft forms expose labels, requirements, groups, descriptions, criteria, field errors, bounds, and owner/team authority differences.
- Keyboard controls can add, remove, regroup, and reorder content without drag-only interaction.
- A stale mutation refreshes authoritative state and explains the conflict without claiming success.
- Submitted state removes the editable draft and shows the immutable exact version.
- Review UI shows revision summary and distinct textual labels for added, removed, and content-changed requirements.
- Reordering-only comparison does not display a false content-change badge.
- Comment forms appear only during review; historical comments remain readable afterward.
- Approval has an optional note; requested changes and withdrawal enforce their required text and confirmation.
- Approved scope shows actor/time/version and no edit, reopen, withdraw, or resubmit action.
- Loading, empty, validation, authorization-loss, stale-state, success, and email-warning messages use suitable status/alert semantics.
- Long content wraps safely and plain-text markup is not executed.
- Query invalidation refreshes project data, history, comments, comparison, member-sensitive permissions, and `Your work` pending indicators.

## Focused Playwright Journeys

### Journey 1: Initial requirements agreement

1. As owner, open an existing project with an active assigned Service-Team Member, Client Participant, and Client Approver.
2. Start a draft; have the assigned member add grouped and ungrouped requirements and acceptance criteria.
3. Confirm both client roles cannot see the draft and the team member cannot submit.
4. As owner, submit v1 and verify there is no editable draft.
5. Confirm both client roles can review/comment and only the approver sees decision controls and a `Your work` pending indicator.
6. Approve v1 without a note and confirm agreed-scope history, actor/time/activity, locked comments, no draft, and no post-approval edit path.

### Journey 2: Requested changes, comparison, and approval

1. Submit an initial scope and request changes as an active Client Approver with the required note.
2. Confirm the reviewed version remains immutable/readable and one unnumbered provider-only copied draft exists.
3. As a team member, edit the copy without supplying a revision summary: modify one requirement, remove one, add one, and reorder unchanged items.
4. As owner, attempt submission without a summary and see validation; supply the summary and submit the next version.
5. Verify comparison labels only the correct added, removed, and content-changed items and ignores reorder-only differences.
6. Approve the revision and verify preserved logical identities, both numbered histories/comments, exact email-recipient behavior, and final immutable agreed scope.

### Journey 3: Withdrawal, access changes, and stale actions

1. Submit v1, request changes, edit and submit v2, then withdraw v2 with a reason.
2. Confirm v2 remains numbered/withdrawn, one unnumbered copied draft exists, and approvers are notified that review ended.
3. Submit the copy with a revision summary and confirm it becomes v3.
4. Open v3 concurrently as two approvers; commit one decision and verify the other action fails stale without changing the first outcome.
5. Repeat a protected action after removing/downgrading the acting member and verify current backend authority blocks it despite stale UI/session data.
6. Attempt cross-project reads/actions with known identifiers and verify safe denial without data leakage.

## Manual Acceptance Checks

### Provider authoring

- Start an empty draft and confirm its provider-only explanation is clear.
- Author near-limit grouped/ungrouped content and verify input, line breaks, error placement, and save feedback remain usable.
- Edit the same draft in two browser sessions and verify the conflict/recovery experience does not silently lose changes.
- Complete all editing and reordering tasks using only the keyboard.
- Confirm team members understand they may edit but only the owner may submit.

### Client review and mobile behavior

- Review every version, comparison, acceptance criterion, and comment thread at narrow mobile widths without core horizontal scrolling.
- Confirm pending decision, version number, status, next action, and terminal result are understandable without project-management expertise.
- Verify Client Participant and Client Approver differences are explicit without implying that comments are approvals.
- Confirm long unbroken input wraps or is safely constrained without breaking layout.

### Accessibility

- Inspect heading order, landmarks, form labels, descriptions, field errors, table/list semantics, buttons, and confirmation-dialog names.
- Verify visible focus, logical tab order, focus movement after validation/stale errors, and focus restoration after dialogs.
- Use a screen reader to confirm scope status, pending action, version comparison labels, loading, success, stale state, and email warnings.
- Check contrast and verify comparison/status meaning never depends on color alone.

### State, history, and privacy inspection

- Inspect persisted records after draft, submission, comments, requested changes, withdrawal, resubmission, and approval.
- Confirm historical snapshots, comments, actors, roles, times, version numbers, and logical identities remain unchanged.
- Confirm no draft exists during review or after approval and exactly one copy exists after requested changes/withdrawal.
- Confirm client API/browser data contains no provider draft, token, hidden membership, SMTP detail, or unrelated project content.
- Confirm the scope-specific UI does not accidentally expose the deferred general activity timeline.

### Notification failure

- Exercise full and partial email failure using a non-production test boundary.
- Confirm the domain action remains visible and final, the actor sees a safe warning, recipients are not exposed, and no automatic retry/queue behavior appears.
- Confirm later reloads show authoritative state and correct pending actions regardless of delivery outcome.

## Static and Build Checks

Run the established repository commands for:

- Backend lint.
- Backend TypeScript type checking.
- Backend Vitest/Supertest suite.
- Backend production build.
- Frontend lint.
- Frontend TypeScript type checking.
- Frontend React Testing Library/Vitest suite.
- Frontend production build.
- Critical Playwright journeys.
- Frontend and backend Docker builds.
- Backend-container runtime health smoke test.

Prefer the repository/CI commands already established by Phase 0. Do not add root workspace orchestration, a new test framework, or a new infrastructure dependency for this slice.

## Constitution and Scope Review

Verify before merge that:

- Backend authorization, not frontend visibility, protects every private resource and action.
- Membership authority is contextual and rechecked from current state.
- Approved and historical data is never silently overwritten.
- Significant state/history writes are atomic and failures are safe.
- One Client Approver decision is sufficient and first-decision-wins is enforced.
- The client review experience is clear and usable on mobile.
- Core behavior has no AI dependency.
- No attachment, rich-text, item-level approval, notification-center, formal change-control, general activity-timeline, or post-approval editing behavior entered the slice.
- No microservice, queue, Redis, persistent local file storage, or other excluded infrastructure was introduced.

## Merge Gate

Slice 1.2 is safe to merge only when:

1. `requirements.md` has been explicitly approved and implementation matches it.
2. Every acceptance criterion has automated or recorded manual evidence, or an approved specification amendment explains the exception.
3. Tenant isolation, draft privacy, contextual authorization, immutable history, logical identity, comparison, concurrency, first-decision-wins, atomic copied drafts, and email-failure behavior have passing high-risk tests.
4. Frontend and backend lint, type checks, tests, production builds, Playwright journeys, Docker builds, and backend-container smoke test pass through the established CI gate.
5. Responsive and accessibility checks pass at the constitution’s stated quality level.
6. No credentials, secrets, sensitive diagnostics, or private test data are committed or retained in artifacts.
7. Repository documentation and safe validation evidence are updated where implementation requires them.
8. The roadmap is not marked complete until implementation and acceptance validation, and no Slice 1.3+ behavior is included.

## Implementation Evidence

### 2026-09-09 local implementation run

- Source context: branch `codex/slice-1-2-requirements-agreed-scope`, base commit `49a8449fbdb582f8451dc8a02bbe75d6a8787e33`, uncommitted implementation workspace.
- Environment: local Windows development host using Node.js `v22.23.0`, Docker Desktop `4.90.0`, Docker Engine `29.7.2`, and Docker Compose `5.5.1`; production image builds used the pinned Node.js `24.20.0` base. No credentials, connection strings, account emails, session/CSRF values, or private content are retained here.
- Backend: `npm run typecheck`, `npm run lint`, and `npm run build` passed. `npm test` passed 7 files and 59 tests after the final focused API addition; the preceding complete run passed 7 files and 58 tests, and the added partial-email-failure case passed in its focused rerun.
- Frontend: `npm run typecheck`, `npm run lint`, and `npm run build` passed. `npm test` passed 4 files and 20 tests.
- Browser validation: all three Slice 1.2 Chromium journeys passed (initial agreement, requested changes/comparison/approval, and withdrawal/version numbering/concurrent decision). The three pre-existing Slice 1.1 journeys also passed before a later transient local dev-server connection reset in the combined run. The Slice 1.2 group passed 3/3 on rerun. On this Windows tool host, Playwright's assertions finish but its managed web-server teardown does not return control without an interrupt; clean full-suite process exit remains for CI confirmation.
- Responsive/accessibility evidence: the participant and approver agreement journey exercised the client review UI at a 390 × 844 viewport. Component tests verified semantic role separation, plain-text rendering, exact-version confirmation, visible keyboard reorder controls, stale-state messaging, and preservation of local input during conflict recovery. Code inspection confirmed labels, fieldsets, live status/alert semantics, focus-managed existing confirmation dialogs, wrapping, and text labels for every comparison category.
- Persistence/security evidence: replica-set API tests inspected draft privacy, stale-write conflict, active-access rechecks, version immutability, identity-preserving copies, comparison, sequential numbering through withdrawal, first-decision-wins concurrency, contextual comments, activity creation, role-aware pending work, exact email recipients, all-delivery failure, and partial-delivery failure without domain rollback.
- Container validation: `clientscope-backend:local` and `clientscope-frontend:local` built successfully from their production Dockerfiles with the pinned Node.js `24.20.0` base. The backend image ran against a disposable `mongo:8.0` container on an isolated network and returned the approved `{"status":"ok","database":"connected"}` health response through `127.0.0.1:4400`. The two temporary containers and isolated network were removed after the check; the locally built images remain available.
- CI acceptance: GitHub Actions workflow run `12` for commit `dca6fec90859d7c21a8302e98fabadbb97d01a9c` completed successfully. Frontend checks, backend checks, all critical browser journeys, both production Docker builds, and the backend-container health smoke test passed on the established CI gate. Slice 1.2 acceptance is complete.
