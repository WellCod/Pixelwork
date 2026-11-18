import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Assets saem da pasta da raiz; o código só os referencia por ID do catálogo.
  publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:3000',
    },
  },
});
