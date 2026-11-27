import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREDITS, compileMap, type MapError } from '@pixelwork/shared';
import { deskAssignments, spaceMapVersions, spaces } from '@pixelwork/shared/schema';
import { and, desc, eq, lte, notInArray, sql } from 'drizzle-orm';
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
const MAP_HISTORY_LIMIT = 20;

/** Erro de tamanho no mesmo formato dos erros do compileMap, para a resposta juntar os dois. */
function sizeErrors(map: unknown): MapError[] {
  return Buffer.byteLength(JSON.stringify(map ?? null)) > MAX_MAP_BYTES ? [{ code: 'too_large' }] : [];
}

/** Editor de mapa, gravação com controle de versão e rotas de exportação e replay. */
export function registerMapRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps;

  /** Chaves das mesas com dono no coworking. */
  const assignedDeskKeys = async (spaceId: string) =>
    (
      await db
        .select({ deskKey: deskAssignments.deskKey })
        .from(deskAssignments)
        .where(eq(deskAssignments.spaceId, spaceId))
    ).map((row) => row.deskKey);

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

  app.get<{ Params: SpaceParams }>('/spaces/:spaceId/map/history', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    return db.select({ version: spaceMapVersions.version, author: spaceMapVersions.author, createdAt: spaceMapVersions.createdAt })
      .from(spaceMapVersions).where(eq(spaceMapVersions.spaceId, access.spaceId))
      .orderBy(desc(spaceMapVersions.version)).limit(MAP_HISTORY_LIMIT);
  });

  app.get<{ Params: SpaceParams & { version: string } }>('/spaces/:spaceId/map/history/:version', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    const { data: version, success } = z.coerce.number().int().positive().max(2147483647).safeParse(request.params.version);
    if (!success) return reply.code(404).send({ error: 'not_found' });
    const [entry] = await db.select({ map: spaceMapVersions.map }).from(spaceMapVersions)
      .where(and(eq(spaceMapVersions.spaceId, access.spaceId), eq(spaceMapVersions.version, version)));
    return entry ?? reply.code(404).send({ error: 'not_found' });
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
      const newDeskKeys = new Set(result.map.desks.map((desk) => desk.key));
      const orphanDesks = (await assignedDeskKeys(access.spaceId)).filter((deskKey) => !newDeskKeys.has(deskKey));
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
      const deskKeys = result.map.desks.map((desk) => desk.key);
      const { spaceId } = access;

      // Mapa, versão e atribuições órfãs numa transação só: ou tudo, ou nada. O update só pega
      // se a versão no banco ainda for a que o editor abriu (baseVersion); senão é 409 stale_map.
      const saved = await db.transaction(async (tx) => {
        const [previous] = await tx.select({ map: spaces.map }).from(spaces)
          .where(and(eq(spaces.id, spaceId), eq(spaces.mapVersion, body.baseVersion))).for('update');
        if (!previous) return null;
        const updated = await tx
          .update(spaces)
          .set({ map: body.map, mapVersion: sql`${spaces.mapVersion} + 1` })
          .where(and(eq(spaces.id, spaceId), eq(spaces.mapVersion, body.baseVersion)))
          .returning({ version: spaces.mapVersion });
        const version = updated[0]?.version;
        if (version === undefined) return null;
        await tx.insert(spaceMapVersions).values([
          { spaceId, version: body.baseVersion, map: previous.map },
          { spaceId, version, map: body.map, author: access.user.displayName, createdAt: new Date(deps.clock.now()) },
        ]).onConflictDoNothing();
        await tx.delete(spaceMapVersions).where(and(eq(spaceMapVersions.spaceId, spaceId),
          lte(spaceMapVersions.version, version - MAP_HISTORY_LIMIT)));
        // Mapa sem mesa nenhuma: o notInArray com lista vazia não serve, então apaga todas.
        const orphans = await tx
          .delete(deskAssignments)
          .where(
            deskKeys.length > 0
              ? and(eq(deskAssignments.spaceId, spaceId), notInArray(deskAssignments.deskKey, deskKeys))
              : eq(deskAssignments.spaceId, spaceId),
          )
          .returning({ deskKey: deskAssignments.deskKey });
        return { version, orphanDesks: orphans.map((orphan) => orphan.deskKey) };
      });

      if (!saved) {
        // Devolve a versão atual para o editor saber de quanto ficou para trás.
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
    for (const tilesetId of result.map.tilesets) {
      for (const extension of ['tsj', 'png']) {
        files[`${tilesetId}.${extension}`] = readFileSync(join(ASSETS_DIR, 'tilesets', `${tilesetId}.${extension}`));
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
  const lines = CREDITS.filter((credit) => credit.kind === 'tileset' && tilesets.includes(credit.id)).map(
    (credit) => `${credit.id}.png: ${credit.author}, licença ${credit.license}${credit.source ? `, ${credit.source}` : ''}`,
  );
  return `Créditos dos tilesets deste mapa\n\n${lines.join('\n')}\n`;
}
