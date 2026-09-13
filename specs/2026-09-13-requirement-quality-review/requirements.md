# Slice 2.2: Requirement Quality and Ambiguity Review Requirements

**Status:** Approved — 2026-09-13

## Outcome

An authorized provider can ask ClientScope to review the complete current editable requirement draft for vagueness, missing acceptance detail, internal conflicts, and clarification needs. The provider can inspect the advisory findings, edit and select grounded suggestions in a private staging area, and explicitly apply one deterministic patch set to the exact reviewed draft revision.

The review assists human judgment only. Findings and suggestions do not modify authoritative project data, affect workflow state, or become project history unless and until an authorized provider explicitly applies a valid selected patch set. Successfully applied content becomes ordinary provider-authored draft content governed by the existing Slice 1.2 workflow.

## Scope

### Included

- On-demand review of the complete current editable requirement draft.
- A provider-neutral AI review boundary backed initially by the existing Google Gemini integration.
- Structured findings, applyable suggestions, and non-mutating clarification questions.
- Stable binding to the exact draft identity, draft revision, and logical requirement identities reviewed.
- Provider-only staging in which suggestions may be edited, selected, or ignored.
- One atomic Apply operation for the complete selected patch set.
- Concurrency-safe enforcement of one active review for the current draft revision.
- Immutable provider-private provenance for successfully applied reviews.
- Recoverable behavior for disabled AI, provider failure, malformed output, timeout, shared rate limiting, expiry, stale drafts, validation failure, and conflicting patches.

### Excluded

- Automatic rewriting, autonomous fixes, automatic Apply, or automatic review during draft submission.
- Creating or deleting requirements; merging or splitting requirements; changing requirement identity.
- Creating, removing, renaming, or reordering groups; moving requirements between groups; reordering requirements or criteria.
- Applying a guessed value where the draft does not contain the required fact.
- Files, documents, images, audio, URLs, URL retrieval, or external-source ingestion.
- Approved scope, prior requirement versions, comments, client information, memberships, milestones, deliverables, change requests, activity, or other project-context retrieval.
- Client access to review availability, runs, findings, suggestions, questions, edits, or provenance.
- Client feedback summarization or any other Phase 2 AI workflow.
- Submission, withdrawal, approval, rejection, completion, permissions, or lifecycle automation.
- Project activity, client-facing AI badges, AI-specific requirement states, or review-related email.
- Queues, Redis, workers, embeddings, vector search, or new infrastructure introduced solely for this slice.
- Changes to manual requirement authoring when AI is disabled or unavailable.

## Governing Principles

1. Every AI review output is advisory and provider-private.
2. Humans remain authoritative. Only a separate, explicit, authorized Apply can change the requirement draft.
3. Findings alone never modify the draft or affect submission, approval, scope state, permissions, pending client work, or project history.
4. Missing information produces a clarification question, never an inferred commitment or guessed patch.
5. The backend is the security, authorization, validation, concurrency, and privacy boundary.
6. Ordinary draft editing remains available during generation and staging. AI review never locks the draft.
7. The manual Slice 1.2 workflow remains fully usable during every AI failure or disablement state.
8. Only the minimum bounded draft content required for the requested review is sent to the provider.

## Terminology and Representations

### Bound draft

A review records the project identifier, stable editable-draft identity, and opaque optimistic draft revision accepted at generation. It also records the stable logical identities and exact content of every requirement sent for review. A review never rebinds or rebases to another draft or revision.

### Canonical review input

The server constructs a deterministic, versioned serialization containing only ordered group labels where necessary to understand the requirements and, for each reviewed requirement, its stable logical requirement identifier, title, description, and acceptance criteria. It contains no project name, client data, comments, history, memberships, workflow records, or provider-facing database identifiers beyond the minimum stable requirement references.

The UTF-8 byte length of this canonical serialization must not exceed **256 KiB (262,144 bytes)**. The server measures the finalized payload before contacting the provider. Oversized drafts are rejected without truncation, summarization, chunking, provider contact, or rate-allowance consumption.

### Original AI review output

The original output is the first complete provider response after structural and semantic validation. It is immutable and separately preserves the findings, suggestions, and clarification questions exactly as accepted from the provider boundary.

### Working suggestions

Working suggestions are provider-editable copies of the original applyable suggestions. Providers may edit proposed text, select suggestions for Apply, or ignore them. They cannot change a suggestion's target logical requirement, operation kind, or expected original field value. Working edits never rewrite the original output or authoritative draft.

### Final selected patch set

The final selected patch set is the immutable, fully validated snapshot of the selected working suggestions committed by a successful Apply. It records the exact human-confirmed operations and values before the draft mutation.

### Applied provenance

