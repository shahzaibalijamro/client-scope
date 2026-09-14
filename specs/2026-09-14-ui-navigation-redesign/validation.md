# UI Navigation Redesign Validation

**Status:** Pending implementation

## Highest-risk behavior

- Direct routes, the sidebar, directory, and global switcher must never enumerate or expose inaccessible workspaces, projects, client data, drafts, members, attachments, AI-working data, or history.
- Moving existing workflows into new sections and dialogs must not change approval authority, valid transitions, concurrency, immutable history, attachment protection, export authorization, or transactional behavior.
- Dirty forms must not lose user input silently, while successful saves and deliberate resets must not produce false warnings.
- Browser navigation, URL filters, modal focus, disclosures, and mobile navigation must remain keyboard and screen-reader usable.
- The unified directory's attention and deadline rules must be deterministic and must not misrepresent completed or archived work as overdue.

## Automated checks

### Backend contract and authorization

1. Prove `/api/v1/work` emits a valid ISO `updatedAt` for every returned project and no other new field.
2. Verify role projections remain unchanged for Owner, Member, Participant, and Approver, including restricted client fields.
3. Re-run tenant-isolation and access-removal tests to prove stale sessions or direct identifiers cannot expose inaccessible resources.
4. Run all existing scope, change-control, milestone, deliverable, lifecycle, AI, attachment, export, identity, and invitation suites.

### Directory and route rules

1. Unit-test case-insensitive plain-text matching across project, client, and workspace names, including special characters and the 120-character bound.
2. Test each filter independently and in approved AND/OR combinations.
3. Test overdue, due-soon, later, and no-deadline categories at date boundaries; completed and archived projects never become overdue.
4. Test attention-first ordering, every explicit sort, missing optional values, and deterministic name tie-breaking.
5. Test query parsing, normalization, clearing, refresh restoration, and invalid/unknown parameter fallback.
6. Test canonical project/admin routes, default sections, invalid sections, safe inaccessible states, and Back/Forward behavior.

### Frontend behavior and accessibility

1. Test role-aware sidebar destinations and active-state semantics at desktop and mobile breakpoints.
2. Test sidebar preference fallback and persistence without making local storage a rendering or authorization dependency.
3. Test the global project switcher with keyboard and pointer input, accessible names, result restriction, empty state, selection, Escape, and focus restoration.
4. Test semantic desktop-table and mobile-card directory variants expose equivalent project information and destinations.
5. Test Overview next-action and summary links for representative provider, Participant, Approver, completed, and archived projects.
6. Test all seven project sections and four admin sections for loading, content, empty, forbidden, not-found, stale, and unexpected-failure states.
7. Test disclosure defaults and `aria-expanded`/relationship semantics for forms, history, discussions, and archives.
8. Test dialog/drawer focus entry, modal containment, Escape behavior where safe, close/cancel, validation, submission, failure, success, and focus return.
9. Test inline field errors, persistent contextual errors, toast announcement/dismissal/expiry, and simultaneous feedback ordering.
10. Test dirty detection, stay/discard choices, successful-save cleanup, explicit reset, sidebar links, project switching, sign-out, refresh, and window-close warnings.
11. Retain existing assertions for confirmations, stale revisions, email warnings, AI failure, upload behavior, approval actions, and safe errors.

### Repository checks

Run independently in `backend/` and `frontend/` as applicable:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Also run:

```text
cd frontend
npm run test:e2e

git diff --check
```

Build both production Dockerfiles with the established arguments and start the backend image against an isolated MongoDB-compatible test environment. Verify `/api/v1/health` returns the established healthy response. Do not publish images or invoke production deployment from pull-request validation.

## Critical cross-browser journeys

Run a compact Playwright project in Chromium, Firefox, and WebKit that proves:

