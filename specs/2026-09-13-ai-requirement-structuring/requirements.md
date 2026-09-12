# Slice 2.1: AI Requirement Structuring Requirements

**Status:** Approved — 2026-09-13

## Outcome

An authorized provider can paste unstructured source material, ask ClientScope to organize it into a proposed requirement draft, review and edit that proposal in a private staging area, and explicitly append selected items to the current project requirement draft.

The capability is optional and advisory. It accelerates provider authoring without becoming an authority, changing the meaning of the source, or weakening the existing manual requirement, review, approval, versioning, and history workflows.

## Scope

### Included

- One plain-text source input for requirement structuring.
- Provider-neutral AI service boundary backed initially by Google Gemini.
- Strictly structured proposals containing ordered groups, requirements, acceptance criteria, and provider-only grounding warnings.
- A private staging workflow in which an authorized provider can edit, select, regroup, reorder, discard, or explicitly apply a pending proposal.
- Binding each proposal to the exact project requirement draft and optimistic revision present when generation starts.
- Atomic append of selected proposal content to the bound draft.
- Immutable, provider-private provenance for successfully applied proposals.
- Recoverable behavior for disabled AI, provider failures, invalid responses, rate limiting, expiry, and stale drafts.

### Excluded

- Files, document ingestion, images, audio, URLs, URL retrieval, or pasted rich text.
- Custom provider instructions, prompt editing, reusable prompts, or requirement templates.
- Automatic use of project requirements, comments, changes, deliverables, activity, client data, or other project context.
- Retrieval-augmented generation, embeddings, vector search, or project-wide retrieval.
- Requirement quality or ambiguity review beyond warnings needed to avoid inventing missing source detail.
- Client feedback summarization or any other Phase 2 AI workflow.
- Client access to AI generation, proposals, source material, warnings, or provenance.
- Automatic modification, replacement, submission, approval, rejection, or publication of project data.
- New approval rules, AI-specific client badges, or AI-specific requirement states after application.
- Background workers, queues, Redis, or new infrastructure introduced solely for this slice.
- Changes to the manual requirements workflow when AI is disabled or unavailable.

## Governing Principles

1. AI is advisory. It may propose content but cannot make a project decision or create official requirement content without an explicit authorized human action.
2. Manual requirement creation, editing, submission, review, revision, and approval remain fully usable when AI is disabled, unavailable, rate-limited, malformed, or timing out.
3. The backend is the security boundary for every generation, proposal, provenance, and Apply operation.
4. Only the minimum approved input is sent to the provider: the pasted source plus the fixed system instructions and structured-output schema. No existing project content or membership data is included.
5. AI-origin data remains private to currently authorized providers even after the resulting requirements become visible through the normal client review workflow.
6. No AI failure may change the authoritative requirement draft.

## Terminology and Data Representations

### Bound draft

Each proposal records the project identifier, the stable identity of the editable requirement draft, and the draft's optimistic revision token at the instant generation is accepted. These values form the proposal's binding.

A proposal never floats to a different draft. A replacement draft, a missing draft, or any revision change after generation makes the proposal stale for Apply even when its content would otherwise be valid.

### Raw source

The raw source is the exact validated plain text supplied by the provider. It is immutable after the generation request is accepted. It is never rewritten from normalized prompt text or provider output.

### Original generated proposal

The original generated proposal is the first complete provider response after structural and semantic boundary validation. It is immutable. It contains ordered generated groups and requirements plus grounding warnings.

### Working proposal

The working proposal is a mutable provider-only staging copy initialized from the original generated proposal. While the proposal is pending, authorized providers may:

- Edit group names, requirement titles, descriptions, and acceptance criteria.
- Select or exclude requirements from Apply.
- Regroup and reorder proposal content.
- Add, edit, reorder, or remove acceptance criteria within the existing per-requirement limit.

Working edits never rewrite the raw source or original generated proposal. They do not change the authoritative project draft and do not create requirement history.

### Final applied selection

The final applied selection is the immutable snapshot of selected, fully validated working content committed by a successful Apply. It records exactly what the human confirmed, before server-generated project identities are attached to the new draft items.

