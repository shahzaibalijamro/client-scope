# Slice 2.2: Requirement Quality and Ambiguity Review Validation

This document defines the evidence required before Slice 2.2 is safe to merge. Results and artifact references are recorded here during implementation; specification approval alone is not implementation evidence.

## Highest-Risk Behavior

The strongest evidence is required for:

1. AI findings or staging actions changing authoritative data without explicit Apply.
2. Cross-project, cross-workspace, client-role, or revoked-provider access to private review data.
3. Title-, group-, or position-based targeting changing the wrong requirement.
4. A draft change after generation allowing stale suggestions to overwrite newer work.
5. Concurrent generation creating more than one fresh active review for one draft revision.
6. Overlapping, contradictory, malformed, or structural patches applying partially or non-deterministically.
7. Original model output being overwritten by provider edits or final applied data.
8. Review data leaking through client serializers, activity, email, history, pending actions, logs, or exports.
9. Oversized input, malformed output, provider failure, timeout, rate limiting, or transaction failure mutating the draft.
10. Separate feature-specific rate buckets allowing the shared AI requirement allowance to be bypassed.

## Automated Checks

### 1. Contract and canonical-input tests

- Canonical serialization includes only ordered group context and stable logical IDs, titles, descriptions, and acceptance criteria.
- Serialization excludes project/client names, memberships, comments, scope history, milestones, deliverables, change requests, activity, and unrelated identifiers.
- Equivalent draft input serializes deterministically and uses UTF-8 byte length rather than JavaScript character count.
- Payloads at 262,144 bytes are eligible; payloads above it fail locally before reservation/provider admission and do not consume allowance.
- Output accepts only the four categories, bounded keys/text/arrays, valid logical-ID references, and the four permitted patch operations.
- Unknown fields, duplicate keys, unknown or model-invented IDs, invalid related IDs, unsupported operations, oversized responses, and inconsistent finding/suggestion/question relationships fail closed.
- Missing-fact fixtures produce clarification questions without applyable guessed patches.

### 2. Provider-boundary and grounding tests

- A deterministic fake provider receives only canonical draft content plus fixed instructions/schema.
- Prompt-injection text inside requirement fields remains inert data and cannot request tools, external retrieval, new context, or altered output.
- The adapter rejects patches that create/delete requirements, change identity, mutate groups, move/reorder data, or target positions.
- Disabled, misconfigured, timeout, quota, transport, malformed, oversized, and semantic failures map to stable safe errors.
- Provider calls have the configured deadline, perform no automatic retry, and do not log sensitive content.

### 3. Active review and generation concurrency

- Two concurrent generation requests for one draft/revision produce one atomic `generating` reservation and one safe conflict.
- A fresh `generating` or `pending-review` record blocks another review without being replaced or discarded.
- Different authorized drafts can be reviewed independently subject to the per-user in-flight and shared rate limits.
- Provider success transitions the reservation to `pending-review`; failure retains no pending review.
- An abandoned generation reservation stops blocking after the two-minute lease.
- A stale pending review does not block a new review of the latest revision.

### 4. State, expiry, and freshness

- State transitions permit only generating-to-pending, pending-to-applied/discarded/expired, and valid generating discard/expiry behavior.
- Server time makes a pending review inapplicable exactly at expiry even before cleanup.
- Applied, discarded, and expired reviews cannot be edited or applied.
- Any draft identity or revision change permanently marks applicability stale.
- Reverting draft text to identical values does not restore freshness because the optimistic revision changed.
- Stale reviews remain provider-readable/discardable until expiry but cannot be edited or applied.
- Ordinary draft editing succeeds while generation is in flight and while review is pending.

### 5. Current authorization and tenant isolation

- Workspace Owners can act only in their workspace and only while the lifecycle allows draft editing.
- Assigned active Service-Team Members can act only on their assigned projects with current draft-edit authority.
- Client Participants, Client Approvers, unassigned/deactivated members, revoked users, and users from other workspaces cannot discover or access review resources.
- Authorization is rechecked on generate, list, retrieve, working edit, discard, provenance read, and Apply.
- Access removed after generation immediately prevents later staging, Apply, and provenance access.
- Inaccessible identifiers return non-enumerating safe failures.

