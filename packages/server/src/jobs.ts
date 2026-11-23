import { compileMap } from '@pixelwork/shared';
import { deskAssignments, sessions, spaces, users } from '@pixelwork/shared/schema';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { Db } from './db.ts';
import { findDemoSpaceId, loadTemplate } from './demo.ts';
import type { Clock, Scheduler } from './realtime/clock.ts';
import type { Gateway } from './realtime/gateway.ts';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** Reset da demo às 03:00 UTC (meia-noite em Brasília), quando quase ninguém está online. */
export const DEMO_RESET_UTC_HOUR = 3;
export const DEMO_TEMPLATE = 'small-office';

export interface JobDeps {
  db: Db;
  clock: Clock;
  scheduler: Scheduler;
  gateway: Gateway;
  demoSpaceSlug: string;
  log: { info: (details: unknown, message: string) => void; error: (details: unknown, message: string) => void };
}

/** Apaga convidados expirados; a cascata leva sessões, participações e mesas. */
export async function cleanupExpiredGuests(deps: JobDeps): Promise<string[]> {
  const now = new Date(deps.clock.now());
  const removed = await deps.db
    .delete(users)
    .where(and(eq(users.isGuest, true), lte(users.guestExpiresAt, now)))
    .returning({ id: users.id });
  const removedUserIds = removed.map((row) => row.id);
  // Quem ainda estava online sai do mapa e tem a mesa liberada na hora.
  deps.gateway.forEachRuntime((runtime) => {
    for (const userId of removedUserIds) runtime.removeMember(userId);
  });
  return removedUserIds;
}

/** Sessões de conta vencidas; as de convidado já saem pela cascata do usuário. */
export async function cleanupExpiredSessions(deps: Pick<JobDeps, 'db' | 'clock'>): Promise<number> {
  const removed = await deps.db
    .delete(sessions)
    .where(lte(sessions.expiresAt, new Date(deps.clock.now())))
    .returning({ userId: sessions.userId });
  return removed.length;
}

/** Restaura o mapa da demo a partir do template e limpa as atribuições de mesa. */
export async function resetDemo(deps: JobDeps): Promise<number | null> {
  const spaceId = await findDemoSpaceId(deps.db, deps.demoSpaceSlug);
  if (!spaceId) return null;
  const template = loadTemplate(DEMO_TEMPLATE);
  const compiled = compileMap(template);
  if (!compiled.ok) throw new Error('template da demo não compila');

  // Mesas e mapa trocam juntos; o mapVersion sobe para os clientes saberem que o mapa mudou.
  const version = await deps.db.transaction(async (tx) => {
    await tx.delete(deskAssignments).where(eq(deskAssignments.spaceId, spaceId));
    const updated = await tx
      .update(spaces)
      .set({ map: template, mapVersion: sql`${spaces.mapVersion} + 1` })
      .where(eq(spaces.id, spaceId))
      .returning({ version: spaces.mapVersion });
    return updated[0]?.version ?? null;
  });
  if (version === null) return null;
  // Coworking carregado em memória recebe o mapa novo sem esperar reconexão.
  const runtime = deps.gateway.runtime(spaceId);
  runtime?.clearDesks();
  runtime?.replaceMap(compiled.map, version);
  return version;
}

/** Próximo instante do reset (03:00 UTC estritamente depois de `now`). */
export function nextDemoReset(now: number): number {
  const date = new Date(now);
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), DEMO_RESET_UTC_HOUR);
  return target > now ? target : target + DAY_MS;
}

/** Agenda os dois jobs no próprio processo, com relógio e agendador injetáveis. */
export function scheduleJobs(deps: JobDeps): { stop: () => void } {
  // Cada job roda solto: erro só vai para o log e não derruba o agendamento.
  const runJob = (name: string, job: () => Promise<unknown>) => {
    job().then(
      (result) => deps.log.info({ job: name, result }, 'job concluído'),
      (error: unknown) => deps.log.error({ job: name, error }, 'job falhou'),
    );
  };
  const hourlyCleanup = deps.scheduler.setInterval(() => {
    runJob('limpeza de convidados', () => cleanupExpiredGuests(deps));
    runJob('limpeza de sessões', () => cleanupExpiredSessions(deps));
  }, HOUR_MS);
  // O reset espera até a próxima 03:00 UTC e daí em diante repete a cada 24 horas.
  let dailyReset: { cancel: () => void } | null = null;
  const firstReset = deps.scheduler.setTimeout(() => {
    runJob('reset da demo', () => resetDemo(deps));
    dailyReset = deps.scheduler.setInterval(() => runJob('reset da demo', () => resetDemo(deps)), DAY_MS);
  }, nextDemoReset(deps.clock.now()) - deps.clock.now());
  return {
    stop: () => {
      hourlyCleanup.cancel();
      firstReset.cancel();
      dailyReset?.cancel();
    },
  };
}
