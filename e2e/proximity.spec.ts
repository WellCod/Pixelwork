import { expect, test, type Browser, type Page } from '@playwright/test';

declare global {
  interface Window {
    __pixelwork?: {
      world: { selfId: string | null; self: { x: number; y: number } };
      media: { connected: boolean; debugState(): Record<string, { audio: boolean; video: boolean }> };
    };
  }
}

/** Convidado num contexto próprio (cookies separados), já conectado à mídia. */
async function guest(browser: Browser): Promise<{ page: Page; id: string }> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como convidado' }).click();
  await page.waitForFunction(() => window.__pixelwork?.media.connected === true, null, { timeout: 30_000 });
  const id = await page.evaluate(() => window.__pixelwork?.world.selfId ?? '');
  return { page, id };
}

const selfPos = (page: Page) => page.evaluate(() => window.__pixelwork?.world.self ?? { x: -1, y: -1 });

/** Um passo por vez, esperando a predição andar: sem sleep fixo, que mascara lentidão. */
async function walk(page: Page, key: string, steps: number): Promise<void> {
  await page.locator('.game canvas').click({ position: { x: 200, y: 200 } });
  for (let i = 0; i < steps; i++) {
    const before = await selfPos(page);
    await page.keyboard.press(key);
    await expect
      .poll(async () => {
        const now = await selfPos(page);
        return now.x !== before.x || now.y !== before.y;
      }, { timeout: 2_000 })
      .toBe(true);
  }
}

/** Estado de assinatura exposto em modo de desenvolvimento: o E2E não lê a renderização. */
const subscribed = (page: Page, otherId: string) =>
  page.evaluate((id) => window.__pixelwork?.media.debugState()[id]?.audio ?? false, otherId);

test('chegar perto assina o áudio do outro, se afastar desassina', async ({ browser }) => {
  const a = await guest(browser);
  const b = await guest(browser);

  // Os dois nascem no spawn: primeiro precisa haver assinatura, senão o "false" abaixo não prova nada.
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(true);

  // B sai de perto: a 6 tiles, acima do raio de saída.
  await walk(b.page, 'ArrowLeft', 6);
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(false);

  // B anda até A de novo.
  await walk(b.page, 'ArrowRight', 5);
  await expect.poll(() => subscribed(a.page, b.id), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => subscribed(b.page, a.id), { timeout: 15_000 }).toBe(true);
});
