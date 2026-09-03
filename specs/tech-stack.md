# ClientScope Technology Stack

## Purpose of This Document

This document locks project-wide technical and architectural choices so feature specifications can focus on behavior. A feature specification may refine how a chosen technology is used, but should not replace a project-wide dependency without a documented architectural reason and an update to this constitution.

Exact workflows, endpoint contracts, schemas, state machines, UI states, security lifecycles, provider request details, and operational limits belong in later feature specifications.

## Decision Priorities

When two approaches are technically valid, prefer the one that:

1. Protects security, tenant isolation, and data integrity.
2. Keeps business rules explicit and testable.
3. Uses the project's familiar TypeScript and Node.js ecosystem.
4. Keeps infrastructure simple and suitable for free portfolio/demo deployment.
5. Is maintainable and easy to explain in an interview.
6. Avoids technology introduced only for novelty or resume value.

## Repository and Application Structure

ClientScope uses one Git repository containing two independent applications and the project specifications:

- `frontend/` — the Next.js application.
- `backend/` — the Node.js/Express API.
- `specs/` — the constitution and later feature specifications.

The frontend and backend each have their own `package.json`, dependencies, scripts, and package-lock file. They are not managed as npm workspaces, and the repository does not require Turborepo or other monorepo orchestration tooling.

The frontend and backend remain explicit application boundaries. Next.js route handlers are not a substitute for the Express API or its business-logic layer.

No shared package is part of the initial structure. API contracts and validation responsibilities should remain consistent across the two applications through specifications and deliberate implementation. A shared package or repository-level build tool may be introduced later only if a demonstrated need justifies the additional coupling and tooling.

ClientScope uses a **modular monolith** architecture. Domain areas should have clear boundaries inside the backend, while deployment remains a single API service. Microservices, distributed workers, and event-driven infrastructure are not part of the initial architecture.

## Chosen Technologies

### Language and package management

- **TypeScript** in both the frontend and backend applications.
- **Node.js** for the backend runtime and development tooling.
- **npm** for each application's independent dependency and script management.
- Supported runtime and framework versions should be pinned by lockfile and project configuration during setup; use maintained stable/LTS releases rather than constitution-level exact version numbers.

### Frontend

- **Next.js** with the **App Router**.
- **React** through Next.js.
- **Tailwind CSS** for styling.
- **TanStack Query** for remote/server-state fetching and caching.
- **React Hook Form** for form state and submission behavior.
- **Zod** for frontend form and boundary validation.
- Responsive web UI targeting current evergreen Chrome, Edge, Firefox, and Safari releases.

No visual component library is locked by this constitution. That choice should be made deliberately when the UI system is specified.

### Backend and API

- **Node.js**, **Express**, and **TypeScript**.
- A versioned **REST API** as the frontend's application interface.
- Domain-oriented backend modules with explicit application/business logic rather than logic concentrated in route handlers.
- Consistent request validation, authorization, error handling, and response conventions.
- **Zod** for backend runtime validation and TypeScript-compatible request/response modeling.

### Database

- **MongoDB** as the application database.
- **Mongoose** for schema modeling and database access.
- **MongoDB Atlas** as the hosted database service.

MongoDB stores application records and external-file metadata, not uploaded file contents. Data modeling must support historical versions, contextual memberships, and safe workflow transitions without treating mutable current state as a replacement for history.

### Authentication and authorization

- First-party email/password authentication implemented through the Express backend.
- Passwords stored using an appropriate modern password-hashing algorithm.
- Revocable, server-side sessions stored in MongoDB.
- An opaque session token delivered in a secure HttpOnly cookie.
- Email verification and password reset are required authentication capabilities.

Detailed cookie behavior, CSRF controls, session expiry and renewal, token handling, endpoints, and authentication UX must be decided in the authentication feature specification.

Authorization is membership-based and contextual:

- User accounts are global and may belong to multiple workspaces and projects.
- Workspace and project memberships determine the user's role and authority in the current context.
- Tenant and project authorization is enforced by the backend on every protected operation; frontend visibility is not a security boundary.
- Historical approval data is never made editable through ordinary role permissions.

### Browser-to-API boundary

The frontend exposes a same-origin `/api` proxy to the deployed Express service. This supports a coherent browser authentication boundary while preserving Express as the sole backend and business-logic application.

The exact proxy, origin, cookie, and development configuration belongs in the authentication and deployment specifications.

### Attachment storage

- **Cloudinary** is the primary attachment storage service.
- MongoDB stores application-level metadata and storage/delivery references, including identifiers, filenames, media types, sizes, ownership/association, and timestamps where needed.
- Uploaded file contents are not stored in MongoDB or relied upon in an application's ephemeral local filesystem.

File types, size limits, access strategy, validation, deletion, and attachment-version behavior belong in later attachment and workflow specifications.

