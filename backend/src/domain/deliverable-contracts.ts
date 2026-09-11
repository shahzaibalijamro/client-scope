import { isIP } from "node:net";

import { z } from "zod";

import { objectId } from "./validation.js";

export const DELIVERABLE_LIMIT = 50;
export const DELIVERABLE_PAGE_DEFAULT = 20;
export const DELIVERABLE_PAGE_MAX = 50;
export const MAX_ATTACHMENTS = 10;
export const MAX_LINKS = 10;
export const MAX_ASSET_BYTES = 26_214_400;

export const deliverableState = z.enum(["draft", "in-review", "revision-draft", "approved", "canceled"]);
export const deliverableVersionOutcome = z.enum(["in-review", "changes-requested", "withdrawn", "approved"]);
export const deliverableRole = z.enum(["workspace-owner", "service-team-member", "client-participant", "client-approver"]);
export const allowedAssetType = z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip"]);
export const cleanupState = z.enum(["pending", "retry", "completed", "skipped"]);

const revisionToken = z.string().min(32).max(200);
const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || undefined).optional();
const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);

function blockedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  const version = isIP(normalized);
  if (version === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === undefined || a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) || (a === 203 && b === 0);
  }
  if (version === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || /^fe[89ab]/u.test(normalized) || normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8");
  }
  return false;
}

export const safeExternalUrl = z.string().trim().max(2_048).superRefine((value, context) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname || blockedHost(parsed.hostname)) {
      context.addIssue({ code: "custom", message: "Use an HTTPS public address without credentials or a private-network destination." });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid HTTPS address." });
  }
}).transform((value) => new URL(value).toString());

export const deliverableLinkInput = z.object({
  id: objectId,
  label: requiredText(120),
  url: safeExternalUrl,
  order: z.number().int().min(0).max(MAX_LINKS - 1),
}).strict();

const uniqueOrdered = <T extends { id: string; order: number }>(items: T[], context: z.RefinementCtx, path: string) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) context.addIssue({ code: "custom", path: [path], message: "Identifiers must be unique." });
  const order = [...items].map((item) => item.order).sort((a, b) => a - b);
  if (order.some((value, index) => value !== index)) context.addIssue({ code: "custom", path: [path], message: "Order must be complete and start at zero." });
};

export const createDeliverableInput = z.object({ title: requiredText(120) }).strict();
export const updateDeliverableDraftInput = z.object({
  revisionToken,
  title: requiredText(120).optional(),
  notes: optionalText(5_000),
  revisionSummary: optionalText(2_000),
  links: z.array(deliverableLinkInput).max(MAX_LINKS),
  attachmentIds: z.array(objectId).max(MAX_ATTACHMENTS),
}).strict().superRefine((value, context) => {
  uniqueOrdered(value.links, context, "links");
  if (new Set(value.attachmentIds).size !== value.attachmentIds.length) context.addIssue({ code: "custom", path: ["attachmentIds"], message: "Attachment identifiers must be unique." });
});

export const confirmedInput = z.object({ revisionToken, confirmed: z.literal(true) }).strict();
export const reasonInput = z.object({ confirmed: z.literal(true), reason: requiredText(2_000) }).strict();
export const commentInput = z.object({ body: requiredText(2_000) }).strict();
export const decisionInput = z.object({
  confirmed: z.literal(true),
  outcome: z.enum(["approved", "changes-requested"]),
  note: optionalText(2_000),
}).strict().superRefine((value, context) => {
  if (value.outcome === "changes-requested" && !value.note) context.addIssue({ code: "custom", path: ["note"], message: "Describe the revision that is needed." });
});

const filename = requiredText(255).refine((value) => [...value].every((character) => {
  const code = character.codePointAt(0) ?? 0;
  return code > 31 && code !== 127;
}), "Filename contains unsupported characters.");
export const authorizeUploadInput = z.object({
  revisionToken,
  filename,
  mediaType: allowedAssetType,
  byteSize: z.number().int().positive().max(MAX_ASSET_BYTES),
}).strict();
export const finalizeUploadInput = z.object({
  revisionToken,
  reservationId: objectId,
  providerResult: z.record(z.string(), z.unknown()),
}).strict();
export const detachAttachmentInput = z.object({ revisionToken }).strict();

export const pageQuery = z.object({
  cursor: z.string().min(16).max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(DELIVERABLE_PAGE_MAX).default(DELIVERABLE_PAGE_DEFAULT),
}).strict();

export type DeliverableState = z.infer<typeof deliverableState>;
export type DeliverableVersionOutcome = z.infer<typeof deliverableVersionOutcome>;
export type DeliverableRole = z.infer<typeof deliverableRole>;
export type AllowedAssetType = z.infer<typeof allowedAssetType>;
export type CreateDeliverableInput = z.infer<typeof createDeliverableInput>;
export type UpdateDeliverableDraftInput = z.infer<typeof updateDeliverableDraftInput>;
export type DecisionInput = z.infer<typeof decisionInput>;
export type AuthorizeUploadInput = z.infer<typeof authorizeUploadInput>;
export type FinalizeUploadInput = z.infer<typeof finalizeUploadInput>;

export const OPEN_DELIVERABLE_STATES = new Set<DeliverableState>(["draft", "in-review", "revision-draft"]);

export function isOpenDeliverableState(state: DeliverableState): boolean {
  return OPEN_DELIVERABLE_STATES.has(state);
}

export function canDeliverableTransition(from: DeliverableState, to: DeliverableState | "discarded"): boolean {
  return (from === "draft" && (to === "in-review" || to === "discarded")) ||
    (from === "in-review" && (to === "revision-draft" || to === "approved")) ||
    (from === "revision-draft" && (to === "in-review" || to === "canceled"));
}

export function deliverablePermissions(role: DeliverableRole, state?: DeliverableState) {
  const provider = role === "workspace-owner" || role === "service-team-member";
  const approver = role === "client-approver";
  return {
    canView: true,
    canCreate: provider,
    canEditDraft: provider && (state === "draft" || state === "revision-draft"),
    canSubmit: provider && (state === "draft" || state === "revision-draft"),
    canDiscard: provider && state === "draft",
    canComment: state === "in-review",
    canDecide: approver && state === "in-review",
    canWithdraw: provider && state === "in-review",
    canCancel: provider && state === "revision-draft",
  };
}

export function submissionReady(input: { links: unknown[]; attachments: unknown[]; versionNumber: number; revisionSummary?: string }): boolean {
  return (input.links.length > 0 || input.attachments.length > 0) &&
    (input.versionNumber === 1 || Boolean(input.revisionSummary?.trim()));
}

export function previewCapability(mediaType: AllowedAssetType): boolean {
  return mediaType === "image/png" || mediaType === "image/jpeg" || mediaType === "image/webp";
}

export function filenameMatchesType(filename: string, mediaType: AllowedAssetType): boolean {
  const lower = filename.toLowerCase();
  const extensions: Record<AllowedAssetType, string[]> = {
    "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"], "application/zip": [".zip"],
  };
  return extensions[mediaType].some((extension) => lower.endsWith(extension));
}
