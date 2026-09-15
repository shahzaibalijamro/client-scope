# UI Navigation Redesign Requirements

**Status:** Approved — 2026-09-14

## Outcome and scope

Slice 3.2 makes the complete ClientScope frontend easier to navigate, scan, and operate before portfolio publication. Users must be able to find a project without scrolling through workspace stacks, open a project or project section through a durable URL, understand what needs attention, and work within one focused area at a time.

The slice includes:

- A cohesive accessible light-theme SaaS visual system across every frontend surface.
- A responsive authenticated application shell with role-aware navigation and a global project switcher.
- A unified, searchable, sortable, and filterable My Work project directory.
- Direct project and workspace-administration routes with browser-history and bookmark support.
- A seven-section project information architecture: Overview, Scope, Changes, Milestones, Deliverables, Activity, and Settings.
- An action-first project Overview and progressive disclosure within dense workflow sections.
- Resource-oriented Workspace Admin sections for Clients, Projects, People & Access, and Invitations.
- Consistent loading, empty, failure, validation, confirmation, success, and unsaved-change behavior.
- A minimal privacy-safe work-summary contract addition for project recency.
- Responsive, accessibility, and evergreen-browser hardening of the redesigned surfaces.

The slice excludes:

- Changes to domain workflows, approval authority, lifecycle transitions, history, retention, attachment rules, AI behavior, or export contents.
- Server-side search, pagination, saved views, server-stored presentation preferences, auto-save, dark mode, or a full third-party component library.
- Demo accounts, demo seeding or reset automation, portfolio screenshots, portfolio narrative, recorded walkthrough, and production publishing. Those outcomes move to Slice 3.3.
- New product-management concepts such as tasks, assignees, priorities, boards, or reporting.

## Decisions and business rules

### Visual system and reusable primitives

1. The redesign uses a polished light theme with indigo as the primary accent, slate neutrals, and distinct accessible semantic colors for success, warning, danger, and information.
2. Density is comfortable-compact: record comparison and frequent actions are efficient, while headings and section boundaries retain enough space for a calm client-facing experience.
3. All existing frontend surfaces adopt the same tokens for typography, color, spacing, borders, radii, elevation, focus, and responsive behavior.
4. Reusable internal primitives cover at least buttons, icon buttons, links, inputs, selects, text areas, badges, cards, tables, dialogs, drawers, tabs or section navigation, disclosures, notices, toasts, skeleton/loading states, empty states, and pagination-free filter controls.
5. A lightweight icon library may be added. Icons supplement visible text or accessible names and never communicate authority, state, or outcome alone.
6. Interface copy is concise and action-oriented. Necessary secondary explanation moves to contextual help, disclosures, or confirmation dialogs rather than being permanently repeated.

### Routes and application shell

1. Authenticated screens use a role-aware app shell with an expanded desktop sidebar by default, a user-collapsible desktop state, and a modal mobile drawer.
2. Sidebar collapse preference may be stored locally in the browser. Absence, corruption, or blocked local storage falls back safely to the expanded desktop state and does not affect authorization.
3. The shell exposes My Work, Invitations, and Workspace Admin only where the current response data and backend authority make those destinations relevant. Hiding a destination is not an authorization control.
4. Account identity, profile editing, and sign-out remain distinct from workspace and project navigation.
5. A keyboard-accessible global project switcher searches only the projects already returned as accessible to the current user. It supports pointer and keyboard operation, clear empty results, focus restoration, and a discoverable shortcut.
6. Projects and their sections have durable routes. The canonical shape is `/projects/:projectId/:section`, where `section` is `overview`, `scope`, `changes`, `milestones`, `deliverables`, `activity`, or `settings`. `/projects/:projectId` redirects or resolves to `overview` without losing authorization failures.
7. Workspace Admin uses durable routes under `/workspaces/:workspaceId/admin/:section`, where `section` is `clients`, `projects`, `access`, or `invitations`.
8. My Work search, filters, and sort use URL query parameters. Unknown or invalid values are ignored or normalized to safe defaults without breaking the page.
9. Browser Back and Forward, refresh, bookmarks, and direct entry reproduce the same authorized destination and directory view.
10. A nonexistent or inaccessible workspace, project, or section uses the existing safe error semantics and must not reveal private resource existence.

### My Work directory

