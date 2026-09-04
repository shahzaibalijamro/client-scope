# Slice 1.1: Identity, Workspaces, and Project Access Requirements

**Status:** Approved
**Approved:** 2026-09-04
**Roadmap scope:** Phase 1, Slice 1.1 — Identity, workspaces, and project access

## Purpose

Establish the identity, tenant, project-context, and access boundaries required by every later ClientScope workflow. A provider must be able to enter the product, create a workspace, client, and project, grant service-side and client-side access, and trust that the backend exposes only the work authorized in the current context.

## Desired Outcome

A person can create and verify a global ClientScope account, create or join workspaces and projects in different roles, and use one signed-in home to understand their accessible work and pending invitations. A Workspace Owner can create the minimum provider structure and administer access. Service-Team Members and client-side users receive only their explicitly scoped project access. Invitations, assignments, role changes, removals, and leaving preserve a trustworthy record without granting stale or conflicting authority.

## Constitutional Constraints

This slice must remain consistent with:

- `specs/mission.md`, especially global identities, contextual authority, private-by-default project data, explicit roles, preserved history, human authority, and correctness over convenience.
- `specs/tech-stack.md`, including the independent Next.js and Express applications, REST API, MongoDB/Mongoose, Zod validation, secure server-side sessions, same-origin `/api` proxy, Gmail SMTP/Nodemailer boundary, and selected testing tools.
- `specs/roadmap.md`, especially the Slice 1.1 outcome, vertical delivery, backend-enforced authorization, minimum in-app view of accessible work, transactional invitations, and risk-based verification.

Frontend visibility is never an authorization boundary. Express must authenticate and authorize every protected operation using current persisted state.

## Scope

### In scope

- Global email/password accounts with required display names.
- Signup, sign-in, fixed server-side sessions, current-session logout, and display-name editing.
- Email verification, verification-link replacement, forgot-password requests, and password reset.
- A verification-only experience for signed-in unverified accounts.
- Secure cookie, CSRF, origin, token, throttling, and account-discovery protections needed by these browser flows.
- Workspace creation and the single-owner invariant.
- Client creation, viewing, editing, and guarded permanent deletion.
- Project creation and read-only project setup details.
- Service-Team Member workspace invitations and project assignments.
- Client Participant and Client Approver project invitations and membership.
- Invitation creation, delivery state, replacement, revocation, expiry, discovery, onboarding continuation, and explicit acceptance.
- Project-specific unassignment, workspace/project removal, voluntary leaving, client-role changes, and later restoration through the approved path.
- A responsive signed-in home, account surface, workspace administration, client management, project setup, member/access management, and invitation acceptance UI.
- Persistence of important setup and access history with future audience metadata.
- Transactional email for authentication, invitation, assignment, role-change, and removal events.
- Automated tests for critical identity, tenant isolation, authorization, invitation, access-transition, and history behavior, plus a deliberately small Playwright suite for the critical journeys.

### Out of scope

- Account email changes, signed-in password changes, account deletion, account deactivation, session/device management, or logout-all except as a password-reset consequence.
- Third-party identity providers, magic-link-only authentication, bearer tokens, public API clients, native applications, or cross-origin browser clients.
- Workspace renaming, ownership transfer, additional owners, owner self-removal/demotion, or workspace deletion.
- CRM fields beyond the approved client record, client archival, or deletion after any project association exists.
- Project editing, deletion, archival, lifecycle status, requirements, scope approval, change requests, milestones, deliverables, comments, attachments, or completion.
- Service-Team Member administration rights or client-side administration rights.
- Invitation decline, complex approval chains, ordered approvers, voting, quotas, or a required minimum number of client approvers.
- A global active-workspace switcher, a general notification center, notification preferences, digests, push/SMS notifications, or automatic email retry infrastructure.
- A dedicated activity-history or audit-timeline browser. Slice 1.1 only creates history and exposes limited access-management history to the owner.
- Cloudinary, Gemini, background workers, queues, Redis, real-time collaboration, or new deployment infrastructure.

## Identity Model

