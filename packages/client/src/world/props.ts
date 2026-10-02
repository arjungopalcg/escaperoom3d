// Low-poly prop, item and clue meshes built from primitives.
import * as THREE from 'three';
import { GLYPHS, type ClueKind, type ItemKind, type PropKind, type SymbolId } from '@crimson/engine';
import { carving, glyphTexture, iron, parchment, planks, slate } from './textures.ts';

const mats = {
  wood: () => new THREE.MeshStandardMaterial({ map: planks('#6d4a2a'), roughness: 0.9 }),
  darkWood: () => new THREE.MeshStandardMaterial({ color: '#3b2716', roughness: 0.9 }),
  iron: () => new THREE.MeshStandardMaterial({ map: iron(), color: '#8a8580', metalness: 0.6, roughness: 0.55 }),
  brass: () => new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.8, roughness: 0.35 }),
  rope: () => new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 1 }),
  paper: () => new THREE.MeshStandardMaterial({ map: parchment(), roughness: 1, side: THREE.DoubleSide }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
}

function glyphDisc(sym: SymbolId, size = 0.22): THREE.Mesh {
  const g = GLYPHS[sym];
  const m = mesh(
    new THREE.CircleGeometry(size, 24),
    new THREE.MeshStandardMaterial({ map: glyphTexture(g.char, g.color), emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: glyphTexture(g.char, g.color) }),
  );
  return m;
}

