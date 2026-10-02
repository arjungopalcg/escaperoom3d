// Procedural canvas textures keep the asset budget at zero bytes.
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const cache = new Map<string, THREE.Texture>();

function tex(key: string, make: () => HTMLCanvasElement, repeat: [number, number] = [1, 1]): THREE.Texture {
  const k = `${key}:${repeat.join('x')}`;
  let t = cache.get(k);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(k, t);
  }
  return t;
}

export function planks(base = '#5a3d24', repeat: [number, number] = [1, 1], seed = 3): THREE.Texture {
  return tex(
    `planks${base}${seed}`,
    () => {
      const [c, g] = canvas(256, 256);
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const shade = 0.82 + ((r * 37 + seed * 11) % 7) / 25;
        g.fillStyle = base;
        g.fillRect(0, (r * 256) / rows, 256, 256 / rows);
        g.fillStyle = `rgba(0,0,0,${1 - shade})`;
        g.fillRect(0, (r * 256) / rows, 256, 256 / rows);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, (r * 256) / rows, 256, 2);
        const off = ((r * 97 + seed * 31) % 200) + 20;
        g.fillRect(off, (r * 256) / rows, 2, 256 / rows);
        // grain
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          const y = (r * 256) / rows + 4 + k * 7;
          g.moveTo(0, y);
          for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + r + k) * 1.5);
          g.stroke();
        }
        g.fillStyle = 'rgba(30,20,10,0.6)';
        g.beginPath();
        g.arc(off - 8, (r * 256) / rows + 16, 1.6, 0, Math.PI * 2);
        g.arc(off + 10, (r * 256) / rows + 16, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      noise(g, 256, 256, 22, seed);
      return c;
    },
    repeat,
  );
}

export function iron(): THREE.Texture {
  return tex('iron', () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#3a3633';
    g.fillRect(0, 0, 64, 64);
    noise(g, 64, 64, 40, 7);
    g.fillStyle = 'rgba(120,60,20,0.25)';
    for (let i = 0; i < 12; i++) g.fillRect((i * 23) % 64, (i * 41) % 64, 6, 3);
    return c;
  });
}

export function parchment(): THREE.Texture {
  return tex('parchment', () => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 90);
    grad.addColorStop(0, '#efe0b8');
    grad.addColorStop(1, '#b89a63');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(60,40,20,0.45)';
    for (let y = 22; y < 112; y += 12) {
      g.beginPath();
      g.moveTo(16, y);
      g.lineTo(16 + 70 + ((y * 7) % 30), y);
      g.stroke();
    }
    noise(g, 128, 128, 18, 5);
    return c;
  });
}

export function carving(): THREE.Texture {
  return tex('carving', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#6b4a2c';
    g.fillRect(0, 0, 128, 128);
    noise(g, 128, 128, 30, 9);
    g.strokeStyle = 'rgba(230,210,170,0.8)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 28;
      g.beginPath();
      g.arc(x + 6, 50, 9, 0, Math.PI * 1.6);
      g.stroke();
      for (let k = 0; k <= i; k++) {
        g.beginPath();
        g.moveTo(x + k * 4, 76);
        g.lineTo(x + k * 4, 90);
        g.stroke();
      }
    }
    return c;
  });
}

export function slate(): THREE.Texture {
  return tex('slate', () => {
    const [c, g] = canvas(128, 96);
    g.fillStyle = '#2b2f33';
    g.fillRect(0, 0, 128, 96);
    g.strokeStyle = '#8a6a44';
    g.lineWidth = 8;
    g.strokeRect(0, 0, 128, 96);
    g.fillStyle = 'rgba(230,230,230,0.8)';
    g.font = 'bold 20px serif';
    g.fillText('= ? ? stone', 18, 52);
    return c;
  });
}

export function water(): THREE.Texture {
  return tex('water', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#123f4a';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(160,220,230,0.25)';
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      const x = (i * 53) % 128;
      const y = (i * 29) % 128;
      g.arc(x, y, 6 + (i % 5), 0, Math.PI);
      g.stroke();
    }
    return c;
  }, [6, 6]);
}

/** A text label sprite (names over heads, glyphs on props). */
export function labelSprite(text: string, color = '#ffffff', bg = 'rgba(0,0,0,0.55)', size = 28): THREE.Sprite {
  const [c, g] = canvas(512, 96);
  g.font = `600 ${size * 2}px system-ui, sans-serif`;
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect((512 - w) / 2, 8, w, 80, 24);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(2.4, 0.45, 1);
  return s;
}

/** A square glyph decal for symbol-marked props. */
export function glyphTexture(char: string, color: string): THREE.Texture {
  return tex(`glyph${char}${color}`, () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#20160e';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = color;
    g.font = '72px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(char, 64, 70);
    return c;
  });
}

export function glintTexture(): THREE.Texture {
  return tex('glint', () => {
    const [c, g] = canvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.25, 'rgba(255,230,150,0.6)');
    grad.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,240,0.9)';
    g.fillRect(31, 4, 2, 56);
    g.fillRect(4, 31, 56, 2);
    return c;
  });
}
