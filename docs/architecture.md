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
- No Windows, a câmera falsa padrão do Chrome encerra a trilha em poucos segundos (o LiveKit
  então muta a câmera), e duas instâncias no mesmo processo disputam o dispositivo. Para testar
  vídeo: um processo por usuário e `--use-file-for-fake-video-capture=<arquivo>.y4m`.
- Em modo de desenvolvimento, `window.__pixelwork` expõe `media`, `world` e `controller` para
  scripts de verificação (`media.debugState()` mostra o que está assinado).

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
- Logout fecha na hora as conexões abertas com a mesma sessão (código 4004). Sessão que expira
  com a conexão aberta é fechada na varredura do heartbeat (seção 8).
- Limite de taxa por IP (`@fastify/rate-limit` 11.2.2, em memória): 300 requisições por minuto
  em geral; 10 por minuto em `POST /auth/guest`, `POST /orgs`, `POST /orgs/:orgId/spaces` e
  `POST /invites/:token/accept`; 20 nas rotas do GitHub; 30 em `GET /invites/:token`. Em
  produção `TRUST_PROXY=true`, porque o IP do cliente chega pelo Caddy no `X-Forwarded-For`.
  Os testes desligam o limite, menos o teste que o confere.

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
  uses_left int check (uses_left is null or uses_left >= 0)
);
```

Índices além das PKs (migration `0001`, revisão de 2026-11): `sessions(user_id)`,
`sessions(expires_at)`, `oauth_accounts(user_id)`, `org_members(user_id)`,
`space_members(user_id)`, `invites(space_id)` e `users(guest_expires_at) where is_guest`. As PKs
compostas começam por `space_id`/`org_id`, e as consultas por usuário (lista de coworkings,
cascatas ao apagar convidado, jobs) faziam varredura sequencial. Também entrou o check
`char_length(status_emoji) <= 16` como teto no banco para o grafema validado na aplicação.

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
- Mesa de 2 tiles (revisão visual de 2026-11, aprovada): a pegada vem do `width`/`height` do
  objeto na camada `desks`. Aceitas: 16x16 (mesa de 1 tile, a dos mapas antigos), 32x16 virada
  para cima ou para baixo, 16x32 virada para a esquerda ou a direita; o resto é `desk_size`. O
  objeto é ancorado no canto de cima à esquerda, a pegada inteira bloqueia, e a cadeira fica na
  frente do tile de âncora, encostada na borda da pegada (para baixo `(x, y+h)`, para cima
  `(x, y-1)`, à esquerda `(x-1, y)`, à direita `(x+w, y)`). `CompiledDesk` ganhou `w` e `h`. O
  editor cria mesas de 2 tiles e, ao girar, troca largura e altura. A pegada inteira tem que estar
  no mapa (senão `desk_outside`); o editor não cria, move nem gira mesa para fora.
- `CompiledDesk.wallBehind`: todos os tiles logo atrás da pegada (do lado oposto à cadeira) têm
  parede. Sem parede atrás, o item do slot "fundo" fica pendurado numa divisória baixa desenhada
  pelo cliente (`dividerLayout`), em vez de flutuar.
- Decisões da fase 1: caminhável = tem piso, não tem parede e não tem móvel com `collides`. A
  própria mesa ocupa e bloqueia o seu tile. Objetos de tile (móveis) seguem a âncora do Tiled, no
  canto inferior esquerdo. Entrada que não é objeto JSON devolve `not_orthogonal` (não há
  `orientation`). Os metadados dos `.tsj` (colunas, `collides`, `item_id`) vão para o catálogo
  gerado (`TILESETS`), para o `compileMap` não ler arquivo.
- O Phaser não lê tileset externo: o cliente embute os tilesets do catálogo no JSON só para
  renderizar. O mapa salvo continua com `source`.
- Revisão de 2026-11 (aprovada):
  - `spawn_in_meeting`: o spawn não pode cair em zona de reunião. Quem entrava nascia lá dentro e
    furava a tranca; a realocação de quem fica preso também usa o spawn.
  - `layer_size`: `floor` e `walls` precisam ter exatamente `width * height` posições.
  - `zone_outside` e `desk_outside`: zona sem nenhum tile dentro do mapa e mesa fora dele.
  - `chair_shared`: duas mesas com o mesmo tile de cadeira.
  - Zonas e móveis são recortados ao mapa antes de percorrer os tiles: um retângulo de 1e9 px num
    JSON pequeno travava o servidor.

Compilação (em `shared`, usada por cliente e servidor):

```ts
export interface CompiledMap {
  width: number;
  height: number;
  walkable: Uint8Array;          // 1 = caminhável, índice y * width + x
  zoneIndex: Uint16Array;        // índice em zones para cada tile
  zones: { key: string; type: 'open' | 'meeting'; name: string; tiles: number }[];
  desks: { key: string; x: number; y: number; w: number; h: number; orientation: Dir; chairX: number; chairY: number; wallBehind: boolean }[];
  spawn: { x: number; y: number };
  tilesets: string[];            // catalogIds referenciados
}

