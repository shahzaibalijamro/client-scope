import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });

const actorSchema = new Schema({
  id: id(), displayName: { type: String, required: true }, role: { type: String, required: true },
}, { _id: false, versionKey: false });

const scopeSnapshotSchema = new Schema({
  id: id(), number: { type: Number, required: true },
}, { _id: false, versionKey: false });

const deliverableSnapshotSchema = new Schema({
  id: id(), number: { type: Number, required: true }, title: { type: String, required: true },
  versionId: id(), versionNumber: { type: Number, required: true },
}, { _id: false, versionKey: false });

const milestoneSnapshotSchema = new Schema({
  id: id(), title: { type: String, required: true }, status: { type: String, enum: ["completed"], required: true },
}, { _id: false, versionKey: false });

const completionReviewSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true },
  number: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["in-review", "approved", "returned", "withdrawn"], required: true },
  current: { type: Boolean, required: true }, revisionToken: { type: String, required: true },
  requester: { type: actorSchema, required: true }, requestedAt: { type: Date, required: true }, requestSummary: String,
  readiness: {
    type: new Schema({
      scope: { type: scopeSnapshotSchema, required: true },
      deliverables: { type: [deliverableSnapshotSchema], required: true },
      milestones: { type: [milestoneSnapshotSchema], required: true },
      evaluatedAt: { type: Date, required: true },
    }, { _id: false, versionKey: false }),
    required: true,
  },
  terminalActor: actorSchema, terminalAt: Date,
  terminalOutcome: { type: String, enum: ["approved", "returned", "withdrawn"] }, terminalNote: String,
}, options);
completionReviewSchema.index({ projectId: 1, number: 1 }, { unique: true });
completionReviewSchema.index({ projectId: 1, current: 1 }, { unique: true, partialFilterExpression: { current: true } });
completionReviewSchema.index({ projectId: 1, number: -1 });

const archiveLifecycleSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true },
  action: { type: String, enum: ["archived", "restored"], required: true },
  actor: { type: actorSchema, required: true }, occurredAt: { type: Date, required: true }, reason: { type: String, required: true },
  previousState: { type: String, enum: ["completed", "archived"], required: true },
  nextState: { type: String, enum: ["completed", "archived"], required: true },
}, options);
archiveLifecycleSchema.index({ projectId: 1, occurredAt: -1, _id: -1 });

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const CompletionReview = model<InferSchemaType<typeof completionReviewSchema>>("CompletionReview", completionReviewSchema);
export const ArchiveLifecycle = model<InferSchemaType<typeof archiveLifecycleSchema>>("ArchiveLifecycle", archiveLifecycleSchema);

export async function syncLifecycleIndexes(): Promise<void> {
  await Promise.all([CompletionReview.syncIndexes(), ArchiveLifecycle.syncIndexes()]);
}
