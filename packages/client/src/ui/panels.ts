// Modal panels: puzzles, clues, item inspection, hints, passing, settings and help.
import * as THREE from 'three';
import {
  beatAt,
  GLYPHS,
  KNOTS,
  ROLE_INFO,
  type Action,
  type ItemDef,
  type PublicPuzzle,
  type StateView,
  type SymbolId,
} from '@crimson/engine';
import { audio } from '../audio.ts';
import { net } from '../net.ts';
import { store, type ClueRead } from '../store.ts';
import { voice } from '../voice.ts';
import { buildItem } from '../world/props.ts';
import { clear, h } from './dom.ts';

export interface PanelContext {
  act(puzzle: string, action: Action): void;
  inspectClue(id: string): void;
  hint(puzzle: string): void;
  pass(item: string, to: string): void;
  nearbyPlayers(): { id: string; name: string; dist: number; inRange: boolean }[];
  nearCannon(puzzle: string, button: string): boolean;
  areaName(area: string): string;
  onModal(open: boolean): void;
}

let ctx: PanelContext;
export function setPanelContext(c: PanelContext) {
  ctx = c;
}

const put = (el: HTMLElement, ...children: (Node | null)[]) => el.append(...children.filter((c): c is Node => !!c));

// ---------- modal plumbing ----------
let current: { el: HTMLElement; onClose?: () => void; puzzle?: string; refresh?: (s: StateView) => void; status?: (text: string, kind: string) => void } | undefined;

export function closeModal() {
  if (!current) return;
  current.onClose?.();
  current.el.remove();
  current = undefined;
  ctx?.onModal(false);
}

export function modalOpen(): boolean {
  return !!current;
}

function openModal(content: (HTMLElement | null)[], opts: { onClose?: () => void; puzzle?: string } = {}) {
  closeModal();
  const modal = h('div', { class: 'modal', role: 'dialog' }, h('button', { class: 'close', title: 'Close (Esc)', on: { click: closeModal } }, '×'), ...content.filter((c): c is HTMLElement => !!c));
  const wrap = h('div', { class: 'modal-wrap', on: { mousedown: (e) => e.target === wrap && closeModal() } }, modal);
  document.body.append(wrap);
  current = { el: wrap, onClose: opts.onClose, puzzle: opts.puzzle };
  ctx?.onModal(true);
  return current;
}

/** Push fresh server state into an open puzzle panel. */
export function refreshPanel(s: StateView) {
  current?.refresh?.(s);
}

/** Show an outcome message for the puzzle currently open. */
export function panelStatus(puzzle: string | undefined, text: string, kind: 'good' | 'bad' | '') {
  if (current?.puzzle && current.puzzle === puzzle) current.status?.(text, kind);
}

export function openPuzzleId(): string | undefined {
  return current?.puzzle;
}

