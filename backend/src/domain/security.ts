import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import argon2 from "argon2";
import type { Request, Response } from "express";

import { ApiError } from "../errors.js";

export const SESSION_COOKIE = "clientscope_session";
export const CSRF_CONTEXT_COOKIE = "clientscope_csrf_context";
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export async function hashPassword(value: string): Promise<string> {
  return argon2.hash(value, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, value: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, value);
  } catch {
    return false;
  }
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]];
    }),
  );
}

function cookieSecurity(): boolean {
  return process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test";
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecurity(),
    sameSite: "lax",
    path: "/api",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: cookieSecurity(),
    sameSite: "lax",
    path: "/api",
  });
}

function csrfToken(context: string): string {
  const secret = process.env.SESSION_SECRET ?? "test-only-clientscope-session-secret-change-me";
  return createHmac("sha256", secret).update(context).digest("base64url");
}

export function rotateCsrf(response: Response): string {
  const context = randomToken();
  response.cookie(CSRF_CONTEXT_COOKIE, context, {
    httpOnly: true,
    secure: cookieSecurity(),
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_LIFETIME_MS,
  });
  return csrfToken(context);
}

export function currentCsrf(request: Request, response: Response): string {
  const context = parseCookies(request)[CSRF_CONTEXT_COOKIE];
  return context ? csrfToken(context) : rotateCsrf(response);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertBrowserMutation(request: Request): void {
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  const origin = request.get("origin");
  if (!origin || origin !== allowedOrigin) {
    throw new ApiError(403, "ORIGIN_REJECTED", "The request origin is not allowed.");
  }
  const context = parseCookies(request)[CSRF_CONTEXT_COOKIE];
  const presented = request.get("x-csrf-token");
  if (!context || !presented || !safeEqual(csrfToken(context), presented)) {
    throw new ApiError(403, "CSRF_REJECTED", "The security token is missing or stale.");
  }
}
