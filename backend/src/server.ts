import type { Server } from "node:http";

import { createApp } from "./app.js";
import { ConfigurationError, loadConfig } from "./config.js";
import { databaseConnection } from "./database.js";
import { logDiagnostic } from "./logger.js";
import { configuredEmailService } from "./domain/email.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function startServer(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    const message =
      error instanceof ConfigurationError
        ? error.message
        : "Invalid server configuration.";
    logDiagnostic("error", "startup.configuration_invalid", { message });
    process.exitCode = 1;
    return;
  }

  const app = createApp({ emailService: configuredEmailService() });
  const server = app.listen(config.PORT, () => {
    logDiagnostic("info", "server.started", {
      port: config.PORT,
      environment: config.NODE_ENV,
    });
  });

  databaseConnection.start(config.MONGODB_URI);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logDiagnostic("info", "server.shutdown_started", { signal });

    const forceShutdown = setTimeout(() => {
      logDiagnostic("error", "server.shutdown_forced");
      server.closeAllConnections();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceShutdown.unref();

    try {
      await Promise.all([closeHttpServer(server), databaseConnection.close()]);
      clearTimeout(forceShutdown);
      logDiagnostic("info", "server.shutdown_completed");
      process.exit(0);
    } catch {
      clearTimeout(forceShutdown);
      logDiagnostic("error", "server.shutdown_failed");
      process.exit(1);
    }
  };

  server.on("error", () => {
    logDiagnostic("error", "server.listen_failed");
    process.exitCode = 1;
  });

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void startServer();
