# Slice 3.1: Project Record Export Requirements

**Status:** Approved — 2026-09-14

## Outcome

Every currently authorized project member can download a complete, point-in-time copy of the project's shared record at any lifecycle stage. The download is an on-demand ZIP containing a human-readable PDF, a machine-readable attachment manifest, and the eligible attachment files that can be safely included within the archive limit.

The export is a portable convenience copy of ClientScope's shared record. It is not a certified record, legal evidence, an electronic signature, or a compliance-grade archive. ClientScope remains the source of truth.

## Scope

### Included

- Export from projects in `active`, `completion-in-review`, `completed`, and `archived` states.
- One role-neutral shared-record projection for Workspace Owners, assigned Service-Team Members, Client Participants, and Client Approvers.
- Project summary, lifecycle state, current project-member display names and roles, requirement scope and decision history, change requests, milestones, deliverables and submitted versions, shared comments and feedback, completion decisions, and project activity history.
- A ZIP containing a PDF record, a JSON attachment manifest, and eligible files referenced by submitted deliverable versions.
- Point-in-time record capture, deterministic ordering and paths, a 250 MiB bundled-file limit, safe omissions, and explicit incomplete-export warnings.
- Backend authorization and tenant isolation, safe dependency failures, accessible frontend behavior, and automated verification.

### Excluded

- Provider-private requirement drafts, change-request drafts, deliverable drafts, draft attachments, private provider notes, or other provider-only workflow state.
- AI source material, provider prompts or responses, working proposals or reviews, findings, warnings, private run history, provenance, fingerprints, rate-limit state, or operational metadata.
- Email addresses, invitation records, session/account data, credentials, secrets, storage-provider identifiers, permanent or signed delivery URLs, cleanup state, and raw diagnostics.
- Fetching or copying content from external deliverable links. Shared HTTPS links appear only as references in the PDF.
- Persisted export jobs, saved generated archives, export history, email notifications, background workers, queues, Redis, or new infrastructure.
- Export-specific project activity entries or changes to authoritative project data.
- Password protection, signatures, certificates, notarization, cryptographic evidence, compliance claims, or legal-retention guarantees.
- Selective sections, date filters, role-specific export variants, JSON export of the complete project domain, or importing an export back into ClientScope.

## Governing principles

1. The mission and technology-stack constitutions and roadmap governance control this feature.
2. The export contains only information already shared with every current project role. Being a provider does not produce a richer archive.
3. Current backend membership is the security boundary. Frontend visibility, possession of an identifier, prior membership, or a prior export does not grant access.
4. Historical approved and submitted records are represented without rewriting their content or actor snapshots.
5. Export generation is read-only and must not alter project state, create activity, send email, or persist a generated artifact.
6. Missing attachment content may make an export incomplete, but must not make the shared textual record unavailable.
7. Archive completeness never takes priority over tenant isolation, privacy, bounded resource use, or safe failure.

## Export model and states

An export request has transient processing states only: `preparing`, `downloading`, `complete`, or `failed`. These states exist in the requesting browser/request lifecycle and are not project-domain records.

1. An authenticated, verified current project member requests an export.
2. The backend authorizes the project context and captures one immutable in-memory export projection with a UTC `generatedAt` value, a UTC `dataCutoff` value, and the lifecycle state observed at that cutoff.
3. All database-backed PDF and manifest content comes from that captured projection. Records committed after `dataCutoff` do not appear, even if archive streaming is still underway.
4. The backend determines eligible attachment order and attempts private retrieval without exposing storage credentials or URLs.
5. Immediately before response headers begin, the backend rechecks current project membership. Revocation, project unassignment, or loss of workspace authority aborts delivery with no archive bytes sent.
6. The backend streams one ZIP response. The generated archive is not retained after the request ends.
7. Browser cancellation or connection loss stops unnecessary retrieval and generation work where supported; it creates no domain record.

Concurrent project mutations do not corrupt or partly update the captured record. The implementation may use a database snapshot, bounded read transaction, or equivalent consistent projection, but it must not hold a database transaction open while retrieving external files or streaming the ZIP.

## Shared record content

### Header and project summary

The PDF identifies ClientScope, the project and workspace by their shared display names, the client display name where shared, the lifecycle state at cutoff, `generatedAt`, and `dataCutoff`. It states that the file is an informational point-in-time snapshot and is not certified, legally authoritative, or compliance-grade.

### Identities

- The current roster includes each current project member's display name and effective project role.
- Historical decisions, comments, submissions, transitions, and activity use the immutable actor display-name and role snapshots already preserved by their source records.
- Email addresses, invitation details, global account identifiers, membership history, and private role-administration metadata are never exported.
- Former members may appear only through historically preserved shared actor snapshots, not in the current roster.

### Requirements and change control

