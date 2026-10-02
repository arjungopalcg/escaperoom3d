// Wire protocol shared by the game server and the browser client.
import type { Action, PublicScenario } from './runtime.ts';
import type { AreaId, ClueContent, ClueKind, Role, Secret } from './types.ts';

export type Vec3 = [number, number, number];

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  micOk: boolean;
  isHost: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  role: Role;
  cage: number;
  area: AreaId;
  boarded: boolean;
  inventory: string[];
}

export interface ItemState {
  id: string;
  holder?: string;
  area: AreaId;
  slot: number;
  /** World position when dropped or thrown (overrides slot). */
  pos?: Vec3;
  visible: boolean;
  gone: boolean;
}

export interface PuzzleView {
  id: string;
  solved: boolean;
  available: boolean;
  seq: number;
  presses: number;
  needed: number;
  votes: Record<string, number>;
  hintsShown: number;
}

export interface HintView {
  puzzle: string;
  tier: number;
  text: string;
  by: string;
}

export interface StateView {
  act: number;
  startedAt: number;
  endsAt: number;
  penaltyMs: number;
  solved: string[];
  revealedClues: string[];
  /** Clues readable from anywhere (abandoned cages). */
  publicClues: string[];
  items: ItemState[];
  puzzles: PuzzleView[];
  cagesOpen: number[];
  boarded: string[];
  lifeboatReady: boolean;
  treasure: boolean;
  hints: HintView[];
  players: PlayerView[];
  practice: boolean;
  stuckOffer: boolean;
}

export type Ending = 'escape' | 'treasure' | 'lost';

export interface LeaderboardEntry {
  crew: string;
  score: number;
  timeMs: number;
  ending: Ending;
  hints: number;
  players: number;
  date: string;
}

export interface Results {
  ending: Ending;
  crew: string;
  timeMs: number;
  hintsUsed: number;
  score: number;
  secret: Secret;
  band: string;
  players: number;
  actReached: number;
  solvedCount: number;
  totalCount: number;
  highlights: string[];
  leaderboard: LeaderboardEntry[];
  seed: number;
  practice: boolean;
}

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; room: string; name: string; token?: string }
  | { t: 'start'; practice?: boolean }
  | { t: 'playAgain' }
  | { t: 'move'; p: Vec3; r: number; area: AreaId }
  | { t: 'pickup'; item: string }
  | { t: 'drop'; item: string; pos: Vec3 }
  | { t: 'pass'; item: string; to: string }
  | { t: 'combine'; a: string; b: string }
  | { t: 'inspect'; clue: string }
  | { t: 'act'; puzzle: string; action: Action }
  | { t: 'hint'; puzzle: string }
  | { t: 'board' }
  | { t: 'chat'; text: string }
  | { t: 'bell'; on: boolean }
  | { t: 'mic'; ok: boolean }
  | { t: 'rtc'; to: string; data: unknown }
  | { t: 'ping'; c: number };

export type EventKind = 'solved' | 'wrong' | 'progress' | 'reveal' | 'hint' | 'captain' | 'parrot' | 'info' | 'pass' | 'act';

export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; room: string }
  | { t: 'lobby'; room: string; hostId: string; players: LobbyPlayer[]; phase: 'lobby' | 'playing' | 'results'; minPlayers: number; maxPlayers: number }
  | { t: 'start'; scenario: PublicScenario; you: string; roles: Record<string, Role>; spawn: Record<string, number>; serverNow: number }
  | { t: 'state'; s: StateView; serverNow: number }
  | { t: 'pos'; list: [string, number, number, number, number, AreaId][] }
  | { t: 'event'; kind: EventKind; text: string; puzzle?: string; by?: string; speaker?: string; area?: AreaId }
  | { t: 'clue'; id: string; kind: ClueKind; title: string; content: ClueContent; readable: boolean; reason?: string }
  | { t: 'chat'; from: string; name: string; text: string; at: number; broadcast?: boolean }
  | { t: 'results'; r: Results }
  | { t: 'error'; text: string }
  | { t: 'rtc'; from: string; data: unknown }
  | { t: 'bell'; from: string; on: boolean }
  | { t: 'fx'; kind: 'pass' | 'cannon' | 'splash' | 'heave'; from?: string; to?: string; item?: string; puzzle?: string; button?: string }
  | { t: 'pong'; c: number; s: number };