export type MapError =
  | { code: 'not_orthogonal' | 'infinite' | 'wrong_tile_size' | 'too_large' | 'compressed_layer' }
  | { code: 'missing_layer' | 'wrong_layer_type' | 'layer_size'; layer: string }
  | { code: 'unknown_tileset'; source: string }
  | { code: 'tileset_overlap'; a: string; b: string }   // firstgid + tilecount invade o seguinte
  | { code: 'duplicate_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'invalid_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'zone_overlap'; a: string; b: string }
  | { code: 'zone_not_aligned' | 'invalid_zone_type' | 'zone_outside'; key: string }
  | { code: 'chair_blocked' | 'invalid_orientation' | 'desk_outside' | 'desk_size'; deskKey: string }
  | { code: 'chair_shared'; a: string; b: string }
  | { code: 'spawn_count'; found: number }
  | { code: 'furniture_position'; objectId: number }    // móvel sem x/y numérico
  | { code: 'spawn_blocked' | 'spawn_in_meeting' };

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
- Revisão de 2026-11:
  - Passo que chega antes de `MIN_STEP_INTERVAL_MS` (jitter da rede junta dois passos) não é mais
    descartado: espera numa fila de até `MAX_QUEUED_MOVES` (2) e é aplicado assim que o intervalo
    passa, no máximo no tick seguinte. O `ack` só avança quando o passo é decidido (aplicado ou
    recusado). Passo além da fila cheia é descartado e confirmado, e o cliente corrige pelo
    `ack`. Antes o passo sumia e a reconciliação puxava o avatar um tile para trás.
  - Descartado: aplicar todos os passos em lote no tick. A cópia do mapa de jogadores por
    passo some, mas o passo passa a ser quantizado em 100 ms e a velocidade cai para um passo a
    cada 200 ms, com fila crescendo.
  - A predição do cliente respeita sala trancada (a mesma regra do `canEnter`), contando as
    salas em que a batida foi aceita.
  - Correção de até um tile desliza em vez de saltar; maior que isso continua teleporte.
  - Clicar para andar e seguir (revisão de 2026-11): `findPath` em `shared` (A* em 4 direções,
  heap binário, mesma regra de sala trancada da predição) devolve a lista de direções. O cliente
  manda um `move` por vez, no ritmo de `STEP_MS`, então o invariante 1 continua: o servidor
  decide cada passo. Seguir recalcula o caminho a cada passo até ficar ao lado da pessoa
  (`stopAt: 1`). Qualquer tecla de movimento cancela; passo recusado pela predição também.
- Interpolação dos outros: até dois passos na fila andam na velocidade normal (o segundo é só o
    descompasso entre tick de 100 ms e passo de 160 ms); acima disso a velocidade sobe. A
    animação de andar segura 120 ms depois de a fila esvaziar.
  - Fora do ar (status diferente de `online`) o cliente não aceita input de movimento.
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
  reconecta com backoff exponencial, e na hora quando o navegador avisa que a rede voltou.
