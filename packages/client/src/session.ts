// One run in the browser: world + controls + HUD, driven by server messages.
import * as THREE from 'three';
import { AREA_NAMES, PARROT_CHATTER, PASS_RANGE, ROLE_INFO, type AreaId, type ServerMsg, type StateView } from '@crimson/engine';
import { audio } from './audio.ts';
import { Controls, isTyping } from './controls.ts';
import { net } from './net.ts';
import { store } from './store.ts';
import { Hud } from './ui/hud.ts';
import {
  closeModal,
  modalOpen,
  openClue,
  openHelp,
  openHints,
  openInspect,
  openPass,
  openPuzzle,
  openSettings,
  panelStatus,
  refreshPanel,
  setPanelContext,
} from './ui/panels.ts';
import { voice } from './voice.ts';
import { DECK, cageGeoms, cageSpawn } from './world/layout.ts';
import { World, type PickTarget } from './world/scene.ts';

export class Session {
  world: World;
  controls: Controls;
  hud: Hud;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private last = performance.now();
  private lastSent = 0;
  private lastSentKey = '';
  private positioned = false;
  private lightningAt = 0;
  private glintAt = 0;
  private disposed = false;
  private keyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private keyUp = (e: KeyboardEvent) => this.onKey(e, false);

  constructor() {
    const scn = store.scenario!;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'world';
    document.body.prepend(this.canvas);
    this.world = new World(this.canvas);
    this.world.build(scn);
    this.controls = new Controls(this.world, this.canvas);
    this.hud = new Hud(scn, {
      select: (i) => {
        this.hud.selected = this.hud.selected === i ? -1 : i;
        this.renderState();
      },
      inspect: (it) => openInspect(it),
      drop: (it) => {
        const fwd = new THREE.Vector3(-Math.sin(this.controls.yaw), 0, -Math.cos(this.controls.yaw)).multiplyScalar(0.8);
        const p = this.controls.pos.clone().add(fwd);
        net.send({ t: 'drop', item: it.id, pos: [p.x, this.controls.pos.y + 0.05, p.z] });
        this.hud.selected = -1;
      },
      pass: (it) => openPass(it),
      combine: (a, b) => net.send({ t: 'combine', a: a.id, b: b.id }),
      chat: (text) => net.send({ t: 'chat', text }),
      hints: () => openHints(),
      settings: () => openSettings(),
      help: () => openHelp(),
      toggleMic: () => this.toggleMic(),
      areaName: (a) => areaName(a),
    });
    setPanelContext({
      act: (puzzle, action) => net.send({ t: 'act', puzzle, action }),
      inspectClue: (id) => net.send({ t: 'inspect', clue: id }),
      hint: (puzzle) => net.send({ t: 'hint', puzzle }),
      pass: (item, to) => net.send({ t: 'pass', item, to }),
      nearbyPlayers: () => this.nearbyPlayers(),
      nearCannon: (puzzle, button) => this.nearCannon(puzzle, button),
      areaName,
      onModal: (open) => {
        this.controls.enabled = !open;
      },
    });
    const bell = this.hud.bellButton();
    bell.addEventListener('pointerdown', () => net.send({ t: 'bell', on: true }));
    bell.addEventListener('pointerup', () => net.send({ t: 'bell', on: false }));
    bell.addEventListener('pointerleave', () => net.send({ t: 'bell', on: false }));
    this.controls.onClick = (t) => this.click(t);
    this.controls.onHover = (t, x, y) => this.hover(t, x, y);
    voice.proximity = (id) => this.proximity(id);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    this.spawn();
    audio.ensure();
    audio.startAmbience();
    this.loop();
    const role = store.myRole;
    this.hud.toast(`You are the ${ROLE_INFO[role].name}. ${ROLE_INFO[role].blurb}`, '', 9000);
    this.hud.addLog('Press F1 for controls. Talk to your crew — every cage holds something another needs.', 'event');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    closeModal();
    this.hud.destroy();
    this.world.renderer.dispose();
    this.canvas.remove();
    audio.stopAmbience();
  }

