import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });
const actorSchema = new Schema({ id: id(), displayName: { type: String, required: true } }, { _id: false, versionKey: false });
const citationSchema = new Schema({ feedbackRecordId: id(), versionId: id() }, { _id: false, versionKey: false });
const itemSchema = new Schema({ text: { type: String, required: true }, citations: { type: [citationSchema], required: true } }, { _id: false, versionKey: false });
const sourceReferenceSchema = new Schema({
  feedbackRecordId: id(), versionId: id(), versionNumber: { type: Number, required: true },
  kind: { type: String, enum: ["comment", "revision-request"], required: true },
  author: { type: new Schema({ id: id(), displayName: { type: String, required: true }, role: { type: String, enum: ["client-participant", "client-approver"], required: true } }, { _id: false, versionKey: false }), required: true },
  createdAt: { type: Date, required: true },
}, { _id: false, versionKey: false });
const outputSchema = new Schema({
  themes: { type: [itemSchema], required: true }, requestedActions: { type: [itemSchema], required: true }, tensions: { type: [itemSchema], required: true },
}, { _id: false, versionKey: false });

const feedbackSummarySchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: { ...id(), unique: true, index: true },
  runRevision: { type: String, required: true }, sourceFingerprint: { type: String, required: true }, sourceReferences: { type: [sourceReferenceSchema], required: true },
  generatedBy: { type: actorSchema, required: true }, generatedAt: { type: Date, required: true },
  promptVersion: { type: String, required: true }, schemaVersion: { type: String, required: true }, operationId: { type: String, required: true },
  providerId: { type: String, required: true }, modelId: { type: String, required: true },
  execution: { type: new Schema({ durationMs: { type: Number, required: true } }, { _id: false, versionKey: false }), required: true },
  output: { type: outputSchema, required: true },
}, options);
feedbackSummarySchema.index({ projectId: 1, deliverableId: 1 }, { unique: true });

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const AiFeedbackSummary = model<InferSchemaType<typeof feedbackSummarySchema>>("AiFeedbackSummary", feedbackSummarySchema);
export async function syncAiFeedbackSummaryIndexes(): Promise<void> { await AiFeedbackSummary.syncIndexes(); }
