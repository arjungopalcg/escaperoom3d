// HTTP + WebSocket entry point. Serves the built client in production.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg } from '@crimson/engine';
import { Room, type Config } from './room.ts';
import { Store } from './store.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(here, '../../client/dist');
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(here, '../../../data');

const config: Config = {
  graceMs: Number(process.env.GRACE_SECONDS ?? 60) * 1000,
  stuckMs: Number(process.env.STUCK_MINUTES ?? 5) * 60_000,
  runMinutes: Number(process.env.RUN_MINUTES ?? 45),
  minPlayers: Number(process.env.MIN_PLAYERS ?? 4),
  introMs: Number(process.env.INTRO_SECONDS ?? 40) * 1000,
};

export function createServer(cfg: Config = config, dataDir: string | null = DATA_DIR) {
  const store = new Store(dataDir);
  const rooms = new Map<string, Room>();

  const newCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      if (!rooms.has(code)) return code;
    }
  };

  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.webm': 'video/webm',
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    }
    // Opt-in debug endpoint for automated end-to-end tests: exposes a room's full scenario (with solutions).
    const dbg = url.pathname.match(/^\/api\/debug\/rooms\/([A-Z0-9]+)$/);
    if (dbg && process.env.DEBUG_API === '1') {
      const g = rooms.get(dbg[1])?.game;
      res.writeHead(g ? 200 : 404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(g ? { scenario: g.scn, players: [...g.players.values()] } : { error: 'no game' }));
    }
    let file = path.join(STATIC_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    const missing = !file.startsWith(STATIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory();
    // Missing assets (videos, voice files…) are a plain 404 so the client can fall back; page routes get the app.
    if (missing && path.extname(url.pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    if (missing) file = path.join(STATIC_DIR, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Client not built. Run `npm run build`, or use `npm run dev` and open the Vite URL.');
    }
    const type = MIME[path.extname(file)] ?? 'application/octet-stream';
    const size = fs.statSync(file).size;
    // Byte ranges let browsers (Safari especially) stream and seek videos.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws: WebSocket) => {
    let room: Room | undefined;
    let playerId: string | undefined;
    const conn = { send: (d: string) => ws.readyState === ws.OPEN && ws.send(d), close: () => ws.close() };
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!room) {
        if (msg.t === 'create') {
          room = new Room(newCode(), cfg, store);
          rooms.set(room.code, room);
          const p = room.join(msg.name, conn);
          if (typeof p !== 'string') playerId = p.id;
        } else if (msg.t === 'join') {
          const r = rooms.get(String(msg.room ?? '').toUpperCase());
          if (!r) return conn.send(JSON.stringify({ t: 'error', text: 'That ship has sailed — no room with that code. Ask your host for a fresh link.' }));
          const p = r.join(msg.name, conn, msg.token);
          if (typeof p === 'string') return conn.send(JSON.stringify({ t: 'error', text: p }));
          room = r;
          playerId = p.id;
        }
        return;
      }
      if (playerId) {
        try {
          room.handle(playerId, msg);
        } catch (e) {
          console.error('handler error', e);
        }
      }
    });
    ws.on('close', () => {
      if (room && playerId) room.leave(playerId, conn);
    });
  });

  // Clean up rooms nobody has been in for a while.
  const sweeper = setInterval(() => {
    for (const [code, r] of rooms)
      if (r.empty && Date.now() - r.lastActive > 15 * 60_000) {
        r.dispose();
        rooms.delete(code);
      }
  }, 60_000);

  return {
    server,
    rooms,
    close: () => {
      clearInterval(sweeper);
      for (const r of rooms.values()) r.dispose();
      wss.close();
      server.close();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createServer();
  server.listen(PORT, () => {
    console.log(`Crimson Gull server on http://localhost:${PORT} (ws: /ws)`);
    console.log(`  run ${config.runMinutes} min · grace ${config.graceMs / 1000}s · min players ${config.minPlayers}`);
  });
}
