import manifest from "../../portfolio/media-manifest.json";
import { z } from "zod";

const ids = ["agreed-scope", "formal-changes", "deliverable-review"] as const;
const mediaSchema = z.object({
  id: z.enum(ids), kind: z.literal("screenshot"), alt: z.string().trim().min(1),
  width: z.number().int().positive(), height: z.number().int().positive(),
  url: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !/\/s--/u.test(url.pathname);
  }),
});
export function projectPublicMedia(source: unknown) {
  const parsed = z.object({ schemaVersion: z.literal(1), assets: z.array(z.object({ id: z.string() }).passthrough()) }).parse(source);
  return ids.map((id) => {
    const matches = parsed.assets.filter((asset) => asset.id === id);
    if (matches.length !== 1) throw new Error("Public media manifest must contain one of each approved screenshot.");
    return mediaSchema.parse(matches[0]);
  });
}
export const publicMedia = projectPublicMedia(manifest);
export type PublicMedia = ReturnType<typeof projectPublicMedia>[number];
