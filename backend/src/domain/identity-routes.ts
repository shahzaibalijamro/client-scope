import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { validateRequest } from "../validation.js";
import { asyncRoute, requireUser, requireVerified, type AuthRequest } from "./auth.js";
import { developmentEmail, type EmailService } from "./email.js";
import { AccountToken, Session, Throttle, User } from "./models.js";
import {
  assertBrowserMutation, clearSessionCookie, currentCsrf, hashPassword, hashToken,
  normalizeEmail, randomToken, rotateCsrf, SESSION_LIFETIME_MS,
  setSessionCookie, verifyPassword,
} from "./security.js";
import { displayName, email, password } from "./validation.js";

const verificationLifetime = 24 * 60 * 60 * 1_000;
const resetLifetime = 60 * 60 * 1_000;

async function throttle(key: string): Promise<void> {
  const now = new Date();
  const record = await Throttle.findOne({ key });
  if (!record || record.resetAt <= now) {
    await Throttle.findOneAndUpdate(
      { key }, { count: 1, resetAt: new Date(now.valueOf() + 15 * 60 * 1_000) }, { upsert: true },
    );
    return;
  }
  if (record.count >= Number(process.env.AUTH_THROTTLE_LIMIT ?? 12)) {
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  await Throttle.updateOne({ _id: record._id }, { $inc: { count: 1 } });
}

async function issueAccountToken(
  userId: mongoose.Types.ObjectId,
  type: "verification" | "password-reset",
): Promise<string> {
  const raw = randomToken();
  const now = new Date();
  await AccountToken.updateMany(
    { userId, type, consumedAt: { $exists: false }, replacedAt: { $exists: false } },
    { $set: { replacedAt: now } },
  );
  await AccountToken.create({
    userId, type, tokenHash: hashToken(raw),
    expiresAt: new Date(now.valueOf() + (type === "verification" ? verificationLifetime : resetLifetime)),
  });
  return raw;
}

async function createSession(userId: mongoose.Types.ObjectId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await Session.create({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

function publicUser(user: { _id: unknown; email: string; displayName: string; verifiedAt?: Date | null }) {
  return {
    id: String(user._id), email: user.email, displayName: user.displayName,
    verified: Boolean(user.verifiedAt),
  };
}

export function createIdentityRouter(emailService: EmailService = developmentEmail): Router {
  const router = Router();
  router.get("/csrf", (request, response) => response.json({ csrfToken: currentCsrf(request, response) }));

  router.post(
    "/auth/signup",
    validateRequest("body", z.object({ email, password, displayName })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const body = request.body as { email: string; password: string; displayName: string };
      const normalizedEmail = normalizeEmail(body.email);
      await throttle(`signup:${normalizedEmail}:${request.ip ?? "unknown"}`);
      const existing = await User.findOne({ normalizedEmail });
      if (existing) {
        await emailService.send({
          category: "duplicate-signup", to: existing.email, subject: "Your ClientScope account",
          text: "An account already exists. Sign in or request a password reset.",
        });
        response.status(202).json({ message: "Check your email for the next step." });
        return;
      }
      const user = await User.create({
        email: body.email.trim(), normalizedEmail, displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
      });
      const verificationToken = await issueAccountToken(user._id, "verification");
      const delivery = await emailService.send({
        category: "verification", to: user.email, subject: "Verify your ClientScope account",
        text: `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/verify?token=${verificationToken}`,
      });
      const session = await createSession(user._id);
      setSessionCookie(response, session.token, session.expiresAt);
      response.status(201).json({
        user: publicUser(user), csrfToken: rotateCsrf(response),
        warning: delivery.delivered ? undefined : "Verification email could not be delivered. Request another link.",
      });
    }),
  );

  router.post(
    "/auth/signin",
    validateRequest("body", z.object({ email, password })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const body = request.body as { email: string; password: string };
      const normalizedEmail = normalizeEmail(body.email);
      await throttle(`signin:${normalizedEmail}:${request.ip ?? "unknown"}`);
      const user = await User.findOne({ normalizedEmail });
      const valid = user ? await verifyPassword(user.passwordHash, body.password) : false;
      if (!user || !valid) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
      }
      const session = await createSession(user._id);
      setSessionCookie(response, session.token, session.expiresAt);
      response.json({ user: publicUser(user), csrfToken: rotateCsrf(response) });
    }),
  );

  router.get("/auth/session", asyncRoute(async (request: AuthRequest, response) => {
    if (!request.auth) { response.json({ user: null }); return; }
    response.json({ user: publicUser(request.auth.user) });
  }));

  router.post("/auth/logout", asyncRoute(async (request, response) => {
    assertBrowserMutation(request);
    if (request.auth) await Session.updateOne({ _id: request.auth.sessionId }, { $set: { revokedAt: new Date() } });
    clearSessionCookie(response);
    response.json({ message: "Signed out.", csrfToken: rotateCsrf(response) });
  }));

  router.post("/auth/verification/reissue", asyncRoute(async (request, response) => {
    assertBrowserMutation(request);
    const { user } = requireUser(request);
    if (user.verifiedAt) { response.json({ message: "Your email is already verified." }); return; }
    await throttle(`verification:${user.normalizedEmail}:${request.ip ?? "unknown"}`);
    const token = await issueAccountToken(user._id, "verification");
    const result = await emailService.send({
      category: "verification", to: user.email, subject: "Verify your ClientScope account",
      text: `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/verify?token=${token}`,
    });
    response.json({
      message: "A replacement verification link was requested.",
      warning: result.delivered ? undefined : "The email could not be delivered. Try again later.",
    });
  }));

  router.post(
    "/auth/verify",
    validateRequest("body", z.object({ token: z.string().min(20) })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const now = new Date();
      const token = await AccountToken.findOne({
        type: "verification", tokenHash: hashToken((request.body as { token: string }).token),
        consumedAt: { $exists: false }, replacedAt: { $exists: false }, expiresAt: { $gt: now },
      });
      if (!token) throw new ApiError(410, "TOKEN_UNAVAILABLE", "This verification link is unavailable or expired.");
      const updated = await AccountToken.findOneAndUpdate(
        { _id: token._id, consumedAt: { $exists: false } }, { $set: { consumedAt: now } }, { new: true },
      );
      if (!updated) throw new ApiError(409, "STALE_STATE", "This verification link has already been used.");
      await User.updateOne({ _id: token.userId }, { $set: { verifiedAt: now } });
      const matchingSession = request.auth && String(request.auth.user._id) === String(token.userId);
      response.json({ message: "Email verified.", signedIn: Boolean(matchingSession) });
    }),
  );

  router.post(
    "/auth/forgot-password",
    validateRequest("body", z.object({ email })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const normalizedEmail = normalizeEmail((request.body as { email: string }).email);
      await throttle(`reset:${normalizedEmail}:${request.ip ?? "unknown"}`);
      const user = await User.findOne({ normalizedEmail });
      if (user) {
        const token = await issueAccountToken(user._id, "password-reset");
        await emailService.send({
          category: "password-reset", to: user.email, subject: "Reset your ClientScope password",
          text: `${process.env.FRONTEND_ORIGIN ?? "http://localhost:3000"}/reset-password?token=${token}`,
        });
      }
      response.status(202).json({ message: "If the account can receive email, a reset link is on its way." });
    }),
  );

  router.post(
    "/auth/reset-password",
    validateRequest("body", z.object({ token: z.string().min(20), password, confirmation: password }).refine(
      (value) => value.password === value.confirmation,
      { path: ["confirmation"], message: "Passwords must match." },
    )),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const body = request.body as { token: string; password: string };
      const now = new Date();
      const token = await AccountToken.findOne({
        type: "password-reset", tokenHash: hashToken(body.token), consumedAt: { $exists: false },
        replacedAt: { $exists: false }, expiresAt: { $gt: now },
      });
      if (!token) throw new ApiError(410, "TOKEN_UNAVAILABLE", "This reset link is unavailable or expired.");
      const passwordHash = await hashPassword(body.password);
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const used = await AccountToken.updateOne(
            { _id: token._id, consumedAt: { $exists: false } }, { $set: { consumedAt: now } }, { session },
          );
          if (used.modifiedCount !== 1) throw new ApiError(409, "STALE_STATE", "This reset link has already been used.");
          await User.updateOne({ _id: token.userId }, { $set: { passwordHash } }, { session });
          await Session.updateMany({ userId: token.userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now } }, { session });
        });
      } finally { await session.endSession(); }
      clearSessionCookie(response);
      response.json({ message: "Password changed. Sign in with your new password.", csrfToken: rotateCsrf(response) });
    }),
  );

  router.patch(
    "/account",
    validateRequest("body", z.object({ displayName })),
    asyncRoute(async (request, response) => {
      assertBrowserMutation(request);
      const { user } = requireVerified(request);
      const updated = await User.findByIdAndUpdate(
        user._id, { $set: { displayName: (request.body as { displayName: string }).displayName } }, { new: true },
      );
      response.json({ user: publicUser(updated!) });
    }),
  );
  return router;
}
