import { MAP_TEMPLATES } from '@pixelwork/shared';
import { orgMembers, orgs, spaceMembers, spaces } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthDeps } from '../auth/routes.ts';
import { loadTemplate } from '../demo.ts';
import { isUniqueViolation, parseBody } from '../http.ts';
import { isUuid, uuidv7 } from '../ids.ts';

const Slug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'use letras minúsculas, números e hífen');
const Name = z
  .string()
  .trim()
  .min(1)
  .refine((v) => Array.from(v).length <= 60, { message: 'no máximo 60 caracteres' });

const OrgBody = z.object({ name: Name, slug: Slug });
const SpaceBody = z.object({
  name: Name,
  slug: Slug,
  template: z.enum(MAP_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
});

export function registerOrgRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps;

  app.get('/templates', () => MAP_TEMPLATES);

  app.post('/orgs', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    // A conta de convidado expira em 24 horas; empresa precisa de dono que fique.
    if (user.isGuest) return reply.code(403).send({ error: 'guest_forbidden' });
    const body = await parseBody(OrgBody, request, reply);
    if (!body) return reply;
    const id = uuidv7();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(orgs).values({ id, name: body.name, slug: body.slug });
        await tx.insert(orgMembers).values({ orgId: id, userId: user.id, role: 'owner' });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: 'slug_taken' });
      throw error;
    }
    return reply.code(201).send({ id, name: body.name, slug: body.slug });
  });

  app.post<{ Params: { orgId: string } }>('/orgs/:orgId/spaces', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    const { orgId } = request.params;
    const membership = isUuid(orgId)
      ? await db
          .select({ role: orgMembers.role })
          .from(orgMembers)
          .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
      : [];
    // Não membro da empresa recebe 404, como nos coworkings.
    if (membership.length === 0) return reply.code(404).send({ error: 'not_found' });
    const body = await parseBody(SpaceBody, request, reply);
    if (!body) return reply;

    const id = uuidv7();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(spaces).values({ id, orgId, name: body.name, slug: body.slug, map: loadTemplate(body.template) });
        await tx.insert(spaceMembers).values({ spaceId: id, userId: user.id, role: 'admin' });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: 'slug_taken' });
      throw error;
    }
    return reply.code(201).send({ id, name: body.name, slug: body.slug });
  });
}