/** Puzzle props. `extra` carries symbols for valve banks etc. */
export function buildProp(kind: PropKind, extra: { symbols?: SymbolId[] } = {}): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'symbolLock': {
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), mats.wood(), 0, 0, -0.02));
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.34, 0.16), mats.iron(), 0, -0.02, 0.08));
      const shackle = mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 16, Math.PI), mats.iron(), 0, 0.15, 0.08);
      g.add(shackle);
      for (let i = 0; i < 4; i++) {
        const w = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), mats.brass(), -0.14 + i * 0.093, -0.04, 0.18);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
      break;
    }
    case 'hook': {
      const arm = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), mats.darkWood(), 0, 0.9, 0.45);
      g.add(arm);
      const hook = mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12, Math.PI * 1.4), mats.iron(), 0, 0.78, 0.85);
      g.add(hook);
      g.add(buildItem('key', 0.9).translateY(0.62).translateZ(0.85));
      break;
    }
    case 'knotPost': {
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.3, 8), mats.darkWood(), 0, -0.45, 0.1));
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 18), mats.rope(), 0, 0.05, 0.1));
      g.add(mesh(new THREE.BoxGeometry(0.25, 0.14, 0.12), mats.iron(), 0, -0.2, 0.14));
      break;
    }
    case 'compass': {
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.1, 20), mats.brass(), 0, -0.3, 0.2));
      const glass = mesh(new THREE.CircleGeometry(0.19, 20), new THREE.MeshStandardMaterial({ color: '#e8e2c8' }), 0, -0.24, 0.2);
      glass.rotation.x = -Math.PI / 2;
      g.add(glass);
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.36, 0.06), mats.wood(), 0, 0.15, -0.02));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), mats.iron(), 0, 0.15, 0.05));
      break;
    }
    case 'codeLock':
    case 'chest': {
      const big = kind === 'chest';
      const w = big ? 1.0 : 0.5;
      const yb = big ? -0.75 : -0.05;
      g.add(mesh(new THREE.BoxGeometry(w, big ? 0.55 : 0.36, big ? 0.6 : 0.3), big ? mats.wood() : mats.iron(), 0, yb, big ? 0.35 : 0.12));
      g.add(mesh(new THREE.BoxGeometry(w + 0.04, 0.08, (big ? 0.6 : 0.3) + 0.04), mats.iron(), 0, yb + (big ? 0.28 : 0.18), big ? 0.35 : 0.12));
      for (let i = 0; i < 4; i++) {
        const d = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10), mats.brass(), -0.15 + i * 0.1, yb + 0.05, (big ? 0.66 : 0.28));
        d.rotation.z = Math.PI / 2;
        g.add(d);
      }
      break;
    }
    case 'wordLock':
    case 'speakingTube': {
      if (kind === 'speakingTube') {
        const pipe = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10), mats.brass(), 0, 0.3, 0.1);
        g.add(pipe);
        const horn = mesh(new THREE.ConeGeometry(0.16, 0.25, 14, 1, true), mats.brass(), 0, -0.1, 0.25);
        horn.rotation.x = -Math.PI / 2;
        g.add(horn);
      }
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.22, 0.08), mats.brass(), 0, kind === 'speakingTube' ? -0.45 : 0, 0.06));
      for (let i = 0; i < 6; i++) {
        const r = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10), mats.iron(), -0.22 + i * 0.088, kind === 'speakingTube' ? -0.45 : 0, 0.12);
        r.rotation.z = Math.PI / 2;
        g.add(r);
      }
      break;
    }
    case 'parchment': {
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.04), mats.darkWood(), 0, 0.3, -0.03));
      g.add(mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshStandardMaterial({ color: '#e9dcb5', roughness: 1 }), 0, 0.3, 0.0));
      break;
    }
    case 'scale': {
      g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20), mats.iron(), 0, -1.0, 0.8));
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.04, 1.0), mats.darkWood(), 1.0, -1.08, 0.8));
      for (let i = 0; i < 4; i++) {
        const c = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), mats.iron(), Math.cos(i * 1.57) * 0.5, -0.4, 0.8 + Math.sin(i * 1.57) * 0.5);
        g.add(c);
      }
      for (let i = 0; i < 6; i++) {
        const b = buildBarrel();
        b.position.set(-1.0 + (i % 3) * 0.45, -1.1, 0.4 + Math.floor(i / 3) * 0.55);
        g.add(b);
      }
      break;
    }
    case 'valves': {
      const pipe = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 10), mats.iron(), 0, 0.1, 0.2);
      pipe.rotation.z = Math.PI / 2;
      g.add(pipe);
      const syms = extra.symbols ?? [];
      for (let i = 0; i < 5; i++) {
        const x = -0.96 + i * 0.48;
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6), mats.iron(), x, 0.1, 0.35).rotateX(Math.PI / 2));
        const color = syms[i] ? GLYPHS[syms[i]].color : '#888';
        const wheel = mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 }), x, 0.1, 0.48);
        g.add(wheel);
        if (syms[i]) {
          const d = glyphDisc(syms[i], 0.09);
          d.position.set(x, 0.4, 0.22);
          g.add(d);
        }
      }
      break;
    }
    case 'wheel': {
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8), mats.darkWood(), 0, 0.55, 0));
      const wheel = new THREE.Group();
      wheel.add(mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 24), mats.wood()));
      for (let i = 0; i < 8; i++) {
        const s = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), mats.wood());
        s.rotation.z = (i * Math.PI) / 8;
        wheel.add(s);
      }
      wheel.position.set(0, 1.3, 0.2);
      wheel.name = 'spin';
      g.add(wheel);
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 10), mats.brass(), 0.9, 0.5, 0));
      break;
    }
    case 'cannons': {
      // A single gun; the scene places one per station.
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.3, 1.0), mats.darkWood(), 0, 0.25, 0));
      for (const x of [-0.36, 0.36])
        for (const z of [-0.35, 0.35]) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10), mats.darkWood(), x, 0.15, z).rotateZ(Math.PI / 2));
      const barrel = mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.5, 12), mats.iron(), 0, 0.55, 0.2);
      barrel.rotation.x = Math.PI / 2;
      g.add(barrel);
      break;
    }
    case 'navTable': {
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.06, 1.0), mats.wood(), 0, 0.95, 0));
      for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), mats.darkWood(), x, 0.47, z));
      const rose = mesh(new THREE.CircleGeometry(0.4, 8), new THREE.MeshStandardMaterial({ color: '#e7d7a8' }), 0, 0.99, 0);
      rose.rotation.x = -Math.PI / 2;
      g.add(rose);
      break;
    }
    case 'capstan': {
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 12), mats.wood(), 0, 0.5, 0));
      for (let i = 0; i < 6; i++) {
        const bar = mesh(new THREE.BoxGeometry(1.8, 0.07, 0.07), mats.darkWood(), 0, 0.95, 0);
        bar.rotation.y = (i * Math.PI) / 6;
        g.add(bar);
      }
      g.children.forEach((c) => (c.name = 'spinPart'));
      break;
    }
    case 'davit': {
      for (const x of [-2.2, 2.2]) {
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), mats.iron(), x, 1.3, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), mats.iron(), x, 2.55, 0.6).rotateX(Math.PI / 2));
        g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.5, 4), mats.rope(), x, 1.9, 1.2));
      }
      const boat = buildLifeboat();
      boat.position.set(0, 1.2, 1.25);
      boat.name = 'boat';
      g.add(boat);
      break;
    }
    case 'stash': {
      const sign = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), mats.wood(), 0, 1.2, 0);
      g.add(sign);
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), mats.darkWood(), 0, 0.6, -0.04));
      const x = mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ map: glyphTexture('✕', '#d8433a'), transparent: true }), 0, 1.2, 0.03);
      g.add(x);
      break;
    }
    case 'gate':
      break;
  }
  return g;
}