The PDF includes the current scope state, submitted and agreed requirement versions, their groups and requirements, review outcomes, shared comments, decision actors and times, and comparisons or change effects already exposed in the shared workflow. It includes submitted change-request proposals, shared discussion, outcomes, and the resulting agreed-scope relationships. Mutable provider-only drafts and AI-derived private data are excluded.

### Milestones

The PDF includes current and archived client-facing milestones, their shared descriptions, dates, order, statuses, and preserved transition history. It does not infer or introduce tasks, assignees, backlogs, or internal execution data.

### Deliverables and feedback

The PDF includes every submitted deliverable version and its immutable shared metadata, notes, revision summary, external-link references, attachment metadata, comments, review outcome, actors, times, and approved-scope provenance. Provider-only drafts, upload state, storage metadata, and unsubmitted files are excluded.

### Completion and activity

The PDF includes all completion-review rounds, shared reasons and decisions, archival state and shared archival history, and the complete safe project-audience activity timeline through `dataCutoff`. Activity uses the existing event-specific safe projections; generic stored context must not be serialized into the export.

### Ordering

Sections use stable domain order. Versioned records use their project-visible numbers and chronological tie-breakers; comments and activity retain their established deterministic chronology. Empty sections are shown as having no shared records rather than silently disappearing.

## ZIP contract

The response is a downloadable ZIP with a sanitized, deterministic filename based on the project display name and UTC generation timestamp. The ZIP uses UTF-8-safe entry names and contains this stable top-level layout:

```text
project-record.pdf
manifest.json
attachments/
  deliverable-<number>/
    version-<number>/
      <attachment-order>-<safe-filename>
```

Archive entry names must prevent absolute paths, parent traversal, control characters, reserved platform names, ambiguous separators, and collisions. Collision suffixes are deterministic. Original filenames remain visible in the PDF and manifest even when the packaged filename must be further normalized.

The PDF and manifest are mandatory. The `attachments/` tree may be empty. ZIP creation, PDF creation, or mandatory-entry serialization failure is fatal and returns a safe error without intentionally delivering a partial archive.

## Attachment eligibility, order, and size

1. Only finalized attachment references belonging to submitted deliverable versions in the captured projection are eligible.
2. A physical asset referenced by more than one submitted version is represented at every applicable version path so the archive layout matches the historical record. Implementations may avoid repeated provider retrieval internally but must preserve the logical entries.
3. The bundled-file limit is **250 MiB (262,144,000 bytes)**. The mandatory PDF and manifest do not count toward this limit.
4. An attachment is included only if its complete verified byte size fits within the remaining limit. File contents are never truncated.
5. Priority proceeds in rounds: the latest submitted version of each deliverable first in ascending deliverable-number order, then each deliverable's next-earlier version in the same order until history is exhausted. Attachments within a version use their immutable manual order and stable identifier as a tie-breaker.
6. Duplicate logical references each count toward the bundled-file limit because each creates an archive entry.
7. A file omitted because it does not fit does not consume capacity; evaluation continues so a later smaller eligible file may fit.
8. Metadata declaring a single file larger than the total cap causes that reference to be omitted as `size_limit` without retrieval.
9. Actual streamed bytes must match trusted verified metadata. A size mismatch omits the file as `integrity_failure`; it must never allow the archive to exceed the cap.

## Manifest contract

`manifest.json` is always present, uses UTF-8 JSON, and has an explicit schema version. It contains:

- Safe export metadata: schema version, shared project identifier, shared project name, `generatedAt`, `dataCutoff`, lifecycle state, bundled-file cap, included-file byte total, and overall `complete` boolean.
- One entry per eligible logical attachment reference with its safe attachment identifier, deliverable number and title, version number, immutable attachment order, original safe filename, verified media type and byte size, inclusion status, and packaged path when included.
- A bounded omission reason when excluded: `size_limit`, `not_found`, `storage_unavailable`, `access_denied`, or `integrity_failure`.

Manifest entries never contain provider asset identifiers, storage URLs, credentials, signatures, raw provider errors, stack traces, internal cleanup state, user email addresses, or private database fields. Unknown provider failures map to `storage_unavailable`. Free-form provider diagnostics are neither returned nor embedded.

`complete` is true only when every eligible logical attachment reference was included successfully. The PDF must visibly disclose an incomplete attachment set and summarize omission counts by safe reason whenever `complete` is false. The manifest remains the detailed attachment inventory.

## Roles and permissions

| Capability | Workspace Owner | Assigned Service-Team Member | Client Participant | Client Approver |
| --- | --- | --- | --- | --- |
| See export action | Yes | Yes | Yes | Yes |
| Request/download shared export | Yes | Yes | Yes | Yes |
| Receive provider-private or AI-working data | No | No | No | No |
| Export a project without current project access | No | No | No | No |

