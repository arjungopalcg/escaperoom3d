// End-to-end smoke test: real browsers play a whole run against a local server.
// Usage: DEBUG_API=1 npm start  (in another shell), then: npx tsx scripts/e2e.mts [players] [outDir]
// Needs Playwright with Chromium available.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { beatAt, checkScenario, type PuzzleDef, type Scenario } from '../packages/engine/src/index.ts';
import { cageGeoms, slotSpot, DECK_FEATURES } from '../packages/client/src/world/layout.ts';

const require = createRequire(import.meta.url);
let playwright: typeof import('playwright');
try {
  playwright = require('playwright');
} catch {
  playwright = createRequire('/opt/node-tools/node_modules/')('playwright');
}
const N = Number(process.argv[2] ?? 4);
const OUT = process.argv[3] ?? 'e2e-shots';
const BASE = process.env.BASE ?? 'http://localhost:8787';
fs.mkdirSync(OUT, { recursive: true });

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [];
const frames: string[] = [];
type Page = import('playwright').Page;
const pages: Page[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(name: string, url: string, w = 1280, h = 760) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      const t = String(f.payload);
      if (t.includes('"t":"event"') && /"kind":"(info|wrong|progress)"/.test(t)) frames.push(`${name}: ${t.slice(0, 200)}`);
    }),
  );
  await page.goto(url);
  await page.fill('input[placeholder="Your pirate name"]', name);
  return page;
}

const names = ['Anne', 'Bonny', 'Calico', 'Drake', 'Edward', 'Flint', 'Grace', 'Hook', 'Ivy', 'Jack', 'Kidd', 'Long', 'Mary', 'Ned', 'Olive'];
const host = await open(names[0], `${BASE}/?debug`);
await host.click('text=Launch a new ship');
await host.waitForSelector('.code');
const code = (await host.textContent('.code'))!.trim();
pages.push(host);
for (let i = 1; i < N; i++) {
  const p = await open(names[i], `${BASE}/?room=${code}&debug&norender`, 800, 500);
  await p.click(`text=Board ship ${code}`);
  pages.push(p);
}
await host.waitForFunction((n) => (window as any).crimson.store.lobby?.players.length === n, N, { timeout: 60000 });
await host.click(N >= 4 ? 'text=Set sail' : 'text=Practice run');
await host.waitForSelector('#hud', { timeout: 180000 }).catch(async (e) => {
  await host.screenshot({ path: `${OUT}/start-failed.png` });
  throw e;
});
await sleep(1500);

const dbg = await (await fetch(`${BASE}/api/debug/rooms/${code}`)).json();
const scn: Scenario = dbg.scenario;
const ids: string[] = await Promise.all(pages.map((p) => p.evaluate(() => (window as any).crimson.store.me)));
const cageOf = new Map<string, number>(dbg.players.map((p: { id: string; cage: number }) => [p.id, p.cage]));
const geoms = cageGeoms(scn.layout.cages);
console.log(`room ${code}: ${N} players, ${scn.layout.cages} cages, style ${scn.layout.style}, ${scn.puzzles.filter((p) => !p.auto).length} puzzles`);

