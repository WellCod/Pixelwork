import { STEP_MS } from '@pixelwork/shared';
import { expect, test, type Browser, type Page } from '@playwright/test';

declare global {
  interface Window {
    __pixelwork?: {
      world: { selfId: string | null; self: { x: number; y: number }; pendingCount: number };
      media: { connected: boolean; room: object | null; debugState(): Record<string, { audio: boolean; video: boolean }> };
      connection: { reconnect(): void };
    };
  }
}

/** Convidado num contexto próprio (cookies separados), já conectado à mídia. */
async function guest(browser: Browser): Promise<{ page: Page; id: string }> {
  const page = await (await browser.newContext({ ignoreHTTPSErrors: Boolean(process.env.PIXELWORK_E2E_URL), permissions: ['microphone'] })).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como convidado' }).click();
  await page.waitForFunction(() => window.__pixelwork?.media.connected === true, null, { timeout: 30_000 });
  const id = await page.evaluate(() => window.__pixelwork?.world.selfId ?? '');
  return { page, id };
}

/**
 * Anda `steps` tiles. O foco é liberado sem clicar no mapa: clique no canvas agora inicia
 * "clicar para andar" (ou "seguir", se cair num avatar) e roubaria os passos do teclado. O
 * intervalo entre teclas passa do STEP_MS, senão o cliente descarta a tecla; no fim espera o
 * servidor confirmar todos os passos.
 */
async function walk(page: Page, key: string, steps: number): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(STEP_MS + 60);
  }
  await expect.poll(() => page.evaluate(() => window.__pixelwork?.world.pendingCount ?? -1), { timeout: 5_000 }).toBe(0);
}

/** Estado de assinatura exposto em modo de desenvolvimento: o E2E não lê a renderização. */
const subscribed = (page: Page, otherId: string) =>
  page.evaluate((id) => window.__pixelwork?.media.debugState()[id]?.audio ?? false, otherId);

test('áudio por proximidade desassina ao se afastar e volta após reconexão', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const a = await guest(browser);
  const b = await guest(browser);
  for (const { page } of [a, b]) {
    await page.bringToFront();
    const microphone = page.getByRole('button', { name: 'Ligar microfone', exact: true });
    await expect(microphone).toHaveAttribute('aria-pressed', 'false');
    await microphone.click();
  }

  // Os dois nascem no spawn: primeiro precisa haver assinatura, senão o "false" abaixo não prova nada.
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(true);

  // B sai de perto: a 6 tiles, acima do raio de saída.
  await walk(b.page, 'ArrowLeft', 6);
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(false);

  // B anda até A de novo.
  await walk(b.page, 'ArrowRight', 5);
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => subscribed(b.page, a.id), { timeout: 15_000 }).toBe(true);

  const previousRoom = await b.page.evaluateHandle(() => window.__pixelwork?.media.room);
  const started = Date.now();
  await b.page.evaluate(() => window.__pixelwork?.connection.reconnect());
  await b.page.waitForFunction((oldRoom) => {
    const media = window.__pixelwork?.media;
    return media?.connected && media.room !== oldRoom;
  }, previousRoom, { timeout: 15_000 });
  await expect.poll(() => subscribed(b.page, a.id), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(true);
  testInfo.annotations.push({ type: 'Tempo de reconexão do áudio', description: `${Date.now() - started} ms` });
  await previousRoom.dispose();
});
