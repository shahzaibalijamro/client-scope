export function validatePublicOrigin(value: string | undefined, environment: string | undefined): string {
  if (!value) throw new Error("FRONTEND_ORIGIN is required.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("FRONTEND_ORIGIN must be a valid origin."); }
  if (url.origin !== value || url.username || url.password || !["http:", "https:"].includes(url.protocol) ||
      (url.protocol !== "https:" && environment !== "development" && environment !== "test")) {
    throw new Error("FRONTEND_ORIGIN must be an HTTPS origin; HTTP is permitted only in development/test.");
  }
  return value;
}

export function applicationEmailUrl(origin: string, path: string, environment: string | undefined): string {
  validatePublicOrigin(origin, environment);
  const allowed = /^(?:\/(?:work|sign-in)|\/(?:verify|reset-password)\?token=[A-Za-z0-9_-]{43}|\/invite\/[A-Za-z0-9_-]{43}|\/projects\/[a-f\d]{24}\/(?:scope|changes|deliverables|overview))$/iu;
  if (/[\s\\%#]/u.test(path) || !allowed.test(path)) throw new Error("Unsafe email destination.");
  return `${origin}${path}`;
}
