# Arquitetura

Este documento é a fonte de verdade das decisões. Mudanças aqui exigem aprovação explícita.
Constantes numéricas são valores iniciais configuráveis, não restrições.

## 1. Escopo

Dentro:

- Empresas (orgs) com um ou mais coworkings; cada coworking tem um mapa próprio.
- Uma conta participa de vários coworkings, de empresas diferentes, via convite.
- Movimento em grid com servidor autoritativo, predição e interpolação no cliente.
- Áudio por proximidade e balões de vídeo (câmera opcional) nas áreas abertas.
- Salas de reunião como salas de mídia separadas, trancáveis, com "bater na porta".
- Chamada 1:1 de áudio e vídeo iniciada da própria mesa, com qualquer pessoa do coworking.
- Compartilhamento de tela em reuniões e chamadas.
- Chat de texto efêmero em balão (sem histórico).
- Status (disponível, focado, ausente), texto de status, emoji de status, cargo por coworking.
- Avatar por camadas com troca de paleta; mesa decorável por slots.
- Mapas: upload de JSON do Tiled, export em zip e editor no app.
- Login como convidado (essencial para a demo) e GitHub OAuth.

Fora:

- Billing, planos, limites por plano.
- Chat persistente, canais, histórico.
- Hot desking, chamadas em grupo fora de salas de reunião.
- Integrações externas de status (Jira, calendário).
- Escala horizontal (um nó só; o caminho para escalar fica documentado no README).

## 2. Estrutura do repositório

```
packages/
  shared/    tipos do protocolo, schemas Zod, schema Drizzle, compilação e validação de mapa,
             simulação pura, proximidade, catálogo gerado do manifesto
  server/    Fastify (REST), ws (tempo real), integração LiveKit, jobs
  client/    Vite + React (UI) + Phaser (mapa)
assets/      arte, manifesto de assets e tilesets (ver docs/art.md)
maps/        templates de mapa (JSON do Tiled) e fixtures de teste
scripts/     geração do catálogo, checagem de paleta, placeholders, carga
docker-compose.dev.yml
```

Versões e escolhas da fase 0 (todas as dependências com versão fixa):

- Phaser 4.2.1: estável desde abril de 2026, com três versões menores. Descartado o 3.90, sem
  release desde maio de 2025.
- TypeScript 6.0.3, não o 7: o typescript-eslint 8.73 exige TypeScript abaixo de 6.1.
- Node 24. Driver `pg` (node-postgres) no Drizzle; descartado o postgres.js, sem ganho aqui.
- `.env` lido pelo `--env-file` do Node e validado com Zod; descartado o `dotenv`.
- Pacotes importados como fonte TypeScript (sem build entre eles): o servidor roda com `tsx`, o
  cliente com Vite. Imports relativos com extensão `.ts`.
- O Vite serve `assets/` como pasta pública; `packages/shared/src/assets.ts` é o único lugar que
  traduz ID de catálogo em URL.

## 3. Ambiente de desenvolvimento

```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: coworking
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  livekit:
    image: livekit/livekit-server:v1.13.11
    # dentro do container, escutar só em 127.0.0.1 tornaria as portas inacessíveis pelo host
    command: --dev --bind 0.0.0.0
    ports:
      - "7880:7880"
      - "7881:7881"
      - "7882:7882/udp"

volumes:
  pgdata:
```

- `postgres:17` e não 18: a imagem 18 mudou o caminho padrão do diretório de dados.
- `--dev` usa a chave `devkey` e o segredo `secret`.
- Se a sinalização conectar mas a mídia não passar, o LiveKit pode estar anunciando o IP do
  container. Investigar a flag de IP do nó (`livekit-server --help`); plano B: rodar o binário
  nativo (`brew install livekit` no macOS, release do GitHub no Windows).
- `http://localhost` é contexto seguro, então câmera e microfone funcionam sem TLS. Para testar de
  outro aparelho na rede local: TLS local (mkcert) no app e no LiveKit (página HTTPS não abre `ws://`).
- Vários usuários numa máquina: perfis do Chrome com `--use-fake-device-for-media-stream` e
  `--use-fake-ui-for-media-stream`.

