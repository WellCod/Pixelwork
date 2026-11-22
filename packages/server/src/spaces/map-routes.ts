import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREDITS, compileMap, type MapError } from '@pixelwork/shared';
import { deskAssignments, spaces } from '@pixelwork/shared/schema';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { strToU8, zipSync } from 'fflate';
import { z } from 'zod';
import type { AuthDeps } from '../auth/routes.ts';
import { ASSETS_DIR } from '../assets.ts';
import { parseBody } from '../http.ts';
import { requireMember, type SpaceParams } from './access.ts';

/** Contrato do mapa: JSON de até 5 MB (docs/architecture.md, seção 6). */
export const MAX_MAP_BYTES = 5 * 1024 * 1024;

const ValidateBody = z.object({ map: z.unknown() });
const SaveBody = z.object({ map: z.unknown(), baseVersion: z.number().int().positive() });

function sizeErrors(map: unknown): MapError[] {
  return Buffer.byteLength(JSON.stringify(map ?? null)) > MAX_MAP_BYTES ? [{ code: 'too_large' }] : [];
}

export function registerMapRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps;

  const assignedKeys = async (spaceId: string) =>
    (
      await db
        .select({ deskKey: deskAssignments.deskKey })
        .from(deskAssignments)
        .where(eq(deskAssignments.spaceId, spaceId))
    ).map((r) => r.deskKey);

  /**
   * Gravação do replay (só admin): entradas da simulação desde a última troca de mapa. Sem
   * ninguém conectado desde que o servidor subiu, não há runtime e a gravação vem nula.
   */
  app.get<{ Params: SpaceParams }>('/spaces/:spaceId/replay', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    return { recording: app.realtime.runtime(access.spaceId)?.recording() ?? null };
  });

  /** Ensaio: erros do mapa e as mesas atribuídas que deixariam de existir. */
  app.post<{ Params: SpaceParams }>(
    '/spaces/:spaceId/map/validate',
    { bodyLimit: MAX_MAP_BYTES + 1024 * 1024 },
    async (request, reply) => {
      const access = await requireMember(deps, request, reply);
      if (!access) return reply;
      if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
      const body = await parseBody(ValidateBody, request, reply);
      if (!body) return reply;

      const result = compileMap(body.map);
      const errors = [...sizeErrors(body.map), ...(result.ok ? [] : result.errors)];
      if (!result.ok) return { errors, orphanDesks: [] };
      const keys = new Set(result.map.desks.map((d) => d.key));
      const orphanDesks = (await assignedKeys(access.spaceId)).filter((k) => !keys.has(k));
      return { errors, orphanDesks };
    },
  );

  app.put<{ Params: SpaceParams }>(
    '/spaces/:spaceId/map',
    { bodyLimit: MAX_MAP_BYTES + 1024 * 1024 },
    async (request, reply) => {
      const access = await requireMember(deps, request, reply);
      if (!access) return reply;
      if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
      const body = await parseBody(SaveBody, request, reply);
      if (!body) return reply;

      const result = compileMap(body.map);
      const errors = [...sizeErrors(body.map), ...(result.ok ? [] : result.errors)];
      if (!result.ok || errors.length > 0) return reply.code(422).send({ error: 'invalid_map', errors });
      const deskKeys = result.map.desks.map((d) => d.key);
      const { spaceId } = access;

      // Mapa, versão e atribuições órfãs numa transação só: ou tudo, ou nada.
      const saved = await db.transaction(async (tx) => {
        const updated = await tx
          .update(spaces)
          .set({ map: body.map, mapVersion: sql`${spaces.mapVersion} + 1` })
          .where(and(eq(spaces.id, spaceId), eq(spaces.mapVersion, body.baseVersion)))
          .returning({ version: spaces.mapVersion });
        const version = updated[0]?.version;
        if (version === undefined) return null;
        const orphans = await tx
          .delete(deskAssignments)
          .where(
            deskKeys.length > 0
              ? and(eq(deskAssignments.spaceId, spaceId), notInArray(deskAssignments.deskKey, deskKeys))
              : eq(deskAssignments.spaceId, spaceId),
          )
          .returning({ deskKey: deskAssignments.deskKey });
        return { version, orphanDesks: orphans.map((o) => o.deskKey) };
      });

      if (!saved) {
        const current = await db.select({ version: spaces.mapVersion }).from(spaces).where(eq(spaces.id, spaceId));
        return reply.code(409).send({ error: 'stale_map', version: current[0]?.version ?? null });
      }
      app.realtime.runtime(spaceId)?.replaceMap(result.map, saved.version);
      return saved;
    },
  );

  /** Zip que abre no Tiled: map.json, os tilesets referenciados e os créditos. */
  app.get<{ Params: SpaceParams }>('/spaces/:spaceId/map/export', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    const rows = await db
      .select({ map: spaces.map, slug: spaces.slug })
      .from(spaces)
      .where(eq(spaces.id, access.spaceId));
    const row = rows[0];
    const result = row ? compileMap(row.map) : null;
    if (!row || !result?.ok) return reply.code(500).send({ error: 'stored_map_invalid' });

    const files: Record<string, Uint8Array> = { 'map.json': strToU8(`${JSON.stringify(row.map, null, 1)}\n`) };
    for (const id of result.map.tilesets) {
      for (const ext of ['tsj', 'png']) {
        files[`${id}.${ext}`] = readFileSync(join(ASSETS_DIR, 'tilesets', `${id}.${ext}`));
      }
    }
    files['CREDITS.txt'] = strToU8(creditsText(result.map.tilesets));

    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${row.slug}-mapa.zip"`)
      .send(Buffer.from(zipSync(files)));
  });
}

/** Créditos dos tilesets do zip; tudo no repositório pode ser redistribuído (docs/art.md, seção 7). */
export function creditsText(tilesets: readonly string[]): string {
  const lines = CREDITS.filter((c) => c.kind === 'tileset' && tilesets.includes(c.id)).map(
    (c) => `${c.id}.png: ${c.author}, licença ${c.license}${c.source ? `, ${c.source}` : ''}`,
  );
  return `Créditos dos tilesets deste mapa\n\n${lines.join('\n')}\n`;
}
