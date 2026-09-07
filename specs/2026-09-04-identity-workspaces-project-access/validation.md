# Slice 1.1: Identity, Workspaces, and Project Access Validation

## Validation Goal

Prove that global identity, verification, sessions, tenant isolation, contextual authorization, invitations, access transitions, private-field filtering, and preserved history behave as approved. Validation prioritizes unauthorized-access prevention, role correctness, atomic revocation, token/session safety, and recoverable provider failures over a coverage percentage.

## Highest-Risk Behavior

The strongest evidence is required for:

1. Cross-workspace and cross-project isolation under guessed identifiers, stale caches, and mixed roles.
2. Revoked or left access becoming ineffective immediately despite an otherwise valid session.
3. Exactly one effective non-owner role per project under concurrent invitation acceptance, assignment, restoration, and role changes.
4. Workspace removal/leave atomically revoking every service-team project assignment and recording the required history.
5. Invitation privacy, normalized-email matching, explicit acceptance, expiry, replacement, and stale-link rejection.
6. Password, token, session-cookie, CSRF, origin, rate-limit, reset-all-sessions, and account-discovery protections.
7. Owner-only client notes, member emails, inactive-access data, and invitation delivery data never entering non-owner responses.
8. Required domain state and activity history committing atomically while email failure remains non-authoritative.
9. The sole-owner invariant and prevention of owner removal, transfer, second-owner creation, or conflicting project roles.
10. Client deletion rechecking project association at write time and preserving the safe deletion event.

## Evidence Recording

During implementation, replace `Pending` with the actual command, environment category, result, and safe artifact reference. Never record credentials, cookies, raw tokens, full personal email addresses, internal notes, provider payloads, connection strings, or sensitive diagnostics.

| Check | Evidence | Result |
| --- | --- | --- |
| Backend typecheck/lint/unit/integration | Pending | Pending |
| Frontend typecheck/lint/component tests | Pending | Pending |
| Production builds | Pending | Pending |
| Focused Playwright journeys | Pending | Pending |
| Tenant-isolation and revocation review | Pending | Pending |
| Gmail SMTP/Nodemailer boundary and failure checks | Pending | Pending |
| Responsive/accessibility review | Pending | Pending |
| Cookie/CSRF/token/privacy inspection | Pending | Pending |
| Hosted CI run | Pending | Pending |

## Automated Validation

### Identity and validation unit tests

- Email trimming and locale-independent case-insensitive normalization produce one account/invitation identity while preserving an optional display form.
- Provider-specific Gmail-style normalization is not applied.
- Display name and required-name trimming reject empty results; optional empty text becomes absent.
- Passwords accept spaces and Unicode, are never trimmed, accept exactly 12 and 128 characters, and reject outside boundaries.
- Password hashes verify the intended password and do not expose or reproduce plaintext.
- Bounded text rejects over-limit values without silent truncation.
- Date-only validation accepts valid past/future dates, rejects impossible dates and timestamp forms, and round-trips without timezone shift.
- Token helpers generate opaque high-entropy values, persist only non-recoverable representations, enforce exact expiry, reject reuse, and invalidate replaced tokens.
- Session expiry remains fixed at issuance and is never extended by reads or ordinary activity.
- Throttling can be tested with low configuration, combines email/network signals, returns retry-later behavior, and never changes account status.

### Domain and permission unit tests

- Effective project role resolves to exactly one of Service-Team Member, Client Participant, or Client Approver for non-owners, while the owner resolves through implicit ownership.
- Workspace membership without assignment grants no service-team project role.
- Duplicate/conflicting invitations, assignments, and restorations are rejected.
- Participant ↔ Approver transitions are valid only for active client membership and preserve earlier role history.
- Inactive memberships/assignments grant no authority and cannot be directly toggled back to active outside the approved restoration path.
- Owner removal and voluntary leave produce distinct actor/reason metadata.
- Event-type mapping produces the approved owner-only or project-shared audience and safe snapshots.
- Project creation, client creation/deletion, invitation acceptance, assignment, unassignment, role change, removal, and leaving require the approved event set.
- Client deletion eligibility is false after any project association.
- Invitation state transitions reject decline, acceptance after expiry/revocation/replacement, and a second acceptance.