- Tick binário (aprovado em 2026-11, `shared/src/binary.ts`): cada jogador ganha um id curto
  (u16, o menor livre no runtime) que vai no `Player.n` do `welcome` e do `player.join`. O tick
  vai como quadro binário: tipo (u8), `ack` (u32), `ts` (f64), quantidade (u16) e 5 bytes por
  movimento (id curto, x, y, direção), little-endian. O servidor monta o quadro uma vez e troca só
  o `ack` numa cópia por destinatário. O cliente decodifica para o mesmo `{ t: 'tick' }` de antes,
  com os ids completos, então o resto do cliente não mudou. As outras mensagens seguem em JSON.
  Com 50 bots, o tick médio caiu de 1.559 B para 154 B (README, "Números de carga").
- `ping { id }` → `pong { id, ts }` (aprovado em 2026-11): o cliente manda a cada
  `PING_INTERVAL_MS` (5 s), mede RTT, jitter e a diferença de relógio. Sem nenhuma mensagem do
  servidor por `CONNECTION_TIMEOUT_MS` (15 s), o cliente dá a conexão como morta e reconecta.
- Robustez do gateway (revisão de 2026-11):
  - O socket ganha um listener de `error` logo no `upgrade`: sem ele, um ECONNRESET durante as
    consultas de sessão e participação derrubava o processo.
  - Falha ao carregar o runtime (erro do banco) responde 500 e não fica em cache.
  - Mapa ou mesa gravados enquanto o runtime carrega marcam o coworking, e a carga recomeça.
  - A participação é conferida de novo com o socket já aberto, logo antes do `connect`: uma
    remoção gravada durante a carga não recoloca a pessoa no mapa.
  - Heartbeat: a cada 30 s o servidor manda ping de protocolo; quem não respondeu ao anterior é
    derrubado (conexão meio aberta), o que dispara a tolerância de reconexão normal. O intervalo
    usa o relógio do sistema, não o agendador injetado, porque é transporte e não simulação.
  - Cliente que não lê o socket: com mais de 1 MB pendente no buffer de envio, a conexão cai.
  - Runtime sem ninguém (nem na tolerância) por 10 minutos sai da memória; a próxima conexão
    carrega de novo do banco.
- Decisões da fase 1:
  - Upgrade feito à mão (`ws` em `noServer` no evento `upgrade` do Fastify): `Origin`, cookie e
    `space_members` são conferidos antes de aceitar.
  - Fechamento: 4001 para `session.replaced` (o cliente não reconecta), 1008 para mensagens
    inválidas ou taxa, 4003 para removido do coworking, 4004 para sessão encerrada (logout ou
    expiração; o cliente volta para o login).
  - O passo é aplicado quando a mensagem chega; o tick só faz o broadcast (e drena a fila de
    passos adiantados, seção 7). A contagem de `seq` recomeça a cada `welcome`.
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

Decisões da fase 4:

- Códigos de `error`: `not_in_zone` (trancar de fora), `not_locked` (bater em sala aberta),
  `not_at_door` (bater longe da porta), `not_seated`, `call_unavailable` (destino offline ou o
  próprio autor) e `already_in_call`.
- Quem está dentro da sala trancada pode sair e voltar enquanto ela segue trancada; a simulação
  só confere a lista na entrada.
- A resposta à batida não é avisada aos outros ocupantes (o protocolo não tem a mensagem); o
  cliente tira o pedido da tela no prazo de 30 segundos.
- O autor não recebe confirmação com o `callId`: sabe que a chamada começou pelo `media.join`
  da sala `call:` e pela atividade `call`. Quem recebe e sai antes de atender (`call.leave`)
  conta como `declined`.
- Desconexão encerra a chamada na hora; a tolerância de reconexão vale só para a presença.
- Conexão nova sempre recebe o `media.join` da sala atual, mesmo que seja a mesma de antes.

Regras de chat:

- O servidor calcula os destinatários: na zona `open`, quem está na mesma zona e a até
  `PROXIMITY_ENTER_TILES`; em zona de reunião, todos os ocupantes. O autor também recebe.
- No máximo 1 mensagem por segundo por usuário (rajada de 3). Texto com trim, de 1 a
  `CHAT_MAX_CHARS` caracteres. Nada é persistido.

## 9. REST

