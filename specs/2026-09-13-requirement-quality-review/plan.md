# Slice 2.2: Requirement Quality and Ambiguity Review Implementation Plan

This plan breaks the approved Slice 2.2 behavior into numbered implementation groups. Each group must keep the repository coherent and verification close to the rule it proves. Any newly discovered product ambiguity returns to `requirements.md` for approval rather than becoming undocumented behavior.

## 1. Define contracts, limits, and provider-private projections

1. Add backend and frontend contracts for review generation, stable draft binding, lifecycle state, freshness, findings, clarification questions, patch operations, working suggestions, final patches, permissions, expiry, safe errors, list summaries, and applied provenance.
2. Encode the 256-KiB canonical UTF-8 input limit, 512-KiB provider-response limit, 200-item output bounds, two-minute generation lease, 30-second provider deadline, and 24-hour review expiry as server-owned constants.
3. Define explicit provider-only projections before connecting persistence or routes; keep all AI review fields out of client-safe project and requirement serializers.
4. Reuse Slice 1.2 field validation, draft limits, logical requirement identities, optimistic revision conventions, and safe error envelope.
5. Specify deterministic canonical serialization and byte measurement so equivalent draft data produces the same provider payload and oversized drafts are rejected locally.

## 2. Extend the provider-neutral AI requirement boundary

1. Add a provider-neutral quality-review operation accepting only bounded canonical draft content and returning the structured three-part review contract.
2. Add a fixed, versioned Gemini prompt and structured-output schema for the four approved finding categories and permitted patch operations.
3. Require every finding, suggestion, and question reference to resolve to stable logical requirement IDs supplied in the input; reject title-, group-, or position-based targeting.
4. Encode the advisory and grounding rules: identify issues, avoid unsupported facts, emit clarification questions for missing information, and never propose structural or identity changes.
5. Validate keys, references, operation shapes, expected values, text and array limits, response size, unknown fields, and semantic consistency before persistence.
6. Map disabled configuration, timeout, quota, transport, malformed, oversized, and semantic failures to the established provider-neutral recoverable errors with sanitized logging and no automatic retry.

## 3. Add review persistence, state, freshness, and provenance

1. Model the bound project/draft/revision, immutable canonical input, immutable original output, editable working suggestions, review revision, lifecycle state, expiry, generation lease, actors, prompt/provider metadata, final selected patches, and application timestamp.
2. Enforce `generating`, `pending-review`, `applied`, `discarded`, and `expired` transitions and the separate permanent `fresh`/`stale` applicability calculation.
3. Create an atomic active-review reservation keyed to the current project draft and revision so concurrent requests cannot create competing fresh active reviews.
4. Ensure stale reviews do not block new generation for the current revision, while existing fresh `generating` or `pending-review` records do.
5. Release failed generation reservations and make abandoned reservations stop blocking after the two-minute lease.
6. Preserve original output independently from working edits and snapshot final selected patches during Apply.
7. Purge eligible expired/discarded temporary data while retaining immutable applied provenance through completion and archival.

## 4. Enforce authorization, isolation, and shared operational limits

1. Add versioned project-scoped routes to generate, list, retrieve, edit, discard, and apply reviews.
2. Recheck current project membership, assignment, draft-edit authority, editable-draft availability, and lifecycle permission on every action.
3. Return non-enumerating failures for clients and cross-workspace, cross-project, or otherwise inaccessible identifiers.
4. Generalize the Slice 2.1 in-flight guard and rolling limiter so structuring and quality review share one in-flight provider request and 10 admitted calls per user per rolling 60 minutes.
5. Count only validated and authorized calls admitted to the provider; count both successful and failed admitted calls.
6. Confirm no review data appears in client projections, project activity, email, client-visible history, pending actions, or exports.

## 5. Implement working edits and deterministic patch validation

1. Allow optimistic edits only to proposed patch values and selection state while the review is fresh, pending, and unexpired.
2. Prevent changes to immutable findings, questions, targets, expected values, operation kinds, and original output.
3. Resolve all targets through stable logical requirement IDs and validate expected complete field values against both the bound input and current draft.
4. Reject repeated IDs, multiple replacements of one field, replacement-plus-append conflicts, unsupported operations, structural changes, positional criterion references, and other contradictory or non-deterministic sets.
5. Order multiple valid append operations deterministically and validate their combined result.
6. Apply existing requirement field rules and complete-draft limits to the final proposed result before any mutation.

## 6. Implement atomic Apply and failure isolation

1. In one authoritative transaction, recheck current authority, lifecycle, editable draft, review state, expiry, freshness, exact draft identity, expected draft revision, expected review revision, selected patches, and resulting draft validity.
2. Apply all selected operations to their stable logical requirement targets without changing identities, groups, associations, order, or unrelated fields.
3. Commit the draft mutation, one normal draft-revision advance, immutable final patch snapshot, applied provenance, and `applied` transition together.
4. Make concurrent Apply attempts first-writer-wins and retries after success incapable of applying changes twice.
5. Guarantee complete rollback for stale state, invalid selection, conflicting patches, validation/limit failure, transaction failure, or authority loss.
6. Create no activity, email, submission, approval, pending client action, badge, or AI-specific requirement state.

## 7. Build the provider review experience

1. Add an optional manual quality-review entry point within the editable requirement-draft experience without blocking normal authoring.
2. Explain the provider disclosure, bounded data sent, advisory status, private visibility, shared rate limit, and possible oversize rejection before generation.
3. Present findings by category and stable requirement association, with clear cross-requirement references where relevant.
4. Separate editable/selectable suggestions from non-applyable clarification questions and immutable advisory explanations.
5. Show expected and proposed values, prevent target/operation edits, and support accessible selection and ignored states.
6. Require accessible confirmation for the complete selected batch and explain all-or-nothing application.
7. Handle generating, empty, pending, stale, expired, discarded, applied, denied, rate-limited, malformed, unavailable, and validation-conflict states with safe recovery guidance.
8. Refresh the normal draft after success and show applied content as ordinary provider-authored draft content without client-facing AI labels.
9. Provide authorized providers access to retained applied provenance without exposing it through client surfaces.

## 8. Validate and hand off

1. Implement the unit, API integration, frontend, and critical end-to-end checks in `validation.md` using deterministic fake-provider responses.
2. Prove stable-ID targeting, active-review concurrency, permanent staleness, current authorization, tenant isolation, privacy, strict output validation, deterministic patch validation, atomicity, and shared limiting.
3. Prove every provider and domain failure leaves the draft unchanged and manual Slice 1.2 behavior operational.
4. Run backend and frontend lint, type checking, automated tests, production builds, and relevant Playwright journeys.
5. Review implementation against the approved requirements, mission, technology stack, roadmap, and explicit exclusions.
6. Record commands, environment category, results, and safe artifact references in `validation.md`; never record draft text, model output, credentials, prompts, or sensitive diagnostics.
7. Do not mark Slice 2.2 complete in the roadmap until implementation and acceptance evidence satisfy the merge gate.
