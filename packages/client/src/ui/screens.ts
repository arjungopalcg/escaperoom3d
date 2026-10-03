// Home, lobby and results screens.
import { EPILOGUES, layoutFor, MAX_PLAYERS, type Results } from '@crimson/engine';
import { LOCAL_MODE, net } from '../net.ts';
import { store } from '../store.ts';
import { voice } from '../voice.ts';
import { audio } from '../audio.ts';
import { clear, fmtTime, h } from './dom.ts';
import { openSettings } from './panels.ts';

const root = () => document.getElementById('screens')!;

function show(el: HTMLElement) {
  const r = root();
  clear(r);
  r.classList.remove('hidden');
  r.append(el);
}

export function hideScreens() {
  root().classList.add('hidden');
}

export function rememberedName(): string {
  try {
    return localStorage.getItem('crimson-gull-name') ?? '';
  } catch {
    return '';
  }
}
function rememberName(n: string) {
  try {
    localStorage.setItem('crimson-gull-name', n);
  } catch {
    /* ignore */
  }
}

// ---------- Home ----------
export function showHome(opts: { room?: string; error?: string; onCreate: (name: string) => void; onJoin: (code: string, name: string) => void }) {
  const name = h('input', { type: 'text', placeholder: 'Your pirate name', maxlength: '20', value: rememberedName(), autocomplete: 'nickname' });
  const code = h('input', { type: 'text', placeholder: 'Ship code', maxlength: '6', style: 'width:130px;text-transform:uppercase', value: opts.room ?? '' });
  const err = h('div', { class: 'error' }, opts.error ?? '');
  const getName = () => {
    const n = name.value.trim();
    if (!n) {
      err.textContent = 'Pick a name first, sailor.';
      name.focus();
      return null;
    }
    rememberName(n);
    return n;
  };
  const join = () => {
    const n = getName();
    const c = code.value.trim().toUpperCase();
    if (!n) return;
    if (c.length < 4) {
      err.textContent = 'Enter the ship code from your invite link.';
      return;
    }
    opts.onJoin(c, n);
  };
  const create = () => {
    const n = getName();
    if (n) opts.onCreate(n);
  };
  name.addEventListener('keydown', (e) => e.key === 'Enter' && (opts.room ? join() : create()));
  code.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  show(
    h(
      'div',
      { class: 'card' },
      h('h1', { class: 'title' }, 'Crimson Gull'),
      h('div', { class: 'tagline' }, '“Every crew gets a different ship.”'),
      h(
        'p',
        { class: 'muted' },
        'Your crew mutinied against Captain Blackwater — and lost. Now you are locked in cages in his flooding hold. ',
        'Talk, pass objects between cages and solve linked puzzles before the water — or the Isle of Bones — claims you. ',
      ),
      LOCAL_MODE
        ? h('p', { class: 'chip', style: 'display:block;border-radius:8px;padding:8px 12px' }, 'Solo preview: this page runs the whole game in your browser for one player, in practice mode (cage bars don’t block you). The full game is multiplayer for 4–15 players with voice chat.')
        : h('p', { class: 'faint' }, `4–${MAX_PLAYERS} players · about 45 minutes · voice built in · no install, no account`),
      h('div', { class: 'col', style: 'margin-top:14px' },
        name,
        opts.room
          ? h('button', { class: 'btn primary', on: { click: join } }, `Board ship ${opts.room}`)
          : h('button', { class: 'btn primary', on: { click: create } }, LOCAL_MODE ? 'Start the solo preview' : 'Launch a new ship (host)'),
        LOCAL_MODE ? null : h('div', { class: 'row' }, h('span', { class: 'muted' }, opts.room ? 'Different ship?' : 'Have a code?'), code, h('button', { class: 'btn', on: { click: join } }, 'Join')),
        err,
      ),
    ),
  );
  (opts.room ? name : name).focus();
}

// ---------- Lobby ----------
const TUTORIAL = [
  { icon: '✋', title: 'Pick up', text: 'Walk with WASD, drag the mouse to look. Things you can use glint. Click a glinting object to pick it up.' },
  { icon: '🔍', title: 'Inspect', text: 'Click notes, carvings and charts to read them. In your inventory, press 🔍 to turn an item over (drag to rotate, scroll to zoom).' },
  { icon: '🔑', title: 'Use', text: 'Click a lock or contraption to work it. To use an item on something, select it in your inventory (1–6) and click the target.' },
  { icon: '🤝', title: 'Pass', text: 'Select an item, then click a crewmate to throw it to them — even into another cage. Talk! Each cage holds what another needs.' },
];