Applied provenance contains the immutable canonical review input, original AI output, final selected patch set, bound project/draft/revision, initiating and applying actor snapshots, generation/application timestamps, prompt version, provider-neutral operation identifier, configured provider/model identifiers, and bounded non-sensitive execution metadata. It is not general project activity and is never client-visible.

## Review Output Contract

The provider response distinguishes three concepts explicitly:

1. **Finding:** an advisory explanation of detected vagueness, missing acceptance detail, internal conflict, or clarification need.
2. **Applyable suggestion:** an optional grounded operation that can improve existing requirement content without inventing missing facts.
3. **Clarification question:** non-mutating guidance identifying information a provider or client must supply before a truthful change can be authored.

Rules:

1. Every finding has a provider-local key, one category (`vagueness`, `missing-acceptance-detail`, `conflict`, or `clarification-needed`), a concise explanation, one primary logical requirement ID, and optionally bounded related logical requirement IDs for a cross-requirement conflict.
2. Every target logical ID must exist in the bound input. Titles, text values, array positions, group labels, and model-created keys never substitute for requirement identity.
3. A suggestion references exactly one finding and one existing logical requirement ID.
4. A clarification question references a finding and at least one reviewed logical requirement ID. It cannot carry a patch operation.
5. A finding may have a suggestion, a clarification question, or advisory explanation alone. A missing fact must not have an applyable suggestion that supplies or assumes the answer.
6. Provider-local finding and suggestion keys contain 1–64 ASCII letters, digits, underscores, or hyphens and are unique within their entity type. They never become project-domain identifiers.
7. The response contains at most 200 findings, 200 suggestions, and 200 clarification questions. Finding explanations, clarification questions, and suggestion rationales are plain text of 1–1,000 characters.
8. The raw provider response may not exceed 512 KiB. Unknown fields, invalid references, duplicate keys, unsupported operations, unbounded nesting, and semantically inconsistent output are rejected before persistence.
9. The provider may return a valid empty review when it detects no material issue. An empty review remains advisory, may be viewed or discarded, and cannot be applied because it has no patch.

## Permitted Patch Operations

Every applyable suggestion targets one existing requirement by stable logical ID and uses exactly one operation:

- `replace-title` — replace the complete title, carrying the exact expected original title and proposed title.
- `replace-description` — replace the complete description, carrying the exact expected original description and proposed description.
- `replace-acceptance-criteria` — replace the complete criteria array, carrying the exact expected original array and proposed array.
- `append-acceptance-criteria` — append one or more proposed criteria to the exact expected original criteria array.

Patch rules:

1. Criteria are stored as strings without stable criterion IDs, so no operation may identify a criterion by index or position. Replacement targets the complete expected criteria field; append targets the requirement and exact expected array.
2. Suggestions cannot change their target or operation kind during working edits.
3. Suggested values and provider edits use the existing Slice 1.2 plain-text and field-length validation.
4. Append operations preserve the existing criteria order and append confirmed values in patch order.
5. No patch may create, delete, merge, split, move, regroup, reorder, or re-identify a requirement or group.
6. No patch may modify group data, requirement order, review/submission state, approval data, history, memberships, or any entity outside the bound editable draft.

## Review Lifecycle and Concurrency

Review states are:

- `generating` — an atomic reservation exists and one admitted provider call is in progress.
- `pending-review` — validated output is available for provider staging.
- `applied` — one selected patch set was committed successfully; terminal and immutable.
- `discarded` — explicitly ended without changing the draft; terminal.
- `expired` — the 24-hour staging period elapsed without successful Apply; terminal.

Freshness is separate from lifecycle state:

- `fresh` means the current editable draft identity and revision still equal the review binding.
- `stale` means the authoritative draft identity or revision changed after the review was bound. Staleness is permanent for that review.

Rules:

1. One fresh active review may exist for a project's current editable draft revision across all providers. `generating` and fresh `pending-review` count as active.
2. Generation begins by atomically reserving the draft/revision. Concurrent attempts yield one reservation and safe conflicts for the rest.
3. A new request never replaces, discards, or mutates an existing active review.
4. The generation reservation has a two-minute server-side lease. The provider call retains the established 30-second deadline. A failed, timed-out, or abandoned reservation ceases to block future generation after the lease and retains no draft content as project history.
5. A validated response changes `generating` to `pending-review` without changing the draft.
6. A pending review expires 24 hours after successful generation. Expiry is based on authoritative server time and does not depend on cleanup timing.
7. Ordinary draft mutations are never blocked by a generating or pending review.
8. Any authoritative draft identity or revision change after binding makes the review stale and permanently non-applicable. A stale pending review remains viewable or discardable until expiry but does not block a new review of the current revision.
9. `applied`, `discarded`, and `expired` reviews cannot return to an active state or be edited or applied.
10. Failed or malformed generation creates no pending review. Temporary reservations and provider outputs from failed attempts may be removed.

## Roles and Permissions

### Workspace Owner

