// In-game heads-up display.
import { ROLE_INFO, type ItemDef, type PublicScenario, type StateView } from '@crimson/engine';
import { store } from '../store.ts';
import { voice } from '../voice.ts';
import { clear, fmtTime, h } from './dom.ts';
import { itemIcon } from './panels.ts';

const ACT_TITLES = ['', 'Act 1 · Break the cages', 'Act 2 · The hold', "Act 3 · The captain's quarters", 'Act 4 · Take the ship'];
const ROLE_ICON: Record<string, string> = { captain: '🔔', navigator: '🧭', quartermaster: '📦', bosun: '💪', lookout: '🔭', deckhand: '⚓' };

export interface HudActions {
  select(index: number): void;
  inspect(item: ItemDef): void;
  drop(item: ItemDef): void;
  pass(item: ItemDef): void;
  combine(a: ItemDef, b: ItemDef): void;
  chat(text: string): void;
  hints(): void;
  settings(): void;
  help(): void;
  toggleMic(): void;
  areaName(area: string): string;
}

export class Hud {
  root = h('div', { id: 'hud' });
  private actBanner = h('div', { class: 'act-banner' });
  private timer = h('div', { class: 'timer' });
  private timerText = h('span');
  private gauge = h('div', { class: 'water-gauge', title: 'Water in the hold' }, h('div'));
  private objectives = h('div', { class: 'objectives' });
  private crew = h('div', { class: 'crew' });
  private inventory = h('div', { class: 'inventory' });
  private log = h('div', { class: 'log', 'aria-live': 'polite' });
  private chatIn = h('input', { type: 'text', placeholder: 'Press Enter to chat…', maxlength: '300' });
  private toasts = h('div', { class: 'toasts' });
  private subtitle = h('div', { class: 'subtitle hidden' });
  private tooltip = h('div', { class: 'tooltip hidden' });
  private tools = h('div', { class: 'tools' });
  private micBtn: HTMLButtonElement;
  private bellBtn: HTMLButtonElement;
  private conn = h('div', { class: 'banner-conn hidden' }, 'Connection lost — reconnecting to the ship…');
  selected = -1;
  private subTimer?: number;
  private lastSecond = -1;
  private crewKey = '';