1. My Work presents every accessible active, completion-in-review, completed, and archived project in one unified directory rather than nested workspace cards.
2. Workspace name, client name, project name, lifecycle state, the current user's role, target deadline, pending-action summary, and recency are visible or available to the directory presentation.
3. Search is case-insensitive and matches project, client, and workspace names.
4. Filters cover workspace, lifecycle state, current role, whether an action is pending, and deadline status. Filters combine with AND semantics; multiple selected values within one category use OR semantics.
5. Deadline statuses are overdue, due soon, later, and no deadline. “Due soon” means today through the next 14 calendar days in the user's local date; completed and archived projects are not marked overdue.
6. The default order places projects requiring the signed-in user's action first, then projects with the nearest future deadline, then the most recently updated projects, with project name as the deterministic final tie-breaker.
7. Users may explicitly sort by attention, deadline, recent update, or project name. The selection is represented in the URL.
8. Clearing filters restores the default unfiltered attention-first view. A zero-result state distinguishes “no accessible projects” from “no projects match these filters.”
9. Desktop uses a compact semantic table; narrow layouts use purpose-built cards rather than a horizontally scrolling table. Both variants expose the same information and actions.
10. Filtering and sorting operate client-side over the bounded work response. This slice does not add server-side search or pagination.

### Project sections and progressive disclosure

1. Overview is the default section and summarizes lifecycle status, pending decisions, the next relevant action, milestone progress, latest deliverable, and recent activity. Each summary links to its source section.
2. Scope, Changes, Milestones, and Deliverables reuse the existing workflow capabilities without changing their state machines, concurrency tokens, validation, authority, or historical guarantees.
3. Activity provides the existing project-visible significant history in a focused chronological view.
4. Settings groups project members, project-record export, completion and archival controls, and leave-project controls. Each group and action is shown only when relevant to the current role and state; backend authorization remains authoritative.
5. Inside a selected section, current or pending state and essential actions are visible initially. Creation/edit forms, historical versions, resolved discussions, and archived records are closed until requested.
6. Disclosure controls use native or equivalent accessible expanded-state semantics. Content is not fetched or exposed to unauthorized users merely because it is visually collapsed.
7. Completion readiness and current lifecycle state remain visible from Overview even though completion and archival controls reside in Settings.
8. Navigating to a section containing no records shows a concise explanation and only the actions the current user may perform.

### Workspace administration

1. Workspace Owners can navigate directly among Clients, Projects, People & Access, and Invitations for an owned workspace.
2. Resource lists remain the primary content. Create client, create project, edit client, invite, assign, remove, and similar focused mutations open in accessible dialogs or drawers instead of permanently occupying the page.
3. Desktop dialogs may become full-height drawers or full-screen dialogs on narrow screens when needed to keep forms usable.
4. Existing owner-only permissions, project-assignment rules, client-access rules, invitation states, safe errors, and confirmations remain unchanged.
5. Non-owners cannot obtain workspace administration data or actions through direct URLs, stale client state, or manually constructed requests.

### Feedback, forms, and navigation safety

1. Field validation remains adjacent to its control and is announced accessibly.
2. Persistent page or section failures remain near the affected context with an appropriate recovery action where one exists.
3. Successful actions and non-blocking notices use an accessible temporary toast system. Toasts do not replace required confirmation, validation, or persistent failure content.
4. Destructive, irreversible, approval, rejection, archival, access-removal, and other existing confirmation boundaries remain explicit.
5. A dirty form warns before in-app navigation, project switching, sign-out, browser refresh, or tab/window closure. The user may remain or explicitly discard changes.
6. The warning applies only when values differ meaningfully from their loaded/default state and stops after a successful save, explicit reset, or discard.
7. Auto-save is not introduced. Existing optimistic-concurrency and stale-write behavior remains authoritative after the user elects to save.

### Data contract and preservation constraints

1. The work-summary project representation adds `updatedAt` as an ISO timestamp sourced from the project record. It contains no private notes, member data, provider identifiers, or hidden workflow content.
2. Existing work-summary role projections remain intact. In particular, client details restricted by role do not become visible through the directory or switcher.
3. UI summaries and counts are navigation aids, not new authoritative state. Section endpoints remain the source of workflow detail.
4. The redesign must not make previously private draft, AI-working, attachment, invitation, access, or activity information visible to another role.
5. Existing mutation endpoints and request bodies remain unchanged unless a narrowly necessary presentation contract is approved in this specification before implementation.

## Roles and permissions