Toda rota sob `/spaces/:spaceId` resolve `space_members` primeiro e responde 404 se o usuário não
for membro (não vaza a existência do coworking). Depois de gravar, a rota faz o broadcast pelo
WebSocket.

Decisões da fase 2:

- Códigos: 400 corpo inválido (com a lista de problemas), 403 sem permissão (admin ou dono),
  404 não membro ou recurso inexistente, 409 mesa ocupada (`desk_taken`) ou usuário que já tem
  mesa (`already_has_desk`), 422 fora da cadeira (`not_on_chair`).
- No claim, a posição vem do estado em memória do tempo real; quem não está conectado não ocupa
  mesa. A corrida entre dois claims cai nas constraints únicas e vira 409.
- A rota fala com o runtime do coworking já carregado (`app.realtime.runtime(spaceId)`); se
  ninguém está conectado, só grava. O runtime guarda o estado das mesas e aplica as mudanças de
  perfil, para o `welcome` seguinte sair certo.
- Tamanhos de texto contados em code points, como o `char_length` do Postgres.

Decisões da fase 5:

- Rotas acrescentadas (aprovadas): `GET /auth/providers` (o GitHub está configurado?),
  `GET /invites/:token` (prévia do convite) e `GET /templates`. `GET /spaces` passou a trazer
  `orgId` e `orgRole`, para a tela de criação saber em quais empresas o usuário cria.
- Convidado não cria empresa (`guest_forbidden`); aceita convite normalmente.
- Conta nova do GitHub entra no coworking de demonstração, como o convidado.
- Convite: 404 inexistente, 410 `invite_expired` ou `invite_used_up`, 409 `already_member`
  (tem precedência sobre os outros e não gasta uso). Decremento de usos condicional, na mesma
  transação da entrada. Validade padrão de 7 dias.
- Callback do GitHub com `state` divergente, ausente ou código recusado volta para
  `/?erro=github` sem sessão. O cliente do GitHub é injetado (`GitHubClient`).
- O último admin de um coworking não sai nem é removido (409 `last_admin`): a contagem e a
  remoção rodam na mesma transação, com as linhas dos admins travadas (`for update`).
- Exceção registrada ao invariante 4: as rotas de convite (`GET /invites/:token` e o aceite) leem
  `space_members` pelo `space_id` do convite, porque quem aceita ainda não é membro. O token é a
  autorização.
- `requireMember` devolve o `spaceId` que veio da resolução de `space_members`, e as rotas usam
  esse, nunca o parâmetro cru (revisão de 2026-11).
- Remover membro (ou sair) libera a mesa pela FK, fecha a conexão com o código 4003 e tira o
  jogador do mapa na hora, sem tolerância. Trocar de coworking é uma desconexão comum: o
  avatar some do anterior depois dos 10 segundos de tolerância.
- A tabela de isolamento de tenant vem do hook `onRoute` do Fastify (`app.routeTable`).

