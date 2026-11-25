import { zoneAt, type CompiledMap } from '@pixelwork/shared';
import { z } from 'zod';

const query = z.string().trim().min(1).max(80);
const Command = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('list_online_people'), query: query.optional() }),
  z.strictObject({ name: z.literal('locate_place'), query }),
  z.strictObject({ name: z.literal('explain_locked_room'), query }),
]);

export interface ReceptionDirectory {
  map: CompiledMap;
  online: readonly { name: string; x: number; y: number; activity: string }[];
  isLocked: (key: string) => boolean;
}

const MAX_RESULTS = 8;
const display = (text: string) => Array.from(text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim()).slice(0, 80).join('');
const searchable = (text: string) => display(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const match = (text: string, needle: string) => searchable(text).includes(needle);

/** O chamador interno só fornece um snapshot do coworking vinculado ao atendimento. */
export function readReceptionTool(directory: ReceptionDirectory, input: unknown): unknown {
  const parsed = Command.safeParse(input);
  if (!parsed.success) return { error: 'invalid_tool' };
  const command = parsed.data;
  const { map } = directory;
  const needle = searchable(command.query ?? '');
  if (command.name === 'list_online_people') {
    const people = directory.online.filter((person) => match(person.name, needle));
    return { people: people.slice(0, MAX_RESULTS).map((person) => {
      const zone = zoneAt(map, person.x, person.y);
      const place = person.activity === 'call' ? 'Em chamada' : zone.type === 'meeting' ? 'Em reunião privada' : display(zone.name) || 'Área aberta';
      return { name: display(person.name), place };
    }), count: people.length };
  }

  const zones = map.zones.filter((zone) => zone.name && (match(zone.name, needle) || searchable(zone.key) === needle));
  if (command.name === 'explain_locked_room') {
    const rooms = zones.filter(({ type }) => type === 'meeting');
    return { rooms: rooms.slice(0, MAX_RESULTS).map((room) => ({ name: display(room.name), locked: directory.isLocked(room.key) })),
      instructions: 'Aproxime-se da porta, toque em Bater na porta e aguarde a autorização.' };
  }

  const desks = map.desks.filter(({ key }) => match(key, needle));
  return {
    rooms: zones.slice(0, MAX_RESULTS).map(({ name }) => display(name)),
    desks: desks.slice(0, MAX_RESULTS).map((desk) => ({ name: display(desk.key), place: display(zoneAt(map, desk.chairX, desk.chairY).name) || 'Área aberta' })),
  };
}
