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

- [x] Listener do mundo não é removido em `DESTROY` (WorldScene, EditorScene)
- [x] Enter abre o chat com foco em botão e cancela o clique
- [x] Avatar anda com modal aberto; DecorEditor some ao levantar da cadeira
- [x] Clicar no mapa não tira o foco de inputs
- [x] Passo descartado por jitter puxa o avatar de volta (buffer de 1 input no servidor)
- [x] Rede: heartbeat, bloquear input offline, `JSON.parse` protegido, reconectar no `online`
- [x] Erro transitório em `openSpace` manda para o login; `setState` com closure velho
- [x] Permissão de mídia negada deixa flags mentindo; erros traduzidos
- [x] Compartilhamento de tela preso como ativo
- [x] Mídia não se recupera após `Disconnected`
- [x] Canvas não acompanha o tamanho do container (`ResizeObserver`)
- [x] Timers sem limpeza (ZoneUi, call-store) e batida sem prazo
- [x] Animação de outros avatares trava; correção do próprio avatar é salto seco; predição ignora tranca

## 3. Servidor e infra

- [x] Corrida: mapa salvo durante a carga do runtime
- [x] Corrida: membro removido durante o upgrade
- [x] Runtimes ociosos descarregados
- [x] ~~`step()` em lote por tick~~ descartado: quantiza o passo em 100 ms e derruba a velocidade (ver architecture.md, seção 7)
- [x] `replaceMap` respeita trancas e destranca salas vazias
- [x] Spawn em zona de reunião (`spawn_in_meeting`) e outras validações do `compileMap`
- [x] Chaves de mesa não voltam ao começar do modelo ou importar JSON
- [x] Backpressure no envio (`bufferedAmount`)
- [x] Token de convite mascarado nos logs; `fetch` ao GitHub com timeout
- [x] Sessões expiradas apagadas no job; último admin não pode ser removido
- [x] Migration de índices e checks
- [x] `env.ts` recusa valores de dev em produção; senha codificada na `DATABASE_URL`
- [x] Dockerfile: imagem enxuta, `USER node`, `HEALTHCHECK`
- [x] Compose de produção: healthchecks, rotação de log, limites, backup do Postgres
- [x] Caddy: cabeçalhos de segurança e cache de assets
- [x] CI: build do Docker, cache do Playwright, artefatos em falha, `concurrency`, `permissions`
- [x] E2E de proximidade exige `true` antes de `false`
- [x] Testes novos para os casos acima

## 4. UX/UI

- [x] Card "Como usar" dispensável; "Ligar" sempre visível com dica
- [x] Rótulos em português e miniaturas no DecorEditor e AvatarEditor
- [x] Região única de cards (zona, mesa, chamada) sem sobreposição
- [x] Ícones nos controles de mídia e anel em quem fala
- [x] Sidebar: pessoas primeiro, perfil recolhível
- [x] Chat: aviso quando ninguém está perto
- [x] Estados de carregamento/erro; confirmação ao sair do editor com edições; `beforeunload`
- [x] "Usar nesta aba" quando a sessão é substituída
- [x] Acessibilidade: balão de vídeo por teclado, status além da cor (foco no modal já feito)
- [x] Mobile: header que quebra linha
- [x] Polimento: mapa centralizado, zoom, variáveis CSS, transições

## 5. Features

- [x] `ping`/`pong` com RTT no HUD
- [x] Overlay de netcode e simulador de latência (F3 ou botão "Rede")
- [x] Métricas `/metrics` (Prometheus)
- [x] Clicar para andar e seguir alguém (A* em `shared`)
- [x] Replay determinístico de entradas
- [x] Tick binário com ids curtos

## 6. Fechamento

- [x] README, `docs/architecture.md`, `docs/deploy.md` e CLAUDE.md atualizados
- [x] `pnpm typecheck`, `pnpm lint` e `pnpm test` (266 testes) passando; imagens Docker construindo
- [ ] `pnpm e2e` no CI: localmente (macOS + Docker Desktop) o ICE do segundo participante falha
  também no código anterior; conferir na primeira execução do CI desta branch

## Pendências conhecidas

- TURN para redes que só liberam a 443: as opções estão em `docs/deploy.md`, mas nenhuma foi
  configurada (exige domínio e certificado próprios, ou um IP extra).
- A CSP do Caddy foi conferida contra o bundle, mas só dá para validar no primeiro deploy com HTTPS.
- Área de interesse no tick continua fora: o tick binário adiou a necessidade; medir com
  `pnpm load` acima de 200 bots antes de fazer.
