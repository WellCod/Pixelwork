import { z } from 'zod';

export const NAME_MAX = 40;
export const TITLE_MAX = 40;
export const STATUS_TEXT_MAX = 80;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// Pictograma, bandeira (indicador regional) ou keycap (1️⃣): o que o teclado de emoji produz.
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** Exatamente um grafema, e esse grafema é emoji. */
export function isSingleEmoji(value: string): boolean {
  // Conta grafemas, não code points: 👩‍💻 e 🇧🇷 são vários code points e um grafema só.
  const graphemes = [...graphemeSegmenter.segment(value)];
  return graphemes.length === 1 && EMOJI.test(value);
}

/** Tamanho em code points, como o `char_length` do Postgres. */
const codePoints = (value: string) => Array.from(value).length;

/** Texto com trim e teto em code points, igual ao check da coluna no banco. */
const limited = (max: number) =>
  z
    .string()
    .trim()
    .refine((text) => codePoints(text) <= max, { message: `no máximo ${max} caracteres` });

/** Texto opcional: vazio vira null. */
const optionalText = (max: number) =>
  limited(max)
    .nullable()
    .transform((text) => (text === null || text === '' ? null : text));

/** Corpo das rotas que trocam o nome de exibição. */
export const NameBody = z.object({
  name: limited(NAME_MAX).refine((name) => name.length > 0, { message: 'nome vazio' }),
});

/** Corpo da rota que troca o cargo do membro no coworking; vazio apaga. */
export const TitleBody = z.object({ title: optionalText(TITLE_MAX) });

/** Corpo da rota de status: disponibilidade, texto livre e um emoji opcional. */
export const StatusBody = z.object({
  status: z.enum(['available', 'focus', 'away']),
  text: optionalText(STATUS_TEXT_MAX),
  emoji: z
    .string()
    .nullable()
    .transform((emoji) => (emoji === '' ? null : emoji))
    .refine((emoji) => emoji === null || isSingleEmoji(emoji), { message: 'um emoji só' }),
});
