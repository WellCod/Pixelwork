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
) {
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

export function answerReceptionText(text: string, read: (input: unknown) => ReturnType<typeof readReceptionTool>): string {
  const question = text.trim().replace(/[?.!]+$/, '');
  const normalized = searchable(question);
  if (/^(como (entrar|entro|acessar)|bater na porta)/.test(normalized)) {
    return 'Se a sala estiver trancada, vá até a porta, escolha Bater na porta e aguarde a autorização.';
  }
  const online = /^(quem esta online|quem esta aqui|quem esta no escritorio)$/.test(normalized);
  const place = /^(?:onde (?:fica|est[aá])|localizar)\s+(.+)$/i.exec(question)?.[1];
  if (online || place) {
    const query = (place ?? '').replace(/^(?:a|o)\s+/i, '').replace(/^sala\s+/i, '').slice(0, 80);
    const result = read(online ? { name: 'list_online_people' } : { name: 'locate_place', query });
    if ('people' in result) {
      if (!result.people.length) return online ? 'Ninguém está online agora.' : 'Não encontrei essa pessoa online.';
      const people = result.people.map(({ name, place }) => `${name} · ${place}`).join('\n');
      return result.count > result.people.length ? `${result.count} pessoas online.\n${people}` : people;
    }
    const names = [...(result.rooms ?? []).filter((room) => typeof room === 'string'),
      ...(result.desks ?? []).map(({ name, place }) => `${name} · ${place}`)];
    const [first, ...remaining] = names;
    if (first) return remaining.length ? `Encontrei mais de um destino.\n${names.join('\n')}` : `Encontrei ${first}.`;
    return online ? 'Ninguém está online agora.' : 'Não encontrei esse destino. Tente o nome exato no mapa.';
  }
  if (/^(como funciona|ajuda|oi|ola|jogos)$/.test(normalized)) {
    return 'Use Mapa para localizar salas, mesas e pessoas. Você pode conversar por proximidade e jogar na área de jogos.';
  }
  return 'Posso ajudar com o coworking. Pergunte onde fica uma sala ou mesa, quem está online ou como entrar em uma sala.';
}