```
POST   /auth/guest
GET    /auth/providers                    { github: boolean }
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

GET    /templates                         mapas de partida
POST   /spaces/:spaceId/invites           admin { role, expiresInHours, maxUses } -> { url }
GET    /invites/:token                    prévia: coworking, empresa, papel
POST   /invites/:token/accept

POST   /spaces/:spaceId/desks/:deskKey/claim    só com o usuário sobre o tile da cadeira e sem outra mesa
PUT    /spaces/:spaceId/desks/:deskKey/decor    dono
DELETE /spaces/:spaceId/desks/:deskKey          dono ou admin

POST   /spaces/:spaceId/map/validate      admin -> { errors, orphanDesks }
PUT    /spaces/:spaceId/map               admin { map, baseVersion } -> 409 se baseVersion != atual
GET    /spaces/:spaceId/map/export        admin -> zip
GET    /spaces/:spaceId/replay            admin -> { recording } (gravação da simulação)
GET    /metrics                           texto do Prometheus (só rede interna)
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
- Exceção aprovada (pingpong, seção "Interações com objetos"): o adversário de uma partida em
  andamento conta como perto, mesmo acima do raio. A sala continua a `space:`.
- Balões de vídeo: câmera desligada por padrão, com indicador de "visível para quem está perto".
  Até `MAX_VIDEO_BUBBLES` dos mais próximos, assinando a camada de menor qualidade (simulcast e
  adaptive stream); qualidade alta só quando o usuário expande o balão.
- Balões renderizados como `<video>` em HTML sobre o canvas, reposicionados a cada frame pela
  câmera do Phaser.

Decisões da fase 3 (versões fixadas: `livekit-server-sdk` 2.20.0, `livekit-client` 2.24.1):

- O grant `canPublishSources` existe e substitui `canPublish`: o token da sala `space:` só libera
  câmera e microfone, então compartilhar tela ali é recusado pelo próprio LiveKit. Validade do
  token: 2 minutos (era 6 horas). O LiveKit só confere o token na entrada e renova sozinho o de
  quem segue conectado; com validade curta, um token guardado não serve para voltar a uma sala
  trancada, a uma chamada encerrada ou ao coworking de que a pessoa foi removida.
- Ao trocar de sala, o servidor tira o participante da anterior pela API do LiveKit, inclusive
  da `space:` (antes ela era poupada, e um cliente modificado podia ficar nela durante uma
  reunião ou chamada). Sair do coworking também remove da `space:`. "Não encontrado" do LiveKit
  (participante que já saiu) não é registrado como erro.
- O serviço de mídia é uma interface injetada no tempo real (`MediaService`), para os testes de
  autorização usarem um dublê.
- Volume pelo `RemoteParticipant.setVolume`, sem Web Audio. Conexão com `autoSubscribe: false`,
  `adaptiveStream` e `dynacast`; simulcast já vem ligado ao publicar.
- Áudio é assinado para todo mundo no raio; vídeo só para quem está nos balões. Quem sai é
  desassinado (`setSubscribed(false)`).
- Numa sala de reunião, a proximidade (e o chat) vale para todos os ocupantes; quem está fora
  nunca entra. Na fase 4 a sala vira uma sala de mídia separada.
- Microfone começa ligado (a fase é "chegar perto liga áudio"); câmera começa desligada.
- O gerenciador de mídia descarta, por um contador de geração, a conexão que termina depois de
  um `media.join` mais novo. Sessão substituída por outra aba também fecha a mídia.
- Chat: `error` com `chat_invalid` (vazio ou acima de `CHAT_MAX_CHARS` depois do trim) ou
  `chat_rate` (balde de 3 fichas, 1 por segundo).

Decisões da fase 4:

- Remoção pelo `RoomServiceClient.removeParticipant`, que aceita a URL `ws://` e troca para
  http sozinho. Erro na remoção (participante que já saiu) só vai para o log.
- Os tokens de `zone:` e `call:` liberam câmera, microfone, tela e áudio da tela.
- Nas salas `zone:` e `call:` o cliente assina tudo de todos, com volume cheio, e mostra uma
  grade de câmeras com a tela compartilhada em destaque no lugar dos balões.

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
- Decisões da fase 2: esquerda e direita dos slots são as de quem está sentado; o fundo fica
  atrás da mesa e o chão ao lado dela (tabela `SLOT_OFFSET` no cliente). Mesa livre aparece com a
  variação padrão e um monitor. Sentado olha para a mesa (frame da linha 4 na direção oposta à
  `orientation`). A composição do avatar é uma função só, usada pela textura do Phaser e pela
  prévia do editor.

Exibição no mapa:

- Nome sempre visível sob o avatar, com o emoji de status ao lado.
- Cargo sob o nome só para quem está no raio de proximidade ou sob o mouse. Na lista lateral,
  sempre visível.
- Rótulo de zona desenhado no mapa.

Descartados: posicionamento livre de itens na mesa (colisão e sobreposição sem ganho visual);
tags de equipe gerenciadas pelo admin (tabela, tela e relação N:N para o mesmo problema).

Decisões de interface (revisão de 2026-11):

- Cards de zona, mesa, chamada e boas-vindas ficam num painel único (`.hud`, canto superior
  direito; embaixo no celular), empilhados em vez de posicionados um por um.