// ---------- puzzle panels ----------
export function openPuzzle(p: PublicPuzzle) {
  const s = store.state!;
  const view = () => store.state?.puzzles.find((x) => x.id === p.id);
  const status = h('div', { class: 'status' });
  const hintsBox = h('div', { class: 'hints' });
  const reveals = h('div', { class: 'row' });
  const body = h('div');
  const it = p.interaction;
  let refreshBody: (s: StateView) => void = () => {};
  let beatTimer: number | undefined;
  let cleanup: (() => void) | undefined;

  const submit = (value: string | string[] | number[]) => {
    audio.play('click');
    ctx.act(p.id, { kind: 'answer', value });
  };

  switch (it.type) {
    case 'code':
    case 'dial': {
      const isDial = it.type === 'dial';
      const count = isDial ? it.count : it.digits;
      const vals = new Array(count).fill(0);
      const step = isDial ? it.step : 1;
      const mod = isDial ? 360 : 10;
      const wheels = h('div', { class: 'wheels' });
      const render = () => {
        clear(wheels).append(
          ...vals.map((v, i) =>
            h('div', { class: 'wheel' },
              h('button', { on: { click: () => ((vals[i] = (v + step) % mod), render(), audio.play('click')) }, 'aria-label': 'up' }, '▲'),
              h('div', { class: 'val' }, isDial ? `${String(v).padStart(3, '0')}°` : String(v)),
              h('button', { on: { click: () => ((vals[i] = (v - step + mod) % mod), render(), audio.play('click')) }, 'aria-label': 'down' }, '▼'),
              isDial ? h('div', { class: 'sub' }, `bearing ${i + 1}`) : null,
            ),
          ),
        );
      };
      render();
      let typed = 0;
      const key = (e: KeyboardEvent) => {
        if (isDial || !/^\d$/.test(e.key)) return;
        vals[typed % count] = Number(e.key);
        typed++;
        render();
        if (typed % count === 0) submit(vals.join(''));
      };
      window.addEventListener('keydown', key);
      put(body, 
        wheels,
        h('div', { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'btn primary', on: { click: () => submit(isDial ? [...vals] : vals.join('')) } }, isDial ? 'Steer this course' : 'Try the combination'),
        ),
        isDial ? null : h('div', { class: 'faint', style: 'text-align:center' }, 'Tip: you can type the digits.'),
      );
      cleanup = () => window.removeEventListener('keydown', key);
      break;
    }
    case 'word': {
      const boxes = Array.from({ length: it.letters }, () => h('input', { type: 'text', maxlength: '1', 'aria-label': 'letter' }));
      boxes.forEach((b, i) => {
        b.addEventListener('input', () => {
          b.value = b.value.replace(/[^a-z]/gi, '').toUpperCase();
          if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
        });
        b.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
          if (e.key === 'Enter') submit(boxes.map((x) => x.value).join(''));
        });
      });
      put(body, 
        h('div', { class: 'wheels' }, boxes.map((b) => h('div', { class: 'wheel' }, b))),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn primary', on: { click: () => submit(boxes.map((x) => x.value).join('')) } }, 'Speak the word')),
      );
      setTimeout(() => boxes[0]?.focus(), 50);
      break;
    }
    case 'symbols': {
      const idx = new Array(it.slots).fill(0);
      const wheels = h('div', { class: 'wheels' });
      const render = () => {
        clear(wheels).append(
          ...idx.map((v, i) => {
            const g = GLYPHS[it.symbols[v]];
            return h('div', { class: 'wheel', style: 'min-width:80px' },
              h('button', { on: { click: () => ((idx[i] = (v + 1) % it.symbols.length), render(), audio.play('click')) } }, '▲'),
              h('div', { class: 'val', style: `color:${g.color}` }, g.char),
              h('div', { class: 'sub' }, g.name),
              h('button', { on: { click: () => ((idx[i] = (v - 1 + it.symbols.length) % it.symbols.length), render(), audio.play('click')) } }, '▼'),
            );
          }),
        );
      };
      render();
      put(body, wheels, h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn primary', on: { click: () => submit(idx.map((i) => it.symbols[i])) } }, 'Try the lock')));
      break;
    }
    case 'choice':
    case 'vote': {
      const isVote = it.type === 'vote';
      const grid = h('div', { class: 'options' });
      let myVote = '';
      const render = (st: StateView) => {
        const v = st.puzzles.find((x) => x.id === p.id);
        const total = Math.max(1, v?.needed ?? 1);
        clear(grid).append(
          ...it.options.map((o) =>
            h('button', {
              class: 'option' + (myVote === o.id ? ' sel' : ''),
              on: {
                click: () => {
                  audio.play('click');
                  if (isVote) {
                    myVote = o.id;
                    ctx.act(p.id, { kind: 'vote', option: o.id });
                  } else submit(o.id);
                },
              },
            },
              p.module === 'knots' ? knotIcon(o.id) : isVote ? h('span', { class: 'big' }, compassArrow(o.id)) : null,
              h('div', null, o.label),
              isVote ? h('small', null, `${v?.votes[o.id] ?? 0} vote(s)`) : null,
              isVote ? h('div', { class: 'vote-bar' }, h('div', { style: `width:${Math.min(100, ((v?.votes[o.id] ?? 0) / total) * 100)}%` })) : null,
            ),
          ),
        );
      };
      render(s);
      refreshBody = render;
      put(body, grid, isVote ? h('div', { class: 'faint' }, 'A heading is chosen once enough of the crew agree. Gather the evidence first!') : null);
      break;
    }
    case 'subset': {
      const chosen = new Set<string>();
      const grid = h('div', { class: 'options' });
      const render = () => {
        clear(grid).append(
          ...it.options.map((o) =>
            h('button', {
              class: 'option' + (chosen.has(o.id) ? ' sel' : ''),
              on: {
                click: () => {
                  chosen.has(o.id) ? chosen.delete(o.id) : chosen.add(o.id);
                  audio.play('click');
                  render();
                },
              },
            },
              h('span', { class: 'big', style: `color:${GLYPHS[o.id as SymbolId]?.color}` }, GLYPHS[o.id as SymbolId]?.char ?? '🛢'),
              h('div', null, o.label),
              h('small', { style: 'letter-spacing:1px', title: `${o.marks} notches` }, tally(o.marks)),
            ),
          ),
        );
      };
      render();
      put(body, grid, h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn primary', on: { click: () => submit([...chosen]) } }, `Roll ${'the chosen'} barrels onto the pan`)));
      break;
    }
    case 'sequence': {
      const dots = h('div', { class: 'progress-dots' });
      const render = (st: StateView) => {
        const v = st.puzzles.find((x) => x.id === p.id);
        clear(dots).append(...Array.from({ length: it.length }, (_, i) => h('span', { class: i < (v?.seq ?? 0) ? 'on' : '' })));
      };
      render(s);
      refreshBody = render;
      put(body, 
        dots,
        h('div', { class: 'options' },
          it.buttons.map((b) =>
            h('button', { class: 'option', on: { click: () => (audio.play('click'), ctx.act(p.id, { kind: 'press', button: b.id })) } },
              h('span', { class: 'big', style: `color:${GLYPHS[b.symbol].color}` }, GLYPHS[b.symbol].char),
              h('div', null, b.label),
              h('small', null, GLYPHS[b.symbol].colorName),
            ),
          ),
        ),
      );
      break;
    }
    case 'stations': {
      const dots = h('div', { class: 'progress-dots' });
      const render = (st: StateView) => {
        const v = st.puzzles.find((x) => x.id === p.id);
        clear(dots).append(...it.stations.map((_, i) => h('span', { class: i < (v?.seq ?? 0) ? 'on' : '' })));
      };
      render(s);
      refreshBody = render;
      put(body, 
        dots,
        h('div', { class: 'options' },
          it.stations.map((b) =>
            h('button', {
              class: 'option',
              on: {
                click: () => {
                  if (!ctx.nearCannon(p.id, b.id)) return panelStatus(p.id, `Stand at the ${b.label} to fire it.`, 'bad');
                  ctx.act(p.id, { kind: 'press', button: b.id });
                },
              },
            },
              h('span', { class: 'big', style: `color:${GLYPHS[b.symbol].color}` }, GLYPHS[b.symbol].char),
              h('div', null, `Fire ${b.label}`),
            ),
          ),
        ),
        h('div', { class: 'faint' }, 'Each gun can only be fired by someone standing at it. Click a gun on deck to fire it directly.'),
      );
      break;
    }
    case 'useItem': {
      const inv = (store.myView?.inventory ?? []).map((id) => store.scenario!.items.find((x) => x.id === id)!).filter(Boolean);
      put(body, 
        h('p', null, it.prompt),
        inv.length
          ? h('div', { class: 'options' },
              inv.map((item) =>
                h('button', { class: 'option', on: { click: () => ctx.act(p.id, { kind: 'useItem', item: item.id, itemKind: item.kind }) } }, h('span', { class: 'big' }, itemIcon(item.kind)), h('div', null, `Use ${item.name}`)),
              ),
            )
          : h('p', { class: 'muted' }, 'You are not carrying anything. Find the right object — or ask a crewmate to throw it to you.'),
      );
      break;
    }
    case 'sync': {
      const counter = h('div', { class: 'status', style: 'text-align:center' });
      const beat = h('div', { class: 'beat' }, '');
      const render = (st: StateView) => {
        const v = st.puzzles.find((x) => x.id === p.id);
        counter.textContent = `${v?.presses ?? 0} of ${v?.needed ?? it.needed} hands`;
      };
      render(s);
      refreshBody = render;
      const btn = h('button', { class: 'btn gold big-action', on: { click: () => (audio.play('heave'), ctx.act(p.id, { kind: 'sync' })) } }, it.verb);
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          e.preventDefault();
          btn.click();
        }
      };
      window.addEventListener('keydown', onKey);
      if (it.cycle) {
        let last = 0;
        beatTimer = window.setInterval(() => {
          const b = beatAt(net.serverNow(), it.cycle!);
          if (b !== last) {
            last = b;
            beat.textContent = String(b);
            beat.classList.add('pulse');
            audio.play('drum');
            setTimeout(() => beat.classList.remove('pulse'), 150);
          }
        }, 50);
      }
      put(body, it.cycle ? h('div', null, h('div', { class: 'faint', style: 'text-align:center' }, 'The drum beats'), beat) : null, h('div', { class: 'row', style: 'justify-content:center' }, btn), counter, h('div', { class: 'faint', style: 'text-align:center' }, 'Everyone press together (Space works too).'));
      cleanup = () => window.removeEventListener('keydown', onKey);
      break;
    }
    case 'gate':
      break;
  }

  const renderHints = (st: StateView) => {
    const mine = st.hints.filter((x) => x.puzzle === p.id);
    const v = st.puzzles.find((x) => x.id === p.id);
    clear(hintsBox).append(
      ...mine.map((x) => h('div', { class: 'h' }, x.text)),
      (v?.hintsShown ?? 0) < 3
        ? h('button', { class: 'btn small', on: { click: () => ctx.hint(p.id) } }, mine.length ? 'Ask for a stronger hint' : 'Ask for a hint')
        : h('div', { class: 'faint' }, 'All hints used for this one.'),
    );
    // Reveal clues attached to this puzzle (e.g. the repaired compass reading).
    const attached = store.scenario!.clues.filter((c) => c.attachedTo && st.revealedClues.includes(c.id) && p.requires.clues.includes(c.id));
    clear(reveals).append(...attached.map((c) => h('button', { class: 'btn small', on: { click: () => ctx.inspectClue(c.id) } }, `Look: ${c.title}`)));
    if (v?.solved) status.textContent = 'Solved!';
  };
  renderHints(s);

  const handle = openModal(
    [
      h('h2', null, p.name),
      h('div', { class: 'look' }, p.look),
      it.type !== 'useItem' && 'prompt' in it ? h('div', null, h('b', null, it.prompt)) : null,
      reveals,
      body,
      status,
      hintsBox,
    ],
    {
      puzzle: p.id,
      onClose: () => {
        clearInterval(beatTimer);
        cleanup?.();
      },
    },
  );
  handle.refresh = (st) => {
    refreshBody(st);
    renderHints(st);
    const v = view();
    if (v?.solved) {
      status.className = 'status good';
      status.textContent = 'Solved!';
      setTimeout(() => current?.puzzle === p.id && closeModal(), 1200);
    }
  };
  handle.status = (text, kind) => {
    status.className = `status ${kind}`;
    status.textContent = text;
  };
}