### Applied provenance

Applied provenance contains the immutable raw source, original generated proposal, final applied selection, bound project/draft/revision, initiating and applying actor snapshots, creation and application timestamps, prompt version, provider-neutral operation identifier, configured provider/model identifiers, and non-sensitive execution metadata needed to explain the import.

Applied provenance is not general project activity and is never serialized through client-facing project views.

## Proposal State Model

The proposal lifecycle has four states:

- `pending` — available for authorized provider review and editing until its expiry time.
- `applied` — successfully appended once; immutable and permanently ineligible for another Apply.
- `discarded` — explicitly ended without changing the requirement draft.
- `expired` — reached its expiry time without successful application.

Rules:

1. A newly validated provider response creates one `pending` proposal.
2. Only `pending` proposals may be retrieved as editable staging data, edited, discarded, or applied.
3. A pending proposal expires 24 hours after successful generation. Expiry is determined authoritatively by server time on every operation; cleanup timing cannot extend usability.
4. Discard and expiry are terminal. They create no project-domain history and the temporary content may be purged.
5. Apply is a one-shot transition from `pending` to `applied`. The draft append and applied provenance commit succeed or fail together.
6. An `applied`, `discarded`, or `expired` proposal cannot return to `pending`, be edited, or append content.
7. Retrying Apply after success must never append duplicate groups or requirements. It returns the terminal applied result or a stable already-applied response without another mutation.
8. Failed or malformed generation attempts do not create proposal resources.

## Roles and Permissions

### Workspace Owner

A Workspace Owner may generate, view, edit, discard, and apply proposals for any accessible project when the existing requirement workflow grants draft-edit authority in the project's current lifecycle state. The owner may view applied provenance while retaining project access.

### Service-Team Member

An active Service-Team Member explicitly assigned to the project has the same AI-structuring actions only while the existing requirement workflow grants that member draft-edit authority. Removal, deactivation, or loss of project assignment immediately removes proposal and provenance access.

### Client Participant and Client Approver

Client roles cannot generate, discover, list, retrieve, edit, discard, or apply proposals and cannot access applied provenance. Knowledge of an identifier does not reveal whether a proposal exists in another project or workspace.

### Current-authority rule

Authorization is evaluated from current backend membership and lifecycle state on every operation. Generation-time authority is never sufficient for later retrieval, editing, discard, Apply, or provenance access.

## Generation Rules

1. Generation is available only when AI is enabled and server configuration is valid.
2. The project must be accessible to the actor, contain an editable requirement draft, and be in a lifecycle state that permits requirement editing.
3. The submitted source may contain at most 20,000 characters and must contain at least one non-whitespace character. The exact source is retained, while intentional internal line breaks are preserved for the provider request.
4. The source is treated only as untrusted data. It cannot override system instructions, request tools, broaden context, or change the output contract.
5. Generation sends no project content, project/client names, memberships, comments, identifiers, or prior AI records to the provider.
6. Output is limited to 10 groups, 25 requirements, and 50 warnings.
7. Generated group names use the existing 1–120 character plain-text limit.
8. Generated requirements use the existing limits: title 1–120 characters, description 1–5,000 characters, 1–50 acceptance criteria per requirement, and 1–2,000 characters per criterion.
9. Provider-generated proposal-local keys are unique within their entity type and contain 1–64 ASCII letters, digits, underscores, or hyphens. They are references only and never become project-domain identifiers.
10. Each warning is trimmed plain text of 1–1,000 characters. A warning has one fixed category, its message, and at most one bounded proposal-local target key; it contains no arbitrary metadata.
11. All generated strings, identifiers, arrays, nesting, references, and total serialized response size are bounded before persistence or return. Unknown fields are rejected, and a provider response exceeding 512 KiB is rejected.
12. Provider output must pass the structured schema and application semantic validation. Syntactically valid JSON is not trusted by itself.
13. Generated keys cannot be accepted as MongoDB, project, group, logical requirement, snapshot, membership, or user identifiers.
14. The maximum requested output is reduced to the remaining capacity of the bound draft at generation time. If no requirement capacity remains, generation is unavailable. If no group capacity remains, generated requirements must be ungrouped.
15. URLs appearing inside pasted source are inert text: ClientScope and the provider integration do not fetch, open, resolve, or use them as external context.
16. Generation never changes the requirement draft, creates project activity, sends email, or creates a pending client action.

