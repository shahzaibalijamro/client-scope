# Slice 2.3: Client Feedback Summarization Validation

**Status:** Passed — validated and accepted 2026-09-14

## Highest-Risk Behavior

Validation must prove that the summary remains provider-private, read-only, precisely grounded, and subordinate to immutable client feedback. It must also prove deterministic freshness, current authorization, lifecycle locks, shared provider limits, and complete failure isolation.

The highest-risk failures are:

- Including provider-authored or otherwise ineligible records in the source set.
- Losing historical eligible feedback because a version was changed, withdrawn, or superseded.
- Producing claims or actions without exact stable source-record and version grounding.
- Converting conflicts or missing detail into confident invented resolutions.
- Leaking summary existence, content, fingerprints, or provenance to clients.
- Marking summaries outdated because of unrelated provider or workflow changes.
- Partially replacing or losing the last successful run during failure or concurrency.
- Generating after project completion or archival.
- Consuming a separate allowance instead of the shared Phase 2 provider-reaching limit.
- Mutating feedback, drafts, workflow state, history, notifications, or other authoritative data.

## Automated Checks

### 1. Eligibility and source-set rules

- Include immutable submitted-version comments authored by active-at-the-time Client Participants and Client Approvers.
- Include formal revision-request notes authored by an authorized Client Approver.
- Exclude provider comments, approval notes, withdrawal reasons, provider revision summaries, and unrelated project records.
- Retain eligible records from versions later marked changes requested, withdrawn, approved, or superseded.
- Verify current author-role changes neither remove historically eligible feedback nor make provider-authored feedback eligible.
- Count distinct record identities rather than versions; accept two eligible records on one version and reject zero or one.
- Reject cross-project, cross-deliverable, draft-only, nonexistent, and duplicate-only source identities.

### 2. Fingerprint and freshness rules

- Produce the same fingerprint for the same canonical eligible set regardless of database retrieval or incidental serialization order.
- Change the fingerprint when an eligible record is added, removed, or its immutable summarization-relevant representation differs.
- Do not change it for provider edits, membership changes, approval events, withdrawal, supersession, draft changes, activity, milestones, or other unrelated state.
- Persist the exact source references and fingerprint used by the successful run.
- Mark a run current only when stored and current fingerprints match and outdated otherwise.
- Keep an outdated result readable and unchanged until explicit successful regeneration.

### 3. Structured output and grounding

- Accept bounded themes, requested actions, and tensions with exact eligible record and submitted-version citations.
- Reject unknown, cross-deliverable, mismatched-version, missing, or citation-free result items.
- Reject malformed, oversized, empty, duplicate-only, unknown-field, and semantically incomplete provider responses.
- Verify repeated feedback may be grouped as a theme without adding facts.
- Verify actions require direct source support.
- Verify conflicting, ambiguous, incomplete, and incompatible statements appear as tensions rather than synthesized resolutions.
- Verify feedback containing prompt injection, URLs, or tool instructions remains inert data and cannot broaden provider context.

### 4. Authorization, tenant isolation, and privacy

- Allow generation and reading for current Workspace Owners and active assigned Service-Team Members only.
- Revoke assignment, deactivate membership, change role, or remove access after generation and verify all subsequent operations are denied.
- Verify both client roles, unassigned providers, and cross-workspace users cannot discover summary resources through identifiers, errors, response shapes, timing-sensitive branches, or nested project projections.
- Verify client and generic endpoints omit summary availability, existence, content, status, citations, fingerprints, actor, prompt/schema version, and provider/model metadata.
- Verify operational logs omit feedback text, summaries, fingerprints, prompts, full provider responses, credentials, and sensitive diagnostics.

### 5. Lifecycle and read-only behavior

- Permit generation in eligible pre-completion project states and reject it before provider access after completion or archival.
- Permit an otherwise authorized provider to read a retained summary after completion or archival.
- Verify deliverable approval, cancellation, withdrawal, revision requested, and supersession do not alone delete the latest run.
- Snapshot comments, decisions, versions, deliverable drafts, requirements, milestones, activity, pending actions, completion, archival, notifications, and email state before generation and prove none change afterward.
- Verify summary endpoints cannot create, edit, resolve, prioritize, or delete feedback or create a revision draft.

### 6. Latest-run replacement and concurrency

- Verify the first successful run creates exactly one latest-run resource.
- Verify successful explicit regeneration atomically replaces it and does not retain a user-visible or project-history sequence.
- Inject provider, validation, and persistence failures during regeneration and prove the prior successful run remains complete and readable.
- Run concurrent regenerations and prove readers never observe partial provenance or output and exactly one coherent latest result remains.
- Verify no automatic regeneration occurs when a result becomes outdated.

