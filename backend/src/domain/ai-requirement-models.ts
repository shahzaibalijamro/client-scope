import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });

const groupSchema = new Schema({
  key: { type: String, required: true }, name: { type: String, required: true },
}, { _id: false, versionKey: false });

const requirementSchema = new Schema({
  key: { type: String, required: true }, groupKey: { type: String }, title: { type: String, required: true },
  description: { type: String, required: true }, acceptanceCriteria: { type: [String], required: true },
}, { _id: false, versionKey: false });

const workingRequirementSchema = new Schema({
  key: { type: String, required: true }, groupKey: { type: String }, title: { type: String, required: true },
  description: { type: String, required: true }, acceptanceCriteria: { type: [String], required: true },
  selected: { type: Boolean, required: true },
}, { _id: false, versionKey: false });

const warningSchema = new Schema({
  category: { type: String, enum: ["unsupported-detail", "conflict", "ambiguity"], required: true },
  message: { type: String, required: true }, targetKey: { type: String },
}, { _id: false, versionKey: false });

const generatedSchema = new Schema({
  groups: { type: [groupSchema], required: true }, requirements: { type: [requirementSchema], required: true },
  warnings: { type: [warningSchema], required: true },
}, { _id: false, versionKey: false });

const workingSchema = new Schema({
  groups: { type: [groupSchema], required: true }, requirements: { type: [workingRequirementSchema], required: true },
}, { _id: false, versionKey: false });

const selectionSchema = new Schema({
  groups: { type: [groupSchema], required: true }, requirements: { type: [requirementSchema], required: true },
}, { _id: false, versionKey: false });

const actorSchema = new Schema({
  id: id(), displayName: { type: String, required: true },
}, { _id: false, versionKey: false });

const aiRequirementProposalSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, draftId: id(),
  baseDraftRevision: { type: String, required: true }, state: { type: String, enum: ["pending", "applied", "discarded", "expired"], required: true, index: true },
  expiresAt: { type: Date, required: true, index: true }, proposalRevision: { type: String, required: true },
  initiatedBy: { type: actorSchema, required: true }, rawSource: { type: String },
  original: { type: generatedSchema }, working: { type: workingSchema }, finalSelection: { type: selectionSchema },
  operationId: { type: String }, promptVersion: { type: String }, providerId: { type: String }, modelId: { type: String },
  execution: { type: new Schema({ durationMs: { type: Number, required: true } }, { _id: false, versionKey: false }) },
  appliedBy: { type: actorSchema }, appliedAt: { type: Date },
  appliedResult: { type: new Schema({
    draftRevision: { type: String, required: true }, groupIds: { type: [String], required: true }, requirementIds: { type: [String], required: true },
  }, { _id: false, versionKey: false }) },
  discardedAt: { type: Date }, expiredAt: { type: Date },
}, options);
aiRequirementProposalSchema.index({ projectId: 1, createdAt: -1 });

const aiGenerationLedgerSchema = new Schema({
  userId: { ...id(), unique: true, index: true }, admittedAt: { type: [Date], required: true, default: [] },
  inFlightOperationId: { type: String }, inFlightUntil: { type: Date }, sequence: { type: Number, required: true, default: 0 },
}, options);

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const AiRequirementProposal = model<InferSchemaType<typeof aiRequirementProposalSchema>>("AiRequirementProposal", aiRequirementProposalSchema);
export const AiGenerationLedger = model<InferSchemaType<typeof aiGenerationLedgerSchema>>("AiGenerationLedger", aiGenerationLedgerSchema);

export async function syncAiRequirementIndexes(): Promise<void> {
  await Promise.all([AiRequirementProposal.syncIndexes(), AiGenerationLedger.syncIndexes()]);
}
