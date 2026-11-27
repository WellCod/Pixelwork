import { findPath, zoneAt, type CompiledMap, type Dir } from '@pixelwork/shared';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

type WorldDebug = {
  world: { map: CompiledMap; self: { x: number; y: number }; pendingCount: number; move(dir: Dir): unknown };
  connection: { send(message: unknown): void };
  media: { connected: boolean; isPrivate: boolean; roomName: string | null };
};

async function join(browser: Browser, capture = false): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ ignoreHTTPSErrors: Boolean(process.env.PIXELWORK_E2E_URL) });
  const page = await context.newPage();
  if (capture) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        configurable: true,
        value: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas indisponível');
          context.fillStyle = '#2688ff';
          context.fillRect(0, 0, 320, 180);
          const timer = setInterval(() => {
            context.fillStyle = Date.now() % 200 < 100 ? '#2688ff' : '#176adf';
            context.fillRect(0, 0, 320, 180);
          }, 100);
          window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
          return Promise.resolve(canvas.captureStream(10));
        },
      });
    });
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como convidado' }).click();
  await page.getByRole('button', { name: 'Entendi', exact: true }).click();
  await page.waitForFunction(() => window.__pixelwork?.media.connected);
  return { page, context };
}

async function enterAurora(page: Page): Promise<void> {
  await page.bringToFront();
  const { map, self } = await page.evaluate(() => {
    const { world } = window.__pixelwork as unknown as WorldDebug;
    return { map: world.map, self: world.self };
  });
  const route = findPath(map, self, self, { goal: (x, y) => {
    const zone = zoneAt(map, x, y);
    return zone.type === 'meeting' && zone.name.includes('Aurora');
  } });
  if (!route?.length) throw new Error('Precisa haver um caminho do spawn à sala Aurora.');
  for (const direction of route) {
    await page.evaluate((dir) => {
      const { world, connection } = window.__pixelwork as unknown as WorldDebug;
      connection.send(world.move(dir));
    }, direction);
    await page.waitForFunction(() => window.__pixelwork?.world.pendingCount === 0);
  }
  await page.waitForFunction(() => {
    const { media } = window.__pixelwork as unknown as WorldDebug;
    return media.connected && media.isPrivate;
  });
}

test('apresentação chega a quem está na reunião e some quando é encerrada', async ({ browser }) => {
  test.setTimeout(90_000);
  const guests = await Promise.all([join(browser, true), join(browser), join(browser)]);
  const [presenter, viewer, outside] = guests;

  try {
    await enterAurora(presenter.page);
    await enterAurora(viewer.page);
    await presenter.page.bringToFront();
    await presenter.page.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
    const received = viewer.page.locator('.room-panel .screen video');
    await expect(received).toBeVisible();
    await expect.poll(() => received.evaluate((element) => (element as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await expect(outside.page.getByRole('button', { name: 'Compartilhar tela', exact: true })).toHaveCount(0);
    await expect(outside.page.locator('.room-panel .screen video')).toHaveCount(0);

    await viewer.page.getByRole('button', { name: 'Flutuante', exact: true }).click();
    await viewer.page.setViewportSize({ width: 390, height: 720 });
    await expect(viewer.page.getByRole('button', { name: 'Redefinir janela', exact: true })).toBeVisible();
    await presenter.page.getByRole('button', { name: 'Parar de compartilhar', exact: true }).click();
    await expect(received).toHaveCount(0);
  } finally {
    await Promise.all(guests.map(({ context }) => context.close()));
  }
});

test('link de reunião mostra o caminho até a porta sem entrar na sala', async ({ browser }) => {
  const { page, context } = await join(browser);
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Buscar sala, mesa ou pessoa' }).fill('aurora');
    await page.getByRole('button', { name: 'Copiar link de Sala Aurora', exact: true }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(link).searchParams.get('sala')).toBe('sala-aurora');
    await page.goto(link);
    await expect(page.getByText('Destino · Sala Aurora', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window.__pixelwork as unknown as WorldDebug).media.isPrivate)).toBe(false);

    const otherSpace = new URL(link);
    otherSpace.searchParams.set('coworking', '00000000-0000-4000-8000-000000000000');
    await page.goto(otherSpace.href);
    await expect(page.getByText('Este link de sala requer acesso ao coworking.')).toBeVisible();
    await expect(page.getByText('Destino · Sala Aurora', { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
