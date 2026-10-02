// World geometry: where areas, cages and placement slots sit. Shared by the renderer and movement.
import type { AreaId } from '@crimson/engine';

export interface Spot {
  x: number;
  y: number;
  z: number;
  /** Yaw the prop faces (radians, 0 = facing +z). */
  yaw: number;
}

export const HOLD = { minX: -16, maxX: 16, minZ: -11, maxZ: 11, height: 4.6 };
export const QUARTERS = { minX: 16, maxX: 26, minZ: -6, maxZ: 6, height: 3.4 };
export const DECK = { y: 5, minX: -18, maxX: 17, minZ: -7.6, maxZ: 7.6 };
export const CAGE_HALF = 1.8;
export const EYE = 1.6;
export const LADDER = { x: -15.2, z: 0 };
export const HATCH = { x: -13.4, z: 0 };
export const DOOR_Z = 1.1; // quarters door half-width

export interface CageGeom {
  index: number;
  x: number;
  z: number;
  /** Rotation: the door (local -z) faces the mainmast. */
  yaw: number;
}

export function cageGeoms(n: number): CageGeom[] {
  const r = ({ 2: 3.6, 3: 5, 4: 6.2, 5: 7 } as Record<number, number>)[n] ?? 7;
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n + (n === 4 ? Math.PI / 4 : 0);
    const x = Math.cos(a) * r * (n === 4 ? 1.2 : 1.3);
    const z = Math.sin(a) * r;
    // Local -z should point at the centre: yaw such that rotating (0,0,-1) gives direction to centre.
    const yaw = Math.atan2(x, z);
    return { index: i, x, z, yaw };
  });
}

/** Transform a cage-local point to world space. */
export function cageToWorld(c: CageGeom, lx: number, lz: number): [number, number] {
  const cos = Math.cos(c.yaw);
  const sin = Math.sin(c.yaw);
  return [c.x + lx * cos + lz * sin, c.z - lx * sin + lz * cos];
}