## Grounding Rules

Gemini may:

- Reorganize source-supported information into groups and requirements.
- Split compound source statements into separate requirements.
- Normalize grammar, labels, and formatting without changing meaning.
- Clarify wording where the clarification is directly supported by the source.
- Derive acceptance criteria when the expected behavior or outcome is directly supported by the source.

Gemini must not invent or assume absent:

- Technologies, frameworks, providers, integrations, or implementation methods.
- Platforms, browsers, devices, operating systems, or deployment targets.
- Deadlines, schedules, estimates, milestones, or priorities.
- Roles, permissions, approval authority, or access policies.
- Performance, scale, availability, reliability, or compatibility targets.
- Security, privacy, legal, compliance, retention, or audit commitments.
- Commercial, payment, billing, or contractual commitments.
- Features, workflows, acceptance outcomes, or other scope not supported by the source.

Unsupported, conflicting, or materially ambiguous detail is omitted from proposed commitments and represented as a provider-only warning. Warnings identify the gap without answering it. The fixed prompt and structured schema encode these rules, but the backend still validates every enforceable bound.

## Provider Boundary and Operational Limits

1. AI access is isolated behind a provider-neutral backend interface. Domain authorization, proposal lifecycle, and Apply rules do not depend on Gemini-specific response types.
2. Google Gemini is the initial provider. The default model is `gemini-2.5-flash`; the model identifier is configurable through server-only configuration.
3. Provider credentials, model configuration, raw diagnostics, prompts, and transport details are never returned to the browser or written to project history.
4. The fixed prompt has an application-controlled version identifier stored with applied provenance.
5. One provider call has a 30-second deadline. Client disconnect does not authorize a late provider response to alter project data.
6. The application performs no automatic provider retry. A user may deliberately start another request, subject to authorization and rate limits.
7. A user may have at most one provider-reaching generation request in flight.
8. A user may start at most 10 provider-reaching generation requests in any rolling 60-minute period across projects.
9. Only an authenticated, authorized, schema-valid request that is admitted to the provider boundary consumes a generation allowance. Locally rejected requests and rate-limit rejections do not.
10. Successful and failed provider calls consume an allowance once admitted. Operational accounting may be retained only as long as required to enforce the rolling window and is not project history.
11. The rate-limit implementation must suit portfolio scale and must not introduce Redis, queues, workers, or unrelated infrastructure solely for this feature.

## Working Proposal Rules

1. Staging is visibly labeled as AI-assisted and not yet part of the project requirement draft.
2. The provider can compare the working proposal with grounding warnings and the raw source without exposing either to clients.
3. Working proposal writes require the proposal's own optimistic revision token so concurrent staging edits cannot silently overwrite each other.
4. Working content must satisfy the same per-field limits as generated content. Providers cannot add proposal groups or requirements; they use the ordinary draft workflow after Apply for additional manual content. Warnings are immutable model output and cannot be edited into commitments.
5. A group may be removed only by explicitly moving its working requirements to another proposal group or to the ungrouped area.
6. At least one requirement must be selected before Apply. Unselected requirements and groups left unused by the selected requirements are not applied.
7. Editing or selecting proposal content does not refresh the fixed 24-hour expiry.
8. A stale draft does not silently rebind the proposal. The provider may review or discard it until expiry, but cannot apply it.

## Apply Rules

The backend rechecks all of the following in one authoritative operation:

1. The actor is authenticated and has current access to the bound project.
2. The actor currently has requirement-draft edit permission.
3. The bound draft still exists and is the current editable draft.
4. The project lifecycle currently permits requirement editing.
5. The proposal belongs to the bound project and draft.
6. The proposal is `pending` and has not expired.
7. The submitted proposal revision is current.
8. The submitted expected draft revision equals both the proposal's bound base revision and the current authoritative draft revision.
9. At least one selected requirement and every included group, reference, field, and criterion are valid.
10. The appended content remains within the existing maximum of 50 total draft groups and 200 total draft requirements.

