# Imagem do app (alvo "app") e do Caddy com o cliente compilado (alvo "web").
FROM node:24-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @pixelwork/client build

# O servidor roda com tsx: o código usa sintaxe de TypeScript que o Node não remove sozinho
# (propriedades no construtor), e não há passo de compilação entre os pacotes.
FROM build AS app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "node --import tsx packages/server/src/migrate.ts && node --import tsx packages/server/src/seed.ts && node --import tsx packages/server/src/index.ts"]

FROM caddy:2.10 AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/client/dist /srv