### Authentication API integration tests

Use Vitest, Supertest, and isolated ephemeral MongoDB with deterministic email and time controls.

- New signup persists one normalized account, hashes the password, creates an unverified fixed seven-day session, and returns only safe account/session data.
- Duplicate signup returns the same neutral public outcome and does not create or mutate an account; the existing-account guidance command is invoked.
- Known/unknown email and correct/incorrect password combinations expose only the approved generic sign-in failure where authentication is not successful.
- A valid sign-in creates a fresh independent session and never adopts a caller-provided session identifier.
- Session records store no raw cookie value; public/logged output contains no token or password material.
- Current-session logout revokes only that session. Other sessions remain active until expiry or password reset.
- Expired and revoked session cookies are rejected and safely cleared.
- Unverified sessions can access only session/verification/logout behavior; all workspace, invitation, profile-edit, client, and project endpoints reject them.
- Missing/invalid CSRF, untrusted Origin, and disallowed fallback-origin evidence reject every unsafe route without mutation.
- Safe reads do not mutate and cannot be used to redeem verification, reset, or invitation actions.
- Cookie assertions cover HttpOnly, production Secure, approved SameSite, expiry, and limited scope.
- Configured rate limits throttle repeated sign-in, reset, verification-link replacement, and invitation-email abuse without locking an account or revealing its existence.

### Verification and password-reset integration tests

- Verification tokens expire at 24 hours, are single-use, and are invalidated by replacement.
- Verification marks only the intended account verified, does not create a session, and does not accept a pending invitation.
- A matching existing session can continue after verification; a browser without one remains signed out.
- Invalid, expired, used, and replaced verification links return safe recovery behavior.
- Verification-delivery failure leaves the account intact and allows a throttled replacement request.
- Forgot-password returns the same neutral response for unknown, verified, unverified, and delivery-failure cases.
- Reset tokens expire at one hour, are single-use, and are invalidated by replacement.
- Reset applies the password policy without trimming, does not verify an unverified account, changes the password atomically, revokes all sessions, and creates no replacement session.
- Old credentials and all old sessions fail after reset; the new password succeeds only through a fresh sign-in.
- Concurrent reset redemption produces one successful password change and one safe stale-token failure.

### Workspace, client, and project API integration tests

- Any verified account can create multiple duplicate-named workspaces and is the sole owner of each.
- Direct attempts to create a second owner, promote a member, transfer ownership, remove/demote the owner, rename, delete, or leave as owner fail without mutation.
- Workspace creation and its owner-only event either both persist or both roll back.
- Service-Team Members receive only workspace identity/current-membership/leave data and cannot list the roster, clients, or unassigned projects.
- Only the owner can create, list, fully view, edit, or delete client records.
- Owner responses include internal notes where intended; every service/client response and project payload excludes internal notes at the serialization boundary.
- An assigned Service-Team Member receives only the approved client name/company/contact fields through that assigned project; an unassigned member receives none.
- A client-side project member receives the associated client name but not company/contact/internal-note management data.
- Client edit creates no field-version event. Client create/delete creates the approved owner-only event.
- Client deletion rejects an incorrect typed name and any existing same-workspace project association.
- A concurrent project creation versus client deletion leaves a valid state: either deletion wins before association or project creation wins and deletion is blocked; no dangling reference results.
- Only the owner can create a project, and the selected client must belong to that workspace.
- Project creation accepts duplicate names and past date-only deadlines, rejects invalid date/timestamp forms, and records the project-shared event atomically.
- Project update/delete/archive routes are absent or denied.
- Every active member can read approved immutable setup fields; the implicit owner is returned in the member list without a membership document.

### Invitation API integration tests

