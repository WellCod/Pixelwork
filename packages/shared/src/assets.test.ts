import { describe, expect, it } from 'vitest';
import { frameOf } from './assets.ts';
import { RUGS } from './editor/rug.ts';

describe('frameOf', () => {
  it('acha o frame de pisos e paredes pelo item_id do catálogo', () => {
    expect(frameOf('floors', 'wood-light')).toBe(0);
    expect(frameOf('floors', 'carpet-ice')).toBe(59);
    expect(frameOf('walls', 'wall-lilac')).toBe(10);
    expect(frameOf('walls', 'wall-window-curtain')).toBe(14);
  });

  it('o primeiro tile de cada tapete é o do item rug-<cor>', () => {
    expect(RUGS.lavender.firstFrame).toBe(frameOf('floors', 'rug-lavender'));
    expect(RUGS.sage.firstFrame).toBe(frameOf('floors', 'rug-sage'));
    expect(RUGS.cream.firstFrame).toBe(frameOf('floors', 'rug-cream'));
  });

  it('item fora do catálogo é erro, não frame 0', () => {
    expect(() => frameOf('walls', 'nao-existe')).toThrow(/nao-existe/);
  });
});
