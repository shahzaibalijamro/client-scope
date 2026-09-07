import { z, type ZodType } from "zod";

export type ApiFailure = Error & { code?: string; status?: number; details?: unknown };

let csrfToken: string | undefined;

export function rememberCsrf(value: string | undefined): void {
  if (value) csrfToken = value;
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  let response: Response;
  try {
    response = await fetch("/api/v1/csrf", { credentials: "same-origin" });
  } catch {
    throw new Error("ClientScope is unavailable. Try again shortly.");
  }
  if (!response.ok) throw new Error("ClientScope could not establish a secure browser session.");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("ClientScope could not establish a secure browser session.");
  }
  const parsed = z.object({ csrfToken: z.string().min(1) }).strict().safeParse(body);
  if (!parsed.success) throw new Error("ClientScope could not establish a secure browser session.");
  csrfToken = parsed.data.csrfToken;
  return csrfToken;
}

export async function api<T>(path: string, init: RequestInit = {}, schema?: ZodType<T>): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (unsafe) headers.set("X-CSRF-Token", await ensureCsrf());
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new Error("ClientScope is unavailable. Try again shortly.");
  }
  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
  } catch {
    throw new Error("ClientScope returned an unreadable response.");
  }
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }).safeParse(body);
    const failure = new Error(parsed.success ? parsed.data.error.message : "The request could not be completed.") as ApiFailure;
    failure.code = parsed.success ? parsed.data.error.code : undefined;
    failure.status = response.status;
    failure.details = parsed.success ? parsed.data.error.details : undefined;
    if (failure.code === "CSRF_REJECTED") csrfToken = undefined;
    throw failure;
  }
  if (body && typeof body === "object" && "csrfToken" in body && typeof body.csrfToken === "string") {
    rememberCsrf(body.csrfToken);
  }
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("ClientScope returned an unexpected response. Refresh and try again.");
  return parsed.data;
}

export function json(method: string, value?: unknown): RequestInit {
  return { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) };
}
