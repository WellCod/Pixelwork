# Interação com objetos: pingpong

Data: 2026-11-22. Status: proposta, aguardando aprovação do dono. Revisada após a leitura de um revisor.

## Intenção

Objetos do mapa passam a ter interação. O primeiro é a mesa de pingpong: quem chega nela joga
uma partida, sozinho (contra um bot) ou contra outra pessoa que esteja do outro lado da mesa. O
projeto é portfólio e o foco é o tempo real; a partida é um segundo exemplo de simulação com
autoridade do servidor, agora com bola rápida, e por isso o servidor simula tudo.

## Objetivos

- Partida de pong 1x1 numa janela sobre o mapa, iniciada a partir da mesa.
- Modo solo contra um bot e modo de dois jogadores, um em cada lado da mesa.
- Servidor com autoridade: o cliente manda só a intenção da raquete; a física é um módulo puro.
- Quem está perto da mesa vê o placar ao vivo numa plaquinha sobre ela.
- Mecanismo genérico o bastante para o pebolim (`foosball`) entrar depois sem mexer no protocolo.

## Fora do escopo

- Ranking, histórico ou qualquer coisa persistida (a partida é efêmera, invariante 2).
- Assistir a partida em tempo real fora da janela (só o placar na plaquinha).
- Pebolim e outros jogos (só o mecanismo fica pronto para eles).
- Mudança no mapa salvo: nada novo no Tiled; a mesa é reconhecida pelo `item_id`.

## Anti-objetivos

- O cliente decidir onde a bola está ou quem pontuou.
- A partida travar o resto: andar, áudio por proximidade e chat seguem como hoje para quem não
  está jogando.
- Custo de CPU do servidor crescer com o número de pessoas no coworking; cresce só com partidas
  ativas.

## Abordagens consideradas

1. **Servidor simula em ritmo próprio (escolhida pelo dono).** Física pura no `shared`, avançada
   pelo servidor a 30 Hz enquanto há partida; jogadores mandam intenção; cliente prevê a própria
   raquete e extrapola a bola. Segue as invariantes 1 e 5, sem trapaça, atraso igual para os dois.
2. **Um jogador simula e o servidor repassa.** Mais simples, mas quebra a autoridade do servidor,
   dá vantagem a quem simula e permite trapaça. Descartada.
3. **Lockstep determinístico.** Trava a partida inteira com rede ruim e exige matemática idêntica
   nos dois lados; complexo demais para um pong. Descartada.

Apresentação: janela de jogo sobre o mapa (escolhida pelo dono) em vez de desenhar no sprite da
mesa (a mesa tem 48x32 px, pequena demais para jogar).

## Desenho

### Mesas interativas no mapa compilado

- Novo registro no `shared`: `INTERACTIVE_ITEMS = { 'ping-pong': 'pong' }` (item do catálogo para
  tipo de jogo). Só o pingpong por enquanto.
- `compileMap` passa a devolver `tables: CompiledTable[]` a partir da camada `furniture`:
  `{ key, game: 'pong', x, y, w, h, sides: { left: [x, y][], right: [x, y][] } }`, com a pegada em
  tiles. `key` = `<item>@<x>,<y>` (âncora em tiles). `sides.left` são os tiles caminháveis da
  coluna logo à esquerda da pegada; `sides.right`, os da coluna logo à direita. Não muda o mapa
  salvo, só a estrutura compilada (como o `wallBehind`). Mesa sem nenhum tile caminhável em um dos
  lados vale só para o modo solo (o jogador fica do lado que tiver tile).
- Troca de mapa ao vivo (`map.updated`) encerra as partidas em andamento.

### Regras da partida (módulo puro `packages/shared/src/pong.ts`)

- Campo lógico 160x90, raquete 3x18, bola 3x3; raquete esquerda em x=6, direita em x=151.
- Estado: `{ phase, ball: {x, y, vx, vy}, paddles: {left: y, right: y}, score: {left, right},
  serveAt, servingSide }`. Fases: `countdown` (3 s antes de cada saque), `playing`, `ended`.
- `stepPong(state, inputs: { left: -1|0|1, right: -1|0|1 }, nowMs) -> { state, events }`, com o
  relógio injetado (invariante 5). Passo fixo de 1000/30 ms; o servidor chama uma vez por quadro.
- Raquete: 120 unidades/s, presa ao campo. Bola: sai a 80 u/s, ganha 6% por rebatida até 200 u/s;
  o ângulo de volta depende de onde bateu na raquete (até 60°). Bate e volta no alto e embaixo.
- Ponto quando a bola passa da linha de fundo. Saque alterna a cada 2 pontos, a partir de quem
  sofreu o primeiro. Vence quem fizer 7.
- Eventos: `hit`, `wall`, `point { side }`, `end { winner }` (o cliente usa para som e animação).
- Bot: `botInput(state, side)` puro: segue a bola com zona morta de 6 u e só reage quando a bola
  vem na direção dele, para ser vencível.

### Fluxo

1. Quem está num tile de `sides` vê na barra do jogo (como a da mesa de trabalho) o botão
   "Jogar pingpong". Fora da mesa, nada aparece.
2. `game.join { tableKey }`: o servidor confere se o jogador está num tile de lado, escolhe o
   lado em que ele está (se ocupado, recusa com `error: table_side_taken`) e põe a mesa em
   `waiting`. A janela abre com "Esperando alguém do outro lado" e o botão "Jogar contra o bot".
3. Se alguém entra do outro lado (mesmo estando um jogo contra o bot), a partida recomeça como
   1x1 com placar zerado. `game.bot` começa contra o bot.
