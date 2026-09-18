# Public Launch Experience Validation

**Status:** Planned

## Highest-risk behavior

- Public routing and metadata must not leak tokens, demo credentials, private project content, server configuration, or untrusted request-host data.
- Authentication reorganization must preserve cookie, CSRF, throttling, verification, recovery, session-expiry, and fixed redirect guarantees without creating an open redirect.
- Demo-focused entry must remain an explicit presentation choice, never anonymous project access or automatic authentication, and must fail back to ordinary authentication safely.
- Email HTML must not introduce markup/header injection, unsafe URLs, tracking, private workflow content, or authority implied by possession of an email.
- Email presentation and SMTP failures must preserve every existing transaction and post-commit delivery boundary.
- Visual ambition must not regress accessibility, responsive behavior, performance, authenticated workflows, or the independence of core behavior from remote media.

## Automated checks

### Public routes, navigation, and authentication

- Verify anonymous `/` renders the public homepage and its required landmarks, content hierarchy, primary demo CTA, secondary registration/sign-in actions, trust disclosure, GitHub link, and final CTA.
- Verify authenticated requests to `/`, `/sign-in`, `/sign-up`, and `/forgot-password` go to `/work` without an actionable auth-form flash or redirect loop.
- Verify direct load, refresh, copied URL, new tab, back, and forward behavior for all public/auth routes and the retained verification/reset token routes.
- Verify `/sign-in?intent=demo` foregrounds both roles only after a valid ready response, requires an explicit action, and retains ordinary authentication paths.
- Cover demo loading, disabled, malformed, unavailable, resetting, and degraded states; prove no credential disclosure and no effect on ordinary auth.
- Fuzz absent, repeated, encoded, case-varied, and unsupported `intent` values and confirm safe ordinary sign-in with no reflected content or redirect influence.
- Re-run signup, verification, duplicate signup, sign-in throttling, sign-out, forgot-password, reset-password, session expiry/renewal, CSRF, and cookie integration suites.

### Homepage, metadata, and public assets

- Assert semantic landmark and heading order, skip-link target, descriptive link names, image alternative text, focus visibility, status announcements, and absence of keyboard traps.
- Exercise the homepage at 320, 390, 768, 1024, and 1440 pixel widths with 200% zoom, long text, remote-image failure, slow status loading, and reduced motion; reject core horizontal overflow or hidden actions.
- Validate the manifest projection selects only `agreed-scope`, `formal-changes`, and `deliverable-review`, preserves approved alt text, and rejects missing, duplicate, non-HTTPS, or malformed entries safely.
- Verify unique route titles/descriptions, homepage canonical URL, Open Graph/social fields, icons, robots behavior, and the branded social-card dimensions/content from rendered HTML without client JavaScript.
- Prove canonical/social URLs use configured origin rather than `Host`, `Forwarded`, or other request-controlled headers.
- Scan homepage HTML, metadata, social assets, bundles, source maps where generated, and network responses for credentials, tokens, real user data, signed URLs, provider keys, diagnostics, and tracking endpoints.
- Check all same-origin actions, external GitHub links, screenshot URLs, footer links, error recovery, and not-found recovery from a clean unauthenticated session.

### Transactional-email rendering

- Render all 13 categories in both HTML and plain text and assert deterministic subject, product identity, event description, minimum context, action policy, raw-link fallback, and applicable expiry/ignore guidance.
- Verify exact token actions for verification/reset, invitation acceptance, safe project-section links for review/results, `/work` or `/sign-in` for generic notices, and no inaccessible project deep link for access removal.
- Assert HTML and text convey equivalent event meaning and destination while allowing presentation-appropriate formatting.
- Test empty optional values and maximum allowed project/display/role text plus quotes, angle brackets, ampersands, CR/LF, tabs, emoji, combining text, right-to-left text, and bidi controls; require safe inert output and readable layout.
- Inject `javascript:`, `data:`, protocol-relative, credential-bearing, external-host, fragment, encoded traversal, and newline-bearing URL inputs; require rejection before dispatch.
- Attempt HTML, CSS, attribute, subject/header, raw-link, preheader, and plain-text injection through every user-controlled field.
- Assert no template contains comments, decision reasons, requirement/deliverable bodies, prompts, filenames, attachment URLs, signed URLs, provider identifiers, reset secrets, quota state, other members, diagnostics, pixels, scripts, forms, autoplay, or third-party resources.
- Verify HTML remains meaningful with images blocked and styles removed, action purpose is visible as text, reading order is logical, and colors/typography meet the approved accessibility checks.
- Inject renderer and SMTP failures before/after authoritative mutations and prove existing response warnings, committed state, activity history, recipient selection, retry behavior, and safe diagnostics remain unchanged.
- Verify development capture exposes both variants for tests without logging token-bearing bodies or changing production fail-closed Gmail configuration.

### Regression and delivery

- Run backend `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Run frontend `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Build both production Docker images and smoke the backend health endpoint against an isolated test database.
- Run the complete critical Playwright suite plus Slice 3.4 journeys in Chromium, Firefox, and WebKit.
- Re-run tenant isolation, contextual authorization, workflow transitions, version/history immutability, attachment privacy, AI confirmation/failure, export, completion/archival, demo reset/protection/quota, and notification transaction tests.
- Run committed-file/build-output scans for credentials, reset secrets, token URLs, SMTP/provider keys, MongoDB credentials, private asset identities, signed URLs, real addresses, and unsupported public claims.
- Verify GitHub Actions retains the required CI gate and that the accepted source maps to the Vercel deployment and exact private GHCR/Northflank backend image.

