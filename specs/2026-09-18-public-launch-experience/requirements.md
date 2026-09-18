# Public Launch Experience Requirements

**Status:** Approved — 2026-09-18

## Outcome and scope

Slice 3.4 gives an unauthenticated prospective user or hiring evaluator a durable public entry to ClientScope before authentication. The launch experience explains the client-agreement problem, the product workflow, its trust model, and its portfolio-scale limits; provides deliberate paths into the shared demo, personal registration, and returning-user sign-in; and presents every existing transactional email through one professional ClientScope system with equivalent HTML and plain-text output.

The slice includes:

- A responsive, accessible public homepage at `/` aimed first at freelancers and small service teams, with engineering evidence supporting trust and portfolio evaluation.
- A visually striking but recognizably ClientScope light-theme presentation with a focused hero, workflow explanation, three-image product story, trust and engineering section, limitations disclosure, calls to action, and footer.
- Durable `/sign-in`, `/sign-up`, and `/forgot-password` routes while retaining `/verify` and `/reset-password` for token actions.
- An `Explore demo` path to `/sign-in?intent=demo` that foregrounds the two existing demo roles without automatically authenticating a visitor.
- Route-specific SEO and sharing metadata, canonical link behavior, and a dedicated branded social-sharing card.
- A provider-neutral transactional-email presentation that renders responsive multipart HTML and equivalent plain text for every existing email category.
- Refresh of affected portfolio media and completion of the Slice 3.3 walkthrough and acceptance evidence after the accepted Slice 3.4 deployment.

The slice excludes:

- New project workflows, roles, permissions, notification categories, preference controls, analytics, tracking, billing, integrations, or marketing-content administration.
- Changes to approval authority, tenant or project access, workflow state machines, transaction boundaries, activity history, demo reset, quotas, provider-failure behavior, or post-commit notification semantics.
- Automatic demo authentication, anonymous access to project data, or publication of ordinary-user credentials.
- A CMS, blog, pricing system, contact form, mailing list, localization, dark theme, or a general redesign of authenticated project screens.
- Tracking pixels, email-open telemetry, click tracking, remote scripts, embedded private assets, or storage of public-media binaries in Git.

## Decisions and business rules

### Public homepage and content hierarchy

1. `/` is the canonical unauthenticated product homepage. It addresses prospective freelancers and small service teams first; hiring evaluators receive supporting architecture, testing, delivery, source, and limitation context without displacing the product story.
2. The page uses the existing ClientScope typography, light palette, controls, focus language, and design tokens as its foundation. It may add public-page composition, decorative layers, carefully cropped product media, and restrained motion, but must look like the same product rather than a separate template.
3. The page order is: accessible header/navigation, product promise and primary action, problem/audience context, client-agreement workflow, three-image product story, trust and human-authority model, engineering evidence and limitations, final action, and footer. Content remains concise enough that the demo, registration, and sign-in paths are apparent without reading every section.
4. `Explore demo` is the sole primary call to action in the hero and opens `/sign-in?intent=demo`. `Create account` and `Sign in` remain visible secondary actions. Repeated calls to action must retain the same hierarchy and destinations.
5. The product story uses the approved `agreed-scope`, `formal-changes`, and `deliverable-review` assets from `portfolio/media-manifest.json`. They load from their stable public HTTPS locations, retain meaningful alternative text, and do not become private application attachments or repository binaries.
6. The trust content accurately explains explicit human approvals, preserved decisions, contextual access, private-by-default project data, and AI assistance that remains human-governed. It does not claim legal evidence, formal compliance, enterprise availability, or unsupported scale.
7. A compact lower-page trust/engineering section clearly states that the public demo is shared and resettable, managed-service/free-tier availability is acceptable, and the release is portfolio/demo scale rather than enterprise infrastructure.
8. `View source` is a secondary external link to `https://github.com/shahzaibalijamro/client-scope` in the engineering section and footer. External-link behavior and accessible naming are consistent; the link never visually competes with `Explore demo`.
9. Decorative content must not create horizontal overflow, obscure text, reduce contrast, trap focus, or convey required information only through motion or imagery. Motion respects `prefers-reduced-motion` and the page remains complete when animations or remote images do not load.

