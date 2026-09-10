import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = (required = true) => ({ type: Schema.Types.ObjectId, required });

const groupSchema = new Schema({ id: id(), name: { type: String, required: true }, order: { type: Number, required: true } }, { _id: false, versionKey: false });
const requirementSchema = new Schema({
  snapshotId: id(false), logicalId: id(), groupId: id(false), title: { type: String, required: true },
  description: { type: String, required: true }, acceptanceCriteria: { type: [String], required: true }, order: { type: Number, required: true },
}, { _id: false, versionKey: false });

const changeRequestSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, number: { type: Number },
  title: { type: String, required: true }, baseScopeVersionId: id(), baseScopeVersionNumber: { type: Number, required: true },
  state: { type: String, enum: ["draft", "in-review", "revision-draft", "approved", "rejected", "canceled"], required: true },
  active: { type: Boolean, required: true }, creatorId: id(), creatorName: { type: String, required: true }, creatorRole: { type: String, required: true },
  terminalActorId: id(false), terminalActorName: String, terminalActorRole: String, terminalAt: Date, terminalReason: String,
}, options);
changeRequestSchema.index({ projectId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
changeRequestSchema.index({ projectId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: "number" } } });

const changeProposalDraftSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, requestId: { ...id(), unique: true, index: true },
  revisionToken: { type: String, required: true }, copiedFromProposalId: id(false), title: { type: String, required: true },
  rationale: { type: String, default: "" }, impactSummary: String, revisionSummary: String,
  groups: { type: [groupSchema], required: true, default: [] }, requirements: { type: [requirementSchema], required: true, default: [] },
}, options);

const changeProposalSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, requestId: { ...id(), index: true }, number: { type: Number, required: true },
  outcome: { type: String, enum: ["in-review", "approved", "changes-requested", "rejected", "withdrawn"], required: true },
  open: { type: Boolean, required: true }, title: { type: String, required: true }, rationale: { type: String, required: true }, impactSummary: String,
  revisionSummary: String, baseScopeVersionId: id(), baseScopeVersionNumber: { type: Number, required: true },
  groups: { type: [groupSchema], required: true }, requirements: { type: [requirementSchema], required: true },
  previousMetadata: { type: Schema.Types.Mixed }, submitterId: id(), submitterName: { type: String, required: true },
  submitterRole: { type: String, enum: ["workspace-owner"], required: true }, submittedAt: { type: Date, required: true }, commentSequence: { type: Number, default: 0 },
  terminalActorId: id(false), terminalActorName: String, terminalActorRole: String, terminalAt: Date, terminalNote: String,
}, options);
changeProposalSchema.index({ requestId: 1, number: 1 }, { unique: true });
changeProposalSchema.index({ requestId: 1, open: 1 }, { unique: true, partialFilterExpression: { open: true } });

const changeItemSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, requestId: { ...id(), index: true }, proposalId: { ...id(), index: true },
  comparisonKind: { type: String, enum: ["base-scope", "previous-proposal"], required: true }, entityKind: { type: String, enum: ["group", "requirement"], required: true },
  entityId: id(), changeKinds: { type: [String], required: true }, before: { type: Schema.Types.Mixed }, after: { type: Schema.Types.Mixed }, position: { type: Number, required: true },
}, { ...options, versionKey: false });
changeItemSchema.index({ proposalId: 1, comparisonKind: 1, position: 1, _id: 1 });

const changeCommentSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, requestId: { ...id(), index: true }, proposalId: { ...id(), index: true },
  comparisonKind: { type: String, enum: ["base-scope", "previous-proposal"] }, changeItemId: id(false), body: { type: String, required: true },
  authorId: id(), authorName: { type: String, required: true }, authorRole: { type: String, required: true }, postedAt: { type: Date, required: true },
}, { ...options, versionKey: false });
changeCommentSchema.index({ proposalId: 1, postedAt: 1, _id: 1 });

const changeDecisionSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, requestId: { ...id(), index: true }, proposalId: { ...id(), unique: true, index: true },
  outcome: { type: String, enum: ["approved", "changes-requested", "rejected"], required: true }, note: String,
  actorId: id(), actorName: { type: String, required: true }, actorRole: { type: String, enum: ["client-approver"], required: true }, decidedAt: { type: Date, required: true },
}, { ...options, versionKey: false });

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const ChangeRequest = model<InferSchemaType<typeof changeRequestSchema>>("ChangeRequest", changeRequestSchema);
export const ChangeProposalDraft = model<InferSchemaType<typeof changeProposalDraftSchema>>("ChangeProposalDraft", changeProposalDraftSchema);
export const ChangeProposal = model<InferSchemaType<typeof changeProposalSchema>>("ChangeProposal", changeProposalSchema);
export const ChangeItem = model<InferSchemaType<typeof changeItemSchema>>("ChangeItem", changeItemSchema);
export const ChangeComment = model<InferSchemaType<typeof changeCommentSchema>>("ChangeComment", changeCommentSchema);
export const ChangeDecision = model<InferSchemaType<typeof changeDecisionSchema>>("ChangeDecision", changeDecisionSchema);

export async function syncChangeControlIndexes(): Promise<void> {
  await Promise.all([ChangeRequest.syncIndexes(), ChangeProposalDraft.syncIndexes(), ChangeProposal.syncIndexes(), ChangeItem.syncIndexes(), ChangeComment.syncIndexes(), ChangeDecision.syncIndexes()]);
}