export function buildBarrel(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12), new THREE.MeshStandardMaterial({ map: planks('#7a5530', [1, 1], 7), roughness: 0.9 }), 0, 0.25, 0));
  for (const y of [0.08, 0.42]) g.add(mesh(new THREE.TorusGeometry(0.205, 0.015, 4, 16), mats.iron(), 0, y, 0).rotateX(Math.PI / 2));
  return g;
}

export function buildLifeboat(): THREE.Group {
  const g = new THREE.Group();
  const hull = mesh(new THREE.CylinderGeometry(0.75, 0.55, 3.6, 10, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ map: planks('#8a5a32'), side: THREE.DoubleSide }));
  hull.rotation.z = Math.PI / 2;
  hull.rotation.y = Math.PI / 2;
  hull.rotation.x = Math.PI;
  g.add(hull);
  for (const x of [-0.8, 0, 0.8]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.06, 1.2), mats.darkWood(), x, -0.2, 0));
  g.rotation.y = Math.PI / 2;
  return g;
}

export function buildItem(kind: ItemKind, scale = 1): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'rope':
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.16 - i * 0.02, 0.03, 6, 16), mats.rope(), 0, 0.04 + i * 0.05, 0).rotateX(Math.PI / 2));
      break;
    case 'needle': {
      const a = mesh(new THREE.ConeGeometry(0.02, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#c62e2e' }), 0, 0.03, -0.09);
      a.rotation.x = -Math.PI / 2;
      const b = mesh(new THREE.ConeGeometry(0.02, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#dddddd' }), 0, 0.03, 0.09);
      b.rotation.x = Math.PI / 2;
      g.add(a, b);
      break;
    }
    case 'lantern':
    case 'litLantern': {
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.2), mats.iron(), 0, 0.02, 0));
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.2), mats.iron(), 0, 0.32, 0));
      const lit = kind === 'litLantern';
      g.add(
        mesh(
          new THREE.BoxGeometry(0.16, 0.26, 0.16),
          new THREE.MeshStandardMaterial({ color: lit ? '#ffcf6a' : '#8fa0a0', emissive: lit ? '#ffb030' : '#000000', emissiveIntensity: lit ? 1.6 : 0, transparent: true, opacity: 0.8 }),
          0,
          0.17,
          0,
        ),
      );
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.01, 4, 10), mats.iron(), 0, 0.4, 0));
      break;
    }
    case 'tinderbox':
      g.add(mesh(new THREE.BoxGeometry(0.18, 0.07, 0.12), mats.brass(), 0, 0.035, 0));
      break;
    case 'key':
    case 'brassKey': {
      const m = kind === 'brassKey' ? mats.brass() : mats.iron();
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), m, 0, 0.03, -0.08).rotateX(Math.PI / 2));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.18), m, 0, 0.03, 0.04));
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), m, 0, 0.0, 0.12));
      break;
    }
    case 'weight':
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), mats.iron(), 0, 0.06, 0));
      break;
  }
  g.scale.setScalar(scale * 1.6);
  return g;
}

