# Slice 2.3: Client Feedback Summarization Implementation Plan

This plan describes future application implementation. Creating this specification does not authorize application code, dependency, configuration, or roadmap-status changes.

## 1. Establish source eligibility and stable feedback identity

1. Define a canonical eligible-feedback projection for client-authored submitted-version comments and formal client-approver revision-request notes.
2. Preserve or derive immutable role-at-authorship context and stable source-record and submitted-version identities without changing historical feedback semantics.
3. Build deterministic ordering and fingerprinting from the exact eligible record set and immutable summarization-relevant fields.
4. Enforce distinct-record counting and the minimum of two eligible records, including two records from one version.
5. Exclude every provider-authored, approval, withdrawal, revision-summary, attachment, link, and unrelated project field before the provider boundary.

## 2. Define contracts and provider-neutral summarization

1. Add bounded contracts for themes, requested actions, tensions or unclear points, stable source citations, run provenance, freshness, permissions, and safe failures.
2. Extend the provider-neutral AI service with a feedback-summarization operation backed by the configured Gemini adapter and a fixed versioned prompt/schema.
3. Treat feedback as untrusted data and require source-grounded output without tools, URL retrieval, external context, sentiment analysis, or invented resolutions.
4. Validate response size, text and collection bounds, exact source membership, submitted-version bindings, and semantic completeness before persistence.
5. Map disabled configuration, timeout, quota, transport, malformed output, and other provider failures to existing safe provider-neutral errors with no automatic retry.

## 3. Persist the latest run and freshness provenance

1. Model one latest successful provider-private run per deliverable with its source fingerprint and references, actor, timestamp, prompt/schema version, provider/model metadata, and structured result.
2. Compute current/outdated status by comparing the saved fingerprint with a freshly derived current eligible-source fingerprint.
3. Keep outdated content readable with an explicit label and never regenerate it automatically.
4. Replace the prior saved run atomically only after the new provider output and provenance are fully validated and persisted.
5. Make concurrent regenerations first-writer-safe and ensure a failed or losing replacement preserves one complete valid run.
6. Retain the latest run with completed and archived projects under existing retention behavior without creating project activity or a run-history collection.

## 4. Enforce REST authorization, lifecycle, privacy, and shared limits

1. Add project- and deliverable-scoped provider endpoints for reading the latest result and explicitly generating or regenerating it.
2. Recheck current Workspace Owner or assigned active Service-Team Member access on every request and use non-enumerating denial behavior.
3. Reject generation before provider access for completed or archived projects, inaccessible deliverables, and fewer than two eligible records.
4. Permit authorized reads of retained results after completion or archival while normal project-read access remains valid.
5. Reuse the shared Phase 2 rolling allowance and one-in-flight provider rule across all AI features; do not add a Slice 2.3 pool.
6. Use explicit provider-only serializers and prove client and generic project responses reveal no existence, content, freshness, citations, fingerprint, or AI provenance.

## 5. Build the provider-only advisory UI

1. Add an optional feedback-summary entry point within the provider deliverable experience without affecting manual review controls.
2. Show eligibility, explicit generation/regeneration controls, loading, safe failure, rate-limit, insufficient-feedback, and lifecycle-locked states.
3. Present themes, requested actions, and tensions or unclear points with accessible references to their exact submitted versions and source feedback records.
4. Label the result as AI-generated, advisory, provider-private, and subordinate to original feedback.
5. Display generation time and deterministic current/outdated status; retain outdated content until an explicit successful regeneration.
6. Omit all summary UI and existence signals for clients and unauthorized providers.
7. Verify responsive layouts, keyboard operation, focus management, screen-reader labeling, and live announcements.

## 6. Validate and hand off

1. Implement the focused rule, API, serialization, provider-boundary, persistence, frontend, and critical end-to-end checks defined in `validation.md` using a deterministic fake provider.
2. Prove exact source eligibility, grounding, uncertainty preservation, fingerprint stability, atomic latest-run replacement, lifecycle restrictions, shared limiting, and current authorization.
3. Prove all local and provider failures leave feedback and every authoritative workflow record unchanged.
4. Run backend and frontend linting, type checking, tests, production builds, relevant Playwright journeys, and the current repository delivery gate.
5. Review the implementation against the mission, technology stack, roadmap, approved requirements, and explicit exclusions.
6. Record real evidence in `validation.md` after implementation; do not mark Slice 2.3 complete in the roadmap until the implemented slice passes validation and receives separate acceptance.