On success:

- Only selected requirements and groups referenced by selected requirements are appended.
- Every appended group receives a fresh normal draft group identifier.
- Every appended requirement receives a fresh stable logical requirement identifier.
- Proposal-local group references are translated only to newly created group identifiers from the same Apply.
- New groups and requirements follow the confirmed proposal order and are appended after existing groups and requirements.
- Existing groups and requirements retain their identifiers, content, associations, and relative order.
- Same-named generated and existing groups remain separate.
- The draft revision advances using the existing optimistic concurrency behavior.
- The exact final selection and applied provenance become immutable.
- Proposal state becomes `applied` in the same atomic commit.

Apply must never overwrite, delete, rename, regroup, reorder, merge, or otherwise mutate an existing requirement or group. A successful import creates no client decision, sends no email, and does not submit the draft for review.

After Apply, imported items are indistinguishable from manually created draft items in the normal requirements workflow. They may be edited or deleted while ordinary draft rules permit and participate in later submission, snapshots, comparison, review, revisions, approval, completion, and history under the existing rules. They carry no client-facing AI badge and require no special approval.

## Privacy and Retention

1. Raw source, original output, working content, warnings, final selection, prompt/model metadata, and AI provenance are provider-private and potentially sensitive.
2. Current authorized providers may access pending proposals and applied provenance only inside the bound project context.
3. None of that private data may appear in client-facing API responses, project summaries, collection views, requirement snapshots, comparison payloads, shared activity, pending-action projections, emails, logs intended for users, exports defined for clients, or generic serialization.
4. API response models use explicit allowlists. Removing UI fields is not an adequate privacy boundary.
5. Applied provenance is retained with the project record, including while completed or archived, and follows any later explicitly specified permanent project-deletion policy.
6. Pending source and proposals are retained for no more than 24 hours. Discarded and expired temporary content may be removed immediately and must not be retained as project-domain history.
7. Failed, malformed, timed-out, unavailable-provider, and rate-limited attempts do not retain raw source or provider output as project records.
8. Sanitized operational logs may record request correlation, outcome category, duration, and bounded non-sensitive identifiers. They must not record raw source, proposal text, warnings, credentials, prompts, full provider responses, or sensitive diagnostics.

## REST and Data Boundary Requirements

The versioned REST API provides project-scoped operations to:

- Generate a proposal from source text.
- Retrieve one pending proposal for staging.
- Update the working proposal and its selections using optimistic concurrency.
- Discard a pending proposal.
- Apply a pending proposal using the expected proposal and draft revisions.
- List accessible pending and applied runs with privacy-safe summaries.
- Retrieve provider-private details for one applied run.

API rules:

1. Generation returns proposal identity, state, bound draft identity and revision, proposal revision, expiry, working groups and requirements, warnings, and allowed actions.
2. Working-update requests contain the complete bounded working proposal and expected proposal revision. The backend does not accept arbitrary patch paths.
3. Apply requests contain the expected proposal revision, expected draft revision, and complete final selected content. The backend derives all project identities.
4. A stale draft returns a conflict response, preserves the authoritative draft, and leaves the unexpired proposal pending for review or discard; it cannot be rebound or applied.
5. Expired and discarded resources return a stable unavailable/terminal response without private content. An already-applied request returns a stable applied result without mutation.
6. Cross-project, cross-workspace, client-role, and inaccessible resource requests fail without revealing resource existence or private metadata.
7. Provider-disabled, provider-unavailable, timeout, malformed-response, and rate-limit errors use safe application error categories with actionable retry guidance where retry is appropriate.
8. Provider names, model identifiers, prompts, credentials, raw errors, quotas, and stack traces are absent from client authority rules and public error details.
9. All request and response schemas are explicitly bounded and validated at the backend boundary.

## Validation and Failure Behavior