### 6. Representation immutability and working edits

- Original findings, suggestions, and questions remain byte-for-byte logically unchanged after working edits.
- Working edits can change only proposed values and selection state with the current review revision.
- Attempts to alter targets, expected values, operation kinds, categories, explanations, questions, or original output fail.
- Concurrent working writes against one token yield one success and one stale conflict without lost updates.
- Working edits and selection changes do not mutate the draft, create activity, send email, or extend expiry.
- Clarification questions cannot be selected or converted into patches.

### 7. Deterministic selected-patch validation

- Title and description replacements target complete expected fields on the identified logical requirement.
- Acceptance-criteria replacement targets the complete expected array; append operations never use an index.
- Unknown/deleted logical IDs and expected-value mismatches fail without mutation.
- Two replacements of the same field, replacement plus append, duplicate selected IDs, and contradictory operations fail as one rejected set.
- Multiple appends use explicit deterministic order and validate their combined result.
- Structural, identity-changing, group, order, and unsupported-field operations fail closed.
- Blank/oversized text, invalid criteria, duplicate or invalid arrays where prohibited, and total draft-limit violations fail under existing Slice 1.2 rules.
- An empty selection or clarification-only review cannot be applied.

### 8. Atomic Apply and concurrency

- Apply rechecks current membership, draft-edit authority, editable draft, lifecycle, review state, expiry, exact draft identity, draft revision, review revision, freshness, and complete patch validity.
- A valid selected set changes only the approved fields on exact logical requirement targets and advances the draft revision once.
- Group identity, requirement identity, associations, order, and unrelated values remain unchanged.
- Draft mutation, revision, final patch snapshot, provenance, and applied state commit together.
- Injected failures at each persistence step roll back the entire operation.
- Concurrent Apply requests produce one success; later/retried calls never apply twice or advance the draft again.
- Applied content works as ordinary draft content in later manual editing, submission, versioning, comparison, review, and approval.

### 9. Privacy and serialization

- Provider projections expose review data only to currently authorized providers.
- Client project views, requirement drafts/snapshots, comparisons, comments, pending actions, activity, history, and export fixtures contain no review fields or inferable review state.
- Review operations send no transactional email and create no activity record.
- Applied requirements contain no client-facing AI badge, provenance pointer, or AI-specific state.
- Sanitized logs exclude canonical input, requirement text, findings, suggestions, questions, prompts, model output, credentials, and sensitive diagnostics.
- Applied provenance remains accessible to authorized providers after completion and archival but not to clients.

### 10. Shared limiting and failure isolation

- Structuring and quality-review requests increment the same per-user rolling counter.
- Any combination of 10 admitted AI requirement calls in 60 minutes permits no eleventh provider call.
- Limits apply across projects and do not create separate per-feature allowances.
- Locally rejected authorization, validation, oversize, active-review, and rate-limit requests do not consume allowance.
- Successful and failed provider-reaching calls consume allowance once admitted.
- One provider-reaching request in either feature blocks another simultaneous AI requirement call for that user.
- Every local/provider/domain/transaction failure leaves draft identity, content, revision, history, pending actions, and reviewable scope unchanged.

### 11. Frontend behavior and accessibility

- Review controls appear only for currently authorized draft editors and do not replace manual controls.
- Pre-generation disclosure accurately describes advisory processing and bounded provider data.
- Findings, suggestions, and questions are semantically distinct and associated with the correct requirement.
- Suggested expected/proposed values are understandable without relying only on color.
- Providers can edit proposed text, select/ignore suggestions, and confirm Apply using keyboard and screen reader controls.
- Clarification questions are visibly non-applyable.
- Loading, empty, stale, expired, denied, rate-limit, provider-failure, validation, and success states use appropriate status/alert semantics.
- Stale recovery refreshes authoritative data without discarding or overwriting ordinary draft edits.
- The panel has no document-level horizontal overflow at 390 × 844 and remains usable at supported desktop widths.

### 12. Non-AI and Slice 2.1 regression tests

