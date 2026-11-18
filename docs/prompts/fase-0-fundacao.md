# Fase 0: fundação

Leia `CLAUDE.md`, `docs/architecture.md` (seções 2, 3, 5 e 14) e `docs/art.md` (seções 2, 6 e 10).

## Objetivo

Repositório funcionando de ponta a ponta, sem features: monorepo, banco, ambiente de dev,
pipeline de assets e CI.

## Escopo

- Monorepo pnpm com `packages/shared`, `packages/server`, `packages/client`; TypeScript estrito;
  ESLint; Vitest em todo o workspace.
- Antes de adicionar cada dependência, confira a versão estável atual e fixe-a. Avalie Phaser 3.x
  vs 4 e registre a escolha, com o motivo em uma linha, em `docs/architecture.md`.
- `docker-compose.dev.yml` exatamente como em `docs/architecture.md`, com a versão do LiveKit fixada.
- Leitura e validação do `.env` com Zod no servidor; `.env.example` com todas as variáveis.
- Schema Drizzle completo da seção 5 (todas as tabelas, inclusive as que só serão usadas depois),
  migrations e comandos `db:migrate` e `db:seed` (seed vazio por enquanto).
- Servidor Fastify com `GET /health` checando o banco.
- Cliente Vite + React montando um canvas Phaser com `pixelArt: true` e escala inteira, mostrando
  um tile de placeholder.
- Pipeline de assets: `assets/palette.hex` (paleta temporária, sinalize qual escolheu),
  `scripts/gen-placeholders.ts`, `assets/manifest.json` apontando para os placeholders,
  `scripts/gen-catalog.ts` gerando `packages/shared/src/catalog.generated.ts`,
  `scripts/check-palette.ts`.
- GitHub Actions: typecheck, lint, check-palette e testes, com Postgres como service container.

## Fora de escopo

Auth, mapa, WebSocket, LiveKit no código.

## Testes obrigatórios

- `gen-catalog` falha quando um asset do manifesto não tem licença.
- `check-palette` falha com um PNG que usa cor fora da paleta e das cores-chave.
- Teste de integração que sobe o servidor e recebe 200 em `/health`.

## Pronto quando

- `docker compose -f docker-compose.dev.yml up -d`, `pnpm db:migrate` e `pnpm dev` sobem tudo, e o
  navegador mostra o canvas com o placeholder.
- CI verde.
- Seção de comandos do `CLAUDE.md` atualizada.

## Execução

1. Apresente o plano (arquivos, dependências com versões, scripts) e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto, o que verificar manualmente e qualquer decisão sinalizada. Pare.
