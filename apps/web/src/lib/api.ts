import { apiErrorSchema, type ApiErrorCode } from "@siparis/shared";
import type { ZodType } from "zod";

export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "UNKNOWN";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Calls the API under /api and validates the response against the shared schema. */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...(init.body !== undefined && { "content-type": "application/json" }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Network error");
  }

  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, details);
    }
    throw new ApiRequestError(response.status, "UNKNOWN", `HTTP ${response.status}`);
  }
  return schema.parse(body);
}