A Workspace Owner may generate, discover, view, edit, discard, and apply reviews for any accessible project only while the existing requirement workflow grants draft-edit authority in the current lifecycle state.

### Service-Team Member

An active Service-Team Member explicitly assigned to the project has the same review actions only while current project access and the existing requirement workflow grant draft-edit authority.

### Client Participant and Client Approver

Client roles cannot discover review availability or generate, list, retrieve, edit, discard, or apply reviews. They cannot access findings, questions, provider data, or provenance. Identifier knowledge must not reveal whether a review exists.

### Current-authority rule

The backend rechecks current membership, project assignment, lifecycle state, editable-draft availability, and relevant action permission on every operation. Generation-time authority does not grant later access. Loss of access immediately removes review and provenance access without erasing retained actor snapshots.

## Generation and Provider Rules

1. Review is user-initiated and available only when AI is enabled and configured.
2. The project must have a non-empty current editable requirement draft, and the actor must currently have draft-edit authority.
3. The generation request supplies the last-read draft identity and optimistic revision. The server reloads and validates them before reservation and provider admission.
4. Only canonical review input, fixed versioned instructions, and the structured output schema are sent to the provider.
5. Draft text is untrusted data and cannot override instructions, request tools, broaden context, or change the response contract.
6. The provider may identify only draft-internal quality concerns. It must not introduce external facts, technologies, policies, deadlines, roles, commitments, or project context.
7. The provider-neutral AI boundary, configured Gemini model, 30-second deadline, safe error taxonomy, response-size guard, sanitized logging, and no-automatic-retry policy established by Slice 2.1 are reused.
8. One user may have at most one provider-reaching AI requirement request in flight across structuring and quality review.
9. A single shared allowance permits at most 10 provider-reaching AI requirement requests per user in any rolling 60-minute period across both features and all projects.
10. Only authenticated, authorized, schema-valid, within-size requests admitted to the provider count. Successful and failed provider calls count once admitted; local validation and rate-limit rejections do not.
11. Logs may contain bounded identifiers, duration, prompt version, and safe outcome categories, but never draft text, findings, suggestions, questions, credentials, prompts, raw provider output, or sensitive diagnostics.

## Working Review Rules

1. The UI identifies review output as AI-assisted, advisory, provider-private, and not yet part of the draft.
2. Authorized providers may inspect the bound draft snapshot, original findings, original suggestions, clarification questions, and editable working suggestions.
3. Working writes require the review's opaque optimistic revision token. Concurrent writes against one token yield one success and safe stale conflicts.
4. Providers may edit only proposed replacement or appended text and selection state. They may not edit original output, finding categories, explanations, questions, targets, expected values, or operation kinds.
5. Selecting or ignoring a suggestion never changes the authoritative draft and creates no project activity.
6. Clarification questions cannot be selected for Apply. Providers resolve them through ordinary human communication and manual draft editing.
7. At least one applyable suggestion must be selected for Apply.
8. Working edits do not extend the fixed 24-hour expiry or restore freshness.

## Selected Patch Validation

Before Apply, the server validates the entire selected working set:

1. Every suggestion belongs to the review, remains selected, targets a requirement in the immutable bound input, and retains its original target and operation kind.
2. Expected original field values exactly match both the bound input and the current authoritative draft.
3. Every proposed value passes existing requirement validation, and the resulting complete draft satisfies all per-field and total draft limits.
4. At most one replacement may target a given requirement field.
5. A replacement of acceptance criteria cannot coexist with an append to that field.
6. Multiple appends to one requirement are allowed only when their ordering is explicit and their combined result is deterministic and valid.
7. Duplicate or contradictory operations, unsupported fields, repeated selected IDs, unknown targets, invalid values, and any non-deterministic patch set are rejected.
8. Validation is performed against the complete resulting draft before any mutation. Failure returns a recoverable error and changes nothing.

## Atomic Apply Rules

Apply rechecks in one authoritative operation:

1. The actor's current project membership and draft-edit permission.
2. Current editable-draft availability and project lifecycle state.
3. Review ownership, project binding, `pending-review` state, and authoritative expiry.
4. Exact bound draft identity and optimistic draft revision.
5. Review freshness and the submitted review revision.
6. The complete selected patch set and resulting draft under all existing Slice 1.2 rules and limits.

On success:

- Every selected operation is applied to its stable logical requirement target.
- Requirement and group identities, associations, and ordering remain unchanged.
- The normal draft revision advances once.
- Original model output remains immutable.
- The final selected patch set and applied provenance become immutable.
- Review state becomes `applied` in the same transaction.

The draft mutation, revision advancement, final patch snapshot, provenance, and state transition succeed or fail together. Partial application is forbidden. Concurrent Apply calls are first-writer-wins; retries after success must not modify the draft again.