function tally(n: number): string {
  const groups = Math.floor(n / 5);
  return '卌 '.repeat(groups) + '|'.repeat(n % 5);
}

function compassArrow(id: string): string {
  return ({ N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' } as Record<string, string>)[id] ?? '•';
}

export function itemIcon(kind: ItemDef['kind']): string {
  return ({ rope: '🪢', needle: '🧭', lantern: '🏮', litLantern: '🔥', tinderbox: '🧰', key: '🗝', brassKey: '🔑', weight: '⚖' } as Record<string, string>)[kind] ?? '•';
}

function knotIcon(name: string): SVGElement {
  const paths: Record<string, string> = {
    [KNOTS[0]]: 'M5 35 C20 5, 40 5, 35 25 S 15 40, 30 20 L58 20',
    [KNOTS[1]]: 'M5 20 L20 20 C25 5, 35 5, 30 22 C25 38, 40 38, 40 20 L58 20 M28 5 L28 38',
    [KNOTS[2]]: 'M5 22 C20 2, 40 2, 32 22 C24 40, 10 30, 28 18 C42 10, 50 30, 58 22',
    [KNOTS[3]]: 'M5 15 C25 15, 30 30, 58 30 M5 30 C25 30, 30 15, 58 15',
    [KNOTS[4]]: 'M5 15 L35 15 C45 15, 45 32, 32 32 L20 32 M58 28 C40 28, 38 8, 50 8',
    [KNOTS[5]]: 'M5 22 L20 22 C10 8, 30 8, 32 22 C34 36, 54 36, 44 22 L58 22 M20 22 L44 22',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 44');
  svg.setAttribute('class', 'knot');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name] ?? 'M5 22 L58 22');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#d8b77a');
  path.setAttribute('stroke-width', '4');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

// ---------- clue reader ----------
export function openClue(c: ClueRead | { title: string; reason: string }) {
  if ('reason' in c) {
    openModal([h('h2', null, c.title), h('p', { class: 'muted' }, c.reason)]);
    return;
  }
  const content = c.content;
  openModal([
    h('h2', null, c.title),
    content.glyphs ? h('div', { class: 'glyph-row' }, content.glyphs.map((g) => h('div', { class: 'glyph-big' }, h('span', { style: `color:${GLYPHS[g].color};text-shadow:0 0 2px #000` }, GLYPHS[g].char), GLYPHS[g].name))) : null,
    h('pre', { class: 'clue-text' }, content.text),
    content.table
      ? h('table', null, h('tr', null, content.table[0].map((x) => h('th', null, x))), content.table.slice(1).map((r) => h('tr', null, r.map((x) => h('td', null, x)))))
      : null,
    h('div', { class: 'faint', style: 'margin-top:12px' }, 'Read it out to your crew — they cannot see it from where they are.'),
  ]);
}

// ---------- item inspector ----------
export function openInspect(item: ItemDef) {
  const canvas = h('canvas', { class: 'inspect', width: 560, height: 280 });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, 2, 0.01, 50);
  scene.add(new THREE.HemisphereLight('#fff3dd', '#2a1a0e', 1.4));
  const dl = new THREE.DirectionalLight('#ffffff', 1.5);
  dl.position.set(2, 3, 2);
  scene.add(dl);
  const mesh = buildItem(item.kind);
  const box = new THREE.Box3().setFromObject(mesh);
  const centre = box.getCenter(new THREE.Vector3());
  mesh.position.sub(centre);
  const pivot = new THREE.Group();
  pivot.add(mesh);
  scene.add(pivot);
  let dist = Math.max(0.5, box.getSize(new THREE.Vector3()).length() * 1.6);
  let rx = 0.4;
  let ry = 0.6;
  let drag: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => (drag = [e.clientX, e.clientY]));
  window.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ry += (e.clientX - drag[0]) * 0.01;
    rx += (e.clientY - drag[1]) * 0.01;
    drag = [e.clientX, e.clientY];
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = Math.max(0.2, Math.min(6, dist * (1 + e.deltaY * 0.001)));
  });
  let raf = 0;
  const loop = () => {
    pivot.rotation.set(rx, ry, 0);
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  loop();
  openModal([h('h2', null, item.name), canvas, h('p', null, item.desc), h('div', { class: 'faint' }, 'Drag to turn it over. Scroll to zoom.')], {
    onClose: () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  });
}

