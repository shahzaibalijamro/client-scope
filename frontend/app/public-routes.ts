export const authEntryPaths = ["/sign-in", "/sign-up", "/forgot-password"] as const;
export type AuthMode = "signin" | "signup" | "forgot";
export function authMode(path: string): AuthMode {
  return path === "/sign-up" ? "signup" : path === "/forgot-password" ? "forgot" : "signin";
}
export function hasDemoIntent(search: Pick<URLSearchParams, "getAll">): boolean {
  const values = search.getAll("intent");
  return values.length === 1 && values[0] === "demo";
}
export function safePendingDestination(path: string | null | undefined): string | undefined {
  if (!path || /[\s%\\?#]/u.test(path)) return undefined;
  if (/^\/invite\/[A-Za-z0-9_-]{43}$/u.test(path)) return path;
  if (/^\/projects\/[a-f\d]{24}(?:\/(?:overview|scope|changes|milestones|deliverables|activity|settings))?$/iu.test(path)) return path;
  return undefined;
}
const pendingKey = "clientscope:returnTo";
export function rememberDestination(path: string): void {
  const safe = safePendingDestination(path);
  if (safe) { try { sessionStorage.setItem(pendingKey, safe); } catch { /* Storage may be disabled. */ } }
}
export function pendingDestination(consume = false): string | undefined {
  try {
    const path = safePendingDestination(sessionStorage.getItem(pendingKey));
    if (consume || !path) sessionStorage.removeItem(pendingKey);
    return path;
  } catch { return undefined; }
}
export function clearPendingDestination(): void {
  try { sessionStorage.removeItem(pendingKey); } catch { /* Storage may be disabled. */ }
}
