import type { ApiError, ApiErrorCode } from "@siparis/shared";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

const codeForStatus: Record<number, ApiErrorCode> = {
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

function body(code: ApiErrorCode, message: string, details?: Record<string, unknown>): ApiError {
  return { error: { code, message, ...(details && { details }) } };
}

/** Sends every error in the shared `{ error: { code, message, details? } }` shape. */
export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(body(error.code, error.message, error.details));
    }
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send(body("VALIDATION_FAILED", "Request is invalid", { issues: error.issues }));
    }

    // Fastify's own client errors, e.g. malformed JSON or an unsupported content type.
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 500;
    if (statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : "Bad request";
      return reply
        .code(statusCode)
        .send(body(codeForStatus[statusCode] ?? "VALIDATION_FAILED", message));
    }

    request.log.error(error);
    return reply.code(500).send(body("INTERNAL_ERROR", "Something went wrong"));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(body("NOT_FOUND", `Route ${request.method} ${request.url} not found`)),
  );
}
