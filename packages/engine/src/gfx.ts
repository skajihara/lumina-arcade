/** 描画の共通部品：発光テクスチャ、星空の背景、色の補間 */
import { Container, Sprite, Texture } from 'pixi.js';

const texCache = new Map<string, Texture>();

function canvasTex(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size);
  const t = Texture.from(cv);
  texCache.set(key, t);
  return t;
}

/** 中心が明るく外へ柔らかく消える円（加算合成で光に見える） */
export function glowTexture(): Texture {
  return canvasTex('glow', 128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** 衝撃波のリング */
export function ringTexture(): Texture {
  return canvasTex('ring', 256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** 十字の光芒（キラッとした星） */
export function sparkleTexture(): Texture {
  return canvasTex('sparkle', 128, (c, s) => {
    const m = s / 2;
    const ray = (w: number, h: number) => {
      const g = c.createLinearGradient(m - w / 2, 0, m + w / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(m - w / 2, m - h / 2, w, h);
    };
    ray(s, 3);
    c.save();
    c.translate(m, m);
    c.rotate(Math.PI / 2);
    c.translate(-m, -m);
    ray(s, 3);
    c.restore();
    const g = c.createRadialGradient(m, m, 0, m, m, s * 0.18);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** 夜空のグラデーション＋星雲 */
export function skyTexture(w: number, h: number, top = '#0a0d2b', bottom = '#02030a', nebula: string[] = ['#3b2a8a', '#1b4b8f', '#7a2a6e']): Texture {
  return canvasTex(`sky:${w}x${h}:${top}:${bottom}:${nebula.join()}`, Math.max(w, h), (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.globalCompositeOperation = 'lighter';
    // 疑似乱数で再現性のある星雲を描く
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const x = r() * s, y = r() * s, rad = s * (0.18 + r() * 0.3);
      const ng = c.createRadialGradient(x, y, 0, x, y, rad);
      const col = nebula[i % nebula.length];
      ng.addColorStop(0, col + '55');
      ng.addColorStop(1, col + '00');
      c.fillStyle = ng;
      c.fillRect(0, 0, s, s);
    }
  });
}

export interface Starfield {
  container: Container;
  update(t: number): void;
}

/** またたく背景の星 */
export function makeStarfield(w: number, h: number, count = 160, seed = 3): Starfield {
  const container = new Container();
  const tex = glowTexture();
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const stars: { sp: Sprite; base: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.x = r() * w;
    sp.y = r() * h;
    const size = 0.04 + Math.pow(r(), 3) * 0.16;
    sp.scale.set(size);
    sp.blendMode = 'add';
    const hue = r();
    sp.tint = hue < 0.33 ? 0xbfd4ff : hue < 0.66 ? 0xffffff : 0xffe2c4;
    const base = 0.25 + r() * 0.6;
    stars.push({ sp, base, speed: 0.5 + r() * 2.5, phase: r() * 10 });
    container.addChild(sp);
  }
  return {
    container,
    update(t: number) {
      for (const st of stars) st.sp.alpha = st.base * (0.6 + 0.4 * Math.sin(t * st.speed + st.phase));
    },
  };
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const k = Math.max(0, Math.min(1, t));
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
}

export function hsl(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
