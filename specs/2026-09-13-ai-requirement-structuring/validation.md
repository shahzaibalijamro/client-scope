# Slice 2.1: AI Requirement Structuring Validation

**Status:** Passed — accepted 2026-09-13

## Highest-Risk Behavior

Validation must prove that AI remains optional and advisory; private source and provenance never leak to clients; current tenant, project, and lifecycle authority is enforced; proposal content cannot drift to another draft revision; and Apply is atomic, append-only, and exactly once.

The highest-risk failures are:

- AI becoming a prerequisite for manual requirement workflows.
- Cross-tenant or client access to source, proposals, warnings, or provenance.
- Applying against a different or changed requirement draft.
- A repeated or concurrent Apply appending duplicate content.
- Provider edits overwriting original source or original model output.
- Unsupported model inventions becoming project commitments.
- Malformed or oversized output entering persistence or API responses.
- Apply mutating existing requirements or groups.
- Partial persistence of draft content, proposal state, or provenance.
- Provider, timeout, expiry, rate-limit, or configuration failures changing authoritative state.

## Automated Checks

### 1. Contract and boundary unit tests

- Accept trimmed plain-text source at 1 and 20,000 characters; reject empty, whitespace-only, non-string, and 20,001-character input.
- Accept exactly 10 groups, 25 requirements, 50 warnings, 50 criteria per requirement, and each maximum text length.
- Reject one item or character beyond every source, group, requirement, criterion, warning, array, reference, nesting, and serialized-response limit.
- Reject duplicate proposal-local identifiers, invalid group references, empty selected content, unused selected groups, and incomplete requirements.
- Accept only unique 1–64 character ASCII proposal-local keys and reject unknown structured-output fields or arbitrary warning metadata.
- Reject provider output larger than 512 KiB before persistence or browser return.
- Verify proposal, list-summary, applied-detail, and client-safe schemas expose only their approved fields.

### 2. Grounding and provider-boundary tests

- Use deterministic fixtures to prove source-supported regrouping, splitting, normalization, clarification, and acceptance-criterion derivation are accepted.
- Use fixtures containing missing technologies, integrations, dates, permissions, performance targets, security policies, platforms, and commitments; verify the result omits them and emits bounded warnings.
- Verify conflicting and ambiguous source details produce warnings rather than invented resolutions.
- Verify source text containing prompt-injection instructions cannot change the schema, request tools, add project context, or reveal system instructions.
- Verify URLs inside source remain inert text and trigger no fetch, resolution, browsing, or additional-context request.
- Verify only raw source, fixed instructions, output capacity, and schema reach the provider adapter; project content and membership data do not.
- Verify the configured model defaults to Gemini 2.5 Flash but can be changed server-side without altering domain logic or browser contracts.
- Verify the 30-second deadline, no automatic retry, late-response discard, response-size guard, and sanitized mapping for every provider failure category.

### 3. Proposal creation and draft binding

- Generate only for an authenticated Workspace Owner or active assigned Service-Team Member who can edit the current draft.
- Deny client roles, inactive/unassigned members, inaccessible projects, non-editable lifecycle states, and projects without an editable draft before a provider call.
- Record the exact project, stable draft identity, and current optimistic draft revision accepted at generation.
- Reduce requested group/requirement capacity to available draft space; block generation when no requirement capacity remains and require ungrouped output when no group capacity remains.
- Verify generation does not change draft content/revision, activity, notifications, email, pending actions, or submitted versions.
- Verify malformed, oversized, empty, blocked, truncated, timed-out, and unavailable-provider results create no proposal resource.

### 4. Representation immutability and working edits

- Verify raw source and original generated output remain byte-equivalent after every working edit.
- Verify working edits can change valid text, criteria, group placement, order, and requirement selection only while pending and unexpired.
- Verify the staging API rejects newly added proposal groups or requirements; additional manual content belongs in the ordinary draft workflow after Apply.
- Verify proposal optimistic concurrency rejects stale working updates without losing the winning edit.
- Verify removing a working group requires explicit reassignment or ungrouping of its requirements.
- Verify editing does not extend the 24-hour expiry.
- Verify warnings remain immutable provider guidance and cannot be converted implicitly into selected requirement content.

### 5. State, expiry, and one-shot behavior

- Verify allowed transitions are pending-to-applied, pending-to-discarded, and pending-to-expired only.
- Reject edits and Apply for applied, discarded, and expired proposals.
- Determine expiry from authoritative time even when cleanup has not removed the record.
- Verify discard and expiry do not change the draft or create project activity/history.
- Verify repeated Apply after success returns a stable terminal result and cannot append again.
- Verify concurrent Apply requests have one winner and exactly one draft/provenance mutation.

