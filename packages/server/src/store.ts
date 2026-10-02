// Tiny JSON-file persistence for leaderboards and analytics events.
import fs from 'node:fs';
import path from 'node:path';
import type { LeaderboardEntry } from '@crimson/engine';

export class Store {
  private boards: Record<string, LeaderboardEntry[]> = {};
  private boardFile: string;
  private analyticsFile: string;

  constructor(private dir: string | null) {
    this.boardFile = dir ? path.join(dir, 'leaderboard.json') : '';
    this.analyticsFile = dir ? path.join(dir, 'analytics.jsonl') : '';
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    try {
      this.boards = JSON.parse(fs.readFileSync(this.boardFile, 'utf8'));
    } catch {
      this.boards = {};
    }
  }

  addResult(band: string, entry: LeaderboardEntry): LeaderboardEntry[] {
    const list = (this.boards[band] ??= []);
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    this.boards[band] = list.slice(0, 50);
    if (this.dir) fs.writeFile(this.boardFile, JSON.stringify(this.boards, null, 2), () => {});
    return this.top(band);
  }

  top(band: string, n = 10): LeaderboardEntry[] {
    return (this.boards[band] ?? []).slice(0, n);
  }

  track(event: string, data: Record<string, unknown>) {
    if (!this.dir) return;
    fs.appendFile(this.analyticsFile, JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n', () => {});
  }
}
