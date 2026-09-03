# ClientScope Mission

## Purpose

ClientScope gives freelancers and small service teams one structured, shared place to manage client scope, decisions, reviews, and delivery history.

Its purpose is not to replace a full project-management system. It exists to make the client-facing agreement visible and dependable: what was requested, what was approved, what changed, what was delivered, what feedback was given, and what still requires a decision.

## The Problem

Client project communication is commonly fragmented across email, WhatsApp, chat, documents, and task-management tools. Important requirements, revisions, approvals, and scope changes are often informal or scattered. This makes decisions easy to misunderstand, difficult to trace, and hard to verify later.

The central problem is therefore not general task management. It is the absence of a clear, shared, auditable record of the client agreement throughout a project's life.

## Target Users

ClientScope initially serves:

- Solo freelancers and service teams of approximately two to five people.
- Providers managing roughly two to ten active client projects.
- Developers, designers, and small agencies delivering websites, web applications, design work, and similar digital services.
- External clients who need a simple way to review work, give feedback, and make explicit decisions.

The product is optimized for people who already work with clients through a mixture of informal communication and general-purpose tools, but need stronger scope control and accountability. It is not initially optimized for large agencies, enterprise approval structures, or high-volume resource planning.

## Product Promise

ClientScope should make the following project story clear to both provider and client:

> Project setup -> requirements -> client approval -> agreed scope -> execution -> formal change requests -> deliverable review -> revisions -> approval -> final completion.

At every stage, current status and pending decisions should be easy to understand. Previously approved versions and significant decisions must remain historically visible instead of being silently overwritten.

## Core Product Boundaries

The committed product centers on:

- Workspace, client, project, and project-access management.
- Structured requirements and explicit client review.
- Preservation of agreed scope and subsequent revisions.
- Formal change requests with recorded decisions.
- Client-facing milestones and progress visibility.
- Deliverable submission, versioning, feedback, revision requests, and approval.
- Comments attached to the relevant requirements, change requests, and deliverables.
- A project activity history for significant actions and decisions.
- Final project approval, completion, and archival.
- Attachments that support the core workflows.
- In-app status visibility and transactional email for decision-requiring or materially important events.
- Export of the project record after the core and AI phases.

ClientScope tracks client-facing progress through milestones. It does not manage the provider's internal tasks, backlog, or engineering process.

## Roles and Access Principles

A ClientScope account represents a person globally. A person may participate in multiple workspaces and projects, with authority determined by membership in the active context rather than by one global role.

The initial role model is intentionally small:

- **Workspace Owner:** controls the workspace, can access all of its projects, manages membership and project administration, and can perform provider workflow actions.
- **Service-Team Member:** accesses only assigned projects and can collaborate on provider work without workspace-owner authority.
- **Client Participant:** accesses only explicitly assigned projects and can view shared information, comment, provide feedback, and request revisions, but cannot make binding approvals.
- **Client Approver:** has participant capabilities plus explicit authority to approve or reject reviewable project items and final completion.

One valid decision from an authorized Client Approver is sufficient; complex voting and approval-chain policies are outside the committed scope. Access must always be both role-based and workspace/project-scoped.

## Product Principles

### 1. Preserve agreements and decisions

Approved scope, deliverable versions, and significant decisions are historical facts. Later work creates new versions or actions rather than rewriting prior records.

### 2. Make authority explicit

The system must show who acted, what they decided, when they acted, and which entity or version the decision concerned. Participation does not imply approval authority.

### 3. Keep the client experience clear

Client-facing review and approval should be understandable without project-management expertise. The interface should emphasize decisions, context, and next actions rather than feature density.

### 4. Stay focused on the client agreement

Features belong in the committed product only when they materially improve scope definition, review, change control, delivery, approval, or traceability.

### 5. Protect private project data

Project data is private by default. Tenant and project boundaries must be enforced by the backend, and users must receive only the data and actions authorized for their current membership context.

### 6. Prefer correctness over convenience

Security, data integrity, valid workflow transitions, and trustworthy history take precedence over shortcuts, cleverness, or premature optimization.

### 7. Keep humans authoritative

AI may structure, analyze, summarize, and suggest. It must not approve, reject, silently alter official records, or autonomously create irreversible history. AI output becomes authoritative only through an explicit human action, and original source material remains available.

### 8. Keep the core independent of AI

Every core workflow must remain usable when the AI provider is disabled, unavailable, or rate-limited.

### 9. Build from approved specifications

Meaningful implementation follows an approved feature specification. Discovered ambiguity is resolved in the specification rather than silently encoded in the application.

## History and Retention Position

ClientScope provides a strong internal traceability record, not legal evidence or a compliance-grade audit system.

Significant workflow and access actions create non-editable history entries with the acting user, action, time, affected entity or version, and useful context. Normal drafts may be edited or safely removed where the workflow permits. Once data participates in an approval, revision, or other significant historical action, ordinary edits or deletion must not erase that history.

Archival is the normal way to remove a project from active use. Permanent project deletion, if supported by its later specification, is a deliberate, strongly confirmed administrative act and may destroy the project record. ClientScope does not promise cryptographic immutability, regulated retention, or permanent legal preservation.

## Success Criteria

### Product success

The product succeeds when a provider and client can complete the entire client-facing lifecycle in one system and can reliably determine:

- What was requested and agreed.
- What changed after agreement.
- Which version is current or approved.
- What feedback was given.
- What is waiting for a decision.
- Who made each significant decision and when.

It should reduce misunderstandings, make pending actions obvious, work well for clients on mobile devices, and remain usable without AI.

### Engineering success

The implementation succeeds when it:

- Enforces tenant isolation and contextual authorization on the backend.
- Preserves important versions and historical decisions.
- Validates critical business transitions and fails safely.
- Keeps business rules clear, maintainable, and testable.
- Verifies critical workflows and authorization with automated tests.
- Can be deployed at free or effectively free portfolio/demo scale.
- Demonstrates a disciplined, visible spec-driven development process.

### Portfolio success

ClientScope is portfolio-ready only when the complete non-AI lifecycle, all three committed AI workflows, project export, tests, CI, live deployment, realistic seeded demo, documentation, architecture overview, screenshots, portfolio narrative, and a concise recorded walkthrough are complete and polished.

## Non-Goals

The committed release will not attempt to provide:

- Invoicing, payments, accounting, or ClientScope subscription billing.
- Time tracking or timesheets.
- Contracts, e-signatures, or legally authoritative evidence.
- CRM or lead management.
- Internal employee, HR, or resource management.
- Full task management, personal task lists, assignees, subtasks, priorities, backlogs, Kanban boards, or sprint planning.
- General-purpose real-time chat, calls, or collaborative document editing.
- Calendar scheduling.
- General-purpose or large-scale document storage.
- White-label or extensively customizable client portals.
- Complex automation, third-party integrations, or autonomous AI agents.
- Complex approval chains, voting, quotas, or ordered approvers.
- Native mobile applications.
- Advanced reporting and analytics.
- Enterprise scale, high availability, multi-region operation, or formal SLA guarantees.
- Formal compliance certification or legacy-browser support.
- Localization in the portfolio release; the committed release is English-only.