### 7. Shared limits and provider failures

- Exercise AI features collectively and verify the eleventh admitted provider-reaching request for one global user in a rolling hour is rejected even when calls span Slices 2.1, 2.2, and 2.3.
- Verify invalid, unauthorized, insufficient-source, and lifecycle-blocked requests do not consume the shared allowance.
- Verify admitted successful and failed provider calls consume it under the existing Phase 2 rule.
- Hold one provider-reaching AI request open and verify another AI request for that user is rejected before reaching the provider.
- Verify disabled configuration, timeout, late response, quota, transport, malformed output, oversized output, persistence failure, and authorization loss return safe errors and leave authoritative state untouched.
- Verify automated tests require no live Gemini access and use a deterministic fake provider.

### 8. Frontend and accessibility behavior

- Show generation controls and saved results only to authorized providers.
- Explain the two-record minimum and distinguish ineligible discussion from eligible client feedback.
- Clearly label summaries as provider-private, AI-generated, advisory, and subordinate to original feedback.
- Render all three structured sections with accessible source-version and feedback-record references.
- Display generation time and current/outdated state, retain outdated content, and require explicit regeneration.
- Show recoverable disabled, loading, timeout, malformed-output, rate-limit, insufficient-feedback, authorization-loss, and lifecycle-locked states without disabling manual feedback workflows.
- Verify keyboard use, focus movement, live announcements, semantic headings/lists, contrast, and wrapping at representative mobile and desktop widths.

### 9. Non-AI regression coverage

- Run existing deliverable, feedback, revision, approval, completion, archival, authorization, and tenant-isolation suites with AI disabled.
- Complete manual comment, revision-request, revision-submission, approval, completion, and archival journeys without invoking AI.
- Verify startup, health checks, tests, and builds do not require Gemini credentials or provider availability.
- Verify Slices 2.1 and 2.2 retain their behavior while sharing the same provider-reaching allowance.

## Critical End-to-End Scenarios

### Journey A — Grounded multi-version summary

1. Create eligible client feedback across multiple submitted versions, including comments and a formal revision-request note.
2. Generate as an assigned provider through a deterministic fake provider.
3. Verify every theme, action, and tension links to exact stable feedback and version identities.
4. Verify original feedback and every workflow record remain unchanged.
5. Sign in as both client roles and verify no summary existence or metadata is visible.

### Journey B — Deterministic outdatedness and replacement

1. Generate a current result and record its source references and fingerprint.
2. Perform unrelated provider and workflow edits and verify the result remains current.
3. Add eligible client feedback and verify the saved result remains visible but becomes outdated without a provider call.
4. Force a failed regeneration and verify the old result remains intact and outdated.
5. Complete a successful explicit regeneration and verify one coherent current latest run replaces it.

### Journey C — Authority and terminal lifecycle

1. Generate as an assigned Service-Team Member, then remove the assignment and verify subsequent read and regeneration are denied.
2. Restore valid provider access, complete and archive the project, and verify the saved result remains readable.
3. Verify generation and regeneration are rejected in both completed and archived states without reaching the provider.

### Journey D — Uncertainty and failure isolation

1. Supply eligible feedback containing conflicts, ambiguity, and missing details.
2. Verify these appear as grounded tensions and not confident actions.
3. Exercise disabled, timed-out, malformed, rate-limited, and persistence-failure paths.
4. Verify manual deliverable feedback and review remain usable and no authoritative state changes.

## Manual Checks

- Review realistic multi-version feedback to confirm themes are useful, actions are directly supported, and tensions preserve uncertainty faithfully.
- Inspect provider and client browser payloads to confirm private summary and provenance fields never cross client-facing boundaries.
- Test current, outdated, unavailable, insufficient-feedback, completed, and archived views at mobile and desktop widths.
- Complete generation, source navigation, and regeneration using keyboard and screen reader; verify focus, labels, announcements, and source-reference clarity.
- Inspect sanitized logs from success and each failure category without using real client-sensitive feedback.

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
- Run the focused Slice 2.3 Playwright journey and relevant existing lifecycle and AI regression journeys.

### Repository delivery gate