  private spawn() {
    const cage = store.spawn[store.me] ?? 0;
    const geoms = cageGeoms(store.scenario!.layout.cages);
    const mates = Object.entries(store.spawn).filter(([, c]) => c === cage).map(([id]) => id).sort();
    const [x, z] = cageSpawn(geoms[cage], Math.max(0, mates.indexOf(store.me)));
    this.controls.setPosition(x, 0, z, geoms[cage].yaw);
    // A rejoining player is placed where the server last saw them (see onPos).
    this.positioned = !store.state || store.state.act === 1;
  }

  // ---------- server messages ----------
  handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'state':
        this.renderState();
        break;
      case 'pos':
        for (const [id, x, y, z, yaw, area] of msg.list) {
          if (id === store.me) {
            if (!this.positioned && (x !== 0 || z !== 0)) {
              this.controls.setPosition(x, y, z, yaw);
              this.positioned = true;
            }
            continue;
          }
          this.world.setAvatarTarget(id, x, y, z, yaw, area);
        }
        for (const p of store.state?.players ?? []) if (!p.connected || p.boarded) this.world.hideAvatar(p.id);
        break;
      case 'event':
        this.onEvent(msg);
        break;
      case 'clue': {
        if (!msg.readable) {
          openClue({ title: msg.title, reason: msg.reason ?? 'You cannot make it out.' });
          break;
        }
        const c = { id: msg.id, kind: msg.kind, title: msg.title, content: msg.content };
        store.clues.set(msg.id, c);
        if (msg.kind === 'parrot') {
          this.hud.showSubtitle('Parrot', msg.content.text);
          audio.speak(msg.content.text, 'parrot');
          this.hud.addLog(msg.content.text, 'hint', 'Parrot');
        } else openClue(c);
        break;
      }
      case 'chat':
        this.hud.addLog(msg.text, 'chat', msg.name, msg.broadcast);
        break;
      case 'bell':
        if (msg.on) {
          voice.bells.add(msg.from);
          audio.play('bell');
          this.hud.toast(`🔔 ${store.playerName(msg.from)} rings the ship's bell and speaks to the whole crew`, '', 2500);
        } else voice.bells.delete(msg.from);
        break;
      case 'fx':
        this.onFx(msg);
        break;
      case 'error':
        this.hud.toast(msg.text, 'wrong');
        break;
    }
  }

  private onEvent(msg: Extract<ServerMsg, { t: 'event' }>) {
    const mine = msg.by === store.me;
    switch (msg.kind) {
      case 'solved':
        audio.play('unlock');
        this.hud.toast(msg.text, 'solved');
        this.hud.addLog(msg.text, 'solved');
        break;
      case 'wrong':
        audio.play('wrong');
        if (mine) panelStatus(msg.puzzle, msg.text.replace(/^[^:]+:\s*/, ''), 'bad');
        this.hud.addLog(msg.text, 'wrong');
        if (!mine) this.hud.toast(msg.text, 'wrong', 3000);
        break;
      case 'progress':
        panelStatus(msg.puzzle, msg.text, '');
        if (mine) audio.play('click');
        break;
      case 'reveal':
        audio.play('reveal');
        this.hud.toast(msg.text, '');
        this.hud.addLog(msg.text, 'event');
        break;
      case 'hint':
        this.hud.addLog(msg.text, 'hint');
        this.hud.toast(msg.text, '', 9000);
        if (msg.speaker === 'parrot') audio.speak(msg.text.replace(/^.*?squawks, as if remembering: /, ''), 'parrot');
        break;
      case 'captain':
        this.hud.showSubtitle('Captain Blackwater', msg.text.replace(/^BLACKWATER( \([^)]*\))?:\s*/, ''));
        this.hud.addLog(msg.text, 'captain');
        audio.speak(msg.text, 'captain');
        break;
      case 'parrot':
        this.hud.showSubtitle('Parrot', msg.text);
        this.hud.addLog(msg.text, 'hint');
        break;
      case 'act':
        audio.play('act');
        this.hud.toast(msg.text, 'act', 5000);
        this.hud.addLog(msg.text, 'event');
        break;
      case 'info':
      case 'pass':
        if (msg.by && !mine) this.hud.addLog(msg.text, 'event');
        else this.hud.toast(msg.text, '', 3500);
        break;
    }
  }

  private onFx(msg: Extract<ServerMsg, { t: 'fx' }>) {
    const posOf = (id?: string) => (id === store.me ? this.controls.pos : id ? this.world.avatarPosition(id) : undefined);
    switch (msg.kind) {
      case 'pass': {
        const from = posOf(msg.from);
        const to = posOf(msg.to);
        const item = store.scenario!.items.find((i) => i.id === msg.item);
        if (from && to && item) this.world.fxPass(item.kind, from, to);
        audio.play('throw');
        if (msg.to === store.me) this.hud.toast(`${store.playerName(msg.from!)} threw you the ${item?.name.toLowerCase()}.`, 'solved', 3000);
        break;
      }
      case 'cannon':
        this.world.fxCannon(msg.puzzle!, msg.button!);
        audio.play('cannon');
        break;
      case 'splash':
        audio.play('splash');
        break;
      case 'heave':
        if (msg.from !== store.me) audio.play('heave');
        break;
    }
  }

  renderState() {
    const s = store.state;
    if (!s || this.disposed) return;
    this.world.syncAvatars(s.players, store.me);
    this.world.applyState(s, store.me, store.myRole === 'lookout' ? 60 : 9, this.world.camera.position);
    this.hud.render(s);
    refreshPanel(s);
  }

  // ---------- input ----------
  private click(t: PickTarget | undefined) {
    if (!t) return;
    audio.ensure();
    const s = store.state!;
    const scn = store.scenario!;
    if (t.far && t.kind !== 'player') return this.hud.toast('Too far away — walk closer.', '', 1800);
    const sel = this.hud.selectedItem();
    switch (t.kind) {
      case 'item':
        net.send({ t: 'pickup', item: t.id });
        audio.play('pickup');
        break;
      case 'clue':
        net.send({ t: 'inspect', clue: t.id });
        break;
      case 'parrot':
        if (t.id) net.send({ t: 'inspect', clue: t.id });
        else {
          const line = PARROT_CHATTER[Math.floor(Math.random() * PARROT_CHATTER.length)];
          this.hud.showSubtitle('Parrot', line);
          audio.speak(line, 'parrot');
        }
        break;
      case 'puzzle': {
        const p = scn.puzzles.find((x) => x.id === t.id)!;
        const v = s.puzzles.find((x) => x.id === t.id);
        if (p.id === scn.finalPuzzle && s.lifeboatReady) {
          net.send({ t: 'board' });
          return;
        }
        if (v?.solved) return this.hud.toast(`${p.name}: already done.`, '', 1800);
        if (!v?.available) return this.hud.toast(`${p.name}: ${p.look} It won't budge yet — something else must come first.`, '', 3500);
        if (sel && p.interaction.type === 'useItem') {
          net.send({ t: 'act', puzzle: p.id, action: { kind: 'useItem', item: sel.id, itemKind: sel.kind } });
          this.hud.selected = -1;
          return;
        }
        openPuzzle(p);
        break;
      }
      case 'cannon': {
        const v = s.puzzles.find((x) => x.id === t.id);
        if (!v?.available) return this.hud.toast('The guns are not ready yet.', '', 2000);
        net.send({ t: 'act', puzzle: t.id, action: { kind: 'press', button: t.button! } });
        break;
      }
      case 'player': {
        const name = store.playerName(t.id);
        if (sel) {
          net.send({ t: 'pass', item: sel.id, to: t.id });
          this.hud.selected = -1;
        } else {
          const role = store.roles[t.id];
          this.hud.toast(`${name} — ${role ? ROLE_INFO[role].name : 'crew'}. Select an item first to throw it to them.`, '', 2500);
        }
        break;
      }
      case 'ladder':
        if (s.act >= 4) {
          this.controls.climbToDeck();
          this.hud.toast('You climb up into the storm.', '', 2000);
        } else this.hud.toast('The hatch above is battened down from the deck. Not yet…', '', 2500);
        break;
      case 'hatch':
        this.controls.climbDown();
        break;
      case 'lifeboat':
        net.send({ t: 'board' });
        break;
    }
  }

  private hover(t: PickTarget | undefined, x: number, y: number) {
    if (!t || modalOpen()) return this.hud.showTooltip(null, x, y);
    const s = store.state;
    const scn = store.scenario!;
    const lines: (string | HTMLElement)[] = [];
    const action = (text: string) => {
      const el = document.createElement('div');
      el.className = t.far ? 'far' : 'act';
      el.textContent = t.far ? 'Too far — walk closer' : text;
      return el;
    };
    const sel = this.hud.selectedItem();
    switch (t.kind) {
      case 'item': {
        const it = scn.items.find((i) => i.id === t.id)!;
        lines.push(it.name, action('Click: pick up'));
        break;
      }
      case 'clue': {
        const c = scn.clues.find((i) => i.id === t.id)!;
        lines.push(c.title, c.look, action('Click: read'));
        break;
      }
      case 'parrot':
        lines.push('The captain’s parrot', action('Click: make it talk'));
        break;
      case 'puzzle': {
        const p = scn.puzzles.find((i) => i.id === t.id)!;
        const v = s?.puzzles.find((i) => i.id === t.id);
        lines.push(p.name);
        if (p.id === scn.finalPuzzle && s?.lifeboatReady) lines.push(action('Click: climb into the lifeboat!'));
        else if (v?.solved) lines.push('Done ✔');
        else if (!v?.available) lines.push('Not yet…');
        else lines.push(action(sel && p.interaction.type === 'useItem' ? `Click: use ${sel.name}` : 'Click: work it'));
        break;
      }
      case 'cannon':
        lines.push(`${t.button ? t.button[0].toUpperCase() + t.button.slice(1) : ''} gun`, action('Click: fire!'));
        break;
      case 'player': {
        const name = store.playerName(t.id);
        const role = store.roles[t.id];
        lines.push(`${name}${role ? ' — ' + ROLE_INFO[role].name : ''}`);
        if (sel) lines.push(action(`Click: throw the ${sel.name.toLowerCase()}`));
        break;
      }
      case 'ladder':
        lines.push('Ladder to the deck hatch', action(s && s.act >= 4 ? 'Click: climb up' : 'Battened down'));
        break;
      case 'hatch':
        lines.push('Hatch to the hold', action('Click: climb down'));
        break;
    }
    this.hud.showTooltip(lines, x, y);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (isTyping(e)) return;
    if (!down) {
      if (e.code === 'KeyV') {
        voice.pttHeld = false;
        voice.applyTalk();
      }
      if (e.code === 'KeyB' && store.myRole === 'captain') net.send({ t: 'bell', on: false });
      return;
    }
    if (e.repeat && e.code !== 'Space') return;
    if (e.code === 'Escape') {
      if (modalOpen()) closeModal();
      else openSettings();
      return;
    }
    if (e.code === 'F1' || e.key === '?') {
      e.preventDefault();
      return openHelp();
    }
    if (e.code === 'KeyV') {
      voice.pttHeld = true;
      voice.applyTalk();
      return;
    }
    if (e.code === 'KeyB' && store.myRole === 'captain') return net.send({ t: 'bell', on: true });
    if (modalOpen()) return;
    if (e.code === 'Enter') {
      e.preventDefault();
      return this.hud.focusChat();
    }
    if (e.code === 'KeyH') return openHints();
    if (e.code === 'KeyM') return this.toggleMic();
    const n = Number(e.key);
    if (n >= 1 && n <= 6) {
      this.hud.selected = this.hud.selected === n - 1 ? -1 : n - 1;
      return this.renderState();
    }
    const sel = this.hud.selectedItem();
    if (e.code === 'KeyI' && sel) return openInspect(sel);
    if (e.code === 'KeyG' && sel) {
      const p = this.controls.pos;
      net.send({ t: 'drop', item: sel.id, pos: [p.x - Math.sin(this.controls.yaw) * 0.8, p.y + 0.05, p.z - Math.cos(this.controls.yaw) * 0.8] });
      this.hud.selected = -1;
    }
  }

  private async toggleMic() {
    if (!voice.local) {
      const ok = await voice.enableMic();
      this.hud.toast(ok ? 'Microphone on.' : 'Microphone blocked — use text chat (Enter).', ok ? 'solved' : 'wrong');
      return;
    }
    voice.micMuted = !voice.micMuted;
    voice.applyTalk();
    this.hud.toast(voice.micMuted ? 'Microphone muted.' : 'Microphone on.', '', 1500);
  }

  // ---------- helpers ----------
  private nearbyPlayers() {
    const s = store.state!;
    const range = store.myRole === 'quartermaster' ? PASS_RANGE * 2 : PASS_RANGE;
    const me = this.controls.pos;
    return s.players
      .filter((p) => p.id !== store.me && p.connected)
      .map((p) => {
        const pos = this.world.avatarPosition(p.id);
        const dist = pos ? Math.hypot(pos.x - me.x, pos.z - me.z) : 99;
        const sameLevel = (p.area === 'deck') === (this.controls.area === 'deck');
        return { id: p.id, name: p.name, dist, inRange: dist <= range && sameLevel };
      })
      .sort((a, b) => a.dist - b.dist);
  }

  private nearCannon(puzzle: string, button: string): boolean {
    const p = store.scenario!.puzzles.find((x) => x.id === puzzle);
    if (!p || p.interaction.type !== 'stations') return false;
    const i = p.interaction.stations.findIndex((s) => s.id === button);
    const xs = [-11, -7.5, -4, -0.5];
    const me = this.controls.pos;
    return this.controls.area === 'deck' && Math.hypot(me.x - xs[i], me.z - (DECK.minZ + 1.1)) < 2.5;
  }

  private proximity(id: string): number {
    const pos = this.world.avatarPosition(id);
    const view = store.state?.players.find((p) => p.id === id);
    if (!pos || !view) return 0.3;
    const d = pos.distanceTo(this.controls.pos);
    let g = Math.max(0.06, Math.min(1, 1 - (d - 2.5) / 16));
    if ((view.area === 'deck') !== (this.controls.area === 'deck')) g *= 0.25;
    return g;
  }

  // ---------- frame ----------
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = store.state;
    const moved = this.controls.update(dt);
    const p = this.controls.pos;
    const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${this.controls.yaw.toFixed(2)},${this.controls.area}`;
    if ((moved || key !== this.lastSentKey) && now - this.lastSent > 90) {
      this.lastSent = now;
      this.lastSentKey = key;
      net.send({ t: 'move', p: [p.x, p.y, p.z], r: this.controls.yaw, area: this.controls.area as AreaId });
    }
    if (s) {
      const serverNow = net.serverNow();
      const frac = Math.min(1, Math.max(0, (serverNow - s.startedAt) / Math.max(1, s.endsAt - s.startedAt)));
      this.world.setWater(0.05 + frac * 1.35);
      audio.setIntensity(frac, this.controls.area === 'deck');
      this.hud.tick(serverNow, s);
      // Lightning over the deck (visible through hatches too).
      if (now > this.lightningAt) {
        this.lightningAt = now + 6000 + Math.random() * 12000 * (1 - frac * 0.6);
        if (this.lightningAt > 0 && this.controls.area === 'deck') {
          this.world.flash(1);
          setTimeout(() => audio.play('thunder'), 300 + Math.random() * 1200);
        }
      }
    }
    // Glints depend on distance, so refresh them as the player walks.
    if (s && now > this.glintAt) {
      this.glintAt = now + 400;
      this.controls.refreshHover();
      this.world.applyState(s, store.me, store.myRole === 'lookout' ? 60 : 9, this.world.camera.position);
    }
    voice.update();
    for (const pl of store.state?.players ?? []) if (pl.id !== store.me) this.world.setSpeaking(pl.id, voice.peerLevel(pl.id) > 0.08);
    this.world.update(dt, this.controls.area);
  };
}

export function areaName(area: string): string {
  if (area.startsWith('cage')) {
    const c = store.scenario?.cages[Number(area.slice(4))];
    return c ? `the ${c.name}` : area;
  }
  return AREA_NAMES[area] ?? area;
}

export type { StateView };
