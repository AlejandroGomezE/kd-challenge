import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NAME_TAKEN"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NAME_TAKEN: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return json(
      { error: { code: error.code, message: error.message, ...(error.fieldErrors && { fieldErrors: error.fieldErrors }) } },
      STATUS[error.code],
    );
  }
  console.error(error);
  return json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
}

/** Wraps a route handler so every thrown error leaves through the one error shape. */
export function handle<C>(fn: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      return await fn(request, context);
    } catch (error) {
      unstable_rethrow(error); // Next's own control-flow errors (e.g. prerender bail-out) aren't ours to handle
      return errorResponse(error);
    }
  };
}

/** JSON-only writes (a cross-site form can't send application/json without a CORS preflight). */
export async function parseJsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new AppError("VALIDATION_ERROR", "Invalid request", fieldErrors);
  }
  return result.data;
}