1. An account represents one person globally and has no permanent provider/client type.
2. Any verified account may create and own workspaces while also holding service-team or client-side roles elsewhere.
3. Authority is derived only from current workspace ownership, active workspace membership, active project assignment, or active client project membership.
4. Signup requires an email address, password, and display name. Independent signup grants no workspace or project access.
5. Display names are not unique. Editing a display name updates current member lists and future activity, but existing history retains the actor-name snapshot recorded when the action occurred.
6. Email-address changes, account deletion, and account deactivation are not available in this slice.

## Email and Password Rules

1. Email input is trimmed, syntactically validated, and normalized for uniqueness, authentication, invitations, token requests, and matching using a locale-independent case-insensitive form. A display form may be retained for user-facing email.
2. ClientScope does not apply provider-specific transformations such as Gmail dot or plus-address normalization.
3. Passwords must contain 12–128 characters. Spaces and Unicode characters are allowed; passwords are never trimmed and have no composition rule.
4. Passwords are stored only through a modern password-hashing algorithm suitable for password storage. Plaintext passwords must never be stored, logged, emailed, or returned.
5. Required names are trimmed and must remain non-empty. Optional text that becomes empty after trimming is stored as absent rather than as meaningful content.
6. Display names contain 1–80 characters after trimming.
7. Workspace names, client names, company names, and project names contain at most 120 characters after trimming; the three required name fields contain at least one character.
8. Project descriptions contain at most 5,000 characters and internal client notes at most 10,000 characters. Line breaks are preserved and neither field is rendered as Markdown or rich text.
9. Email addresses contain at most 254 characters after trimming and must pass the same documented syntactic validator everywhere they are accepted.
10. Frontend and backend enforce the same boundaries. Invalid input is rejected without silent truncation.

## Signup and Account-Discovery Protection

1. A successful new signup creates the unverified account and an unverified seven-day browser session, then shows the verification-only experience.
2. Signup with an already registered normalized email returns the same neutral browser response as a new signup. It must not reveal whether the account exists.
3. For an existing account, the system attempts to send sign-in/password-reset guidance rather than creating another account or changing credentials.
4. Sign-in failure uses one generic “invalid email or password” response for unknown emails, incorrect passwords, and other credential mismatches that are safe to combine.
5. A forgot-password request returns the same neutral response regardless of whether the normalized email has an account, is unverified, or email delivery succeeds.
6. Repeated sign-in and token-email attempts are temporarily throttled using both normalized-email and network-origin signals. Throttling returns a safe retry-later response and never locks the account.
7. Limits are configurable and testable so production values can be tuned without changing domain behavior. Responses and timing should avoid obvious account-existence differences where practical.

## Email Verification

1. Unverified users may authenticate but can access only the verification experience, verification-link replacement, session status needed for that experience, and logout. They cannot create workspaces, inspect invitations, accept access, view project data, edit their profile, or perform another meaningful application action.
2. Verification links expire 24 hours after issuance and are single-use.
3. Requesting a new verification link invalidates and replaces the previous outstanding link.
4. Verification tokens are unpredictable, stored in non-recoverable form server-side, and never recorded in application logs or history.
5. Redeeming a valid verification link marks only its intended account as verified. It does not grant an invitation, reset a password, or create a login session.
6. If the browser already has a matching active session, successful verification lifts the gate and continues preserved onboarding. Otherwise, the user is directed to sign in.
7. Invalid, used, replaced, or expired links show a safe unavailable/expired result and a path to request a new link without exposing token or account internals.
8. Email delivery failure does not delete the account. A signed-in unverified user receives a safe delivery warning and may request a replacement link subject to throttling.

## Password Reset

1. Reset links expire one hour after issuance and are single-use.
2. Requesting a new reset link invalidates and replaces the previous outstanding reset link for that account.
3. Reset tokens follow the same unpredictability, non-recoverable storage, and logging rules as verification tokens.
4. A valid reset accepts and confirms a new password under the signup password policy.
5. Resetting a password does not verify an unverified account.
6. A successful reset atomically changes the password and revokes every existing session for that account, including the browser that submitted the reset.
7. The reset browser remains signed out and directs the user to sign in with the new password.
8. Invalid, used, replaced, or expired reset links fail safely and provide a path to request another reset without disclosing account state.

