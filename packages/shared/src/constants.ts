// Valores iniciais configuráveis (docs/architecture.md, seção 7).
/** Lado do tile em pixels: grade lógica do mapa e tamanho da arte. */
export const TILE_PX = 16;
/** Escala inteira do pixel art na tela (nearest neighbor), antes do zoom da câmera. */
export const RENDER_SCALE = 2;
/** Duração da animação de um passo de um tile no cliente. */
export const STEP_MS = 160;
/** Intervalo mínimo entre dois passos aceitos pelo servidor; abaixo de STEP_MS para tolerar jitter. */
export const MIN_STEP_INTERVAL_MS = 140;
/** Período do tick do servidor, que junta os movimentos e manda a todos. */
export const TICK_MS = 100;
/** Distância (em tiles) para alguém passar a contar como perto. */
export const PROXIMITY_ENTER_TILES = 3;
/** Distância (em tiles) para deixar de contar como perto; maior que a de entrada (histerese). */
export const PROXIMITY_EXIT_TILES = 4;
export const MAX_VIDEO_BUBBLES = 6;
/** Tempo que um jogador desconectado continua no mapa antes do `player.leave`. */
export const RECONNECT_GRACE_MS = 10_000;
/** Intervalo do `ping` de aplicação do cliente (RTT e detecção de conexão morta). */
export const PING_INTERVAL_MS = 5_000;
/** Sem nenhuma mensagem do servidor por este tempo, o cliente derruba e reconecta. */
export const CONNECTION_TIMEOUT_MS = 15_000;
/** Passos que chegaram cedo demais (jitter) e esperam o intervalo mínimo no servidor. */
export const MAX_QUEUED_MOVES = 2;
export const CHAT_MAX_CHARS = 280;
/** Tempo que o balão de chat fica sobre o avatar. */
export const CHAT_BUBBLE_MS = 6_000;
/** Prazo para responder à batida na porta de sala trancada; sem resposta, conta como recusa. */
export const KNOCK_TIMEOUT_MS = 30_000;
/** Prazo para o convidado atender uma chamada antes de ela terminar como `timeout`. */
export const CALL_RING_TIMEOUT_MS = 30_000;

/** Mapas de partida para criar um coworking (arquivos em maps/templates/). */
export const MAP_TEMPLATES = [{ id: 'small-office', name: 'Escritório pequeno' }] as const;
export type MapTemplateId = (typeof MAP_TEMPLATES)[number]['id'];