- Rótulos em português dos IDs do catálogo em `ui/labels.ts`; ID sem rótulo aparece como está.
  A decoração da mesa usa miniaturas recortadas do tileset por CSS.
- Zoom da câmera em degraus inteiros (1x, 2x, 3x sobre o `RENDER_SCALE`) para o pixel art não
  borrar; mapa menor que a tela fica centralizado alargando os limites da câmera.
- Resolução (revisão de 2026-11-22): o canvas tem a resolução física da tela (`devicePixelRatio`)
  e a escala do pixel art vem do zoom da câmera, `round(RENDER_SCALE * devicePixelRatio)` vezes o
  degrau (`client/src/game/scale.ts`). Antes o canvas era desenhado em meia resolução e esticado
  pelo CSS, e o texto de 7 px no zoom 1x ficava ilegível. Texto usa filtro linear (o resto segue
  nearest).
- Quem fala (`ActiveSpeakersChanged` do LiveKit) ganha um anel sob o avatar e destaque na lista.
- Status na lista também por forma (círculo, quadrado, anel) e texto, não só cor.
- Overlay de netcode (F3 ou botão "Rede"), disponível também em produção: RTT, jitter e
  diferença de relógio pelo `ping`, latência do tick (hora do servidor no tick contra a hora
  local corrigida), passos pendentes e correções da reconciliação. Um quadrado tracejado mostra
  a posição que o servidor confirmou. O simulador aplica atraso e jitter no próprio cliente, nas
  duas direções, preservando a ordem das mensagens; não simula perda, porque sobre TCP perda
  vira atraso.
- Tema claro (redesenho visual de 2026-11): fundo creme, superfícies brancas com sombra suave,
  texto grafite, azul da paleta como cor de ação, fonte Inter (`@fontsource-variable/inter`,
  SIL OFL 1.1, servida pelo app por causa da CSP). No mapa, nome em pílula escura com bolinha de
  status embaixo dos pés (acima da cabeça brigaria com o balão de vídeo), zona em pílula clara,
  balão de chat branco com rabicho; os rótulos são refeitos quando a Inter termina de carregar.
- Sombra de contato translúcida desenhada pelo Phaser sob cada móvel colidível e sob cada avatar.
- Editor: ferramenta Tapete (`paintRug`, arrastar retângulo), escolha do tile de parede, nomes dos
  pisos e paleta de móveis em miniaturas por categoria (`editor/categories.ts`, só organização da
  tela). `placeFurniture` recebe tileset e frame, grava a pegada pela célula do tileset e, em mapa
  salvo antes de um tileset existir, acrescenta a referência a ele no mesmo comando (desfazer
  continua exato).
- Catálogo: `TILESETS[id]` traz `tileWidth`/`tileHeight`; cliente e editor carregam cada
  spritesheet com a célula do seu tileset.
- O canvas fica fora do fluxo do layout: o tamanho vem do container, observado por
  `ResizeObserver`.

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

Decisões da fase 6:

- Zip com `fflate` 0.8.3 (sem dependências); descartado escrever o zip à mão com `zlib`.
- `PUT /map`: o `UPDATE` só grava com `map_version = baseVersion` (concorrência otimista na
  própria query); sem linha atualizada, 409 `stale_map` com a versão atual. Mapa inválido ou
  acima de 5 MB responde 422 `invalid_map` com os erros. Limite do corpo da rota: 6 MB.
- Realocação (`relocate` no shared): busca em largura pelos 4 vizinhos, a partir do tile atual,
  aceitando só tile caminhável da mesma zona (a zona do tile no mapa novo); sem nenhum, o spawn.
- Zona de reunião removida: batidas pendentes são recusadas, a tranca some, quem estava dentro
  recebe o `media.join` da sala nova e a sala `zone:` é encerrada (`deleteRoom`).
- Zona trancada redesenhada por cima de quem estava fora: a pessoa vai para o spawn em vez de
  ganhar acesso. Sala que fica vazia com a troca destranca (revisão de 2026-11).
- No cliente, `map.updated` busca o mapa de novo e recria só a cena do Phaser; a conexão, a mídia
  e as chamadas continuam. A posição de quem foi realocado chega pelo tick.
