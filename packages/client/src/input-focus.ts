/** Foco num campo de texto ou um modal aberto: as teclas são da UI, não do mapa. */
export function isTyping(): boolean {
  const focused = document.activeElement;
  if (
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement ||
    focused instanceof HTMLSelectElement ||
    (focused instanceof HTMLElement && focused.isContentEditable)
  ) {
    return true;
  }
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Nada da UI está focado (ou o foco está no canvas do jogo): Enter pode abrir o chat. */
export function focusIsFree(): boolean {
  const focused = document.activeElement;
  return focused === null || focused === document.body || focused instanceof HTMLCanvasElement;
}

/** Clicar no mapa devolve o teclado ao jogo; o Phaser cancela o pointerdown e o foco ficaria preso. */
export function releaseFocus(): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
}