- Empty, whitespace-only, overlong, or non-string source input is rejected before any provider call or allowance consumption.
- Invalid working content is rejected without altering the proposal's prior working revision.
- A malformed, oversized, schema-invalid, semantically invalid, blocked, empty, or truncated provider response creates no proposal.
- Provider disablement or configuration failure reports AI as unavailable while leaving manual authoring available.
- Provider timeout, transport failure, quota exhaustion, and rate limiting return safe recoverable errors and never partially persist a proposal or change the draft.
- Proposal expiry is evaluated even if physical cleanup has not run.
- Loss of access or authority immediately blocks proposal and provenance access.
- Draft replacement, submission, revision advancement, review state, project completion, or archival blocks Apply as stale or lifecycle-ineligible.
- Capacity is revalidated at Apply. A generation-time capacity calculation never guarantees later application.
- Duplicate or concurrent Apply requests have one winner and cannot duplicate content or provenance.
- Atomic persistence failure rolls back the draft append, proposal transition, and applied provenance together.
- AI-specific errors do not erase staging content unless the proposal expires or is discarded.

## User Experience and Accessibility

1. The manual requirement editor remains the primary complete workflow and does not require AI configuration.
2. AI availability and failure are presented without disabling unrelated manual controls.
3. The source form explains that pasted content is sent to the configured AI provider and remains provider-private within ClientScope.
4. The staging view clearly distinguishes source, AI output, warnings, human edits, selected items, and the official draft.
5. Apply requires an explicit confirmation describing that selected items will be appended and existing content will remain unchanged.
6. The UI shows expiry and stale status and never implies that a stale proposal can be merged automatically.
7. Editing, selection, grouping, ordering, discard, and confirmation are keyboard operable without pointer-only drag and drop.
8. Validation and provider errors are associated with the relevant control, announced accessibly, and do not expose provider diagnostics.
9. Focus is managed when generation completes, confirmation opens or closes, Apply succeeds, or a terminal/failure state is shown.
10. Responsive layouts keep source, warnings, and proposal content understandable on supported mobile widths.

## Acceptance Criteria

1. An authorized provider with an editable draft can generate one private, bounded, source-grounded proposal from valid pasted text without changing the draft.
2. Workspace Owners and active assigned Service-Team Members receive AI actions only when their current requirement-draft permission allows them; all client and inaccessible contexts are denied by the backend.
3. The proposal records the exact project, draft identity, and base draft revision present when generation starts.
4. Raw source and original model output remain immutable while the pending working proposal can be edited and selectively staged.
5. Output never exceeds 10 groups, 25 requirements, 50 warnings, existing requirement field limits, warning limits, or the provider-response size limit.
6. Grounded generation does not add unsupported technologies, integrations, dates, permissions, targets, policies, platforms, or commitments; gaps appear only as provider-private warnings.
7. Apply rechecks all current authorization, lifecycle, state, ownership, expiry, revision, validation, and capacity rules.
8. A successful Apply atomically appends only selected valid content, assigns fresh normal identities, advances the draft revision, records immutable final provenance, and transitions the proposal once to `applied`.
9. Existing groups and requirements retain the same identifiers, field content, associations, and relative order after Apply; only the draft-level revision and appended content change.
10. Same-named existing and generated groups remain distinct.
11. Duplicate, concurrent, expired, discarded, stale, malformed, unauthorized, over-capacity, or failing Apply attempts cannot append content or partially persist provenance.
12. Imported items participate in the existing manual draft and versioning workflow without AI badges, client-visible provenance, or special approval behavior.
13. Source, output, warnings, working content, final selection, and provenance are absent from every client-facing API, summary, activity projection, email, and other shared serialization.
14. Pending proposals expire authoritatively after 24 hours. Discarded, expired, and failed attempts create no project-domain history.
15. The provider boundary defaults to configurable Gemini 2.5 Flash, times out after 30 seconds, performs no automatic retry, and does not leak provider details into domain authority.
16. The backend enforces 10 admitted generation calls per user per rolling hour and one in-flight call per user without adding prohibited infrastructure.
17. AI disablement, unavailability, rate limiting, malformed output, or other failure leaves all manual requirement capabilities usable and the authoritative draft unchanged.
18. Automated and manual validation proves tenant isolation, privacy, concurrency, atomicity, grounding boundaries, accessible staging, and the unchanged non-AI lifecycle.