- O `CREDITS.txt` do export lista só os tilesets que o mapa usa; a página `/creditos` lista o
  catálogo inteiro.

Decisões da fase 7 (modelo do editor, `packages/shared/src/editor`):

- Comandos puros sobre o JSON do Tiled: `paint`, `addObject`, `removeObject`, `replaceObject`,
  `setDocFields` e `batch`. Aplicar devolve o documento novo e o inverso; o inverso de
  `replaceObject` guarda o objeto anterior inteiro, então desfazer reproduz o JSON byte a byte.
- Operações de alto nível (pincel, móvel, zona, mesa, mover, girar, remover, spawn) montam os
  comandos e devolvem `null` quando não há mudança.
- `zone_key` e `desk_key` são geradas como `zona-N` e `mesa-N` a partir de contadores guardados
  nas propriedades do mapa (`pixelwork_next_zone`, `pixelwork_next_desk`): uma chave apagada não
  volta, para uma atribuição antiga não cair numa mesa nova. O `nextobjectid` do Tiled é mantido.
- Um traço de pincel é um comando só; um comando novo limpa o refazer.

Decisões da fase 7 (editor no app, `packages/client/src/editor`):

- "Editar mapa" troca a cena do jogo pela `EditorScene`; conexão, mídia e chamadas continuam,
  mas o avatar não anda. O `EditorController` guarda pilha, ferramenta, opções e seleção fora
  do Phaser; a cena só desenha e traduz o mouse, o painel em React lê o mesmo estado.
- A cena redesenha tudo a partir do documento a cada comando (mapas de até 100x100).
- Editando, mapas que chegam por `map.updated` são ignorados; salvar usa a `baseVersion` do
  início da edição e, no 409, o painel oferece descartar e recarregar o mapa atual.
- O template para começar do zero é o JSON de `maps/templates/` importado no cliente, sem rota.
  Ao trocar, `adoptDocument` renumera as chaves do modelo que já foram usadas no mapa atual e
  leva o contador adiante: a "mesa-1" do modelo é outra mesa, e a atribuição antiga aparece como
  órfã ao salvar em vez de ser herdada (revisão de 2026-11).
- Renomear zona grava ao sair do campo: um comando por renomeação, não por tecla.

## 13. Convidados e coworking de demonstração

- Seed cria a org "Demo" e o coworking `DEMO_SPACE_SLUG` a partir de um template.
- Job de hora em hora: apaga convidados expirados (cascata libera as mesas).
- Job noturno: restaura o mapa do coworking de demo a partir do template e limpa as atribuições
  de mesa.
- Decisões da fase 8: os dois jobs rodam no processo do servidor (`scheduleJobs`), com relógio e
  agendador injetáveis. O reset é às 03:00 UTC (meia-noite em Brasília) e quem está online recebe
  a troca de mapa ao vivo; o convidado expirado que ainda está online sai do mapa na hora.

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
- Decisões da fase 8: o `tick` ganhou `ts` (hora do servidor no envio) para a latência do teste
  de carga; `GET /internal/stats` (CPU e memória) só existe com `LOAD_TEST=true`. O LiveKit do E2E
  sobe com `docker run`, porque o service container do GitHub não aceita `--dev --bind 0.0.0.0`.
  O estado de debug do E2E é o mesmo `window.__pixelwork` do modo de desenvolvimento.

## Replay determinístico (revisão de 2026-11)

- Cada runtime grava o que a simulação recebeu: `join` (com a posição), `leave`, cada passo
  entregue ao `step` (aplicado ou recusado, com o tempo do relógio injetado) e cada mudança de
  tranca (estado e lista de permitidos). Troca de mapa ou gravação cheia (20 mil eventos)
  recomeça a gravação a partir de um retrato de quem está no mapa e das trancas ativas.
- `replay` (em `shared`) reproduz a gravação com o mesmo `step` puro e a mesma regra de tranca, e
  chega às mesmas posições: um teste de integração confere isso num cenário com tranca e batida.
