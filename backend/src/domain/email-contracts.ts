import { z } from "zod";

const name = z.string().trim().min(1).max(200);
const project = { projectId: z.string().regex(/^[a-f\d]{24}$/iu), projectName: name };
const token = z.string().length(43).regex(/^[A-Za-z0-9_-]{43}$/u);
const number = z.number().int().positive();
// eslint-disable-next-line no-control-regex
const to = z.string().email().max(254).refine((value) => !/[\r\n\u0000]/u.test(value));
const scope = { ...project, version: number, changeNumber: number.optional() };
const deliverable = { ...project, number, title: name, version: number };

/** Strict inputs deliberately exclude private bodies, comments, reasons, and arbitrary URLs. */
export const emailTemplateSchema = z.discriminatedUnion("category", [
  z.object({ category: z.literal("verification"), to, token }).strict(),
  z.object({ category: z.literal("password-reset"), to, token }).strict(),
  z.object({ category: z.literal("duplicate-signup"), to }).strict(),
  z.object({ category: z.literal("invitation"), to, token, workspaceName: name }).strict(),
  z.object({ category: z.literal("assignment"), to, projectName: name }).strict(),
  z.object({ category: z.literal("role-change"), to, projectName: name, role: z.enum(["client-participant", "client-approver"]) }).strict(),
  z.object({ category: z.literal("access-removal"), to, projectName: name.optional(), scope: z.enum(["project", "workspace"]) }).strict(),
  z.object({ category: z.literal("scope-review"), to, ...scope, version: number.optional(), action: z.enum(["requested", "withdrawn", "canceled"]) }).strict().refine((value) => value.action === "canceled" ? value.changeNumber !== undefined : value.version !== undefined),
  z.object({ category: z.literal("scope-result"), to, ...scope, outcome: z.enum(["approved", "changes-requested", "rejected"]) }).strict(),
  z.object({ category: z.literal("deliverable-review"), to, ...deliverable }).strict(),
  z.object({ category: z.literal("deliverable-result"), to, ...deliverable, outcome: z.enum(["approved", "changes-requested"]) }).strict(),
  z.object({ category: z.literal("completion-review"), to, ...project, round: number, action: z.enum(["requested", "withdrawn"]) }).strict(),
  z.object({ category: z.literal("completion-result"), to, ...project, round: number, outcome: z.enum(["approved", "returned"]) }).strict(),
]);
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
export type EmailCategory = EmailTemplate["category"];
export type EmailContent = EmailTemplate extends infer T ? T extends EmailTemplate ? Omit<T, "to"> : never : never;
export type RenderedEmail = Readonly<{ category: EmailCategory; to: string; subject: string; html: string; text: string }>;