// ---------- hints ----------
export function openHints() {
  const s = store.state!;
  const scn = store.scenario!;
  const myArea = store.myView?.area;
  const avail = scn.puzzles
    .filter((p) => s.puzzles.find((v) => v.id === p.id)?.available)
    .sort((a, b) => Number(b.area === myArea) - Number(a.area === myArea));
  openModal([
    h('h2', null, 'Ask for a hint'),
    h('p', { class: 'muted' }, 'Hints arrive in-story — a note through the floorboards, or the parrot “remembering”. The whole crew sees them, and each one costs a little score.'),
    avail.length
      ? h('div', { class: 'col' },
          avail.map((p) => {
            const v = s.puzzles.find((x) => x.id === p.id)!;
            return h('div', { class: 'row' },
              h('div', { class: 'grow' }, h('b', null, p.name), h('div', { class: 'faint' }, `${ctx.areaName(p.area)} · ${v.hintsShown}/3 hints`)),
              h('button', { class: 'btn small', disabled: v.hintsShown >= 3, on: { click: () => (ctx.hint(p.id), closeModal()) } }, v.hintsShown ? 'Stronger hint' : 'Hint'),
            );
          }),
        )
      : h('p', null, 'Nothing is open to work on right now.'),
    s.hints.length ? h('div', { class: 'hints' }, h('b', null, 'Hints so far'), s.hints.slice(-8).map((x) => h('div', { class: 'h' }, x.text))) : null,
  ]);
}

