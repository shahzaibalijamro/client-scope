import { applicationEmailUrl } from "../public-origin.js";
import { emailTemplateSchema, type EmailTemplate, type RenderedEmail } from "./email-contracts.js";

/** Keep user text inert in headers, HTML, and plain text, including bidi controls. */
export function emailText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ").trim();
}
export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
type Copy = { subject: string; heading: string; context: string; action: string; path: string; guidance?: string };
const outcomeText = { approved: "approved", "changes-requested": "returned for revision", rejected: "rejected", returned: "returned for further work" };

function templateCopy(input: EmailTemplate): Copy {
  switch (input.category) {
    case "verification": return {
      subject: "Verify your ClientScope account", heading: "Confirm your email address",
      context: "Verify your email address to continue using ClientScope. This action does not accept an invitation or create a sign-in session.",
      action: "Verify email", path: `/verify?token=${input.token}`,
      guidance: "This link expires 24 hours after it was issued. A replacement link invalidates the previous link. If you did not request this account, you can ignore this email.",
    };
    case "password-reset": return {
      subject: "Reset your ClientScope password", heading: "Choose a new password",
      context: "A password reset was requested for your ClientScope account. Completing the reset signs out all existing sessions; you will need to sign in again.",
      action: "Reset password", path: `/reset-password?token=${input.token}`,
      guidance: "This link expires one hour after it was issued. A replacement link invalidates the previous link. If you did not request a reset, ignore this email; your password will stay unchanged.",
    };
    case "duplicate-signup": return {
      subject: "Your ClientScope account", heading: "Your account is already available",
      context: "An account already exists for this email address. Sign in, or use Forgot password on the sign-in page to request a reset.",
      action: "Sign in", path: "/sign-in", guidance: "If you did not try to create an account, you can ignore this email. Your existing account has not been changed.",
    };
    case "invitation": return {
      subject: "You’re invited to ClientScope", heading: "An invitation is waiting",
      context: `You have been invited to ${emailText(input.workspaceName)} in ClientScope. Sign in with the invited, verified email address to review the invitation and explicitly accept it.`,
      action: "Review invitation", path: `/invite/${input.token}`,
      guidance: "This invitation expires three days after it was issued and can be replaced or revoked earlier. Signing in or verifying your email does not accept it. If you were not expecting it, you can ignore this email. Current authorization is checked in ClientScope.",
    };
    case "assignment": return {
      subject: "Project access assigned — ClientScope", heading: "You have a project assignment",
      context: `You now have access to ${emailText(input.projectName)} in ClientScope.`, action: "Open My Work", path: "/work",
    };
    case "role-change": return {
      subject: "Project role updated — ClientScope", heading: "Your project role has changed",
      context: `${emailText(input.projectName)}: your role is now ${input.role === "client-approver" ? "Client Approver" : "Client Participant"}.`, action: "Open My Work", path: "/work",
    };
    case "access-removal": return {
      subject: "Access ended — ClientScope", heading: "Your access has ended",
      context: input.scope === "workspace" ? "Your workspace membership and its assigned-project access have ended." : `Your access to ${input.projectName ? emailText(input.projectName) : "this project"} has ended.`,
      action: "Open My Work", path: "/work",
    };
    case "scope-review": {
      const entity = input.changeNumber ? `Change request ${input.changeNumber}${input.action === "canceled" ? "" : `, proposal ${input.version}`}` : `Scope version ${input.version}`;
      return { subject: `ClientScope ${input.changeNumber ? "change request" : "scope"} review`, heading: input.action === "requested" ? "A review is ready" : "A review has been updated",
        context: `${emailText(input.projectName)}: ${entity} ${input.action === "requested" ? "is ready for review" : input.action === "withdrawn" ? "is no longer awaiting review" : "was canceled"}.`,
        action: "Open project review", path: `/projects/${input.projectId}/${input.changeNumber ? "changes" : "scope"}` };
    }
    case "scope-result": return {
      subject: "A scope decision was recorded — ClientScope", heading: "A decision is in the record",
      context: `${emailText(input.projectName)}: ${input.changeNumber ? `Change request ${input.changeNumber}, proposal ${input.version}` : `Scope version ${input.version}`} was ${outcomeText[input.outcome]}.`,
      action: "View project decision", path: `/projects/${input.projectId}/${input.changeNumber ? "changes" : "scope"}`,
    };
    case "deliverable-review": return {
      subject: `Deliverable ${input.number} is ready for review`, heading: "Work is ready for your review",
      context: `${emailText(input.projectName)}: Deliverable ${input.number}, “${emailText(input.title)}”, version ${input.version} is ready for review.`,
      action: "Review deliverable", path: `/projects/${input.projectId}/deliverables`,
    };
    case "deliverable-result": return {
      subject: `Deliverable ${input.number} review updated`, heading: "A delivery decision was recorded",
      context: `${emailText(input.projectName)}: Deliverable ${input.number}, “${emailText(input.title)}”, version ${input.version} was ${outcomeText[input.outcome]}.`,
      action: "View delivery decision", path: `/projects/${input.projectId}/deliverables`,
    };
    case "completion-review": return {
      subject: "Project completion review — ClientScope", heading: input.action === "requested" ? "The project is ready for final review" : "Final review was withdrawn",
      context: `${emailText(input.projectName)}: Completion round ${input.round} ${input.action === "requested" ? "is ready for your decision" : "was withdrawn"}.`,
      action: "Open project overview", path: `/projects/${input.projectId}/overview`,
    };
    case "completion-result": return {
      subject: "Project completion decision — ClientScope", heading: "A final review decision was recorded",
      context: `${emailText(input.projectName)}: Completion round ${input.round} was ${outcomeText[input.outcome]}.`,
      action: "View project overview", path: `/projects/${input.projectId}/overview`,
    };
  }
}

