import nodemailer, { type Transporter } from "nodemailer";

export type EmailCommand = Readonly<{
  category: "verification" | "password-reset" | "duplicate-signup" | "invitation" | "assignment" | "role-change" | "access-removal" | "scope-review" | "scope-result" | "deliverable-review" | "deliverable-result";
  to: string;
  subject: string;
  text: string;
}>;

export interface EmailService {
  send(command: EmailCommand): Promise<{ delivered: boolean }>;
}

export async function sendEmailSafely(
  service: EmailService,
  command: EmailCommand,
): Promise<{ delivered: boolean }> {
  try {
    return await service.send(command);
  } catch {
    return { delivered: false };
  }
}

export class SafeDevelopmentEmailService implements EmailService {
  readonly sent: EmailCommand[] = [];

  async send(command: EmailCommand): Promise<{ delivered: boolean }> {
    this.sent.push(command);
    return { delivered: process.env.EMAIL_DELIVERY_MODE !== "fail" };
  }
}

export const developmentEmail = new SafeDevelopmentEmailService();

export class GmailSmtpEmailService implements EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(user: string, appPassword: string, fromName = "ClientScope") {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });
    this.from = `${fromName} <${user}>`;
  }

  async send(command: EmailCommand): Promise<{ delivered: boolean }> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: command.to,
        subject: command.subject,
        text: command.text,
      });
      return { delivered: true };
    } catch {
      return { delivered: false };
    }
  }
}

export function configuredEmailService(): EmailService {
  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const mode = process.env.EMAIL_DELIVERY_MODE ?? "local";
  if (mode === "gmail" && user && appPassword) {
    return new GmailSmtpEmailService(user, appPassword, process.env.EMAIL_FROM_NAME);
  }
  if (mode === "gmail" || process.env.NODE_ENV === "production") {
    throw new Error("Gmail SMTP configuration is required in production.");
  }
  return developmentEmail;
}
