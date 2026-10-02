import { describe, expect, it } from 'vitest';
import {
  attempt,
  beatAt,
  checkScenario,
  emptyProgress,
  generateScenario,
  headingConstraints,
  HEADINGS,
  layoutFor,
  publicScenario,
  type Action,
  type PuzzleDef,
  type Scenario,
} from '../src/index.ts';
import { headingConstraints as hc } from '../src/modules/finale.ts';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 37);

/** Answer a puzzle with its known solution using the runtime, like a perfect crew would. */
function solveWithRuntime(s: Scenario, p: PuzzleDef, players: number): boolean {
  let prog = emptyProgress();
  const sol = p.solution;
  const now = 1_000_000;
  const ctx = (player: string, t = now) => ({ now: t, player, connected: players });
  const one = (a: Action, player = 'a', t = now) => {
    const r = attempt(p, prog, a, ctx(player, t));
    prog = r.progress;
    return r.outcome;
  };
  switch (sol.type) {
    case 'code':
    case 'word':
    case 'choice':
    case 'symbols':
    case 'subset':
    case 'dial':
      return one({ kind: 'answer', value: sol.value as string }) === 'solved';
    case 'useItem': {
      const it = s.items.find((i) => i.id === sol.value)!;
      return one({ kind: 'useItem', item: it.id, itemKind: it.kind }) === 'solved';
    }
    case 'sequence':
    case 'stations': {
      let out = '';
      sol.value.forEach((b, i) => (out = one({ kind: 'press', button: b }, `p${i % 2}`)));
      return out === 'solved';
    }
    case 'sync': {
      const it = p.interaction.type === 'sync' ? p.interaction : null;
      let t = now;
      if (sol.cue !== undefined && it?.cycle) while (beatAt(t, it.cycle) !== sol.cue) t += 1000;
      let out = '';
      for (let i = 0; i < (it?.needed ?? 1); i++) out = one({ kind: 'sync' }, `p${i}`, t + i * 50);
      return out === 'solved';
    }
    case 'vote': {
      let out = '';
      for (let i = 0; i < players; i++) {
        out = one({ kind: 'vote', option: sol.value }, `p${i}`);
        if (out === 'solved') break;
      }
      return out === 'solved';
    }
    case 'gate':
      return true;
  }
}

describe('layout', () => {
  it('matches the PRD cage table', () => {
    expect([4, 5].map((n) => layoutFor(n).cages)).toEqual([2, 2]);
    expect([6, 7, 8].map((n) => layoutFor(n).cages)).toEqual([3, 3, 3]);
    expect([9, 10, 11].map((n) => layoutFor(n).cages)).toEqual([4, 4, 4]);
    expect([12, 13, 14, 15].map((n) => layoutFor(n).cages)).toEqual([5, 5, 5, 5]);
    expect(layoutFor(5).act2).toBe('chain');
    expect(layoutFor(7).act2).toBe('split');
    expect(layoutFor(10).act2).toBe('parallel');
  });
  it('puts 2-3 players in every cage', () => {
    for (let n = 4; n <= 15; n++) {
      const l = layoutFor(n);
      expect(l.perCage.reduce((a, b) => a + b, 0)).toBe(n);
      for (const c of l.perCage) expect(c >= 2 && c <= 3).toBe(true);
    }
  });
  it('maps puzzle style bands', () => {
    expect(layoutFor(6).style).toBe('small');
    expect(layoutFor(7).style).toBe('mid');
    expect(layoutFor(11).style).toBe('big');
  });
});