Variáveis de ambiente:

```
DATABASE_URL
PUBLIC_URL                  # origem do app; usada na checagem de Origin
LIVEKIT_URL                 # ws://localhost:7880 em dev
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
SESSION_COOKIE_SECURE       # false em dev local, true em produção
DEMO_SPACE_SLUG
PORT                        # porta do servidor (3000); o Vite repassa as rotas da API para ela
```

Em dev o app abre em `http://localhost:5173` (Vite), que repassa as rotas da API ao servidor. Assim
cookie e `Origin` são da mesma origem.

## 4. Autenticação

- Sessão própria: token aleatório de 32 bytes em cookie `sid` (`HttpOnly`, `SameSite=Lax`,
  `Secure` conforme env). No banco, só o hash SHA-256 do token.
- Validade: 30 dias para contas, 24 horas para convidados.
- Convidado: `POST /auth/guest` cria um `users` com `is_guest = true`, nome "Visitante NNNN" e
  avatar aleatório, e o adiciona como membro do coworking de demonstração.
- GitHub OAuth: parâmetro `state` guardado em cookie de curta duração e conferido no callback.
- Requisições REST que alteram estado: exigem `Content-Type: application/json` e `Origin` igual a
  `PUBLIC_URL`. O `SameSite=Lax` já bloqueia POST cross-site com cookie; a checagem é defesa extra.
- WebSocket: o cookie autentica o upgrade; `Origin` diferente de `PUBLIC_URL` é recusado
  (cross-site WebSocket hijacking).

Descartados: JWT (revogação vira problema, nenhum serviço externo precisa validar o token);
auth como serviço (dependência paga e esconde parte que conta no portfólio).

## 5. Modelo de dados

IDs são UUID v7 gerados na aplicação. Isolamento de tenant na aplicação (sem RLS).

```sql
create table users (
  id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar jsonb not null,
  is_guest boolean not null default false,
  guest_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table oauth_accounts (
  provider text not null,
  provider_user_id text not null,
  user_id uuid not null references users on delete cascade,
  primary key (provider, provider_user_id)
);

create table sessions (
  token_hash bytea primary key,  -- só o hash: vazar o banco não permite sequestrar sessões
  user_id uuid not null references users on delete cascade,
  expires_at timestamptz not null
);

create table orgs (
  id uuid primary key,
  name text not null,
  slug text not null unique
);

create table org_members (
  org_id uuid references orgs on delete cascade,
  user_id uuid references users on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  primary key (org_id, user_id)
);

create table spaces (
  id uuid primary key,
  org_id uuid not null references orgs on delete cascade,
  name text not null,
  slug text not null,
  map jsonb not null,
  map_version int not null default 1,
  unique (org_id, slug)
);

create table space_members (
  space_id uuid references spaces on delete cascade,
  user_id uuid references users on delete cascade,
  role text not null check (role in ('admin', 'member')),
  title text check (char_length(title) <= 40),
  status text not null default 'available' check (status in ('available', 'focus', 'away')),
  status_text text check (char_length(status_text) <= 80),
  status_emoji text,
  primary key (space_id, user_id)
);

create table desk_assignments (
  space_id uuid,
  desk_key text,  -- id estável do objeto "desk" no mapa
  user_id uuid not null,
  decor jsonb not null default '{}',
  primary key (space_id, desk_key),
  unique (space_id, user_id),
  -- FK composta: sair do coworking libera a mesa automaticamente
  foreign key (space_id, user_id) references space_members on delete cascade
);

create table invites (
  token_hash bytea primary key,
  space_id uuid not null references spaces on delete cascade,
  role text not null check (role in ('admin', 'member')),
  expires_at timestamptz not null,
  uses_left int
);
```

- Participação é por coworking, não por empresa. `org_members` serve só para administrar a empresa.
  Isso permite participar de coworkings de empresas diferentes sem ser membro delas.
- `status_emoji` é validado na aplicação como exatamente um grafema (`Intl.Segmenter`).
- Não vão para o banco: posição, online/offline, "em reunião", "em chamada", trancas de sala,
  fila de batidas na porta. Tudo isso é estado em memória do servidor de tempo real.