4. Com a janela aberta (em qualquer fase: esperando, jogando ou no fim), as setas e W/S movem a
   raquete, não o avatar, e a janela tem botões ▲▼ para toque. O servidor ignora `move` de quem
   está numa mesa. (Decisão de quem desenhou: assim sair do tile do lado não precisa de regra.)
5. Sair: fechar a janela (`game.leave`) ou mudar de mapa. Em 1x1, quem fica vence por desistência
   e a mesa volta a `waiting` com ele; contra o bot, a mesa fica livre. Ao fim (7 pontos), a janela
   mostra o resultado e oferece "Revanche" (volta a `countdown` com placar zerado se os dois
   aceitarem; solo, direto).
6. Queda de conexão (decisão de quem desenhou): a partida pausa (fase `paused`) enquanto durar a
   tolerância de reconexão do mapa (`RECONNECT_GRACE_MS`). Quem volta recebe no `welcome` a mesa em
   que está (`game: { tableKey, side } | null`) e o cliente reabre a janela; a partida volta com
   `countdown`. Se a tolerância expira (`player.leave`), conta como desistência.
7. Chamada e reunião (decisão de quem desenhou): quem está em chamada não entra na mesa
   (`error: table_busy`); `call.invite` para quem está numa mesa responde `busy`, como com quem
   está em reunião. `activity` vira `'game'` só se não houver chamada (a chamada continua tendo
   prioridade em `activityOf`). Mesa dentro de zona de reunião funciona normal.
8. Áudio (decisão do dono): durante a partida os dois adversários se ouvem mesmo a mais de
   `PROXIMITY_ENTER_TILES`: a função de proximidade do cliente trata o adversário de uma partida
   em andamento como "perto". Não muda a sala do LiveKit nem o contrato de mídia (invariante 3);
   as outras pessoas perto continuam sendo ouvidas normalmente. Contra o bot, nada muda.

### Protocolo (mudança de contrato)

Cliente → servidor:
- `{ t: 'game.join', tableKey }`, `{ t: 'game.bot' }`, `{ t: 'game.rematch' }`,
  `{ t: 'game.leave' }`
- `{ t: 'game.input', seq, dir: -1 | 0 | 1 }`: só quando a intenção muda (aperta, solta).

Servidor → cliente:
- Fase `paused` entra na lista de fases do estado (queda de conexão de um jogador).
- O `welcome` ganha `game: { tableKey, side } | null` (a mesa em que o próprio jogador está).
- Para os dois jogadores, 30 vezes por segundo: `{ t: 'game.state', tableKey, ack, phase, ball,
  paddles, score, serverTs }` (`ack` = último `seq` de input do destinatário). Em JSON como o resto
  do protocolo; vira binário só se o teste de carga mostrar necessidade.
- Para os jogadores, na hora: `{ t: 'game.events', tableKey, events }`.
- Para todos do coworking, quando muda (entrar, sair, ponto, fim): `{ t: 'table.state', table:
  { tableKey, phase: 'free' | 'waiting' | 'playing' | 'ended', left, right, score } }`, em que
  `left`/`right` são ids de jogador ou `'bot'`. O `welcome` ganha `tables: TableState[]`.
- O `Player.activity` ganha `'game'` (os outros veem que a pessoa está jogando).

### Servidor

- `SpaceRuntime` ganha um `GameRegistry` com as partidas ativas; cada uma tem um intervalo de
  1000/30 ms do `Scheduler` injetado, criado no início e cancelado no fim (sem partida, nenhum
  intervalo extra).
- O limite de 50 mensagens/s por conexão continua; `game.input` só na mudança fica bem abaixo.
- `/metrics` ganha partidas ativas e duração do quadro do jogo.
- A partida fica fora do replay determinístico (`record`); `docs/architecture.md` registra isso.

### Cliente

- Janela em React com um `<canvas>` 2D próprio (sem Phaser), em tamanho inteiro do campo
  ampliado, com placar e nomes dos jogadores.
- Raquete própria prevista localmente a partir do último `game.state` mais os inputs ainda sem
  `ack`; raquete adversária e bola extrapoladas pela velocidade desde o último estado e corrigidas
  suavemente no seguinte.
- No mapa: plaquinha sobre a mesa (mesmo estilo das pílulas) com "Ana 3 × 5 Bruno" ou
  "Livre"/"Esperando", visível para quem está a até `PROXIMITY_ENTER_TILES` tiles da mesa.

### Testes

- `pong.ts`: saque, rebatida (ângulo e aceleração), parede, ponto, alternância do saque, fim aos
  7, raquete presa ao campo, bot vencível (perde para uma sequência de inputs conhecida).
- `compileMap`: mesa vira `CompiledTable` com os lados certos; lado bloqueado fica sem tiles.
- Servidor (com relógio e scheduler falsos): entrar fora do lado é recusado; dois jogadores
  começam a partida; input mexe a raquete; ponto chega como evento e `table.state`; desistência
  dá vitória ao outro; `move` de quem joga é ignorado; nenhum intervalo sobra depois do fim; queda
  pausa e reconexão retoma; tolerância expirada dá vitória ao outro; quem está em chamada não
  entra; `call.invite` para quem joga dá `busy`.
- Proximidade no cliente: adversário de partida em andamento conta como perto.
- Cliente: previsão da raquete reconcilia com o `ack`.

## O que fica com quem constrói

- Tamanho da janela e o desenho do campo (seguindo o tema claro e a paleta).
- Sons (opcionais, só se já houver infraestrutura de áudio de efeitos).
- Nomes internos de classes e arquivos além dos citados.