Apply creates no submission, approval, rejection, client action, email, project activity, AI badge, or separate requirement state. Applied text is ordinary draft content and may later be edited, submitted, versioned, reviewed, approved, or deleted only as permitted by Slice 1.2.

## Privacy and Retention

1. Canonical input, original output, working suggestions, selection state, questions, final patches, and model/provenance metadata are provider-private and potentially sensitive.
2. Explicit provider-only response allowlists are required. UI hiding is not a privacy boundary.
3. Review data must not appear in client project responses, requirement drafts or snapshots exposed to clients, comparisons, comments, pending actions, project activity, email, client exports, or generic serialization.
4. Pending reviews expire after 24 hours. Expired and discarded temporary data may be purged under the established temporary-AI-data policy.
5. Applied provenance is retained with the project through completion and archival and follows any later explicit permanent-deletion policy.
6. Failed, malformed, timed-out, unavailable, oversized, locally rejected, and rate-limited attempts retain no draft text or provider output as project-domain records.

## REST and Data Boundary Requirements

The versioned, project-scoped REST API will provide operations to:

- Generate a review for an expected editable draft identity and revision.
- List provider-accessible review summaries.
- Retrieve a pending, stale, or applied review through provider-private projections.
- Update working suggestion text and selection using an expected review revision.
- Discard an unexpired `generating` or `pending-review` review where safe.
- Apply the complete selected patch set using expected review and draft revisions.

Contracts distinguish lifecycle state, freshness, binding, immutable output, editable working data, final applied data, current permissions, expiry, and safe availability/failure categories. Client-facing and provider-facing projections remain separate. Cross-project and cross-workspace identifiers produce non-enumerating failures.

## User Experience and Accessibility

1. The provider draft screen offers a manual quality-review entry point without obstructing ordinary editing or submission.
2. Before generation, the UI explains that bounded draft content will be sent to the configured AI provider and that results are advisory.
3. Findings are grouped or filtered by category and remain traceable to the targeted requirement without using title as identity.
4. Applyable suggestions show current/expected and proposed content clearly. Providers can edit proposal text, select changes, and ignore suggestions using keyboard-operable controls.
5. Clarification questions are visibly non-applyable and explain that missing information requires human resolution.
6. Apply requires accessible confirmation describing the number and nature of selected changes and the all-or-nothing behavior.
7. Loading, expiry, stale state, access loss, validation conflict, provider failure, rate limiting, and successful Apply are announced with appropriate status semantics and recovery guidance.
8. Stale reviews preserve readable findings but disable editing and Apply, prompt refresh/rerun, and never discard ordinary draft edits.
9. The experience remains usable at the project's supported mobile viewport and with keyboard and screen-reader navigation.

## Failure Behavior

AI disablement, invalid configuration, oversize input, provider failure, timeout, malformed output, invalid references, shared rate limiting, expiry, stale draft state, access loss, lifecycle change, stale review revision, validation failure, contradictory patches, or transaction failure must:

- Leave the authoritative requirement draft unchanged.
- Create no project activity, email, approval data, or client-visible record.
- Return a stable, recoverable provider-facing error without sensitive diagnostics.
- Release or age out generation reservations safely.
- Preserve ordinary manual authoring whenever current Slice 1.2 rules allow it.

## Acceptance Criteria

1. An authorized provider can manually generate one review of the complete current editable draft and receives clearly separated findings, suggestions, and clarification questions.
2. Every output reference resolves to stable logical requirement identities from the exact bound draft revision.
3. Missing facts produce non-mutating questions and never guessed patches.
4. The server prevents concurrent active reviews for one current draft revision without silently replacing either request.
5. Draft editing remains available during generation and staging; a subsequent draft revision permanently prevents applying the older review.
6. Providers can edit only suggestion values, select a deterministic subset, and confirm one atomic Apply.
7. Invalid, overlapping, contradictory, structural, positional, identity-changing, or out-of-limit patches are rejected without partial mutation.
8. A successful Apply changes only permitted fields on existing targeted requirements, advances the draft revision once, and retains immutable original output and final applied provenance.
9. Apply rechecks current access, permission, lifecycle, draft availability, state, expiry, binding, freshness, review revision, draft revision, validation, and limits.
10. Client roles cannot discover or access review data, and review data never leaks through client serialization, email, activity, history, or export.
11. Drafts over 256 KiB of canonical UTF-8 input are rejected before provider contact without consuming the shared allowance.
12. Structuring and quality review share one per-user allowance of 10 admitted provider calls per rolling 60 minutes and one provider-reaching AI requirement request in flight.
13. Pending reviews expire after 24 hours; expired/discarded reviews cannot be applied; applied provenance remains provider-private through completion and archival.
14. Every documented failure leaves the draft unchanged and provides a recoverable provider experience.
15. Manual requirements authoring, submission, review, revision, and approval remain usable when AI is disabled or failing.