- Schema em Drizzle dentro de `packages/shared`; migrations geradas pelo drizzle-kit.

Descartados: schema por tenant (complexidade sem ganho); RLS (exige configurar o tenant por
transação com o pool, sem ganho com um único backend); Prisma (linguagem de schema própria e
passo de codegen).

## 6. Contrato do mapa

O mapa é o JSON do Tiled. Upload, editor e templates produzem e consomem o mesmo formato.

Restrições (o servidor rejeita com código de erro):

- Ortogonal, tile de 16x16, não infinito, no máximo 100x100 tiles, JSON de até 5 MB.
- Dados de camada como array simples (sem base64, sem compressão).
- Tilesets externos referenciados por `source` igual a `<catalogId>.tsj`, que precisa existir no
  catálogo. Tilesets embutidos ou fora do catálogo são recusados.
- Camadas obrigatórias, com estes nomes e tipos:

| Camada      | Tipo      | Conteúdo                                                                 |
|-------------|-----------|--------------------------------------------------------------------------|
| `floor`     | tiles     | piso; sem colisão                                                        |
| `walls`     | tiles     | todo tile não vazio colide                                               |
| `furniture` | objetos   | objetos de tile (gid); colide se o tile tiver a propriedade `collides`   |
| `zones`     | objetos   | retângulos alinhados ao grid; propriedades `zone_key`, `type`, `name`   |
| `desks`     | objetos   | propriedades `desk_key` e `orientation` (`up`, `down`, `left`, `right`) |
| `spawn`     | objetos   | exatamente um ponto, em tile caminhável                                  |

- `zone_key` e `desk_key`: únicos no mapa, `[a-z0-9-]{1,40}`. São estáveis entre edições; é por
  eles que trancas, salas de mídia e atribuições de mesa se referem às zonas e mesas.
- `type` da zona: `open` ou `meeting`. Zonas não se sobrepõem. Tiles fora de qualquer zona
  pertencem à zona implícita `__open`, do tipo `open`.
- `name` da zona é desenhado como rótulo no mapa (ex.: "Product team").
- A cadeira da mesa é o tile à frente dela, conforme `orientation`. Esse tile precisa ser
  caminhável. "Sentado" = estar no tile da cadeira da própria mesa.
- Decisões da fase 1: caminhável = tem piso, não tem parede e não tem móvel com `collides`. A
  própria mesa ocupa e bloqueia o seu tile. Objetos de tile (móveis) seguem a âncora do Tiled, no
  canto inferior esquerdo. Entrada que não é objeto JSON devolve `not_orthogonal` (não há
  `orientation`). Os metadados dos `.tsj` (colunas, `collides`, `item_id`) vão para o catálogo
  gerado (`TILESETS`), para o `compileMap` não ler arquivo.
- O Phaser não lê tileset externo: o cliente embute os tilesets do catálogo no JSON só para
  renderizar. O mapa salvo continua com `source`.

Compilação (em `shared`, usada por cliente e servidor):

```ts
export interface CompiledMap {
  width: number;
  height: number;
  walkable: Uint8Array;          // 1 = caminhável, índice y * width + x
  zoneIndex: Uint16Array;        // índice em zones para cada tile
  zones: { key: string; type: 'open' | 'meeting'; name: string; tiles: number }[];
  desks: { key: string; x: number; y: number; orientation: Dir; chairX: number; chairY: number }[];
  spawn: { x: number; y: number };
  tilesets: string[];            // catalogIds referenciados
}

export type MapError =
  | { code: 'not_orthogonal' | 'infinite' | 'wrong_tile_size' | 'too_large' | 'compressed_layer' }
  | { code: 'missing_layer' | 'wrong_layer_type'; layer: string }
  | { code: 'unknown_tileset'; source: string }
  | { code: 'duplicate_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'invalid_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'zone_overlap'; a: string; b: string }
  | { code: 'zone_not_aligned' | 'invalid_zone_type'; key: string }
  | { code: 'chair_blocked' | 'invalid_orientation'; deskKey: string }
  | { code: 'spawn_count'; found: number }
  | { code: 'spawn_blocked' };

export function compileMap(json: unknown): { ok: true; map: CompiledMap } | { ok: false; errors: MapError[] };
```

