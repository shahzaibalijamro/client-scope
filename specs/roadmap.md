# ClientScope Roadmap

## Roadmap Intent

This roadmap defines the committed path to a portfolio-complete ClientScope release. It is outcome-based and intentionally contains no calendar estimates.

Delivery is organized as vertical slices. Each slice should add coherent user value across the frontend, Express API, authorization, persistence, validation, history, and automated tests where those concerns apply. Technical foundations may be introduced when a slice needs them, but isolated frontend-first, backend-first, or database-first phases are not the delivery model.

## Spec-Driven Development Governance

### Source of truth

The constitution defines enduring product, architecture, and delivery constraints. An approved feature specification defines the intended behavior of its slice. Implementation and tests must remain consistent with both.

### Required lifecycle for every meaningful slice

> Specification -> Review and approval -> Implementation -> Automated tests -> Acceptance validation -> Completion

Implementation must not begin while material product behavior remains ambiguous.

Before implementation, an approved feature specification must define at least:

- The user problem and desired outcome.
- In-scope and out-of-scope behavior.
- Relevant roles, membership contexts, and permissions.
- Acceptance criteria.
- Domain and business rules.
- Important state transitions.
- Validation and failure behavior.
- Data, versioning, and history implications where relevant.
- A risk-based test plan for critical behavior.

Feature specifications describe behavior and constraints. They should not dictate incidental implementation details unless a choice materially affects correctness or architecture.

If ambiguity or a required behavioral change is discovered during implementation, update and re-approve the specification before or alongside the code change. Do not silently turn implementation choices into product policy. Specifications must remain living sources of truth rather than stale documentation.

### Definition of done for a slice

A slice is complete only when:

- Its approved acceptance criteria are satisfied.
- The implementation matches its feature specification and this constitution.
- Critical automated tests pass at appropriate layers.
- Authorization, tenant isolation, validation, and domain rules are verified.
- Relevant history/version behavior is preserved.
- Failure behavior is safe and understandable.
- Required documentation is updated.
- Repository type checks, linting, tests, and builds pass.

## Committed Delivery Phases

All phases below are required for the portfolio-complete release. The order protects the core product from becoming dependent on AI and keeps each milestone demonstrably useful.

## Phase 0 — Repository and Delivery Foundation

**Status:** In Progress — reopened by the approved 2026-09-08 delivery amendment

Establish the cross-cutting foundation needed to deliver, verify, containerize, and safely deploy each vertical slice. The original repository foundation was completed before Slice 1.1; Phase 0 is reopened until the amended container and production-delivery outcomes are implemented and validated.

Outcomes:

- One Git repository contains independent `frontend/` and `backend/` applications plus `specs/`, without npm workspaces, shared packages, or additional monorepo tooling.
- The frontend and backend manage their own dependencies, scripts, and builds.
- The selected application, validation, database, and test tooling is operational.
- Environment and configuration boundaries support local development and the selected hosted services.
- Baseline error handling, validation, test commands, and GitHub Actions checks exist.
- Production-oriented `frontend/Dockerfile` and `backend/Dockerfile` artifacts are maintained and built by CI. The backend image is smoke-tested; the frontend image is a portability and local-infrastructure artifact rather than part of the Vercel deployment path.
- A root Compose configuration can run the frontend and backend together while MongoDB remains externally configured; Compose does not introduce a repository workspace, shared package, or bundled database.
- Pull requests and pushes to `main` run a stable required `CI gate` covering frontend and backend linting, type checking, tests, production builds, critical browser journeys, both Docker builds, and the backend-container smoke test.
- A successful `main` gate publishes only the private backend image `ghcr.io/<owner>/clientscope-backend:<full-github.sha>` and directs Northflank to deploy that exact immutable artifact without rebuilding it from the repository.
- Northflank keeps the last healthy backend release serving until the candidate is ready, and production automation verifies the selected image tag, rollout readiness, and public health endpoint. Newer eligible commits supersede older in-progress releases.
- Vercel builds the Next.js frontend natively and withholds production-domain promotion until the complete GitHub `CI gate` passes; no frontend image is published or used by Vercel.
- The live Vercel and Northflank production paths are configured and exercised without committing provider or registry credentials.
- A repeatable feature-specification and acceptance-validation workflow is documented.

This phase is not permission to build every technical layer in advance. Foundations should remain minimal and expand through later slices.

## Phase 1 — Complete Non-AI Client Lifecycle

Phase 1 proves that ClientScope is valuable without AI. AI integration must not block or substitute for any outcome in this phase.

### Slice 1.1 — Identity, workspaces, and project access

**Status:** Complete

Outcome: a provider can enter the product, establish a workspace, create a client and project, grant appropriate access, and see that backend-enforced membership boundaries work.

The slice establishes the global-user and multi-workspace membership model, the initial service-side and client-side authority levels, and the project context needed by all later workflows. It also introduces the transactional invitation capability and the minimum in-app view of accessible work.

### Slice 1.2 — Requirements and agreed scope

Outcome: a provider can structure project requirements, an authorized client can review them, and the resulting agreement is clear and historically preserved.

This slice establishes explicit review authority, client participation without implicit approval power, version-aware scope history, relevant comments, pending-action visibility, and decision-related email notifications.

### Slice 1.3 — Formal change control

Outcome: proposed additions or material changes to agreed scope can be represented and discussed as change requests, with authorized decisions incorporated into the project record without erasing the original agreement.

### Slice 1.4 — Client-facing milestones

Outcome: the provider can communicate meaningful project stages and progress to the client without introducing internal task management.