- Workspace Owners inherit access to every project in their workspace under the existing membership model.
- Service-Team Members must remain assigned to the exact project.
- Client roles must remain explicitly assigned to the exact project.
- Cross-workspace identifiers, attachment identifiers, and project names must not reveal whether a private project or file exists.
- Archived and completed read-only state does not weaken current membership checks.
- If authority is lost after projection capture but before streaming begins, the request fails safely and the captured content is discarded.

## API and frontend behavior

The Express API exposes a protected project-scoped action under the existing versioned project routes. Exact path naming may follow repository conventions, but the action is semantically an export download and returns `application/zip` with safe `Content-Disposition` and anti-sniffing headers. The browser must use the existing same-origin `/api` boundary and authenticated cookie session.

The project view exposes a keyboard-accessible **Export project record** action to all current roles in every lifecycle collection. During preparation it shows a clear busy state, prevents accidental duplicate requests, remains cancellable through normal browser behavior, and does not imply that project mutations are blocked.

On success the browser initiates the ZIP download using the server-provided safe filename. If the response can safely signal attachment omissions before download, the UI presents an incomplete-export notice; regardless, the PDF and manifest are authoritative about completeness. Failures use concise, actionable messages for lost access, unavailable generation, and retryable dependency failure without exposing private existence or diagnostics.

No email is sent and no activity, notification, database export record, or reusable download URL is created.

## Validation and failure behavior

1. Requests require a valid authenticated, verified session and exact current project access at initial authorization and immediately before streaming.
2. Project and membership identifiers use existing strict validation and anti-enumeration behavior.
3. Data projection is bounded by existing domain limits and cursor traversal, avoids unbounded generic serialization, and includes all qualifying shared records through the cutoff.
4. User-authored content is rendered as inert text. PDF text, URLs, filenames, and ZIP paths must not execute markup, scripts, embedded content, or local/network references.
5. External deliverable URLs are printed as shared references and are never fetched by the exporter.
6. Attachment retrieval uses the existing private storage boundary and exact submitted-version association. Storage credentials and durable delivery URLs never reach the client.
7. A missing, inaccessible, unavailable, mismatched, or over-cap attachment is omitted with its bounded manifest reason; other eligible files continue.
8. An authorization, projection, mandatory serialization, or archive-structure failure is fatal. If streaming has not begun, return the established safe API error. If transport fails after streaming begins, terminate the response; never label a corrupt archive successful.
9. Logs may contain request correlation, safe outcome category, duration, aggregate counts, and bounded internal identifiers. They must not contain exported text, filenames where sensitive, attachment bytes, URLs, credentials, provider responses, or archive contents.
10. Export work is request-scoped and releases streams and resources on completion, failure, timeout, or client disconnect. It must not rely on a persistent local filesystem.
11. Implementation limits must remain viable on the selected portfolio-scale hosting. No queue, worker, Redis, microservice, or additional storage provider is introduced for export generation.

## Acceptance criteria

1. Each of the four current project roles can download the same shared-record export for an authorized project in every lifecycle state.
2. Unauthenticated, unverified, unrelated-workspace, unassigned, removed, and cross-project requests fail under existing safe authorization and anti-enumeration rules.
3. Membership revocation after initial authorization but before response streaming prevents any archive bytes from being delivered.
4. The ZIP always contains a readable `project-record.pdf` and schema-versioned `manifest.json`, with deterministic, safe paths for included files.
5. The PDF represents the complete shared record through one declared cutoff and contains the required informational-only disclaimer.
6. Workspace Owners, Service-Team Members, Client Participants, and Client Approvers receive equivalent record content for the same cutoff, apart from transport-specific request metadata.
7. Provider-private drafts, AI-private data, emails, invitations, account/session data, provider identifiers, credentials, permanent/signed URLs, raw diagnostics, and generic activity context are absent from the PDF, manifest, ZIP metadata, filenames, response headers, and safe errors.
8. Current members appear by display name and role; historical actors use preserved shared snapshots; former members do not appear in the current roster solely because of past participation.
9. All submitted-version attachment references are inventoried, while drafts and external-link contents are never bundled.
10. Eligible files are evaluated newest-version-first under the approved round ordering, the bundled-file total never exceeds 262,144,000 bytes, and no file is truncated.
11. Missing, inaccessible, unavailable, mismatched, and over-cap files produce a usable archive with safe manifest omissions and a visible PDF incompleteness notice.
12. Fatal record, PDF, manifest, or archive-generation failures do not intentionally return a corrupt or partial successful download.
13. Export generation creates no project mutation, export artifact, activity entry, notification, email, reusable URL, or provider-side public asset.
14. The frontend action is responsive, keyboard accessible, visibly indicates preparation and failure, and works through the same-origin API boundary in supported browsers.
15. Focused authorization, tenant-isolation, projection, archive, size, dependency-failure, UI, and end-to-end tests pass together with repository lint, type checks, builds, and the existing CI gate.