### 6. Current authorization and tenant isolation

- Revoke project assignment, deactivate membership, change role, or remove workspace/project access after generation; verify subsequent retrieve, edit, discard, Apply, list, and provenance access are denied.
- Verify current Workspace Owner access across owned projects and current assigned Service-Team Member access only within assigned projects.
- Verify Client Participants and Client Approvers cannot discover any AI resource through identifiers, collection routes, errors, timing-sensitive response shapes, or nested project responses.
- Verify cross-workspace and cross-project identifiers cannot retrieve or mutate proposals and do not reveal existence.
- Verify completed and archived project providers may read retained applied provenance when otherwise authorized but cannot generate, edit, or apply proposals.

### 7. Apply validation and stale binding

- Recheck current access, edit permission, lifecycle eligibility, proposal project/draft ownership, pending state, expiry, proposal revision, draft identity, base revision, expected revision, content, and capacity at Apply.
- Change the draft after generation through a normal edit; verify Apply returns a stale conflict, keeps the draft unchanged, and leaves the proposal pending until discard or expiry.
- Replace or remove the bound draft through submission/revision behavior; verify the proposal cannot bind to or apply against the new draft.
- Move the project into review, completion review, completed, or archived state; verify Apply fails safely.
- Exceed group or requirement capacity after generation; verify Apply rejects the selection atomically.
- Reject invalid final content even when the stored working proposal was previously valid.

### 8. Atomic append and identity tests

- Apply a subset and verify only selected requirements and their used proposal groups are appended.
- Verify all appended groups receive fresh normal group identifiers and requirements receive fresh stable logical identifiers.
- Verify proposal-local group references translate only to groups created by that Apply.
- Verify same-named generated and existing groups remain distinct.
- Snapshot existing groups and requirements before Apply and prove their identifiers, content, associations, and relative order remain unchanged afterward.
- Verify new groups and requirements are appended in the confirmed final-selection order.
- Verify the draft revision, appended content, final selection, provenance, and `applied` transition commit atomically.
- Inject persistence failures at each write boundary and prove no partial draft, state, or provenance survives.
- Submit and approve a later scope version and verify imported requirements use the ordinary snapshot, comparison, review, revision, and history rules.

### 9. Privacy and serialization tests

- Verify clients never receive raw source, original output, working content, warnings, final selection, prompt/model metadata, or provenance from project detail, scope review, requirement snapshots, comparisons, collections, summaries, pending actions, activity, or lifecycle endpoints.
- Verify AI content is absent from every transactional email payload and rendered template.
- Verify provider-private endpoints return data only to currently authorized providers through explicit allowlisted schemas.
- Verify imported requirement content is client-visible only after the ordinary provider submission and contains no AI badge or special approval metadata.
- Verify sanitized operational logs contain outcome/correlation metadata but never raw source, proposal text, warnings, credentials, prompts, full provider responses, or sensitive diagnostics.
- Verify discarded, expired, failed, malformed, timed-out, unavailable, and rate-limited attempts create no project-domain history.

### 10. Rate limiting and failure isolation

- Admit 10 provider-reaching requests for one user within a rolling hour and reject the eleventh with safe retry guidance.
- Verify the user becomes eligible as timestamps leave the rolling window.
- Verify invalid, unauthorized, and locally rejected requests do not consume allowance; successful and failed admitted provider calls do.
- Verify limits are per global user across projects and do not incorrectly block another user.
- Hold one admitted request open and verify a concurrent generation for that user is rejected before reaching the provider.
- Verify disabled configuration, timeout, transport failure, quota/rate failure, malformed output, expiry, discard, stale conflict, and persistence failure leave the authoritative draft unchanged.
- Verify no test or implementation requires Redis, a queue, a worker, or an external AI call.

### 11. Frontend behavior and accessibility tests

- Verify the manual requirement editor remains complete and enabled when AI is disabled or reports any failure.
- Verify only authorized provider views render the AI entry point, proposal list, staging controls, or applied provenance.
- Verify source disclosure, character limits, loading, one-in-flight state, safe errors, and deliberate retry behavior.
- Verify staging clearly labels content as AI-assisted and not yet part of the draft.
- Verify keyboard-only editing, selection, regrouping, ungrouping, ordering, discard, and Apply confirmation.
- Verify warnings remain visually and semantically distinct from proposed commitments.
- Verify focus and announcements after generation, validation failure, confirmation, Apply success, stale conflict, expiry, and terminal state.
- Verify the confirmation states that Apply appends selected items and does not change existing content.
- Verify successful Apply refreshes the normal draft and does not display client-facing AI badges.
- Verify mobile-width source, warning, and proposal layouts wrap safely without hover-only information.