- With AI disabled, providers can create/edit/submit requirement drafts and clients can review them normally.
- Provider failures do not disable or degrade manual Slice 1.2 actions.
- Requirement structuring still generates, stages, and applies proposals under its approved rules.
- The generalized shared limiter preserves Slice 2.1 authorization, privacy, request accounting, and failure behavior.
- Existing requirement history, versioning, comparison, comments, notifications, and approval tests remain passing.

## Critical End-to-End Journeys

### Journey A — Review, curate, and atomically apply

1. Sign in as an authorized provider and open an editable draft containing vagueness and missing acceptance detail.
2. Generate a review and confirm separate findings, applyable suggestions, and clarification questions.
3. Edit and select multiple compatible suggestions while ignoring another finding.
4. Confirm Apply and verify all selected changes appear together, the draft revision advances once, and no forbidden structure changes.
5. Sign in as a client and verify ordinary draft content is visible only through the normal workflow with no AI metadata.

### Journey B — Stale review preserves newer work

1. Generate a review in one provider session.
2. Edit the authoritative draft in another session.
3. Verify the review becomes stale, remains readable, and cannot be edited or applied.
4. Verify the newer draft remains intact and a fresh review can be generated for its revision.

### Journey C — Concurrency and invalid patch protection

1. Start concurrent review requests for one draft and verify exactly one becomes active.
2. Stage overlapping or contradictory patches through controlled test data.
3. Attempt Apply and verify a recoverable rejection with no partial draft, provenance, history, or state mutation.

### Journey D — Authority loss and privacy

1. Generate a pending review as an assigned Service-Team Member.
2. Remove the member's assignment before staging or Apply.
3. Verify all further review/provenance access is denied without resource enumeration.
4. Verify a client in the project cannot discover the review through any client-facing surface.

### Journey E — AI unavailable, manual workflow intact

1. Exercise disabled, timeout, malformed-output, and rate-limited review states.
2. Verify clear provider recovery guidance and an unchanged draft.
3. Complete a normal manual edit and submission to prove core independence.

## Manual Checks

### Advisory quality review

- Review representative vague, conflicting, and incomplete drafts and confirm findings are useful without inventing facts.
- Confirm genuine unknowns become concise clarification questions rather than patches.
- Confirm suggestions improve only existing content and never imply approval or authoritative correctness.

### Responsive and accessibility review

- Complete generation, review, editing, selection, confirmation, stale recovery, and error handling with keyboard only.
- Check screen-reader announcements, labels, target associations, modal focus, error recovery, and non-color comparison cues.
- Inspect supported mobile and desktop layouts with long requirement and suggestion text.

### Privacy and operational review

- Inspect provider requests, API payloads, logs, email capture, activity, and client sessions for prohibited context or review-data leakage.
- Confirm production configuration exposes no credentials, prompt text, provider diagnostics, or model metadata to the browser.
- Confirm expiry and abandoned-reservation cleanup behavior in an environment using authoritative server time.

## Scope-Exclusion Checks

Verify the implementation adds none of the following:

- Automatic review, rewriting, Apply, submission, approval, or workflow decisions.
- Requirement/group creation, deletion, merge, split, movement, renaming, or reordering.
- Criterion-index targeting or requirement targeting by title, text, position, or group.
- Files, URL retrieval, document ingestion, external search, project-wide retrieval, or unrelated project context.
- Client AI controls, client-visible AI metadata, feedback summarization, or new AI workflows.
- Queues, workers, Redis, embeddings, vector storage, or unrelated infrastructure.

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
- Relevant Slice 2.2 and regression Playwright journeys

### Repository delivery gate

- Existing CI gate remains passing, including critical browser journeys and container verification.

## Evidence

### 2026-09-13 implementation evidence

