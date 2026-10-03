import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/** Story media present in public/media (intro, endings, voice lines), so the game only requests real files. */
function mediaList(): string[] {
  const root = path.resolve(__dirname, 'public/media');
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(mp4|webm|mp3|ogg|m4a)$/i.test(f.name)) out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out;
}

export default defineConfig({
  define: { __MEDIA__: JSON.stringify(mediaList()) },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
