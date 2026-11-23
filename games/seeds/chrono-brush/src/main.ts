/**
 * 実験：時空の絵筆（Chrono Brush）。本編に入れるかを決めるための小さな試作。
 * ドラッグで「遅い時間（青）」、右ドラッグで「速い時間（赤）」を塗り、降ってくる星を揺れる籠へ導く。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite, Container } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { ChronoSim, defaults, VIEW_W, VIEW_H, HZ } from './sim';

const params = new URLSearchParams(location.search);

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0b0d2a', '#020308'));
  const field = makeStarfield(VIEW_W, VIEW_H, 160, 61);
  const zoneG = new Graphics();
  const basketG = new Graphics();
  const starLayer = new Container();
  const particles = new Particles(1500);
  ga.world.addChild(sky, field.container, zoneG, basketG, starLayer, particles.container);
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const center = el('div', { class: 'center' });
  hud.append(tl, center);
  document.body.appendChild(hud);

  let sim = new ChronoSim(defaults, 1);
  let sprites: Sprite[] = [];
  let autoplay = params.has('autoplay');
  let painting: 'slow' | 'fast' | null = null;
  let t = 0;
  const restart = () => {
    sim = new ChronoSim(defaults, Math.floor(Math.random() * 1000));
    starLayer.removeChildren();
    sprites = [];
    center.innerHTML = '';
  };

  const paintAt = (cx: number, cy: number) => {
    if (!painting) return;
    const p = ga.toLogical(cx, cy);
    if (sim.paint(p.x, p.y, painting)) synth.tone(painting === 'slow' ? 330 : 660, 0.2, { type: 'sine', vol: 0.05, slideTo: painting === 'slow' ? 220 : 990 });
  };
  ga.app.canvas.addEventListener('pointerdown', (e) => { synth.unlock(); painting = e.button === 2 ? 'fast' : 'slow'; paintAt(e.clientX, e.clientY); });
  window.addEventListener('pointermove', (e) => paintAt(e.clientX, e.clientY));
  window.addEventListener('pointerup', () => { painting = null; });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyR') restart(); });

  /** 自動プレイ：籠に間に合わない星の行く手に、遅い時間を塗る */
  const bot = () => {
    if (sim.tick % 30 !== 0) return;
    for (const s of sim.stars) {
      if (!s.alive || s.y < 120 || s.y > VIEW_H - 150) continue;
      if (sim.rate(s.x, s.y + 40) < 1) continue;
      const fall = (VIEW_H - 40 - s.y) / Math.max(60, s.vy);
      const later = new ChronoSim(defaults);
      later.tick = sim.tick + Math.round(fall * HZ);
      if (Math.abs(later.basketX() - s.x) > defaults.basketW / 2) sim.paint(s.x, s.y + 50, 'slow');
    }
  };

  const loop = new FixedLoop({
    update: () => {
      if (autoplay) bot();
      sim.step();
      for (const e of sim.events) {
        if (e.t === 'catch') {
          particles.emit(e.x, e.y, { count: 40, speed: [60, 300], life: [0.4, 1], size: [0.05, 0.18], color: [0xffd98a, 0xffffff] });
          synth.hbell(3 + e.n, 0.1, 1.2);
          juice.shake(0.1);
        } else if (e.t === 'miss') {
          particles.emit(e.x, e.y, { count: 14, speed: [30, 120], life: [0.2, 0.5], size: [0.04, 0.1], color: 0x6a74c9 });
          synth.tone(200, 0.3, { type: 'sine', vol: 0.06, slideTo: 90 });
        } else if (e.t === 'end') {
          center.innerHTML = `<div class="chain">${sim.caught} / ${sim.cfg.stars}</div><div style="color:var(--dim)">R でもう一度</div>`;
          if (sim.caught >= sim.cfg.stars * 0.7) { juice.doFlash(0.5, 0xffe7a8); synth.arp([0, 2, 4, 7, 9], 0.07, 0.1); }
        }
      }
    },
    render: (_a, dt) => {
      t += dt;
      field.update(t);
      particles.update(dt);
      juice.update(dt, 1);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      // 塗った時間：遅い所は青い渦、速い所は赤い筋
      zoneG.clear();
      for (const z of sim.zones) {
        const col = z.k === 'slow' ? 0x5a8cff : 0xff6b6b;
        zoneG.circle(z.x, z.y, z.r).fill({ color: col, alpha: 0.12 });
        for (let k = 0; k < 3; k++) {
          const a = (z.k === 'slow' ? t * 0.4 : t * 3) + (k * Math.PI * 2) / 3;
          const rr = z.r * (0.5 + k * 0.2);
          zoneG.moveTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr).arc(z.x, z.y, rr, a, a + 1.4).stroke({ width: 2, color: col, alpha: 0.4 });
        }
      }
      // 籠
      const bx = sim.basketX(), by = VIEW_H - 40, w = sim.cfg.basketW;
      basketG.clear();
      basketG.moveTo(bx - w / 2, by - 20).lineTo(bx - w / 2 + 12, by + 12).lineTo(bx + w / 2 - 12, by + 12).lineTo(bx + w / 2, by - 20).stroke({ width: 3, color: 0xffd98a, alpha: 0.85 });
      for (const [px, py] of [[bx - w / 2, by - 20], [bx - w / 2 + 12, by + 12], [bx + w / 2 - 12, by + 12], [bx + w / 2, by - 20]]) basketG.circle(px, py, 3.5).fill({ color: 0xffffff });
      // 星
      while (sprites.length < sim.stars.length) {
        const sp = new Sprite(glowTexture());
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        sp.scale.set(0.35);
        starLayer.addChild(sp);
        sprites.push(sp);
      }
      sim.stars.forEach((s, i) => {
        const sp = sprites[i];
        sp.visible = s.alive;
        sp.x = s.x; sp.y = s.y;
        const r = sim.rate(s.x, s.y);
        sp.tint = r < 1 ? 0x9fc0ff : r > 1 ? 0xffb3b3 : 0xfff3d6;
      });
      tl.innerHTML = `<div>実験：時空の絵筆</div><div class="big">籠 ${sim.caught} / ${sim.cfg.stars}</div><div style="font-size:13px;color:var(--dim)">インク ${sim.ink}　ドラッグ＝遅い時間（青）　右ドラッグ＝速い時間（赤）　R＝やり直し</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);
  const hook = installDebugHook('chrono-brush', () => ({ caught: sim.caught, missed: sim.missed, ink: sim.ink, done: sim.done }));
  loop.start();
  hook.ready = true;
}

void main();