  constructor(
    private scn: PublicScenario,
    private actions: HudActions,
  ) {
    this.timer.append('🌊', this.timerText, this.gauge);
    this.micBtn = h('button', { class: 'btn small', title: 'Mute / unmute (M)', on: { click: () => actions.toggleMic() } }, '🎙');
    this.bellBtn = h('button', { class: 'btn small hidden', title: 'Hold B (or this button) to ring the ship’s bell and speak to everyone' }, '🔔 Bell');
    this.tools.append(
      h('button', { class: 'btn small gold', title: 'Hint (H)', on: { click: () => actions.hints() } }, '💡 Hint'),
      this.micBtn,
      this.bellBtn,
      h('button', { class: 'btn small', title: 'Settings (Esc)', on: { click: () => actions.settings() } }, '⚙'),
      h('button', { class: 'btn small', title: 'Help (F1)', on: { click: () => actions.help() } }, '?'),
    );
    this.chatIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        if (this.chatIn.value.trim()) actions.chat(this.chatIn.value);
        this.chatIn.value = '';
        this.chatIn.blur();
      } else if (e.key === 'Escape') this.chatIn.blur();
    });
    this.root.append(
      h('div', { class: 'hud-top' }, this.actBanner, this.timer),
      this.objectives,
      this.crew,
      this.toasts,
      this.subtitle,
      h('div', { class: 'chat' }, this.log, this.chatIn),
      this.inventory,
      this.tools,
      h('div', { class: 'crosshair' }),
      this.tooltip,
      this.conn,
    );
    document.body.append(this.root);
  }

  bellButton(): HTMLButtonElement {
    return this.bellBtn;
  }

  destroy() {
    this.root.remove();
  }

  focusChat() {
    this.chatIn.focus();
  }

  setConnected(ok: boolean) {
    this.conn.classList.toggle('hidden', ok);
  }

  // ---------- per-frame ----------
  tick(serverNow: number, s: StateView) {
    if (serverNow < s.startedAt) {
      this.timerText.textContent = `Storm hits in ${fmtTime(s.startedAt - serverNow)}`;
      this.lastSecond = -1;
      return;
    }
    const remaining = s.endsAt - serverNow;
    const sec = Math.ceil(remaining / 1000);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.timerText.textContent = fmtTime(remaining);
      this.timer.classList.toggle('danger', remaining < 5 * 60_000);
      const frac = Math.min(1, Math.max(0, (serverNow - s.startedAt) / Math.max(1, s.endsAt - s.startedAt)));
      (this.gauge.firstElementChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    }
    // Speaking dots.
    for (const el of this.crew.querySelectorAll<HTMLElement>('.speak')) {
      const id = el.dataset.id!;
      const lvl = id === store.me ? (voice.talking ? voice.localLevel() : 0) : voice.peerLevel(id);
      el.classList.toggle('on', lvl > 0.08);
    }
    this.micBtn.textContent = !voice.local ? '🎙✕' : voice.micMuted ? '🔇' : store.settings.pushToTalk ? (voice.pttHeld ? '🎙 talking' : '🎙 hold V') : '🎙';
  }

  // ---------- state ----------
  render(s: StateView) {
    this.actBanner.textContent = ACT_TITLES[s.act] + (s.practice ? ' · practice' : '');
    this.renderObjectives(s);
    this.renderCrew(s);
    this.renderInventory(s);
    this.bellBtn.classList.toggle('hidden', store.myRole !== 'captain');
  }

  private renderObjectives(s: StateView) {
    const solved = new Set(s.solved);
    const scn = this.scn;
    const items: [string, boolean][] = [];
    let title = '';
    if (s.act === 1) {
      title = 'Break out — every cage holds something another cage needs.';
      for (const c of scn.cages) items.push([`${c.name} (${c.colorName})`, s.cagesOpen.includes(c.index)]);
    } else if (s.act === 2) {
      title = 'The hold is flooding faster. Finish every mission to reach the quarters.';
      for (const m of scn.missions) items.push([m.name, m.puzzles.every((p) => solved.has(p))]);
    } else if (s.act === 3) {
      title = "Search Blackwater's quarters. Open his sea chest.";
      items.push(['Open the sea chest', solved.has(scn.gates.act4)]);
      items.push(['(Optional) Uncover the captain’s secret', false]);
    } else {
      title = 'Take the ship and get everyone to the lifeboat.';
      for (const p of scn.puzzles.filter((p) => p.act === 4 && !p.auto && p.id !== scn.treasurePuzzle)) items.push([p.name, solved.has(p.id)]);
      items.push([`Everyone in the boat (${s.boarded.length}/${s.players.filter((p) => p.connected).length})`, false]);
      items.push(['(Optional) Find the captain’s gold', s.treasure]);
    }
    const role = store.myRole;
    clear(this.objectives).append(
      h('b', null, title),
      h('ul', null, items.map(([t, done]) => h('li', { class: done ? 'done' : '' }, done ? '✔ ' : '○ ', t))),
      h('div', { class: 'role-chip' }, `${ROLE_ICON[role]} You are the ${ROLE_INFO[role].name}. `, h('span', { class: 'faint' }, ROLE_INFO[role].blurb)),
    );
  }

  private renderCrew(s: StateView) {
    const key = s.players.map((p) => `${p.id}${p.connected}${p.area}${p.boarded}`).join('|');
    if (key === this.crewKey) return;
    this.crewKey = key;
    clear(this.crew).append(
      h('b', null, `Crew (${s.players.filter((p) => p.connected).length})`),
      ...s.players.map((p) => {
        const pref = voice.prefs.get(p.id) ?? { volume: 1, muted: false };
        const me = p.id === store.me;
        return h('div', { class: 'p' + (p.connected ? '' : ' off'), title: `${ROLE_INFO[p.role].name} · ${this.actions.areaName(p.area)}` },
          h('span', { class: 'speak', 'data-id': p.id }),
          h('span', { class: 'dot', style: `background:${p.color}` }),
          h('span', { title: ROLE_INFO[p.role].name }, ROLE_ICON[p.role]),
          h('span', { class: 'name' }, p.name + (me ? ' (you)' : ''), p.boarded ? ' 🚣' : '', !p.connected ? ' (lost)' : ''),
          me
            ? null
            : [
                h('input', {
                  type: 'range', min: '0', max: '1.5', step: '0.1', value: String(pref.volume), title: 'Volume',
                  on: { input: (e) => voice.prefs.set(p.id, { ...pref, volume: Number((e.target as HTMLInputElement).value) }) },
                }),
                h('button', {
                  class: 'iconbtn', title: pref.muted ? 'Unmute' : 'Mute',
                  on: {
                    click: (e) => {
                      const cur = voice.prefs.get(p.id) ?? { volume: 1, muted: false };
                      voice.prefs.set(p.id, { ...cur, muted: !cur.muted });
                      (e.target as HTMLElement).textContent = !cur.muted ? '🔇' : '🔈';
                    },
                  },
                }, pref.muted ? '🔇' : '🔈'),
              ],
        );
      }),
    );
  }

  private renderInventory(s: StateView) {
    const me = s.players.find((p) => p.id === store.me);
    const inv = (me?.inventory ?? []).map((id) => this.scn.items.find((i) => i.id === id)!).filter(Boolean);
    const cap = store.myRole === 'quartermaster' ? 6 : 3;
    if (this.selected >= inv.length) this.selected = -1;
    const selItem = this.selected >= 0 ? inv[this.selected] : undefined;
    clear(this.inventory).append(
      ...Array.from({ length: cap }, (_, i) => {
        const it = inv[i];
        if (!it) return h('div', { class: 'slot' }, h('span', { class: 'key' }, i + 1), h('span', { class: 'faint' }, 'empty'));
        return h('div', { class: 'slot' + (i === this.selected ? ' sel' : ''), title: it.desc, on: { click: () => this.actions.select(i) } },
          h('span', { class: 'key' }, i + 1),
          h('span', { class: 'glyph' }, itemIcon(it.kind)),
          it.name,
          h('div', { class: 'acts' },
            h('button', { class: 'btn small', title: 'Inspect (I)', on: { click: (e) => (e.stopPropagation(), this.actions.inspect(it)) } }, '🔍'),
            h('button', { class: 'btn small', title: 'Throw to a crewmate', on: { click: (e) => (e.stopPropagation(), this.actions.pass(it)) } }, '⇄'),
            selItem && selItem !== it ? h('button', { class: 'btn small', title: `Combine with ${selItem.name}`, on: { click: (e) => (e.stopPropagation(), this.actions.combine(selItem, it)) } }, '⊕') : null,
            h('button', { class: 'btn small', title: 'Drop (G)', on: { click: (e) => (e.stopPropagation(), this.actions.drop(it)) } }, '✋'),
          ),
        );
      }),
    );
  }

  selectedItem(): ItemDef | undefined {
    const me = store.myView;
    const id = me?.inventory[this.selected];
    return id ? this.scn.items.find((i) => i.id === id) : undefined;
  }

  // ---------- messages ----------
  toast(text: string, kind = '', ms = 4500) {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), ms);
  }

  addLog(text: string, kind = 'event', who?: string, broadcast = false) {
    const m = h('div', { class: `m ${kind}${broadcast ? ' bc' : ''}` }, who ? h('b', null, (broadcast ? '📣 ' : '') + who + ': ') : null, text);
    this.log.append(m);
    while (this.log.children.length > 80) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  showSubtitle(who: string, text: string) {
    clear(this.subtitle).append(h('b', null, who + ': '), text);
    this.subtitle.classList.remove('hidden');
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => this.subtitle.classList.add('hidden'), Math.max(4000, text.length * 70));
  }

  showTooltip(lines: (string | HTMLElement)[] | null, x: number, y: number) {
    if (!lines) {
      this.tooltip.classList.add('hidden');
      return;
    }
    clear(this.tooltip).append(...lines.map((l) => (typeof l === 'string' ? h('div', null, l) : l)));
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.classList.remove('hidden');
  }
}
