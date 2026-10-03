import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import {
  beatAt,
  checkScenario,
  generateScenario,
  type Action,
  type PuzzleDef,
  type ServerMsg,
} from '@crimson/engine';
import { Game, type GamePlayer } from '../src/game.ts';
import { createServer } from '../src/index.ts';

function makeGame(n: number, seed: number, practice = false) {
  const scn = generateScenario(n, { seed });
  const roster = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Sailor${i}`, color: '#fff', connected: true }));
  const sent: { to?: string; msg: ServerMsg }[] = [];
  let ended = false;
  const game = new Game(
    scn,
    roster,
    {
      broadcast: (msg) => sent.push({ msg }),
      sendTo: (to, msg) => sent.push({ to, msg }),
      changed: () => {},
      ended: () => (ended = true),
    },
    { practice, graceMs: 60_000, stuckMs: 300_000 },
  );
  return { scn, game, sent, isEnded: () => ended };
}

/** A scripted crew that plays a run through the Game API like real players would. */
function playThrough(game: Game, opts: { skipTreasure?: boolean } = {}) {
  const scn = game.scn;
  const crew = () => [...game.players.values()].filter((p) => p.connected);
  const goTo = (p: GamePlayer, area: string) => {
    game.move(p.id, [0, 0, 0], 0, area);
    return p.area === area;
  };
  const actorFor = (puz: PuzzleDef): GamePlayer => {
    const ok = crew().filter((p) => p.area === puz.area || goTo(p, puz.area) || (puz.area.startsWith('cage') && goTo(p, 'hold')));
    const p = ok.find((x) => x.area === puz.area) ?? ok[0];
    if (!p) throw new Error(`no one can reach ${puz.name} in ${puz.area}`);
    return p;
  };
  const fetchItem = (itemId: string, actor: GamePlayer) => {
    if (actor.inventory.includes(itemId)) return;
    const def = scn.items.find((i) => i.id === itemId)!;
    if (def.combinedFrom) {
      def.combinedFrom.forEach((c) => fetchItem(c, actor));
      game.combine(actor.id, def.combinedFrom[0], def.combinedFrom[1]);
      expect(actor.inventory).toContain(itemId);
      return;
    }
    const st = game.items.get(itemId)!;
    let holder = st.holder ? game.players.get(st.holder)! : undefined;
    if (!holder) {
      holder = crew().find((p) => p.area === st.area || goTo(p, st.area));
      if (!holder) throw new Error(`no one can reach item ${def.name} in ${st.area}`);
      // Make room in hands.
      while (holder.inventory.length >= game.carryLimit(holder)) game.drop(holder.id, holder.inventory[0], holder.pos);
      game.pickup(holder.id, itemId);
      expect(holder.inventory).toContain(itemId);
    }
    if (holder !== actor) {
      while (actor.inventory.length >= game.carryLimit(actor)) game.drop(actor.id, actor.inventory[0], actor.pos);
      game.pass(holder.id, itemId, actor.id);
      expect(actor.inventory, `pass ${def.name} ${holder.area}→${actor.area}`).toContain(itemId);
    }
  };

  for (const id of checkScenario(scn).order) {
    const puz = scn.puzzles.find((p) => p.id === id)!;
    if (puz.auto || game.solved.has(id)) continue;
    if (opts.skipTreasure && id === scn.treasurePuzzle) continue;
    expect(game.puzzleAvailable(puz), `${puz.name} available`).toBe(true);
    const actor = actorFor(puz);
    for (const it of puz.requires.items) fetchItem(it, actor);
    if (actor.area !== puz.area && !goTo(actor, puz.area)) goTo(actor, 'hold');
    const sol = puz.solution;
    const act = (p: GamePlayer, a: Action) => game.act_(p.id, puz.id, a);
    switch (sol.type) {
      case 'useItem': {
        const def = scn.items.find((i) => i.id === sol.value)!;
        act(actor, { kind: 'useItem', item: def.id, itemKind: def.kind });
        break;
      }
      case 'sequence':
      case 'stations': {
        const helpers = crew().filter((p) => p.area === puz.area || goTo(p, puz.area));
        sol.value.forEach((b, i) => act(helpers[i % helpers.length], { kind: 'press', button: b }));
        break;
      }
      case 'sync': {
        const it = puz.interaction.type === 'sync' ? puz.interaction : null;
        let t = Date.now();
        if (sol.cue !== undefined && it?.cycle) while (beatAt(t, it.cycle) !== sol.cue || t % 1000 > 500) t += 100;
        vi.setSystemTime(t);
        const helpers = crew().filter((p) => p.area === puz.area || goTo(p, puz.area));
        for (const h of helpers) if (!game.solved.has(puz.id)) act(h, { kind: 'sync' });
        break;
      }
      case 'vote': {
        for (const h of crew()) {
          goTo(h, puz.area);
          if (!game.solved.has(puz.id)) act(h, { kind: 'vote', option: sol.value });
        }
        break;
      }
      case 'gate':
        break;
      default:
        act(actor, { kind: 'answer', value: sol.value as string });
    }
    expect(game.solved.has(id), `${puz.module} / ${puz.name}`).toBe(true);
  }
  for (const p of crew()) {
    goTo(p, 'deck');
    game.board(p.id);
  }
}

describe('game', () => {
  afterEach(() => vi.useRealTimers());

  for (const n of [4, 5, 7, 9, 12, 15]) {
    it(`a crew of ${n} can escape through the real game rules`, () => {
      vi.useFakeTimers({ now: 1_700_000_000_000 });
      for (const seed of [1, 2, 3]) {
        const { game, isEnded } = makeGame(n, seed);
        playThrough(game);
        expect(isEnded()).toBe(true);
        expect(game.ending).toBe('treasure');
        expect(game.score()).toBeGreaterThan(1000);
      }
    });
  }

  it('escapes without the treasure when the secret is skipped', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const { game } = makeGame(6, 9);
    playThrough(game, { skipTreasure: true });
    expect(game.ending).toBe('escape');
  });

  it('a practice run works for a single player', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const { game } = makeGame(1, 4, true);
    playThrough(game);
    expect(game.ending).toBe('treasure');
  });

  it('keeps players inside their cage until it opens', () => {
    const { game } = makeGame(6, 1);
    const p = [...game.players.values()][0];
    game.move(p.id, [0, 0, 0], 0, 'hold');
    expect(p.area).toBe(`cage${p.cage}`);
    game.move(p.id, [0, 0, 0], 0, 'quarters');
    expect(p.area).toBe(`cage${p.cage}`);
  });

  it('only the Navigator can read charts while one is aboard', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const { game, scn, sent } = makeGame(8, 5);
    const chart = scn.clues.find((c) => c.navigatorOnly)!;
    // Open everything up to the chart's act.
    for (const pid of checkScenario(scn).order) {
      if (chart.revealedBy.every((d) => game.solved.has(d))) break;
      const puz = scn.puzzles.find((p) => p.id === pid)!;
      if (!puz.auto) (game as unknown as { solve: (p: PuzzleDef) => void }).solve(puz);
    }
    const nav = [...game.players.values()].find((p) => p.role === 'navigator')!;
    const other = [...game.players.values()].find((p) => p.role !== 'navigator')!;
    for (const p of [nav, other]) {
      p.area = chart.area;
      game.inspect(p.id, chart.id);
    }
    const replies = sent.filter((s) => s.msg.t === 'clue') as { to: string; msg: Extract<ServerMsg, { t: 'clue' }> }[];
    expect(replies.find((r) => r.to === nav.id)!.msg.readable).toBe(true);
    expect(replies.find((r) => r.to === other.id)!.msg.readable).toBe(false);
  });

  it('opens an abandoned cage after the grace period so nobody is blocked', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const { game, scn } = makeGame(4, 2);
    const leavers = [...game.players.values()].filter((p) => p.cage === 1);
    for (const p of leavers) game.disconnect(p.id);
    game.tick(Date.now() + 61_000);
    expect(game.cagesOpen.has(1)).toBe(true);
    expect(scn.clues.filter((c) => c.area === 'cage1').every((c) => game.publicClues.has(c.id))).toBe(true);
    vi.setSystemTime(Date.now() + 61_000);
    playThrough(game);
    expect(game.ending === 'escape' || game.ending === 'treasure').toBe(true);
  });

  it('runs out of time into the lost-at-sea ending, and wrong answers cost time', () => {
    const { game, scn } = makeGame(4, 3);
    const lock = scn.puzzles.find((p) => p.id === scn.cages[0].lockPuzzle && p.wrongPenalty > 0) ?? scn.puzzles.find((p) => p.act === 1 && p.wrongPenalty > 0);
    const before = game.endsAt;
    if (lock && lock.requires.puzzles.length === 0 && lock.interaction.type === 'choice') {
      const occupant = [...game.players.values()].find((p) => p.area === lock.area)!;
      game.act_(occupant.id, lock.id, { kind: 'answer', value: 'nope' });
      expect(game.endsAt).toBeLessThan(before);
    }
    game.tick(game.endsAt + 1);
    expect(game.ending).toBe('lost');
  });

  it('starts the clock after the intro', () => {
    const scn = generateScenario(4, { seed: 1 });
    const roster = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `S${i}`, color: '#fff', connected: true }));
    const io = { broadcast: () => {}, sendTo: () => {}, changed: () => {}, ended: () => {} };
    const now = 1_700_000_000_000;
    const g = new Game(scn, roster, io, { practice: false, graceMs: 60_000, stuckMs: 300_000, introMs: 40_000, now });
    expect(g.startedAt).toBe(now + 40_000);
    expect(g.endsAt).toBe(now + 40_000 + 45 * 60_000);
    g.tick(now + 45 * 60_000);
    expect(g.ending).toBeUndefined();
  });

  it('gives tiered hints, three at most', () => {
    const { game, scn } = makeGame(4, 3);
    const first = scn.puzzles.find((p) => p.act === 1 && p.requires.puzzles.length === 0)!;
    for (let i = 0; i < 4; i++) game.hint('p0', first.id);
    expect(game.hints.length).toBe(3);
    expect(game.hints[2].text).toContain(first.hints[2]);
  });
});

describe('websocket server', () => {
  it('creates a room, joins a crew and starts a run', async () => {
    const srv = createServer({ graceMs: 1000, stuckMs: 60_000, runMinutes: 45, minPlayers: 4 }, null);
    await new Promise<void>((r) => srv.server.listen(0, r));
    const port = (srv.server.address() as { port: number }).port;
    const open = () =>
      new Promise<{ ws: WebSocket; msgs: ServerMsg[] }>((resolve) => {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        const msgs: ServerMsg[] = [];
        ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
        ws.on('open', () => resolve({ ws, msgs }));
      });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const host = await open();
    host.ws.send(JSON.stringify({ t: 'create', name: 'Anne' }));
    await wait(100);
    const welcome = host.msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    expect(welcome.room).toMatch(/^[A-Z0-9]{6}$/);
    const others = await Promise.all([1, 2, 3].map(() => open()));
    others.forEach((o, i) => o.ws.send(JSON.stringify({ t: 'join', room: welcome.room.toLowerCase(), name: `Mate${i}` })));
    await wait(150);
    const lobby = host.msgs.filter((m) => m.t === 'lobby').pop() as Extract<ServerMsg, { t: 'lobby' }>;
    expect(lobby.players.length).toBe(4);
    // Non-hosts cannot start.
    others[0].ws.send(JSON.stringify({ t: 'start' }));
    await wait(50);
    expect(others[0].msgs.some((m) => m.t === 'error')).toBe(true);
    host.ws.send(JSON.stringify({ t: 'start' }));
    await wait(200);
    for (const c of [host, ...others]) {
      const start = c.msgs.find((m) => m.t === 'start') as Extract<ServerMsg, { t: 'start' }>;
      expect(start.scenario.layout.cages).toBe(2);
      expect(JSON.stringify(start)).not.toContain('"solution"');
      expect(c.msgs.some((m) => m.t === 'state')).toBe(true);
    }
    // Late joiners are turned away; reconnecting with a token works.
    const late = await open();
    late.ws.send(JSON.stringify({ t: 'join', room: welcome.room, name: 'Late' }));
    await wait(80);
    expect(late.msgs.some((m) => m.t === 'error')).toBe(true);
    const tok = (others[1].msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).token;
    others[1].ws.close();
    await wait(50);
    const back = await open();
    back.ws.send(JSON.stringify({ t: 'join', room: welcome.room, name: 'Mate1', token: tok }));
    await wait(120);
    expect(back.msgs.some((m) => m.t === 'start')).toBe(true);
    for (const c of [host, ...others, late, back]) c.ws.close();
    srv.close();
  });
});
