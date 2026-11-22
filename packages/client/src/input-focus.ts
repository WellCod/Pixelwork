/** Foco num campo de texto ou um modal aberto: as teclas são da UI, não do mapa. */
export function isTyping(): boolean {
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  ) {
    return true;
  }
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Nada da UI está focado (ou o foco está no canvas do jogo): Enter pode abrir o chat. */
export function focusIsFree(): boolean {
  const el = document.activeElement;
  return el === null || el === document.body || el instanceof HTMLCanvasElement;
}

/** Clicar no mapa devolve o teclado ao jogo; o Phaser cancela o pointerdown e o foco ficaria preso. */
export function releaseFocus(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el !== document.body) el.blur();
}
