import type { FastifyInstance } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defesa extra contra CSRF além do SameSite=Lax: rotas que alteram estado exigem
 * Origin igual ao do app e corpo JSON (formulário cross-site não consegue mandar).
 */
export function registerStateGuards(app: FastifyInstance, publicUrl: string): void {
  const origin = new URL(publicUrl).origin;
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (request.headers.origin !== origin) {
      return reply.code(403).send({ error: 'bad_origin' });
    }
    const type = request.headers['content-type'] ?? '';
    if (!/^application\/json(\s*;|$)/i.test(type)) {
      return reply.code(415).send({ error: 'json_required' });
    }
  });
}