### 12. Non-AI regression tests

- Run the existing requirements rule, API, component, and end-to-end suites with AI disabled.
- Create, edit, regroup, reorder, delete, submit, review, revise, and approve requirements without invoking AI.
- Verify no Gemini credential or provider availability is required for existing backend/frontend tests, builds, startup, health checks, or manual requirement behavior.
- Verify existing requirement authorization, tenant isolation, versioning, comparison, comments, notifications, and lifecycle locks remain unchanged.

## Critical End-to-End Journeys

### Journey A — Grounded selective Apply

1. Sign in as an authorized provider with a populated editable draft.
2. Paste valid messy source and generate through a deterministic fake provider.
3. Confirm the proposal is private and the official draft is unchanged.
4. Review warnings, edit working content, exclude one requirement, regroup another, and reorder the selection.
5. Confirm Apply.
6. Verify only selected content is appended with fresh identities, existing content is unchanged, provenance preserves all four representations, and a repeat Apply adds nothing.

### Journey B — Stale proposal protection

1. Generate a proposal bound to the current draft revision.
2. Change the draft through the normal manual editor.
3. Attempt Apply with the proposal's bound revision.
4. Verify a stale conflict, no draft mutation, no applied provenance, and a still-pending proposal that may only be reviewed or discarded before expiry.

### Journey C — Authority loss and privacy

1. Generate as an assigned Service-Team Member.
2. Remove the member's assignment before Apply.
3. Verify all proposal and provenance operations are denied without revealing private data.
4. Sign in as both client roles and inspect every project, scope, activity, summary, pending-action, and email surface; verify no AI-private data is exposed.

### Journey D — AI unavailable, manual workflow intact

1. Disable the AI provider and load an editable project draft.
2. Verify AI communicates unavailability without disabling manual controls.
3. Complete the normal requirement authoring, submission, client review, revision, and approval journey.
4. Repeat provider timeout, malformed-output, and rate-limit cases and verify the draft remains unchanged and manual work continues.

## Manual Checks

### Grounding review

- Use realistic notes containing vague requests, conflicting statements, and absent technical details.
- Confirm proposals reorganize explicit meaning without introducing unstated commitments.
- Confirm warnings identify missing decisions neutrally and remain provider-only.
- Review the fixed prompt and structured schema for accidental project-context inclusion or instructions that encourage invention.

### Responsive and accessibility review

- Test source entry, staging, warnings, confirmation, stale state, expiry, and provenance at representative mobile, tablet, and desktop widths.
- Complete the workflow by keyboard and with a screen reader.
- Verify focus order, labels, error associations, live announcements, contrast, wrapping, and confirmation focus restoration.

### Privacy and operational review

- Inspect browser network payloads for provider and client roles.
- Inspect safe logs for success and all failure categories without using real sensitive source text.
- Confirm credentials, prompts, provider responses, and raw diagnostics are absent from frontend bundles and public responses.
- Confirm pending cleanup and applied retention behave correctly in development/test time controls.

## Scope-Exclusion Checks

Confirm the implementation introduces none of the following:

- File/document upload or extraction, URLs, browsing, or external retrieval.
- Custom instructions, prompt editing, templates, or automatic project context.
- RAG, embeddings, vector storage, or project-wide search.
- Requirement quality review, feedback summarization, or another AI workflow.
- Client AI access, AI approval authority, autonomous submission, or automatic project mutation.
- AI-specific client badges, states, approval rules, emails, or shared activity.
- Redis, queues, workers, schedulers, or unrelated infrastructure added only for rate limiting or expiry.
- Changes to roadmap status before the complete implementation is validated.

## Required Repository Checks

### Backend

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

### Frontend

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Run the relevant Playwright Slice 2.1 journey plus existing critical requirements regression journeys.

### Repository delivery gate

- Run the repository's documented CI-equivalent checks, including container verification where the current gate requires it.
- Confirm tests use a fake provider and need no Gemini, Atlas, Cloudinary, Gmail, Vercel, Northflank, or registry credentials.
- Scan tracked files and build output for AI credentials, raw test source, provider responses, and sensitive diagnostics.
- Review the diff against the approved specification and constitutions.

## Evidence

### 2026-09-13 implementation evidence