- Only the owner can issue, revoke, and replace invitations within their workspace.
- Workspace invites allow only Service-Team Member; project invites allow only Participant or Approver.
- Invitation matching uses normalized email and does not require equality with the client record’s primary contact email.
- Invitation expiry is exactly three days and is authoritative without a background cleanup job.
- A second issuance for the same normalized email/scope revokes and preserves the prior invitation and creates a new token/expiry.
- Changing a project invite from Participant to Approver uses replacement rather than editing the pending record.
- Anonymous, mismatched, and unverified callers receive no inviter/workspace/project/client/role/intended-email details.
- A verified matching caller receives exactly the approved limited fields and no project description, deadline, member list, or client management metadata.
- All valid invitations for a verified email appear on `Your work` and can be accepted there without the email token.
- Sign-in, signup, and verification alone never accept access; only the explicit acceptance request does.
- Workspace acceptance creates an active Service-Team Member workspace membership but no project assignment.
- Project acceptance creates exactly one active client membership with the intended role and immediate access only to that project.
- Acceptance rejects expired, used, revoked, replaced, mismatched, unverified, deleted/invalid-target, duplicate, and conflicting invitations without partial access.
- Concurrent accept/accept and accept/revoke or accept/replace attempts produce one coherent result and no duplicate active membership.
- Failed invitation delivery leaves the invitation pending, stores safe delivery failure state, and returns the owner warning/reissue path without raw provider details.
- Acceptance persists membership and required owner/project history atomically.

### Access-transition and tenant-isolation integration tests

Construct at least two workspaces, multiple projects per workspace, and accounts that are owner, unassigned service member, assigned service member, client participant, client approver, removed member, and mixed-role across different contexts.

- Owner A cannot read or mutate Workspace B clients, projects, invitations, memberships, assignments, emails, or history by substituting identifiers.
- Service members cannot self-assign, inspect unassigned projects, invite, administer clients, change roles, or view workspace-wide/inactive member data.
- Client users cannot access another project in the same workspace or any provider administration endpoint.
- A person may validly be owner in one workspace, service member in another, and client in a third; authority is resolved per request context.
- Assigning an active Service-Team Member grants only the selected project. Unassigning one project preserves workspace membership and other assignments.
- Attempting to assign a person who already has active client access in that project fails atomically.
- Workspace member removal atomically deactivates every active assignment, preserves earlier access periods, and writes the owner-only workspace event plus each project-shared access-loss event.
- Voluntary workspace leave applies the same cascade with the member actor/reason.
- Owner client-member removal and voluntary project leave revoke only that project, preserve other contexts/history, and require a new invitation for restoration.
- Participant ↔ Approver changes require the confirmed endpoint state, affect future authority immediately, and retain earlier role periods/events.
- Restoration creates a new access period rather than overwriting inactive history.
- After every removal/leave/unassignment, the same valid session immediately fails the formerly authorized API call.
- Project current-member results show only active display names/roles plus the implicit owner; only owner administration returns emails and inactive records.
- Owner access-management data correctly represents active, pending, delivery-failed, expired, revoked, replaced, removed, and left states with only valid actions.
- Guessed valid identifiers and malformed identifiers return safe errors without disclosing whether an unauthorized private entity exists.

### Activity and email-failure integration tests

- Required domain writes roll back when required activity persistence is deliberately failed.
- Activity records contain actor identity/name snapshot, timestamp, context, safe entity/role snapshots, and fixed audience metadata.
- Display-name changes affect later events/current lists but not earlier snapshots.
- Events contain no internal notes, raw tokens, cookie/CSRF values, password material, or unnecessary email data.
- Project invitation issuance remains owner-only; successful project acceptance additionally creates the project-shared join event.
- Project members cannot query owner-only activity; users who lose project access cannot query project-shared activity afterward.
- Assignment, role-change, and removal commit when the fake email provider fails and return an owner-visible warning.
- Email is not attempted when the domain transaction fails and is attempted only after commit when it succeeds.
- Notification commands contain only the minimum approved recipient and workspace/project/role context.

### Frontend component and behavior tests

Use Vitest, React Testing Library, user-event, controlled time, and mocked same-origin responses.

