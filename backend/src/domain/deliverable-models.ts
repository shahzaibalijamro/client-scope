import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });

const actorFields = {
  actorId: id(), actorName: { type: String, required: true }, actorRole: { type: String, required: true },
};
const linkSchema = new Schema({ id: id(), label: { type: String, required: true }, url: { type: String, required: true }, order: { type: Number, required: true } }, { _id: false, versionKey: false });
const draftAttachmentSchema = new Schema({ assetId: id(), order: { type: Number, required: true } }, { _id: false, versionKey: false });
const versionAttachmentSchema = new Schema({
  id: id(), assetId: id(), filename: { type: String, required: true }, mediaType: { type: String, required: true }, byteSize: { type: Number, required: true }, order: { type: Number, required: true },
}, { _id: false, versionKey: false });

const projectStateSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), unique: true, index: true },
  openCount: { type: Number, required: true, min: 0, max: 50, default: 0 }, nextDeliverableNumber: { type: Number, required: true, min: 0, default: 0 },
}, options);

const deliverableSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, number: Number,
  title: { type: String, required: true }, titleFrozen: { type: Boolean, required: true, default: false },
  state: { type: String, enum: ["draft", "in-review", "revision-draft", "approved", "canceled"], required: true },
  creatorId: id(), creatorName: { type: String, required: true }, creatorRole: { type: String, required: true },
  currentDraftId: Schema.Types.ObjectId, currentVersionId: Schema.Types.ObjectId,
  nextVersionNumber: { type: Number, required: true, default: 0 }, revisionSequence: { type: Number, required: true, default: 0 },
  terminalAt: Date, terminalActorId: Schema.Types.ObjectId, terminalActorName: String, terminalActorRole: String, cancellationReason: String,
}, options);
deliverableSchema.index({ projectId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: "number" } } });
deliverableSchema.index({ projectId: 1, state: 1, updatedAt: -1, _id: -1 });
deliverableSchema.index({ projectId: 1, terminalAt: -1, _id: -1 });

const draftSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: { ...id(), unique: true, index: true },
  revisionToken: { type: String, required: true }, copiedFromVersionId: Schema.Types.ObjectId,
  notes: String, revisionSummary: String,
  links: { type: [linkSchema], required: true, default: [] }, attachments: { type: [draftAttachmentSchema], required: true, default: [] },
}, options);

const versionSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: { ...id(), index: true },
  number: { type: Number, required: true }, outcome: { type: String, enum: ["in-review", "changes-requested", "withdrawn", "approved"], required: true },
  title: { type: String, required: true }, notes: String, revisionSummary: String,
  links: { type: [linkSchema], required: true, default: [] }, attachments: { type: [versionAttachmentSchema], required: true, default: [] },
  scopeVersionId: id(), scopeVersionNumber: { type: Number, required: true },
  submitterId: id(), submitterName: { type: String, required: true }, submitterRole: { type: String, required: true }, submittedAt: { type: Date, required: true },
  terminalActorId: Schema.Types.ObjectId, terminalActorName: String, terminalActorRole: String, terminalAt: Date, terminalNote: String,
  commentSequence: { type: Number, required: true, default: 0 },
}, options);
versionSchema.index({ deliverableId: 1, number: 1 }, { unique: true });
versionSchema.index({ deliverableId: 1, submittedAt: -1, _id: -1 });

const commentSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: { ...id(), index: true }, versionId: { ...id(), index: true },
  sequence: { type: Number, required: true }, body: { type: String, required: true },
  authorId: id(), authorName: { type: String, required: true }, authorRole: { type: String, required: true }, postedAt: { type: Date, required: true },
}, { ...options, versionKey: false });
commentSchema.index({ versionId: 1, sequence: 1 }, { unique: true });
commentSchema.index({ versionId: 1, postedAt: 1, _id: 1 });

const outcomeSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: { ...id(), index: true }, versionId: { ...id(), unique: true, index: true },
  kind: { type: String, enum: ["approved", "changes-requested", "withdrawn"], required: true }, note: String, ...actorFields, occurredAt: { type: Date, required: true },
}, { ...options, versionKey: false });

const privateAssetSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: { ...id(), index: true }, originalDraftId: id(),
  providerIdentifier: { type: String, required: true, unique: true }, filename: { type: String, required: true }, mediaType: { type: String, required: true }, byteSize: { type: Number, required: true },
  lifecycle: { type: String, enum: ["finalized", "cleanup-pending", "deleted"], required: true }, finalizedAt: { type: Date, required: true },
}, options);

const uploadReservationSchema = new Schema({
  workspaceId: { ...id(), index: true }, projectId: { ...id(), index: true }, deliverableId: id(), draftId: id(),
  providerIdentifier: { type: String, required: true, unique: true }, filename: { type: String, required: true }, mediaType: { type: String, required: true }, byteSize: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: true }, consumedAt: Date,
}, options);

const cleanupWorkSchema = new Schema({
  assetId: { ...id(), unique: true, index: true }, providerIdentifier: { type: String, required: true }, reason: { type: String, required: true },
  idempotencyKey: { type: String, required: true, unique: true }, state: { type: String, enum: ["pending", "retry", "completed", "skipped"], required: true },
  attempts: { type: Number, required: true, default: 0 }, retryAfter: Date, completedAt: Date, lastFailureCode: String,
}, options);

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const DeliverableProjectState = model<InferSchemaType<typeof projectStateSchema>>("DeliverableProjectState", projectStateSchema);
export const Deliverable = model<InferSchemaType<typeof deliverableSchema>>("Deliverable", deliverableSchema);
export const DeliverableDraft = model<InferSchemaType<typeof draftSchema>>("DeliverableDraft", draftSchema);
export const DeliverableVersion = model<InferSchemaType<typeof versionSchema>>("DeliverableVersion", versionSchema);
export const DeliverableComment = model<InferSchemaType<typeof commentSchema>>("DeliverableComment", commentSchema);
export const DeliverableOutcome = model<InferSchemaType<typeof outcomeSchema>>("DeliverableOutcome", outcomeSchema);
export const PrivateAsset = model<InferSchemaType<typeof privateAssetSchema>>("PrivateAsset", privateAssetSchema);
export const UploadReservation = model<InferSchemaType<typeof uploadReservationSchema>>("UploadReservation", uploadReservationSchema);
export const AssetCleanupWork = model<InferSchemaType<typeof cleanupWorkSchema>>("AssetCleanupWork", cleanupWorkSchema);

export async function syncDeliverableIndexes(): Promise<void> {
  await Promise.all([
    DeliverableProjectState.syncIndexes(), Deliverable.syncIndexes(), DeliverableDraft.syncIndexes(), DeliverableVersion.syncIndexes(),
    DeliverableComment.syncIndexes(), DeliverableOutcome.syncIndexes(), PrivateAsset.syncIndexes(), UploadReservation.syncIndexes(), AssetCleanupWork.syncIndexes(),
  ]);
}