## Sessions, Cookies, and CSRF

1. Authentication is browser-only through the same-origin `/api` boundary. Third-party bearer-token access is not provided.
2. Each successful signup or sign-in creates an independent revocable server-side session with a fixed expiry seven days after issuance. Sessions do not slide and there is no remember-me option.
3. The browser receives only a high-entropy opaque session token in an `HttpOnly` cookie. The server stores a non-recoverable representation sufficient for lookup and revocation.
4. The session cookie is host-only, `HttpOnly`, `SameSite=Lax`, scoped to `/api`, and has an expiry aligned with the server-side session. It is also `Secure` outside explicitly documented local HTTP development.
5. Logging out revokes only the current server-side session and clears the browser cookie. An absent, expired, or already-revoked session remains safely logged out.
6. Authentication rotates to a fresh token when a new session is created; caller-supplied identifiers are never adopted as session identifiers.
7. Every state-changing browser request must pass same-origin `Origin`/safe fallback validation and present a valid CSRF token bound to the relevant anonymous or authenticated browser context. Safe read requests must not mutate state.
8. Authentication, CSRF, cookies, raw tokens, password material, and sensitive request bodies are excluded from diagnostics.

## Workspace Rules

1. Any verified user may create a workspace by supplying a name and becomes that workspace’s sole Workspace Owner.
2. A user may own multiple workspaces. No product-level workspace-count limit applies in Slice 1.1.
3. Workspace names may be duplicated. Stable identifiers, not names, define identity.
4. Every workspace has exactly one Workspace Owner. There is no second-owner role.
5. Service-Team Members cannot be promoted to owner. Ownership cannot be transferred.
6. The owner cannot remove, demote, or leave as owner.
7. Workspace settings are creation-only: renaming and deletion are deferred.
8. Workspace creation and required history creation succeed or fail together.

## Client Records

A client record belongs to exactly one workspace and contains:

- Client name — required.
- Company name — optional.
- Primary contact email — optional descriptive metadata.
- Internal notes — optional plain text with preserved line breaks.

Rules:

1. Client records are administrative provider data, separate from user accounts and project memberships.
2. Only the Workspace Owner may create, view the full record, edit, or delete a client.
3. The primary contact email is validated when present but is not unique and does not constrain invitations or authorization.
4. Ordinary edits replace current client metadata and do not create field-level versions or activity events.
5. Client creation creates an owner-only history event.
6. The owner may permanently delete a client only when no project has ever been associated with that client.
7. Deletion requires typing the current client name as explicit confirmation. The backend rechecks the project-association invariant at write time.
8. Successful deletion and its owner-only history record succeed together. The history snapshot may preserve safe identifying context but not internal notes.
9. A client with one or more associated projects cannot be deleted, including when the project is not otherwise visible on the current screen.
10. Assigned Service-Team Members may receive the client name, company name, and primary contact email only through an assigned project context. They never receive internal notes.
11. Unassigned Service-Team Members receive no client-record access through workspace membership alone.
12. Client-side project members receive the associated client name required to identify their project, but no provider client-management record, company/contact metadata from that record, or internal notes.

## Project Setup

A project belongs to one workspace, references one client from that same workspace, and captures:

- Project name — required.
- Associated client — required.
- Description — optional plain text with preserved line breaks.
- Target deadline — optional calendar date.

Rules:

1. Only the Workspace Owner may create a project.
2. Workspace, client, and project names may be duplicated; stable identifiers distinguish records.
3. The associated client must exist in the same workspace at creation time.
4. The target deadline is a valid date-only value without time-of-day or timezone conversion. Past dates are allowed because the deadline is descriptive metadata.
5. Project setup is creation-only in Slice 1.1. Editing, deletion, archival, and lifecycle transitions are deferred.
6. Every active project member may view the project name, associated client name, description, and target deadline.
7. Workspace Owner access is implicit through current workspace ownership. No separate owner project-membership record is created.
8. The owner is nevertheless displayed in every project’s active member list with the `Workspace Owner` role.
9. Project creation and its project-shared history event succeed or fail together. Members who receive project access later may see this historical project-creation event in the future history UI.

