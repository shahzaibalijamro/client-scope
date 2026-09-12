import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  verified: z.boolean(),
}).strict();

export const sessionResponseSchema = z.object({ user: userSchema.nullable() }).strict();

const lifecyclePermissionsSchema = z.object({
  canRequestCompletion: z.boolean(), canWithdrawCompletion: z.boolean(), canDecideCompletion: z.boolean(),
  canArchive: z.boolean(), canRestore: z.boolean(),
}).strict();

const lifecycleSummarySchema = z.object({
  state: z.enum(["active", "completion-in-review", "completed", "archived"]), readOnly: z.boolean(),
  pendingAction: z.enum(["completion-ready", "completion-pending", "completion-decision"]).optional(),
  permissions: lifecyclePermissionsSchema,
}).strict();

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    companyName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
  }).strict(),
  description: z.string().optional(),
  targetDeadline: z.string().optional(),
  role: z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]),
  scope: z.object({
    state: z.enum(["not-started", "draft", "in-review", "changes-requested", "withdrawn", "approved"]),
    pendingAction: z.enum(["decision-required", "scope-submission", "scope-editing"]).optional(),
    currentVersionId: z.string().optional(),
  }).strict().optional(),
  changeControl: z.object({
    state: z.enum(["draft", "in-review", "revision-draft", "approved", "rejected", "canceled"]),
    pendingAction: z.enum(["decision-required", "change-revision", "change-submission", "change-editing"]).optional(),
  }).strict().optional(),
  deliverables: z.object({
    pendingAction: z.enum(["review-requested", "decision-required", "revision-required"]).optional(),
    pendingCount: z.number().int().min(0),
  }).strict().optional(),
  lifecycle: lifecycleSummarySchema.optional(),
}).strict();

export const invitationSchema = z.object({
  id: z.string(),
  kind: z.enum(["workspace", "project"]),
  inviterName: z.string(),
  workspaceName: z.string(),
  role: z.enum(["service-team-member", "client-participant", "client-approver"]),
  expiresAt: z.string(),
  projectName: z.string().optional(),
  clientName: z.string().optional(),
}).strict();

export const workspaceGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.enum(["owner", "service-team-member", "client"]),
  projects: z.array(projectSchema),
  completedProjects: z.array(projectSchema).default([]),
  archivedProjects: z.array(projectSchema).default([]),
}).strict();

export const workResponseSchema = z.object({
  invitations: z.array(invitationSchema),
  workspaces: z.array(workspaceGroupSchema),
}).strict();

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  companyName: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  internalNotes: z.string().optional(),
}).strict();

export const clientsResponseSchema = z.object({ clients: z.array(clientSchema) }).strict();
export const clientResponseSchema = z.object({ client: clientSchema }).strict();
export const projectResponseSchema = z.object({ project: projectSchema }).strict();

export const projectMembersResponseSchema = z.object({
  members: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    role: z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]),
    email: z.string().email().optional(),
  }).strict()),
}).strict();

const accessPeriodSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  endReason: z.string().optional(),
}).strict();

export const accessResponseSchema = z.object({
  workspaceMemberships: z.array(accessPeriodSchema.extend({
    email: z.string().email().optional(),
    role: z.literal("service-team-member"),
  }).strict()),
  assignments: z.array(accessPeriodSchema.extend({ projectId: z.string() }).strict()),
  clientMemberships: z.array(accessPeriodSchema.extend({
    email: z.string().email().optional(),
    projectId: z.string(),
    role: z.enum(["client-participant", "client-approver"]),
  }).strict()),
  invitations: z.array(z.object({
    id: z.string(),
    projectId: z.string().optional(),
    kind: z.enum(["workspace", "project"]),
    email: z.string().email(),
    role: z.enum(["service-team-member", "client-participant", "client-approver"]),
    status: z.enum(["pending", "accepted", "expired", "revoked"]),
    deliveryStatus: z.enum(["pending", "sent", "failed"]),
    expiresAt: z.string(),
    replacedBy: z.string().optional(),
  }).strict()),
}).strict();

export const limitedInvitationResponseSchema = z.object({ invitation: invitationSchema }).strict();
export const messageResponseSchema = z.object({
  message: z.string().optional(),
  warning: z.string().optional(),
  role: z.string().optional(),
  destination: z.string().optional(),
}).passthrough();

export type User = z.infer<typeof userSchema>;
export type Project = z.infer<typeof projectSchema>;
export type WorkspaceGroup = z.infer<typeof workspaceGroupSchema>;
export type ClientRecord = z.infer<typeof clientSchema>;
export type AccessData = z.infer<typeof accessResponseSchema>;

