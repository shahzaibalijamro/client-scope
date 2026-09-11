import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { syncScopeIndexes } from "./scope-models.js";
import { syncChangeControlIndexes } from "./change-control-models.js";
import { syncMilestoneIndexes } from "./milestone-models.js";
import { syncDeliverableIndexes } from "./deliverable-models.js";

const timestamps = { timestamps: true, autoCreate: false, autoIndex: false } as const;

const userSchema = new Schema(
  {
    email: { type: String, required: true },
    normalizedEmail: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    verifiedAt: { type: Date },
  },
  timestamps,
);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date },
  },
  timestamps,
);

const accountTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ["verification", "password-reset"], required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    active: { type: Boolean, required: true, default: true },
    consumedAt: { type: Date },
    replacedAt: { type: Date },
  },
  timestamps,
);
accountTokenSchema.index(
  { userId: 1, type: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  timestamps,
);

const workspaceMembershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["service-team-member"], required: true },
    status: { type: String, enum: ["active", "inactive"], required: true, default: "active" },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    endedBy: { type: Schema.Types.ObjectId },
    endReason: { type: String, enum: ["removed", "left"] },
  },
  timestamps,
);
workspaceMembershipSchema.index(
  { workspaceId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

const clientSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    companyName: { type: String },
    primaryContactEmail: { type: String },
    internalNotes: { type: String },
    projectCount: { type: Number, required: true, default: 0, min: 0 },
  },
  timestamps,
);

const projectSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    targetDeadline: { type: String },
  },
  timestamps,
);

const projectAssignmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ["active", "inactive"], required: true, default: "active" },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    endedBy: { type: Schema.Types.ObjectId },
    endReason: { type: String, enum: ["unassigned", "workspace-removed", "workspace-left"] },
  },
  timestamps,
);
projectAssignmentSchema.index(
  { projectId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

const effectiveProjectAccessSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: {
      type: String,
      enum: ["service-team-member", "client-participant", "client-approver"],
      required: true,
    },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    authoritySequence: { type: Number, required: true, default: 0 },
  },
  timestamps,
);
effectiveProjectAccessSchema.index({ projectId: 1, userId: 1 }, { unique: true });

const clientMembershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["client-participant", "client-approver"], required: true },
    status: { type: String, enum: ["active", "inactive"], required: true, default: "active" },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    endedBy: { type: Schema.Types.ObjectId },
    endReason: { type: String, enum: ["removed", "left", "role-changed"] },
  },
  timestamps,
);
clientMembershipSchema.index(
  { projectId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

const invitationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, index: true },
    kind: { type: String, enum: ["workspace", "project"], required: true },
    normalizedEmail: { type: String, required: true, index: true },
    displayEmail: { type: String, required: true },
    role: {
      type: String,
      enum: ["service-team-member", "client-participant", "client-approver"],
      required: true,
    },
    inviterId: { type: Schema.Types.ObjectId, required: true },
    inviterName: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["pending", "accepted", "expired", "revoked"], required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    acceptedBy: { type: Schema.Types.ObjectId },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId },
    replacedBy: { type: Schema.Types.ObjectId },
    deliveryStatus: { type: String, enum: ["pending", "sent", "failed"], required: true },
  },
  timestamps,
);
invitationSchema.index(
  { workspaceId: 1, projectId: 1, kind: 1, normalizedEmail: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

const activitySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, index: true },
    actorId: { type: Schema.Types.ObjectId },
    actorName: { type: String },
    action: { type: String, required: true },
    audience: { type: String, enum: ["owner", "project"], required: true },
    context: { type: Schema.Types.Mixed, required: true },
    occurredAt: { type: Date, required: true },
  },
  { versionKey: false, autoCreate: false, autoIndex: false },
);

const throttleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true },
    resetAt: { type: Date, required: true, index: { expires: 0 } },
  },
  timestamps,
);

export type UserRecord = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

function domainModel<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const User = domainModel<InferSchemaType<typeof userSchema>>("User", userSchema);
export const Session = domainModel<InferSchemaType<typeof sessionSchema>>("Session", sessionSchema);
export const AccountToken = domainModel<InferSchemaType<typeof accountTokenSchema>>("AccountToken", accountTokenSchema);
export const Workspace = domainModel<InferSchemaType<typeof workspaceSchema>>("Workspace", workspaceSchema);
export const WorkspaceMembership = domainModel<InferSchemaType<typeof workspaceMembershipSchema>>("WorkspaceMembership", workspaceMembershipSchema);
export const Client = domainModel<InferSchemaType<typeof clientSchema>>("Client", clientSchema);
export const Project = domainModel<InferSchemaType<typeof projectSchema>>("Project", projectSchema);
export const ProjectAssignment = domainModel<InferSchemaType<typeof projectAssignmentSchema>>("ProjectAssignment", projectAssignmentSchema);
export const EffectiveProjectAccess = domainModel<InferSchemaType<typeof effectiveProjectAccessSchema>>("EffectiveProjectAccess", effectiveProjectAccessSchema);
export const ClientMembership = domainModel<InferSchemaType<typeof clientMembershipSchema>>("ClientMembership", clientMembershipSchema);
export const Invitation = domainModel<InferSchemaType<typeof invitationSchema>>("Invitation", invitationSchema);
export const Activity = domainModel<InferSchemaType<typeof activitySchema>>("Activity", activitySchema);
export const Throttle = domainModel<InferSchemaType<typeof throttleSchema>>("Throttle", throttleSchema);

export async function syncDomainIndexes(): Promise<void> {
  await Promise.all([
    User.syncIndexes(), Session.syncIndexes(), AccountToken.syncIndexes(), Workspace.syncIndexes(),
    WorkspaceMembership.syncIndexes(), Client.syncIndexes(), Project.syncIndexes(),
    ProjectAssignment.syncIndexes(), EffectiveProjectAccess.syncIndexes(), ClientMembership.syncIndexes(), Invitation.syncIndexes(),
    Activity.syncIndexes(), Throttle.syncIndexes(),
    syncScopeIndexes(),
    syncChangeControlIndexes(),
    syncMilestoneIndexes(),
    syncDeliverableIndexes(),
  ]);
}