export function renderEmail(command: EmailTemplate, origin: string, environment: string | undefined): RenderedEmail {
  const input = emailTemplateSchema.parse(command);
  const copy = templateCopy(input);
  const url = applicationEmailUrl(origin, copy.path, environment);
  const guidance = copy.guidance ?? "Sign in to ClientScope to see the current record. Access and decision authority are checked against your current membership; this email does not grant access or approval rights.";
  const subject = emailText(copy.subject);
  const h = escapeEmailHtml;
  const text = `ClientScope\n\n${copy.heading}\n\n${copy.context}\n\n${copy.action}:\n${url}\n\n${guidance}\n\nClientScope — Clear work. Clear decisions.\nThis is a transactional account or project notification.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${h(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${h(copy.heading)} — ClientScope</div>
<table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8fafc;"><tr><td style="padding:24px 12px;">
<table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;"><tr><td style="padding:28px;overflow-wrap:anywhere;word-break:break-word;">
<p style="margin:0 0 26px;font-size:22px;font-weight:bold;color:#4338ca;">ClientScope</p>
<h1 style="margin:0 0 18px;font-size:25px;line-height:1.3;color:#0f172a;">${h(copy.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;">${h(copy.context)}</p>
<p style="margin:0 0 24px;"><a href="${h(url)}" style="display:inline-block;background-color:#4338ca;border:1px solid #4338ca;border-radius:6px;padding:13px 20px;color:#ffffff;font-weight:bold;text-decoration:none;">${h(copy.action)}</a></p>
<p style="font-size:13px;color:#475569;margin:0 0 6px;">If the button is unavailable, open this link:</p>
<p style="font-size:13px;margin:0 0 24px;word-break:break-all;"><a href="${h(url)}" style="color:#3730a3;text-decoration:underline;">${h(url)}</a></p>
<p style="margin:0;font-size:14px;color:#475569;">${h(guidance)}</p>
<hr style="border:0;border-top:1px solid #e2e8f0;margin:28px 0 18px;">
<p style="margin:0;font-size:12px;color:#475569;">ClientScope — Clear work. Clear decisions.<br>This is a transactional account or project notification.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { category: input.category, to: input.to, subject, html, text };
}
