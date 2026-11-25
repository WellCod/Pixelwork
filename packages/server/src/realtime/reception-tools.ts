import { zoneAt, type CompiledMap, type ReceptionDestination } from '@pixelwork/shared';
import { z } from 'zod';

const query = z.string().trim().min(1).max(80);
const Command = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('list_online_people'), query: query.optional() }),
  z.strictObject({ name: z.literal('locate_place'), query }),
  z.strictObject({ name: z.literal('explain_locked_room'), query }),
]);

export interface ReceptionDirectory {
  map: CompiledMap;
  online: readonly OnlinePerson[];
  isLocked: (key: string) => boolean;
}

interface OnlinePerson { id: string; name: string; x: number; y: number; activity: string }

const MAX_RESULTS = 8;
const display = (text: string) => Array.from(text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim()).slice(0, 80).join('');
const searchable = (text: string) => display(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const match = (text: string, needle: string) => searchable(text).includes(needle);

function unique<T>(matches: readonly T[], exact: (entry: T) => boolean): T | undefined {
  const exactMatches = matches.filter(exact);
  const candidates = exactMatches.length ? exactMatches : matches;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** O chamador interno só fornece um snapshot do coworking vinculado ao atendimento. */
export function readReceptionTool(
  directory: ReceptionDirectory,
  input: unknown,
  highlight: (destination: ReceptionDestination | null) => void,
): unknown {
  const parsed = Command.safeParse(input);
  if (!parsed.success) return { error: 'invalid_tool' };
  const command = parsed.data;
  const { map } = directory;
  const needle = searchable(command.query ?? '');
  const peopleResult = (people: readonly OnlinePerson[]) => {
    if (needle) {
      const person = unique(people, ({ name }) => searchable(name) === needle);
      highlight(person && person.activity !== 'call' && person.activity !== 'meeting' && zoneAt(map, person.x, person.y).type === 'open'
        ? { kind: 'person', id: person.id, label: display(person.name) }
        : null);
    }
    return { people: people.slice(0, MAX_RESULTS).map((person) => {
      const zone = zoneAt(map, person.x, person.y);
      const place = person.activity === 'call' ? 'Em chamada' : zone.type === 'meeting' ? 'Em reunião privada' : display(zone.name) || 'Área aberta';
      return { name: display(person.name), place };
    }), count: people.length };
  };
  if (command.name === 'list_online_people') {
    const people = directory.online.filter((person) => match(person.name, needle));
    return peopleResult(people);
  }

  const zones = map.zones.filter((zone) => zone.name && (match(zone.name, needle) || searchable(zone.key) === needle));
  if (command.name === 'explain_locked_room') {
    const rooms = zones.filter(({ type }) => type === 'meeting');
    return { rooms: rooms.slice(0, MAX_RESULTS).map((room) => ({ name: display(room.name), locked: directory.isLocked(room.key) })),
      instructions: 'Aproxime-se da porta, toque em Bater na porta e aguarde a autorização.' };
  }

  const deskNeedle = needle.replace(/\s+/g, '-');
  const deskKey = /^\d+$/.test(deskNeedle) ? `mesa-${deskNeedle}` : deskNeedle;
  const exactDesk = map.desks.find(({ key }) => key === deskKey);
  const desks = exactDesk ? [exactDesk] : map.desks.filter(({ key }) => match(key, deskNeedle));
  if (!zones.length && !desks.length) {
    const people = directory.online.filter(({ name }) => searchable(name) === needle);
    if (people.length) return peopleResult(people);
  }
  const matches: { destination: ReceptionDestination; exact: boolean }[] = [
    ...zones.map(({ key, name }) => ({
      destination: { kind: 'room' as const, key, label: display(name) },
      exact: searchable(name) === needle || key === needle,
    })),
    ...desks.map(({ key }) => ({
      destination: { kind: 'desk' as const, key, label: display(key) },
      exact: key === deskKey,
    })),
  ];
  highlight(unique(matches, ({ exact }) => exact)?.destination ?? null);
  return {
    rooms: zones.slice(0, MAX_RESULTS).map(({ name }) => display(name)),
    desks: desks.slice(0, MAX_RESULTS).map((desk) => ({ name: display(desk.key), place: display(zoneAt(map, desk.chairX, desk.chairY).name) || 'Área aberta' })),
  };
}