## Service-Team Membership and Assignments

1. A person joins the provider side of a workspace only by accepting a Service-Team Member workspace invitation.
2. Active workspace membership alone exposes the workspace name, the user’s membership state, and the ability to leave. It does not expose the workspace roster, clients, or projects.
3. The Workspace Owner may assign an active Service-Team Member to any project in that same workspace. Assignment is immediate and does not require a second invitation or member acceptance.
4. A Service-Team Member accesses only projects with an active assignment.
5. The owner may deactivate one project assignment while leaving the workspace membership and other project assignments active.
6. A former assignment may be restored by a later explicit owner assignment. The new access period must be distinguishable from the earlier inactive period.
7. Removing a Service-Team Member from the workspace immediately deactivates the workspace membership and all active project assignments atomically.
8. A Service-Team Member may leave the workspace after explicit confirmation. Leaving has the same assignment-revocation effect but records the member as the actor and the termination reason as voluntary.
9. Service-Team Members cannot leave only one assignment, invite others, create clients or projects, assign members, change roles, or perform workspace administration in this slice.

## Client-Side Project Membership

1. Client-side users join individual projects through project invitations and receive no workspace membership.
2. A project invitation grants exactly one intended role: Client Participant or Client Approver.
3. Client Participants and Client Approvers access only projects with active client membership.
4. Client Approvers carry binding approval authority for later slices; Participants do not. Slice 1.1 does not yet provide an approval action.
5. One valid future decision from any active authorized Client Approver is sufficient. Slice 1.1 imposes no minimum approver count.
6. The Workspace Owner may immediately switch an active client member between Participant and Approver after an explicit confirmation explains the authority change.
7. Role change creates an immutable project-shared history event. It does not rewrite earlier actions, decisions, or role history.
8. A client member may leave each project independently after explicit confirmation. Access ends immediately and restoration requires a new invitation.
9. The owner may remove a client member from a project. Removal ends future access without deleting the membership record or earlier activity.
10. An inactive client membership cannot be edited back to active or have its role changed directly; restoration uses a new invitation and access grant.

## Effective Project Role and Conflict Rules

1. Within one project, a non-owner user may have exactly one effective role: Service-Team Member, Client Participant, or Client Approver.
2. Workspace membership without a project assignment is not itself an effective role in that project.
3. The owner’s implicit Workspace Owner authority cannot be combined with another project role in the owner’s own workspace.
4. Invitation creation, invitation acceptance, service assignment, and role restoration must reject any duplicate or conflicting active access.
5. Conflict checks occur before presenting success and are repeated atomically at the state-changing write so races cannot create multiple effective roles.
6. Access is computed from current active records on every protected operation. Revoked, left, expired, or otherwise inactive records grant no authority.

## Invitations

### Scope and lifecycle

1. Only the Workspace Owner may issue, replace, or revoke invitations in their workspace.
2. A workspace invitation is scoped to one workspace, one normalized email, and the Service-Team Member role.
3. A project invitation is scoped to one project, one normalized email, and one client-side role.
4. An invitation expires exactly three days after issuance and has one of the durable lifecycle outcomes: pending, accepted, expired, or revoked. Delivery outcome is tracked separately from access state.
5. The recipient cannot explicitly decline. Ignoring an invitation leaves it pending until expiry or owner revocation.
6. Reissuing for the same normalized email and scope revokes and replaces the existing pending invitation, including when changing the intended client role. The former record remains historical.
7. Changing the intended recipient email always requires revoking the old invitation and creating a new one.
8. Invitation tokens are high-entropy, single-use, stored non-recoverably, excluded from logs/history, and invalidated when the invitation is accepted, revoked, expired, or replaced.

### Privacy and onboarding

