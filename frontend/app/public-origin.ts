/** Server configuration only. Never derive public URLs from request headers. */
export function validatePublicOrigin(value: string | undefined, environment: string | undefined, localContainer = false): string {
  if (!value) throw new Error("FRONTEND_ORIGIN is required.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("FRONTEND_ORIGIN must be a valid origin."); }
  if (url.origin !== value || url.username || url.password ||
      !["http:", "https:"].includes(url.protocol) ||
      (url.protocol !== "https:" && environment !== "development" && environment !== "test" && !(localContainer && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("FRONTEND_ORIGIN must be an HTTPS origin; HTTP is permitted only in development/test.");
  }
  return value;
}
