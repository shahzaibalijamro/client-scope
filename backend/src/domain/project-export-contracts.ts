import { z } from "zod";

export const EXPORT_SCHEMA_VERSION = "clientscope-project-record-v1";
export const BUNDLED_FILE_CAP = 262_144_000;

export const omissionReason = z.enum([
  "size_limit", "not_found", "storage_unavailable", "access_denied", "integrity_failure",
]);
export type OmissionReason = z.infer<typeof omissionReason>;

export const manifestEntrySchema = z.object({
  attachmentId: z.string(), deliverableNumber: z.number().int().positive(), deliverableTitle: z.string(),
  versionNumber: z.number().int().positive(), order: z.number().int().nonnegative(), filename: z.string(),
  mediaType: z.string(), byteSize: z.number().int().nonnegative(), status: z.enum(["included", "omitted"]),
  path: z.string().optional(), omissionReason: omissionReason.optional(),
}).strict().superRefine((entry, context) => {
  if (entry.status === "included" && !entry.path) context.addIssue({ code: "custom", message: "Included files require a path." });
  if (entry.status === "omitted" && !entry.omissionReason) context.addIssue({ code: "custom", message: "Omitted files require a reason." });
});

export const exportManifestSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION), projectId: z.string(), projectName: z.string(),
  generatedAt: z.string().datetime(), dataCutoff: z.string().datetime(),
  lifecycleState: z.enum(["active", "completion-in-review", "completed", "archived"]),
  bundledFileCap: z.literal(BUNDLED_FILE_CAP), includedFileBytes: z.number().int().nonnegative(),
  complete: z.boolean(), attachments: z.array(manifestEntrySchema),
}).strict();

export type ExportManifest = z.infer<typeof exportManifestSchema>;

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
export function safePathSegment(value: string, fallback = "file"): string {
  const normalized = [...value.normalize("NFKC")].filter((character) => { const code = character.codePointAt(0) ?? 0; return code > 31 && !(code >= 127 && code <= 159); }).join("")
    .replace(/[\\/:*?"<>|]/gu, "-").replace(/^[.\- ]+|[.\- ]+$/gu, "").replace(/\s+/gu, " ").trim();
  const safe = !normalized || RESERVED.test(normalized) ? `${fallback}-${normalized || "unnamed"}` : normalized;
  return safe.slice(0, 180);
}

export function safeArchiveFilename(projectName: string, generatedAt: Date): string {
  const stamp = generatedAt.toISOString().replace(/[:.]/gu, "-");
  return `${safePathSegment(projectName, "project")}-project-record-${stamp}.zip`;
}

export function uniqueArchivePaths(entries: ReadonlyArray<{ deliverableNumber: number; versionNumber: number; order: number; filename: string }>): string[] {
  const used = new Set<string>();
  return entries.map((entry) => {
    const base = `attachments/deliverable-${entry.deliverableNumber}/version-${entry.versionNumber}/${entry.order}-${safePathSegment(entry.filename)}`;
    let candidate = base; let suffix = 2;
    while (used.has(candidate.toLocaleLowerCase("en-US"))) {
      const dot = base.lastIndexOf(".");
      candidate = dot > base.lastIndexOf("/") ? `${base.slice(0, dot)}-${suffix}${base.slice(dot)}` : `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate.toLocaleLowerCase("en-US"));
    return candidate;
  });
}

export function newestVersionRounds<T extends { deliverableNumber: number; versionNumber: number; order: number; attachmentId: string }>(entries: readonly T[]): T[] {
  const deliverables = [...new Set(entries.map((entry) => entry.deliverableNumber))].sort((a, b) => a - b);
  const versions = new Map(deliverables.map((number) => [number, [...new Set(entries.filter((entry) => entry.deliverableNumber === number).map((entry) => entry.versionNumber))].sort((a, b) => b - a)]));
  const result: T[] = []; const rounds = Math.max(0, ...[...versions.values()].map((items) => items.length));
  for (let round = 0; round < rounds; round += 1) for (const deliverable of deliverables) {
    const version = versions.get(deliverable)?.[round]; if (version === undefined) continue;
    result.push(...entries.filter((entry) => entry.deliverableNumber === deliverable && entry.versionNumber === version).sort((a, b) => a.order - b.order || a.attachmentId.localeCompare(b.attachmentId)));
  }
  return result;
}
