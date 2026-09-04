# Slice 1.1: Identity, Workspaces, and Project Access Plan

This plan implements the approved behavior in `requirements.md`. Task groups are ordered so each leaves the repository coherent and keeps verification close to the behavior it proves. Any newly discovered product ambiguity must return to the requirements for approval instead of being silently encoded in implementation.

## 1. Prepare the Slice 1.1 application boundaries

1. Work on the dedicated Slice 1.1 feature branch and preserve the independent `frontend/` and `backend/` application boundaries.
2. Replace the Phase 0 status-only root experience with the minimum authenticated application shell while retaining a suitable public health path.
3. Add only dependencies needed by this slice, including a modern password hasher, secure random/token support through the platform, a focused cookie/session implementation, Resend behind an application boundary, and Playwright for the deliberately small end-to-end suite.
4. Extend validated server configuration for session/cookie behavior, frontend origin, token lifetimes, Resend, safe application URLs, and configurable throttling without requiring provider credentials for tests or builds.
5. Establish domain-oriented backend modules for identity, sessions, workspaces, clients, projects, access, invitations, activity, and email rather than concentrating business logic in route handlers.
6. Keep REST errors consistent with the existing envelope and add stable Slice 1.1 codes only where callers need distinct recovery behavior.

## 2. Establish persistence and transactional invariants

1. Add Mongoose models and indexes for users, sessions, one-time account tokens, workspaces, workspace memberships, clients, projects, project assignments, client project memberships, invitations, activity events, and any bounded throttling state required by the approved behavior.
2. Store normalized and display email forms deliberately; enforce normalized account uniqueness at the database boundary.
3. Model membership and assignment access periods so inactive history is preserved and later restoration creates a distinguishable grant.
4. Enforce or defensively verify the single-owner, same-workspace reference, one-active-effective-project-role, pending-invitation scope, token uniqueness, and active-session invariants.
5. Add transaction helpers so authority changes and required activity records commit together.
6. Represent automatic expiry without requiring a background worker; expiry must be enforced from authoritative timestamps and recorded safely when materialized.
7. Add focused model/index tests for uniqueness, lifecycle preservation, and concurrent-write behavior before exposing routes.

## 3. Implement identity validation and credential services

1. Implement shared backend validation for normalized email, display name, passwords, bounded names/text, optional descriptive email, and date-only values.
2. Hash passwords using the selected modern algorithm and centralize comparison so no route or log handles password details unnecessarily.
3. Implement high-entropy opaque token creation and non-recoverable storage for sessions, verification, password reset, invitation links, and CSRF contexts.
4. Add safe helpers for fixed expiry calculation, single-use redemption, replacement, revocation, and constant-time comparison where applicable.
5. Add configurable email/IP throttling without account lockout and with neutral public behavior.
6. Unit-test normalization, password boundaries including spaces, token expiry/replacement, date-only rules, and throttling decisions.

## 4. Implement browser sessions, CSRF, and authentication APIs

1. Add signup, sign-in, current-session inspection, current-session logout, and display-name update application services and REST endpoints.
2. Create an unverified fixed seven-day session after new signup and a fresh fixed seven-day session after valid sign-in.
3. Store only a non-recoverable session-token representation server-side and configure the opaque browser cookie with the approved production security attributes and local-development behavior.
4. Implement backend middleware that resolves the current session, rejects expired/revoked sessions, and distinguishes anonymous, unverified, verified, and authorized domain contexts.
5. Implement CSRF bootstrap/rotation and require valid CSRF plus trusted-origin evidence on every unsafe browser request, including pre-authentication forms.
6. Implement neutral duplicate-signup and invalid-credential behavior without allowing timing, validation, or error details to become an obvious account oracle.
7. Ensure logout revokes only the current session and clears stale/absent cookies safely.
8. Add Supertest coverage for cookie attributes, fixed expiry, session rotation, CSRF/origin rejection, unverified gating, generic failures, throttling, and current-session logout.

## 5. Implement verification and password-reset lifecycles

