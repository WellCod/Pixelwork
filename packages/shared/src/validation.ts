import { z } from 'zod';

export const NAME_MAX = 40;
export const TITLE_MAX = 40;
export const STATUS_TEXT_MAX = 80;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// Pictograma, bandeira (indicador regional) ou keycap (1️⃣): o que o teclado de emoji produz.
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** Exatamente um grafema, e esse grafema é emoji. */
export function isSingleEmoji(value: string): boolean {
  const graphemes = [...segmenter.segment(value)];
  return graphemes.length === 1 && EMOJI.test(value);
}

/** Tamanho em code points, como o `char_length` do Postgres. */
const codePoints = (value: string) => Array.from(value).length;

const limited = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => codePoints(v) <= max, { message: `no máximo ${max} caracteres` });

/** Texto opcional: vazio vira null. */
const optionalText = (max: number) =>
  limited(max)
    .nullable()
    .transform((v) => (v === null || v === '' ? null : v));

export const NameBody = z.object({
  name: limited(NAME_MAX).refine((v) => v.length > 0, { message: 'nome vazio' }),
});

export const TitleBody = z.object({ title: optionalText(TITLE_MAX) });

export const StatusBody = z.object({
  status: z.enum(['available', 'focus', 'away']),
  text: optionalText(STATUS_TEXT_MAX),
  emoji: z
    .string()
    .nullable()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || isSingleEmoji(v), { message: 'um emoji só' }),
});