### Transactional email

- **Resend** is the transactional email provider.
- Provider calls are isolated behind a small application-level email service boundary so domain logic does not depend on Resend-specific APIs.

Templates, retries, delivery tracking, failures, and event-specific notification rules belong in later feature specifications. In-app project state remains the source of truth; email brings users back to that state.

### Artificial intelligence

- **Google Gemini** is the initial AI provider.
- Gemini is accessed through a small provider-neutral AI service boundary.
- Core business logic and workflows must not depend on provider availability.
- AI inputs should contain only the minimum context needed for the requested assistance.
- AI output remains advisory or draft data until an authorized human explicitly applies or saves it.

Model selection, prompts, structured-output contracts, provider limits, error presentation, and request-specific privacy behavior belong in the AI feature specifications.

### Hosting and delivery

- **Vercel** hosts the Next.js frontend.
- **Koyeb** hosts the Express backend.
- **MongoDB Atlas** hosts MongoDB.
- **Cloudinary**, **Resend**, and **Google Gemini** provide their respective managed capabilities.
- **GitHub Actions** provides continuous integration.

The deployment must be viable at free or effectively free portfolio/demo scale. Free-tier constraints are acceptable for a demonstration environment and are not represented as production-grade availability. Provider plans should be rechecked when deployment is implemented; changing commercial availability alone may require a constitution amendment if a locked provider is no longer viable.

## Testing and Verification

The testing stack is:

- **Vitest** for unit tests, especially domain and business rules.
- **Supertest** for Express API integration tests.
- **React Testing Library** for frontend behavior where component-level tests provide useful confidence.
- **Playwright** for a deliberately small set of critical end-to-end workflows.

Testing prioritizes risk and business correctness rather than an arbitrary coverage percentage. Highest-priority automated coverage includes:

- Tenant isolation and contextual authorization.
- Workflow transition rules and invalid-action failures.
- Requirement approval and preserved history.
- Change-request decisions and their historical effects.
- Deliverable versioning, review, and approval.
- Final completion rules.
- Human confirmation boundaries around AI-assisted content.

Tests should be written at the lowest layer that proves the behavior reliably, with integration and end-to-end coverage reserved for boundaries and complete critical journeys.

## Continuous Integration

GitHub Actions must run the repository's required checks on pushes and pull requests. The baseline CI gate includes:

- Type checking.
- Linting.
- Automated tests.
- Production build verification for the frontend and backend applications.

Specific workflow files, caching, branch rules, and deployment automation are implementation decisions for the repository-foundation and delivery specifications.

## Quality Principles

The following priorities apply in order when tradeoffs arise:

1. **Security and tenant isolation** — strict backend authorization, secure sessions, least privilege, input validation, and careful handling of files and private data.
2. **Data integrity and reliability** — preserved history, validated transitions, predictable failures, and recoverable behavior.
3. **Privacy** — private-by-default data, minimal personal-data collection, and minimal AI context sharing.
4. **Responsive usability** — desktop-focused provider productivity with convenient mobile client review and approval.
5. **Accessibility** — semantic HTML, keyboard access, visible focus, labels, contrast, meaningful errors, and no color-only meaning.
6. **Performance** — responsive small-team behavior, bounded data loading, and avoidance of obvious repeated work without premature scaling infrastructure.
7. **Maintainability and testability** — readable TypeScript, explicit rules, focused modules, reusable validation, and consistent API conventions.
8. **Browser compatibility** — current evergreen browsers; legacy browsers are not supported.

Basic structured server-side diagnostics and useful error logging are required. A sophisticated telemetry platform, enterprise observability stack, or formal reliability program is not.

## Architectural Constraints and Exclusions

The initial architecture must not require:

- Microservices.
- Kubernetes.
- Message queues or distributed background workers as a core dependency.
- Redis.
- Event-driven infrastructure that adds an additional operational platform.
- Persistent local server filesystems.
- Real-time collaboration infrastructure.
- Enterprise-scale, multi-region, or high-availability systems.

New infrastructure requires a demonstrated product or correctness need and a constitution update when it changes a project-wide decision.

## Decisions Deferred to Feature Specifications

This constitution intentionally does not define:

- Detailed entity schemas, endpoints, payloads, or API error shapes.
- Workflow state machines and edge-case transitions.
- Exact invitation, onboarding, verification, reset, session, cookie, or CSRF behavior.
- UI screens, component states, navigation details, or a visual component system.
- Upload limits, supported formats, signed delivery, and file lifecycle rules.
- Email templates, notification matrices, retries, or provider failure policy.
- AI prompts, models, token limits, structured outputs, and per-feature confirmation UX.
- Export formats and archive contents.
- Exact logging fields, operational dashboards, or deployment configuration.
