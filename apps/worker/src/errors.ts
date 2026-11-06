import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Throw from any route/service to produce `{ error: { code, message, ...extra } }` with the given status. */
export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string = code,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
