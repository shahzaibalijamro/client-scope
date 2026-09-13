# Slice 2.3: Client Feedback Summarization Requirements

**Status:** Approved — 2026-09-13

## Outcome

An authorized provider can explicitly ask ClientScope to summarize eligible client feedback for one deliverable across all of its submitted versions. The provider receives a structured, source-grounded advisory view of themes, concrete requested actions, and tensions or unclear points while every original comment and formal revision-request note remains the sole authoritative source of truth.

The summary is provider-private and read-only. It cannot replace, rewrite, resolve, or mutate feedback; create a revision draft; change workflow state; or produce client-visible history. ClientScope retains only the latest successful run for the deliverable and identifies deterministically when that result no longer reflects the current eligible source set.

## Scope

### Included

- On-demand summarization of one deliverable across all submitted versions, including historical versions that were later changed, withdrawn, or superseded.
- Eligible immutable feedback records:
  - comments authored on a submitted deliverable version by a person whose role at authorship was an active Client Participant or Client Approver; and
  - formal revision-request notes made by an authorized Client Approver for a submitted version.
- A minimum of two eligible feedback records. Both records may belong to the same submitted version.
- Structured themes, concrete requested actions, and tensions or unclear points, each grounded to the exact stable feedback-record identities and submitted-version identities that support it.
- Provider-only generation, regeneration, reading, freshness status, and provenance.
- Persistence of only the latest successful run per deliverable, including its exact source-set identity or fingerprint, source references, actor, generation time, prompt/schema version, provider/model metadata, and structured result.
- Deterministic outdatedness when the current eligible source set differs from the source set used by the saved run.
- Recoverable behavior when AI is disabled, unavailable, timed out, rate-limited, or returns malformed output, and when feedback is insufficient or authorization changes.

### Excluded

- Provider-authored comments or discussion, approval notes, withdrawal reasons, provider revision summaries, and unrelated project data.
- Cross-deliverable or project-wide summarization, sentiment analysis, project-wide retrieval, external sources, attachments, links, or file contents.
- Automatic generation or regeneration, scheduled summaries, automatic revision drafting, feedback resolution, comment mutation, or application of results to authoritative data.
- Client access to summary content, existence, availability, freshness, provenance, model metadata, source fingerprints, or AI-specific indicators.
- Project activity, transactional email, notifications, workflow transitions, requirements, milestones, tasks, drafts, or any other authoritative or client-visible record arising from a summary.
- New infrastructure, queues, workers, embeddings, vector search, or an independent Slice 2.3 rate-limit pool.

## Decisions and Business Rules

### 1. Authority and source-of-truth boundary

1. Original eligible feedback records are the sole source of truth. The AI result is a provider-only advisory projection.
2. A summary never changes the meaning, state, authorship, ordering, visibility, or retention of a source record.
3. A summary cannot assert that feedback is resolved, accepted, rejected, prioritized, or incorporated unless an eligible source explicitly states that fact.
4. Provider actions on a summary are limited to reading it and explicitly requesting a replacement run.

### 2. Eligible source set

1. Eligibility is evaluated from immutable authorship context captured at the time the record was created, not merely the author's current role.
2. Each eligible record must retain or expose a stable record identity, submitted deliverable-version identity, record kind, immutable text, author identity and role-at-authorship, and creation timestamp sufficient for deterministic selection and grounding.
3. Historical eligible feedback remains eligible when its version later reaches `changes-requested`, is withdrawn, or is superseded by another submitted version.
4. Current role changes do not retroactively add provider-authored records or remove feedback that was eligible at authorship.
5. The same source record is counted once. At least two distinct eligible record identities are required, regardless of how many submitted versions contain them.
6. The provider boundary receives only the minimum eligible source fields required to summarize and ground the output. Membership lists, client profiles, attachments, links, deliverable files, requirements, milestones, activity, and unrelated project context are not sent.

### 3. Grounded structured result

1. The result has three bounded collections: themes, concrete requested actions, and tensions or unclear points.
2. Every result item cites one or more exact eligible source-record identities and their submitted-version identities. Free-text version labels or positional references alone are insufficient.
3. Every cited record must belong to the exact source set supplied for the run; unknown, duplicate-only, or cross-deliverable references make the provider output invalid.
4. Themes group repeated or closely related source-supported feedback without introducing facts or commitments.
5. Concrete requested actions state only actions directly supported by the cited feedback.
6. Conflicts, incompatible statements, ambiguity, missing detail, and uncertainty are preserved under tensions or unclear points rather than converted into a confident action or invented resolution.
7. Empty sections are allowed when the sources do not support that category, but the overall output must contain at least one valid grounded item.

### 4. Latest run and deterministic freshness

