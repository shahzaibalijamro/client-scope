import mongoose from "mongoose";

import { logDiagnostic } from "./logger.js";

const RETRY_DELAY_MS = 5_000;
const SERVER_SELECTION_TIMEOUT_MS = 5_000;

export class DatabaseConnection {
  private retryTimer: NodeJS.Timeout | undefined;
  private connecting = false;
  private stopping = false;
  private uri: string | undefined;

  constructor() {
    mongoose.connection.on("connected", () => {
      logDiagnostic("info", "database.state_changed", { state: "connected" });
    });
    mongoose.connection.on("disconnected", () => {
      logDiagnostic("warn", "database.state_changed", { state: "disconnected" });
    });
    mongoose.connection.on("error", () => {
      logDiagnostic("error", "database.connection_error", { state: "unavailable" });
    });
  }

  start(uri: string): void {
    this.uri = uri;
    this.stopping = false;
    void this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopping || this.connecting || this.uri === undefined) {
      return;
    }

    this.connecting = true;
    try {
      await mongoose.connect(this.uri, {
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      });
    } catch {
      logDiagnostic("warn", "database.connection_attempt_failed", {
        state: "disconnected",
      });
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleRetry(): void {
    if (this.stopping || this.retryTimer !== undefined) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, RETRY_DELAY_MS);
    this.retryTimer.unref();
  }

  async close(): Promise<void> {
    this.stopping = true;
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    await mongoose.disconnect();
  }
}

export const databaseConnection = new DatabaseConnection();

export function getDatabaseReadyState(): number {
  return mongoose.connection.readyState;
}