let lobbyTimer: number | undefined;

export function showLobby(onStart: (practice: boolean) => void) {
  clearInterval(lobbyTimer);
  const L = store.lobby;
  if (!L) return;
  const link = `${location.origin}${location.pathname}?room=${L.room}`;
  const n = L.players.filter((p) => p.connected).length;
  const host = L.players.find((p) => p.isHost);
  const isHost = store.isHost();
  const ok = n >= L.minPlayers && n <= L.maxPlayers;
  const layout = layoutFor(Math.max(4, n));
  const copyBtn = h('button', { class: 'btn small', on: { click: () => navigator.clipboard?.writeText(link).then(() => (copyBtn.textContent = 'Copied!')) } }, 'Copy invite link');

  const meter = h('div', { class: 'meter' }, h('div'));
  const micBtn = h(
    'button',
    {
      class: 'btn small' + (voice.local ? ' on' : ''),
      on: {
        click: async () => {
          audio.ensure();
          const got = await voice.enableMic();
          micBtn.textContent = got ? 'Microphone on ✓' : 'Mic blocked — text chat still works';
          micBtn.classList.toggle('on', got);
        },
      },
    },
    voice.local ? 'Microphone on ✓' : 'Enable microphone',
  );

  let step = 0;
  const tut = h('div', { class: 'tutorial' });
  const renderTut = () => {
    const t = TUTORIAL[step % TUTORIAL.length];
    clear(tut).append(
      h('div', { class: 'step' }, h('div', { class: 'icon' }, t.icon), h('div', null, h('h3', null, `${(step % 4) + 1}. ${t.title}`), h('div', { class: 'muted' }, t.text))),
      h('div', { class: 'dots' }, TUTORIAL.map((_, i) => h('span', { class: i === step % 4 ? 'on' : '' }))),
    );
  };
  renderTut();
  tut.addEventListener('click', () => {
    step++;
    renderTut();
  });

  const players = h(
    'ul',
    { class: 'plist' },
    L.players.map((p) =>
      h(
        'li',
        null,
        h('span', { class: 'dot', style: `background:${p.color}` }),
        h('span', { class: 'grow' }, p.name, p.id === store.me ? h('span', { class: 'faint' }, ' (you)') : null),
        p.isHost ? h('span', { class: 'chip', title: 'Host' }, '⚓ host') : null,
        h('span', { class: 'chip', title: p.micOk ? 'Microphone ready' : 'No microphone yet' }, p.micOk ? '🎙 ready' : '🎙 —'),
        h('span', { class: 'speak dot', 'data-id': p.id, style: 'background:#333' }),
      ),
    ),
  );

  const chatLog = h('div', { class: 'log', style: 'max-height:140px' });
  const chatIn = h('input', { type: 'text', placeholder: 'Say something to the crew… (Enter)', maxlength: '300' });
  chatIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatIn.value.trim()) {
      net.send({ t: 'chat', text: chatIn.value });
      chatIn.value = '';
    }
  });
  lobbyChat = chatLog;
  for (const m of lobbyMessages) chatLog.append(m.cloneNode(true));

  show(
    h(
      'div',
      { class: 'card wide' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', null, h('h1', { class: 'title', style: 'font-size:40px' }, 'Crimson Gull'), h('div', { class: 'tagline', style: 'margin:0' }, 'The Brig of the Crimson Gull')),
        h('div', { style: 'text-align:right' }, h('div', { class: 'faint' }, 'Ship code'), h('div', { class: 'code' }, L.room), LOCAL_MODE ? null : copyBtn),
      ),
      h('div', { class: 'grid2', style: 'margin-top:16px' },
        h('div', { class: 'col' },
          h('h3', null, `Crew (${n}/${MAX_PLAYERS})`),
          players,
          LOCAL_MODE ? null : h('div', { class: 'faint' }, n < L.minPlayers ? `Waiting for at least ${L.minPlayers} sailors. Share the invite link.` : `With ${n} aboard: ${layout.cages} cages, ${layout.crewLabel.toLowerCase()} crew, Act 2 is ${layout.act2 === 'chain' ? 'one linked chain' : layout.act2 === 'split' ? 'a chain with a short split' : 'parallel missions'}.`),
          LOCAL_MODE
            ? h('div', { class: 'row' }, h('button', { class: 'btn primary', on: { click: () => onStart(true) } }, 'Set sail (solo practice run)'))
            : isHost
            ? h('div', { class: 'row' },
                h('button', { class: 'btn primary', disabled: !ok, on: { click: () => onStart(false) } }, 'Set sail (start the run)'),
                h('button', { class: 'btn small', title: 'Any number of players; cage bars do not block you; not on the leaderboard', on: { click: () => onStart(true) } }, 'Practice run'),
              )
            : h('div', { class: 'muted' }, `Waiting for ${host?.name ?? 'the host'} to set sail…`),
          h('h3', { style: 'margin-top:8px' }, 'Lobby chat'),
          chatLog,
          chatIn,
        ),
        h('div', { class: 'col' },
          h('h3', null, 'Mic check'),
          h('div', { class: 'row' }, micBtn, h('button', { class: 'btn small', on: { click: () => openSettings() } }, 'Settings')),
          meter,
          h('div', { class: 'faint' }, 'Proximity voice: you hear crewmates near you clearly; distant ones fade. Text chat works without a mic.'),
          h('h3', { style: 'margin-top:8px' }, '30-second tutorial'),
          tut,
          h('div', { class: 'faint' }, 'Click the card for the next tip.'),
        ),
      ),
    ),
  );
  const bar = meter.firstElementChild as HTMLElement;
  let tick = 0;
  lobbyTimer = window.setInterval(() => {
    bar.style.width = `${Math.round(voice.localLevel() * 100)}%`;
    if (++tick % 70 === 0) {
      step++;
      renderTut();
    }
    for (const el of document.querySelectorAll<HTMLElement>('.plist .speak')) {
      const id = el.dataset.id!;
      const lvl = id === store.me ? voice.localLevel() : voice.peerLevel(id);
      el.style.background = lvl > 0.08 ? 'var(--ok)' : '#333';
    }
    voice.update();
  }, 100);
}