- `GET /spaces/:spaceId/replay` (só admin) devolve a gravação; o botão "Replay" do cliente a
  reproduz num canvas com linha do tempo e velocidade.
- Fica de fora o que não entra na simulação (chat, mídia, chamadas, mesas, partidas de
  pingpong): o replay é do movimento.

## Interações com objetos: pingpong (aprovado e implementado em 2026-11-22)

Desenho completo em `docs/superpowers/specs/2026-11-22-pingpong-design.md`. Decisões de contrato:

- Mapa compilado: `compileMap` devolve `tables: CompiledTable[]` para os móveis cujo `item_id` está
  em `INTERACTIVE_ITEMS` (hoje só `ping-pong` → `pong`), com chave `<item>@<x>,<y>` e os tiles de
  cada lado. O mapa salvo não muda. Troca de mapa ao vivo encerra as partidas.
- Simulação: módulo puro `shared/src/pong.ts` (estado + intenções das raquetes + tempo → novo
  estado + eventos), relógio injetado, e um bot puro para o modo solo. O servidor avança cada
  partida a 30 Hz com o `Scheduler` injetado, só enquanto ela existe.
- Protocolo: cliente manda `game.join`, `game.bot`, `game.rematch`, `game.leave` e `game.input
  { seq, dir }` (só na mudança). Servidor manda `game.state` (30 Hz, só aos jogadores),
  `game.events` e `table.state` (a todos, para a plaquinha com o placar). O `welcome` ganha
  `tables` e `game` (a mesa do próprio jogador, para reabrir a janela na reconexão);
  `Player.activity` ganha `'game'` (chamada continua com prioridade).
- Regras de convivência: com a janela aberta o servidor ignora `move`; queda de conexão pausa a
  partida durante `RECONNECT_GRACE_MS`; quem está em chamada não entra na mesa e quem joga
  responde `busy` a convite de chamada.
- Mídia: nenhuma sala nova; os adversários se ouvem pela exceção de proximidade (seção 10), com
  volume cheio.
- Fica fora do replay determinístico.
- Decisões da implementação: o `seq` do `game.input` recomeça a cada `welcome`, como o do
  movimento, e a reconexão zera o `ack` no servidor (`GameRegistry.reconnected`). O cliente prevê
  a raquete e extrapola a bola no próprio relógio, a partir da hora em que o `game.state` chegou
  (`client/src/net/pong-predict.ts`), sem misturar o `serverTs`. O estado da partida não conta
  como mudança para a UI em React (o canvas lê o último estado a cada quadro). Servidor em
  `server/src/realtime/games.ts`; métricas `pixelwork_games_active` e
  `pixelwork_game_frame_seconds`.

## Observabilidade

- `GET /metrics` no formato de texto do Prometheus, escrito à mão (sem dependência): conexões,
  jogadores, runtimes carregados, mensagens e bytes por direção, tokens de mídia emitidos,
  histograma da duração do tick, memória, CPU e atraso do event loop (p99).
- Não é público: o Caddy só repassa as rotas da API listadas, então `/metrics` fica acessível só
  na rede interna do compose (`app:3000/metrics`) ou em `localhost:3000` no desenvolvimento.
- A duração do tick usa `performance.now()`; a simulação continua no relógio injetado.

## 15. Deploy (futuro)

- Uma VPS, `docker-compose.prod.yml` com Caddy (TLS automático), app, Postgres e LiveKit.
- Restrições: HTTPS obrigatório (`getUserMedia` exige contexto seguro), portas UDP do LiveKit
  abertas no firewall, TURN sobre TLS na 443 para redes que bloqueiam UDP.
- Tudo que muda entre local e VPS vem do `.env`.
- Decisões da fase 8: um Dockerfile com dois alvos, `app` (Node 24 com `tsx`, que roda
  migrations e seed ao subir) e `web` (Caddy com o cliente compilado, servindo a SPA e repassando
  a API e o WebSocket). O servidor roda com `tsx` porque o código usa propriedades no construtor,
  que o Node não remove sozinho. Faixa UDP do LiveKit em 50000-50100. Passo a passo, portas e TURN
  em `docs/deploy.md`.
