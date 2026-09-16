import type { ErrorRequestHandler, RequestHandler } from "express";

import { logDiagnostic } from "./logger.js";

export type ErrorDetails = Readonly<Record<string, unknown>>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, "NOT_FOUND", "The requested resource was not found."));
};

function isMalformedJson(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400 &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  void _next;
  const apiError =
    error instanceof ApiError
      ? error
      : isMalformedJson(error)
        ? new ApiError(400, "INVALID_REQUEST", "The request could not be understood.")
        : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");

  response.locals.errorCode = apiError.code;

  if (!(error instanceof ApiError) && !isMalformedJson(error)) {
    logDiagnostic("error", "request.unexpected_error", {
      method: request.method,
      path: request.path,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }

  const body: {
    error: {
      code: string;
      message: string;
      details?: ErrorDetails;
    };
  } = {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  };

  if (apiError.details !== undefined) {
    body.error.details = apiError.details;
  }

  if ((apiError.code === "DEMO_RESET_IN_PROGRESS" || apiError.code === "DEMO_QUOTA_EXCEEDED") && typeof apiError.details?.retryAt === "string") {
    const seconds = Math.max(1, Math.ceil((Date.parse(apiError.details.retryAt) - Date.now()) / 1_000));
    response.setHeader("Retry-After", String(Math.min(seconds, 86_400)));
  }

  response.status(apiError.status).json(body);
};