export function worldToCage(c: CageGeom, x: number, z: number): [number, number] {
  const dx = x - c.x;
  const dz = z - c.z;
  const cos = Math.cos(c.yaw);
  const sin = Math.sin(c.yaw);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

const CAGE_SLOTS: [number, number, number, number][] = [
  // local x, y, z, yaw (facing into the cage)
  [-0.8, 1.1, 1.72, Math.PI],
  [0.8, 1.1, 1.72, Math.PI],
  [-1.72, 1.1, -0.5, Math.PI / 2],
  [-1.72, 1.1, 0.8, Math.PI / 2],
  [1.72, 1.1, -0.5, -Math.PI / 2],
  [1.72, 1.1, 0.8, -Math.PI / 2],
  [-0.9, 0.12, 0.1, 0],
  [0.9, 0.12, -0.6, 0],
];

function holdSlots(): Spot[] {
  const out: Spot[] = [];
  for (let i = 0; i < 10; i++) out.push({ x: -14.4 + i * 3.2, y: 1.1, z: HOLD.minZ + 0.45, yaw: 0 });
  for (let i = 0; i < 10; i++) out.push({ x: -14.4 + i * 3.2, y: 1.1, z: HOLD.maxZ - 0.45, yaw: Math.PI });
  for (const z of [-7.5, -4, 4, 7.5]) out.push({ x: HOLD.minX + 0.45, y: 1.1, z, yaw: Math.PI / 2 });
  for (const z of [-7.5, -4, 4, 7.5]) out.push({ x: HOLD.maxX - 0.45, y: 1.1, z, yaw: -Math.PI / 2 });
  return out;
}

function quarterSlots(): Spot[] {
  const out: Spot[] = [];
  for (const x of [18, 20.5, 23, 25]) out.push({ x, y: 1.1, z: QUARTERS.minZ + 0.4, yaw: 0 });
  for (const x of [18, 20.5, 23, 25]) out.push({ x, y: 1.1, z: QUARTERS.maxZ - 0.4, yaw: Math.PI });
  for (const z of [-3.6, -1.2, 1.2, 3.6]) out.push({ x: QUARTERS.maxX - 0.4, y: 1.1, z, yaw: -Math.PI / 2 });
  out.push({ x: 20.6, y: 0.95, z: -0.7, yaw: -Math.PI / 2 }, { x: 20.6, y: 0.95, z: 0.8, yaw: -Math.PI / 2 });
  return out;
}

function deckSlots(): Spot[] {
  const y = DECK.y + 1.0;
  const out: Spot[] = [];
  for (const x of [-15, -12, -9, -6, 7, 10, 13]) out.push({ x, y, z: DECK.maxZ - 0.5, yaw: Math.PI });
  for (const x of [-15, 5, 8, 11]) out.push({ x, y, z: DECK.minZ + 0.5, yaw: 0 });
  for (const [x, z] of [[-8, -2], [-4, 3], [4, 3], [6, -3], [-11, -3], [-2, -3], [2, 5]])
    out.push({ x, y: DECK.y + 0.9, z, yaw: Math.atan2(-x, -z) });
  return out;
}

/** Fixed deck features that do not use slots. */
export const DECK_FEATURES = {
  wheel: { x: 14.6, y: DECK.y, z: 0, yaw: -Math.PI / 2 },
  cannons: [-11, -7.5, -4, -0.5].map((x) => ({ x, y: DECK.y, z: DECK.minZ + 1.1, yaw: Math.PI })),
  davit: { x: 0, y: DECK.y, z: DECK.maxZ - 0.6, yaw: Math.PI },
  navTable: { x: 10.5, y: DECK.y, z: -1.5, yaw: -Math.PI / 2 },
  capstan: { x: -8, y: DECK.y, z: 3.2, yaw: 0 },
  stash: { x: 2.4, y: DECK.y, z: 0.6, yaw: 0 },
  mast: { x: 0, z: 0 },
};

export const PARROT_DEFAULT: Spot = { x: 1.2, y: 2.4, z: 0.6, yaw: 0 };

export function slotSpot(area: AreaId, slot: number, cages: CageGeom[]): Spot {
  if (area.startsWith('cage')) {
    const c = cages[Number(area.slice(4))];
    const s = CAGE_SLOTS[slot % CAGE_SLOTS.length];
    const [x, z] = cageToWorld(c, s[0], s[2]);
    return { x, y: s[1], z, yaw: s[3] + c.yaw };
  }
  const list = area === 'hold' ? holdSlots() : area === 'quarters' ? quarterSlots() : deckSlots();
  return list[slot % list.length];
}

/** Which area a world position falls in. */
export function areaAt(x: number, y: number, z: number, cages: CageGeom[]): AreaId {
  if (y > DECK.y - 1) return 'deck';
  if (x > QUARTERS.minX) return 'quarters';
  for (const c of cages) {
    const [lx, lz] = worldToCage(c, x, z);
    if (Math.abs(lx) < CAGE_HALF && Math.abs(lz) < CAGE_HALF) return `cage${c.index}`;
  }
  return 'hold';
}

export type Seg = [number, number, number, number];

export interface Colliders {
  segs: Seg[];
  circles: [number, number, number][];
}

/** Wall segments for the current door state. */
export function buildColliders(cages: CageGeom[], openCages: Set<number>, quartersOpen: boolean): { hold: Colliders; deck: Colliders } {
  const segs: Seg[] = [];
  const H = HOLD;
  segs.push([H.minX, H.minZ, H.maxX, H.minZ], [H.minX, H.maxZ, H.maxX, H.maxZ], [H.minX, H.minZ, H.minX, H.maxZ]);
  segs.push([H.maxX, H.minZ, H.maxX, -DOOR_Z], [H.maxX, DOOR_Z, H.maxX, H.maxZ]);
  if (!quartersOpen) segs.push([H.maxX, -DOOR_Z, H.maxX, DOOR_Z]);
  const Q = QUARTERS;
  segs.push([Q.minX, Q.minZ, Q.maxX, Q.minZ], [Q.minX, Q.maxZ, Q.maxX, Q.maxZ], [Q.maxX, Q.minZ, Q.maxX, Q.maxZ]);
  segs.push([Q.minX, H.minZ, Q.minX, Q.minZ], [Q.minX, Q.maxZ, Q.minX, H.maxZ]);
  for (const c of cages) {
    const h = CAGE_HALF;
    const corners = [
      cageToWorld(c, -h, -h),
      cageToWorld(c, h, -h),
      cageToWorld(c, h, h),
      cageToWorld(c, -h, h),
    ];
    const edge = (a: number, b: number): Seg => [corners[a][0], corners[a][1], corners[b][0], corners[b][1]];
    segs.push(edge(1, 2), edge(2, 3), edge(3, 0));
    if (!openCages.has(c.index)) segs.push(edge(0, 1));
    else {
      // Door swung open: leave a gap in the middle of the front wall.
      const g = 0.75;
      const l = cageToWorld(c, -g, -h);
      const r = cageToWorld(c, g, -h);
      segs.push([corners[0][0], corners[0][1], l[0], l[1]], [r[0], r[1], corners[1][0], corners[1][1]]);
    }
  }
  const D = DECK;
  const deckSegs: Seg[] = [
    [D.minX, D.minZ, D.maxX, D.minZ],
    [D.minX, D.maxZ, D.maxX, D.maxZ],
    [D.minX, D.minZ, D.minX, D.maxZ],
    [D.maxX, D.minZ, D.maxX, D.maxZ],
  ];
  return {
    hold: { segs, circles: [[0, 0, 0.55], [LADDER.x + 0.2, LADDER.z, 0.3]] },
    deck: { segs: deckSegs, circles: [[0, 0, 0.6], [DECK_FEATURES.wheel.x, 0, 0.6], [DECK_FEATURES.capstan.x, DECK_FEATURES.capstan.z, 0.8]] },
  };
}

/** Push a circle of radius r out of all colliders. */
export function collide(x: number, z: number, r: number, col: Colliders): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    for (const [ax, az, bx, bz] of col.segs) {
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + t * dx;
      const pz = az + t * dz;
      const ex = x - px;
      const ez = z - pz;
      const d = Math.hypot(ex, ez);
      if (d < r && d > 1e-6) {
        x = px + (ex / d) * r;
        z = pz + (ez / d) * r;
      } else if (d <= 1e-6) {
        x += (-dz / Math.sqrt(len2)) * r;
        z += (dx / Math.sqrt(len2)) * r;
      }
    }
    for (const [cx, cz, cr] of col.circles) {
      const ex = x - cx;
      const ez = z - cz;
      const d = Math.hypot(ex, ez);
      if (d < cr + r && d > 1e-6) {
        x = cx + (ex / d) * (cr + r);
        z = cz + (ez / d) * (cr + r);
      }
    }
  }
  return [x, z];
}

/** Spawn point inside a cage (spread players out). */
export function cageSpawn(c: CageGeom, k: number): [number, number] {
  const offs = [[-0.6, 0.4], [0.6, 0.4], [0, -0.5], [0, 0.9]];
  const o = offs[k % offs.length];
  return cageToWorld(c, o[0], o[1]);
}