- Baseline commit: `f9bf6965480d144504535a924087438ecd16cec6` (implementation working tree not yet committed).
- Environment: local Windows development/test environment, Node.js 24.20.0, isolated `mongodb-memory-server` replica sets, deterministic fake AI provider, Chromium through Playwright. No Gemini, Atlas, Cloudinary, Gmail, Vercel, Northflank, or registry credential was used.
- Backend `npm run typecheck`: pass.
- Backend `npm run lint`: pass.
- Backend `npm test`: pass, 18 files and 110 tests.
- Backend `npm run build`: pass.
- Frontend `npm run typecheck`: pass.
- Frontend `npm run lint`: pass.
- Frontend `npm test`: pass, 9 files and 34 tests.
- Frontend `npm run build`: pass.
- Frontend `npm run test:e2e`: pass, 11 Chromium journeys in 2.9 minutes, including all existing critical lifecycle journeys and the Slice 2.1 selective-Apply journey.
- Backend `docker build --tag clientscope-backend:slice-2-1 ./backend`: pass.
- Frontend `docker build --build-arg BACKEND_API_ORIGIN=http://backend:4000 --tag clientscope-frontend:slice-2-1 ./frontend`: pass.
- Backend-container smoke test against a disposable MongoDB 8 container: pass; `/api/v1/health` returned `status=ok` and `database=connected`, and the temporary containers and network were removed.
- Focused backend `npm test -- --run test/slice-2.1-api.test.ts test/slice-2.1-rules.test.ts`: pass, 10 tests covering strict input/output contracts, inert untrusted source, fixed prompt/capacity boundary, malformed/blocked/truncated/oversized responses, private generation, tenant/role denial, immutable original output, stale draft binding, append-only identities, idempotent and concurrent Apply, authoritative expiry, safe provider failure, retained manual draft state, and rolling per-user admission limits.
- Focused frontend `npm test -- --run app/ai-requirement-panel.test.tsx app/scope-panel.test.tsx`: pass, 5 tests covering disabled-AI manual availability, warning separation, save-before-Apply, explicit append confirmation, focus movement, and unchanged requirements review behavior.
- Focused responsive browser `npx playwright test e2e/slice-2.1.spec.ts`: pass at a 390 by 844 viewport. The journey generates through the deterministic provider, reviews a grounding warning, edits and saves staging content, confirms append-only Apply, refreshes the ordinary draft, exposes provider-only applied-run history, and verifies no horizontal overflow.
- `git diff --check`: pass. No credentials, raw private source fixture, or full provider response is stored in this evidence record.
- Manual live-Gemini grounding, provider/client privacy, responsive-layout, keyboard, focus/announcement, and assistive-technology checks were completed and accepted by the product owner on 2026-09-13.
- Final implementation review against the approved requirements, exclusions, mission, technology stack, and roadmap: pass. No unrelated AI workflow, document ingestion, retrieval system, autonomous action, Redis, queue, worker, or other prohibited infrastructure was introduced.
- Product-owner acceptance was received on 2026-09-13. Slice 2.1 was marked complete in the roadmap only after the automated, container, manual, privacy, and specification-review gates passed.

Record after implementation:

- Commit SHA and environment category.
- Exact commands and pass/fail results.
- Focused unit, API, frontend, and end-to-end test names proving the highest-risk behavior.
- Manual browser, responsive, accessibility, grounding, and privacy results.
- Safe screenshots or artifact paths that contain no credentials, raw private source, or private provider output.
- Any approved exception, owner, rationale, risk, and follow-up.

## Merge Gate

Slice 2.1 is safe to merge only when:

1. Every acceptance criterion has automated or recorded manual evidence.
2. Tenant isolation, current authorization, draft binding, expiry, idempotency, atomicity, append-only behavior, and private serialization pass their focused tests.
3. Grounding tests show unsupported commitments are omitted and surfaced only as bounded provider warnings.
4. Manual requirement workflows pass with AI disabled and under provider failure.
5. No client-facing API, activity, summary, history, email, or UI leaks AI-private data.
6. No application secret, raw source, prompt, full provider response, or sensitive diagnostic appears in tracked files or unsafe logs.
7. Backend and frontend lint, type checking, tests, builds, and critical Playwright journeys pass.
8. No excluded AI workflow, document ingestion, retrieval system, autonomous action, or new prohibited infrastructure is present.
9. Implementation and evidence match this approved specification, the mission, technology stack, and roadmap.
10. Roadmap completion status is changed only after the implemented slice passes this gate and is separately accepted.
