// Valores iniciais configuráveis (docs/architecture.md, seção 7).
export const TILE_PX = 16;
export const RENDER_SCALE = 2;
export const STEP_MS = 160;
export const MIN_STEP_INTERVAL_MS = 140;
export const TICK_MS = 100;
export const PROXIMITY_ENTER_TILES = 3;
export const PROXIMITY_EXIT_TILES = 4;
export const MAX_VIDEO_BUBBLES = 6;
export const RECONNECT_GRACE_MS = 10_000;
/** Intervalo do `ping` de aplicação do cliente (RTT e detecção de conexão morta). */
export const PING_INTERVAL_MS = 5_000;
/** Sem nenhuma mensagem do servidor por este tempo, o cliente derruba e reconecta. */
export const CONNECTION_TIMEOUT_MS = 15_000;
/** Passos que chegaram cedo demais (jitter) e esperam o intervalo mínimo no servidor. */
export const MAX_QUEUED_MOVES = 2;
export const CHAT_MAX_CHARS = 280;
export const CHAT_BUBBLE_MS = 6_000;
export const KNOCK_TIMEOUT_MS = 30_000;
export const CALL_RING_TIMEOUT_MS = 30_000;

/** Mapas de partida para criar um coworking (arquivos em maps/templates/). */
export const MAP_TEMPLATES = [{ id: 'small-office', name: 'Escritório pequeno' }] as const;
export type MapTemplateId = (typeof MAP_TEMPLATES)[number]['id'];