// ---------- passing ----------
export function openPass(item: ItemDef) {
  const list = ctx.nearbyPlayers();
  openModal([
    h('h2', null, `Throw the ${item.name.toLowerCase()} to…`),
    list.length
      ? h('div', { class: 'col' },
          list.map((p) =>
            h('button', { class: 'btn', disabled: !p.inRange, on: { click: () => (ctx.pass(item.id, p.id), closeModal()) } }, `${p.name} — ${p.dist.toFixed(1)} m${p.inRange ? '' : ' (too far)'}`),
          ),
        )
      : h('p', null, 'Nobody else is aboard.'),
    h('div', { class: 'faint' }, 'Tip: select the item, then click a crewmate in the world to throw it.'),
  ]);
}

// ---------- settings & help ----------
export function openSettings() {
  const s = store.settings;
  const save = () => {
    store.saveSettings();
    document.documentElement.dataset.text = s.textSize;
    audio.applyVolumes();
    voice.applyTalk();
  };
  const slider = (label: string, key: 'master' | 'sfx' | 'voice') =>
    h('label', { class: 'row' }, h('span', { style: 'width:150px' }, label),
      h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]), on: { input: (e) => ((s[key] = Number((e.target as HTMLInputElement).value)), save()) } }),
    );
  const check = (label: string, key: 'speech' | 'pushToTalk' | 'invertLook') =>
    h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s[key], on: { change: (e) => ((s[key] = (e.target as HTMLInputElement).checked), save()) } }), label);
  openModal([
    h('h2', null, 'Settings'),
    h('div', { class: 'col' },
      h('label', { class: 'row' }, h('span', { style: 'width:150px' }, 'Text size'),
        h('select', { on: { change: (e) => ((s.textSize = (e.target as HTMLSelectElement).value as typeof s.textSize), save()) } },
          (['small', 'medium', 'large'] as const).map((v) => h('option', { value: v, selected: s.textSize === v }, v)),
        ),
      ),
      h('label', { class: 'row' }, h('span', { style: 'width:150px' }, 'Brightness'),
        h('input', { type: 'range', min: '0.7', max: '1.8', step: '0.05', value: String(s.brightness), on: { input: (e) => ((s.brightness = Number((e.target as HTMLInputElement).value)), save()) } }),
      ),
      slider('Master volume', 'master'),
      slider('Sound effects', 'sfx'),
      slider('Crew voices', 'voice'),
      check('Read captain & parrot lines aloud (subtitles always on)', 'speech'),
      check('Push-to-talk (hold V) instead of open mic', 'pushToTalk'),
      check('Invert mouse look', 'invertLook'),
    ),
  ]);
}