1. Add verification issuance/resend and redemption with 24-hour single-use replacement tokens.
2. Add forgot-password issuance and password-reset redemption with one-hour single-use replacement tokens and neutral request responses.
3. Ensure verification changes only verification state and never creates a session or accepts an invitation.
4. Ensure password reset applies the password policy, does not verify the account, atomically changes the password and revokes all sessions, and leaves the reset browser signed out.
5. Add safe invalid/used/replaced/expired outcomes and recovery actions without account disclosure.
6. Add provider-stub integration tests for successful delivery, delivery failure, resend/replacement, reset-all-session revocation, and unverified-account reset.

## 6. Introduce the transactional email boundary

1. Define provider-neutral email commands and outcomes for verification, reset, duplicate-signup guidance, invitations, project assignment, client-role change, and access removal.
2. Implement the Resend adapter behind that interface and a deterministic fake adapter for automated tests.
3. Build minimal privacy-reviewed templates that include only approved context and return users to the same-origin frontend.
4. Dispatch domain notifications only after the authoritative transaction commits.
5. Persist invitation delivery state and surface its failure. For other access notifications, return a safe non-rollback warning to the acting owner.
6. Exclude raw provider errors, recipient lists, tokens, and template bodies from public errors and ordinary request diagnostics.

## 7. Implement workspaces and owner authorization

1. Add verified-user workspace creation with an atomic Workspace Owner record and owner-only activity event.
2. Implement the backend single-owner and owner self-removal/role-change protections even when endpoints are called directly.
3. Add owner-context authorization helpers that verify current ownership and workspace scope on every protected operation.
4. Add a limited active Service-Team Member workspace context that exposes only the workspace identity, current membership, and leave capability.
5. Prevent workspace rename, delete, transfer, second-owner, or service-member promotion behavior from appearing in API or UI.
6. Test multiple owned workspaces, duplicate names, cross-workspace identifier attacks, and owner invariant failures.

## 8. Implement client and project setup

1. Add owner-only client creation, full viewing, editing, listing, and guarded permanent deletion.
2. Enforce field visibility through dedicated authorized projections/serializers so internal notes and other owner-only data never enter non-owner responses.
3. Implement typed-name client deletion confirmation and atomically recheck the absence of every associated project before deleting and recording history.
4. Add owner-only project creation using a client from the same workspace, with plain-text description and date-only deadline validation.
5. Expose immutable project setup details to active project members and synthesize the implicit owner in active member results without creating a project-membership record.
6. Test client-note isolation, cross-workspace client references, past deadlines, immutable setup, duplicate names, and deletion races.

## 9. Implement invitations and onboarding continuation

1. Add owner-only issuance for workspace Service-Team Member invitations and project Client Participant/Approver invitations.
2. Model three-day lifecycle, intended normalized email, scope, role, inviter snapshot/context, hashed link token, status, replacement lineage, and delivery outcome.
3. Reject duplicate/conflicting active access before issuance and recheck it in the transactional acceptance path.
4. Implement revoke and replace/reissue; preserve the former invitation and invalidate its token.
5. Add a privacy-safe invitation resolver that returns no details to anonymous, mismatched, or unverified users and only the approved limited details to the verified email match.
6. Preserve a browser-local return target through signup, sign-in, and verification without treating that client state as authorization.
7. List all valid invitations matching a verified account on `Your work` and permit explicit acceptance without requiring the email link token.
8. Make acceptance atomic with membership/history creation and safe under concurrent acceptance, revocation, expiry, assignment, or reissue.
9. Route accepted workspace members to their limited workspace context and accepted client members to the newly accessible project.
10. Test expiry boundaries, single-use behavior, replacement, email-case matching, privacy before acceptance, stale links, and concurrent acceptance.

## 10. Implement service-team and client access transitions

1. Add owner-only service-team project assignment and individual project unassignment for active members of the same workspace.
2. Add owner removal of a Service-Team Member with atomic deactivation of all active project assignments.
3. Add confirmed voluntary workspace leave with the same cascading access effect and the correct actor/reason.
4. Add owner removal and confirmed voluntary project leave for active client members.
5. Add confirmed active Client Participant ↔ Approver role changes while preserving earlier role periods and actions.
6. Make restoration follow the approved path: owner assignment for an active Service-Team Member, otherwise a new invitation and explicit acceptance.
7. Re-evaluate effective access from current persisted state on every request so stale sessions and caches cannot preserve revoked access.
8. Emit the required owner-only and project-shared history events, including project-level cascade events for workspace removal/leave.
9. Send post-commit assignment, role-change, and removal email and surface delivery warnings without rolling back state.
10. Add concurrency and authorization tests for duplicate roles, project-specific unassignment, cascade removal, leaving, restoration, and stale access.

