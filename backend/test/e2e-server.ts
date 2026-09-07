import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";
import { syncDomainIndexes } from "../src/domain/models.js";

process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://127.0.0.1:4200";
process.env.SESSION_SECRET = "playwright-session-secret-with-at-least-32-characters";
process.env.AUTH_THROTTLE_LIMIT = "1000";
process.env.E2E_TEST_MODE = "1";
process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server", import.meta.url));

const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(database.getUri());
await syncDomainIndexes();

const server = createApp().listen(4101, "127.0.0.1", () => {
  process.stdout.write("ClientScope E2E backend ready\n");
});

async function close() {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
  await database.stop();
}

process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