### Public navigation and authentication routes

1. `/sign-in`, `/sign-up`, and `/forgot-password` are durable, directly loadable, refresh-safe public routes with route-appropriate headings, form behavior, browser history, metadata, and links among them.
2. Existing `/verify` and `/reset-password` routes remain the only token-action destinations. Token values remain in the minimum location required by the existing flow and must not enter analytics, social metadata, logs, page copy, or unrelated links.
3. `/sign-in?intent=demo` is a presentation intent, not authority. When demo status is ready it foregrounds the existing Workspace Owner and Client Approver choices, explains that changes are temporary, and requires an explicit visitor action before authentication. The ordinary sign-in form and links to registration and recovery remain available.
4. Missing, unsupported, or repeated `intent` values fall back to ordinary sign-in without an error or unsafe redirect. No query parameter may select a return URL, user, workspace, project, or credential.
5. Loading, disabled, malformed, reset-in-progress, and unavailable demo responses receive distinct, accessible feedback. Disabled or failed demo state exposes no credentials and never blocks ordinary sign-in, registration, or recovery.
6. An authenticated user who opens `/`, `/sign-in`, `/sign-up`, or `/forgot-password` is replaced or redirected to `/work` without rendering an actionable auth form. `/verify` and `/reset-password` continue to follow their existing token and session rules rather than being generalized as auth-entry routes.
7. Successful ordinary sign-in, signup verification, password recovery, demo sign-in, sign-out, and session-expiry behavior preserves the existing security, cookie, CSRF, throttling, and redirect rules except for the approved durable entry routes.
8. Public navigation uses ordinary same-origin links so new tabs, copied URLs, refresh, browser back/forward, and no-client-navigation fallback behave coherently. Error and not-found states provide a safe route to the homepage or sign-in without reflecting untrusted URL content.

### Metadata, sharing, and public assets

1. The homepage has a unique title, description, canonical URL, Open Graph fields, and social-card fields that describe ClientScope accurately for public sharing. Auth and token routes use distinct non-promotional titles and descriptions and are not canonicalized to the homepage.
2. Canonical and social URLs are derived from a validated deployment origin, never from an untrusted request host. Production requires the public origin; local and test environments use explicit safe configuration.
3. A dedicated branded social card presents the ClientScope name and product promise with restrained product imagery. It contains no credential, private data, time-sensitive demo status, unsupported claim, or signed/expiring asset URL and remains readable at common preview crops.
4. Public metadata, icons, manifest data, and social images are available without authentication, contain no tracking mechanism, and fail without exposing server configuration or stack diagnostics.
5. The homepage references only the three approved public screenshots. A missing image preserves its surrounding explanation and alternative access to the demo.

### Transactional-email presentation