export function buildClue(kind: ClueKind): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'carving':
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), new THREE.MeshStandardMaterial({ map: carving(), roughness: 1 })));
      break;
    case 'slate':
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.04), new THREE.MeshStandardMaterial({ map: slate() })));
      break;
    case 'chart':
    case 'map':
    case 'note':
    case 'letter':
    case 'fragment': {
      const w = kind === 'chart' || kind === 'map' ? 0.8 : kind === 'fragment' ? 0.9 : 0.4;
      const h = kind === 'chart' || kind === 'map' ? 0.6 : kind === 'fragment' ? 0.3 : 0.5;
      const p = mesh(new THREE.PlaneGeometry(w, h), kind === 'fragment' ? new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 1 }) : mats.paper());
      p.position.z = 0.02;
      g.add(p);
      if (kind === 'fragment') {
        const letters = mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.6), new THREE.MeshBasicMaterial({ color: '#e8d9a8', transparent: true, opacity: 0.35 }), 0, 0, 0.03);
        g.add(letters);
      }
      if (kind === 'letter' || kind === 'note') g.rotation.x = 0;
      break;
    }
    case 'logbook': {
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: '#5a1f16' }), 0, -0.05, 0.2));
      g.add(mesh(new THREE.PlaneGeometry(0.46, 0.32), mats.paper(), 0, -0.015, 0.2).rotateX(-Math.PI / 2));
      break;
    }
    case 'parrot':
      return buildParrot();
    case 'reveal':
      break;
  }
  return g;
}

export function buildParrot(): THREE.Group {
  const g = new THREE.Group();
  const perch = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), mats.darkWood(), 0, 0, 0.15);
  perch.rotation.z = Math.PI / 2;
  g.add(perch);
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), mats.darkWood(), 0, 0.3, 0.0).rotateX(0.5));
  const bird = new THREE.Group();
  bird.name = 'bird';
  const green = new THREE.MeshStandardMaterial({ color: '#2fa84f', roughness: 0.7, flatShading: true });
  const torso = mesh(new THREE.SphereGeometry(0.1, 6, 5), green, 0, 0.13, 0.15);
  torso.scale.set(1, 1.4, 1);
  bird.add(torso);
  bird.add(mesh(new THREE.SphereGeometry(0.075, 6, 5), green, 0, 0.27, 0.17));
  bird.add(mesh(new THREE.ConeGeometry(0.03, 0.07, 5), new THREE.MeshStandardMaterial({ color: '#f2c94c' }), 0, 0.25, 0.25).rotateX(Math.PI / 2));
  const wing = new THREE.MeshStandardMaterial({ color: '#d0392b', flatShading: true });
  bird.add(mesh(new THREE.BoxGeometry(0.03, 0.14, 0.1), wing, -0.09, 0.13, 0.13), mesh(new THREE.BoxGeometry(0.03, 0.14, 0.1), wing, 0.09, 0.13, 0.13));
  bird.add(mesh(new THREE.BoxGeometry(0.05, 0.18, 0.03), new THREE.MeshStandardMaterial({ color: '#2b6cb0' }), 0, 0.0, 0.09).rotateX(0.4));
  for (const x of [-0.035, 0.035]) bird.add(mesh(new THREE.SphereGeometry(0.012, 4, 4), new THREE.MeshBasicMaterial({ color: '#000' }), x, 0.29, 0.23));
  g.add(bird);
  return g;
}

export function buildAvatar(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: '#e0b48c', roughness: 0.8, flatShading: true });
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), body, 0, 0.95, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 6), new THREE.MeshStandardMaterial({ color: '#2a2a35' }), -0.1, 0.28, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 6), new THREE.MeshStandardMaterial({ color: '#2a2a35' }), 0.1, 0.28, 0));
  g.add(mesh(new THREE.SphereGeometry(0.19, 8, 6), skin, 0, 1.58, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 10), new THREE.MeshStandardMaterial({ color: '#c0392b' }), 0, 1.7, 0));
  // Eyes show which way the player faces.
  for (const x of [-0.07, 0.07]) g.add(mesh(new THREE.SphereGeometry(0.025, 4, 4), new THREE.MeshBasicMaterial({ color: '#111' }), x, 1.62, -0.17));
  return g;
}