1. Only a verified account whose normalized email exactly matches the invitation may view its details or accept it.
2. Signed-out users and users signed in under a different email see no inviter, workspace, project, client, role, or intended-email details. They receive a generic sign-in/use-the-invited-account path.
3. A matching but unverified account remains in the verification-only experience and cannot inspect or accept the invitation until verified.
4. Once the verified matching account is active, the pre-acceptance view is limited to inviter display name, workspace name, intended role, and, for project invitations, project and associated client names.
5. Project description, deadline, member list, client metadata, and all other private data remain hidden before acceptance.
6. A signed-out recipient who follows an invitation may sign in or create an account. The browser preserves the invitation context through signup, sign-in, and verification and returns the verified matching user to that invitation.
7. Valid invitations matching the verified user’s email also appear on `Your work`, even when the email link is not used.
8. Authentication and verification never accept an invitation. The recipient must use an explicit `Accept invitation` action after seeing the limited details.

### Acceptance and failure behavior

1. Acceptance rechecks token/status when applicable, expiry, revocation, normalized email, account verification, target existence, owner/workspace validity, and duplicate/conflicting access.
2. Acceptance and the membership/access history records succeed atomically. Failed acceptance grants no partial access and leaves no active membership.
3. After workspace-invitation acceptance, the new Service-Team Member can see the workspace on `Your work` but no project until assigned.
4. After project-invitation acceptance, the client member can open that project immediately.
5. Invalid, expired, replaced, revoked, accepted, mismatched, or conflicting invitations fail with a safe result that does not expose private details to an unauthorized caller.
6. If Gmail SMTP delivery fails during invitation issuance, the invitation remains pending and visible to the owner with a failed-delivery status. The UI reports that access has not been accepted and offers replacement/reissue as the retry path.

## Access Removal, Restoration, and History

1. Memberships and assignments are deactivated rather than permanently deleted.
2. Deactivation records who acted, when it occurred, and whether access ended by owner removal, project unassignment, or voluntary leave.
3. Access removal affects only future access. It never deletes or rewrites past comments, uploads, activity entries, assignments, approvals, or other authored actions.
4. A previously removed person may be invited or assigned again where the current role rules allow it. Restoration creates a new distinguishable access period while retaining prior periods.
5. Owner-initiated removals require explicit confirmation. Leaving workspace/project requires explicit confirmation that access ends immediately and can be restored only through a new invitation.
6. Access checks must take effect from current persisted state; stale frontend data or an unexpired session cannot preserve revoked authority.

## Signed-In Home and Navigation

1. The signed-in root is a unified `Your work` view, not a mandatory global workspace-selection mode.
2. Valid pending invitations matching the verified user appear first.
3. Accessible projects are grouped under their workspace and show enough workspace, client, project, role, and deadline context to distinguish multi-workspace and cross-provider work.
4. Workspaces the user owns or has joined appear even when the user has no accessible projects.
5. Owners receive clear paths to workspace administration and to create another workspace.
6. Every verified user may create a workspace from `Your work`, including users who are clients or Service-Team Members elsewhere.
7. A verified user with no invitations, memberships, ownership, or projects sees a clear empty state and workspace-creation action.
8. Unverified users never receive the signed-in home data; they receive only the verification experience.
9. Access acceptance, removal, role changes, and leaving must be reflected after fresh data is loaded; client-side cache state cannot be treated as authority.

## Member and Administrative Views

1. Every active project member may see the display names and effective project roles of the other active project members, including the implicit Workspace Owner.
2. Only the Workspace Owner may see member email addresses, intended invitation emails, delivery status, or inactive access records.
3. Non-owners cannot browse a workspace-wide roster. They see people only through active member lists of projects they may access.
4. Owner access-management screens show active members/assignments, pending invitations, and prior expired, revoked, left, removed, or replaced entries needed to administer access.
5. Historical entries are read-only. The UI exposes actions only when valid for the current state, such as revoke pending invitation, replace/reissue, unassign, remove, change an active client role, or restore through the approved invitation/assignment path.
6. These administrative lists are not a general project activity timeline and do not expose unrelated historical project content.

## Activity History

Slice 1.1 persists significant setup and access facts even though the general history UI is deferred.

### Required event qualities

- Immutable event identity and timestamp.
- Acting user identity where a person acted, plus a display-name snapshot.
- A system reason for automatic expiry where no person acted.
- Workspace and, where applicable, project/entity context.
- Safe entity/role snapshots needed to understand the event later.
- Audience metadata fixed from the event type, not inferred from whoever is viewing a mutable screen.
- No password, session, CSRF, raw email token, internal client note, or unnecessary personal-data content.