const send = (i: number, msg: unknown) => pages[i].evaluate((m) => (window as any).crimson.net.send(m), msg);
const state = () => host.evaluate(() => (window as any).crimson.store.state);
async function teleport(i: number, x: number, y: number, z: number, yaw = 0, pitch = 0) {
  const area = await pages[i].evaluate(([x, y, z, yaw, pitch]) => {
    const c = (window as any).crimson.session.controls;
    c.setPosition(x, y, z, yaw);
    c.pitch = pitch;
    return c.area as string;
  }, [x, y, z, yaw, pitch]);
  // Software-rendered WebGL is slow; wait until the server has seen the move.
  for (let k = 0; k < 200; k++) {
    const d = await (await fetch(`${BASE}/api/debug/rooms/${code}`)).json();
    const me = d.players.find((p: any) => p.id === ids[i]);
    if (!me || (me.area === area && Math.abs(me.pos[0] - x) < 0.05 && Math.abs(me.pos[2] - z) < 0.05)) break;
    await sleep(50);
  }
}
const shot = async (i: number, name: string) => {
  if (i !== 0) return; // bots run with ?norender; only the host draws
  await sleep(400);
  await pages[i].screenshot({ path: `${OUT}/${name}.png` });
};
function spotFor(area: string, slot: number) {
  const s = slotSpot(area, slot, geoms);
  // Stand 1.4 m in front of the slot, facing it.
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const y = area === 'deck' ? 5 : 0;
  return { x: s.x + fx * 1.4, z: s.z + fz * 1.4, y, yaw: s.yaw, target: s };
}
async function goTo(i: number, area: string, slot?: number) {
  if (area.startsWith('cage')) {
    const g = geoms[Number(area.slice(4))];
    return teleport(i, g.x, 0, g.z, g.yaw);
  }
  if (slot !== undefined && slot >= 0) {
    const s = spotFor(area, slot);
    return teleport(i, s.x, s.y, s.z, s.yaw, -0.15);
  }
  const p = area === 'hold' ? [-6, 0, -9] : area === 'quarters' ? [21, 0, 2] : [0, 5, 3];
  return teleport(i, p[0], p[1], p[2]);
}
const canBeIn = async (i: number, area: string) => {
  const s = await state();
  const cage = cageOf.get(ids[i])!;
  if (s.practice && (area.startsWith('cage') || area === 'hold')) return true;
  if (area.startsWith('cage')) return Number(area.slice(4)) === cage || (s.cagesOpen.includes(cage) && s.cagesOpen.includes(Number(area.slice(4))));
  if (area === 'hold') return s.cagesOpen.includes(cage);
  return { quarters: 3, deck: 4 }[area as 'quarters' | 'deck'] <= s.act;
};
const inv = async (i: number): Promise<string[]> => (await state()).players.find((p: any) => p.id === ids[i]).inventory;
const waitSolved = async (id: string) => {
  for (let k = 0; k < 40; k++) {
    if ((await state()).solved.includes(id)) return true;
    await sleep(100);
  }
  return false;
};

