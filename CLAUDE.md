# Coworking virtual

Coworking virtual 2D top-down em pixel art, no estilo do Gather. Empresas têm coworkings com mapa
customizável; usuários andam pelo mapa, conversam por áudio e vídeo por proximidade, decoram a
própria mesa, entram em salas de reunião privadas e fazem chamadas a partir da mesa.

Objetivo: projeto de portfólio, rodando localmente e depois numa única VPS para demonstração.
Não há billing nem planos. O núcleo de tempo real é o que importa; prefira profundidade
técnica nele a amplitude de features.

## Documentação

- `docs/architecture.md`: contratos e decisões (schema, protocolo, contrato do mapa, mídia,
  testes). Leia as seções relevantes antes de qualquer tarefa.
- `docs/art.md`: paleta, grade, layout dos spritesheets, manifesto de assets e licenças.
- `docs/prompts/`: um prompt por fase de implementação.

## Stack

- Monorepo pnpm workspaces: `packages/client`, `packages/server`, `packages/shared`.
- TypeScript estrito em tudo.
- Cliente: Phaser (mapa e avatares) + React (UI ao redor), build com Vite.
- Servidor: Node, Fastify (HTTP), `ws` (WebSocket), Drizzle + PostgreSQL 17, Zod.
- Mídia: LiveKit self-hosted (SFU). Cliente `livekit-client`, tokens no servidor via SDK de servidor.
- Testes: Vitest. E2E de fumaça com Playwright (só na fase 8).
- CI: GitHub Actions.
- Dev: Postgres e LiveKit via `docker-compose.dev.yml`; client e server rodam nativos com `pnpm dev`.

Versões: confira a versão estável atual de cada dependência antes de adicioná-la e fixe-a.
Para o Phaser, avalie 3.x vs 4 e registre a escolha em `docs/architecture.md`.

## Invariantes (não quebrar)

1. O servidor tem autoridade sobre posição. O cliente envia intenção de movimento, nunca posição.
2. Persistido passa por REST (grava e depois faz broadcast pelo WebSocket). Efêmero
   (movimento, tranca de sala, batida na porta, chamada, chat) passa só pelo WebSocket.
3. Cada cliente está em exatamente uma sala do LiveKit por vez, e quem decide qual é o servidor
   (`media.join`). Token de sala de reunião ou de chamada só é emitido pelo servidor, depois
   de checar autorização.
4. Isolamento de tenant na aplicação: toda rota e toda conexão resolvem `space_members` uma vez
   e partem dali. Nenhuma query de dados de coworking sem `space_id` vindo dessa resolução.
5. A simulação do jogo é um módulo puro (estado + entradas + tempo -> novo estado + eventos),
   sem acesso a rede, relógio ou banco. O relógio é injetado.
6. O código referencia assets só por ID do catálogo (manifesto), nunca por caminho de arquivo.
7. Tilesets só crescem: nunca reordenar nem remover tiles (mapas salvos referenciam por posição).
8. Nenhum asset com licença SA, GPL, NC ou sem permissão de redistribuição entra no repositório.

## Comandos

- `docker compose -f docker-compose.dev.yml up -d`: sobe Postgres e LiveKit.
- `pnpm dev`: client e server em modo watch.
- `pnpm test`: unitários e integração.
- `pnpm typecheck`, `pnpm lint`.
- `pnpm db:migrate`, `pnpm db:seed`.
- `pnpm load --bots 50`: teste de carga com bots (fase 8).

Atualize esta seção quando os comandos mudarem.

## Como trabalhar

- Antes de codar uma fase, apresente o plano e espere aprovação.
- Ao propor solução, diga em uma linha o que descartou e por quê. Não liste alternativas sem
  escolher uma.
- Pare e pergunte antes de qualquer decisão cara de reverter: mudança de schema fora do que
  `docs/architecture.md` define, contrato de protocolo ou de mapa, nova dependência, mudança no
  modelo de auth. O resto, decida e sinalize.
- Separe convenção de restrição: "é o padrão" e "quebra se não fizer assim" não são a mesma coisa.
- A opção mais simples que resolve é válida. Nada de abstração ou camada sem problema concreto.
- Não invente API, flag ou comportamento de biblioteca. Sem certeza, verifique na documentação
  ou diga que não tem certeza.
- Comentários só onde o "por quê" não é óbvio.
- Se uma decisão de `docs/architecture.md` se mostrar errada na prática, aponte e proponha a
  mudança; não desvie em silêncio. Decisão aprovada é registrada no próprio documento.
- Ao fim de cada fase: testes passando, typecheck limpo, e pare para revisão.
