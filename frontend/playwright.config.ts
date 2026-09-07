import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "npm --prefix ../backend exec -- tsx ../backend/test/e2e-server.ts",
      url: "http://127.0.0.1:4101/api/v1/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 4200",
      url: "http://127.0.0.1:4200/health",
      env: { BACKEND_API_ORIGIN: "http://127.0.0.1:4101" },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