async function fetchItem(itemId: string, actor: number) {
  if ((await inv(actor)).includes(itemId)) return;
  const def = scn.items.find((x) => x.id === itemId)!;
  if (def.combinedFrom) {
    for (const c of def.combinedFrom) await fetchItem(c, actor);
    await send(actor, { t: 'combine', a: def.combinedFrom[0], b: def.combinedFrom[1] });
    await sleep(250);
    return;
  }
  const s = await state();
  const st = s.items.find((x: any) => x.id === itemId);
  let holder = st.holder ? ids.indexOf(st.holder) : -1;
  if (holder < 0) {
    for (let i = 0; i < N && holder < 0; i++) if (await canBeIn(i, st.area)) holder = i;
    await goTo(holder, st.area);
    await send(holder, { t: 'pickup', item: itemId });
    await sleep(250);
    if (!(await inv(holder)).includes(itemId)) {
      const d2 = await (await fetch(`${BASE}/api/debug/rooms/${code}`)).json();
      console.log('pickup failed', def.name, 'item area', st.area, 'holder', holder, JSON.stringify(d2.players[holder]?.area), await pages[holder].evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | ')));
    }
  }
  if (holder !== actor) {
    const s2 = await state();
    const actorArea = s2.players.find((p: any) => p.id === ids[actor]).area;
    if (await canBeIn(holder, actorArea)) await goTo(holder, actorArea);
    await send(holder, { t: 'pass', item: itemId, to: ids[actor] });
    await sleep(300);
  }
}

const shotAt = new Set<string>();
let clickTested = false;
for (const pid of checkScenario(scn).order) {
  const p = scn.puzzles.find((x) => x.id === pid)! as PuzzleDef;
  if (p.auto) continue;
  const s = await state();
  if (s.solved.includes(pid)) continue;
  let actor = -1;
  for (let i = 0; i < N && actor < 0; i++) if (pages[i] && (await canBeIn(i, p.area))) actor = i;
  if (actor < 0) throw new Error(`nobody can reach ${p.name}`);
  for (const it of p.requires.items) await fetchItem(it, actor);
  await goTo(actor, p.area, p.area.startsWith('cage') ? undefined : p.slot);
  const key = `act${p.act}`;
  if (!shotAt.has(key) && actor === 0) {
    shotAt.add(key);
    await shot(actor, `act${p.act}-${p.area}`);
  }
  // Exercise the real click path once: open a puzzle panel by clicking its prop.
  if (!clickTested && actor === 0 && !p.area.startsWith('cage') && p.prop !== 'gate') {
    clickTested = true;
    const sp = spotFor(p.area, p.slot);
    await teleport(actor, sp.x, sp.y, sp.z, sp.yaw, -0.25);
    const vp = pages[actor].viewportSize()!;
    await sleep(800);
    for (const dy of [0, 50, -50, 100, 150, 200, 250]) {
      await pages[actor].mouse.move(vp.width / 2, vp.height / 2 + dy);
      await sleep(400);
      await pages[actor].mouse.click(vp.width / 2, vp.height / 2 + dy);
      await sleep(400);
      if (await pages[actor].$('.modal')) break;
    }
    const opened = !!(await pages[actor].$('.modal'));
    console.log(`click-open panel for "${p.name}": ${opened ? 'ok' : 'MISSED'}`);
    await shot(actor, `panel-${p.module}`);
    if (await pages[actor].$('.modal')) await pages[actor].keyboard.press('Escape');
  }
  const sol = p.solution;
  const act = (i: number, action: unknown) => send(i, { t: 'act', puzzle: p.id, action });
  if (sol.type === 'useItem') {
    const def = scn.items.find((x) => x.id === sol.value)!;
    await act(actor, { kind: 'useItem', item: def.id, itemKind: def.kind });
  } else if (sol.type === 'sequence' || sol.type === 'stations') {
    const helpers: number[] = [];
    for (let i = 0; i < N; i++) if (await canBeIn(i, p.area)) helpers.push(i);
    for (const h of helpers) await goTo(h, p.area);
    for (let k = 0; k < sol.value.length; k++) {
      const who = helpers[k % helpers.length];
      if (sol.type === 'stations') {
        const ci = p.interaction.type === 'stations' ? p.interaction.stations.findIndex((x) => x.id === sol.value[k]) : 0;
        const c = DECK_FEATURES.cannons[ci];
        await teleport(who, c.x, 5, c.z + 1.2, 0);
      }
      await act(who, { kind: 'press', button: sol.value[k] });
      await sleep(200);
    }
  } else if (sol.type === 'sync') {
    const helpers: number[] = [];
    for (let i = 0; i < N; i++) if (await canBeIn(i, p.area)) helpers.push(i);
    for (const h of helpers) await goTo(h, p.area);
    if (sol.cue !== undefined && p.interaction.type === 'sync' && p.interaction.cycle) {
      while (beatAt(Date.now() + 120, p.interaction.cycle) !== sol.cue || (Date.now() + 120) % 1000 > 400) await sleep(30);
    }
    await Promise.all(helpers.map((h) => act(h, { kind: 'sync' })));
  } else if (sol.type === 'vote') {
    for (let i = 0; i < N; i++) {
      await goTo(i, p.area);
      await send(i, { t: 'act', puzzle: p.id, action: { kind: 'vote', option: sol.value } });
    }
  } else {
    await act(actor, { kind: 'answer', value: (sol as { value: unknown }).value });
  }
  const ok = await waitSolved(pid);
  if (!ok) {
    console.log(`FAILED: ${p.module} / ${p.name}`);
    console.log(frames.slice(-12).join('\n'));
    console.log(await pages[actor].evaluate(() => [...document.querySelectorAll('.toast, .log .m')].map((e) => e.textContent).slice(-8).join('\n')));
    const d2 = await (await fetch(`${BASE}/api/debug/rooms/${code}`)).json();
    console.log('server players', JSON.stringify(d2.players.map((x: any) => [x.name, x.area, x.pos.map((v: number) => v.toFixed(1)), x.inventory])), 'puzzle area', p.area, p.slot);
    console.log(await pages[actor].evaluate(() => JSON.stringify([(window as any).crimson.session.controls.pos, (window as any).crimson.session.controls.area])));
    console.log('inventory', await inv(actor), 'items', JSON.stringify((await state()).items.filter((x: any) => p.requires.items.includes(x.id) || scn.items.find((d) => d.id === x.id)?.combinedFrom)));
    await shot(actor, `fail-${p.id}`);
    break;
  }
}
// Look at the lowered lifeboat, then everyone boards.
await goTo(0, 'deck');
await teleport(0, 0, 5, 3, 0, -0.2);
await shot(0, 'deck-lifeboat');
for (let i = 0; i < N; i++) {
  await goTo(i, 'deck');
  await send(i, { t: 'board' });
  await sleep(150);
}
await host.waitForSelector('.ending', { timeout: 8000 }).catch(() => {});
await shot(0, 'results');
const ending = await host.textContent('.ending').catch(() => null);
console.log('ending:', ending);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(ending && errors.length === 0 ? 0 : 1);