let lobbyChat: HTMLElement | undefined;
const lobbyMessages: HTMLElement[] = [];
export function lobbyChatMessage(name: string, text: string) {
  const m = h('div', { class: 'm' }, h('b', null, name + ': '), text);
  lobbyMessages.push(m);
  if (lobbyMessages.length > 50) lobbyMessages.shift();
  if (lobbyChat?.isConnected) {
    lobbyChat.append(m.cloneNode(true));
    lobbyChat.scrollTop = lobbyChat.scrollHeight;
  }
}

export function stopLobby() {
  clearInterval(lobbyTimer);
}

// ---------- Results ----------
const ENDINGS = {
  escape: { title: 'Full escape!', text: 'Every sailor made it into the lifeboat. Behind you, the Crimson Gull groans and slips beneath the waves — with Blackwater shaking his fist at the rail.' },
  treasure: { title: 'Escape with the treasure!', text: 'The whole crew rows away from the sinking Crimson Gull — and the captain’s gold rows with you. Blackwater’s howl carries over the storm.' },
  lost: { title: 'Lost at sea', text: 'The water closed over the hold. The storm keeps its secrets — this time.' },
};

export function showResults(r: Results, onPlayAgain: () => void) {
  stopLobby();
  const e = ENDINGS[r.ending];
  const isHost = store.isHost();
  const share = drawShareCard(r);
  const shareText = `⚓ Crimson Gull — ${e.title} ${r.crew} (${r.players} players) in ${fmtTime(r.timeMs)} with ${r.hintsUsed} hint${r.hintsUsed === 1 ? '' : 's'}. Score ${r.score}. Every crew gets a different ship — run #${r.seed}.`;
  const copy = h('button', { class: 'btn small', on: { click: () => navigator.clipboard?.writeText(shareText).then(() => (copy.textContent = 'Copied!')) } }, 'Copy result text');
  const dl = h('button', {
    class: 'btn small',
    on: {
      click: () => {
        const a = h('a', { href: share.toDataURL('image/png'), download: 'crimson-gull-result.png' });
        a.click();
      },
    },
  }, 'Download card');
  show(
    h(
      'div',
      { class: 'card wide' },
      h('div', { class: 'faint' }, r.practice ? 'Practice run — not on the leaderboard' : `${r.crew} · ${r.players} players`),
      endingVideo(r.ending),
      h('h1', { class: `ending ${r.ending}` }, e.title),
      h('p', { class: 'muted' }, EPILOGUES[r.ending]),
      h('div', { class: 'stats' },
        stat('Time', fmtTime(r.timeMs)),
        stat('Score', r.score),
        stat('Hints', r.hintsUsed),
        stat('Act reached', `${r.actReached}/4`),
        stat('Puzzles', `${r.solvedCount}/${r.totalCount}`),
      ),
      h('div', { class: 'grid2' },
        h('div', { class: 'col' },
          h('h3', null, 'The captain’s secret'),
          h('p', null, r.secret.summary),
          h('h3', null, 'Highlights'),
          h('ul', null, r.highlights.map((x) => h('li', null, x))),
          h('h3', null, `Leaderboard · ${r.band} players`),
          r.leaderboard.length
            ? h('table', { class: 'board' },
                h('tr', null, h('th', null, '#'), h('th', null, 'Crew'), h('th', null, 'Ending'), h('th', null, 'Time'), h('th', null, 'Score')),
                r.leaderboard.map((l, i) =>
                  h('tr', { class: l.crew === r.crew && l.score === r.score ? 'me' : '' }, h('td', null, i + 1), h('td', null, l.crew), h('td', null, l.ending), h('td', null, fmtTime(l.timeMs)), h('td', null, l.score)),
                ),
              )
            : h('p', { class: 'faint' }, 'No scores yet in this band.'),
        ),
        h('div', { class: 'col' },
          h('h3', null, 'Share with the group chat'),
          share,
          h('div', { class: 'row' }, copy, LOCAL_MODE ? null : dl),
          h('div', { style: 'margin-top:10px' },
            isHost
              ? h('button', { class: 'btn primary', on: { click: onPlayAgain } }, 'Play again — new ship, same crew')
              : h('div', { class: 'muted' }, 'The host can start a new run with the same crew.'),
          ),
        ),
      ),
    ),
  );
}

