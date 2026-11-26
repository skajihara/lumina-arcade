/**
 * 試作 EH-20 案②「重力の置き石」。
 * 小さなブラックホールを3つまで置いて（クリック＝置く、ドラッグ＝動かす、もう一度クリック＝外す）、Space で放つ。
 * 注ぎ口から星の粒が流れ出し、重力で弧を描いて暗黒星雲の柱を越え、星座の器へ。近すぎると事象の地平が粒を食べる。
 * R＝流れを戻す（置き石はそのまま）、Backspace＝置き石を全部外す、L＝放っている間も動かせる（切り替え）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { StonesSim, HZ, W, H, stage } from './sim';

const S = 30;
const VW = W * S, VH = H * S;
const px = (x: number) => x * S;

async function main() {
  injectBaseStyle(`.hs { position:fixed; left:12px; top:10px; z-index:5; color:var(--ink); font-size:14px; line-height:1.6; pointer-events:none }
    .hs .big { font-size:24px; color:#ffe7a8 }
    .hsmsg { position:fixed; left:50%; bottom:14px; transform:translateX(-50%); z-index:6; text-align:center; color:#dde; font-size:13px; pointer-events:none; text-shadow:0 0 10px #000 }`);
  const ga = await createGameApp(VW, VH);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VW, VH, '#120a2e', '#03020a', ['#4a1f6e', '#1f2a6e', '#6e2a3a']));
  const field = makeStarfield(VW, VH, 170, 23);
  const back = new Graphics();
  const g = new Graphics();
  const top = new Graphics();
  const particles = new Particles(2200);
  const grainLayer = new Graphics();
  ga.world.addChild(sky, field.container, back, grainLayer, g, particles.container, top);
  const holeGlows: Sprite[] = [];
  const glowFor = (i: number) => {
    while (holeGlows.length <= i) {
      const sp = new Sprite(glowTexture());
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      ga.world.addChildAt(sp, 3);
      holeGlows.push(sp);
    }
    return holeGlows[i];
  };

  const hud = el('div', { class: 'hs' });
  const msg = el('div', { class: 'hsmsg' });
  document.body.append(hud, msg);

  let moveWhileFlow = 0;
  let sim = new StonesSim({ moveWhileFlow });
  let t = 0;
  let pred = sim.predict(2.2);
  let predDirty = false;
  let fill = 0; // 器の光（なめらかに）
  let releaseFlash = 0;
  const holeKick: number[] = [];
  let lastCatchSound = 0, lastEatSound = 0;

  // ---- 入力 ----
  let drag: { i: number; ox: number; oy: number; moved: boolean } | null = null;
  const holeAt = (x: number, y: number) => sim.holes.findIndex((h) => Math.hypot(h.x - x, h.y - y) < 0.9);
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    const p = ga.toLogical(e.clientX, e.clientY);
    const x = p.x / S, y = p.y / S;
    const i = holeAt(x, y);
    if (i >= 0 && sim.canMove) { drag = { i, ox: x, oy: y, moved: false }; ga.app.canvas.setPointerCapture?.(e.pointerId); return; }
    if (sim.place(x, y)) {
      predDirty = true;
      synth.tone(110, 0.5, { type: 'sine', vol: 0.12, slideTo: 55 });
      particles.emit(p.x, p.y, { count: 24, speed: [-160, -40], life: [0.3, 0.7], size: [0.04, 0.1], color: [0xffb36a, 0xffe7a8] });
      juice.shake(0.12);
    }
  });
  ga.app.canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = ga.toLogical(e.clientX, e.clientY);
    const x = Math.max(0.5, Math.min(W - 0.5, p.x / S)), y = Math.max(0.5, Math.min(H - 0.5, p.y / S));
    if (Math.hypot(x - drag.ox, y - drag.oy) > 0.15) drag.moved = true;
    if (drag.moved && sim.canMove) { sim.holes[drag.i].x = x; sim.holes[drag.i].y = y; predDirty = true; }
  });
  const up = () => {
    if (drag && !drag.moved && sim.phase === 'place') {
      // 動かさずに放した：外す
      const h = sim.holes[drag.i];
      sim.holes.splice(drag.i, 1);
      predDirty = true;
      synth.tone(440, 0.25, { type: 'sine', vol: 0.05, slideTo: 880 });
      particles.emit(px(h.x), px(h.y), { count: 18, speed: [40, 160], life: [0.3, 0.6], size: [0.04, 0.1], color: [0xbfa0ff, 0xffffff] });
    }
    drag = null;
  };
  ga.app.canvas.addEventListener('pointerup', up);
  ga.app.canvas.addEventListener('pointercancel', up);
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'Space') { e.preventDefault(); sim.release(); }
    if (e.code === 'KeyR') { sim = sim.retry(); predDirty = true; fill = 0; }
    if (e.code === 'Backspace') { sim = new StonesSim({ moveWhileFlow }); predDirty = true; fill = 0; }
    if (e.code === 'KeyL') { moveWhileFlow = moveWhileFlow ? 0 : 1; sim.cfg.moveWhileFlow = moveWhileFlow; }
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
  });
  synth.setVolume(0.7);

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'release') {
        releaseFlash = 1;
        juice.doFlash(0.18, 0xbfd0ff);
        synth.whoosh(1.2);
        synth.chord(0, [0, 4, 7], 0.05, 0.06);
        particles.emit(px(stage.spout.x), px(stage.spout.y), { count: 50, speed: [60, 320], life: [0.3, 0.9], size: [0.04, 0.14], color: [0xffffff, 0xbfe3ff, 0xffe7a8] });
      } else if (e.t === 'eaten') {
        holeKick[e.hole] = 1;
        particles.emit(px(e.x), px(e.y), { count: 4, speed: [10, 60], life: [0.2, 0.4], size: [0.03, 0.07], color: [0xff9f6a, 0xffd0a0] });
        if (t - lastEatSound > 0.07) { lastEatSound = t; synth.tone(90 + Math.random() * 30, 0.12, { type: 'sine', vol: 0.05, slideTo: 40 }); }
      } else if (e.t === 'caught') {
        particles.emit(px(e.x), px(e.y), { count: 5, speed: [30, 120], life: [0.3, 0.7], size: [0.04, 0.09], color: [0xffe7a8, 0xffffff] });
        if (t - lastCatchSound > 0.06) { lastCatchSound = t; synth.bell(2 + Math.floor((e.n / sim.cfg.need) * 10), 0.05); }
      } else if (e.t === 'dust') {
        particles.emit(px(e.x), px(e.y), { count: 3, speed: [10, 50], life: [0.3, 0.6], size: [0.03, 0.06], color: [0x8a6aa8, 0x5a4a7a] });
      } else if (e.t === 'clear') {
        juice.slowmo(0.3, 1.4);
        juice.doFlash(0.55, 0xffe7a8);
        juice.shake(0.4);
        synth.arp([0, 2, 4, 7, 9, 11, 14, 16], 0.07, 0.1);
        const c = stage.cup;
        for (let k = 0; k < 3; k++) particles.emit(px(c.x), px(c.y - c.h), { count: 80, speed: [120, 560], life: [0.6, 1.8], size: [0.05, 0.2], color: [0xffd98a, 0xfff1c8, 0xbfe3ff, 0xff9fe0] });
      } else if (e.t === 'done') {
        synth.tone(220, 0.8, { type: 'sine', vol: 0.08, slideTo: 110 });
      }
    }
  };

  const loop = new FixedLoop({
    update: () => { sim.step(); handle(); },
    render: (_a, dt) => {
      t += dt;
      field.update(t);
      particles.update(dt);
      juice.update(dt, 1);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      if (predDirty && (sim.phase === 'place' || sim.cfg.moveWhileFlow)) { pred = sim.predict(2.2); predDirty = false; }
      releaseFlash = Math.max(0, releaseFlash - dt * 1.5);
      fill += (Math.min(1, sim.caught / sim.cfg.need) - fill) * Math.min(1, dt * 6);
      draw();
      const left = sim.cfg.holes - sim.holes.length;
      hud.innerHTML = `<div style="color:var(--dim)">試作：重力の置き石</div>
        <div class="big">器 ${sim.caught} / ${sim.cfg.need}</div>
        <div>置き石 ${'●'.repeat(sim.holes.length)}${'○'.repeat(Math.max(0, left))}　粒 ${sim.cfg.grains - sim.emitted} 残り　吸われた ${sim.eaten}</div>
        ${sim.phase === 'clear' ? '<div style="color:#ffe7a8;font-size:20px">器が満ちた ★</div>' : sim.phase === 'done' ? '<div style="color:#ff9fb0">足りなかった — R で流れを戻して置き直す</div>' : ''}`;
      msg.innerHTML = sim.phase === 'place'
        ? 'クリック＝ブラックホールを置く　ドラッグ＝動かす　置いた石をクリック＝外す　<kbd>Space</kbd> 放つ<br>点線は真ん中の1粒の行き先。事象の地平（黒い円）に触れた粒は消える'
        : `<kbd>R</kbd> 流れを戻す（置き石はそのまま）　<kbd>Backspace</kbd> 全部外す　<kbd>L</kbd> 放っている間も動かす：${moveWhileFlow ? 'オン' : 'オフ'}`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = () => {
    back.clear(); g.clear(); top.clear(); grainLayer.clear();
    // 暗黒星雲の柱：もやもやした暗い紫
    for (const p of stage.pillars) {
      back.rect(px(p.x0), px(p.y0), px(p.x1 - p.x0), px(p.y1 - p.y0)).fill({ color: 0x0a0614, alpha: 0.95 });
      for (let k = 0; k < 9; k++) {
        const yy = p.y0 + (k / 8) * (p.y1 - p.y0);
        back.circle(px((p.x0 + p.x1) / 2 + Math.sin(t * 0.6 + k) * 0.25), px(yy), px(0.9 + 0.2 * Math.sin(k * 2.1 + t))).fill({ color: 0x3a1f5a, alpha: 0.12 });
      }
      back.rect(px(p.x0), px(p.y0), px(p.x1 - p.x0), 3).fill({ color: 0x9a6ad8, alpha: 0.5 });
    }
    // 注ぎ口：光る裂け目
    const sp = stage.spout;
    back.circle(px(sp.x), px(sp.y), 16 + 6 * releaseFlash + 2 * Math.sin(t * 3)).fill({ color: 0xbfe3ff, alpha: 0.12 + 0.3 * releaseFlash });
    back.ellipse(px(sp.x), px(sp.y), 6, 14).fill({ color: 0xffffff, alpha: 0.85 });
    // 星座の器：縁の星と線、満ちるほど金色
    const c = stage.cup;
    const l = px(c.x - c.w / 2), r = px(c.x + c.w / 2), tp = px(c.y - c.h), bt = px(c.y);
    back.rect(l, bt - (bt - tp) * fill, r - l, (bt - tp) * fill).fill({ color: 0xffd98a, alpha: 0.35 });
    back.rect(l - 30, tp - 30, r - l + 60, bt - tp + 50).fill({ color: 0xffd98a, alpha: 0.03 + 0.08 * fill });
    const pts: [number, number][] = [[l, tp], [l, bt], [r, bt], [r, tp]];
    g.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) g.lineTo(q[0], q[1]);
    g.stroke({ width: 2.5, color: 0xffe7a8, alpha: 0.85 });
    for (const q of pts) g.circle(q[0], q[1], 4 + 1.5 * Math.sin(t * 3 + q[0])).fill({ color: 0xfff1c8 });
    g.circle((l + r) / 2, tp - 10, 2).fill({ color: 0xfff1c8, alpha: 0.6 + 0.4 * Math.sin(t * 2) });
    // 予測線
    if (sim.phase === 'place' || (sim.cfg.moveWhileFlow && sim.phase === 'flow')) {
      pred.forEach((q, i) => {
        const f = 1 - i / pred.length;
        g.circle(px(q.x), px(q.y), 1.4 + 1.6 * f).fill({ color: 0xbfe3ff, alpha: 0.15 + 0.55 * f });
      });
    }
    // 置き石：降着円盤（回る輪）、事象の地平（黒）、引力の届く範囲のうすい輪
    sim.holes.forEach((h, i) => {
      const k = holeKick[i] ?? 0;
      holeKick[i] = Math.max(0, k - 0.05);
      const hx = px(h.x), hy = px(h.y);
      const glow = glowFor(i);
      glow.visible = true;
      glow.position.set(hx, hy);
      glow.tint = 0xff9a4a;
      glow.scale.set(0.55 + 0.15 * k);
      glow.alpha = 0.55 + 0.3 * k;
      for (let ring = 0; ring < 3; ring++) {
        const rr = px(sim.cfg.horizon) * (1.6 + ring * 0.55);
        const a0 = t * (2.4 - ring * 0.5) + ring;
        g.ellipse(hx, hy, rr * 1.35, rr * 0.45).stroke({ width: 2.2 - ring * 0.5, color: ring === 0 ? 0xffe0b0 : 0xff9a4a, alpha: 0.55 - ring * 0.13 });
        g.circle(hx + Math.cos(a0) * rr * 1.35, hy + Math.sin(a0) * rr * 0.45, 2).fill({ color: 0xffffff, alpha: 0.8 });
      }
      g.circle(hx, hy, px(sim.cfg.horizon)).fill({ color: 0x000000 }).stroke({ width: 1.5, color: 0xffd0a0, alpha: 0.7 + 0.3 * k });
      if (sim.phase === 'place') g.circle(hx, hy, px(2.2)).stroke({ width: 1, color: 0xffb36a, alpha: 0.12 });
    });
    for (let i = sim.holes.length; i < holeGlows.length; i++) holeGlows[i].visible = false;
    // 粒：光の尾つき
    for (const gr of sim.grains) {
      if (!gr.alive) continue;
      const tr = gr.trail;
      if (tr.length > 1) {
        grainLayer.moveTo(px(tr[0].x), px(tr[0].y));
        for (let i = 1; i < tr.length; i++) grainLayer.lineTo(px(tr[i].x), px(tr[i].y));
        grainLayer.lineTo(px(gr.x), px(gr.y));
        grainLayer.stroke({ width: 1.6, color: 0x9fd0ff, alpha: 0.35 });
      }
      const spd = Math.hypot(gr.vx, gr.vy);
      grainLayer.circle(px(gr.x), px(gr.y), 2.2).fill({ color: spd > 12 ? 0xffe7a8 : 0xe6f2ff, alpha: 0.95 });
      grainLayer.circle(px(gr.x), px(gr.y), 5).fill({ color: 0x9fd0ff, alpha: 0.15 });
    }
    // 器の中の粒（溜まった）
    const n = Math.min(sim.caught, 120);
    for (let i = 0; i < n; i++) {
      const cols = 14;
      const x = l + 5 + ((i % cols) / (cols - 1)) * (r - l - 10);
      const y = bt - 4 - Math.floor(i / cols) * 4.5;
      top.circle(x + Math.sin(i * 7.3) * 1.5, y, 2).fill({ color: 0xffe7a8, alpha: 0.85 });
    }
  };

  const hook = installDebugHook('horizon-stones', () => ({ phase: sim.phase, holes: sim.holes.map((h) => ({ x: +h.x.toFixed(2), y: +h.y.toFixed(2) })), caught: sim.caught, eaten: sim.eaten, emitted: sim.emitted, need: sim.cfg.need }));
  hook.place = (x: number, y: number) => { const ok = sim.place(x, y); predDirty = true; return ok; };
  hook.release = () => sim.release();
  loop.start();
  hook.ready = true;
}

void main();
