// The 3D ship: static geometry, props, items, avatars and atmosphere.
import * as THREE from 'three';
import { GLYPHS, type AreaId, type PublicScenario, type StateView } from '@crimson/engine';
import {
  CAGE_HALF,
  DECK,
  DECK_FEATURES,
  DOOR_Z,
  HATCH,
  HOLD,
  LADDER,
  PARROT_DEFAULT,
  QUARTERS,
  buildColliders,
  cageGeoms,
  cageToWorld,
  slotSpot,
  type CageGeom,
  type Colliders,
  type Spot,
} from './layout.ts';
import { buildAvatar, buildBarrel, buildClue, buildItem, buildParrot, buildProp } from './props.ts';
import { glintTexture, glyphTexture, iron, labelSprite, planks, water } from './textures.ts';

export type PickKind = 'puzzle' | 'clue' | 'item' | 'player' | 'ladder' | 'hatch' | 'lifeboat' | 'cannon' | 'parrot';
export interface PickTarget {
  kind: PickKind;
  id: string;
  button?: string;
  object: THREE.Object3D;
  /** Seen but out of reach. */
  far?: boolean;
}

interface Avatar {
  group: THREE.Group;
  label: THREE.Sprite;
  target: THREE.Vector3;
  yaw: number;
  area: AreaId;
  hand?: THREE.Object3D;
  speaking: THREE.Mesh;
}

const FLOOR_PROPS = new Set(['capstan', 'navTable', 'wheel', 'davit', 'cannons', 'stash']);

export class World {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  renderer: THREE.WebGLRenderer;
  cages: CageGeom[] = [];
  colliders!: { hold: Colliders; deck: Colliders };
  private scn!: PublicScenario;
  private pickables: THREE.Object3D[] = [];
  private puzzleMeshes = new Map<string, THREE.Object3D[]>();
  private clueMeshes = new Map<string, THREE.Object3D>();
  private itemMeshes = new Map<string, THREE.Group>();
  private glints = new Map<THREE.Object3D, THREE.Sprite>();
  private avatars = new Map<string, Avatar>();
  private cageDoors = new Map<number, THREE.Object3D>();
  private quartersDoor!: THREE.Object3D;
  private waterMesh!: THREE.Mesh;
  private sea!: THREE.Mesh;
  private rain!: THREE.LineSegments;
  private parrot?: THREE.Group;
  private davit?: THREE.Group;
  private lightning!: THREE.DirectionalLight;
  private lanterns: THREE.PointLight[] = [];
  private flights: { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number }[] = [];
  private puffs: { sprite: THREE.Sprite; t: number }[] = [];
  private hovered?: THREE.Object3D;
  private animated: THREE.Object3D[] = [];
  private time = 0;
  private openState = '';
  waterLevel = 0.05;
  shake = 0;
  /** Skip drawing (used by automated test bots via ?norender). */
  static headless = new URLSearchParams(location.search).has('norender');

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene.background = new THREE.Color('#05080c');
    this.scene.fog = new THREE.FogExp2('#0a0d12', 0.028);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- build ----------
  build(scn: PublicScenario) {
    this.scn = scn;
    this.cages = cageGeoms(scn.layout.cages);
    this.colliders = buildColliders(this.cages, new Set(), false);
    this.buildHold();
    this.buildCages();
    this.buildQuarters();
    this.buildDeck();
    this.buildPuzzles();
    this.buildClues();
    this.buildItems();
    this.scene.traverse((o) => (o.name === 'spin' || o.name === 'sail') && this.animated.push(o));
  }

  private add(o: THREE.Object3D) {
    this.scene.add(o);
    return o;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return this.add(m);
  }

