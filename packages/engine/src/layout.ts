import type { Layout, StyleBand } from './types.ts';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 15;

/** Puzzle style by crew size: small 4-6, mid 7-10, big 11-15. */
export function styleBand(players: number): StyleBand {
  if (players <= 6) return 'small';
  if (players <= 10) return 'mid';
  return 'big';
}

/** Leaderboard band, matching the cage layout table. */
export function leaderboardBand(players: number): string {
  if (players <= 5) return '4-5';
  if (players <= 8) return '6-8';
  if (players <= 11) return '9-11';
  return '12-15';
}

/** Cage layout by group size (PRD table). Fewer than 4 players (practice) uses the 4-player layout. */
export function layoutFor(playersIn: number): Layout {
  const players = Math.max(1, Math.min(MAX_PLAYERS, Math.floor(playersIn)));
  const n = Math.max(MIN_PLAYERS, players);
  let cages: number;
  let crewLabel: Layout['crewLabel'];
  let act2: Layout['act2'];
  if (n <= 5) [cages, crewLabel, act2] = [2, 'Small', 'chain'];
  else if (n <= 8) [cages, crewLabel, act2] = [3, 'Small to mid', 'split'];
  else if (n <= 11) [cages, crewLabel, act2] = [4, 'Mid to big', 'parallel'];
  else [cages, crewLabel, act2] = [5, 'Big', 'parallel'];
  const perCage: number[] = new Array(cages).fill(0);
  for (let i = 0; i < players; i++) perCage[i % cages]++;
  return { players, cages, crewLabel, act2, style: styleBand(n), perCage };
}

/** Max distance (m) an item can be thrown to a crewmate; the Quartermaster throws twice as far. */
export const PASS_RANGE = 12;
