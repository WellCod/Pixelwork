import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const api = 'http://127.0.0.1:3000';
const livekit = 'http://127.0.0.1:7880';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Lê o .env da raiz (o mesmo do servidor); o prefixo vazio traz as variáveis sem VITE_.
  const env = loadEnv(mode, repoRoot, '');
  // DEV_HOST=0.0.0.0 abre o Vite para a rede local. Sem ele, só esta máquina acessa.
  const host = env.DEV_HOST || 'localhost';
  // Câmera e microfone só funcionam em HTTPS fora do localhost: com certificado, o Vite serve em https.
  const https =
    env.DEV_HTTPS_CERT && env.DEV_HTTPS_KEY
      ? { cert: readFileSync(resolve(repoRoot, env.DEV_HTTPS_CERT)), key: readFileSync(resolve(repoRoot, env.DEV_HTTPS_KEY)) }
      : undefined;

  return {
    plugins: [react()],
    // Assets saem da pasta da raiz; o código só os referencia por ID do catálogo.
    publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
    server: {
      host,
      // Só entra com certificado: `https: undefined` não passa no exactOptionalPropertyTypes.
      ...(https ? { https } : {}),
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
        // Sinalização do LiveKit pela mesma origem: numa página https o navegador recusa ws:// para
        // outro endereço. A mídia (UDP 7882 e TCP 7881) continua indo direto ao LiveKit.
        '/rtc': { target: livekit, ws: true },
      },
    },
  };
});
