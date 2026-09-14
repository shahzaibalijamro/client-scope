# Slice 3.1: Project Record Export Implementation Plan

Implement only after this approved specification has been reviewed against the mission, technology-stack constitution, and roadmap. Keep export generation request-scoped and do not add application behavior beyond `requirements.md`.

## 1. Export contracts and safe projections

1. Define the export projection, manifest schema version, bounded omission reasons, archive layout, filename normalization, and 250 MiB accounting rules in explicit backend contracts.
2. Build role-neutral serializers for project summary, current roster, scope history, change control, milestones, deliverables, completion rounds, and safe activity using existing domain-specific projections rather than generic document serialization.
3. Add deterministic record, attachment-priority, ZIP-path, collision, and timestamp ordering helpers with unit tests.
4. Prove through fixtures that provider-private, AI-working, account, invitation, storage, cleanup, credential, URL, and diagnostic fields cannot enter an export contract.

## 2. Authorization and point-in-time capture

1. Add the protected project-scoped export route behind the existing authenticated, verified session and same-origin API boundary.
2. Reuse current workspace/project membership resolution so all four current roles may request the exact same projection and all unrelated or removed actors receive safe denial.
3. Capture a consistent in-memory shared-record projection with `generatedAt`, `dataCutoff`, and lifecycle state without holding a database transaction during file retrieval or response streaming.
4. Recheck exact current membership immediately before response headers begin and abort without sending archive bytes when authority was revoked.
5. Add integration tests for every role, lifecycle state, cross-tenant access, removal races, snapshot cutoff, and absence of mutations, activity, email, and persisted export artifacts.

## 3. PDF and manifest generation

1. Generate a readable English PDF with project summary, informational disclaimer, current roster, every required shared workflow section, deterministic history, attachment inventory, and data-cutoff metadata.
2. Render all user-authored content as inert text, normalize unsafe characters, and represent external links without fetching them.
3. Generate the versioned JSON manifest with one entry per logical submitted-version attachment reference and only the approved safe metadata, paths, statuses, and omission categories.
4. Make incomplete attachment state visible in the PDF and manifest while keeping missing file content non-fatal.
5. Add contract and snapshot tests for complete, empty, active, final-review, completed, archived, historical, Unicode, long-content, and malicious-content fixtures.

## 4. Private file retrieval and streamed ZIP assembly

1. Extend the existing private-storage boundary with server-side read streaming suitable for an exact submitted attachment reference; do not expose provider identifiers or signed URLs.
2. Evaluate logical attachment references by the approved newest-version rounds and attachment order, include only complete files that fit, and continue after a size omission so later smaller files may qualify.
3. Enforce trusted-size and actual-byte accounting, the 262,144,000-byte bundled-file cap, deterministic safe paths, collision handling, and no truncation.
4. Map missing, denied, unavailable, mismatched, and over-cap files to bounded omission categories; keep raw provider failures in safe operational diagnostics only.
5. Stream the ZIP without a persistent local filesystem, stop work on disconnect, release resources on every terminal path, and ensure mandatory PDF/manifest or archive failures cannot be reported as a successful download.
6. Test duplicate physical assets referenced by multiple versions, provider timeouts, mid-stream failure, disconnect cleanup, oversized metadata, byte mismatch, path traversal, filename collisions, cap boundaries, and deterministic archive output.

## 5. Frontend export experience

1. Add an **Export project record** action to the shared project view for active, completion-review, completed, and archived projects and every current role.
2. Use the existing same-origin authenticated API boundary, consume the server filename safely, and initiate a single ZIP download without caching a reusable private URL.
3. Present accessible preparation, download, cancellation, lost-access, retryable failure, and incomplete-export messaging without implying that export mutates or locks the project.
4. Prevent accidental duplicate requests while one request is active and restore usable state after completion or failure.
5. Add React Testing Library coverage for visibility, keyboard operation, busy state, duplicate prevention, filename handling, safe errors, and every lifecycle collection.

## 6. End-to-end verification and handoff

1. Add focused Playwright coverage for an authorized shared export, cross-project denial, and an incomplete archive while keeping the suite deliberately small.
2. Run the complete validation plan across backend rules and integration tests, frontend tests, type checks, linting, production builds, and critical browser journeys.
3. Inspect representative ZIPs, PDFs, manifests, attachment paths, response headers, byte totals, timestamps, Unicode handling, and omission reporting in an approved test environment.
4. Review the implementation diff against the approved requirements, mission, technology stack, roadmap, and exclusions; resolve ambiguity through a spec amendment rather than implementation policy.
5. Record safe validation evidence and update Slice 3.1 roadmap status only after every acceptance criterion and merge gate is satisfied.

