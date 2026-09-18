import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "slice-3.3-demo.spec.ts",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:4201", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium-demo", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-demo", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-demo", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "npm --prefix ../backend exec -- tsx ../backend/test/e2e-server.ts",
      url: "http://127.0.0.1:4102/api/v1/health",
      env: { E2E_DEMO_MODE: "1", E2E_BACKEND_PORT: "4102", E2E_FRONTEND_ORIGIN: "http://127.0.0.1:4201" },
      timeout: 180_000,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 4201",
      url: "http://127.0.0.1:4201/health",
      env: { BACKEND_API_ORIGIN: "http://127.0.0.1:4102", FRONTEND_ORIGIN: "http://127.0.0.1:4201" },
      timeout: 180_000,
    },
  ],
});
