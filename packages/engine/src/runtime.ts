// Server-side answer checking. Pure functions so they can be unit-tested and simulated headless.
import { GLYPHS } from './theme.ts';
import type { ItemKind, PuzzleDef, PublicClue, PublicPuzzle, Scenario } from './types.ts';

export interface Progress {
  seq: string[];
  presses: { player: string; at: number; weight: number; beat: number }[];
  votes: Record<string, string>;
  lastActor?: string;
}

export const emptyProgress = (): Progress => ({ seq: [], presses: [], votes: {} });

export type Action =
  | { kind: 'answer'; value: string | string[] | number[] }
  | { kind: 'press'; button: string }
  | { kind: 'sync' }
  | { kind: 'vote'; option: string }
  | { kind: 'useItem'; item: string; itemKind: ItemKind };

export interface AttemptCtx {
  now: number;
  player: string;
  /** Connected crew members. */
  connected: number;
  /** Weight of this player's effort on sync puzzles (Bosun counts double). */
  weight?: number;
}

export type Outcome = 'solved' | 'wrong' | 'progress' | 'invalid';

export interface AttemptResult {
  outcome: Outcome;
  message: string;
  progress: Progress;
}

const norm = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const arrEq = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => String(x) === String(b[i]));

/** Beat counter for timing cues: 1..cycle, one beat per second of server time. */
export function beatAt(now: number, cycle: number): number {
  return (Math.floor(now / 1000) % cycle) + 1;
}

export function syncNeeded(p: PuzzleDef, connected: number): number {
  if (p.interaction.type !== 'sync') return 1;
  return Math.max(1, Math.min(p.interaction.needed, connected));
}

export function voteQuorum(connected: number): number {
  return Math.max(1, Math.ceil(connected * 0.6));
}

export function attempt(p: PuzzleDef, prog: Progress, action: Action, ctx: AttemptCtx): AttemptResult {
  const sol = p.solution;
  const it = p.interaction;
  const res = (outcome: Outcome, message: string, progress: Progress = prog): AttemptResult => ({ outcome, message, progress });

  switch (sol.type) {
    case 'code':
    case 'word':
    case 'choice': {
      if (action.kind !== 'answer') return res('invalid', 'That does nothing here.');
      return norm(action.value) === norm(sol.value) ? res('solved', '') : res('wrong', 'Nothing happens. That is not it.');
    }
    case 'symbols':
    case 'dial': {
      if (action.kind !== 'answer' || !Array.isArray(action.value)) return res('invalid', 'That does nothing here.');
      const v = sol.type === 'dial' ? (action.value as number[]).map((x) => ((Number(x) % 360) + 360) % 360) : action.value;
      return arrEq(v, sol.value) ? res('solved', '') : res('wrong', sol.type === 'dial' ? 'The hull scrapes the reef! Wrong course.' : 'The lock does not budge.');
    }
    case 'subset': {
      if (action.kind !== 'answer' || !Array.isArray(action.value)) return res('invalid', 'That does nothing here.');
      const v = (action.value as string[]).map(String).sort();
      return arrEq(v, sol.value) ? res('solved', '') : res('wrong', 'The scale tips the wrong way and the trapdoor stays shut.');
    }
    case 'useItem': {
      if (action.kind !== 'useItem') return res('invalid', 'You need to use an item here.');
      if (it.type === 'useItem' && (action.itemKind === it.accepts || action.item === sol.value)) return res('solved', '');
      return res('invalid', 'That does not fit here.');
    }
    case 'sequence':
    case 'stations': {
      if (action.kind !== 'press') return res('invalid', 'Press a button.');
      const label = (id: string) => (GLYPHS as Record<string, { name: string }>)[id]?.name ?? id;
      if (sol.type === 'stations' && ctx.connected > 1 && prog.lastActor === ctx.player && prog.seq.length > 0)
        return res('invalid', 'A different gunner must fire the next shot!');
      const expected = sol.value[prog.seq.length];
      if (action.button === expected) {
        const next: Progress = { ...prog, seq: [...prog.seq, action.button], lastActor: ctx.player };
        if (next.seq.length >= sol.value.length) return res('solved', '', emptyProgress());
        const noun = sol.type === 'stations' ? 'gun fires' : 'valve opens';
        return res('progress', `The ${label(action.button)} ${noun} (${next.seq.length}/${sol.value.length}).`, next);
      }
      return res(
        'wrong',
        sol.type === 'stations' ? 'Wrong gun! The signal is garbled — start the sequence again.' : 'Wrong valve! Seawater surges back in — the sequence resets.',
        emptyProgress(),
      );
    }
    case 'sync': {
      if (action.kind !== 'sync') return res('invalid', 'Grab hold first.');
      const windowMs = it.type === 'sync' ? it.windowMs : 1500;
      const needed = syncNeeded(p, ctx.connected);
      const beatIndex = Math.floor(ctx.now / 1000);
      if (sol.cue !== undefined && it.type === 'sync' && it.cycle) {
        const beat = beatAt(ctx.now, it.cycle);
        if (beat !== sol.cue) return res('wrong', `You heave on beat ${beat} — off the chant! The rope slips back.`, emptyProgress());
      }
      const fresh = prog.presses.filter(
        (x) => x.player !== ctx.player && (sol.cue !== undefined ? x.beat === beatIndex : ctx.now - x.at <= windowMs),
      );
      fresh.push({ player: ctx.player, at: ctx.now, weight: ctx.weight ?? 1, beat: beatIndex });
      const total = fresh.reduce((a, x) => a + x.weight, 0);
      const next: Progress = { ...prog, presses: fresh };
      if (total >= needed) return res('solved', '', emptyProgress());
      return res('progress', `${total} of ${needed} hands heaving…`, next);
    }
    case 'vote': {
      if (action.kind !== 'vote') return res('invalid', 'Cast a vote.');
      const votes = { ...prog.votes, [ctx.player]: action.option };
      const tally: Record<string, number> = {};
      for (const v of Object.values(votes)) tally[v] = (tally[v] ?? 0) + 1;
      const quorum = voteQuorum(ctx.connected);
      const [top, count] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      if (count >= quorum) {
        if (top === sol.value) return res('solved', '', emptyProgress());
        return res('wrong', `The crew steers ${top} — breakers ahead! Wrong heading. The votes are cleared.`, emptyProgress());
      }
      return res('progress', `${count} of ${quorum} needed votes agree so far.`, { ...prog, votes });
    }
    case 'gate':
      return res('invalid', '');
  }
}

/** Strip solutions, hints and clue contents for sending to clients. */
export function publicScenario(s: Scenario) {
  const puzzles: PublicPuzzle[] = s.puzzles.map(({ solution: _s, hints, ...rest }) => ({ ...rest, hintCount: hints.length }));
  const clues: PublicClue[] = s.clues.map(({ content: _c, ...rest }) => rest);
  return {
    seed: s.seed,
    layout: s.layout,
    areas: s.areas,
    cages: s.cages,
    missions: s.missions,
    items: s.items,
    clues,
    puzzles,
    finalPuzzle: s.finalPuzzle,
    treasurePuzzle: s.treasurePuzzle,
    gates: s.gates,
    durationMinutes: s.durationMinutes,
  };
}
export type PublicScenario = ReturnType<typeof publicScenario>;