- Baseline commit: `4bc770065409201d23d5ed449e411dc6ff04c8ba` (implementation working tree not yet committed).
- Environment: local Windows development/test environment, Node.js 24.20.0, isolated `mongodb-memory-server` replica sets, deterministic fake AI providers, and Chromium through Playwright. No Gemini, Atlas, Cloudinary, Gmail, Vercel, Northflank, or registry credential was used.
- Backend `npm run lint`: pass.
- Backend `npm run typecheck`: pass.
- Backend `npm test`: pass, 20 files and 119 tests.
- Backend `npm run build`: pass.
- Frontend `npm run lint`: pass.
- Frontend `npm run typecheck`: pass.
- Frontend `npm test`: pass, 10 files and 37 tests.
- Frontend `npm run build`: pass.
- Frontend `npm run test:e2e`: pass, 12 Chromium journeys in 4.4 minutes, including all existing lifecycle journeys, the Slice 2.1 AI structuring journey, and the Slice 2.2 quality-review journey.
- Backend `docker build --tag clientscope-backend:slice-2-2 .`: pass.
- Frontend `docker build --build-arg BACKEND_API_ORIGIN=http://backend:4000 --tag clientscope-frontend:slice-2-2 .`: pass.
- Focused backend `npm test -- --run test/slice-2.2-rules.test.ts test/slice-2.2-api.test.ts`: pass, 9 tests covering deterministic canonical UTF-8 serialization at and above 256 KiB, strict output shape and stable-ID grounding, clarification-without-guessed-patch rules, inert untrusted draft input, provider failure mapping, private staging, immutable original output, stale draft protection, active-review concurrency, conflicting-patch rollback, current authority, expiry cleanup, atomic/idempotent Apply, shared Slice 2.1/2.2 limiting, and oversized-input rejection before provider admission.
- Focused frontend `npm test -- --run app/ai-requirement-review-panel.test.tsx app/scope-panel.test.tsx`: pass, 6 tests covering disabled-AI manual availability, bounded-processing disclosure, distinct non-applyable clarification questions, immutable targets, editable proposals, save-before-Apply, explicit all-or-nothing confirmation, stale-state recovery guidance, keyboard focus, and unchanged manual scope behavior.
- Focused responsive browser `npm run test:e2e -- --grep "quality suggestions"`: pass at a 390 by 844 viewport. The journey saves an ordinary requirement draft, generates through the deterministic provider, separates findings/suggestions/questions, edits and saves staging, confirms atomic Apply, refreshes ordinary draft content, exposes provider-only applied provenance, and verifies no document-level horizontal overflow.
- Live Gemini compatibility check using the configured server-only key and `gemini-3.5-flash-lite`: pass for both requirement structuring and quality review. The check exposed unsupported `additionalProperties`, `minItems`, and `maxItems` keywords in Gemini's `responseSchema` dialect; those provider hints were removed while strict Zod validation and explicit server-owned output/capacity bounds remain authoritative. Regression tests now assert that unsupported schema keywords are not sent. No key, prompt payload, or raw model response was recorded.
- `git diff --check`: pass. The implementation and evidence contain no credential or real private draft/provider output.
- Specification review: the implementation introduces no automatic review or Apply, client AI access, structural/identity patch, external retrieval, activity/email side effect, client-facing AI state, queue, worker, Redis, embedding, vector store, or unrelated infrastructure.
- Product-owner acceptance was received on 2026-09-13 after live Gemini and user-interface review. The product owner confirmed that Slice 2.2 looks good and authorized the pull-request and merge workflow. Slice 2.2 was marked complete in the roadmap after this acceptance and the recorded automated, live-provider, responsive, privacy, and specification-review evidence passed.

Record during implementation:

- Exact commands and environment category.
- Pass/fail result and date.
- Focused unit, API, UI, and end-to-end test names.
- Safe screenshots, reports, or CI links where useful.
- Any approved exception and its rationale.

Never record credentials, canonical draft content, original/working/final AI text, prompts, raw provider responses, or sensitive diagnostics.

## Merge Gate

Slice 2.2 is safe to merge only when:

1. Every acceptance criterion in `requirements.md` has implementation evidence.
2. Stable-ID targeting, current authorization, tenant isolation, privacy, active-review concurrency, stale protection, deterministic validation, and atomic Apply tests pass.
3. Provider and domain failure tests prove the authoritative draft remains unchanged.
4. Shared Slice 2.1/Slice 2.2 limiting and non-AI regression tests pass.
5. Required lint, type checks, tests, builds, Playwright journeys, and CI gate pass.
6. Manual advisory-quality, accessibility, responsive, privacy, and operational checks are complete.
7. No prohibited application behavior or scope expansion was introduced.
8. The implementation matches the approved specification and constitution; only then may roadmap completion status be updated separately.
