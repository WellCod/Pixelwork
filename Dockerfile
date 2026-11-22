# Imagem do app (alvo "app") e do Caddy com o cliente compilado (alvo "web").
FROM node:24-slim AS base
WORKDIR /app
RUN npm install -g pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

FROM base AS deps
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @pixelwork/client build

# Só as dependências de produção do servidor e do shared: sem Vite, Phaser, Playwright, ESLint.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @pixelwork/server...

# O servidor roda com tsx: o código usa sintaxe de TypeScript que o Node não remove sozinho
# (propriedades no construtor), e não há passo de compilação entre os pacotes.
FROM node:24-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=prod-deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY packages/server/tsconfig.json packages/server/
COPY packages/server/src packages/server/src
COPY packages/server/drizzle packages/server/drizzle
# Lidos em tempo de execução: modelos de mapa (seed, reset da demo) e tilesets (export do mapa).
COPY maps/templates maps/templates
COPY assets assets
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
WORKDIR /app/packages/server
CMD ["sh", "-c", "node --import tsx src/migrate.ts && node --import tsx src/seed.ts && exec node --import tsx src/index.ts"]

FROM caddy:2.10 AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/client/dist /srv
