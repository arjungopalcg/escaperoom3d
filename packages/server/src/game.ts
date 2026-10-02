// Authoritative state for one run: puzzles, items, timer, hints, disconnects and endings.
import {
  ALLIES,
  attempt,
  emptyProgress,
  leaderboardBand,
  PASS_RANGE,
  publicScenario,
  Rng,
  syncNeeded,
  type Action,
  type AreaId,
  type Ending,
  type HintView,
  type ItemState,
  type Progress,
  type PublicScenario,
  type PuzzleDef,
  type Role,
  type Scenario,
  type ServerMsg,
  type StateView,
  type Vec3,
} from '@crimson/engine';

export interface GameIO {
  broadcast(msg: ServerMsg): void;
  sendTo(playerId: string, msg: ServerMsg): void;
  changed(): void;
  ended(game: Game): void;
}

export interface GamePlayer {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  disconnectedAt?: number;
  abandoned: boolean;
  role: Role;
  cage: number;
  area: AreaId;
  pos: Vec3;
  rot: number;
  inventory: string[];
  stats: { solved: number; passes: number; hints: number; wrong: number };
}

export interface GameOptions {
  practice: boolean;
  graceMs: number;
  stuckMs: number;
  now?: number;
}


const ROLE_ORDER: Role[] = ['captain', 'navigator', 'quartermaster', 'bosun', 'lookout'];

export class Game {
  readonly pub: PublicScenario;
  readonly players = new Map<string, GamePlayer>();
  solved = new Set<string>();
  progress = new Map<string, Progress>();
  items = new Map<string, ItemState>();
  revealed = new Set<string>();
  publicClues = new Set<string>();
  cagesOpen = new Set<number>();
  boarded = new Set<string>();
  hints: HintView[] = [];
  hintTier = new Map<string, number>();
  act = 1;
  startedAt: number;
  durationMs: number;
  penaltyMs = 0;
  ending?: Ending;
  endedAt?: number;
  lastProgressAt: number;
  stuckOffer = false;
  /** Solve times for analytics. */
  solveLog: { puzzle: string; module: string; at: number; by: string; hints: number }[] = [];
  private lowWaterWarned = false;

  constructor(
    readonly scn: Scenario,
    roster: { id: string; name: string; color: string; connected: boolean }[],
    readonly io: GameIO,
    readonly opts: GameOptions,
  ) {
    const now = opts.now ?? Date.now();
    this.startedAt = now;
    this.lastProgressAt = now;
    this.durationMs = scn.durationMinutes * 60_000;
    this.pub = publicScenario(scn);
    const rng = new Rng(scn.seed ^ 0x5eed);

    // Cages: fill per layout; practice crews all start in the first cage.
    const order = rng.shuffle(roster);
    const cageOf: number[] = [];
    if (opts.practice) order.forEach(() => cageOf.push(0));
    else scn.layout.perCage.forEach((count, cage) => {
      for (let i = 0; i < count; i++) cageOf.push(cage);
    });
    const roles = rng.shuffle(order.map((p) => p.id));
    const roleOf = new Map<string, Role>();
    roles.forEach((id, i) => roleOf.set(id, order.length >= 4 || i < 2 ? (ROLE_ORDER[i] ?? 'deckhand') : 'deckhand'));
    order.forEach((p, i) => {
      this.players.set(p.id, {
        ...p,
        abandoned: false,
        role: roleOf.get(p.id) ?? 'deckhand',
        cage: cageOf[i] ?? 0,
        area: `cage${cageOf[i] ?? 0}`,
        pos: [0, 0, 0],
        rot: 0,
        inventory: [],
        stats: { solved: 0, passes: 0, hints: 0, wrong: 0 },
      });
    });

    for (const it of scn.items) {
      this.items.set(it.id, { id: it.id, area: it.area, slot: it.slot, visible: false, gone: !!it.combinedFrom });
    }
    this.refreshVisibility(false);
  }

