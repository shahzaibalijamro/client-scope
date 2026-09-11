import mongoose, { Schema, type InferSchemaType } from "mongoose";

const options = { timestamps: true, autoCreate: false, autoIndex: false } as const;
const id = () => ({ type: Schema.Types.ObjectId, required: true });

const milestoneTimelineSchema = new Schema({
  workspaceId: { ...id(), index: true },
  projectId: { ...id(), unique: true, index: true },
  revisionToken: { type: String, required: true },
  activeCount: { type: Number, required: true, min: 0, max: 50 },
}, options);

const milestoneSchema = new Schema({
  workspaceId: { ...id(), index: true },
  projectId: { ...id(), index: true },
  title: { type: String, required: true },
  description: String,
  targetDate: String,
  status: { type: String, enum: ["upcoming", "in-progress", "completed"], required: true },
  position: { type: Number, required: true },
  active: { type: Boolean, required: true },
  latestTransitionId: { type: Schema.Types.ObjectId },
  archivedAt: Date,
  archivedById: Schema.Types.ObjectId,
  archivedByName: String,
  archivedByRole: String,
  archiveReason: String,
  formerPosition: Number,
}, options);
milestoneSchema.index({ projectId: 1, position: 1 }, { unique: true, partialFilterExpression: { active: true } });
milestoneSchema.index({ projectId: 1, active: 1, position: 1, _id: 1 });
milestoneSchema.index({ projectId: 1, archivedAt: -1, _id: -1 });

const milestoneTransitionSchema = new Schema({
  workspaceId: { ...id(), index: true },
  projectId: { ...id(), index: true },
  milestoneId: { ...id(), index: true },
  previousStatus: { type: String, enum: ["upcoming", "in-progress", "completed"], required: true },
  nextStatus: { type: String, enum: ["upcoming", "in-progress", "completed"], required: true },
  actorId: id(),
  actorName: { type: String, required: true },
  actorRole: { type: String, enum: ["workspace-owner", "service-team-member"], required: true },
  transitionedAt: { type: Date, required: true },
  note: String,
}, { ...options, timestamps: false, versionKey: false });
milestoneTransitionSchema.index({ milestoneId: 1, transitionedAt: 1, _id: 1 });

function model<T>(name: string, schema: Schema<T>): mongoose.Model<T> {
  return (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const MilestoneTimeline = model<InferSchemaType<typeof milestoneTimelineSchema>>("MilestoneTimeline", milestoneTimelineSchema);
export const Milestone = model<InferSchemaType<typeof milestoneSchema>>("Milestone", milestoneSchema);
export const MilestoneTransition = model<InferSchemaType<typeof milestoneTransitionSchema>>("MilestoneTransition", milestoneTransitionSchema);

export async function syncMilestoneIndexes(): Promise<void> {
  await Promise.all([MilestoneTimeline.syncIndexes(), Milestone.syncIndexes(), MilestoneTransition.syncIndexes()]);
}