1. The email boundary accepts a provider-neutral rendered message containing category, recipient, subject, HTML body, and plain-text body. Nodemailer/Gmail remains an adapter; domain services do not construct provider-specific MIME or template syntax.
2. One reusable ClientScope frame supplies preheader, wordmark/name, semantic heading, concise context, optional primary action, visible raw-link fallback when an action URL exists, relevant expiry or ignore guidance, and a restrained footer. Templates may vary event copy but not security or visual rules.
3. Multipart HTML and plain text are rendered for all existing categories: `verification`, `password-reset`, `duplicate-signup`, `invitation`, `assignment`, `role-change`, `access-removal`, `scope-review`, `scope-result`, `deliverable-review`, `deliverable-result`, `completion-review`, and `completion-result`.
4. Verification and password-reset emails link to their exact token action. Invitations link to the existing invitation acceptance action. Review and result notifications link to the relevant authorized project section when the existing event has a safe stable entity destination. Assignment and generic account/access notices link to `/work` or `/sign-in` as appropriate. Access-removal email must not deep-link to data the recipient can no longer access.
5. Every URL is built from the validated frontend origin plus an allow-listed application-relative path. User-controlled text cannot set a scheme, host, raw HTML, CSS, header, or redirect destination. HTTPS is required outside explicit local/test environments.
6. HTML escapes every user-controlled value in text and attributes. Plain text preserves readable structure and full action URLs without HTML entities or markup. Project names, display names, roles, subjects, and other context remain inert data even when they contain markup, Unicode, bidirectional characters, long text, or line breaks.
7. Emails contain only the minimum context already approved for their event. They exclude comments, decision reasons, requirement/deliverable bodies, prompts, filenames, attachment or signed URLs, provider identifiers, reset secrets, quota state, other members, raw diagnostics, and private workflow content.
8. Token-email guidance states the applicable existing expiry behavior and how to ignore an unrequested action. Non-token actions explain that authorization is checked after opening the application and avoid implying that possession of the email grants authority.
9. HTML email uses conservative, responsive markup and inline-compatible styling; remains understandable with images, CSS, or buttons disabled; has logical reading order and sufficient contrast; and uses text rather than an image as the sole product identity or action label.
10. No email contains tracking pixels, remote scripts, forms, autoplay, invisible telemetry, or third-party marketing resources. Product screenshots and social assets are not embedded into transactional email.
11. Rendering failure before dispatch fails as the existing notification failure would fail. SMTP failure remains recoverable and post-commit according to the originating feature specification; presentation work cannot move email before an authoritative transaction or roll back committed domain state.
12. Development/test capture retains both bodies for assertions without logging tokens or sensitive content. Production logs expose only the existing safe delivery outcome and category context.

### Portfolio completion and compatibility

1. Slice 3.4 changes public and email presentation only. Existing REST contracts may add only the minimum safe data needed to construct approved links; they must not expose new project content, provider metadata, or authorization state to anonymous callers.
2. Existing public-demo credentials continue to originate only from the demo-status response when demo mode is valid and enabled. They are not embedded in homepage HTML, build-time public variables, metadata, the social card, or ordinary-mode bundles.
3. After the accepted deployment, affected screenshots and documentation are reviewed for accuracy. The three-to-five-minute walkthrough is recorded against that deployment, privacy-reviewed, published in the dedicated public portfolio folder, and added to the media manifest with its duration and source revision.
4. Slice 3.3 may be marked complete only after its deferred walkthrough, final link/media review, and product-owner acceptance pass against the matching Slice 3.4 revision. Slice 3.4 validation does not waive any Slice 3.3 gate.

## Roles and permissions

- **Public visitor:** may read the homepage, public metadata, social assets, approved screenshots, demo availability, and intentionally published demo guidance. They receive no project data or ordinary credentials.
- **Prospective ordinary user:** may open signup, verification, sign-in, recovery, and reset flows under existing identity rules; public presentation grants no additional account or workspace authority.
- **Demo visitor:** may deliberately choose one existing canonical demo identity on the demo-focused sign-in page. The choice does not authenticate until the existing sign-in operation succeeds.
- **Authenticated user:** is redirected from public/auth-entry surfaces to `/work` and retains only membership-derived application authority.
- **Email recipient:** receives the minimum event context and a navigation link. The email is not proof of current membership; every destination enforces current backend authentication and authorization.
- **Repository maintainer:** configures the validated public frontend origin, sender identity, and deployment assets without committing credentials or environment-specific secrets.

## States

- **Public entry:** loading session, anonymous homepage, authenticated redirect, public error, or not found.
- **Authentication entry:** ordinary, demo-intent loading, demo ready, demo disabled, demo unavailable/malformed, submitting, failed safely, or authenticated redirect.
- **Public media:** loading, available, unavailable with text fallback, or rejected during acceptance review.
- **Email render:** input validated, rendered multipart, dispatched, delivered/accepted by provider, or failed recoverably.
- **Portfolio evidence:** planned, refreshed, privacy-reviewed, published, link-verified, and accepted.

