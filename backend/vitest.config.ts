import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(new URL("./node_modules/.cache/mongodb-memory-server", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 300_000,
    testTimeout: 20_000,
    restoreMocks: true,
  },
});
