// A private room: lobby, run lifecycle, message routing.
import crypto from 'node:crypto';
import {
  generateScenario,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type ClientMsg,
  type LobbyPlayer,
  type Results,
  type ServerMsg,
} from '@crimson/engine';
import { Game } from './game.ts';
import type { Store } from './store.ts';

export interface Conn {
  send(data: string): void;
  close(): void;
}

export interface Config {
  graceMs: number;
  stuckMs: number;
  runMinutes: number;
  minPlayers: number;
}

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  color: string;
  conn?: Conn;
  connected: boolean;
  micOk: boolean;
}

const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#aaffc3',
];

export function cleanName(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return s || 'Sailor';
}

export class Room {
  players = new Map<string, RoomPlayer>();
  hostId = '';
  phase: 'lobby' | 'playing' | 'results' = 'lobby';
  game?: Game;
  results?: Results;
  lastActive = Date.now();
  private dirty = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    readonly code: string,
    private cfg: Config,
    private store: Store,
  ) {
    this.timers.push(setInterval(() => this.flush(), 100));
    this.timers.push(setInterval(() => this.game?.tick(), 1000));
  }

  dispose() {
    this.timers.forEach(clearInterval);
  }

  get empty(): boolean {
    return ![...this.players.values()].some((p) => p.connected);
  }

  // ---------- connections ----------
  join(name: string, conn: Conn, token?: string): RoomPlayer | string {
    const existing = token ? [...this.players.values()].find((p) => p.token === token) : undefined;
    if (existing) {
      existing.conn?.close();
      existing.conn = conn;
      existing.connected = true;
      if (this.phase === 'lobby') existing.name = cleanName(name) || existing.name;
      this.game?.reconnect(existing.id);
      this.welcome(existing);
      return existing;
    }
    if (this.phase !== 'lobby') return 'This crew has already set sail. Wait for the run to finish, then ask the host for a new link.';
    if (this.players.size >= MAX_PLAYERS) return `This ship is full (${MAX_PLAYERS} players).`;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const p: RoomPlayer = {
      id: crypto.randomBytes(4).toString('hex'),
      token: crypto.randomBytes(12).toString('hex'),
      name: cleanName(name),
      color: COLORS.find((c) => !used.has(c)) ?? COLORS[0],
      conn,
      connected: true,
      micOk: false,
    };
    this.players.set(p.id, p);
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = p.id;
    this.welcome(p);
    return p;
  }

  private welcome(p: RoomPlayer) {
    this.sendTo(p.id, { t: 'welcome', you: p.id, token: p.token, room: this.code });
    this.broadcastLobby();
    if (this.game && this.phase === 'playing') {
      this.sendTo(p.id, this.game.startMessage(p.id));
      this.sendTo(p.id, { t: 'state', s: this.game.view(), serverNow: Date.now() });
    }
    if (this.phase === 'results' && this.results) this.sendTo(p.id, { t: 'results', r: this.results });
    this.lastActive = Date.now();
  }

  leave(id: string, conn: Conn) {
    const p = this.players.get(id);
    if (!p || p.conn !== conn) return;
    p.conn = undefined;
    p.connected = false;
    if (this.phase === 'lobby') this.players.delete(id);
    else this.game?.disconnect(id);
    if (this.hostId === id) {
      const next = [...this.players.values()].find((x) => x.connected);
      if (next) this.hostId = next.id;
    }
    this.broadcastLobby();
    this.lastActive = Date.now();
  }

  // ---------- messaging ----------
  sendTo(id: string, msg: ServerMsg) {
    const p = this.players.get(id);
    if (p?.conn) p.conn.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) p.conn?.send(data);
  }

  private broadcastLobby() {
    const players: LobbyPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      micOk: p.micOk,
      isHost: p.id === this.hostId,
    }));
    this.broadcast({ t: 'lobby', room: this.code, hostId: this.hostId, players, phase: this.phase, minPlayers: this.cfg.minPlayers, maxPlayers: MAX_PLAYERS });
  }

  private flush() {
    const g = this.game;
    if (!g || this.phase !== 'playing') return;
    if (this.dirty) {
      this.dirty = false;
      this.broadcast({ t: 'state', s: g.view(), serverNow: Date.now() });
    }
    const list = [...g.players.values()]
      .filter((p) => p.connected)
      .map((p) => [p.id, round(p.pos[0]), round(p.pos[1]), round(p.pos[2]), round(p.rot), p.area] as [string, number, number, number, number, string]);
    this.broadcast({ t: 'pos', list });
  }

  // ---------- lifecycle ----------
  private start(practice: boolean) {
    const roster = [...this.players.values()].filter((p) => p.connected);
    const n = roster.length;
    if (n > MAX_PLAYERS) return 'Too many players.';
    if (!practice && n < this.cfg.minPlayers)
      return `You need at least ${this.cfg.minPlayers} players to set sail (or start a practice run).`;
    // Players who left the lobby are dropped from the run.
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    const scenario = generateScenario(n, { durationMinutes: this.cfg.runMinutes });
    this.results = undefined;
    this.game = new Game(scenario, roster, {
      broadcast: (m) => this.broadcast(m),
      sendTo: (id, m) => this.sendTo(id, m),
      changed: () => (this.dirty = true),
      ended: (g) => this.finish(g),
    }, { practice: practice || n < MIN_PLAYERS, graceMs: this.cfg.graceMs, stuckMs: this.cfg.stuckMs });
    this.phase = 'playing';
    this.store.track('run_start', { room: this.code, players: n, seed: scenario.seed, practice, est: scenario.estMinutes, attempts: scenario.attempts });
    this.broadcastLobby();
    for (const p of roster) this.sendTo(p.id, this.game.startMessage(p.id));
    this.broadcast({ t: 'state', s: this.game.view(), serverNow: Date.now() });
    this.broadcast({ t: 'event', kind: 'captain', text: scenario.captainLines.start, speaker: 'captain' });
    return null;
  }

  private finish(g: Game) {
    const host = this.players.get(this.hostId);
    const crew = `${host?.name ?? 'Nameless'}'s crew`;
    const timeMs = (g.endedAt ?? Date.now()) - g.startedAt;
    const score = g.score();
    const band = g.band;
    const entry = {
      crew,
      score,
      timeMs,
      ending: g.ending!,
      hints: g.hints.length,
      players: g.players.size,
      date: new Date().toISOString().slice(0, 10),
    };
    const leaderboard = g.opts.practice ? this.store.top(band) : this.store.addResult(band, entry);
    const total = g.scn.puzzles.filter((p) => !p.auto && !p.optional).length;
    const solvedCount = g.scn.puzzles.filter((p) => !p.auto && !p.optional && g.solved.has(p.id)).length;
    this.results = {
      ending: g.ending!,
      crew,
      timeMs,
      hintsUsed: g.hints.length,
      score,
      secret: g.scn.secret,
      band,
      players: g.players.size,
      actReached: g.act,
      solvedCount,
      totalCount: total,
      highlights: g.highlights(),
      leaderboard,
      seed: g.scn.seed,
      practice: g.opts.practice,
    };
    this.store.track('run_end', {
      room: this.code,
      players: g.players.size,
      band,
      ending: g.ending,
      timeMs,
      hints: g.hints.length,
      act: g.act,
      solves: g.solveLog,
      hintsPerPuzzle: Object.fromEntries(g.hintTier),
      practice: g.opts.practice,
    });
    this.phase = 'results';
    this.dirty = false;
    this.broadcast({ t: 'state', s: g.view(), serverNow: Date.now() });
    this.broadcast({ t: 'results', r: this.results });
    this.broadcastLobby();
  }

  handle(id: string, msg: ClientMsg) {
    const p = this.players.get(id);
    if (!p) return;
    this.lastActive = Date.now();
    const g = this.game;
    const playing = this.phase === 'playing' && g;
    switch (msg.t) {
      case 'ping':
        return this.sendTo(id, { t: 'pong', c: msg.c, s: Date.now() });
      case 'start': {
        if (id !== this.hostId) return this.sendTo(id, { t: 'error', text: 'Only the host can start the run.' });
        if (this.phase === 'playing') return;
        const err = this.start(!!msg.practice);
        if (err) this.sendTo(id, { t: 'error', text: err });
        return;
      }
      case 'playAgain': {
        if (id !== this.hostId || this.phase !== 'results') return;
        this.phase = 'lobby';
        this.game = undefined;
        this.broadcastLobby();
        return;
      }
      case 'mic':
        p.micOk = !!msg.ok;
        return this.broadcastLobby();
      case 'chat': {
        const text = String(msg.text ?? '').slice(0, 300).trim();
        if (!text) return;
        const broadcast = g?.players.get(id)?.role === 'captain';
        return this.broadcast({ t: 'chat', from: id, name: p.name, text, at: Date.now(), broadcast });
      }
      case 'rtc':
        if (this.players.has(msg.to)) this.sendTo(msg.to, { t: 'rtc', from: id, data: msg.data });
        return;
      case 'bell':
        if (playing && g.players.get(id)?.role === 'captain') this.broadcast({ t: 'bell', from: id, on: !!msg.on });
        return;
    }
    if (!playing) return;
    switch (msg.t) {
      case 'move':
        return g.move(id, msg.p, msg.r, msg.area);
      case 'pickup':
        return g.pickup(id, msg.item);
      case 'drop':
        return g.drop(id, msg.item, msg.pos);
      case 'pass':
        return g.pass(id, msg.item, msg.to);
      case 'combine':
        return g.combine(id, msg.a, msg.b);
      case 'inspect':
        return g.inspect(id, msg.clue);
      case 'act':
        return g.act_(id, msg.puzzle, msg.action);
      case 'hint':
        return g.hint(id, msg.puzzle);
      case 'board':
        return g.board(id);
    }
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