### Owner-only events

- Workspace creation.
- Client creation and deletion.
- Workspace invitation issuance, delivery outcome, replacement, revocation, expiry, and acceptance.
- Project invitation issuance, delivery outcome, replacement, revocation, and expiry.
- Workspace membership removal or voluntary leave.

### Project-shared events

- Project creation.
- Service-Team Member assignment and project unassignment.
- Client invitation acceptance/project join.
- Client Participant ↔ Approver role change.
- Client-member removal or voluntary project leave.
- Project access loss caused by Service-Team Member workspace removal or leave.

Invitation activity remains owner-only until successful project acceptance creates the project-shared join event. A person who later loses project access cannot use historical membership to view project history.

## Transactional Email

1. Gmail SMTP is accessed through Nodemailer only behind a small application email boundary. Domain logic does not depend on Nodemailer- or Gmail-specific response shapes. Authentication uses the configured Gmail address and a server-only Google App Password, never the account's normal password.
2. This slice sends or attempts transactional email for:
   - Email verification and replacement verification links.
   - Password-reset links.
   - Duplicate-signup guidance to an existing account.
   - Workspace and project invitations.
   - Service-Team Member project assignment.
   - Client Participant ↔ Approver role change.
   - Workspace removal, project unassignment/removal, and relevant cascading access removal.
3. Email contains only the minimum context needed to understand the event and return to ClientScope. It must not include internal notes, hidden client metadata, other member emails, secrets, or raw application diagnostics.
4. In-app state is authoritative. Assignment, role-change, and removal operations remain successful if their notification email fails; the acting owner receives a safe delivery warning.
5. Invitation delivery failure follows the pending-invitation behavior defined above.
6. Anonymous reset and duplicate-signup responses remain neutral even when email delivery fails.
7. This slice has no background queue or automatic retry system. A user-requested replacement or later explicit action is the supported retry path where defined.

## Transactionality and Concurrency

1. Writes that establish or revoke authority and their required activity records must be atomic.
2. Single-owner, same-workspace references, client-deletion eligibility, invitation validity, one-effective-project-role, and active-access constraints are rechecked at write time.
3. Concurrent acceptance, assignment, removal, reissue, or role-change attempts must produce one valid resulting state rather than duplicate access or contradictory active records.
4. Email is dispatched only after the authoritative domain transaction succeeds. Email failure never makes a committed domain action appear rolled back.
5. Expected stale-state and conflict failures use safe stable errors that let the frontend refresh and explain that access or invitation state changed.

## Error and Privacy Behavior

1. API errors use the approved common REST error envelope and stable machine codes.
2. Validation errors may identify safe fields but must not reveal whether another account exists, private entity details, membership history, raw database/provider failures, tokens, or internal identifiers beyond those already authorized.
3. Unauthorized access to another workspace or project returns a safe denied/not-found response according to the established anti-enumeration convention. The response must not prove that the target private entity exists.
4. Owner-only fields are excluded at the serialization/query boundary, not merely hidden by frontend components.
5. Expired sessions, revoked access, stale invitations, and email-provider failures produce understandable recovery paths without raw technical details.
6. Structured diagnostics may record safe operation category, status, stable error code, duration, and internal correlation context. They exclude secrets, cookies, tokens, passwords, CSRF values, request bodies, and unnecessary personal data.

## Accessibility and Responsive Behavior

1. Provider administration is efficient on desktop while authentication, invitation acceptance, project viewing, and leaving remain convenient on mobile.
2. Forms use semantic labels, useful instructions, field-associated errors, keyboard-operable controls, visible focus, and non-color-only status cues.
3. Confirmation dialogs move focus predictably, identify the affected scope, and allow cancellation without changing state.
4. Loading, empty, success, unavailable, expired, denied, and delivery-warning states use plain language and remain understandable without inspecting developer output.
5. Tables or dense administrative lists adapt to narrow viewports without hiding required actions or authorization context.

## Acceptance Criteria