1. Sign in and arrive at My Work.
2. Search, filter, sort, refresh, and use Back/Forward while the URL reproduces directory state.
3. Open an accessible project from the directory, use Overview links, and navigate all seven sections by direct URL.
4. Open the global switcher with the keyboard, find another accessible project, navigate, and restore focus appropriately.
5. Exercise one provider mutation and one client decision through the redesigned focused surfaces without changing established workflow results.
6. Trigger and cancel a dirty-navigation warning, then explicitly discard and navigate.
7. For an Owner, open each Workspace Admin section and one dialog/drawer; verify non-owner users cannot access administration.
8. Run at a narrow mobile viewport and assert no core horizontal overflow.

Existing slice-specific Playwright journeys remain required regressions and may stay Chromium-only when the compact cross-browser journey covers the shared navigation system.

## Manual checks

### Responsive and visual review

- Review representative widths around 320, 390, 768, 1024, and 1440 pixels.
- Verify desktop sidebar expansion/collapse, mobile drawer, tables/cards, dialogs/drawers, forms, action groups, long names, long descriptions, email addresses, errors, histories, and attachment/link labels.
- Confirm current/actionable content is immediately understandable while secondary forms and history no longer create an overwhelming initial page.
- Confirm indigo/slate and semantic colors meet contrast needs and state is never color-only.
- Confirm reduced-motion mode removes nonessential motion without hiding state changes.

### Keyboard and assistive technology

- Traverse every global and project destination using the keyboard only; verify skip navigation, visible focus, logical order, and no traps outside intentional modals.
- Verify sidebar/drawer and project-switcher announcements, active destinations, disclosure states, table/card equivalence, errors, toasts, pending states, and confirmations with a screen reader.
- Verify route changes announce or focus the new main heading and modal close returns focus to its trigger.
- Verify dirty-navigation confirmation is understandable and does not strand keyboard or assistive-technology users.

### Browser review

- Review the complete redesigned shell in current Chrome or Edge and Firefox on desktop.
- Review WebKit/Safari behavior through automated WebKit plus a real Safari check when available; document an approved limitation if real Safari hardware is unavailable.
- Verify browser refresh, Back/Forward, direct URLs, local sidebar preference, and before-unload warnings.

### Role and privacy review

- Inspect the same seeded project as Owner, Member, Participant, and Approver.
- Confirm each role sees only its authorized navigation, project data, settings groups, member details, private client fields, and workflow actions.
- Remove or demote access while another session is open, then navigate/refetch and verify safe loss of access.
- Inspect network responses and rendered markup for hidden unauthorized content or newly exposed private fields.

## Evidence

Record after implementation:

- Source commit and branch.
- Node.js, npm, operating-system, browser, and container-engine versions.
- Command results and test counts for every required repository check.
- Playwright engine results and the focused scenarios exercised.
- Backend-container image identifier and health-smoke result.
- Manual viewport, keyboard, screen-reader, browser, role, and privacy results.
- Safe screenshots or artifact paths only when they contain no credentials, signed URLs, private content, or provider diagnostics.
- Any approved exception, its owner, rationale, risk, and follow-up condition.

## Merge gate

Slice 3.2 is safe to merge only when:

1. Every acceptance criterion in `requirements.md` is satisfied or has an explicit product-owner exception.
2. Backend and frontend lint, type checks, tests, production builds, and existing workflow regressions pass.
3. Chromium, Firefox, and WebKit critical navigation journeys pass.
4. Both Docker images build and the isolated backend-container health smoke passes.
5. Authorization, tenant isolation, stale-access behavior, role projections, and the minimal `updatedAt` contract are verified.
6. Responsive, keyboard, focus, screen-reader, contrast, overflow, reduced-motion, and long-content reviews pass.
7. No existing workflow, history, approval, attachment, AI, export, email, or privacy guarantee has regressed.
8. Diff hygiene passes and no credential, private content, signed URL, or sensitive diagnostic is retained.
9. The implementation contains no Slice 3.3 demo or publishing work and no unrelated feature expansion.
10. Product-owner manual acceptance is recorded before the roadmap marks Slice 3.2 complete.
