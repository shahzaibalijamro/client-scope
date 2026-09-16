import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;

const demoControlSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
  generation: { type: Number, required: true, min: 0, default: 0 },
  state: { type: String, enum: ["initializing", "ready", "preparing", "replacing", "cleaning-assets", "completed", "failed"], required: true },
  leaseId: String,
  leaseUntil: Date,
  lastRunId: String,
  lastStartedAt: Date,
  lastCompletedAt: Date,
  lastFailureCode: String,
  sourceCommit: String,
}, options);

const quotaEventSchema = new Schema({
  operationId: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  occurredAt: { type: Date, required: true },
}, { _id: false, versionKey: false });

const demoQuotaLedgerSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  capability: { type: String, enum: ["email", "ai", "upload"], required: true },
  scope: { type: String, enum: ["identity-hour", "deployment-day"], required: true },
  userId: { type: Schema.Types.ObjectId },
  dayKey: String,
  events: { type: [quotaEventSchema], required: true, default: [] },
  used: { type: Number, required: true, min: 0, default: 0 },
}, options);
demoQuotaLedgerSchema.index({ tenantId: 1, capability: 1, scope: 1, userId: 1, dayKey: 1 }, { unique: true });

const demoAssetCleanupSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  providerIdentifier: { type: String, required: true },
  folder: { type: String, required: true },
  state: { type: String, enum: ["pending", "retry", "completed"], required: true },
  attempts: { type: Number, required: true, min: 0, default: 0 },
  retryAfter: Date,
  lastFailureCode: String,
}, options);
demoAssetCleanupSchema.index({ tenantId: 1, providerIdentifier: 1 }, { unique: true });

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const DemoControl = model<InferSchemaType<typeof demoControlSchema>>("DemoControl", demoControlSchema);
export const DemoQuotaLedger = model<InferSchemaType<typeof demoQuotaLedgerSchema>>("DemoQuotaLedger", demoQuotaLedgerSchema);
export const DemoAssetCleanup = model<InferSchemaType<typeof demoAssetCleanupSchema>>("DemoAssetCleanup", demoAssetCleanupSchema);

export async function syncDemoIndexes(): Promise<void> {
  await Promise.all([DemoControl.syncIndexes(), DemoQuotaLedger.syncIndexes(), DemoAssetCleanup.syncIndexes()]);
}