1. At generation, ClientScope derives a deterministic identity or fingerprint from the exact ordered eligible source set and its immutable summarization-relevant fields.
2. The saved run persists that fingerprint and explicit source references. Fingerprinting must be stable for an unchanged source set and must not depend on mutable display labels or incidental database serialization order.
3. A saved run is current exactly when its stored fingerprint equals the fingerprint of the current eligible source set. It is outdated otherwise.
4. Adding, removing, or changing an eligible source record changes the source-set fingerprint. Provider edits, unrelated project changes, and workflow events that do not alter eligible feedback do not.
5. An outdated result remains readable to an authorized provider and is clearly labeled with its generation time and outdated status.
6. ClientScope never silently regenerates. Only an explicit, authorized regeneration may replace the latest saved run.
7. A failed regeneration leaves the previous successful run and its current/outdated status intact.
8. Replacing the saved run does not create project activity or a client-visible history sequence. No earlier run is retained as a normal product resource.

### 5. Lifecycle and state

1. Generation is available only while the project is in a normal mutable pre-completion lifecycle state and the deliverable has at least two eligible records.
2. New generation and regeneration are prohibited once the project is completed or archived.
3. A previously generated summary remains readable after completion or archival when the requesting provider retains normal read access to that project.
4. Deliverable outcomes such as approval, cancellation, withdrawal, revision requested, or supersession do not by themselves erase a retained summary or make eligible historical feedback ineligible.
5. Summary generation and replacement do not alter project, deliverable, version, review, completion, or archival state.

## Roles and Permissions

- A current Workspace Owner with access to the workspace may generate, regenerate, and read summaries for its projects, subject to lifecycle and source-count rules.
- A current active Service-Team Member may generate, regenerate, and read a summary only for an explicitly assigned project, subject to the same rules.
- Authorization and active membership are rechecked for every generation, regeneration, and read; authority captured by a prior run is never sufficient.
- Client Participants, Client Approvers, inactive members, unassigned team members, and cross-workspace users cannot discover or access summary endpoints or fields.
- Client-facing and generic project projections must omit summary existence, permissions, content, freshness, provenance, source references, fingerprints, prompt/schema versions, and provider/model metadata.
- Inaccessible resources use the existing non-enumerating authorization behavior.

## Validation and Failure Behavior

1. A generation request identifies one project and one deliverable and contains no caller-supplied feedback text, source identities, model choice, prompt, or project context.
2. The server validates authentication, current authorization, project lifecycle, deliverable ownership, and the current eligible source count before reaching the AI provider.
3. Slice 2.3 reuses the Phase 2 provider-neutral AI boundary, configured Gemini adapter, one-provider-request-in-flight rule, and shared allowance of 10 provider-reaching AI requests per global user per rolling hour. It has no independent pool.
4. Invalid, unauthorized, lifecycle-blocked, and insufficient-source requests do not consume provider-reaching allowance. Every admitted provider call counts according to the shared Phase 2 rule whether it succeeds or fails.
5. Provider output is accepted only after strict structural, size, text-bound, source-reference, and grounding validation. Malformed, oversized, empty, ungrounded, or semantically invalid output is rejected.
6. Disabled configuration, timeout, quota or rate failure, transport failure, malformed output, persistence failure, insufficient feedback, stale concurrency, or authorization loss produces a safe provider-neutral error with actionable retry guidance where appropriate.
7. No automatic provider retry occurs. A late response is discarded after the configured deadline.
8. A failure never changes comments, decision records, deliverables, versions, revision drafts, requirements, milestones, activity, pending actions, completion, archival, notifications, email, or any other authoritative state.
9. Replacement of the latest run is atomic and concurrency-safe. A reader sees either the prior complete run or the new complete run, never a partial result.
10. Operational logs may contain safe correlation, timing, and outcome metadata but never feedback text, summary content, source fingerprints, prompts, full provider responses, credentials, or sensitive diagnostics.

## Acceptance Criteria

1. An authorized provider can generate a structured summary for one deliverable containing at least two eligible records across one or more submitted versions.
2. Eligibility includes only qualifying client-authored comments and formal revision-request notes and preserves qualifying historical feedback from changed, withdrawn, or superseded versions.
3. Every theme, action, and tension points to exact eligible feedback-record and submitted-version identities from that run.
4. Conflicting, ambiguous, incomplete, or incompatible feedback is presented as tension or uncertainty rather than a confident synthesized action.
5. Generation and reading expose no summary data or existence signal to either client role or unauthorized provider users.
6. The latest successful run is saved with the approved provider-private provenance and replaces the prior run only after a complete successful regeneration.
7. Freshness is derived solely from comparison of deterministic eligible-source fingerprints; unrelated edits and workflow events do not mark a result outdated.
8. An outdated summary remains readable and clearly labeled until explicit successful regeneration.
9. Projects with fewer than two eligible records reject generation before provider access; two records on one submitted version are accepted.
10. Completed or archived projects allow authorized reading of an existing result but reject generation and regeneration.
11. Generation uses the shared Phase 2 per-user provider-reaching allowance and concurrency rule without creating a separate rate-limit pool.
12. AI disablement and every provider, validation, persistence, concurrency, or authorization failure are recoverable and leave all authoritative application state untouched.
13. No summary action creates drafts, tasks, activity, email, notifications, workflow changes, client-visible badges, or other authoritative records.
14. Existing manual deliverable feedback, revision, approval, completion, and archival workflows remain fully usable without Gemini.