- Signup, sign-in, verification, verification-link replacement, forgot/reset password, logout, and display-name forms provide labels, field errors, loading/disabled behavior, neutral responses, and safe failures.
- Password fields preserve spaces and never display server-returned password details.
- Unverified users see only the verification experience and cannot navigate to protected application content.
- Invitation return context survives the tested signup/sign-in/verification navigation and never causes automatic acceptance.
- `Your work` orders valid invitations first, groups projects by workspace, distinguishes role/client/deadline context, and shows empty workspaces.
- The empty verified account state offers workspace creation even when the account is a client/member elsewhere.
- Service-Team Member views omit roster/client/unassigned-project navigation.
- Owner client forms support approved fields, plain-text line breaks, guarded deletion, and blocked-deletion feedback.
- Project creation supports date-only past deadlines and project detail remains read-only.
- Member lists render the implicit Workspace Owner and only active names/roles for non-owners.
- Owner administration renders full active/pending/inactive state and delivery warnings while exposing only valid actions.
- Invitation screens reveal no details in signed-out/mismatch/unverified states and exactly the limited details plus explicit acceptance for the verified match.
- Role-change, leave, removal, and client-deletion confirmation dialogs identify the scope/consequence, support cancel, and manage focus correctly.
- Notification failure shows a warning without representing the committed domain action as failed or reverted.
- Stale conflict/access-denied responses invalidate relevant queries and remove no-longer-authorized content.
- Loading, empty, denied/not-found, expired, throttled, unavailable, and validation states are understandable without color or raw diagnostics.

## Focused Playwright Journeys

Use isolated test data and a deterministic test-only mechanism to obtain email links/tokens. Do not require live mailbox scraping or expose test token mechanisms in production.

### Journey 1: Provider setup and client acceptance

1. Sign up as a new provider, observe the verification-only gate, verify, and continue with the existing session.
2. Create a workspace, client, and project with a past date-only deadline.
3. Invite a new Client Approver and observe the pending/delivery state.
4. Follow the invitation as a signed-out recipient, create the matching account, verify it, return to the invitation, and confirm it is not yet accepted.
5. Explicitly accept and open the project.
6. Confirm the client sees setup details and active names/roles but not client internal notes, management metadata, member emails, or other workspace projects.

### Journey 2: Service assignment and scoped revocation

1. From the owner account, invite a Service-Team Member to the workspace.
2. Accept as the matching verified member and confirm the empty workspace is visible but no roster, clients, or projects are exposed.
3. Assign the member to one of two projects and confirm only that project becomes accessible.
4. Unassign that project while retaining workspace membership and confirm the same browser session immediately loses project access.
5. Reassign, then remove the member from the workspace and confirm all assignment access is lost while prior owner management history remains visible.

### Journey 3: Invitation privacy and role authority

1. Open a project invitation signed out and under a different signed-in email; confirm no private invitation details appear.
2. Open it with the matching verified account and confirm only the approved limited details appear.
3. Accept as Participant, then have the owner change the user to Approver through explicit confirmation.
4. Confirm the current member list reflects Approver and owner administration retains the prior role event.
5. Leave the project with explicit confirmation and confirm current/future project access ends.

Keep the browser suite small. Prove most authorization permutations and concurrency at the API layer rather than duplicating them through the UI.

## Manual Acceptance Checks

### Authentication and email lifecycle

1. Run the frontend and backend independently with a safe development database and configured local/test email mode.
2. Inspect signup, verification, sign-in, reset, logout, and expired-link journeys in a current browser.
3. Confirm verification-link use without a matching session requires sign-in and password reset always leaves the browser signed out.
4. Confirm neutral duplicate-signup/reset responses do not visibly change based on account existence or provider failure.
5. In an approved Gmail SMTP test environment, send each required email category using the configured Google App Password and inspect links, minimum content, sender configuration, expiry behavior, and absence of private fields.
6. Induce safe provider failures and confirm invitation pending state and non-rollback access-change warnings match requirements.

### Cookie, CSRF, and browser boundary inspection

- Inspect cookies in production-like HTTPS configuration for HttpOnly, Secure, approved SameSite, path/domain scope, opaque value, and fixed expiry.
- Confirm the session token is absent from browser storage, page markup, JavaScript-visible cookies, URLs, and API response bodies.
- Attempt unsafe requests with missing/incorrect CSRF, foreign Origin, stale CSRF, and otherwise valid session; confirm no mutation.
- Confirm browser traffic uses only the same-origin `/api` boundary and direct cross-origin credentialed use is rejected.
- Confirm logout and password reset clear/revoke access as approved across tabs and sessions.