## 7. Simulação e movimento

Constantes iniciais (em `shared`):

```ts
export const TILE_PX = 16;             // grade lógica e arte
export const RENDER_SCALE = 2;         // escala inteira, nearest neighbor
export const STEP_MS = 160;            // duração de um passo
export const MIN_STEP_INTERVAL_MS = 140; // tolerância a jitter no servidor
export const TICK_MS = 100;
export const PROXIMITY_ENTER_TILES = 3;
export const PROXIMITY_EXIT_TILES = 4;  // histerese
export const MAX_VIDEO_BUBBLES = 6;
export const RECONNECT_GRACE_MS = 10_000;
export const CHAT_MAX_CHARS = 280;
export const CHAT_BUBBLE_MS = 6_000;
```

- O cliente envia `move` com `dir` e `seq` crescente. O servidor aplica no máximo um passo por
  `MIN_STEP_INTERVAL_MS`, recusa passo para tile não caminhável e recusa entrada em zona de reunião
  trancada para quem não está na lista de permitidos.
- O cliente prevê o passo localmente. O `ack` do tick diz até qual `seq` foi processado. Se a
  posição autoritativa do próprio jogador vier nos `moves` e divergir da predição, o cliente faz
  snap para ela e reaplica os passos pendentes com `seq > ack`.
- Outros avatares: interpolação de tile a tile com duração `STEP_MS`.
- Tick: lista de quem se moveu desde o último tick, serializada uma vez; `ack` por cliente.
  Todo o coworking vai para todos (sem área de interesse).
- Distância de proximidade: euclidiana em tiles, entre centros de tile.

Interface pura da simulação:

```ts
export function step(
  state: WorldState,
  inputs: readonly Input[],
  now: number,
  map: CompiledMap,
): { state: WorldState; events: WorldEvent[] };
```

## 8. Protocolo WebSocket

- Endpoint: `/ws?space=<spaceId>`. Uma conexão por aba por coworking.
- Segunda conexão do mesmo usuário no mesmo coworking: a anterior recebe `session.replaced` e é
  fechada.
- Mensagens em JSON, validadas com Zod. Mensagem inválida é descartada; mais de 10 inválidas em
  10 segundos fecham a conexão (código 1008). Mais de 50 mensagens por segundo também.
- Desconexão: o jogador permanece por `RECONNECT_GRACE_MS` antes de `player.leave`. O cliente
  reconecta com backoff exponencial.
- Decisões da fase 1:
  - Upgrade feito à mão (`ws` em `noServer` no evento `upgrade` do Fastify): `Origin`, cookie e
    `space_members` são conferidos antes de aceitar.
  - Fechamento: 4001 para `session.replaced` (o cliente não reconecta), 1008 para mensagens
    inválidas ou taxa.
  - O passo é aplicado quando a mensagem chega; o tick só faz o broadcast. Passo ignorado pelo
    intervalo mínimo também conta no `ack`. A contagem de `seq` recomeça a cada `welcome`.
  - O tick só sai quando alguém se moveu ou o `ack` de quem recebe mudou.
  - Interpolação: com vários passos na fila, a velocidade sobe na proporção da fila, então o
    avatar nunca fica mais de um passo atrás.