1. A person can sign up with valid email, password, and display name, receives an unverified session, and sees only the verification experience.
2. Duplicate signup, unknown-account reset, and credential mismatch do not reveal whether an account exists; the appropriate email attempt occurs behind the neutral response.
3. Verification and reset links enforce their 24-hour and one-hour expiries, respectively, are single-use, and are replaced by newer requests.
4. Verification changes verification state without creating a session or accepting an invitation. Password reset changes the password, does not verify the account, revokes all sessions, and requires fresh sign-in.
5. Sessions expire seven days after issuance without sliding; current-session logout revokes only the current session.
6. Unsafe browser requests without valid CSRF and same-origin evidence are rejected without state change.
7. Repeated authentication/token attempts are throttled without account lockout or account-existence disclosure.
8. A verified user can create multiple workspaces and becomes the sole owner of each; no flow can create a second owner or let the owner leave, transfer, or rename the workspace.
9. Only the owner can create and fully manage client records. Service-Team Members and client-side users receive only the specifically authorized client fields.
10. Client edits change current metadata without field history. Client creation/deletion events are recorded, and deletion succeeds only after typed-name confirmation and an atomic no-project recheck.
11. Only the owner can create a project using a client from the same workspace. Past date-only deadlines are accepted, and setup details cannot be edited or deleted afterward in this slice.
12. The owner sees every workspace project implicitly and appears as Workspace Owner in each member list without a project-membership record.
13. Accepting a Service-Team Member invitation creates workspace membership but no project access. An owner assignment then grants only the selected project access.
14. A Service-Team Member cannot browse the workspace roster, client list, or unassigned projects and receives no internal client notes.
15. The owner can deactivate one service-team project assignment without affecting workspace membership or other assignments.
16. Workspace removal or voluntary leave immediately deactivates all service-team assignments and prevents future access using an existing session.
17. A verified matching recipient can explicitly accept a Client Participant or Client Approver invitation and then access only that project.
18. A client member can leave one project without affecting other project memberships. Owner removal and voluntary leave preserve the prior membership period and authored history.
19. Participant ↔ Approver changes require confirmation, take effect immediately, and create immutable project-shared history without changing earlier actions.
20. Invitation issuance, acceptance, assignment, and restoration reject duplicate or conflicting effective project roles, including under concurrent attempts.
21. Invitations expire after three days, cannot be declined, and are accepted only through an explicit action by a verified normalized-email match.
22. Signed-out, mismatched, and unverified users see no invitation details. A verified match sees only the approved limited pre-acceptance fields.
23. Invitation context survives signup, sign-in, and verification, and all valid matching invitations are also discoverable from `Your work`.
24. Reissuing an invitation revokes and preserves the former pending record and creates a new three-day invitation. A stale/replaced link cannot grant access.
25. Invitation delivery failure leaves the invitation pending with an owner-visible warning and replacement/reissue path.
26. `Your work` shows valid invitations first, accessible projects grouped by workspace, and owned/joined workspaces even when no project is accessible.
27. Project listings and pages include enough workspace/client/project/role context to distinguish work across providers, while unauthorized projects and private client fields are absent.
28. Active project members can see active member display names and roles, including the implicit owner. Only the owner can see emails, pending invitations, delivery state, and former/inactive access records.
29. Owner access-management screens show current, pending, expired, revoked, removed, left, and replaced entries with only state-valid actions.
30. Required setup/access events contain safe actor, time, context, snapshot, and audience metadata and are committed atomically with the domain action.
31. Owner-only and project-shared event visibility follows the approved matrix; later loss of access prevents project-history access.
32. Assignment, role-change, and removal actions remain committed when notification email fails, and the owner receives a safe warning rather than a false rollback.
33. Cross-workspace and cross-project API attempts, guessed identifiers, stale cached authority, inactive records, and role escalation attempts are denied by the backend without private-data leakage.
34. Authentication, invitation acceptance, owner setup, client project access, responsive behavior, and the highest-risk revocation/isolation paths are covered by the approved automated and manual validation plan.
35. Frontend and backend type checks, linting, automated tests, and production builds pass without requiring live Gmail SMTP delivery or other out-of-scope provider credentials.
