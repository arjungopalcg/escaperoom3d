// In-browser stand-in for the game server, for the solo preview build (no network needed).
// It runs the same engine and Game rules as packages/server, for one practice player.
import {
  generateScenario,
  MAX_PLAYERS,
  type ClientMsg,
  type LeaderboardEntry,
  type Results,
  type ServerMsg,
} from '@crimson/engine';
import { Game } from '../../server/src/game.ts';

type Emit = (msg: ServerMsg) => void;

export class LocalServer {
  private me = 'p1';
  private name = 'Sailor';
  private game?: Game;
  private phase: 'lobby' | 'playing' | 'results' = 'lobby';
  private dirty = false;
  private board: LeaderboardEntry[] = [];

  constructor(private emit: Emit) {
    setInterval(() => this.flush(), 100);
    setInterval(() => this.game?.tick(), 1000);
  }

  private lobby() {
    this.emit({
      t: 'lobby',
      room: 'SOLO',
      hostId: this.me,
      players: [{ id: this.me, name: this.name, color: '#e6194b', connected: true, micOk: false, isHost: true }],
      phase: this.phase,
      minPlayers: 4,
      maxPlayers: MAX_PLAYERS,
    });
  }

  private flush() {
    const g = this.game;
    if (!g || this.phase !== 'playing') return;
    if (this.dirty) {
      this.dirty = false;
      this.emit({ t: 'state', s: g.view(), serverNow: Date.now() });
    }
    const p = g.players.get(this.me)!;
    this.emit({ t: 'pos', list: [[p.id, p.pos[0], p.pos[1], p.pos[2], p.rot, p.area]] });
  }

  private start() {
    const scenario = generateScenario(1);
    this.game = new Game(
      scenario,
      [{ id: this.me, name: this.name, color: '#e6194b', connected: true }],
      {
        broadcast: (m) => this.emit(m),
        sendTo: (_id, m) => this.emit(m),
        changed: () => (this.dirty = true),
        ended: (g) => this.finish(g),
      },
      { practice: true, graceMs: 60_000, stuckMs: 5 * 60_000 },
    );
    this.phase = 'playing';
    this.lobby();
    this.emit(this.game.startMessage(this.me));
    this.emit({ t: 'state', s: this.game.view(), serverNow: Date.now() });
    this.emit({ t: 'event', kind: 'captain', text: scenario.captainLines.start, speaker: 'captain' });
  }

  private finish(g: Game) {
    const timeMs = (g.endedAt ?? Date.now()) - g.startedAt;
    const crew = `${this.name}'s crew`;
    const score = g.score();
    this.board.push({ crew, score, timeMs, ending: g.ending!, hints: g.hints.length, players: 1, date: new Date().toISOString().slice(0, 10) });
    this.board.sort((a, b) => b.score - a.score);
    const counted = g.scn.puzzles.filter((p) => !p.auto && !p.optional);
    const r: Results = {
      ending: g.ending!,
      crew,
      timeMs,
      hintsUsed: g.hints.length,
      score,
      secret: g.scn.secret,
      band: 'solo preview',
      players: 1,
      actReached: g.act,
      solvedCount: counted.filter((p) => g.solved.has(p.id)).length,
      totalCount: counted.length,
      highlights: g.highlights(),
      leaderboard: this.board.slice(0, 10),
      seed: g.scn.seed,
      practice: true,
    };
    this.phase = 'results';
    this.emit({ t: 'state', s: g.view(), serverNow: Date.now() });
    this.emit({ t: 'results', r });
    this.lobby();
  }

  receive(msg: ClientMsg) {
    const g = this.game;
    switch (msg.t) {
      case 'ping':
        return this.emit({ t: 'pong', c: msg.c, s: Date.now() });
      case 'create':
      case 'join':
        this.name = (msg.name || 'Sailor').slice(0, 20);
        this.emit({ t: 'welcome', you: this.me, token: 'local', room: 'SOLO' });
        return this.lobby();
      case 'start':
        return this.start();
      case 'playAgain':
        this.phase = 'lobby';
        this.game = undefined;
        return this.lobby();
      case 'chat':
        return this.emit({ t: 'chat', from: this.me, name: this.name, text: String(msg.text).slice(0, 300), at: Date.now() });
    }
    if (!g || this.phase !== 'playing') return;
    switch (msg.t) {
      case 'move':
        return g.move(this.me, msg.p, msg.r, msg.area);
      case 'pickup':
        return g.pickup(this.me, msg.item);
      case 'drop':
        return g.drop(this.me, msg.item, msg.pos);
      case 'pass':
        return g.pass(this.me, msg.item, msg.to);
      case 'combine':
        return g.combine(this.me, msg.a, msg.b);
      case 'inspect':
        return g.inspect(this.me, msg.clue);
      case 'act':
        return g.act_(this.me, msg.puzzle, msg.action);
      case 'hint':
        return g.hint(this.me, msg.puzzle);
      case 'board':
        return g.board(this.me);
    }
  }
}