Milestones communicate client-facing progress only. Detailed tasks, assignees, priorities, backlogs, boards, and sprint workflows are not part of this slice.

### Slice 1.5 — Deliverables, feedback, and revisions

Outcome: a provider can submit work with supporting files, links, and notes; clients can review it; and new versions, feedback, revision requests, and approvals remain traceable.

This slice incorporates Cloudinary-backed attachments where the workflow needs them and preserves each meaningful deliverable version rather than overwriting prior review context.

### Slice 1.6 — Completion, history, and archival

Outcome: both sides can understand the significant story of the project, the provider can request final completion, an authorized client can approve it, and completed work becomes protected from ordinary modification while remaining available as a record.

Activity history should be created incrementally by earlier slices; this slice validates its coherence across the complete lifecycle and adds the final completion and normal archival outcomes. Any permanent-deletion behavior requires its own explicit specification and strong administrative safeguards.

### Phase 1 release gate

Phase 1 is complete only when the non-AI journey works end-to-end:

> Project and access setup -> requirements -> agreement -> milestones and execution visibility -> change control -> deliverable review -> revisions -> approval -> final completion -> preserved history.

The product must remain fully usable under normal workflows with Gemini disabled or unavailable. Critical tenant isolation, authorization, state, versioning, and history rules must be covered by automated tests.

## Phase 2 — Human-Governed AI Assistance

Add AI only on top of the working Phase 1 workflows. All three capabilities below are required:

### Slice 2.1 — Requirement structuring

Outcome: a provider can turn messy source input into reviewable draft requirements, with no AI-generated result entering the official project record without explicit human confirmation.

### Slice 2.2 — Requirement quality and ambiguity review

Outcome: a provider can request advisory feedback about vagueness, missing acceptance detail, conflicts, and clarification needs, then choose whether to apply, edit, or ignore the suggestions.

### Slice 2.3 — Client feedback summarization

Outcome: a provider can summarize accumulated client feedback into useful themes while original comments remain the source of truth.

### Phase 2 release gate

- Each AI action uses the Gemini service boundary and fails recoverably.
- Core manual behavior remains available during provider failure, disablement, or rate limiting.
- AI drafts and suggestions are clearly distinguishable from confirmed project data.
- No AI capability can make approval decisions, silently alter scope, replace original feedback, or autonomously create irreversible history.
- The minimum necessary project context is sent to the provider.
- Human-confirmation and AI-failure boundaries have automated coverage appropriate to their risk.

## Phase 3 — Portfolio Release and Presentation

Turn the complete product into a reliable, understandable portfolio artifact rather than adding unrelated features.

Required outcomes:

- Continued reliability and final hardening of the Phase 0 production path using Vercel, Northflank, private GHCR images, MongoDB Atlas, Cloudinary, Gmail SMTP through Nodemailer, and Gemini within free or effectively free demo constraints.
- A realistic seeded demo workspace that makes the product's value apparent without requiring a visitor to build a project from scratch.
- Demo data that exercises agreed requirements, change control, milestones, multiple deliverable versions, feedback, approvals, pending decisions, and activity history.
- Final verification of critical unit, API integration, UI behavior, and end-to-end tests.
- Passing GitHub Actions checks for types, lint, tests, application builds, container verification, and critical browser journeys, with the deployed backend traceable to its immutable commit image.
- Clear repository documentation covering the product, users, capabilities, local setup, environment variables, tests, architecture, and deployment.
- Retention of the constitution and approved feature specifications in the repository to demonstrate the development method.
- A concise architecture overview of frontend, API, database, authentication, file storage, email, and AI boundaries.
- Polished screenshots and a concise portfolio narrative covering features, technologies, engineering challenges, and learnings.
- A short recorded walkthrough centered on the product story: agreement, scope change, delivery revision, approval, and preserved history.
- Final responsive, accessibility, browser, privacy, and error-handling review at the project's stated quality level.

## Portfolio-Ready Completion Gate

ClientScope is complete only when all of the following are true:

- The complete non-AI client-project lifecycle is usable without placeholder core flows.
- The three committed AI-assisted workflows are implemented without weakening human authority or core independence.
- Project record export is implemented.
- Security, tenant isolation, critical workflow transitions, history, and versioning are verified.
- The live deployment and seeded demo are usable at portfolio/demo scale.
- CI, automated tests, builds, project documentation, architecture artifact, screenshots, portfolio description, and recorded walkthrough are complete.
- The implementation has been validated against the approved specifications.

No date or story-point estimate determines completion. Demonstrated outcomes and completion gates do.

## Future Possibilities — Not Committed

The items below are extension ideas only. They are not planned work, acceptance criteria, or justification for adding complexity to the committed architecture:

- Billing, subscriptions, invoicing, payments, or accounting.
- Third-party integrations with communication, project, design, or development tools.
- Rich notification preferences, notification centers, digests, push notifications, SMS, or messaging integrations.
- Lightweight task tooling or internal checklists if later evidence shows a core workflow need.
- Advanced reporting and analytics.
- White-label and deeply customizable client portals.
- Unanimous, ordered, quota-based, department-based, or otherwise sophisticated approval policies.
- Additional AI analysis, project-wide retrieval, automation, or agentic capabilities.
- Native mobile applications.
- Broader workflow automation, calendar scheduling, or real-time collaboration.
- Enterprise-scale operations, formal compliance programs, or advanced retention guarantees.
- Localization and additional languages.

A future possibility may enter committed scope only after an explicit roadmap decision and the normal approved specification process. Until then, it must not influence current implementation or acceptance decisions.