const lifecycleActorSchema = z.object({ id: z.string(), displayName: z.string(), role: z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]) }).strict();
const readinessBlockerSchema = z.object({
  code: z.enum(["NO_APPROVED_SCOPE", "NO_APPROVED_DELIVERABLE", "NO_ACTIVE_CLIENT_APPROVER", "PENDING_SCOPE_REVIEW", "ACTIVE_CHANGE_REQUEST", "OPEN_DELIVERABLE", "INCOMPLETE_ACTIVE_MILESTONE"]),
  count: z.number().int().optional(), ids: z.array(z.string()).optional(),
}).strict();
const completionRoundSchema = z.object({
  id: z.string(), number: z.number().int().positive(), status: z.enum(["in-review", "approved", "returned", "withdrawn"]), revisionToken: z.string(),
  requester: lifecycleActorSchema, requestedAt: z.string(), requestSummary: z.string().optional(),
  readiness: z.object({
    scope: z.object({ id: z.string(), number: z.number().int().positive() }).strict(),
    deliverables: z.array(z.object({ id: z.string(), number: z.number().int().positive(), title: z.string(), versionId: z.string(), versionNumber: z.number().int().positive() }).strict()),
    milestones: z.array(z.object({ id: z.string(), title: z.string(), status: z.literal("completed") }).strict()),
    evaluatedAt: z.string(),
  }).strict(),
  terminal: z.object({ actor: lifecycleActorSchema, at: z.string(), outcome: z.enum(["approved", "returned", "withdrawn"]), note: z.string().optional() }).strict().optional(),
}).strict();
export const lifecycleSchema = lifecycleSummarySchema.extend({
  revision: z.string(),
  readiness: z.object({ ready: z.boolean(), blockers: z.array(readinessBlockerSchema) }).strict().optional(),
  currentRoundId: z.string().optional(), rounds: z.array(completionRoundSchema),
  archiveHistory: z.array(z.object({
    id: z.string(), action: z.enum(["archived", "restored"]), actor: lifecycleActorSchema, occurredAt: z.string(), reason: z.string(),
    previousState: z.enum(["completed", "archived"]), nextState: z.enum(["completed", "archived"]),
  }).strict()),
}).strict();
export const lifecycleResponseSchema = z.object({ lifecycle: lifecycleSchema, warning: z.string().optional() }).strict();
export type ProjectLifecycle = z.infer<typeof lifecycleSchema>;

const activityItemSchema = z.object({
  id: z.string(), type: z.string(), occurredAt: z.string(),
  actor: z.object({ id: z.string(), displayName: z.string(), role: z.string().optional() }).strict().optional(),
  entity: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
}).strict();
export const activityResponseSchema = z.object({ activity: z.object({ items: z.array(activityItemSchema), nextCursor: z.string().optional() }).strict() }).strict();

