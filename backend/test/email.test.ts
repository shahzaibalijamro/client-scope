import { afterEach, describe, expect, it } from "vitest";

import {
  configuredEmailService,
  developmentEmail,
  GmailSmtpEmailService,
} from "../src/domain/email.js";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("email provider configuration", () => {
  it("uses the deterministic fake when Gmail credentials are absent outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    expect(configuredEmailService()).toBe(developmentEmail);
  });

  it("constructs the Gmail SMTP adapter only from an address and App Password", () => {
    process.env.NODE_ENV = "development";
    process.env.GMAIL_USER = "sender@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "example-app-password";
    expect(configuredEmailService()).toBeInstanceOf(GmailSmtpEmailService);
  });

  it("fails closed when production Gmail SMTP credentials are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    expect(() => configuredEmailService()).toThrow("Gmail SMTP configuration is required");
  });
});
