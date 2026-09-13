# Slice 2.1: AI Requirement Structuring Implementation Plan

This plan describes future application implementation. Creating this specification does not authorize application code, dependency, configuration, or roadmap changes.

## 1. Establish contracts, limits, and server configuration

1. Add bounded backend contracts for source input, generated groups and requirements, warnings, working proposals, selections, proposal state, permissions, list summaries, provenance details, and safe AI error categories.
2. Reuse the existing requirement field limits and draft constraints; add the approved 20,000-character source, 10-group, 25-requirement, 50-warning, 1,000-character warning, 512-KiB provider-response, and 24-hour expiry limits.
3. Add server-only AI enablement, API credential, model identifier, 30-second timeout, and prompt-version configuration. Default the model to `gemini-2.5-flash` without exposing provider configuration to clients.
4. Define explicit provider-private and client-safe projections before persistence models are connected to routes.
5. Keep frontend API schemas consistent with the versioned REST contracts without introducing a shared package.

## 2. Implement the provider-neutral AI service and grounded prompt

1. Define a provider-neutral requirement-structuring interface that accepts only source text and bounded output capacity and returns a validated proposal or a safe failure category.
2. Implement the Gemini adapter with the configured model, fixed versioned system prompt, structured-output schema, request deadline, response-size guard, and no automatic retry.
3. Encode the approved grounding policy: organize only source-supported information, derive criteria only from explicit meaning, and emit warnings rather than unsupported commitments.
4. Treat the source as untrusted data and prevent it from changing instructions, requesting tools, or broadening context.
5. Validate JSON structure, all text/array bounds, proposal-local references, semantic completeness, and non-empty usable output before returning data to the domain service.
6. Map configuration, timeout, quota, rate, transport, malformed, oversized, and semantic failures to provider-neutral errors with sanitized operational logging.

## 3. Add proposal lifecycle, persistence, expiry, and private provenance

1. Model proposal identity, project/draft/base-revision binding, state, expiry, proposal revision, actors, raw source, immutable original output, mutable working copy, final selection, and provider/prompt metadata.
2. Enforce `pending`, `applied`, `discarded`, and `expired` transitions; permit staging mutations only while pending and unexpired.
3. Preserve raw source and original output independently from working edits. Snapshot the final selected content during Apply.
4. Make expiry authoritative from timestamps even before physical cleanup, and remove discarded/expired temporary content without adding project history.
5. Retain applied provenance with completed and archived projects while restricting it to currently authorized providers.
6. Add optimistic concurrency for working-proposal updates and idempotent terminal behavior for repeated Apply or discard requests.

## 4. Enforce authorization, tenant isolation, rate limits, and REST boundaries

1. Add versioned project-scoped endpoints to generate, retrieve, update, discard, apply, list, and inspect proposal runs.
2. Reuse current project membership and requirement-draft edit authorization for every action; never rely on permissions captured at generation.
3. Return non-enumerating failures for inaccessible, cross-workspace, cross-project, and client-role requests.
4. Enforce one provider-reaching generation in flight per user and 10 admitted calls per rolling 60 minutes using existing portfolio-scale infrastructure.
5. Count only validated, authorized calls admitted to the provider boundary; count both successful and failed admitted provider calls.
6. Keep private source/provenance out of client projections, shared activity, summaries, emails, and generic serializers through explicit response allowlists.
7. Expose only safe availability, state, expiry, permissions, conflicts, and recoverable failure guidance to the frontend.

## 5. Implement atomic append, identity allocation, and concurrency protection

1. At Apply, reload and verify current actor access, draft-edit authority, project lifecycle, proposal ownership/state/expiry, bound draft identity, proposal revision, and draft revision.
2. Revalidate the complete selected content and resulting total draft capacity before mutation.
3. Translate only selected proposal-local groups and requirements into fresh normal draft group and logical requirement identities.
4. Append new groups and requirements after existing content without merging same-named groups or mutating existing data.
5. Commit the draft update, advanced draft revision, immutable final selection, applied provenance, and one-shot state transition atomically.
6. Make concurrent and repeated Apply calls first-writer-wins and incapable of duplicate append or duplicate provenance.
7. Return stale conflicts without rebinding or changing the pending proposal; leave discard available until expiry.

## 6. Build provider staging, editing, warnings, confirmation, and provenance UI

1. Add an optional AI entry point inside the existing provider requirement-draft experience without gating or degrading manual authoring.
2. Build the source disclosure and input form with limits, availability, loading, rate-limit, timeout, and provider-failure states.
3. Present source, immutable warnings, editable generated groups/requirements, selection controls, regrouping, and keyboard-operable ordering in a clearly non-authoritative staging view; do not add proposal-level creation of new groups or requirements.
4. Preserve proposal optimistic concurrency, show expiry and stale states, and prevent terminal proposals from appearing editable.
5. Require an accessible confirmation before Apply that states selected items will be appended and existing content will not be changed.
6. On success, refresh the ordinary draft and display imported items as normal draft content without client-facing AI labels.
7. Add a provider-only applied-run list and detail view for retained source, original output, final selection, actors, and timestamps.
8. Verify responsive layouts, focus management, accessible validation, and recoverable errors across supported viewport sizes.

## 7. Validate, review, and hand off

1. Implement the unit, integration, frontend, and critical end-to-end checks in `validation.md`, using a deterministic fake provider for automated tests.
2. Prove tenant isolation, current authorization, private serialization, strict state transitions, stale binding, atomicity, idempotency, rate limiting, and every provider failure category.
3. Prove the fixed prompt/output contract does not create unsupported commitments and rejects invalid or oversized model responses.
4. Prove AI-disabled and AI-failing configurations leave the complete manual requirements lifecycle operational.
5. Run backend and frontend lint, type checking, automated tests, production builds, and the relevant Playwright suite.
6. Review the completed implementation against the approved requirements, explicit exclusions, mission, technology stack, and roadmap without marking Slice 2.1 complete until acceptance evidence exists.
7. Record commands, environment category, results, and safe artifact references in `validation.md`; never record credentials, raw source, provider output, or sensitive diagnostics.