### Authorization and privacy exploration

- Using the test role matrix, manually alter workspace/project/client/member identifiers in requests and confirm no private data or existence signal leaks.
- Inspect JSON payloads—not only rendered pages—for internal notes, member emails, inactive history, delivery state, and invitation details under each non-owner role.
- Leave owner/member/client pages open, revoke access in another browser, then refresh or attempt an action and confirm stale UI cannot preserve access.
- Confirm the owner cannot access another owner’s workspace by changing URLs despite being an owner elsewhere.
- Confirm mixed-role accounts receive the correct role independently in each workspace/project context.

### Responsive and accessibility review

- Exercise signup, verification, invitation acceptance, `Your work`, project detail, confirmations, and leave flows at representative mobile widths.
- Exercise owner client/project forms and access administration at desktop and narrow widths without clipped fields or unreachable actions.
- Complete every flow by keyboard, including opening, cancelling, and confirming dialogs.
- Confirm semantic headings, form labels, field-associated errors, live status/warning announcements, visible focus, and sensible focus return.
- Confirm status, role, warning, expiry, and delivery meaning never depends on color alone.
- Check target pages with browser accessibility tooling and resolve material violations.

### Data and history inspection

- Inspect isolated test database records to confirm passwords/tokens/sessions are non-recoverable and membership/assignment periods are retained rather than overwritten.
- Confirm domain/history atomicity using controlled failures and ensure no active access exists without its required event.
- Confirm display-name snapshots remain unchanged after profile edit.
- Confirm client edit creates no field history, deletion retains only the safe event, and internal notes never appear in activity.
- Confirm automatic invitation expiry is enforced from time even without a running cleanup worker.

### Diagnostics and repository hygiene

- Inspect public errors and server diagnostics during invalid credentials, token failures, provider failure, validation failure, conflict, unauthorized access, and unexpected error.
- Confirm no password, cookie, CSRF value, raw token, internal note, full request body, provider payload, database error, stack trace in production response, or secret is exposed.
- Inspect tracked files for local environment files, credentials, reusable test tokens, email-recipient data, build output, Playwright traces/screenshots containing personal data, and database artifacts.
- Confirm safe example configuration uses placeholders and builds/tests do not require Atlas or live Gmail SMTP.

## Static and Build Checks

Run from both `frontend/` and `backend/` as applicable:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Run the documented focused Playwright command from the frontend application.

Verify:

- Both applications still use independent manifests, lockfiles, scripts, and builds.
- Production builds do not connect to MongoDB or send email.
- Unit/integration/component tests use isolated MongoDB and fake email providers without network access.
- No root workspace, shared package, microservice, queue, Redis, background worker, or unrelated provider dependency was introduced.
- API and UI contain no project editing, requirements, change requests, milestones, deliverables, attachments, or other later-slice behavior.
- Environment examples and README accurately describe local identity/email setup without secrets.

## Constitution and Scope Review

Before merge, verify:

- Accounts remain global and roles remain contextual rather than becoming a global provider/client flag.
- Express is the sole business-logic and authorization boundary; Next.js does not replace it with product route handlers.
- Every private query and mutation enforces current workspace/project authorization in the backend.
- The single owner, implicit owner project access, one effective non-owner project role, and preserved-history rules match the mission.
- The unified home is a minimum accessible-work view, not a general dashboard or project-management system.
- Nodemailer/Gmail SMTP is isolated and email remains a pointer to authoritative in-app state; no normal Google account password is present in configuration or application storage.
- The slice remains fully independent of Cloudinary and Gemini.
- Excluded account, workspace, project-lifecycle, notification-center, general-history, and later roadmap features were not introduced.

## Merge Gate

Slice 1.1 is safe to merge only when:

1. Every acceptance criterion in `requirements.md` is satisfied or an approved specification amendment records the change.
2. Backend and frontend type checks, linting, automated tests, and production builds pass.
3. The focused Playwright journeys pass in an isolated environment.
4. Tenant-isolation, authorization, invitation privacy, CSRF/session/token, and immediate-revocation tests pass at the API boundary.
5. Concurrent acceptance/assignment/removal and domain-plus-history atomicity have deterministic passing evidence.
6. Non-owner payload inspection finds no internal client note, unauthorized member email, inactive history, delivery state, or private invitation detail.
7. Passwords, sessions, one-time tokens, cookies, CSRF values, and provider failures are handled without secret or account-existence leakage.
8. Required manual responsive, accessibility, email, stale-access, and browser-cookie checks pass in the available environment.
9. CI passes all required checks without live provider credentials and contains no deployment step for this slice.
10. Documentation and environment examples are accurate, safe, and sufficient for another developer to run and validate the feature.
11. The implementation has been reviewed against `mission.md`, `tech-stack.md`, `roadmap.md`, and this approved specification, with no later-slice behavior or excluded infrastructure added.

## Implementation and Local Acceptance Evidence — 2026-09-07

The Slice 1.1 implementation includes the account/session boundary, verification and recovery lifecycles, workspace/client/project setup, invitation and access transitions, role-specific server projections, immutable access activity, transactional-email abstraction, authenticated frontend shell, `Your work`, owner setup/access surfaces, confirmation behavior, and the focused browser journeys.

Evidence recorded from the current working tree:

- Backend type check, lint, and production build pass.
- Frontend type check, lint, and production build pass.
- All 50 backend tests pass across five files. The isolated replica-set API suite covers fixed sessions/cookies, CSRF/origin rejection, neutral and concurrent signup, email/network throttling, verification/reset replacement and expiry, logout and reset revocation, tenant isolation, role-specific field projection, invitation privacy/lifecycle, immediate revocation, one-effective-role races, client deletion/project creation races, retained access periods, required-history rollback, automatic expiry, and provider-failure non-rollback behavior.
- All 17 frontend tests pass across three files. The focused Slice 1.1 behavior tests cover the verification-only gate, neutral signup guidance, client work projection, owner active/inactive administration, guarded leave behavior, and dialog focus entry/return, focus trapping, and Escape cancellation.
- All three Playwright journeys pass using an isolated MongoDB replica set and the non-production-only deterministic email-link mechanism. They cover provider setup, a mobile Client Approver signup/verification/acceptance flow, two-project isolation, service assignment/unassignment/removal in the same browser sessions, invitation privacy for signed-out and mismatched accounts, retained role/access history, role-authority change, and voluntary leave.
- Production-like cookie assertions verify `HttpOnly`, host-only, `SameSite=Lax`, `/api` scope, fixed seven-day server alignment, opaque/non-returned session tokens, and `Secure` outside local HTTP modes.
- Role-specific payload assertions verify that client users receive only the associated client name, assigned service members receive only the approved client name/company/contact fields, non-owners receive no member emails or inactive/delivery history, and internal notes do not enter project/activity payloads.
- Raw invitation tokens are redacted from application request diagnostics. Tracked-file and ignored-artifact inspection found no committed environment file, Playwright trace/report, database artifact, or reusable token. Tests and builds use neither Atlas nor live Gmail.
- GitHub Actions now runs independent frontend/backend typecheck, lint, test, and build jobs plus the three isolated Playwright journeys; it contains no deployment step.
- `README.md` and the environment examples document the two independent applications, validated origins/session configuration, Gmail App Password mode, isolated email-link mechanism, and exact Playwright commands.

### Environment-only acceptance still requiring authorization

- Live Gmail SMTP delivery was not attempted. The local backend environment is intentionally configured with `EMAIL_DELIVERY_MODE=local`; changing it and sending external messages requires explicit approval for the Gmail test environment and recipients. The adapter construction, fail-closed production configuration, deterministic provider behavior, provider exception handling, delivery-state persistence, and non-rollback warnings all pass locally.
- Hosted GitHub Actions cannot validate uncommitted local changes. The complete equivalent command set passes locally and the workflow is configured; the hosted result must be confirmed after the changes are committed and pushed through the normal repository workflow.

Accordingly, the implementation and locally available acceptance checks are complete, but the merge gate and authorization to begin Slice 1.2 remain open until the approved live-email check and hosted CI result are recorded or the specification owner approves those environment-specific substitutions.
