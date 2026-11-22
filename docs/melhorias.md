# Melhorias em andamento

Lista de trabalho da revisão geral de 2026-11-22 (branch `fix/criticos`). Marque `[x]` ao concluir
e registre decisões novas no documento de referência indicado. Quando tudo estiver feito, este
arquivo pode ser removido ou virar histórico.

Decisões aprovadas nesta rodada: `@fastify/rate-limit` como dependência; erro de mapa
`spawn_in_meeting`; mensagens `ping`/`pong`; migration de índices e checks; tick binário.

## 1. Críticos

- [x] Socket sem listener de `error` durante o upgrade derruba o processo (`gateway.ts`)
- [x] Falha em `loadRuntime` vira unhandled rejection e fica em cache (`gateway.ts`)
- [x] `compileMap` itera retângulos gigantes de zona/móvel (DoS) (`shared/map.ts`)
- [x] `.env.production` entra na imagem Docker (`.dockerignore`)
- [x] Token do LiveKit de 6 h; não remove da sala `space:`; membro removido segue na mídia
- [x] Heartbeat no WebSocket; logout/expiração fecham conexões abertas
- [x] Rate limit em `/auth/*`, aceite de convite e rotas de escrita; `trustProxy`

## 2. Bugs do cliente

- [ ] Listener do mundo não é removido em `DESTROY` (WorldScene, EditorScene)
- [ ] Enter abre o chat com foco em botão e cancela o clique
- [ ] Avatar anda com modal aberto; DecorEditor some ao levantar da cadeira
- [ ] Clicar no mapa não tira o foco de inputs
- [ ] Passo descartado por jitter puxa o avatar de volta (buffer de 1 input no servidor)
- [ ] Rede: heartbeat, bloquear input offline, `JSON.parse` protegido, reconectar no `online`
- [ ] Erro transitório em `openSpace` manda para o login; `setState` com closure velho
- [ ] Permissão de mídia negada deixa flags mentindo; erros traduzidos
- [ ] Compartilhamento de tela preso como ativo
- [ ] Mídia não se recupera após `Disconnected`
- [ ] Canvas não acompanha o tamanho do container (`ResizeObserver`)
- [ ] Timers sem limpeza (ZoneUi, call-store) e batida sem prazo
- [ ] Animação de outros avatares trava; correção do próprio avatar é salto seco; predição ignora tranca

## 3. Servidor e infra

- [x] Corrida: mapa salvo durante a carga do runtime
- [x] Corrida: membro removido durante o upgrade
- [x] Runtimes ociosos descarregados
- [ ] `step()` em lote por tick em vez de copiar o mapa a cada movimento
- [ ] `replaceMap` respeita trancas e destranca salas vazias
- [ ] Spawn em zona de reunião (`spawn_in_meeting`) e outras validações do `compileMap`
- [ ] Chaves de mesa não voltam ao começar do modelo ou importar JSON
- [x] Backpressure no envio (`bufferedAmount`)
- [ ] Token de convite mascarado nos logs; `fetch` ao GitHub com timeout
- [ ] Sessões expiradas apagadas no job; último admin não pode ser removido
- [ ] Migration de índices e checks
- [ ] `env.ts` recusa valores de dev em produção; senha codificada na `DATABASE_URL`
- [ ] Dockerfile: imagem enxuta, `USER node`, `HEALTHCHECK`
- [ ] Compose de produção: healthchecks, rotação de log, limites, backup do Postgres
- [ ] Caddy: cabeçalhos de segurança e cache de assets
- [ ] CI: build do Docker, cache do Playwright, artefatos em falha, `concurrency`, `permissions`
- [ ] E2E de proximidade exige `true` antes de `false`
- [ ] Testes novos para os casos acima

## 4. UX/UI

- [ ] Card "Como usar" dispensável; "Ligar" sempre visível com dica
- [ ] Rótulos em português e miniaturas no DecorEditor e AvatarEditor
- [ ] Região única de cards (zona, mesa, chamada) sem sobreposição
- [ ] Ícones nos controles de mídia e anel em quem fala
- [ ] Sidebar: pessoas primeiro, perfil recolhível
- [ ] Chat: aviso quando ninguém está perto
- [ ] Estados de carregamento/erro; confirmação ao sair do editor com edições; `beforeunload`
- [ ] "Usar nesta aba" quando a sessão é substituída
- [ ] Acessibilidade: foco no modal, balão de vídeo por teclado, status além da cor
- [ ] Mobile: header que quebra linha
- [ ] Polimento: mapa centralizado, zoom, variáveis CSS, transições

## 5. Features

- [ ] `ping`/`pong` com RTT no HUD
- [ ] Overlay de netcode e simulador de latência no dev
- [ ] Métricas `/metrics` (Prometheus)
- [ ] Clicar para andar e seguir alguém (A* em `shared`)
- [ ] Replay determinístico de entradas
- [ ] Tick binário com ids curtos

## 6. Fechamento

- [ ] README, `docs/architecture.md`, `docs/deploy.md` e CLAUDE.md atualizados
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm e2e` passando