- Run the current documented CI-equivalent checks, including container verification where required.
- Confirm tests use a fake provider and need no Gemini, Atlas, Cloudinary, Gmail, Vercel, Northflank, or registry credentials.
- Scan tracked source and build output for credentials, private feedback fixtures, generated summaries, prompts, fingerprints, and unsafe diagnostics.
- Review the implementation diff against this specification and the constitution files.

## Evidence

### Recorded implementation evidence — 2026-09-13

- Baseline: `8163f3b` (`docs: specify client feedback summarization`). Environment: local Windows development workspace with MongoDB Memory Server and deterministic fake AI providers; no live Gemini, Atlas, Cloudinary, Gmail, Vercel, Northflank, or registry access.
- `backend: npm test -- --run test/slice-2.3-rules.test.ts test/slice-2.3-api.test.ts` — passed, 2 files and 9 tests.
- `backend: npm test` — passed, 22 files and 128 tests.
- `backend: npm run lint` — passed.
- `backend: npm run typecheck` — passed.
- `backend: npm run build` — passed.
- `frontend: npm test -- --run app/ai-feedback-summary-panel.test.tsx app/deliverable-panel.test.tsx` — passed, 2 files and 6 tests.
- `frontend: npm test` — passed, 11 files and 40 tests.
- `frontend: npm run lint` — passed.
- `frontend: npm run typecheck` — passed.
- `frontend: npm run build` — passed with all six application routes generated successfully.
- Focused evidence includes deterministic source ordering and fingerprints; exact record/version citation validation; historical client-comment and formal revision-note eligibility; provider/private serialization; current-authorization and terminal-lifecycle checks; shared allowance rejection; failed-regeneration retention; atomic concurrent replacement; advisory labels; exact source-reference rendering; outdated-result retention; client UI omission; keyboard-triggerable controls; focus movement; and live status announcements.
- `frontend: PLAYWRIGHT_REUSE_SERVER=1 npx playwright test e2e/slice-2.3.spec.ts` with the repository E2E backend and frontend started directly — passed, 1 Chromium journey in 18.9 seconds. It proved provider generation, exact record references, client UI omission, responsive mobile layout, and deterministic outdatedness.
- `frontend: PLAYWRIGHT_REUSE_SERVER=1 npx playwright test e2e/slice-1.5.spec.ts e2e/slice-1.6.spec.ts e2e/slice-2.1.spec.ts e2e/slice-2.2.spec.ts e2e/slice-2.3.spec.ts` with the repository E2E backend and frontend started directly — passed, 5 of 5 Chromium journeys in 1.0 minute.
- The project owner confirmed on 2026-09-14 that the specified manual acceptance checks should be considered complete. This confirmation covers the manual grounding-quality, provider/client privacy, responsive layout, keyboard, and assistive-technology review required for acceptance.
- The local managed-shell Playwright web-server launcher did not expose its spawned backend port, so browser evidence was collected with the same repository E2E server and Next.js server started directly and Playwright configured to reuse them. No application, fixture, provider, browser scenario, or assertion was bypassed.

Future acceptance should continue to record only real evidence:

- Baseline and implementation commit identifiers and environment category.
- Exact commands and pass/fail results.
- Focused unit, API, frontend, and end-to-end test names proving the highest-risk behavior.
- Manual grounding, privacy, responsive, keyboard, and assistive-technology results.
- Safe artifact references containing no credentials, private client feedback, generated private summaries, or sensitive diagnostics.
- Any approved exception, owner, rationale, risk, and follow-up.

## Merge Gate

Slice 2.3 implementation is safe to merge only when:

1. Every acceptance criterion has automated or recorded manual evidence.
2. Eligibility, exact grounding, uncertainty preservation, deterministic freshness, latest-run atomicity, lifecycle locks, current authorization, and tenant isolation pass focused tests.
3. Clients and unauthorized users cannot discover summary existence, content, freshness, citations, fingerprints, or provenance.
4. Shared Phase 2 allowance and one-in-flight behavior pass across all three AI slices.
5. AI disablement and every provider or persistence failure leave authoritative state and manual workflows unchanged.
6. No application secret, private feedback, summary, prompt, fingerprint, full provider response, or sensitive diagnostic appears in unsafe logs or tracked artifacts.
7. Backend and frontend linting, type checking, tests, builds, and critical Playwright journeys pass.
8. No excluded automatic drafting, resolution, mutation, cross-deliverable context, sentiment analysis, client AI access, autonomous action, or unrelated infrastructure is present.
9. Implementation and evidence match the approved requirements, mission, technology stack, and roadmap.
10. Roadmap completion status changes only after the implemented slice passes this gate and receives separate acceptance.
