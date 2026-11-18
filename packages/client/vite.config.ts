import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  // Assets saem da pasta da raiz; o código só os referencia por ID do catálogo.
  publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
  server: {
    port: 5173,
    strictPort: true,
    // Mesma origem para cookie e Origin: o navegador só fala com o Vite.
    proxy: {
      '/health': api,
      '/auth': api,
      '/me': api,
      '/spaces': api,
      '/orgs': api,
      '/invites': api,
      '/templates': api,
      '/ws': { target: api, ws: true },
    },
  },
});