  // ---------- helpers ----------
  get endsAt(): number {
    return this.startedAt + this.durationMs - this.penaltyMs;
  }
  puzzle(id: string): PuzzleDef | undefined {
    return this.scn.puzzles.find((p) => p.id === id);
  }
  connectedPlayers(): GamePlayer[] {
    return [...this.players.values()].filter((p) => p.connected);
  }
  /** Players counted for "everyone": connected, or disconnected but still within the grace period. */
  activeCrew(): GamePlayer[] {
    return [...this.players.values()].filter((p) => p.connected || !p.abandoned);
  }
  areaUnlocked(area: AreaId): boolean {
    const def = this.scn.areas.find((a) => a.id === area);
    return !!def && def.unlockedBy.every((d) => this.solved.has(d));
  }
  ownCageOpen(p: GamePlayer): boolean {
    return this.opts.practice || this.cagesOpen.has(p.cage);
  }
  canEnter(p: GamePlayer, area: AreaId): boolean {
    if (area.startsWith('cage')) {
      const idx = Number(area.slice(4));
      if (idx === p.cage) return true;
      return this.ownCageOpen(p) && (this.opts.practice || this.cagesOpen.has(idx));
    }
    if (area === 'hold') return this.ownCageOpen(p);
    return this.areaUnlocked(area);
  }
  isRevealed(revealedBy: string[]): boolean {
    return revealedBy.every((d) => this.solved.has(d));
  }
  puzzleAvailable(p: PuzzleDef): boolean {
    return !this.solved.has(p.id) && !p.auto && this.areaUnlocked(p.area) && p.requires.puzzles.every((d) => this.solved.has(d));
  }
  /** Locks on a cage can be worked from inside it or from the hold outside its bars. */
  canReachPuzzle(pl: GamePlayer, p: PuzzleDef): boolean {
    if (pl.area === p.area) return true;
    return p.area.startsWith('cage') && pl.area === 'hold';
  }
  carryLimit(p: GamePlayer): number {
    return p.role === 'quartermaster' ? 6 : 3;
  }
  navigatorOnline(): boolean {
    return this.connectedPlayers().some((p) => p.role === 'navigator');
  }
  private areaLabel(area: AreaId): string {
    if (area.startsWith('cage')) return `the ${this.scn.cages[Number(area.slice(4))]?.name ?? area}`;
    return { hold: 'the Hold', quarters: "the Captain's Quarters", deck: 'the Main Deck' }[area] ?? area;
  }
  private event(kind: Extract<ServerMsg, { t: 'event' }>['kind'], text: string, extra: Partial<Extract<ServerMsg, { t: 'event' }>> = {}) {
    this.io.broadcast({ t: 'event', kind, text, ...extra });
  }
  private toast(to: string, text: string) {
    this.io.sendTo(to, { t: 'event', kind: 'info', text });
  }