```ts
type Dir = 'up' | 'down' | 'left' | 'right';
type Status = 'available' | 'focus' | 'away';
type Activity = 'idle' | 'meeting' | 'call'; // derivado pelo servidor

interface Player {
  id: string;
  name: string;
  title: string | null;
  avatar: AvatarSpec;
  x: number;
  y: number;
  dir: Dir;
  status: Status;
  statusText: string | null;
  statusEmoji: string | null;
  activity: Activity;
}

interface ZoneState { zoneKey: string; locked: boolean; occupants: string[] }
interface DeskState { deskKey: string; userId: string | null; ownerName: string | null; decor: DeskDecor | null }

export type ClientMsg =
  | { t: 'move'; seq: number; dir: Dir }
  | { t: 'zone.lock'; zoneKey: string; locked: boolean }
  | { t: 'zone.knock'; zoneKey: string }
  | { t: 'zone.knockReply'; requestId: string; allow: boolean }
  | { t: 'call.invite'; userId: string }
  | { t: 'call.reply'; callId: string; accept: boolean }
  | { t: 'call.leave' }
  | { t: 'chat.say'; text: string };

export type ServerMsg =
  | { t: 'welcome'; selfId: string; mapVersion: number; players: Player[]; zones: ZoneState[]; desks: DeskState[] }
  | { t: 'tick'; ack: number; moves: [id: string, x: number, y: number, dir: Dir][] }
  | { t: 'player.join'; player: Player }
  | { t: 'player.leave'; id: string }
  | { t: 'player.update'; id: string; patch: Partial<Pick<Player, 'name' | 'avatar' | 'title' | 'status' | 'statusText' | 'statusEmoji' | 'activity'>> }
  | { t: 'zone.state'; zone: ZoneState }
  | { t: 'zone.knockRequest'; requestId: string; zoneKey: string; from: string }
  | { t: 'zone.knockResult'; zoneKey: string; allowed: boolean }
  | { t: 'media.join'; room: string; token: string; url: string }
  | { t: 'call.incoming'; callId: string; from: string }
  | { t: 'call.ended'; callId: string; reason: 'declined' | 'left' | 'timeout' | 'busy' }
  | { t: 'chat.said'; from: string; text: string }
  | { t: 'desk.updated'; desk: DeskState }
  | { t: 'map.updated'; version: number }
  | { t: 'session.replaced' }
  | { t: 'error'; code: string };
```

Regras de zona de reunião:

- Trancar e destrancar: só quem está dentro.
- Com a sala trancada, a lista de permitidos é quem estava dentro no momento da tranca mais quem
  foi aprovado depois. Quem sai e volta não precisa bater de novo enquanto a sala estiver trancada.
- `zone.knock` só vale estando num tile adjacente à zona. O pedido vai para todos os ocupantes;
  a primeira resposta vale. Sem resposta em 30 segundos, `zone.knockResult` com `allowed: false`.
- Sala vazia destranca automaticamente e limpa a lista de permitidos.

Regras de chamada:

- `call.invite` só é aceito com o autor sentado na própria mesa. O destino pode estar em qualquer
  lugar do coworking.
- Se o destino estiver em reunião ou em chamada, `call.ended` com `busy` para o autor.
- Sem resposta em 30 segundos, `call.ended` com `timeout`.
- Chamada 1:1. Levantar da mesa não encerra a chamada; só `call.leave` ou desconexão.

Regras de chat:

- O servidor calcula os destinatários: na zona `open`, quem está na mesma zona e a até
  `PROXIMITY_ENTER_TILES`; em zona de reunião, todos os ocupantes. O autor também recebe.
- No máximo 1 mensagem por segundo por usuário (rajada de 3). Texto com trim, de 1 a
  `CHAT_MAX_CHARS` caracteres. Nada é persistido.

## 9. REST

Toda rota sob `/spaces/:spaceId` resolve `space_members` primeiro e responde 404 se o usuário não
for membro (não vaza a existência do coworking). Depois de gravar, a rota faz o broadcast pelo
WebSocket.

```
POST   /auth/guest
GET    /auth/github
GET    /auth/github/callback
POST   /auth/logout
GET    /me
PUT    /me/avatar                         AvatarSpec
PUT    /me/name                           { name }

GET    /spaces                            coworkings do usuário
POST   /orgs                              { name, slug }
POST   /orgs/:orgId/spaces                { name, slug, template }   owner/admin da org
GET    /spaces/:spaceId                   metadados + mapa + versão

PUT    /spaces/:spaceId/me/status         { status, text, emoji }
PUT    /spaces/:spaceId/me/title          { title }
PUT    /spaces/:spaceId/members/:userId/title   admin
DELETE /spaces/:spaceId/members/:userId   admin, ou o próprio usuário (sair)

POST   /spaces/:spaceId/invites           admin -> { url }
POST   /invites/:token/accept

POST   /spaces/:spaceId/desks/:deskKey/claim    só com o usuário sobre o tile da cadeira e sem outra mesa
PUT    /spaces/:spaceId/desks/:deskKey/decor    dono
DELETE /spaces/:spaceId/desks/:deskKey          dono ou admin

POST   /spaces/:spaceId/map/validate      admin -> { errors, orphanDesks }
PUT    /spaces/:spaceId/map               admin { map, baseVersion } -> 409 se baseVersion != atual
GET    /spaces/:spaceId/map/export        admin -> zip
```

