import type { Tile } from './pathfinding.ts';

export interface Arcade {
  key: string;
  pair: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spots: Tile[];
}

export type RaceLane = 0 | 1 | 2;
export type RacePedal = 'coast' | 'accelerate' | 'brake';
export const RACE_LANES = [0, 1, 2] as const;
export const RACE_LENGTH = 1_200;
export const RACE_TURBO_MS = 2_000;
export const RACE_TURBO_RECHARGE_MS = 6_000;
export const RACE_CONES = Array.from({ length: 19 }, (_, index) => ({
  lane: RACE_LANES[(index * 7 + Math.floor(index / 3)) % 3] ?? 1,
  distance: 110 + index * 56,
}));

export interface RaceDriver {
  id: string;
  lane: RaceLane;
  distance: number;
  speed: number;
  hit: boolean;
  turboActive: boolean;
  turboReadyInMs: number;
}

export interface RaceState {
  phase: 'waiting' | 'countdown' | 'running' | 'finished';
  countdown: number;
  drivers: RaceDriver[];
  winner: string | null;
  opponentLeft: boolean;
  solo: boolean;
}
