import type { ApiErrorCode } from "@siparis/shared";

/** An expected error that is sent to the client as `{ error: { code, message, details } }`. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Not logged in");
export const forbidden = (message = "Not allowed") => new AppError(403, "FORBIDDEN", message);
export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (field: string, message: string) =>
  new AppError(409, "CONFLICT", message, { field });
