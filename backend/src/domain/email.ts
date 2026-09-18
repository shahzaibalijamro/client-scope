import nodemailer, { type Transporter } from "nodemailer";
import type { EmailTemplate, RenderedEmail } from "./email-contracts.js";
import { emailText, renderEmail } from "./email-renderer.js";

export type EmailCommand = RenderedEmail;

export interface EmailService {
  send(command: EmailCommand): Promise<{ delivered: boolean }>;
}

export async function sendEmailSafely(
  service: EmailService,
  command: EmailTemplate,
): Promise<{ delivered: boolean }> {
  try {
    return await service.send(renderEmail(command, process.env.FRONTEND_ORIGIN ?? "", process.env.NODE_ENV));
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
  private readonly from: { name: string; address: string };

  constructor(user: string, appPassword: string, fromName = "ClientScope") {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });
    this.from = { name: emailText(fromName), address: user };
  }

  async send(command: EmailCommand): Promise<{ delivered: boolean }> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: command.to,
        subject: command.subject,
        text: command.text,
        html: command.html,
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