export const scopeRoleSchema = z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]);
export const scopeGroupSchema = z.object({ id: z.string(), name: z.string(), order: z.number().int() }).strict();
export const scopeRequirementSchema = z.object({
  snapshotId: z.string().optional(), logicalId: z.string(), groupId: z.string().optional(),
  title: z.string(), description: z.string(), acceptanceCriteria: z.array(z.string()), order: z.number().int(),
}).strict();
export const scopeDraftSchema = z.object({
  revisionToken: z.string(), copiedFromVersionId: z.string().optional(),
  groups: z.array(scopeGroupSchema), requirements: z.array(scopeRequirementSchema),
}).strict();
const actorSchema = z.object({ id: z.string(), displayName: z.string(), role: scopeRoleSchema }).strict();
const commentSchema = z.object({
  id: z.string(), body: z.string(), requirementSnapshotId: z.string().optional(), author: actorSchema, postedAt: z.string(),
}).strict();
const comparisonSchema = z.object({
  added: z.array(scopeRequirementSchema), removed: z.array(scopeRequirementSchema), contentChanged: z.array(scopeRequirementSchema),
}).strict();
export const scopeVersionSchema = z.object({
  id: z.string(), number: z.number().int(), status: z.enum(["in-review", "approved", "superseded", "changes-requested", "withdrawn"]),
  groups: z.array(scopeGroupSchema), requirements: z.array(scopeRequirementSchema), revisionSummary: z.string().optional(),
  submitter: actorSchema, submittedAt: z.string(),
  terminal: z.object({ actor: actorSchema, at: z.string(), note: z.string().optional() }).strict().optional(),
  supersession: z.object({ at: z.string(), changeRequestId: z.string(), proposalId: z.string(), successorScopeVersionId: z.string() }).strict().optional(),
  provenance: z.object({
    baseScopeVersionId: z.string(), changeRequestId: z.string(), proposalId: z.string(),
    proposalSubmitter: z.object({ id: z.string(), displayName: z.string() }).strict(),
    approvingClient: z.object({ id: z.string(), displayName: z.string() }).strict(),
  }).strict().optional(),
  comments: z.array(commentSchema), comparison: comparisonSchema.optional(),
}).strict();
export const scopeSchema = z.object({
  state: z.enum(["not-started", "draft", "in-review", "changes-requested", "withdrawn", "approved"]),
  role: scopeRoleSchema,
  permissions: z.object({
    canStartDraft: z.boolean(), canEditDraft: z.boolean(), canSubmit: z.boolean(), canWithdraw: z.boolean(),
    canComment: z.boolean(), canDecide: z.boolean(),
  }).strict(),
  pendingAction: z.enum(["decision-required", "scope-submission", "scope-editing"]).optional(),
  draft: scopeDraftSchema.optional(), currentVersionId: z.string().optional(), versions: z.array(scopeVersionSchema),
}).strict();
export const scopeResponseSchema = z.object({ scope: scopeSchema }).strict();
export const draftResponseSchema = z.object({ draft: scopeDraftSchema }).strict();
export const scopeVersionResponseSchema = z.object({ version: scopeVersionSchema, warning: z.string().optional() }).strict();
export const commentResponseSchema = z.object({ comment: commentSchema }).strict();
export type ScopeData = z.infer<typeof scopeSchema>;
export type ScopeDraft = z.infer<typeof scopeDraftSchema>;
export type ScopeVersion = z.infer<typeof scopeVersionSchema>;

const changeItemSchema = z.object({
  id: z.string(), comparisonKind: z.enum(["base-scope", "previous-proposal"]), entityKind: z.enum(["group", "requirement"]),
  entityId: z.string(), changeKinds: z.array(z.enum(["added", "removed", "content-changed", "moved"])),
  before: z.record(z.string(), z.unknown()).optional(), after: z.record(z.string(), z.unknown()).optional(), position: z.number().int(),
}).strict();
const changeCommentSchema = z.object({
  id: z.string(), body: z.string(), comparisonKind: z.enum(["base-scope", "previous-proposal"]).optional(), changeItemId: z.string().optional(),
  author: actorSchema, postedAt: z.string(),
}).strict();
const changeDraftSchema = z.object({
  revisionToken: z.string(), copiedFromProposalId: z.string().optional(), title: z.string(), titleFrozen: z.boolean(),
  rationale: z.string(), impactSummary: z.string().optional(), revisionSummary: z.string().optional(),
  groups: z.array(scopeGroupSchema), requirements: z.array(scopeRequirementSchema),
}).strict();
const changeProposalSchema = z.object({
  id: z.string(), number: z.number().int(), outcome: z.enum(["in-review", "approved", "changes-requested", "rejected", "withdrawn"]),
  title: z.string(), rationale: z.string(), impactSummary: z.string().optional(), revisionSummary: z.string().optional(),
  baseScopeVersion: z.object({ id: z.string(), number: z.number().int() }).strict(), groups: z.array(scopeGroupSchema), requirements: z.array(scopeRequirementSchema),
  comparisons: z.object({
    baseScope: z.array(changeItemSchema), previousProposal: z.array(changeItemSchema),
    previousMetadata: z.object({
      rationaleChanged: z.boolean(), impactChanged: z.boolean(),
      rationale: z.object({ before: z.string(), after: z.string() }).strict().optional(),
      impactSummary: z.object({ before: z.string().optional(), after: z.string().optional() }).strict().optional(),
    }).strict().optional(),
  }).strict(),
  submitter: actorSchema, submittedAt: z.string(),
  terminal: z.object({ actor: actorSchema, at: z.string(), note: z.string().optional() }).strict().optional(),
  decision: z.object({ outcome: z.enum(["approved", "changes-requested", "rejected"]), note: z.string().optional(), actor: actorSchema, decidedAt: z.string() }).strict().optional(),
  comments: z.array(changeCommentSchema),
}).strict();
const requestPermissionsSchema = z.object({
  canEditDraft: z.boolean(), canSubmit: z.boolean(), canDiscard: z.boolean(), canWithdraw: z.boolean(), canCancel: z.boolean(), canComment: z.boolean(), canDecide: z.boolean(),
}).strict();
const changeRequestSchema = z.object({
  id: z.string(), number: z.number().int().optional(), title: z.string(), state: z.enum(["draft", "in-review", "revision-draft", "approved", "rejected", "canceled"]),
  baseScopeVersion: z.object({ id: z.string(), number: z.number().int() }).strict(), creator: actorSchema, createdAt: z.string(),
  terminal: z.object({ actor: actorSchema, at: z.string(), reason: z.string().optional() }).strict().optional(), permissions: requestPermissionsSchema,
  draft: changeDraftSchema.optional(), proposals: z.array(changeProposalSchema),
}).strict();
export const changeControlSchema = z.object({
  role: scopeRoleSchema, pendingAction: z.enum(["decision-required", "change-revision", "change-submission", "change-editing"]).optional(),
  permissions: z.object({ canStart: z.boolean() }).strict(), requests: z.array(changeRequestSchema),
}).strict();
export const changeControlResponseSchema = z.object({ changeControl: changeControlSchema }).strict();
export const changeDraftResponseSchema = z.object({ requestId: z.string(), draft: changeDraftSchema }).strict();
export const changeActionResponseSchema = z.object({
  requestNumber: z.number().int().optional(), proposalNumber: z.number().int().optional(), proposalId: z.string().optional(),
  outcome: z.string().optional(), successorScopeVersionNumber: z.number().int().optional(), warning: z.string().optional(), message: z.string().optional(),
}).strict();
export const changeCommentResponseSchema = z.object({ comment: changeCommentSchema }).strict();
export type ChangeControl = z.infer<typeof changeControlSchema>;
export type ChangeRequestRecord = z.infer<typeof changeRequestSchema>;
export type ChangeProposal = z.infer<typeof changeProposalSchema>;

