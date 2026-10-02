// First-person movement (WASD), drag-to-look and click-to-interact.
import * as THREE from 'three';
import type { AreaId } from '@crimson/engine';
import { DECK, EYE, HATCH, LADDER, areaAt, collide } from './world/layout.ts';
import type { PickTarget, World } from './world/scene.ts';
import { store } from './store.ts';

export const INTERACT_RANGE = 4.2;

export class Controls {
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  area: AreaId = 'hold';
  enabled = true;
  private keys = new Set<string>();
  private dragging = false;
  private downAt: [number, number] | null = null;
  private lastMove: [number, number] | null = null;
  private mouse = new THREE.Vector2();
  hover?: PickTarget;
  onClick: (t: PickTarget | undefined) => void = () => {};
  onHover: (t: PickTarget | undefined, x: number, y: number) => void = () => {};

  constructor(
    private world: World,
    private canvas: HTMLCanvasElement,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.downAt = [e.clientX, e.clientY];
      this.lastMove = [e.clientX, e.clientY];
      this.dragging = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (this.downAt && this.enabled) {
        const dx = e.clientX - this.downAt[0];
        const dy = e.clientY - this.downAt[1];
        if (this.dragging || Math.hypot(dx, dy) > 4) {
          this.dragging = true;
          const [lx, ly] = this.lastMove ?? this.downAt;
          this.yaw -= (e.clientX - lx) * 0.0045;
          this.pitch -= (e.clientY - ly) * 0.0045 * (store.settings.invertLook ? -1 : 1);
          this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
        }
      }
      this.lastMove = [e.clientX, e.clientY];
      this.updateHover(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', (e) => {
      const wasDrag = this.dragging;
      this.downAt = null;
      this.dragging = false;
      if (!wasDrag && this.enabled && e.button === 0) this.onClick(this.hover);
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - e.deltaY * 0.001));
    });
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private updateHover(cx: number, cy: number) {
    if (!this.enabled) {
      this.hover = undefined;
      this.world.setHover(undefined);
      this.onHover(undefined, cx, cy);
      return;
    }
    const t = this.world.pick(this.mouse, INTERACT_RANGE + 6);
    let target: PickTarget | undefined;
    if (t) {
      const p = new THREE.Vector3();
      t.object.getWorldPosition(p);
      const range = t.kind === 'player' ? 30 : INTERACT_RANGE + (t.kind === 'puzzle' ? 1.5 : 0);
      target = { ...t, far: p.distanceTo(this.world.camera.position) > range };
    }
    this.hover = target;
    this.world.setHover(target && !target.far ? target.object : undefined);
    this.onHover(target, cx, cy);
  }

  setPosition(x: number, y: number, z: number, yaw?: number) {
    this.pos.set(x, y, z);
    if (yaw !== undefined) this.yaw = yaw;
    this.area = areaAt(x, y + 0.1, z, this.world.cages);
    this.applyCamera();
  }

  climbToDeck() {
    this.setPosition(HATCH.x + 1.6, DECK.y, HATCH.z, -Math.PI / 2);
  }

  climbDown() {
    this.setPosition(LADDER.x + 1.4, 0, LADDER.z, -Math.PI / 2);
  }

  private applyCamera() {
    const cam = this.world.camera;
    cam.rotation.order = 'YXZ';
    cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
  }

  /** Returns true if the player moved or turned this frame. */
  update(dt: number): boolean {
    let moved = false;
    if (this.enabled) {
      const k = this.keys;
      const turn = (k.has('ArrowLeft') || k.has('KeyQ') ? 1 : 0) - (k.has('ArrowRight') || k.has('KeyE') ? 1 : 0);
      if (turn) {
        this.yaw += turn * dt * 2.2;
        moved = true;
      }
      const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      if (fwd || side) {
        const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 5 : 3.2) * dt;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        let x = this.pos.x + (-sin * fwd + cos * side) * speed;
        let z = this.pos.z + (-cos * fwd - sin * side) * speed;
        const onDeck = this.pos.y > DECK.y - 1;
        [x, z] = collide(x, z, 0.3, onDeck ? this.world.colliders.deck : this.world.colliders.hold);
        this.pos.x = x;
        this.pos.z = z;
        this.area = areaAt(x, this.pos.y + 0.1, z, this.world.cages);
        moved = true;
      }
    }
    this.applyCamera();
    return moved;
  }
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