## 10. Mídia

Salas do LiveKit (identidade do participante = id do usuário):

| Sala                         | Quem entra                    | Assinatura                          | Tela |
|------------------------------|-------------------------------|-------------------------------------|------|
| `space:<spaceId>`            | quem está em zona `open`      | manual, decidida pela proximidade   | não  |
| `zone:<spaceId>:<zoneKey>`   | quem está na zona de reunião  | automática, todos com todos         | sim  |
| `call:<callId>`              | os dois participantes         | automática                          | sim  |

- O servidor emite o token e envia `media.join` sempre que a sala do cliente muda: ao entrar ou
  sair de zona de reunião, ao entrar ou sair de chamada. O cliente desconecta da sala anterior e
  conecta na nova.
- Ao sair de uma zona de reunião ou de uma chamada, o servidor também remove o participante da sala
  pela API de servidor do LiveKit. Isso cobre o cliente modificado que ignore o `media.join`.
- Restringir compartilhamento de tela na sala `space:` pelo grant do token, se o LiveKit suportar
  restrição por fonte de trilha (verificar); senão, só pela UI.
- Microfone e câmera: estados propagados pelo próprio LiveKit, nunca pelo WebSocket.

Proximidade (na sala `space:`):

- Função pura no cliente: posições + mapa compilado + conjunto atual -> conjunto de identidades a
  assinar. Entra a até `PROXIMITY_ENTER_TILES` na mesma zona, sai acima de `PROXIMITY_EXIT_TILES`
  ou ao mudar de zona.
- Fazer isso no cliente é aceitável porque a área aberta é visível para todo o coworking por
  definição. O que precisa de privacidade está em salas separadas.
- Volume atenuado pela distância (1,0 até 1 tile, caindo linearmente até 0,2 no raio de saída).
- Balões de vídeo: câmera desligada por padrão, com indicador de "visível para quem está perto".
  Até `MAX_VIDEO_BUBBLES` dos mais próximos, assinando a camada de menor qualidade (simulcast e
  adaptive stream); qualidade alta só quando o usuário expande o balão.
- Balões renderizados como `<video>` em HTML sobre o canvas, reposicionados a cada frame pela
  câmera do Phaser.

Descartados: mesh P2P (upload multiplicado por participante); mediasoup (nível baixo demais,
semanas de sinalização); vídeo como textura no canvas (upload de textura por frame sem ganho).

## 11. Customização

Avatar (`users.avatar`), IDs gerados do manifesto (ver `docs/art.md`):

```ts
export const AvatarSpec = z.object({
  body: z.enum(BODY_IDS),
  skin: z.enum(SKIN_PALETTES),
  hair: z.enum(HAIR_IDS).nullable(),
  hairColor: z.enum(HAIR_PALETTES),
  outfit: z.enum(OUTFIT_IDS),
  outfitColor: z.enum(OUTFIT_PALETTES),
  accessory: z.enum(ACCESSORY_IDS).nullable(),
});
```

- O cliente compõe as camadas, aplica a troca de paleta e gera uma textura por avatar, com cache
  pelo hash do `AvatarSpec`.

Mesa (`desk_assignments.decor`):

```ts
export const DeskDecor = z.object({
  variant: z.enum(DESK_VARIANTS),
  monitor: z.enum(['single', 'dual', 'laptop']),
  slots: z.object({
    left: z.enum(DECOR_ITEMS).nullable(),
    right: z.enum(DECOR_ITEMS).nullable(),
    back: z.enum(WALL_ITEMS).nullable(),
    floor: z.enum(FLOOR_ITEMS).nullable(),
  }),
});
```

- Deslocamento de cada slot definido por `orientation`.
- Mesa de dono offline mostra uma plaquinha com o nome.
- Ocupar mesa: andar até a cadeira de uma mesa livre e confirmar. Uma mesa por pessoa por coworking.

