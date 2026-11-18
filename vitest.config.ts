import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    // Criar e migrar o banco de teste passa dos 10 s padrão quando a máquina está ocupada.
    hookTimeout: 30_000,
  },
});
