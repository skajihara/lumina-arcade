/**
 * 実験：時空の絵筆（Chrono Brush）。本編に入れるかを決めるための小さな試作。
 * ドラッグで「遅い時間（青）」、右ドラッグで「速い時間（赤）」、Shift＋ドラッグで「逆再生（紫）」を塗り、降ってくる星を籠へ導く。
 * 風は世界の時間で吹くので、遅らせた星ほど風に運ばれる。6ステージ（数字キーか ?stage=N で選ぶ）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite, Container } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { ChronoSim, chronoStages, defaults, VIEW_W, VIEW_H, HZ, type Brush } from './sim';
import { ChronoBot } from './bot';

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

  let stageIndex = Math.min(chronoStages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = ChronoSim.of(chronoStages[stageIndex], defaults);
  let sprites: Sprite[] = [];
  let autoplay = params.has('autoplay');
  let painting: Brush | null = null;
  let t = 0;
  let bot = new ChronoBot(0.85);
  const voidG = new Graphics();
  ga.world.addChildAt(voidG, 2);
  const start = (i: number) => {
    stageIndex = i;
    sim = ChronoSim.of(chronoStages[i], defaults);
    bot = new ChronoBot(0.85);
    starLayer.removeChildren();
    sprites = [];
    center.innerHTML = `<div style="color:var(--gold)">${chronoStages[i].hint}</div>`;
    setTimeout(() => { if (sim === cur) center.innerHTML = ''; }, 3500);
    const cur = sim;
  };
  const restart = () => start(stageIndex);
  start(stageIndex);

  const paintAt = (cx: number, cy: number) => {
    if (!painting) return;
    const p = ga.toLogical(cx, cy);
    if (sim.paint(p.x, p.y, painting)) synth.tone(painting === 'fast' ? 660 : painting === 'slow' ? 330 : 440, 0.2, { type: 'sine', vol: 0.05, slideTo: painting === 'fast' ? 990 : painting === 'slow' ? 220 : 280 });
  };
  ga.app.canvas.addEventListener('pointerdown', (e) => { synth.unlock(); painting = e.button === 2 ? 'fast' : e.shiftKey || e.button === 1 ? 'rewind' : 'slow'; paintAt(e.clientX, e.clientY); });
  window.addEventListener('pointermove', (e) => paintAt(e.clientX, e.clientY));
  window.addEventListener('pointerup', () => { painting = null; });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyN') start((stageIndex + 1) % chronoStages.length);
    const d = /^Digit([1-9])$/.exec(e.code);
    if (d && Number(d[1]) <= chronoStages.length) start(Number(d[1]) - 1);
  });

  const loop = new FixedLoop({
    update: () => {
      if (autoplay) bot.act(sim);
      sim.step();
      for (const e of sim.events) {
        if (e.t === 'catch') {
          particles.emit(e.x, e.y, { count: 40, speed: [60, 300], life: [0.4, 1], size: [0.05, 0.18], color: [0xffd98a, 0xffffff] });
          synth.hbell(3 + e.n, 0.1, 1.2);
          juice.shake(0.1);
        } else if (e.t === 'miss') {
          particles.emit(e.x, e.y, { count: 14, speed: [30, 120], life: [0.2, 0.5], size: [0.04, 0.1], color: 0x6a74c9 });
          synth.tone(200, 0.3, { type: 'sine', vol: 0.06, slideTo: 90 });
        } else if (e.t === 'void') {
          particles.emit(e.x, e.y, { count: 20, speed: [20, 90], life: [0.3, 0.7], size: [0.04, 0.1], color: [0x6a3a9a, 0x2a1a4a] });
          synth.tone(120, 0.5, { type: 'sine', vol: 0.08, slideTo: 50 });
        } else if (e.t === 'end') {
          const st = chronoStages[stageIndex];
          center.innerHTML = `<div class="chain">${sim.cleared ? 'CLEAR' : 'あと少し'}　${sim.caught} / ${sim.cfg.stars}</div><div style="color:var(--dim)">必要 ${st.need}　R でもう一度　N で次のステージ</div>`;
          if (sim.cleared) { juice.doFlash(0.5, 0xffe7a8); synth.arp([0, 2, 4, 7, 9], 0.07, 0.1); }
          if (autoplay && sim.cleared) setTimeout(() => start((stageIndex + 1) % chronoStages.length), 2500);
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
        const col = z.k === 'slow' ? 0x5a8cff : z.k === 'fast' ? 0xff6b6b : 0xc07bff;
        const fade = sim.cfg.zoneLife > 0 ? Math.min(1, (sim.cfg.zoneLife - z.age) / 1.5) : 1;
        zoneG.circle(z.x, z.y, z.r).fill({ color: col, alpha: 0.12 * fade });
        for (let k = 0; k < 3; k++) {
          // 逆再生の渦は逆向きに回る
          const a = (z.k === 'slow' ? t * 0.4 : z.k === 'fast' ? t * 3 : -t * 1.5) + (k * Math.PI * 2) / 3;
          const rr = z.r * (0.5 + k * 0.2);
          zoneG.moveTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr).arc(z.x, z.y, rr, a, a + 1.4).stroke({ width: 2, color: col, alpha: 0.4 * fade });
        }
      }
      // 虚空：星を飲む黒い穴（縁がゆっくり回る）
      voidG.clear();
      for (const v of sim.stage?.voids ?? []) {
        voidG.circle(v.x, v.y, v.r * 1.3).fill({ color: 0x000000, alpha: 0.35 });
        voidG.circle(v.x, v.y, v.r).fill({ color: 0x05030c, alpha: 0.95 });
        for (let k = 0; k < 8; k++) {
          const a = -t * 0.8 + (k * Math.PI) / 4;
          voidG.moveTo(v.x + Math.cos(a) * v.r, v.y + Math.sin(a) * v.r).arc(v.x, v.y, v.r, a, a + 0.3).stroke({ width: 2, color: 0x8a5acd, alpha: 0.6 });
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
        sp.tint = r < 0 ? 0xd9b3ff : r < 1 ? 0x9fc0ff : r > 1 ? 0xffb3b3 : 0xfff3d6;
      });
      tl.innerHTML = `<div>実験：時空の絵筆　${stageIndex + 1}. ${chronoStages[stageIndex].name}</div><div class="big">籠 ${sim.caught} / ${chronoStages[stageIndex].need}<span style="font-size:14px;color:var(--dim)">（星 ${sim.cfg.stars}）</span></div><div style="font-size:13px;color:var(--dim)">インク ${sim.ink}　ドラッグ＝遅い（青）　右ドラッグ＝速い（赤）　Shift＋ドラッグ＝逆再生（紫）<br>風は右へも左へも吹く — 遅らせた星ほど風に運ばれる　R＝やり直し　1〜6＝ステージ　N＝次</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);
  const hook = installDebugHook('chrono-brush', () => ({ stage: stageIndex, caught: sim.caught, missed: sim.missed, ink: sim.ink, done: sim.done, cleared: sim.cleared }));
  hook.start = (i: number) => start(i);
  loop.start();
  hook.ready = true;
}

void main();
