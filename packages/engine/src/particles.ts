/** 使い回し型のパーティクル。加算合成の光の粒 */
import { Container, Sprite, Texture } from 'pixi.js';
import { glowTexture } from './gfx';
import { fxRandom } from './rng';

interface P {
  sp: Sprite;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; drag: number; grav: number; spin: number; grow: number;
  alive: boolean;
}

export interface EmitOpts {
  count?: number;
  speed?: [number, number];
  life?: [number, number];
  size?: [number, number];
  color?: number | number[];
  gravity?: number;
  drag?: number;
  spread?: number; // ラジアン。既定は全方向
  angle?: number;
  grow?: number;
  texture?: Texture;
  alpha?: number;
}

export class Particles {
  readonly container = new Container();
  private pool: P[] = [];
  private active: P[] = [];
  multiplier = 1;

  constructor(private max = 2500) {}

  emit(x: number, y: number, o: EmitOpts = {}): void {
    const n = Math.round((o.count ?? 20) * this.multiplier);
    const tex = o.texture ?? glowTexture();
    for (let i = 0; i < n; i++) {
      if (this.active.length >= this.max) return;
      let p = this.pool.pop();
      if (!p) {
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        p = { sp, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, drag: 0, grav: 0, spin: 0, grow: 0, alive: true };
      }
      p.sp.texture = tex;
      const ang = o.spread !== undefined ? (o.angle ?? 0) + fxRandom(-o.spread / 2, o.spread / 2) : fxRandom(0, Math.PI * 2);
      const sp = fxRandom(...(o.speed ?? [50, 300]));
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      p.max = p.life = fxRandom(...(o.life ?? [0.4, 1.2]));
      p.size = fxRandom(...(o.size ?? [0.08, 0.3]));
      p.drag = o.drag ?? 2;
      p.grav = o.gravity ?? 0;
      p.grow = o.grow ?? 0;
      p.spin = fxRandom(-4, 4);
      const c = o.color ?? 0xffffff;
      p.sp.tint = Array.isArray(c) ? c[Math.floor(Math.random() * c.length)] : c;
      p.sp.alpha = o.alpha ?? 1;
      // update() を待たずに位置と大きさを決める（止まった世界で出した粒が左上に大きく出ないように）
      p.sp.x = x; p.sp.y = y;
      p.sp.scale.set(p.size);
      p.alive = true;
      this.container.addChild(p.sp);
      this.active.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.container.removeChild(p.sp);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.pool.push(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const t = p.life / p.max;
      p.sp.x = p.x; p.sp.y = p.y;
      p.sp.scale.set(p.size * (1 + p.grow * (1 - t)) * (0.4 + 0.6 * t));
      p.sp.alpha = Math.min(1, t * 1.6);
      p.sp.rotation += p.spin * dt;
    }
  }

  get count(): number {
    return this.active.length;
  }
}
