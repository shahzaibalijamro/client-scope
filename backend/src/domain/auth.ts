import type { NextFunction, Request, RequestHandler, Response } from "express";
import mongoose from "mongoose";

import { ApiError } from "../errors.js";
import { Session, User, type UserRecord } from "./models.js";
import { hashToken, parseCookies, SESSION_COOKIE } from "./security.js";

export type AuthRequest = Request & {
  auth?: {
    user: UserRecord;
    sessionId: mongoose.Types.ObjectId;
  };
};

export const resolveSession: RequestHandler = async (request: AuthRequest, _response, next) => {
  try {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (!token) return next();
    const session = await Session.findOne({
      tokenHash: hashToken(token), revokedAt: { $exists: false }, expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) return next();
    const user = await User.findById(session.userId).lean<UserRecord>();
    if (user) request.auth = { user, sessionId: session._id };
    next();
  } catch (error) {
    next(error);
  }
};

export function requireUser(request: AuthRequest): NonNullable<AuthRequest["auth"]> {
  if (!request.auth) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue.");
  return request.auth;
}

export function requireVerified(request: AuthRequest): NonNullable<AuthRequest["auth"]> {
  const auth = requireUser(request);
  if (!auth.user.verifiedAt) {
    throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email to continue.");
  }
  return auth;
}

export function asyncRoute(
  handler: (request: AuthRequest, response: Response) => Promise<void>,
): RequestHandler {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}