export const milestoneStatusSchema = z.enum(["upcoming", "in-progress", "completed"]);
const milestoneActorSchema = z.object({
  id: z.string(), displayName: z.string(), role: z.enum(["workspace-owner", "service-team-member"]),
}).strict();
export const milestoneTransitionSchema = z.object({
  id: z.string(), previousStatus: milestoneStatusSchema, nextStatus: milestoneStatusSchema,
  actor: milestoneActorSchema, transitionedAt: z.string(), note: z.string().optional(),
}).strict();
export const milestoneSchema = z.object({
  id: z.string(), title: z.string(), description: z.string().optional(), targetDate: z.string().optional(),
  status: milestoneStatusSchema, recordState: z.enum(["active", "archived"]), position: z.number().int(), isOverdue: z.boolean(),
  createdAt: z.string(), updatedAt: z.string(), latestTransition: milestoneTransitionSchema.optional(),
  archive: z.object({ actor: milestoneActorSchema, archivedAt: z.string(), reason: z.string() }).strict().optional(),
}).strict();
const milestonePermissionsSchema = z.object({
  canCreate: z.boolean(), canEdit: z.boolean(), canTransition: z.boolean(), canReorder: z.boolean(), canArchive: z.boolean(),
}).strict();
export const milestoneTimelineSchema = z.object({
  available: z.boolean(), activeCount: z.number().int().min(0).max(50), limit: z.literal(50),
  permissions: milestonePermissionsSchema, revisionToken: z.string().optional(), milestones: z.array(milestoneSchema).max(50),
}).strict();
export const milestoneTimelineResponseSchema = z.object({ timeline: milestoneTimelineSchema }).strict();
export const milestoneArchiveSchema = z.object({ milestones: z.array(milestoneSchema).max(50), nextCursor: z.string().optional() }).strict();
export const milestoneArchiveResponseSchema = z.object({ archive: milestoneArchiveSchema }).strict();
export const milestoneMutationResponseSchema = z.object({
  milestone: milestoneSchema, revisionToken: z.string(), activeCount: z.number().int().optional(), unchanged: z.boolean().optional(),
}).strict();
export const milestoneOrderResponseSchema = z.object({ revisionToken: z.string(), unchanged: z.boolean(), milestoneIds: z.array(z.string()).max(50) }).strict();
export type Milestone = z.infer<typeof milestoneSchema>;
export type MilestoneTimeline = z.infer<typeof milestoneTimelineSchema>;
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>;

