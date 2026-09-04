export type ApiFailure = Error & { code?: string; status?: number; details?: unknown };

let csrfToken: string | undefined;

export function rememberCsrf(value: string | undefined): void {
  if (value) csrfToken = value;
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/v1/csrf", { credentials: "same-origin" });
  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (unsafe) headers.set("X-CSRF-Token", await ensureCsrf());
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "same-origin" });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    const failure = new Error(body?.error?.message ?? "The request could not be completed.") as ApiFailure;
    failure.code = body?.error?.code; failure.status = response.status; failure.details = body?.error?.details;
    if (failure.code === "CSRF_REJECTED") csrfToken = undefined;
    throw failure;
  }
  rememberCsrf(body?.csrfToken);
  return body as T;
}

export function json(method: string, value?: unknown): RequestInit {
  return { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) };
}
