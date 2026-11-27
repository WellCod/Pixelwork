import { defineConfig } from '@playwright/test';

const CI = Boolean(process.env.CI);
const externalUrl = CI ? undefined : process.env.PIXELWORK_E2E_URL;

/**
 * E2E de fumaça (fase 8). No CI usa o Chromium do Playwright; localmente, o Chrome instalado,
 * para não baixar navegador. Postgres e LiveKit precisam estar no ar (compose ou CI).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: CI ? 1 : 0,
  // No CI o relatório HTML e os traces sobem como artefato quando algo falha.
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalUrl ?? 'http://localhost:5173',
    ignoreHTTPSErrors: Boolean(externalUrl),
    trace: 'retain-on-failure',
    ...(CI ? {} : { channel: 'chrome' }),
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    permissions: ['microphone', 'camera'],
  },
  ...(!externalUrl && { webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173/health',
    reuseExistingServer: !CI,
    timeout: 120_000,
  } }),
});