/** Plays media/ending-<ending>.mp4 if it exists; otherwise the narrator reads the epilogue. */
function endingVideo(ending: Results['ending']): HTMLVideoElement {
  const v = h('video', { class: 'ending-video hidden', playsinline: true, controls: true, preload: 'auto' }) as HTMLVideoElement;
  v.src = `media/ending-${ending}.mp4`;
  v.addEventListener('loadeddata', () => {
    v.classList.remove('hidden');
    void v.play().catch(() => {});
  });
  v.addEventListener('error', () => audio.speak(EPILOGUES[ending], 'narrator'), { once: true });
  return v;
}

function stat(label: string, v: string | number) {
  return h('div', { class: 'stat' }, h('b', null, String(v)), label);
}

function drawShareCard(r: Results): HTMLCanvasElement {
  const c = h('canvas', { class: 'share', width: 840, height: 440 });
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 440);
  grad.addColorStop(0, '#2a1a10');
  grad.addColorStop(1, '#0b0d10');
  g.fillStyle = grad;
  g.fillRect(0, 0, 840, 440);
  g.strokeStyle = '#f2b84b';
  g.lineWidth = 4;
  g.strokeRect(14, 14, 812, 412);
  g.fillStyle = '#f6e2b5';
  g.font = '56px Georgia, serif';
  g.fillText('Crimson Gull', 44, 90);
  g.font = 'italic 24px Georgia, serif';
  g.fillStyle = '#f2b84b';
  g.fillText('Every crew gets a different ship.', 46, 128);
  g.font = '44px Georgia, serif';
  g.fillStyle = r.ending === 'lost' ? '#ff8f6b' : r.ending === 'treasure' ? '#f2c94c' : '#9be3a7';
  g.fillText(ENDINGS[r.ending].title, 44, 210);
  g.fillStyle = '#f3e9d2';
  g.font = '26px system-ui, sans-serif';
  g.fillText(`${r.crew} · ${r.players} players`, 46, 260);
  g.fillText(`Time ${fmtTime(r.timeMs)}   ·   Hints ${r.hintsUsed}   ·   Score ${r.score}`, 46, 305);
  g.fillStyle = '#c9b994';
  g.font = '20px system-ui, sans-serif';
  wrap(g, r.secret.summary, 46, 352, 750, 26);
  g.fillText(`Run #${r.seed}`, 690, 410);
  return c;
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > max && line) {
      g.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}
