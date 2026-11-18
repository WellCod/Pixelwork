import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

/** Corpo validado ou 400 já respondido com os problemas encontrados. */
export async function parseBody<T extends z.ZodType>(
  schema: T,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(request.body);
  if (parsed.success) return parsed.data;
  await reply.code(400).send({
    error: 'invalid_body',
    issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return null;
}

/** O Drizzle embrulha o erro do pg em `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
