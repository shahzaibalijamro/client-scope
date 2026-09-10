import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });

const groupSchema = new Schema({
  id: id(), name: { type: String, required: true }, order: { type: Number, required: true },
}, { _id: false, versionKey: false });

const draftRequirementSchema = new Schema({
  logicalId: id(), groupId: { type: Schema.Types.ObjectId }, title: { type: String, required: true },
  description: { type: String, required: true }, acceptanceCriteria: { type: [String], required: true },
  order: { type: Number, required: true },
}, { _id: false, versionKey: false });

const snapshotRequirementSchema = new Schema({
  snapshotId: id(), logicalId: id(), groupId: { type: Schema.Types.ObjectId },
  title: { type: String, required: true }, description: { type: String, required: true },
  acceptanceCriteria: { type: [String], required: true }, order: { type: Number, required: true },
}, { _id: false, versionKey: false });

const scopeDraftSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), unique: true, index: true },
  revisionToken: { type: String, required: true }, sourceVersionId: { type: Schema.Types.ObjectId },
  groups: { type: [groupSchema], required: true, default: [] },
  requirements: { type: [draftRequirementSchema], required: true, default: [] },
}, options);

const scopeVersionSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true },
  number: { type: Number, required: true },
  status: { type: String, enum: ["in-review", "approved", "superseded", "changes-requested", "withdrawn"], required: true },
  groups: { type: [groupSchema], required: true }, requirements: { type: [snapshotRequirementSchema], required: true },
  revisionSummary: { type: String }, submitterId: id(), submitterName: { type: String, required: true },
  submitterRole: { type: String, enum: ["workspace-owner"], required: true }, submittedAt: { type: Date, required: true },
  commentSequence: { type: Number, required: true, default: 0 },
  terminalActorId: { type: Schema.Types.ObjectId }, terminalActorName: { type: String },
  terminalRole: { type: String }, terminalAt: { type: Date }, terminalNote: { type: String },
  supersededAt: { type: Date }, supersededByChangeRequestId: { type: Schema.Types.ObjectId },
  supersededByProposalId: { type: Schema.Types.ObjectId }, successorScopeVersionId: { type: Schema.Types.ObjectId },
  basedOnScopeVersionId: { type: Schema.Types.ObjectId }, approvedFromChangeRequestId: { type: Schema.Types.ObjectId },
  approvedFromProposalId: { type: Schema.Types.ObjectId }, proposalSubmitterId: { type: Schema.Types.ObjectId },
  proposalSubmitterName: { type: String }, approvingClientId: { type: Schema.Types.ObjectId }, approvingClientName: { type: String },
}, options);
scopeVersionSchema.index({ projectId: 1, number: 1 }, { unique: true });
scopeVersionSchema.index({ projectId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "in-review" } });
scopeVersionSchema.index({ projectId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "approved" }, name: "one_current_approved_scope" });

const scopeCommentSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, versionId: { ...id(), index: true },
  requirementSnapshotId: { type: Schema.Types.ObjectId }, body: { type: String, required: true },
  authorId: id(), authorName: { type: String, required: true }, authorRole: { type: String, required: true },
  postedAt: { type: Date, required: true },
}, { ...options, versionKey: false });
scopeCommentSchema.index({ versionId: 1, postedAt: 1, _id: 1 });

const scopeDecisionSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, versionId: { ...id(), unique: true, index: true },
  outcome: { type: String, enum: ["approved", "changes-requested"], required: true }, note: { type: String },
  actorId: id(), actorName: { type: String, required: true }, actorRole: { type: String, enum: ["client-approver"], required: true },
  decidedAt: { type: Date, required: true },
}, { ...options, versionKey: false });

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const ScopeDraft = model<InferSchemaType<typeof scopeDraftSchema>>("ScopeDraft", scopeDraftSchema);
export const ScopeVersion = model<InferSchemaType<typeof scopeVersionSchema>>("ScopeVersion", scopeVersionSchema);
export const ScopeComment = model<InferSchemaType<typeof scopeCommentSchema>>("ScopeComment", scopeCommentSchema);
export const ScopeDecision = model<InferSchemaType<typeof scopeDecisionSchema>>("ScopeDecision", scopeDecisionSchema);

export async function syncScopeIndexes(): Promise<void> {
  await Promise.all([ScopeDraft.syncIndexes(), ScopeVersion.syncIndexes(), ScopeComment.syncIndexes(), ScopeDecision.syncIndexes()]);
}