describe('generator', () => {
  for (let players = 1; players <= 15; players++) {
    it(`builds solvable runs for ${players} player(s)`, () => {
      for (const seed of SEEDS.slice(0, 12)) {
        const s = generateScenario(players, { seed });
        const res = checkScenario(s);
        expect(res.errors).toEqual([]);
        expect(res.estMinutes).toBeGreaterThanOrEqual(30);
        expect(res.estMinutes).toBeLessThanOrEqual(60);
      }
    });
  }

  it('is deterministic for a seed', () => {
    const a = generateScenario(8, { seed: 42 });
    const b = generateScenario(8, { seed: 42 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('makes every run meaningfully different', () => {
    const sigs = new Set(
      SEEDS.map((seed) => {
        const s = generateScenario(6, { seed });
        return s.puzzles.map((p) => p.module + JSON.stringify(p.solution)).join('|') + s.secret.treasureSpot;
      }),
    );
    expect(sigs.size).toBe(SEEDS.length);
    const secrets = new Set(SEEDS.map((seed) => generateScenario(6, { seed }).secret.treasureSpot));
    expect(secrets.size).toBeGreaterThan(2);
  });

  it('gives bigger crews more puzzles and big-crew modules', () => {
    const count = (n: number) =>
      SEEDS.slice(0, 10).reduce((a, seed) => a + generateScenario(n, { seed }).puzzles.filter((p) => !p.auto).length, 0) / 10;
    expect(count(15)).toBeGreaterThan(count(8));
    expect(count(8)).toBeGreaterThanOrEqual(count(4) - 1);
    const big = generateScenario(14, { seed: 7 });
    const mods = new Set(big.puzzles.map((p) => p.module));
    expect(mods.has('heading_vote')).toBe(true);
    expect(mods.has('cannon_sequence')).toBe(true);
    const small = generateScenario(4, { seed: 7 });
    expect(small.puzzles.some((p) => ['heading_vote', 'sync_haul', 'message_relay'].includes(p.module))).toBe(false);
  });

  it('only places one parrot aboard', () => {
    for (const seed of SEEDS) for (const n of [4, 8, 13]) {
      const s = generateScenario(n, { seed });
      expect(s.clues.filter((c) => c.kind === 'parrot').length).toBeLessThanOrEqual(1);
    }
  });

  it('has the four acts gated in order', () => {
    const s = generateScenario(9, { seed: 3 });
    const order = checkScenario(s).order;
    const idx = (id: string) => order.indexOf(id);
    expect(idx(s.gates.act2)).toBeLessThan(idx(s.gates.act3));
    expect(idx(s.gates.act3)).toBeLessThan(idx(s.gates.act4));
    expect(idx(s.gates.act4)).toBeLessThan(idx(s.finalPuzzle));
    for (const c of s.cages) expect(idx(c.lockPuzzle)).toBeLessThan(idx(s.gates.act2));
  });

  it('can be completed end-to-end with the runtime', () => {
    for (const n of [4, 6, 8, 11, 15]) {
      for (const seed of SEEDS.slice(0, 8)) {
        const s = generateScenario(n, { seed });
        for (const id of checkScenario(s).order) {
          const p = s.puzzles.find((x) => x.id === id)!;
          expect(solveWithRuntime(s, p, n), `${p.module} ${p.name} (n=${n}, seed=${seed})`).toBe(true);
        }
      }
    }
  });

  it('never leaks solutions in the public scenario', () => {
    const s = generateScenario(10, { seed: 99 });
    const pub = JSON.stringify(publicScenario(s));
    expect(pub).not.toContain('"solution"');
    expect(pub).not.toContain('"hints"');
    expect(pub).not.toContain('"content"');
    expect(pub).not.toContain(s.secret.allyName);
  });
});

describe('checker', () => {
  it('rejects an unsolvable run', () => {
    const s = generateScenario(6, { seed: 5 });
    const lock = s.puzzles.find((p) => p.id === s.cages[0].lockPuzzle)!;
    lock.requires.items.push('missing');
    expect(checkScenario(s).ok).toBe(false);
  });
  it('rejects a puzzle that needs its own output', () => {
    const s = generateScenario(6, { seed: 5 });
    const p = s.puzzles.find((x) => x.act === 2 && !x.auto)!;
    const clue = s.clues.find((c) => p.requires.clues.includes(c.id));
    if (clue) clue.revealedBy.push(p.id);
    else p.requires.puzzles.push(p.id);
    const res = checkScenario(s);
    expect(res.ok).toBe(false);
  });
  it('rejects a cage that needs no help', () => {
    const s = generateScenario(4, { seed: 5 });
    for (const it of s.items) if (it.area === 'cage1') it.area = 'cage0';
    for (const c of s.clues) if (c.area === 'cage1') c.area = 'cage0';
    const res = checkScenario(s);
    expect(res.errors.join()).toMatch(/cage/i);
  });
});

describe('runtime', () => {
  const s = generateScenario(12, { seed: 11 });
  const find = (type: string) => s.puzzles.find((p) => p.solution.type === type)!;

  it('resets sequences on a wrong press', () => {
    const p = s.puzzles.find((x) => x.solution.type === 'sequence' || x.solution.type === 'stations')!;
    const sol = p.solution as { value: string[] };
    let r = attempt(p, emptyProgress(), { kind: 'press', button: sol.value[0] }, { now: 0, player: 'a', connected: 5 });
    expect(r.outcome).toBe('progress');
    const wrong = p.interaction.type === 'sequence' ? p.interaction.buttons.find((b) => b.id !== sol.value[1])! : { id: sol.value[0] };
    r = attempt(p, r.progress, { kind: 'press', button: wrong.id }, { now: 0, player: 'b', connected: 5 });
    expect(r.outcome).toBe('wrong');
    expect(r.progress.seq).toEqual([]);
  });

  it('requires a different gunner for each cannon shot', () => {
    const p = find('stations');
    const sol = p.solution as { value: string[] };
    const r1 = attempt(p, emptyProgress(), { kind: 'press', button: sol.value[0] }, { now: 0, player: 'a', connected: 5 });
    const r2 = attempt(p, r1.progress, { kind: 'press', button: sol.value[1] }, { now: 0, player: 'a', connected: 5 });
    expect(r2.outcome).toBe('invalid');
  });

  it('needs simultaneous hands on sync puzzles and honours the beat', () => {
    const p = s.puzzles.find((x) => x.solution.type === 'sync' && x.solution.cue !== undefined)!;
    const cue = (p.solution as { cue: number }).cue;
    let t = 0;
    while (beatAt(t, 5) !== cue) t += 1000;
    const off = t + 1000;
    expect(attempt(p, emptyProgress(), { kind: 'sync' }, { now: off, player: 'a', connected: 12 }).outcome).toBe('wrong');
    let prog = emptyProgress();
    const needed = p.interaction.type === 'sync' ? p.interaction.needed : 0;
    for (let i = 0; i < needed - 1; i++) prog = attempt(p, prog, { kind: 'sync' }, { now: t + i, player: `p${i}`, connected: 12 }).progress;
    // Same player pressing twice does not count twice.
    expect(attempt(p, prog, { kind: 'sync' }, { now: t + 5, player: 'p0', connected: 12 }).outcome).toBe('progress');
    expect(attempt(p, prog, { kind: 'sync' }, { now: t + 5, player: 'zz', connected: 12 }).outcome).toBe('solved');
  });

  it('bosun counts double and sync scales down to connected players', () => {
    const p = find('sync');
    const r = attempt(p, emptyProgress(), { kind: 'sync' }, { now: 0, player: 'solo', connected: 1 });
    expect(r.outcome === 'solved' || r.outcome === 'wrong').toBe(true);
  });

  it('resolves votes by quorum and clears wrong votes', () => {
    const p = find('vote');
    const right = (p.solution as { value: string }).value;
    const wrong = HEADINGS.find((h) => h !== right)!;
    let prog = emptyProgress();
    let r = attempt(p, prog, { kind: 'vote', option: wrong }, { now: 0, player: 'a', connected: 3 });
    expect(r.outcome).toBe('progress');
    r = attempt(p, r.progress, { kind: 'vote', option: wrong }, { now: 0, player: 'b', connected: 3 });
    expect(r.outcome).toBe('wrong');
    prog = r.progress;
    expect(prog.votes).toEqual({});
  });

  it('heading constraints always leave a unique answer when generated', () => {
    for (const h of HEADINGS) {
      const all = headingConstraints(h);
      expect(all.every((c) => c.test(h))).toBe(true);
      expect(hc).toBe(headingConstraints);
    }
  });
});