  private buildHold() {
    const H = HOLD;
    const w = H.maxX - H.minX;
    const d = H.maxZ - H.minZ;
    const floorMat = new THREE.MeshStandardMaterial({ map: planks('#4a3220', [6, 4]), roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ map: planks('#5b3b22', [6, 1.2], 5), roughness: 0.95 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: planks('#3a2717', [6, 4], 9), roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w + 12, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(5, 0, 0);
    this.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, H.height, 0);
    this.add(ceil);
    const wall = (x: number, z: number, len: number, rotY: number, h = H.height, mat = wallMat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
      m.position.set(x, h / 2, z);
      m.rotation.y = rotY;
      this.add(m);
    };
    wall(0, H.minZ, w, 0);
    wall(0, H.maxZ, w, Math.PI);
    wall(H.minX, 0, d, Math.PI / 2);
    // East wall with the quarters doorway.
    const seg = (H.maxZ - DOOR_Z);
    wall(H.maxX, -(DOOR_Z + seg / 2), seg, -Math.PI / 2);
    wall(H.maxX, DOOR_Z + seg / 2, seg, -Math.PI / 2);
    this.box(0.3, H.height - 2.4, DOOR_Z * 2, wallMat, H.maxX, 2.4 + (H.height - 2.4) / 2, 0);
    // Ribs and beams.
    const beam = new THREE.MeshStandardMaterial({ color: '#2d1d10', roughness: 1 });
    for (let x = H.minX + 2; x < H.maxX; x += 4) {
      this.box(0.3, 0.3, d, beam, x, H.height - 0.15, 0);
      this.box(0.25, H.height, 0.25, beam, x, H.height / 2, H.minZ + 0.15);
      this.box(0.25, H.height, 0.25, beam, x, H.height / 2, H.maxZ - 0.15);
    }
    // Mainmast through the hold.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, H.height, 12), new THREE.MeshStandardMaterial({ map: planks('#6b4426', [1, 3], 2) }));
    mast.position.set(0, H.height / 2, 0);
    this.add(mast);
    // Ladder up to the deck hatch.
    const lad = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5634' });
    for (const z of [-0.35, 0.35]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, H.height + 0.4, 0.08), wood);
      r.position.set(0, H.height / 2, z);
      lad.add(r);
    }
    for (let y = 0.3; y < H.height; y += 0.4) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), wood);
      r.position.set(0, y, 0);
      lad.add(r);
    }
    lad.position.set(LADDER.x, 0, LADDER.z);
    lad.rotation.z = -0.18;
    this.add(lad);
    this.pickable(lad, { kind: 'ladder', id: 'ladder' });
    // Scattered barrels and crates for atmosphere.
    for (const [x, z] of [[-13, -8.5], [-12.4, -9.2], [13, 8.6], [12.3, 9.3], [-6, 9.6], [7, -9.6]]) {
      const b = buildBarrel();
      b.position.set(x, 0, z);
      b.scale.setScalar(1.6);
      this.add(b);
    }
    // Lights.
    this.scene.add(new THREE.HemisphereLight('#9fb0c8', '#4a3220', 1.25));
    this.scene.add(new THREE.AmbientLight('#3a2a1c', 0.6));
    for (const [x, z] of [[-11, -7], [11, 7], [11, -7], [-11, 7], [0, -9], [0, 9]]) this.lantern(x, H.height - 0.6, z, '#ffb15a', 13);
    // Floodwater.
    const wGeo = new THREE.PlaneGeometry(QUARTERS.maxX - H.minX, H.maxZ - H.minZ, 48, 24);
    this.waterMesh = new THREE.Mesh(
      wGeo,
      new THREE.MeshStandardMaterial({ map: water(), color: '#2a6f7c', transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.3 }),
    );
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set((QUARTERS.maxX + H.minX) / 2, 0.05, 0);
    this.add(this.waterMesh);
  }

  private lantern(x: number, y: number, z: number, color: string, dist: number) {
    const light = new THREE.PointLight(color, 9, dist, 1.6);
    light.position.set(x, y, z);
    this.add(light);
    this.lanterns.push(light);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }));
    glass.position.set(x, y, z);
    this.add(glass);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), new THREE.MeshStandardMaterial({ color: '#222' }));
    chain.position.set(x, y + 0.45, z);
    this.add(chain);
    return light;
  }

  private buildCages() {
    const barMat = new THREE.MeshStandardMaterial({ map: iron(), color: '#6e6a66', metalness: 0.7, roughness: 0.5 });
    const h = CAGE_HALF;
    for (const c of this.cages) {
      const skin = this.scn.cages[c.index];
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.yaw;
      const bar = (x: number, z: number) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), barMat);
        m.position.set(x, 1.3, z);
        return m;
      };
      for (let t = -h; t <= h + 0.01; t += 0.3) {
        g.add(bar(t, h), bar(-h, t), bar(h, t));
      }
      // Front wall: fixed side bars plus a hinged door.
      for (let t = -h; t <= -0.75; t += 0.3) g.add(bar(t, -h));
      for (let t = 0.75; t <= h + 0.01; t += 0.3) g.add(bar(t, -h));
      const door = new THREE.Group();
      door.position.set(-0.75, 0, -h);
      for (let t = 0; t <= 1.5; t += 0.3) door.add(bar(t, 0));
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), barMat);
      cross.position.set(0.75, 1.3, 0);
      door.add(cross);
      g.add(door);
      this.cageDoors.set(c.index, door);
      // Frame, roof bars, floor.
      for (const y of [0.05, 2.6]) {
        for (const [w, d, x, z] of [[2 * h, 0.06, 0, h], [2 * h, 0.06, 0, -h], [0.06, 2 * h, h, 0], [0.06, 2 * h, -h, 0]]) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), barMat);
          f.position.set(x, y, z);
          g.add(f);
        }
      }
      const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * h, 0.08, 2 * h), new THREE.MeshStandardMaterial({ map: planks('#3d2a1a', [2, 2], c.index + 2) }));
      floor.position.y = 0.04;
      g.add(floor);
      // Coloured lantern, emblem flag and nameplate make each cage easy to describe over voice.
      // Emblem on a post above the cage roof, visible from across the hold.
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshStandardMaterial({ map: glyphTexture(GLYPHS[skin.emblem].char, skin.color), side: THREE.DoubleSide, emissive: skin.color, emissiveIntensity: 0.25 }));
      flag.position.set(0, 3.05, -h + 0.05);
      flag.rotation.y = Math.PI;
      g.add(flag);
      const plate = labelSprite(skin.name, skin.color, 'rgba(10,6,2,0.75)');
      plate.position.set(0, 3.6, 0);
      plate.scale.set(2.2, 0.42, 1);
      g.add(plate);
      this.add(g);
      const [lx, lz] = cageToWorld(c, 0, 0);
      this.lantern(lx, 2.45, lz, skin.color, 6);
    }
  }

  private buildQuarters() {
    const Q = QUARTERS;
    const wallMat = new THREE.MeshStandardMaterial({ map: planks('#6a3f22', [3, 1], 12), roughness: 0.9 });
    const w = Q.maxX - Q.minX;
    const d = Q.maxZ - Q.minZ;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: '#2b1a0e' }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((Q.minX + Q.maxX) / 2, Q.height, 0);
    this.add(ceil);
    const wall = (x: number, z: number, len: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, Q.height), wallMat);
      m.position.set(x, Q.height / 2, z);
      m.rotation.y = rotY;
      this.add(m);
    };
    wall((Q.minX + Q.maxX) / 2, Q.minZ, w, 0);
    wall((Q.minX + Q.maxX) / 2, Q.maxZ, w, Math.PI);
    wall(Q.maxX, 0, d, -Math.PI / 2);
    // Stern windows with lightning glow.
    for (const z of [-3, 0, 3]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshBasicMaterial({ color: '#1b2a3c' }));
      win.position.set(Q.maxX - 0.02, 2.0, z);
      win.rotation.y = -Math.PI / 2;
      this.add(win);
    }
    // Rug, desk, bunk.
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5), new THREE.MeshStandardMaterial({ color: '#6b1d1d' }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(21, 0.02, 0);
    this.add(rug);
    const desk = new THREE.MeshStandardMaterial({ map: planks('#4a2a14', [1, 1], 4) });
    this.box(1.4, 0.08, 2.6, desk, 20.6, 0.85, 0);
    for (const [x, z] of [[20.0, -1.2], [21.2, -1.2], [20.0, 1.2], [21.2, 1.2]]) this.box(0.08, 0.85, 0.08, desk, x, 0.42, z);
    this.box(2.4, 0.5, 1.2, desk, 24.6, 0.25, -4.9);
    this.lantern(21, Q.height - 0.5, 0, '#ffc477', 10);
    // Door between hold and quarters.
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, DOOR_Z * 2), new THREE.MeshStandardMaterial({ map: planks('#3b2412', [1, 2], 8) }));
    door.position.set(HOLD.maxX + 0.05, 1.2, 0);
    this.quartersDoor = this.add(door);
    const sign = labelSprite("Captain's Quarters", '#f2d49b', 'rgba(20,10,4,0.8)');
    sign.position.set(HOLD.maxX - 0.3, 2.9, 0);
    sign.scale.set(2.4, 0.45, 1);
    this.add(sign);
  }

  private buildDeck() {
    const D = DECK;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(D.maxX - D.minX, 0.3, D.maxZ - D.minZ), new THREE.MeshStandardMaterial({ map: planks('#7a5838', [8, 3], 6), roughness: 0.6 }));
    deck.position.set((D.maxX + D.minX) / 2, D.y - 0.15, 0);
    this.add(deck);
    const rail = new THREE.MeshStandardMaterial({ color: '#4b2f1a' });
    for (const z of [D.minZ, D.maxZ]) this.box(D.maxX - D.minX, 0.9, 0.15, rail, (D.maxX + D.minX) / 2, D.y + 0.45, z);
    this.box(0.15, 0.9, D.maxZ - D.minZ, rail, D.maxX, D.y + 0.45, 0);
    // Bow point.
    const bow = new THREE.Mesh(new THREE.ConeGeometry(D.maxZ - D.minZ, 5, 4, 1), new THREE.MeshStandardMaterial({ map: planks('#5a3a20') }));
    bow.rotation.z = Math.PI / 2;
    bow.rotation.x = Math.PI / 4;
    bow.scale.set(1, 1, 0.71);
    bow.position.set(D.minX - 2.3, D.y - 0.6, 0);
    this.add(bow);
    // Masts and storm-torn sails.
    for (const [x, hgt] of [[0, 16], [-11, 12], [10, 11]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, hgt, 10), new THREE.MeshStandardMaterial({ color: '#6b4426' }));
      m.position.set(x, D.y + hgt / 2, 0);
      this.add(m);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(6, hgt * 0.45, 6, 4), new THREE.MeshStandardMaterial({ color: '#d8cfb8', side: THREE.DoubleSide, roughness: 1 }));
      sail.position.set(x + 0.4, D.y + hgt * 0.55, 0);
      sail.rotation.y = Math.PI / 2;
      sail.name = 'sail';
      this.add(sail);
      this.box(0.18, 0.18, 7, new THREE.MeshStandardMaterial({ color: '#4b2f1a' }), x + 0.3, D.y + hgt * 0.78, 0);
    }
    // Hatch back down to the hold.
    const hatch = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), rail);
    frame.position.y = 0.1;
    hatch.add(frame);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: '#050302' }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.21;
    hatch.add(hole);
    hatch.position.set(HATCH.x, D.y, HATCH.z);
    this.add(hatch);
    this.pickable(hatch, { kind: 'hatch', id: 'hatch' });
    // Sea, rain, storm light.
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 60, 60), new THREE.MeshStandardMaterial({ color: '#0d2a33', roughness: 0.3, metalness: 0.2, flatShading: true }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = D.y - 2.6;
    this.add(this.sea);
    const n = 1800;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 50;
      const y = D.y + Math.random() * 18;
      const z = (Math.random() - 0.5) * 30;
      pos.set([x, y, z, x + 0.08, y + 0.5, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#9fb6c8', transparent: true, opacity: 0.35 }));
    this.rain.visible = false;
    this.add(this.rain);
    const moon = new THREE.DirectionalLight('#8aa3c4', 0.6);
    moon.position.set(-10, 30, 10);
    this.add(moon);
    this.lightning = new THREE.DirectionalLight('#dfe8ff', 0);
    this.lightning.position.set(20, 40, -10);
    this.add(this.lightning);
    this.lantern(14.6, D.y + 2.6, 0, '#ffcc88', 10);
    this.lantern(-8, D.y + 2.6, 3, '#ffcc88', 9);
  }

  private spotFor(area: AreaId, slot: number): Spot {
    return slotSpot(area, slot, this.cages);
  }

  private place(o: THREE.Object3D, s: Spot, floorY?: number) {
    o.position.set(s.x, floorY ?? s.y, s.z);
    o.rotation.y = s.yaw;
  }

  private buildPuzzles() {
    for (const p of this.scn.puzzles) {
      if (p.auto || p.prop === 'gate') continue;
      const list: THREE.Object3D[] = [];
      if (p.prop === 'cannons' && p.interaction.type === 'stations') {
        p.interaction.stations.forEach((st, i) => {
          const s = DECK_FEATURES.cannons[i];
          const g = buildProp('cannons');
          this.place(g, s, DECK.y);
          const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ map: glyphTexture(GLYPHS[st.symbol].char, GLYPHS[st.symbol].color) }));
          disc.position.set(0, 0.42, -0.52);
          disc.rotation.y = Math.PI;
          g.add(disc);
          this.add(g);
          this.pickable(g, { kind: 'cannon', id: p.id, button: st.id });
          list.push(g);
        });
        this.puzzleMeshes.set(p.id, list);
        continue;
      }
      const symbols = p.interaction.type === 'sequence' ? p.interaction.buttons.map((b) => b.symbol) : undefined;
      const g = buildProp(p.prop, { symbols });
      const fixed = p.area === 'deck' ? (DECK_FEATURES as Record<string, unknown>)[p.prop] as Spot | undefined : undefined;
      let spot = fixed ?? this.spotFor(p.area, p.slot);
      // Bulky floor props stand a little way out from the wall.
      if (!fixed && FLOOR_PROPS.has(p.prop)) spot = { ...spot, x: spot.x + Math.sin(spot.yaw) * 1.1, z: spot.z + Math.cos(spot.yaw) * 1.1 };
      const floorY = FLOOR_PROPS.has(p.prop) ? (p.area === 'deck' ? DECK.y : 0) : undefined;
      this.place(g, spot, floorY);
      if (p.prop === 'davit') this.davit = g;
      this.add(g);
      this.pickable(g, { kind: 'puzzle', id: p.id });
      list.push(g);
      this.puzzleMeshes.set(p.id, list);
    }
  }

  private buildClues() {
    let parrotPlaced = false;
    for (const c of this.scn.clues) {
      if (c.kind === 'reveal' || c.slot < 0) continue;
      const g = buildClue(c.kind);
      const s = this.spotFor(c.area, c.slot);
      if (c.kind === 'parrot') {
        this.place(g, { ...s, y: Math.max(s.y, 1.5) });
        this.parrot = g;
        parrotPlaced = true;
        this.pickable(g, { kind: 'parrot', id: c.id });
      } else {
        this.place(g, s);
        this.pickable(g, { kind: 'clue', id: c.id });
      }
      g.visible = false;
      this.add(g);
      this.clueMeshes.set(c.id, g);
    }
    if (!parrotPlaced) {
      // The parrot is always aboard, even when it guards no clue: it chatters and delivers hints.
      const g = buildParrot();
      this.place(g, PARROT_DEFAULT);
      this.parrot = g;
      this.add(g);
      this.pickable(g, { kind: 'parrot', id: '' });
    }
  }

  private buildItems() {
    for (const it of this.scn.items) {
      const g = buildItem(it.kind);
      g.visible = false;
      this.add(g);
      this.itemMeshes.set(it.id, g);
      this.pickable(g, { kind: 'item', id: it.id });
    }
  }

  private pickable(o: THREE.Object3D, data: Omit<PickTarget, 'object'>) {
    o.userData.pick = data;
    this.pickables.push(o);
    if (data.kind !== 'player' && data.kind !== 'ladder' && data.kind !== 'hatch') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(0.35);
      this.add(s);
      this.glints.set(o, s);
    }
  }

  // ---------- avatars ----------
  syncAvatars(players: { id: string; name: string; color: string; connected: boolean }[], me: string) {
    for (const p of players) {
      if (p.id === me) continue;
      let a = this.avatars.get(p.id);
      if (!a) {
        const group = buildAvatar(p.color);
        const label = labelSprite(p.name, '#fff');
        label.position.y = 2.15;
        group.add(label);
        const speaking = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 16), new THREE.MeshBasicMaterial({ color: '#7cf29a' }));
        speaking.rotation.x = Math.PI / 2;
        speaking.position.y = 1.92;
        speaking.visible = false;
        group.add(speaking);
        this.add(group);
        a = { group, label, target: new THREE.Vector3(), yaw: 0, area: 'hold', speaking };
        this.avatars.set(p.id, a);
        this.pickable(group, { kind: 'player', id: p.id });
        group.visible = false;
      }
      a.group.traverse((o) => {
        if ((o as THREE.Mesh).material && o !== a!.label && o !== a!.speaking) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = p.connected ? 1 : 0.35;
      });
    }
  }

  setAvatarTarget(id: string, x: number, y: number, z: number, yaw: number, area: AreaId) {
    const a = this.avatars.get(id);
    if (!a) return;
    if (!a.group.visible) a.group.position.set(x, y, z);
    a.group.visible = true;
    a.target.set(x, y, z);
    a.yaw = yaw;
    a.area = area;
  }

  hideAvatar(id: string) {
    const a = this.avatars.get(id);
    if (a) a.group.visible = false;
  }

  avatarPosition(id: string): THREE.Vector3 | undefined {
    return this.avatars.get(id)?.group.position;
  }

  setSpeaking(id: string, on: boolean) {
    const a = this.avatars.get(id);
    if (a) a.speaking.visible = on;
  }

  // ---------- state ----------
  applyState(s: StateView, me: string, glintRange: number, camPos: THREE.Vector3) {
    // Doors.
    // Practice runs let a small crew roam between cages.
    const open = s.practice ? this.cages.map((c) => c.index) : [...s.cagesOpen].sort();
    const key = `${open.join(',')}|${s.act}`;
    if (key !== this.openState) {
      this.openState = key;
      this.colliders = buildColliders(this.cages, new Set(open), s.act >= 3);
    }
    for (const [i, door] of this.cageDoors) door.userData.open = open.includes(i);
    this.quartersDoor.userData.open = s.act >= 3;
    // Clues.
    const revealed = new Set(s.revealedClues);
    for (const [id, m] of this.clueMeshes) m.visible = revealed.has(id);
    // Items.
    for (const it of s.items) {
      const m = this.itemMeshes.get(it.id)!;
      if (it.gone || !it.visible || it.holder === me) {
        m.visible = false;
        if (m.parent !== this.scene) this.scene.add(m);
        continue;
      }
      m.visible = true;
      if (it.holder) {
        const a = this.avatars.get(it.holder);
        if (a && m.parent !== a.group) {
          a.group.add(m);
          m.position.set(0.32, 1.0, -0.25);
          m.rotation.set(0, 0, 0);
        }
        continue;
      }
      if (m.parent !== this.scene) this.scene.add(m);
      if (it.pos) m.position.set(it.pos[0], it.pos[1], it.pos[2]);
      else {
        const sp = this.spotFor(it.area, it.slot);
        // Items on wall slots sit on a small shelf height; cage floor slots on the floor.
        m.position.set(sp.x, sp.y < 0.5 ? sp.y : Math.min(sp.y, 0.95), sp.z);
        m.rotation.y = sp.yaw;
      }
    }
    // Glints show what can be interacted with right now.
    const available = new Set(s.puzzles.filter((p) => p.available).map((p) => p.id));
    for (const [o, glint] of this.glints) {
      const pick = o.userData.pick as PickTarget;
      let active = o.visible;
      if (pick.kind === 'puzzle' || pick.kind === 'cannon') active = available.has(pick.id);
      if (pick.kind === 'item') {
        const st = s.items.find((x) => x.id === pick.id);
        active = !!st && st.visible && !st.gone && !st.holder;
      }
      if (pick.kind === 'parrot' && !pick.id) active = false;
      const world = new THREE.Vector3();
      o.getWorldPosition(world);
      const near = world.distanceTo(camPos) < glintRange;
      glint.visible = active && o.visible && near;
      glint.position.copy(world).add(new THREE.Vector3(0, pick.kind === 'item' ? 0.35 : 0.6, 0));
    }
    // Lifeboat.
    if (this.davit) this.davit.userData.lowered = s.lifeboatReady;
  }

  setWater(level: number) {
    this.waterLevel = level;
  }

  // ---------- picking ----------
  pick(ndc: THREE.Vector2, maxDist: number): PickTarget | undefined {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    ray.far = maxDist;
    const hits = ray.intersectObjects(this.pickables.filter((o) => o.visible), true);
    // The deck and the hold are stacked; never pick through the floor or ceiling between them.
    const camOnDeck = this.camera.position.y > DECK.y;
    for (const h of hits) {
      if (camOnDeck !== h.point.y > DECK.y - 0.3) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o && o.visible) return { ...(o.userData.pick as Omit<PickTarget, 'object'>), object: o };
    }
    return undefined;
  }

  setHover(o?: THREE.Object3D) {
    if (o === this.hovered) return;
    const tint = (obj: THREE.Object3D | undefined, on: boolean) =>
      obj?.traverse((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!m || !('emissive' in m) || c.type === 'Sprite') return;
        if (on) {
          c.userData.prevEmissive ??= m.emissive.clone();
          m.emissive.set('#6b5320');
        } else if (c.userData.prevEmissive) {
          m.emissive.copy(c.userData.prevEmissive);
          delete c.userData.prevEmissive;
        }
      });
    tint(this.hovered, false);
    this.hovered = o;
    tint(o, true);
  }

  // ---------- effects ----------
  fxPass(itemKind: Parameters<typeof buildItem>[0], from: THREE.Vector3, to: THREE.Vector3) {
    const m = buildItem(itemKind);
    this.add(m);
    this.flights.push({ mesh: m, from: from.clone().add(new THREE.Vector3(0, 1.3, 0)), to: to.clone().add(new THREE.Vector3(0, 1.2, 0)), t: 0, dur: 0.7 });
  }

  fxCannon(puzzleId: string, button: string) {
    const list = this.puzzleMeshes.get(puzzleId) ?? [];
    const g = list.find((o) => (o.userData.pick as PickTarget).button === button);
    if (!g) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), color: '#ffcf8a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const p = new THREE.Vector3(0, 0.6, 1.4).applyMatrix4(g.matrixWorld);
    s.position.copy(p);
    s.scale.setScalar(2);
    this.add(s);
    this.puffs.push({ sprite: s, t: 0 });
    this.flash(0.8);
    this.shake = Math.max(this.shake, 0.25);
  }

  flash(intensity: number) {
    this.lightning.intensity = Math.max(this.lightning.intensity, intensity * 4);
  }

  // ---------- frame ----------
  update(dt: number, cameraArea: AreaId) {
    this.time += dt;
    const t = this.time;
    // Water surface.
    const pos = this.waterMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.6 + t * 1.3) * 0.04 + Math.cos(y * 0.8 + t * 0.9) * 0.04);
    }
    pos.needsUpdate = true;
    this.waterMesh.position.y += (this.waterLevel - this.waterMesh.position.y) * Math.min(1, dt * 0.8);
    (this.waterMesh.material as THREE.MeshStandardMaterial).map!.offset.set(t * 0.01, t * 0.007);
    // Sea swell.
    const sp = this.sea.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 0.15 + t) * 0.6 + Math.cos(sp.getY(i) * 0.2 + t * 0.7) * 0.5);
    sp.needsUpdate = true;
    // Rain only on deck.
    const onDeck = cameraArea === 'deck';
    this.rain.visible = onDeck;
    (this.scene.fog as THREE.FogExp2).density = onDeck ? 0.016 : 0.028;
    if (onDeck) {
      const rp = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rp.count; i += 2) {
        let y = rp.getY(i) - dt * 14;
        if (y < DECK.y) y += 18;
        rp.setY(i, y);
        rp.setY(i + 1, y + 0.5);
      }
      rp.needsUpdate = true;
      this.rain.position.x = this.camera.position.x;
    }
    // Lightning decay.
    this.lightning.intensity *= Math.pow(0.02, dt);
    // Lantern flicker and ship sway.
    this.lanterns.forEach((l, i) => (l.intensity = 8 + Math.sin(t * 7 + i * 3) * 0.6 + Math.sin(t * 13 + i) * 0.4));
    // Doors.
    for (const door of this.cageDoors.values()) {
      const target = door.userData.open ? -1.9 : 0;
      door.rotation.y += (target - door.rotation.y) * Math.min(1, dt * 3);
    }
    const qd = this.quartersDoor;
    const qTarget = qd.userData.open ? 1.9 : 0;
    qd.position.z += (qTarget - qd.position.z) * Math.min(1, dt * 2);
    // Lifeboat lowering.
    if (this.davit) {
      const boat = this.davit.getObjectByName('boat');
      if (boat) {
        const target = this.davit.userData.lowered ? -2.0 : 1.2;
        boat.position.y += (target - boat.position.y) * Math.min(1, dt * 0.8);
        boat.position.z = this.davit.userData.lowered ? 1.9 : 1.25;
      }
    }
    // Parrot bob.
    const bird = this.parrot?.getObjectByName('bird');
    if (bird) {
      bird.position.y = Math.abs(Math.sin(t * 2.2)) * 0.03;
      bird.rotation.y = Math.sin(t * 0.7) * 0.6;
    }
    // Spinning parts.
    for (const o of this.animated) {
      if (o.name === 'spin') o.rotation.z = Math.sin(t * 0.4) * 0.3;
      else o.scale.x = 1 + Math.sin(t * 2 + o.position.x) * 0.04;
    }
    // Avatars.
    for (const a of this.avatars.values()) {
      a.group.position.lerp(a.target, Math.min(1, dt * 10));
      let dy = a.yaw - a.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.group.rotation.y += dy * Math.min(1, dt * 10);
    }
    // Glints pulse.
    for (const g of this.glints.values()) if (g.visible) g.material.opacity = 0.45 + Math.sin(t * 4 + g.position.x) * 0.35;
    // Thrown items.
    this.flights = this.flights.filter((f) => {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.mesh.position.lerpVectors(f.from, f.to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
      f.mesh.rotation.x += dt * 10;
      if (k >= 1) this.scene.remove(f.mesh);
      return k < 1;
    });
    this.puffs = this.puffs.filter((p) => {
      p.t += dt;
      p.sprite.scale.setScalar(2 + p.t * 4);
      p.sprite.material.opacity = Math.max(0, 1 - p.t * 1.5);
      if (p.t > 0.7) this.scene.remove(p.sprite);
      return p.t <= 0.7;
    });
    // Ship roll grows as the storm worsens.
    const roll = Math.sin(t * 0.6) * 0.012 + Math.sin(t * 1.7) * 0.004;
    this.camera.rotation.z = roll + (this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0);
    this.shake = Math.max(0, this.shake - dt);
    if (!World.headless) this.renderer.render(this.scene, this.camera);
  }

  puzzleWorldPos(id: string): THREE.Vector3 | undefined {
    const o = this.puzzleMeshes.get(id)?.[0];
    if (!o) return undefined;
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    return v;
  }
}
