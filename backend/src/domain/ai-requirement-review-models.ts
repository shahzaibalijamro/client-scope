import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });

const actorSchema = new Schema({ id: id(), displayName: { type: String, required: true } }, { _id: false, versionKey: false });
const findingSchema = new Schema({
  key: { type: String, required: true },
  category: { type: String, enum: ["vagueness", "missing-acceptance-detail", "conflict", "clarification-needed"], required: true },
  explanation: { type: String, required: true }, primaryRequirementId: { type: String, required: true },
  relatedRequirementIds: { type: [String] },
}, { _id: false, versionKey: false });
const patchSchema = new Schema({
  findingKey: { type: String, required: true }, targetRequirementId: { type: String, required: true },
  kind: { type: String, enum: ["replace-title", "replace-description", "replace-acceptance-criteria", "append-acceptance-criteria"], required: true },
  expectedValue: { type: Schema.Types.Mixed, required: true }, proposedValue: { type: Schema.Types.Mixed, required: true },
}, { _id: false, versionKey: false });
const suggestionSchema = new Schema({
  key: { type: String, required: true }, rationale: { type: String, required: true }, patch: { type: patchSchema, required: true },
}, { _id: false, versionKey: false });
const questionSchema = new Schema({
  findingKey: { type: String, required: true }, requirementIds: { type: [String], required: true }, question: { type: String, required: true },
}, { _id: false, versionKey: false });
const originalSchema = new Schema({
  findings: { type: [findingSchema], required: true }, suggestions: { type: [suggestionSchema], required: true },
  clarificationQuestions: { type: [questionSchema], required: true },
}, { _id: false, versionKey: false });
const workingSuggestionSchema = new Schema({
  key: { type: String, required: true }, selected: { type: Boolean, required: true }, proposedValue: { type: Schema.Types.Mixed, required: true },
}, { _id: false, versionKey: false });

const aiRequirementReviewSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, draftId: id(),
  baseDraftRevision: { type: String, required: true }, activeBindingKey: { type: String },
  state: { type: String, enum: ["generating", "pending-review", "applied", "discarded", "expired"], required: true, index: true },
  freshnessBecameStaleAt: { type: Date }, generationLeaseUntil: { type: Date }, expiresAt: { type: Date },
  reviewRevision: { type: String, required: true }, canonicalInput: { type: String, required: true }, initiatedBy: { type: actorSchema, required: true },
  original: { type: originalSchema }, workingSuggestions: { type: [workingSuggestionSchema] }, finalSelectedPatches: { type: [patchSchema] },
  operationId: { type: String }, promptVersion: { type: String }, providerId: { type: String }, modelId: { type: String },
  execution: { type: new Schema({ durationMs: { type: Number, required: true } }, { _id: false, versionKey: false }) },
  generatedAt: { type: Date }, appliedBy: { type: actorSchema }, appliedAt: { type: Date }, appliedDraftRevision: { type: String },
  discardedAt: { type: Date }, expiredAt: { type: Date },
}, options);
aiRequirementReviewSchema.index({ projectId: 1, createdAt: -1 });
aiRequirementReviewSchema.index(
  { activeBindingKey: 1 },
  { unique: true, partialFilterExpression: { activeBindingKey: { $type: "string" } }, name: "one_active_quality_review_per_draft_revision" },
);

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const AiRequirementReview = model<InferSchemaType<typeof aiRequirementReviewSchema>>("AiRequirementReview", aiRequirementReviewSchema);
export async function syncAiRequirementReviewIndexes(): Promise<void> { await AiRequirementReview.syncIndexes(); }