  // ---------- state view ----------
  view(): StateView {
    const connected = this.connectedPlayers().length;
    return {
      act: this.act,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      penaltyMs: this.penaltyMs,
      solved: [...this.solved],
      revealedClues: [...this.revealed],
      publicClues: [...this.publicClues],
      items: [...this.items.values()],
      puzzles: this.scn.puzzles
        .filter((p) => !p.auto)
        .map((p) => {
          const prog = this.progress.get(p.id) ?? emptyProgress();
          const votes: Record<string, number> = {};
          for (const v of Object.values(prog.votes)) votes[v] = (votes[v] ?? 0) + 1;
          return {
            id: p.id,
            solved: this.solved.has(p.id),
            available: this.puzzleAvailable(p),
            seq: prog.seq.length,
            presses: prog.presses.reduce((a, x) => a + x.weight, 0),
            needed: p.interaction.type === 'sync' ? syncNeeded(p, connected) : p.interaction.type === 'vote' ? Math.max(1, Math.ceil(connected * 0.6)) : 0,
            votes,
            hintsShown: this.hintTier.get(p.id) ?? 0,
          };
        }),
      cagesOpen: [...this.cagesOpen],
      boarded: [...this.boarded],
      lifeboatReady: this.solved.has(this.scn.finalPuzzle),
      treasure: this.solved.has(this.scn.treasurePuzzle),
      hints: this.hints,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        role: p.role,
        cage: p.cage,
        area: p.area,
        boarded: this.boarded.has(p.id),
        inventory: p.inventory,
      })),
      practice: this.opts.practice,
      stuckOffer: this.stuckOffer,
    };
  }

  startMessage(you: string): ServerMsg {
    const roles: Record<string, Role> = {};
    const spawn: Record<string, number> = {};
    for (const p of this.players.values()) {
      roles[p.id] = p.role;
      spawn[p.id] = p.cage;
    }
    return { t: 'start', scenario: this.pub, you, roles, spawn, serverNow: Date.now() };
  }

  // ---------- player actions ----------
  move(id: string, pos: Vec3, rot: number, area: AreaId) {
    const p = this.players.get(id);
    if (!p || this.ending) return;
    if (pos.every((v) => Number.isFinite(v))) p.pos = pos;
    if (Number.isFinite(rot)) p.rot = rot;
    if (area !== p.area && this.canEnter(p, area)) {
      p.area = area;
      this.io.changed();
    }
  }

  pickup(id: string, itemId: string) {
    const p = this.players.get(id);
    const it = this.items.get(itemId);
    if (!p || !it || this.ending) return;
    if (!it.visible || it.holder || it.gone) return this.toast(id, 'That is out of reach.');
    if (it.area !== p.area) return this.toast(id, `You can't reach that from here — it is in ${this.areaLabel(it.area)}.`);
    if (p.inventory.length >= this.carryLimit(p)) return this.toast(id, `Your hands are full (${this.carryLimit(p)} items). Drop or pass something first.`);
    it.holder = id;
    it.pos = undefined;
    p.inventory.push(itemId);
    this.io.changed();
  }

  drop(id: string, itemId: string, pos: Vec3) {
    const p = this.players.get(id);
    const it = this.items.get(itemId);
    if (!p || !it || it.holder !== id) return;
    this.release(p, itemId);
    it.area = p.area;
    it.pos = pos.every((v) => Number.isFinite(v)) ? pos : p.pos;
    this.io.changed();
  }

  private release(p: GamePlayer, itemId: string) {
    p.inventory = p.inventory.filter((x) => x !== itemId);
    const it = this.items.get(itemId);
    if (it) it.holder = undefined;
  }

  pass(id: string, itemId: string, toId: string) {
    const p = this.players.get(id);
    const to = this.players.get(toId);
    const it = this.items.get(itemId);
    if (!p || !to || !it || it.holder !== id || id === toId || this.ending) return;
    if (!to.connected) return this.toast(id, `${to.name} is not here right now.`);
    const range = p.role === 'quartermaster' ? PASS_RANGE * 2 : PASS_RANGE;
    const d = Math.hypot(p.pos[0] - to.pos[0], p.pos[2] - to.pos[2]);
    const separateLevels = (p.area === 'deck') !== (to.area === 'deck');
    if (d > range || separateLevels) return this.toast(id, `${to.name} is too far away to throw to. Get closer, or relay it through someone.`);
    if (to.inventory.length >= this.carryLimit(to)) return this.toast(id, `${to.name}'s hands are full.`);
    this.release(p, itemId);
    it.holder = toId;
    it.area = to.area;
    to.inventory.push(itemId);
    p.stats.passes++;
    this.io.broadcast({ t: 'fx', kind: 'pass', from: id, to: toId, item: itemId });
    this.io.changed();
  }

  combine(id: string, a: string, b: string) {
    const p = this.players.get(id);
    if (!p || !p.inventory.includes(a) || !p.inventory.includes(b) || this.ending) return;
    const result = this.scn.items.find((i) => i.combinedFrom && i.combinedFrom.includes(a) && i.combinedFrom.includes(b));
    if (!result) return this.toast(id, 'Those two things do not go together.');
    for (const x of [a, b]) {
      this.release(p, x);
      this.items.get(x)!.gone = true;
    }
    const st = this.items.get(result.id)!;
    st.gone = false;
    st.visible = true;
    st.holder = id;
    st.area = p.area;
    p.inventory.push(result.id);
    this.event('info', `${p.name} made a ${result.name.toLowerCase()}.`, { by: id });
    this.io.changed();
  }

  inspect(id: string, clueId: string) {
    const p = this.players.get(id);
    const c = this.scn.clues.find((x) => x.id === clueId);
    if (!p || !c) return;
    const base = { t: 'clue' as const, id: c.id, kind: c.kind, title: c.title };
    if (!this.revealed.has(c.id)) return;
    const near = c.attachedTo ? this.canReachPuzzle(p, this.puzzle(c.attachedTo)!) : p.area === c.area;
    const lookout = c.lookoutReadable && p.role === 'lookout';
    if (!near && !lookout && !this.publicClues.has(c.id))
      return this.io.sendTo(id, { ...base, content: { text: '' }, readable: false, reason: `You are too far away to make it out. It is in ${this.areaLabel(c.area)}.` });
    if (c.navigatorOnly && p.role !== 'navigator' && this.navigatorOnline() && !this.opts.practice)
      return this.io.sendTo(id, {
        ...base,
        content: { text: '' },
        readable: false,
        reason: 'A tangle of tidal lines, soundings and bearings that make no sense to you. Fetch the Navigator!',
      });
    this.io.sendTo(id, { ...base, content: c.content, readable: true });
  }

  act_(id: string, puzzleId: string, action: Action) {
    const pl = this.players.get(id);
    const p = this.puzzle(puzzleId);
    if (!pl || !p || this.ending) return;
    if (this.solved.has(p.id)) return this.toast(id, 'That is already done.');
    if (!this.areaUnlocked(p.area)) return this.toast(id, 'Not yet — there is more to do elsewhere first.');
    if (!p.requires.puzzles.every((d) => this.solved.has(d))) return this.toast(id, 'It will not budge yet. Something else must come first.');
    if (!this.canReachPuzzle(pl, p)) return this.toast(id, `You need to be in ${this.areaLabel(p.area)} to do that.`);
    let act = action;
    if (action.kind === 'useItem') {
      if (!pl.inventory.includes(action.item)) return this.toast(id, 'You are not holding that.');
      const def = this.scn.items.find((i) => i.id === action.item);
      if (!def) return;
      act = { kind: 'useItem', item: def.id, itemKind: def.kind };
    } else if (p.requires.items.length) {
      const missing = p.requires.items.filter((i) => !pl.inventory.includes(i));
      if (missing.length) {
        const names = missing.map((i) => this.scn.items.find((x) => x.id === i)?.name ?? 'something').join(', ');
        return this.toast(id, `You need to be holding: ${names}.`);
      }
    }
    const now = Date.now();
    const connected = Math.max(1, this.connectedPlayers().length);
    const res = attempt(p, this.progress.get(p.id) ?? emptyProgress(), act, {
      now,
      player: id,
      connected,
      weight: pl.role === 'bosun' ? 2 : 1,
    });
    this.progress.set(p.id, res.progress);
    if (p.interaction.type === 'stations' && action.kind === 'press' && res.outcome !== 'invalid')
      this.io.broadcast({ t: 'fx', kind: 'cannon', puzzle: p.id, button: action.button, from: id });
    if (p.interaction.type === 'sync' && res.outcome !== 'invalid') this.io.broadcast({ t: 'fx', kind: 'heave', puzzle: p.id, from: id });
    switch (res.outcome) {
      case 'invalid':
        this.toast(id, res.message);
        break;
      case 'wrong':
        pl.stats.wrong++;
        if (p.wrongPenalty) this.penaltyMs += p.wrongPenalty * 1000;
        this.event('wrong', `${pl.name}: ${res.message}${p.wrongPenalty ? ` The water surges (−${p.wrongPenalty}s).` : ''}`, { puzzle: p.id, by: id, area: p.area });
        this.io.changed();
        break;
      case 'progress':
        this.event('progress', res.message, { puzzle: p.id, by: id, area: p.area });
        this.io.changed();
        break;
      case 'solved':
        // Items used up by the puzzle leave the player's hands.
        for (const used of act.kind === 'useItem' ? [act.item] : p.requires.items.filter((i) => pl.inventory.includes(i))) {
          this.release(pl, used);
          this.items.get(used)!.gone = true;
        }
        this.solve(p, pl);
        break;
    }
  }

  hint(id: string, puzzleId: string) {
    const pl = this.players.get(id);
    const p = this.puzzle(puzzleId);
    if (!pl || !p || this.ending || p.auto) return;
    if (!this.puzzleAvailable(p)) return this.toast(id, 'No hints for that one right now.');
    const tier = (this.hintTier.get(p.id) ?? 0) + 1;
    if (tier > 3) return this.toast(id, 'You already have the full answer for that one.');
    this.hintTier.set(p.id, tier);
    const ally = ALLIES.find((a) => a.id === this.scn.secret.ally)!;
    const raw = p.hints[tier - 1];
    const text =
      tier === 1
        ? `A note slips through the floorboards: “${raw}” ${ally.sign}`
        : tier === 2
          ? `The parrot squawks, as if remembering: “${raw}”`
          : `A second note, hastily scrawled: “${raw}” ${ally.sign}. ${ally.tell}`;
    this.hints.push({ puzzle: p.id, tier, text, by: pl.name });
    pl.stats.hints++;
    this.stuckOffer = false;
    this.lastProgressAt = Date.now();
    this.event('hint', `${pl.name} asked for a hint on “${p.name}”. ${text}`, { puzzle: p.id, by: id, speaker: tier === 2 ? 'parrot' : 'note' });
    this.io.changed();
  }

  board(id: string) {
    const p = this.players.get(id);
    if (!p || this.ending) return;
    if (!this.solved.has(this.scn.finalPuzzle)) return this.toast(id, 'The lifeboat is still hanging from the davits.');
    if (p.area !== 'deck') return this.toast(id, 'Get up on deck first!');
    if (this.boarded.has(id)) return;
    this.boarded.add(id);
    // Items held when boarding go with the player; the treasure counts if it was found.
    this.event('info', `${p.name} climbs into the lifeboat (${this.boarded.size}/${this.activeCrew().length}).`, { by: id });
    this.io.broadcast({ t: 'fx', kind: 'splash', from: id });
    this.io.changed();
    this.checkEscape();
  }

  // ---------- progression ----------
  private solve(p: PuzzleDef, by?: GamePlayer) {
    if (this.solved.has(p.id)) return;
    this.solved.add(p.id);
    const now = Date.now();
    this.lastProgressAt = now;
    this.stuckOffer = false;
    this.solveLog.push({ puzzle: p.id, module: p.module, at: now - this.startedAt, by: by?.id ?? 'auto', hints: this.hintTier.get(p.id) ?? 0 });
    if (by) by.stats.solved++;
    if (p.reward.openCage !== undefined) this.cagesOpen.add(p.reward.openCage);
    if (p.solvedText) {
      const isGate = p.auto && p.module === 'gate';
      const captain = isGate && /BLACKWATER/.test(p.solvedText);
      this.event(captain ? 'captain' : 'solved', by ? `${by.name}: ${p.solvedText}` : p.solvedText, {
        puzzle: p.id,
        by: by?.id,
        speaker: captain ? 'captain' : undefined,
      });
    }
    // Auto gates.
    for (const g of this.scn.puzzles) {
      if (g.auto && !this.solved.has(g.id) && g.requires.puzzles.every((d) => this.solved.has(d))) this.solve(g);
    }
    const prevAct = this.act;
    this.act = this.solved.has(this.scn.gates.act4) ? 4 : this.solved.has(this.scn.gates.act3) ? 3 : this.solved.has(this.scn.gates.act2) ? 2 : 1;
    if (this.act !== prevAct) this.event('act', `Act ${this.act}: ${['', 'Break the cages', 'The hold', "The captain's quarters", 'Take the ship'][this.act]}`);
    this.refreshVisibility(true);
    this.io.changed();
  }

  /** Recompute which items and clues are in the world; announce new ones. */
  private refreshVisibility(announce: boolean) {
    const fresh: string[] = [];
    for (const c of this.scn.clues) {
      if (this.revealed.has(c.id)) continue;
      if (this.isRevealed(c.revealedBy) && (c.area.startsWith('cage') || this.areaUnlocked(c.area))) {
        this.revealed.add(c.id);
        if (c.revealedBy.length && !c.attachedTo) fresh.push(`${c.title.toLowerCase()} in ${this.areaLabel(c.area)}`);
      }
    }
    for (const def of this.scn.items) {
      const st = this.items.get(def.id)!;
      if (st.visible || st.gone || def.combinedFrom) continue;
      if (this.isRevealed(def.revealedBy) && (def.area.startsWith('cage') || this.areaUnlocked(def.area))) {
        st.visible = true;
        if (def.revealedBy.length) fresh.push(`${def.name.toLowerCase()} in ${this.areaLabel(def.area)}`);
      }
    }
    if (announce && fresh.length) this.event('reveal', `Something new turned up: ${fresh.slice(0, 4).join('; ')}${fresh.length > 4 ? '…' : ''}.`);
  }

  private checkEscape() {
    const crew = this.activeCrew();
    if (crew.length && crew.every((p) => this.boarded.has(p.id))) this.end(this.solved.has(this.scn.treasurePuzzle) ? 'treasure' : 'escape');
  }

  private end(ending: Ending) {
    if (this.ending) return;
    this.ending = ending;
    this.endedAt = Date.now();
    if (ending === 'lost') this.event('captain', this.scn.captainLines.lost, { speaker: 'captain' });
    this.io.changed();
    this.io.ended(this);
  }

  /** Called once a second by the room. */
  tick(now = Date.now()) {
    if (this.ending) return;
    if (now >= this.endsAt) return this.end('lost');
    if (!this.lowWaterWarned && this.endsAt - now < 5 * 60_000) {
      this.lowWaterWarned = true;
      this.event('captain', this.scn.captainLines.lowWater, { speaker: 'captain' });
    }
    if (!this.stuckOffer && now - this.lastProgressAt > this.opts.stuckMs) {
      this.stuckOffer = true;
      this.event('parrot', 'The parrot ruffles its feathers as if it remembers something… (press H or use the Hint button)', { speaker: 'parrot' });
      this.io.changed();
    }
    // Disconnect grace: after it expires, hand off the player's items and open abandoned cages.
    for (const p of this.players.values()) {
      if (p.connected || p.abandoned || p.disconnectedAt === undefined) continue;
      if (now - p.disconnectedAt < this.opts.graceMs) continue;
      p.abandoned = true;
      this.handOff(p);
      this.checkEscape();
    }
  }

  private handOff(p: GamePlayer) {
    const crew = this.connectedPlayers();
    const pickTarget = (pref: (q: GamePlayer) => boolean) =>
      crew.filter((q) => q.inventory.length < this.carryLimit(q)).sort((a, b) => Number(pref(b)) - Number(pref(a)))[0];
    for (const itemId of [...p.inventory]) {
      const target = pickTarget((q) => q.cage === p.cage);
      const it = this.items.get(itemId)!;
      this.release(p, itemId);
      if (target) {
        it.holder = target.id;
        it.area = target.area;
        target.inventory.push(itemId);
      } else {
        it.area = p.area;
        it.pos = p.pos;
      }
    }
    const cageArea = `cage${p.cage}`;
    const stillInside = [...this.players.values()].some((q) => q.cage === p.cage && !q.abandoned);
    if (!stillInside && !this.cagesOpen.has(p.cage)) {
      // Nobody left in this cage: open it and make its contents available so no one is blocked.
      for (const c of this.scn.clues) if (c.area === cageArea) this.publicClues.add(c.id);
      for (const def of this.scn.items) {
        const st = this.items.get(def.id)!;
        if (st.area !== cageArea || st.holder || st.gone) continue;
        const needer = this.scn.puzzles.find((x) => x.requires.items.includes(def.id));
        const target = pickTarget((q) => !!needer && `cage${q.cage}` === needer.area);
        if (target) {
          st.holder = target.id;
          st.area = target.area;
          st.pos = undefined;
          target.inventory.push(def.id);
        }
      }
      this.event('info', `With nobody left inside, the ${this.scn.cages[p.cage].name} door rusts through and swings open. Its carvings can now be read by anyone, and its loose items were tossed to the crew.`);
      for (const puz of this.scn.puzzles)
        if (puz.area === cageArea && puz.act === 1 && !this.solved.has(puz.id)) this.solve({ ...puz, solvedText: '' });
    } else {
      this.event('info', `${p.name} has been lost to the storm (disconnected). Their tasks pass to the crew.`);
    }
    this.io.changed();
  }

  disconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    this.io.changed();
  }

  reconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = true;
    p.disconnectedAt = undefined;
    p.abandoned = false;
    this.io.changed();
  }

  // ---------- results ----------
  score(): number {
    if (!this.ending) return 0;
    const timeMs = (this.endedAt ?? Date.now()) - this.startedAt;
    const hints = this.hints.length;
    if (this.ending === 'lost') return Math.max(0, this.solved.size * 20 - hints * 10);
    const remaining = Math.max(0, this.durationMs - timeMs - this.penaltyMs);
    return Math.max(0, 1000 + Math.round(remaining / 1000) + (this.ending === 'treasure' ? 500 : 0) - hints * 40);
  }

  highlights(): string[] {
    const ps = [...this.players.values()];
    const out: string[] = [];
    const top = (key: keyof GamePlayer['stats']) => ps.slice().sort((a, b) => b.stats[key] - a.stats[key])[0];
    const solver = top('solved');
    if (solver?.stats.solved) out.push(`Master locksmith: ${solver.name} cracked ${solver.stats.solved} puzzle${solver.stats.solved > 1 ? 's' : ''}.`);
    const passer = top('passes');
    if (passer?.stats.passes) out.push(`Best arm aboard: ${passer.name} threw ${passer.stats.passes} item${passer.stats.passes > 1 ? 's' : ''} to crewmates.`);
    const wrong = top('wrong');
    if (wrong?.stats.wrong >= 3) out.push(`Most enthusiastic guesser: ${wrong.name} (${wrong.stats.wrong} wrong tries).`);
    const actTimes = [this.scn.gates.act2, this.scn.gates.act3, this.scn.gates.act4]
      .map((g) => this.solveLog.find((x) => x.puzzle === g)?.at)
      .filter((x): x is number => x !== undefined);
    if (actTimes[0] !== undefined) out.push(`Out of the cages in ${fmt(actTimes[0])}.`);
    if (this.solved.has(this.scn.treasurePuzzle)) out.push('Found Blackwater’s hidden gold!');
    out.push(this.hints.length ? `${this.hints.length} hint${this.hints.length > 1 ? 's' : ''} used.` : 'No hints used — true sea dogs.');
    if (this.penaltyMs) out.push(`Wrong answers let in ${Math.round(this.penaltyMs / 1000)}s of extra seawater.`);
    return out;
  }

  get band(): string {
    return leaderboardBand(Math.max(4, this.players.size));
  }
}

export function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
