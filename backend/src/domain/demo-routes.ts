import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";

import { ApiError } from "../errors.js";
import { asyncRoute, type AuthRequest } from "./auth.js";
import { ClientMembership, Invitation, Project } from "./models.js";
import { hashToken } from "./security.js";
import { AccountToken } from "./models.js";
import type { DemoService } from "./demo-service.js";

function bearer(request: AuthRequest): string | undefined {
  const header = request.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export function createDemoRouter(demo: DemoService): Router {
  const router = Router();
  router.get("/demo", asyncRoute(async (_request, response) => { response.json(await demo.publicStatus()); }));
  router.post("/internal/demo/reset", asyncRoute(async (request, response) => {
    if (!demo.enabled || !demo.verifyResetSecret(bearer(request))) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    const forwardedProtocol = request.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (process.env.NODE_ENV === "production" && !request.secure && forwardedProtocol !== "https") {
      throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    }
    response.json(await demo.reset(request.get("x-demo-reset-source") === "scheduled" ? "scheduled" : "manual"));
  }));
  return router;
}

async function targetWorkspace(request: AuthRequest): Promise<mongoose.Types.ObjectId | undefined> {
  const workspaceMatch = request.path.match(/^\/workspaces\/([a-f\d]{24})(?:\/|$)/iu);
  if (workspaceMatch) return new mongoose.Types.ObjectId(workspaceMatch[1]);
  const projectMatch = request.path.match(/^\/projects\/([a-f\d]{24})(?:\/|$)/iu);
  if (projectMatch) return (await Project.findById(projectMatch[1]).select("workspaceId").lean())?.workspaceId;
  const invitationMatch = request.path.match(/^\/invitations\/([a-f\d]{24})(?:\/|$)/iu);
  if (invitationMatch) return (await Invitation.findById(invitationMatch[1]).select("workspaceId").lean())?.workspaceId;
  return undefined;
}

export function demoBoundary(demo: DemoService): RequestHandler {
  return (request: AuthRequest, response, next) => {
    void (async () => {
    if (!demo.enabled) { next(); return; }
    if (request.auth) {
      const generation = await demo.generationFor(request.auth.user._id);
      if (generation !== undefined) response.setHeader("X-ClientScope-Demo-Generation", String(generation));
    }
    const method = request.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) { next(); return; }

    if (request.path === "/workspaces" && request.auth && await demo.isCanonicalUser(request.auth.user._id)) throw demo.protectedError();
    if (request.path === "/account" && request.auth && await demo.isCanonicalUser(request.auth.user._id)) throw demo.protectedError();
    if (request.path === "/auth/forgot-password" && demo.isCanonicalEmail(String((request.body as { email?: unknown } | undefined)?.email ?? ""))) throw demo.protectedError();
    if (request.path === "/auth/reset-password") {
      const token = String((request.body as { token?: unknown } | undefined)?.token ?? "");
      const record = token ? await AccountToken.findOne({ tokenHash: hashToken(token), type: "password-reset" }).select("userId").lean() : null;
      if (record && await demo.isCanonicalUser(record.userId)) throw demo.protectedError();
    }

    const membershipMatch = request.path.match(/^\/projects\/[a-f\d]{24}\/client-members\/([a-f\d]{24})(?:\/role)?$/iu);
    if (membershipMatch) {
      const membership = await ClientMembership.findById(membershipMatch[1]).select("userId").lean();
      if (membership && await demo.isCanonicalUser(membership.userId)) throw demo.protectedError();
    }
    const workspaceMemberMatch = request.path.match(/^\/workspaces\/[a-f\d]{24}\/members\/([a-f\d]{24})$/iu);
    if (workspaceMemberMatch && await demo.isCanonicalUser(new mongoose.Types.ObjectId(workspaceMemberMatch[1]))) throw demo.protectedError();
    if (/^\/projects\/[a-f\d]{24}\/leave$/iu.test(request.path) && request.auth && await demo.isCanonicalUser(request.auth.user._id)) throw demo.protectedError();
    if (/^\/workspaces\/[a-f\d]{24}\/leave$/iu.test(request.path) && request.auth && await demo.isCanonicalUser(request.auth.user._id)) throw demo.protectedError();

    const workspaceId = await targetWorkspace(request);
    if (workspaceId) await demo.assertMutationAllowed(workspaceId);
      next();
    })().catch(next);
  };
}
