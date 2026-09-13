# Slice 3.1: Project Record Export Validation

## Highest-risk behavior

The strongest evidence is required for:

1. Cross-workspace, cross-project, removed-member, or stale-authority access exposing a private record or attachment.
2. Provider-private drafts, AI-working data, account data, invitation data, provider identifiers, signed URLs, secrets, raw diagnostics, or unsafe generic activity context leaking through any archive surface.
3. A mixed-time export combining records committed on different sides of the declared cutoff or changing while the ZIP is assembled.
4. Archive paths enabling traversal, absolute-path extraction, collisions, control-character confusion, or execution of user-authored content.
5. Attachment accounting exceeding 250 MiB, truncating files, prioritizing versions incorrectly, or silently omitting content.
6. Missing or failed private-storage reads corrupting the whole export, leaking provider errors, or being falsely reported as complete.
7. Fatal PDF, manifest, projection, or ZIP failures being delivered as a successful or apparently valid archive.
8. Export generation mutating project state, creating history, sending email, retaining artifacts, or relying on persistent local storage.

## Automated checks

### Domain and contract tests

- Stable manifest schema version, required safe fields, bounded omission enum, and strict rejection or removal of unknown fields.
- Deterministic section ordering, attachment round ordering, ZIP layout, sanitized project filename, entry normalization, reserved-name handling, and collision suffixes.
- Latest submitted version of every deliverable is considered before earlier rounds; version attachments retain manual order with stable tie-breakers.
- Exact cap behavior at 0, one byte below, exactly 262,144,000 bytes, and one byte above; mandatory PDF/manifest bytes do not count.
- A file is either wholly included or omitted; an omitted large file does not prevent a later smaller file from using remaining capacity.
- Duplicate logical references create their required logical entries and each counts toward the cap, while provider retrieval may be reused safely.
- Safe mapping of `size_limit`, `not_found`, `storage_unavailable`, `access_denied`, and `integrity_failure`; unknown provider failures map to `storage_unavailable`.
- `complete` is true only when every eligible logical attachment reference is included.
- Malicious plain text, HTML/script strings, bidirectional/control characters, traversal filenames, absolute paths, Unicode, duplicate names, and extreme allowed-length content remain inert and safely represented.

### Backend integration tests

- Workspace Owner, assigned Service-Team Member, Client Participant, and Client Approver each receive equivalent shared content for the same fixture and cutoff.
- Each role exports projects in `active`, `completion-in-review`, `completed`, and `archived` states.
- Unauthenticated, unverified, other-workspace, unassigned, removed, malformed-ID, and cross-project attachment requests receive established safe denial without existence disclosure.
- A controlled revocation between projection capture and header commit returns no archive bytes.
- Concurrent domain mutation after capture does not enter the export, alter its cutoff, or produce internally inconsistent versions.
- Current roster contains only current display names and roles; former members appear only in preserved historical actor snapshots.
- The PDF includes every required shared domain section and safe complete activity history, including empty-section treatment.
- Provider-private drafts and attachments, AI source/output/working/provenance data, emails, invitations, session/account fields, storage identifiers, URLs, cleanup state, and raw activity context are absent from PDF text, manifest JSON, ZIP paths and metadata, headers, errors, and captured logs.
- External HTTPS links are represented but never fetched.
- All submitted-version references are inventoried; no unsubmitted or draft attachment is retrieved or packaged.
- Private-storage success yields byte-exact files at deterministic paths. Missing, denied, unavailable, timeout, and size-mismatch cases yield the correct omission without preventing other eligible files.
- Actual included bytes never exceed the cap and never differ from verified metadata.
- Mandatory projection, PDF, manifest, or archive setup failure returns a safe non-success response before streaming.
- Mid-stream provider or transport failure terminates safely and is not recorded as a successful complete response.
- Client disconnect aborts outstanding storage reads and releases streams and temporary resources.
- Response content type, content disposition, anti-sniffing, cache/privacy headers, and same-origin authentication behavior are correct.
- No export request changes project/domain collections, writes an export record, creates activity or notification, or invokes email.

### Frontend tests