export function openHelp() {
  const role = store.myRole;
  openModal([
    h('h2', null, 'How to play'),
    h('p', null, h('b', null, `Your role: ${ROLE_INFO[role].name}. `), ROLE_INFO[role].blurb),
    h('table', null,
      [
        ['Move', 'W A S D (Shift to hurry)'],
        ['Look', 'Drag the mouse, or Q / E and arrow keys'],
        ['Interact', 'Click glinting things: pick up, read, work locks'],
        ['Inventory', '1–6 select · I inspect · G drop'],
        ['Use an item', 'Select it, then click the lock or contraption'],
        ['Throw to a crewmate', 'Select an item, then click them (or use ⇄ on the slot)'],
        ['Combine', 'Select one item, then ⊕ on another'],
        ['Hint', 'H'],
        ['Chat', 'Enter'],
        ['Mute mic', 'M · Push-to-talk: hold V (in settings)'],
        ['Captain’s bell', 'Hold B to speak to the whole crew (Captain only)'],
        ['Close panel / settings', 'Esc'],
      ].map(([a, b]) => h('tr', null, h('td', null, h('b', null, a)), h('td', null, b))),
    ),
    h('p', { class: 'muted', style: 'margin-top:10px' }, 'Everyone must reach the lifeboat to escape. Rising water is the clock — wrong answers let more in.'),
  ]);
}
