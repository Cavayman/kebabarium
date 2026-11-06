import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from './env';
import { ApiError } from './errors';

/** Parses the JSON body with a zod schema; 400 `validation_error` with the first issue otherwise. */
export async function body<S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation_error', 'Body must be JSON');
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ApiError(400, 'validation_error', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`);
  }
  return r.data;
}
