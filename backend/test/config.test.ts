import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig, loadDemoConfig } from "../src/config.js";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4100",
  MONGODB_URI: "mongodb://127.0.0.1:27017/clientscope-test",
  FRONTEND_ORIGIN: "http://localhost:3000",
  SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
  AUTH_THROTTLE_LIMIT: "12",
  EMAIL_DELIVERY_MODE: "local",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("accepts and normalizes valid configuration without starting network work", () => {
    expect(loadConfig(validEnvironment)).toEqual({
      NODE_ENV: "test",
      PORT: 4100,
      MONGODB_URI: validEnvironment.MONGODB_URI,
      FRONTEND_ORIGIN: validEnvironment.FRONTEND_ORIGIN,
      SESSION_SECRET: validEnvironment.SESSION_SECRET,
      AUTH_THROTTLE_LIMIT: 12,
      EMAIL_DELIVERY_MODE: "local",
      AI_ENABLED: false,
      GEMINI_MODEL: "gemini-2.5-flash",
      AI_TIMEOUT_MS: 30_000,
    });
  });

  it.each(["NODE_ENV", "PORT", "MONGODB_URI", "FRONTEND_ORIGIN", "SESSION_SECRET", "AUTH_THROTTLE_LIMIT", "EMAIL_DELIVERY_MODE"] as const)(
    "rejects a missing %s value deterministically",
    (field) => {
      const environment = { ...validEnvironment };
      delete environment[field];

      expect(() => loadConfig(environment)).toThrow(ConfigurationError);
      expect(() => loadConfig(environment)).toThrow(field);
    },
  );

  it.each([
    ["NODE_ENV", "staging"],
    ["PORT", "0"],
    ["PORT", "65536"],
    ["PORT", "not-a-port"],
    ["MONGODB_URI", "https://database.example/secret"],
  ])("rejects invalid %s configuration", (field, value) => {
    expect(() => loadConfig({ ...validEnvironment, [field]: value })).toThrow(
      ConfigurationError,
    );
  });

  it("never includes a supplied connection string in diagnostics", () => {
    const secret = "mongodb://secret-user:secret-pass@example.invalid/db with-space";

    expect(() => loadConfig({ ...validEnvironment, MONGODB_URI: secret })).toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });

  it("requires a server-only credential only when AI is enabled", () => {
    expect(() => loadConfig({ ...validEnvironment, AI_ENABLED: "true" })).toThrow("GEMINI_API_KEY");
    expect(loadConfig({ ...validEnvironment, AI_ENABLED: "true", GEMINI_API_KEY: "secret", GEMINI_MODEL: "configured-model" })).toMatchObject({
      AI_ENABLED: true, GEMINI_API_KEY: "secret", GEMINI_MODEL: "configured-model", AI_TIMEOUT_MS: 30_000,
    });
  });
});

describe("loadDemoConfig", () => {
  it("is disabled by default and fails closed without exposing values", () => {
    expect(loadDemoConfig(validEnvironment)).toEqual({ state: "disabled" });
    const invalid = loadDemoConfig({ ...validEnvironment, DEMO_MODE_ENABLED: "true", DEMO_OWNER_PASSWORD: "leaked-password" });
    expect(invalid.state).toBe("invalid");
    expect(JSON.stringify(invalid)).not.toContain("leaked-password");
  });

  it("accepts distinct server-only identities and positive coherent quotas", () => {
    expect(loadDemoConfig({
      ...validEnvironment, DEMO_MODE_ENABLED: "true", DEMO_TENANT_ID: "64b000000000000000000333",
      DEMO_OWNER_EMAIL: "owner@demo.invalid", DEMO_OWNER_PASSWORD: "owner-unique-demo-secret",
      DEMO_APPROVER_EMAIL: "approver@demo.invalid", DEMO_APPROVER_PASSWORD: "approver-unique-demo-secret",
      DEMO_RESET_SECRET: "reset-secret-with-at-least-thirty-two-characters", DEMO_CLOUDINARY_FOLDER: "clientscope-demo/test",
    })).toMatchObject({ state: "enabled", tenantId: "64b000000000000000000333", quotas: { emailsPerUserHour: 3, emailsPerDay: 30 } });
  });
});