## Validation and failure behavior

1. Public-origin configuration rejects missing production values, credentials, fragments, paths where an origin is required, and non-HTTP(S) schemes. It cannot be overridden by request headers.
2. Authentication routes reject malformed form input through existing validation and never reveal account existence beyond existing approved behavior. Demo-intent failures degrade to ordinary authentication.
3. Redirects are same-origin and fixed by application policy. No public query string or email field becomes an open redirect.
4. Metadata and social assets contain stable, non-sensitive content and remain correct with JavaScript disabled. Token and credential values never enter generated metadata or referrer destinations.
5. Email rendering validates the category and required template data before dispatch. Missing or unsafe link inputs fail closed; there is no fallback that concatenates unvalidated URLs or emits raw markup.
6. Long, empty, hostile, Unicode, and markup-like user values remain escaped, bounded by the existing domain limits, and readable in HTML and text without header injection or layout-breaking output.
7. HTML/plain-text equivalence means both variants identify ClientScope, state the same event and safe minimum context, provide the same actionable destination where applicable, and include equivalent expiry/ignore guidance. Exact visual parity is not required.
8. Link destinations that require authentication may lead through sign-in, but authentication must return only to a validated, allow-listed application path and must still enforce current authorization.
9. Remote screenshot failure, demo-provider degradation, email-client CSS stripping, or SMTP failure must not weaken application state, privacy, or access control.
10. Accessibility review covers semantic landmarks/headings, skip navigation, focus order and visibility, link purpose, form labels/errors, status announcements, contrast, zoom, reduced motion, and keyboard-only use.

## Acceptance criteria

1. A clean unauthenticated visit to `/` explains the product, intended users, workflow, trust model, engineering quality, and portfolio limitations and offers demo, registration, and sign-in paths with the approved hierarchy.
2. The homepage is polished and recognizably consistent with the authenticated application at 320, 390, 768, 1024, and 1440 pixel widths without core overflow, obscured content, inaccessible motion, or image-dependent meaning.
3. The agreed-scope, formal-changes, and deliverable-review screenshots appear as an accessible three-part story from the approved manifest; failure of one asset leaves useful content and navigation intact.
4. `/sign-in`, `/sign-up`, and `/forgot-password` are durable and history-safe; `/verify` and `/reset-password` retain their token behavior.
5. `Explore demo` opens `/sign-in?intent=demo`, foregrounds both canonical roles when available, never auto-authenticates, and preserves ordinary auth options through every demo status.
6. Authenticated access to `/` and the three auth-entry routes goes to `/work` without presenting an active public auth form.
7. Homepage/auth metadata, canonical URLs, sharing fields, icons, branded social card, external-source link, and safe error states validate from a clean unauthenticated session.
8. Each of the 13 email categories renders safe responsive HTML and equivalent plain text with correct minimum content, link policy, raw-link fallback, and applicable guidance.
9. Injection, open-redirect, secret-leak, private-content, token-leak, tracking, and unsafe-URL tests pass for public pages, metadata, assets, and email rendering.
10. Existing authorization, tenant isolation, workflow, history, versioning, attachment, AI, export, completion, archival, demo reset/quota, transaction, and provider-failure suites remain green.
11. Production builds, lint, type checks, automated tests, container verification, and critical Chromium/Firefox/WebKit journeys pass; controlled Gmail checks confirm representative desktop, mobile, dark-mode, image-blocked, and plain-text rendering.
12. The accepted deployment is manually reviewed for responsive, keyboard, screen-reader, contrast, reduced-motion, link, privacy, and cross-browser behavior with no unresolved release blocker.
13. The final walkthrough and affected portfolio evidence match the accepted Slice 3.4 source revision, contain no sensitive data, load publicly, and satisfy the deferred Slice 3.3 completion gate.