- The export action is visible and enabled for all four authorized roles across active, final-review, completed, and archived views.
- It is absent or inaccessible without current project authority.
- Keyboard activation, visible focus, accessible naming, busy announcement, duplicate-request prevention, success reset, retry, and safe failure states work.
- The browser uses the same-origin API path, handles the ZIP body without exposing a reusable private URL, honors the safe server filename, and revokes any temporary browser object URL.
- Lost-access and generation errors are actionable and contain no private identifiers or diagnostics.
- Incomplete-export messaging directs the user to the PDF and manifest without claiming that ClientScope lost authoritative project records.

### End-to-end and repository checks

- One authorized journey downloads and opens a complete ZIP with readable PDF, valid JSON manifest, and byte-matching attachment.
- One cross-project journey proves safe denial.
- One incomplete journey proves a successful PDF/manifest export with size-limit and storage-failure omissions.
- Existing critical lifecycle, deliverable, scope, change-control, milestone, authentication, authorization, and AI tests remain passing.
- Backend and frontend lint, type checks, tests, production builds, Docker builds, backend-container smoke test, and the established CI gate pass.

## Manual checks

1. Export realistic active, completion-review, completed, and archived demo projects as each role and compare their shared content.
2. Open representative ZIPs with current Windows, macOS, and Linux archive tools; confirm safe extraction, readable Unicode paths, no traversal, and deterministic organization.
3. Inspect the PDF on desktop and mobile viewers for headings, page breaks, tables, long text, URLs, repeated headers, attachment inventory, timestamps, disclaimer, and incomplete warnings.
4. Confirm the PDF is keyboard navigable where the viewer supports it, text is selectable, reading order is sensible, contrast is sufficient, and meaning does not depend on color.
5. Verify the export action at narrow and desktop widths in current Chrome, Edge, Firefox, and Safari, including focus visibility, progress, cancellation, error recovery, and repeat download.
6. Simulate slow storage, one missing file, provider unavailability, a cap overflow, membership revocation, browser cancellation, and a dropped connection; confirm safe messages and resource cleanup.
7. Inspect server diagnostics to ensure they remain useful but contain no record content, attachment bytes, credentials, provider URLs, or raw provider failures.
8. Verify no generated archive remains on application disk or in external storage and no activity or email is produced.

## Evidence

Record:

- Commit SHA, environment category, Node/npm versions, database category, and storage-adapter category.
- Exact commands and pass/fail results for focused tests and the complete repository gate.
- Safe fixture descriptions and aggregate counts for roles, lifecycle states, versions, attachments, included bytes, and omission categories.
- SHA-256 hashes of test artifacts only when useful for proving byte stability; do not treat them as a product certification feature.
- Redacted screenshots of the UI states, PDF pages, manifest shape, and ZIP tree without real client data, credentials, signed URLs, or provider identifiers.
- Any approved exception with owner, rationale, affected acceptance criterion, and follow-up condition.

Never commit generated archives containing real or sensitive project data.

## Merge gate

Slice 3.1 is safe to merge only when:

1. Every acceptance criterion in `requirements.md` has recorded evidence or an explicit approved exception.
2. All role and lifecycle combinations pass, and tenant/project isolation plus the pre-stream revocation race are proven at the API boundary.
3. Projection and leak tests prove one uniform shared record and the complete exclusion list across PDF, manifest, ZIP metadata, headers, errors, and logs.
4. Snapshot cutoff, historical actor/version accuracy, deterministic ordering, safe paths, and archive validity pass.
5. The 250 MiB cap, no-truncation rule, newest-version priority, duplicate references, missing storage, integrity mismatch, and partial-attachment behavior pass.
6. Fatal generation and transport failures fail safely, and disconnect cleanup is demonstrated.
7. No domain write, export persistence, activity, notification, email, public asset, or new infrastructure was introduced.
8. Frontend accessibility, responsive behavior, supported-browser download behavior, and manual PDF/ZIP inspection pass.
9. Existing regressions and the complete repository CI gate pass.
10. The implementation diff matches this approved specification and all three constitution files, and the roadmap status remains unchanged until acceptance validation is complete.

