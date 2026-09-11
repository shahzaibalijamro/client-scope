import type { RequestHandler } from "express";
import type { ZodType } from "zod";

import { ApiError } from "./errors.js";

type RequestPart = "body" | "params" | "query";

export function validateRequest(part: RequestPart, schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request[part]);

    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || part,
        message: issue.message,
      }));

      next(
        new ApiError(400, "VALIDATION_ERROR", "The request contains invalid data.", {
          fields,
        }),
      );
      return;
    }

    if (part === "query") {
      Object.defineProperty(request, "query", { value: result.data, writable: true, configurable: true, enumerable: true });
    } else {
      request[part] = result.data;
    }
    next();
  };
}
