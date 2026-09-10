import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  verified: z.boolean(),
}).strict();

export const sessionResponseSchema = z.object({ user: userSchema.nullable() }).strict();

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
