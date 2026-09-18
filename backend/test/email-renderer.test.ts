import { afterEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { renderEmail } from "../src/domain/email-renderer.js";
import type { EmailTemplate } from "../src/domain/email-contracts.js";
import { GmailSmtpEmailService, SafeDevelopmentEmailService, sendEmailSafely } from "../src/domain/email.js";
import { applicationEmailUrl, validatePublicOrigin } from "../src/public-origin.js";

const project = { projectId: "64b000000000000000000333", projectName: "Northstar website" };
const token = "a".repeat(43);
const to = "recipient@example.com";
const origin = "https://clientscope.example";
const cases: EmailTemplate[] = [
  { category: "verification", to, token },
  { category: "password-reset", to, token },
  { category: "duplicate-signup", to },
  { category: "invitation", to, token, workspaceName: "Northstar Studio" },
  { category: "assignment", to, projectName: project.projectName },
  { category: "role-change", to, projectName: project.projectName, role: "client-approver" },
  { category: "access-removal", to, scope: "project", projectName: project.projectName },
  { category: "scope-review", to, ...project, version: 2, action: "requested" },
  { category: "scope-result", to, ...project, version: 2, outcome: "approved" },
  { category: "deliverable-review", to, ...project, number: 1, title: "Homepage design", version: 2 },
  { category: "deliverable-result", to, ...project, number: 1, title: "Homepage design", version: 2, outcome: "changes-requested" },
  { category: "completion-review", to, ...project, round: 1, action: "requested" },
  { category: "completion-result", to, ...project, round: 1, outcome: "approved" },
];
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("transactional email presentation", () => {
  it.each(cases)("renders deterministic multipart $category with equivalent content and destinations", (input) => {
    const message = renderEmail(input, origin, "production");
    expect(message).toEqual(renderEmail(input, origin, "production"));
    expect(message).toMatchSnapshot();
    expect(message.text).toContain("ClientScope");
    expect(message.html).toContain('<html lang="en">');
    const links = [...message.html.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
    expect(links).toHaveLength(2);
    expect(links[0]).toBe(links[1]);
    expect(message.text).toContain(`\n${links[0]}\n`);
    expect(message.html).not.toMatch(/<(?:img|script|form|iframe|video|audio)\b|\bsrc=|url\(/iu);
    if (!["verification", "password-reset", "invitation", "duplicate-signup"].includes(input.category)) expect(message.text).toContain("does not grant access or approval rights");
    if (input.category === "access-removal") expect(links[0]).toBe(`${origin}/work`);
  });

  it("keeps exact token actions and existing expiry guidance", () => {
    expect(renderEmail(cases[0]!, origin, "production").text).toContain(`${origin}/verify?token=${token}`);
    expect(renderEmail(cases[0]!, origin, "production").text).toContain("24 hours");
    expect(renderEmail(cases[1]!, origin, "production").text).toContain(`${origin}/reset-password?token=${token}`);
    expect(renderEmail(cases[1]!, origin, "production").text).toContain("one hour");
    expect(renderEmail(cases[3]!, origin, "production").text).toContain(`${origin}/invite/${token}`);
    expect(renderEmail(cases[3]!, origin, "production").text).toContain("three days");
  });

  it("renders withdrawals, cancellations, rejected changes, and returned completion without new private context", () => {
    const updates: EmailTemplate[] = [
      { category: "scope-review", to, ...project, version: 3, changeNumber: 2, action: "withdrawn" },
      { category: "scope-review", to, ...project, changeNumber: 2, action: "canceled" },
      { category: "scope-result", to, ...project, version: 3, changeNumber: 2, outcome: "rejected" },
      { category: "completion-review", to, ...project, round: 2, action: "withdrawn" },
      { category: "completion-result", to, ...project, round: 2, outcome: "returned" },
      { category: "access-removal", to, scope: "workspace" },
    ];
    for (const input of updates) {
      const rendered = renderEmail(input, origin, "production");
      expect(rendered.text).not.toContain("undefined");
      if (input.category.startsWith("scope")) expect(rendered.text).toContain(`/projects/${project.projectId}/changes`);
    }
  });

  it.each(["<img src=x onerror=alert(1)>", '" style="color:red" & <script>', "Line one\r\nBcc: evil@example.com\tLine two", "مرحبا 👋 e\u0301 \u202eHTML\u2069", "長".repeat(120)])("keeps hostile and long names inert: %s", (projectName) => {
    const result = renderEmail({ category: "assignment", to, projectName }, origin, "production");
    expect(result.subject).not.toMatch(/[\r\n\u202e\u2069]/u);
    expect(result.html).not.toMatch(/<img|<script|\u202e|\u2069/u);
    expect(result.text).not.toContain("&lt;");
    expect(result.text.match(/https:\/\/[^\s]+/gu)).toEqual([`${origin}/work`]);
    if (projectName.includes("<img")) expect(result.html).toContain("&lt;img");
  });

  it.each(["comment", "reason", "body", "prompt", "filename", "attachmentUrl", "resetSecret", "providerId", "quota", "url", "subject", "html"])("rejects unexpected private or presentation field %s", (key) => {
    expect(() => renderEmail({ ...cases[4]!, [key]: "private-value" } as EmailTemplate, origin, "production")).toThrow();
  });

  it("rejects missing fields, unknown categories, malformed recipients, tokens, and identifiers", () => {
    for (const bad of [
      { category: "assignment", to }, { category: "unknown", to },
      { ...cases[0]!, token: "../../secret" }, { ...cases[0]!, to: "recipient@example.com\r\nBcc:another@example.com" },
      { ...cases[7]!, projectId: "//evil.example" }, { ...cases[7]!, version: undefined },
    ]) expect(() => renderEmail(bad as EmailTemplate, origin, "production")).toThrow();
  });

  it("captures both bodies and fails recoverably before dispatch on invalid configuration or render input", async () => {
    vi.stubEnv("FRONTEND_ORIGIN", origin);
    const service = new SafeDevelopmentEmailService();
    expect(await sendEmailSafely(service, cases[4]!)).toEqual({ delivered: true });
    expect(service.sent[0]!.html).toContain("ClientScope");
    expect(service.sent[0]!.text).toContain("Northstar website");
    expect(await sendEmailSafely(service, { ...cases[4]!, url: "javascript:alert(1)" } as unknown as EmailTemplate)).toEqual({ delivered: false });
    vi.stubEnv("FRONTEND_ORIGIN", "https://example.com/path");
    expect(await sendEmailSafely(service, cases[4]!)).toEqual({ delivered: false });
    expect(service.sent).toHaveLength(1);
  });

  it("passes equivalent html and text through Gmail and hides SMTP errors", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    const gmail = new GmailSmtpEmailService("sender@example.com", "unused-test-value", "ClientScope\r\nInjected");
    const rendered = renderEmail(cases[4]!, origin, "production");
    expect(await gmail.send(rendered)).toEqual({ delivered: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: rendered.html, text: rendered.text, from: { name: "ClientScope Injected", address: "sender@example.com" } }));
    sendMail.mockRejectedValue(new Error("private provider diagnostics"));
    expect(await gmail.send(rendered)).toEqual({ delivered: false });
  });
});

describe("trusted email origins and path allow-list", () => {
  it.each([undefined, "", "http://example.com", "https://user:password@example.com", "https://example.com/", "https://example.com/path", "https://example.com?q=1", "https://example.com#fragment", "javascript:alert(1)", "https://example.com\n"])("rejects unsafe production origin %s", (value) => {
    expect(() => validatePublicOrigin(value, "production")).toThrow();
  });
  it("allows explicit local/test HTTP configuration and requires HTTPS otherwise", () => {
    expect(validatePublicOrigin("http://localhost:3000", "test")).toBe("http://localhost:3000");
    expect(validatePublicOrigin(origin, "production")).toBe(origin);
  });
  it.each(["//evil.example", "https://evil.example", "javascript:alert(1)", "data:text/html,bad", "/work#evil", "/work?returnTo=https://evil.example", "/work\n", "/projects/%2e%2e/scope", "/projects/../scope", "/invite/a?redirect=/work", "/work/../sign-in", "/\\evil.example"])("rejects unsafe path %s", (path) => {
    expect(() => applicationEmailUrl(origin, path, "production")).toThrow();
  });
});