Exibição no mapa:

- Nome sempre visível sob o avatar, com o emoji de status ao lado.
- Cargo sob o nome só para quem está no raio de proximidade ou sob o mouse. Na lista lateral,
  sempre visível.
- Rótulo de zona desenhado no mapa.

Descartados: posicionamento livre de itens na mesa (colisão e sobreposição sem ganho visual);
tags de equipe gerenciadas pelo admin (tabela, tela e relação N:N para o mesmo problema).

## 12. Mapas: upload, export, editor e troca ao vivo

- Upload: `compileMap` no servidor; erros devolvidos com os códigos de `MapError`.
- `POST /map/validate` é o ensaio: devolve erros e as mesas atribuídas que deixariam de existir.
  O editor e o upload mostram esse aviso antes de salvar.
- Gravação: `PUT /map` com `baseVersion`; 409 se outra pessoa salvou antes. Na mesma transação:
  grava o mapa, incrementa `map_version` e apaga atribuições de mesas órfãs.
- Depois de gravar: o servidor recompila, move quem ficou em tile não caminhável para o tile
  caminhável mais próximo na mesma zona (BFS) ou para o spawn, limpa trancas de zonas removidas,
  encerra salas de mídia de zonas removidas e emite `map.updated`. Os clientes buscam o mapa de novo.
- Export: zip com `map.json`, os `.tsj` e `.png` de cada tileset referenciado e `CREDITS.txt`.
  O conteúdo depende da categoria de licença de cada asset (ver `docs/art.md`).
- Editor: modo de edição dentro do Phaser. Ferramentas: pincel de `floor` e `walls`, posicionar e
  remover móveis do catálogo, desenhar zonas, posicionar mesas, definir spawn. Undo e redo por
  pilha de comandos. Produz o mesmo JSON do Tiled.

## 13. Convidados e coworking de demonstração

- Seed cria a org "Demo" e o coworking `DEMO_SPACE_SLUG` a partir de um template.
- Job de hora em hora: apaga convidados expirados (cascata libera as mesas).
- Job noturno: restaura o mapa do coworking de demo a partir do template e limpa as atribuições
  de mesa.

## 14. Testes

- Vitest em todo o monorepo. Descartado Jest (configuração extra para TypeScript e ESM).
- Unitários: `compileMap` com tabela de fixtures válidas e inválidas (uma por `MapError`);
  `step` (intervalo mínimo, parede, zona trancada); proximidade com histerese e troca de zona;
  reconciliação do cliente; destinatários de chat.
- Autorização de mídia: lógica de atribuição de sala e conteúdo dos tokens, sem LiveKit rodando.
  Quem foi recusado na porta nunca recebe token da zona; quem sai volta para `space:`; quem não
  está na chamada nunca recebe token dela.
- Integração: servidor no processo de teste, porta aleatória, relógio manual, Postgres de teste
  com banco criado e destruído por execução. Bots: clientes WebSocket em Node usando os tipos de
  `shared`. Nenhum teste espera tempo real.
- Carga: `pnpm load --bots N`, mede latência tick-a-recebimento, tamanho médio de mensagem e CPU.
  Fora do CI. Descartados k6 e Artillery (exigiriam reescrever o protocolo fora do TypeScript).
- E2E de fumaça (fase 8): Playwright com dois contextos do Chromium e mídia falsa; verifica que a
  trilha remota foi assinada via estado de debug exposto só em modo de teste. LiveKit como service
  container no CI.
- Não testado: renderização do Phaser e layout do React. Lógica fica fora das cenas.
- CI: typecheck, lint, unitários e integração em todo push; Postgres como service container.

## 15. Deploy (futuro)

- Uma VPS, `docker-compose.prod.yml` com Caddy (TLS automático), app, Postgres e LiveKit.
- Restrições: HTTPS obrigatório (`getUserMedia` exige contexto seguro), portas UDP do LiveKit
  abertas no firewall, TURN sobre TLS na 443 para redes que bloqueiam UDP.
- Tudo que muda entre local e VPS vem do `.env`.