## Manual checks

### Anonymous and authentication journeys

1. Open `/` in a clean browser and confirm the problem, audience, agreement workflow, human-authority model, three product views, engineering evidence, honest limitations, and three entry choices are understandable without repository knowledge.
2. Follow `Explore demo`; confirm the demo-focused sign-in page explains the shared/resettable environment, foregrounds both roles, does not auto-authenticate, and allows ordinary sign-in, signup, and recovery.
3. Repeat while demo mode is disabled and while its status endpoint is unavailable; confirm no credential appears and ordinary authentication remains usable.
4. Complete ordinary signup/verification, sign-in, forgot/reset-password, sign-out, and both demo-role sign-ins; verify history and redirects are coherent.
5. While authenticated, open `/` and each auth-entry route directly and through browser history; confirm stable navigation to `/work` without loops or stale forms.
6. Open malformed and missing public URLs and verify branded, accessible recovery without reflected untrusted content or diagnostic leakage.

### Visual, accessibility, and browser review

- Review 320, 390, 768, 1024, and 1440 pixel presentations for composition, typography, cropping, whitespace, CTA hierarchy, focus visibility, long content, loading/error states, and horizontal overflow.
- Complete keyboard-only navigation and assess landmarks, headings, skip link, link purpose, form labels/instructions/errors, focus order/restoration, status announcements, and semantic reading order with a screen reader.
- Check normal/high contrast, 200% and 400% zoom/reflow where applicable, forced colors, reduced motion, disabled animation, slow connections, blocked images, and CSS failure tolerance.
- Review current Chrome, Edge, and Firefox manually and automated WebKit; record whether a real Safari check was available.
- Inspect page source, storage, requests, console, referrers, metadata previews, and public assets for tokens, credentials, private data, signed URLs, diagnostics, tracking, or mixed content.
- Preview the social card in representative wide and square crops; verify legibility, accurate claims, stable public access, and no time-sensitive demo data.

### Live email and portfolio review

- Send controlled examples covering identity/token, invitation/access, review, result, and removal templates through Gmail SMTP to approved test recipients.
- Review Gmail web and mobile plus an available dark-mode client, images-blocked mode, links-disabled/CSS-stripped behavior, and raw plain text. Confirm action clarity, visible URL fallback, contrast, wrapping, and no clipped content.
- Follow every representative action from a signed-out and unauthorized session; verify authentication and backend authorization, token expiry, ignore guidance, and safe inaccessible-state behavior.
- Confirm provider failure after each representative committed workflow produces the approved warning and never rolls back authoritative state.
- Review the deployed homepage and emails for unsupported legal, compliance, availability, scale, or security claims.
- Refresh affected portfolio material, record and watch the complete three-to-five-minute walkthrough on desktop and mobile, and verify synthetic data, pacing, readability, privacy, public access, source revision, and media-manifest accuracy.

## Evidence

Record after implementation without credentials, recipients, tokens, private content, signed URLs, or raw provider diagnostics:

- Branch, source commit, deployed frontend revision, full backend image tag/digest, and Northflank-selected image.
- Node.js/npm, operating system, browser engines, container engine, and local/CI/controlled-acceptance environment categories.
- Commands, exit results, test-file/test counts, build results, container smoke result, secret-scan result, and safe artifact references.
- Route/redirect matrix, demo-state matrix, viewport/browser/accessibility results, metadata/card validation, and link-check results.
- Per-category email render results, negative security matrix, HTML/plain-text equivalence result, and representative live-client results without message bodies or addresses.
- Authorization/workflow regression results and injected renderer/SMTP failure evidence demonstrating unchanged transaction semantics.
- Public homepage, GitHub, screenshot, social-card, and walkthrough links; media manifest revision; capture source commit; privacy review result.
- Product-owner acceptance and any explicit exception with owner, rationale, risk, and follow-up condition.

## Merge gate

Slice 3.4 is safe to merge and mark complete only when:

1. Every acceptance criterion in `requirements.md` passes or has an explicit product-owner exception.
2. Public origin, canonical metadata, redirects, demo intent, token privacy, URL allow-listing, escaping, and all 13 multipart templates have focused automated security coverage.
3. Existing authentication, authorization, tenant, workflow, history, attachment, AI, export, lifecycle, demo, quota, provider-failure, and transaction suites remain green.
4. Backend/frontend types, lint, full tests, production builds, both Docker builds, backend-container smoke, secret scans, and Chromium/Firefox/WebKit critical journeys pass.
5. Responsive, keyboard, screen-reader, contrast, zoom/reflow, reduced-motion, image-failure, metadata, social-card, link, privacy, and evergreen-browser reviews have no release-blocking defect.
6. Controlled Gmail checks prove safe readable multipart rendering and correct links without leaking private context or weakening post-commit failure behavior.
7. The accepted frontend and exact immutable backend image are deployed and traceable to the validated source revision.
8. Affected documentation and media are accurate, the final walkthrough is public and privacy-reviewed, and the manifest records its duration and source revision.
9. The deferred Slice 3.3 acceptance gate is re-run against the matching release; roadmap status changes occur only after product-owner acceptance is recorded.