export const deliverableRoleSchema = z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]);
export const deliverableStateSchema = z.enum(["draft", "in-review", "revision-draft", "approved", "canceled"]);
export const deliverableOutcomeSchema = z.enum(["in-review", "changes-requested", "withdrawn", "approved"]);
const deliverableActorSchema = z.object({ id: z.string(), displayName: z.string(), role: deliverableRoleSchema }).strict();
const deliverableLinkSchema = z.object({ id: z.string(), label: z.string(), url: z.string().url(), order: z.number().int() }).strict();
const deliverableAttachmentSchema = z.object({ id: z.string(), filename: z.string(), mediaType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip"]), byteSize: z.number().int(), order: z.number().int(), preview: z.boolean() }).strict();
export const deliverableVersionSchema = z.object({
  id: z.string(), number: z.number().int().positive(), outcome: deliverableOutcomeSchema, title: z.string(), notes: z.string().optional(), revisionSummary: z.string().optional(),
  links: z.array(deliverableLinkSchema).max(10), attachments: z.array(deliverableAttachmentSchema).max(10),
  scopeVersion: z.object({ id: z.string(), number: z.number().int().positive() }).strict(), submitter: deliverableActorSchema, submittedAt: z.string(),
  terminal: z.object({ actor: deliverableActorSchema, at: z.string(), note: z.string().optional() }).strict().optional(),
}).strict();
const deliverableDraftSchema = z.object({
  id: z.string(), revisionToken: z.string(), copiedFromVersionId: z.string().optional(), editableTitle: z.string().optional(), notes: z.string().optional(), revisionSummary: z.string().optional(),
  links: z.array(deliverableLinkSchema).max(10), attachments: z.array(deliverableAttachmentSchema).max(10),
}).strict();
const deliverablePermissionsSchema = z.object({
  canView: z.boolean(), canCreate: z.boolean(), canEditDraft: z.boolean(), canSubmit: z.boolean(), canDiscard: z.boolean(), canComment: z.boolean(), canDecide: z.boolean(), canWithdraw: z.boolean(), canCancel: z.boolean(),
}).strict();
export const deliverableSchema = z.object({
  id: z.string(), number: z.number().int().positive().optional(), title: z.string(), state: deliverableStateSchema,
  creator: deliverableActorSchema, createdAt: z.string(), updatedAt: z.string(), permissions: deliverablePermissionsSchema,
  currentVersion: deliverableVersionSchema.optional(), draft: deliverableDraftSchema.optional(),
  terminal: z.object({ actor: deliverableActorSchema, at: z.string(), reason: z.string().optional() }).strict().optional(),
}).strict();
export const deliverableCollectionResponseSchema = z.object({ deliverables: z.object({
  available: z.boolean(), role: deliverableRoleSchema, openCount: z.number().int().min(0).max(50), limit: z.literal(50),
  permissions: z.object({ canCreate: z.boolean() }).strict(), deliverables: z.array(deliverableSchema).max(50),
}).strict() }).strict();
export const deliverableMutationResponseSchema = z.object({ deliverable: deliverableSchema, openCount: z.number().int().optional(), unchanged: z.boolean().optional() }).strict();
export const deliverableVersionActionResponseSchema = z.object({ version: deliverableVersionSchema, outcome: z.string().optional(), warning: z.string().optional() }).strict();
export const deliverableHistoryResponseSchema = z.object({ history: z.object({ deliverables: z.array(deliverableSchema), nextCursor: z.string().optional() }).strict() }).strict();
export const deliverableVersionsResponseSchema = z.object({ history: z.object({ versions: z.array(deliverableVersionSchema), nextCursor: z.string().optional() }).strict() }).strict();
export const deliverableCommentSchema = z.object({ id: z.string(), sequence: z.number().int().positive(), body: z.string(), author: deliverableActorSchema, postedAt: z.string() }).strict();
export const deliverableCommentsResponseSchema = z.object({ history: z.object({ comments: z.array(deliverableCommentSchema), nextCursor: z.string().optional() }).strict() }).strict();
export const deliverableCommentResponseSchema = z.object({ comment: deliverableCommentSchema }).strict();
export const uploadAuthorizationResponseSchema = z.object({ reservationId: z.string(), uploadUrl: z.string().url(), fields: z.record(z.string(), z.string()), expiresAt: z.string() }).strict();
export const attachmentAccessResponseSchema = z.object({ url: z.string().url(), expiresAt: z.string(), preview: z.boolean(), filename: z.string() }).strict();
export type Deliverable = z.infer<typeof deliverableSchema>;
export type DeliverableVersion = z.infer<typeof deliverableVersionSchema>;
export type DeliverableDraft = z.infer<typeof deliverableDraftSchema>;
export type DeliverableAttachment = z.infer<typeof deliverableAttachmentSchema>;
