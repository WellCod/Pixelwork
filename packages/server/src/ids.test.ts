import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './ids.ts';

describe('uuidv7', () => {
  it('tem versão 7, variante RFC e o timestamp nos 48 bits iniciais', () => {
    const id = uuidv7(0x0190_1234_5678);
    expect(isUuid(id)).toBe(true);
    expect(id.slice(0, 13)).toBe('01901234-5678');
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('ordena pelo tempo de criação', () => {
    expect(uuidv7(1000) < uuidv7(2000)).toBe(true);
  });
});
