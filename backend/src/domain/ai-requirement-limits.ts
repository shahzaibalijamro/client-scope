import { randomUUID } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { ApiError } from "../errors.js";
import { AI_GENERATION_LIMIT, AI_GENERATION_WINDOW_MS } from "./ai-requirement-contracts.js";
import { AiGenerationLedger } from "./ai-requirement-models.js";

async function transact<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => { result = await work(session); });
    return result as T;
  } finally { await session.endSession(); }
}

export async function admitAiRequirementRequest(userId: mongoose.Types.ObjectId, now: Date): Promise<string> {
  const operationId = randomUUID();
  await transact(async (session) => {
    const ledger = await AiGenerationLedger.findOneAndUpdate(
      { userId }, { $inc: { sequence: 1 }, $setOnInsert: { admittedAt: [] } },
      { upsert: true, returnDocument: "after", session },
    ) as unknown as {
      admittedAt: Date[]; inFlightUntil?: Date; inFlightOperationId?: string;
      save(options: { session: ClientSession }): Promise<unknown>;
    };
    const cutoff = new Date(now.getTime() - AI_GENERATION_WINDOW_MS);
    const recent: Date[] = ledger.admittedAt.filter((date: Date) => date > cutoff);
    if (ledger.inFlightUntil && ledger.inFlightUntil > now) {
      throw new ApiError(429, "AI_GENERATION_IN_FLIGHT", "Wait for your current AI request to finish before starting another.");
    }
    if (recent.length >= AI_GENERATION_LIMIT) {
      const retryAt = new Date(recent[0]!.getTime() + AI_GENERATION_WINDOW_MS);
      throw new ApiError(429, "AI_RATE_LIMITED", "The shared hourly AI request limit has been reached. Try again later.", {
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1_000)),
      });
    }
    ledger.admittedAt = [...recent, now];
    ledger.inFlightOperationId = operationId;
    ledger.inFlightUntil = new Date(now.getTime() + 60_000);
    await ledger.save({ session });
  });
  return operationId;
}

export async function releaseAiRequirementRequest(userId: mongoose.Types.ObjectId, operationId: string): Promise<void> {
  await AiGenerationLedger.updateOne({ userId, inFlightOperationId: operationId }, { $unset: { inFlightOperationId: 1, inFlightUntil: 1 } });
}
