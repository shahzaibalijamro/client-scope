# UI Navigation Redesign Implementation Plan

**Status:** Approved — 2026-09-14

## 1. Amend the roadmap and lock the slice boundary

1. Replace Slice 3.2 with the approved UI Navigation Redesign outcome and move the former portfolio release and presentation outcomes intact to Slice 3.3.
2. Keep Slice 3.2 marked incomplete until implementation and validation evidence satisfy this specification.
3. Confirm the implementation diff contains no demo accounts, reset automation, portfolio media, publishing work, or domain-policy changes.

## 2. Establish routes, contracts, and the UI foundation

1. Add the canonical project and workspace-administration routes, including safe default-section resolution, invalid-section handling, and browser-history behavior.
2. Add the privacy-safe `updatedAt` field to the backend work-summary projection and frontend response schema.
3. Define light-theme design tokens for indigo/slate and semantic states, typography, spacing, borders, radii, elevation, focus, motion, and responsive breakpoints.
4. Build accessible internal primitives for controls, fields, navigation, cards, tables, modal dialogs/drawers, disclosures, notices, toasts, loading states, and empty states.
5. Add the lightweight icon dependency and require visible labels or accessible names for every icon action.

## 3. Build the responsive application shell

1. Replace the current topbar-only layout with the role-aware desktop sidebar and mobile drawer while retaining clear account/profile/sign-out controls.
2. Persist desktop collapse preference locally with a safe expanded fallback and no server-side preference model.
3. Implement focus movement on route changes, active-destination semantics, skip navigation, responsive drawer behavior, and reduced-motion handling.
4. Add the global keyboard-accessible project switcher over the current accessible-work response, including loading, no-results, stale-data, and focus-restoration behavior.
5. Add the layered feedback system and wire accessible temporary success/information toasts without converting persistent failures into transient feedback.

## 4. Replace My Work with the unified project directory

1. Flatten accessible workspace groups into one presentation model without losing workspace, client, lifecycle, role, pending-action, deadline, or recency context.
2. Implement bounded plain-text search and the approved workspace, lifecycle, role, pending-action, and deadline filters.
3. Implement deterministic attention-first ordering and explicit attention, deadline, recency, and name sorts.
4. Synchronize validated directory state with URL query parameters and support reset, refresh, Back/Forward, and bookmarks.
5. Render the same result set as a semantic desktop table and dedicated mobile cards, with concise badges and direct project links.
6. Distinguish loading, no accessible projects, no filter matches, and recoverable request failures.

## 5. Recompose project navigation and Overview

1. Create the seven-section project shell and preserve safe project loading and authorization behavior on every direct route.
2. Build the action-first Overview from existing authorized summaries and bounded section data: lifecycle, pending decisions, next action, milestone progress, latest deliverable, and recent activity.
3. Link Overview summaries to their canonical sections without duplicating authoritative workflow state.
4. Move each existing workflow panel into Scope, Changes, Milestones, and Deliverables while preserving current forms, mutations, concurrency, confirmation, and role behavior.
5. Present significant project history in Activity and regroup members, export, completion/archive, and leave controls under role-aware Settings.
6. Apply the approved disclosure defaults to forms, historical versions, resolved discussions, and archived items.

## 6. Recompose Workspace Admin

1. Replace in-memory two-tab administration with direct Clients, Projects, People & Access, and Invitations routes.
2. Keep searchable/scannable resource lists primary and move create, edit, invite, assign, remove, and related mutations into accessible dialogs or responsive drawers.
3. Preserve current owner-only API enforcement, projections, confirmations, invitation behavior, and post-mutation invalidation.
4. Add safe direct-route failures and prevent stale client data from displaying unauthorized administration content.

## 7. Redesign all remaining frontend surfaces

1. Apply the shared visual system and concise content rules to sign-in, registration, verification, password recovery/reset, invitation acceptance, profile editing, health/status, and unavailable states.
2. Standardize loading, skeleton, empty, validation, warning, failure, success, confirmation, and destructive-action presentation across every workflow.
3. Add a shared dirty-form/navigation guard to applicable forms and modal mutations, covering internal links, sidebar navigation, project switching, sign-out, refresh, and window closure.
4. Audit and remove obsolete styles and duplicated presentation patterns only after all consumers use the replacement primitives.

## 8. Verify and hand off

1. Add focused backend and frontend contract tests for `updatedAt`, route parsing, directory rules, role-aware destinations, and safe failures.
2. Add component tests for filters, responsive variants, disclosures, dialogs/drawers, toasts, focus restoration, project switching, and dirty-navigation confirmation.
3. Update existing UI and end-to-end tests to use durable routes while retaining all prior workflow assertions.
4. Run the compact critical navigation journey in Chromium, Firefox, and WebKit and run all existing slice regressions.
5. Run frontend/backend lint, type checks, tests, production builds, Docker builds, backend-container smoke validation, and diff hygiene checks.
6. Complete the manual responsive/accessibility/browser checklist and record safe evidence in `validation.md`.
7. Review the implementation against every acceptance criterion, obtain product-owner acceptance, and only then mark Slice 3.2 complete in the roadmap.
