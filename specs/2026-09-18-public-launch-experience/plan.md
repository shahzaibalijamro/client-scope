# Public Launch Experience Implementation Plan

**Status:** Approved — 2026-09-18

## 1. Define public contracts and configuration

1. Add a validated server-only public frontend origin for canonical metadata and email links; fail closed in production and keep local/test values explicit.
2. Define durable public-route behavior for `/`, `/sign-in`, `/sign-up`, `/forgot-password`, `/verify`, and `/reset-password`, including fixed authenticated redirects and the safe `intent=demo` presentation state.
3. Define route-specific title, description, canonical, Open Graph, social-card, icon, external-link, not-found, and error behavior without deriving trusted URLs from request headers.
4. Extend the provider-neutral email command/rendering contract to carry validated template data plus multipart HTML and plain text while preserving the existing category set and dispatch result.
5. Map every email category to its approved minimum context, safe destination, raw-link fallback, and expiry/ignore guidance; do not change domain-event timing or recipients.

## 2. Build the public visual foundation and homepage

1. Extract or extend shared ClientScope tokens and primitives needed by public/auth surfaces without restyling authenticated workflows or introducing a component library solely for this slice.
2. Build the accessible public header, footer, skip navigation, CTA hierarchy, responsive section layout, media treatment, error/fallback presentation, and reduced-motion behavior.
3. Implement the prospective-user-first homepage content in the approved order: promise, problem/audience, workflow, three-image story, trust/human authority, engineering/limitations, and final action.
4. Read the agreed-scope, formal-changes, and deliverable-review data from the versioned media manifest or a validated build-time projection; preserve stable public HTTPS URLs and approved alternative text.
5. Add the secondary GitHub source links and ensure external-link affordance, keyboard behavior, and accessible names are consistent.
6. Create the dedicated branded social card and public metadata assets with no credentials, private data, dynamic demo state, tracking, or unsupported claims.

## 3. Establish durable authentication entry

1. Separate the current local sign-in/signup/recovery modes into refresh-safe `/sign-in`, `/sign-up`, and `/forgot-password` pages while sharing form behavior and validation rather than duplicating security logic.
2. Preserve existing verification and reset-token pages and update all internal links and email destinations to the durable routes.
3. Implement fixed authenticated redirects from `/` and auth-entry routes to `/work` with coherent loading, browser history, back/forward, and session-expiry behavior.
4. Implement `/sign-in?intent=demo` as a safe view state that foregrounds explicit Owner/Approver selection, handles every demo status, and retains ordinary sign-in, signup, and recovery paths.
5. Ensure unsupported query values, remote status failures, and reset-in-progress states degrade safely without leaking credentials, creating an open redirect, or blocking ordinary authentication.
6. Add accessible auth-page headings, instructions, labels, errors, status announcements, focus handling, and links consistent with the public visual foundation.

## 4. Render and migrate transactional email

1. Create a pure provider-neutral renderer with a shared ClientScope frame, conservative responsive HTML, inline-compatible styling, preheader, semantic content, accessible action, raw-link fallback, guidance, and plain-text equivalent.
2. Implement typed templates for verification, password reset, duplicate signup, invitation, assignment, role change, access removal, scope review/result, deliverable review/result, and completion review/result.
3. Centralize escaping, control-character handling, safe subject/header values, frontend-origin URL construction, allow-listed paths, and local/test exceptions; reject unsafe or incomplete template input before dispatch.
4. Update identity, workspace, scope/change, deliverable, and lifecycle notification call sites to provide only their already approved minimum event context and safe stable identifiers.
5. Update the Gmail adapter to send both `html` and `text`; keep development capture deterministic and retain existing safe delivery/failure responses.
6. Prove presentation errors and SMTP failures cannot move notification dispatch before authoritative commits, roll back state, alter recipients, or reveal provider diagnostics.

## 5. Add automated safety and regression coverage

1. Unit-test route policy, authenticated redirects, demo-intent parsing, public-origin validation, canonical/social metadata, manifest projection, social-card content, and image-failure fallbacks.
2. Add frontend behavior coverage for homepage landmarks and CTA hierarchy, durable auth navigation/history, demo states, ordinary auth fallback, session redirects, keyboard/focus behavior, reduced motion, and error/not-found recovery.
3. Unit- and snapshot-test all 13 email categories in HTML and plain text, including equivalent meaning, correct safe destinations, raw-link fallback, guidance, escaping, long/Unicode values, and deterministic output.
4. Add negative security tests for markup/header injection, unsafe schemes/hosts, open redirects, token leakage, credential leakage, private-content inclusion, tracking resources, and request-host poisoning.
5. Retain and run all authorization, tenant isolation, workflow transition, transaction, provider-failure, quota, demo-reset, email, export, attachment, AI, and history regressions.
6. Add focused Playwright journeys for anonymous homepage-to-demo entry, registration/sign-in navigation, authenticated redirect, public error recovery, responsive layout, and metadata/link behavior across Chromium, Firefox, and WebKit.

## 6. Validate the release and complete portfolio evidence

1. Run backend and frontend type checks, lint, full tests, production builds, Docker builds, backend-container health smoke, critical browser journeys, secret scans, and the repository CI gate.
2. Review 320, 390, 768, 1024, and 1440 pixel layouts, current evergreen browsers, keyboard navigation, screen-reader output, contrast, zoom, overflow, image failure, reduced motion, and no-JavaScript metadata behavior.
3. Send controlled examples through live Gmail and review representative desktop, mobile, dark-mode, image-blocked, and plain-text clients without recording recipients, tokens, or private content.
4. Validate the public deployment, canonical/social metadata, social-card crops, GitHub and CTA links, three screenshot URLs, safe error states, and absence of credentials or private data from a clean session.
5. Refresh affected documentation and portfolio media, record the three-to-five-minute walkthrough against the accepted deployment, upload it to the isolated public portfolio folder, and update the manifest with duration and source revision.
6. Record commands, test counts, environment categories, deployed frontend revision, immutable backend image, safe artifact links, manual results, and product-owner acceptance in `validation.md`.
7. Review Slice 3.4 against these requirements and re-run the deferred Slice 3.3 gate; only then mark either roadmap item complete.