- **Workspace Owner:** sees all accessible workspace projects, owner administration destinations, and every project action already granted by existing workflows.
- **Service-Team Member:** sees only assigned projects and provider actions already granted in each project state. They do not see owner administration or private client fields not already included in their projection.
- **Client Participant:** sees only explicitly assigned projects and participant-visible sections and actions. They may comment and provide feedback where already permitted but receive no approval controls.
- **Client Approver:** has participant visibility plus existing binding decision controls for the exact reviewable item or completion round.
- All roles may use My Work filters, direct authorized project URLs, the project switcher, accessible disclosures, and project export where the existing export specification permits it.
- Navigation visibility is computed from current accessible data and never substitutes for backend workspace, project, role, or state authorization.

## States

- **Application shell:** desktop expanded, desktop collapsed, or mobile drawer closed/open.
- **Directory:** loading, loaded, filtered, no accessible projects, no matches, recoverable failure, or stale/refetching.
- **Navigation destination:** loading, authorized content, empty content, safe not-found/inaccessible, forbidden action, or unexpected failure.
- **Disclosure:** expanded or collapsed; current actionable content follows the approved default rule.
- **Dialog/drawer:** closed, open/pristine, open/dirty, submitting, validation failure, request failure, or success/closed.
- **Toast:** queued, announced/visible, dismissed, or expired; persistent errors do not transition into toast-only state.
- **Dirty navigation:** clean, dirty, confirmation pending, stay, or discard-and-navigate.

These presentation states do not replace or modify any existing domain state machine.

## Validation and failure behavior

1. Route identifiers and query values are parsed and validated before use. Malformed values cannot cause unsafe requests or render crashes.
2. Search input is bounded to 120 characters and treated as plain text, never as a regular expression supplied directly by the user.
3. Directory dates use valid existing date-only values; invalid or absent values render as no deadline and never break sorting.
4. Missing or invalid `updatedAt` data fails contract validation during development/tests. The API always emits a valid ISO timestamp for persisted projects.
5. Loading transitions preserve layout where practical and communicate progress without blocking unrelated shell navigation.
6. Direct-route authorization failures use concise, non-enumerating messages and provide a safe route back to My Work.
7. Switcher and directory results update when accessible work is invalidated after invitation acceptance, membership removal, assignment changes, leaving, completion, archival, or restoration.
8. Focus moves to the new route's main heading after client-side navigation, enters dialogs/drawers when opened, remains trapped where modal, and returns to the invoking control when closed.
9. Mobile drawers and dialogs prevent background interaction and close predictably through an explicit control and Escape where safe.
10. Long names, descriptions, email addresses, status labels, errors, and translated browser-generated text wrap without core horizontal page scrolling at supported widths.
11. Reduced-motion preferences are respected; animation is never required to understand state.
12. Managed-service failures, offline/network failures, stale revisions, and safe email warnings retain their existing semantics and remain recoverable in the redesigned UI.

## Acceptance criteria

1. Every frontend route and state uses the approved light-theme system with consistent internal primitives and no remaining legacy page shell that materially conflicts with it.
2. An authenticated user can reach My Work, Invitations, relevant Workspace Admin, any accessible project, and any project section without scrolling through unrelated content.
3. Direct project and admin URLs, Back/Forward, refresh, and bookmarks restore the intended authorized destination.
4. The global switcher finds and opens only accessible projects using keyboard or pointer input.
5. My Work searches, filters, clears, and sorts correctly; its URL reproduces the view; desktop and mobile presentations remain equivalent.
6. Default attention ordering and deadline categories follow the specified deterministic rules.
7. Project Overview makes current state and next action clear and links summaries to the correct section.
8. Only one project section is primary at a time, with current/actionable content visible and secondary/history content progressively disclosed.
9. Workspace administration uses the four approved resource sections and focused mutation surfaces without weakening any existing owner-only rule.
10. Role projections and controls match existing backend permissions for Owner, Member, Participant, and Approver, including after access changes or stale navigation.
11. Dirty forms cannot be silently lost through supported in-app or browser navigation paths.
12. Validation, failures, confirmations, successes, loading, and empty states are understandable, keyboard-operable, and announced appropriately.
13. Existing domain/API regression suites pass, and the work-summary contract exposes only the approved `updatedAt` addition.
14. A critical navigation journey passes in Chromium, Firefox, and WebKit.
15. Manual responsive, keyboard, focus, screen-reader, contrast, overflow, long-content, and reduced-motion review finds no unresolved release-blocking defect.
16. Frontend and backend lint, type checks, automated tests, production builds, Docker builds, backend-container smoke validation, and diff/specification review pass before merge.
17. No demo/publishing implementation or unrelated product feature is included in the slice.