## 11. Build the authenticated frontend shell and account journeys

1. Add a responsive public/authenticated shell using the existing App Router and same-origin API boundary.
2. Implement signup, sign-in, verification-only, resend, forgot-password, reset-password, logout, and display-name-edit screens with React Hook Form, Zod, and TanStack Query.
3. Bootstrap CSRF safely and send it on unsafe requests without exposing session tokens to JavaScript.
4. Preserve invitation return context through authentication and verification while relying on the backend for all detail/acceptance decisions.
5. Render neutral account-discovery responses, safe token-expiry recovery, delivery warnings, validation errors, and throttled states.
6. Ensure unverified accounts cannot navigate into or prefetch protected application data.

## 12. Build `Your work`, workspace, client, and project surfaces

1. Implement `Your work` with valid invitations first, accessible projects grouped by workspace, and owned/joined workspaces even when empty.
2. Include enough workspace, client, project, role, and deadline context to distinguish multi-provider access without exposing private fields.
3. Add verified-user workspace creation and owner administration navigation without a global active-workspace requirement.
4. Add owner client create/list/detail/edit/delete flows, including typed-name deletion confirmation and blocked-deletion explanation.
5. Add owner project creation and immutable setup display.
6. Add project member display for every active member, including the implicit Workspace Owner, with emails visible only in owner management views.
7. Add safe empty, loading, stale/conflict, denied/not-found, and service-unavailable states.

## 13. Build access-management and invitation UI

1. Add owner views for active membership/assignments, pending invitations, delivery state, and prior expired/revoked/left/removed/replaced access records.
2. Offer only state-valid actions: invite, revoke, replace/reissue, assign, unassign, remove, restore through the approved path, and change an active client role.
3. Add explicit authority confirmation for Participant ↔ Approver changes.
4. Add explicit owner-removal, client-deletion, Leave workspace, and Leave project confirmations with correct scope, consequence, cancellation, and focus behavior.
5. Add the privacy-safe invitation landing and explicit `Accept invitation` action for a verified matching user.
6. Ensure non-owners see only active project member names/roles and never receive owner-only administrative data.
7. Refresh or invalidate relevant TanStack Query data after state changes so the UI promptly reflects authoritative access loss or gain.

## 14. Complete risk-based automated coverage

1. Add backend unit tests for credential/token rules, normalization, date/text validation, role resolution, invitation lifecycle, conflict detection, history audience, and transition invariants.
2. Add backend API integration tests using isolated MongoDB for authentication, CSRF, tenant isolation, field projection, access matrices, concurrency, atomic history, and provider-failure behavior.
3. Add frontend React Testing Library coverage for authentication states, verification gate, `Your work`, privacy-safe invitation states, confirmations, forms, administrative history, and access-denied refresh behavior.
4. Add the focused Playwright journeys defined by `validation.md`, using controlled test email/token access rather than live mailbox scraping.
5. Keep tests deterministic and independent of Atlas, live Resend, or external network access in normal CI.

## 15. Update documentation and execute acceptance validation

1. Update safe environment examples and README setup for session secrets, application origin, Resend configuration, local email testing, and the two independent applications.
2. Document seeded/local test-account guidance without committing credentials or reusable tokens.
3. Run frontend and backend type checking, linting, tests, and production builds.
4. Execute the focused Playwright suite and the manual responsive, accessibility, cookie, privacy, email, and revocation checks in `validation.md`.
5. Inspect browser network data, API output, server diagnostics, database records, and tracked files for secrets, token leakage, internal notes, or cross-tenant fields.
6. Record validation evidence and justified environment-specific substitutions in `validation.md` without recording credentials or sensitive diagnostics.
7. Review every implementation surface against `requirements.md`, the three constitution files, and the Slice 1.1 scope before requesting merge approval.
