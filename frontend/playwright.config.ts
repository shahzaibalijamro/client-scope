import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "slice-3.3-demo.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-navigation", grep: /critical navigation/u, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-navigation", grep: /critical navigation/u, use: { ...devices["Desktop Safari"] } },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ? undefined : [
    {
      command: "npm --prefix ../backend exec -- tsx ../backend/test/e2e-server.ts",
      url: "http://127.0.0.1:4101/api/v1/health",
      timeout: 120_000,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 4200",
      url: "http://127.0.0.1:4200/health",
      env: { BACKEND_API_ORIGIN: "http://127.0.0.1:4101" },
      timeout: 120_000,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    },
  ],
});
