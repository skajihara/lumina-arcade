/**
 * 試作 EH-20 案①「スイングバイ」。
 * 探査機を引いて放して1回だけ打ち出し、ブラックホールと惑星の重力で曲げて星の門へ。
 * 予測線は最初の 1/3 だけ。地平すれすれを通るほど時間が遅れ、光の尾が伸びて得点が増える。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { SwingSim, HZ, W, H, type Pt } from './sim';

const S = 30;
const VW = W * S, VH = H * S;
const px = (x: number) => x * S;
/** 引く長さ（m）がこれで最大の強さ */
const PULL_MAX = 4;

async function main() {
  injectBaseStyle(`.sw { position:fixed; left:12px; top:56px; z-index:5; color:var(--ink); font-size:14px; line-height:1.6 }
    .sw .big { font-size:26px; color:#ffe7a8 }
    .swmsg { position:fixed; left:50%; bottom:16px; transform:translate(-50%,0); width:min(92vw,760px); z-index:6; text-align:center; color:#e8e0ff; font-size:15px; text-shadow:0 0 12px #000; pointer-events:none }`);
  const ga = await createGameApp(VW, VH);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VW, VH, '#0a0620', '#020208', ['#3a1a6a', '#6a2a4a', '#1a2a6a']));
  const field = makeStarfield(VW, VH, 170, 41);
  const back = new Graphics();
  const g = new Graphics();
  const aimG = new Graphics();
  const probeGlow = new Sprite(glowTexture());
  probeGlow.anchor.set(0.5);
  probeGlow.blendMode = 'add';
  const gateGlow = new Sprite(glowTexture());
  gateGlow.anchor.set(0.5);
  gateGlow.blendMode = 'add';
  const particles = new Particles(2000);
  ga.world.addChild(sky, field.container, back, gateGlow, g, particles.container, probeGlow, aimG);

  const hud = el('div', { class: 'sw' });
  const msg = el('div', { class: 'swmsg' });
  document.body.append(hud, msg);
  const setMsg = (h: string) => { msg.innerHTML = h; };
  const intro = '探査機（左の光）を<b>引っぱって放す</b>と、反対へ1回だけ飛ぶ。重力で曲げて右の<b style="color:#9ff6ff">星の門</b>へ<br>予測線は最初の 1/3 だけ。<b style="color:#ffb0e0">事象の地平</b>（黒い円）に触れると吸い込まれる — すれすれほど時間が遅れて高得点<br><span style="color:#ffe7a8">✦ 星のかけら</span>を拾うと★　<kbd>R</kbd> やり直し';
  setMsg(intro);

  let sim = new SwingSim();
  let t = 0;
  let drag: Pt | null = null;
  let mouse: Pt = { x: 0, y: 0 };
  const trail: { x: number; y: number; dil: number }[] = [];
  let resultShown = false;

  const reset = () => { sim = new SwingSim(); trail.length = 0; resultShown = false; drag = null; setMsg(intro); };
  const aimVec = () => {
    if (!drag) return null;
    const dx = drag.x - mouse.x, dy = drag.y - mouse.y;
    const len = Math.hypot(dx, dy);
    return { dx, dy, power: Math.min(1, len / PULL_MAX), len };
  };

  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (sim.phase !== 'aim') return;
    const p = ga.toLogical(e.clientX, e.clientY);
    mouse = { x: p.x / S, y: p.y / S };
    drag = { ...mouse };
    ga.app.canvas.setPointerCapture?.(e.pointerId);
  });
  ga.app.canvas.addEventListener('pointermove', (e) => {
    const p = ga.toLogical(e.clientX, e.clientY);
    mouse = { x: p.x / S, y: p.y / S };
  });
  ga.app.canvas.addEventListener('pointerup', () => {
    const a = aimVec();
    drag = null;
    if (a && a.len > 0.3 && sim.launch(a.dx, a.dy, a.power)) setMsg('');
  });
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyR') reset();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
  });
  synth.setVolume(0.7);

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'launch') {
        setMsg('');
        // 打ち出し：一瞬止めて、光の輪と低い音
        juice.hitstop(0.05 + e.power * 0.05);
        juice.shake(0.1 + e.power * 0.25);
        synth.launch(e.power);
        synth.whoosh(0.5 + e.power);
        particles.emit(px(sim.start.x), px(sim.start.y), { count: 40, speed: [60, 320], life: [0.3, 0.8], size: [0.04, 0.12], color: [0xffffff, 0x9ff6ff, 0xffe7a8] });
      } else if (e.t === 'graze') {
        // 地平すれすれ：時間がゆっくりになり、紫の光と高い音
        juice.slowmo(0.35, 0.7);
        juice.doFlash(0.15, 0xd0a0ff);
        synth.tone(880, 0.6, { type: 'sine', vol: 0.06, slideTo: 1760 });
      } else if (e.t === 'shard') {
        particles.emit(px(e.x), px(e.y), { count: 40, speed: [60, 260], life: [0.4, 1], size: [0.04, 0.12], color: [0xffe7a8, 0xffffff] });
        synth.bell(6 + e.n * 2, 0.12);
        juice.hitstop(0.04);
      } else if (e.t === 'swallow') {
        juice.slowmo(0.3, 1);
        juice.shake(0.5);
        synth.tone(220, 1.2, { type: 'sine', vol: 0.12, slideTo: 40 });
        particles.emit(px(e.x), px(e.y), { count: 50, speed: [20, 120], life: [0.4, 1.2], size: [0.03, 0.1], color: [0xffb0e0, 0xd0a0ff] });
      } else if (e.t === 'crash') {
        juice.shake(0.6);
        synth.noise(0.4, { vol: 0.14, from: 3000, to: 300 });
        particles.emit(px(e.x), px(e.y), { count: 60, speed: [60, 300], life: [0.3, 1], size: [0.04, 0.14], color: [0xffa070, 0xffffff] });
      } else if (e.t === 'arrive') {
        juice.slowmo(0.3, 1.2);
        juice.doFlash(0.5, 0xbff6ff);
        synth.arp([0, 2, 4, 7, 9, 11, 14], 0.07, 0.1);
        for (let k = 0; k < 3; k++) particles.emit(px(sim.gate.x), px(sim.gate.y), { count: 60, speed: [100, 480], life: [0.6, 1.5], size: [0.04, 0.16], color: [0x9ff6ff, 0xffe7a8, 0xffffff] });
      }
    }
    if ((sim.phase === 'clear' || sim.phase === 'fail') && !resultShown) {
      resultShown = true;
      const st = sim.phase === 'clear' ? `<span style="font-size:30px;color:#ffe7a8;letter-spacing:.2em">${'★'.repeat(sim.stars)}${'☆'.repeat(3 - sim.stars)}</span><br>届いた！　得点 ${Math.round(sim.score)}　（一番の時間の遅れ ×${sim.maxDil.toFixed(2)}）` : `<span style="color:#ff9fb0">${sim.failWhy}</span>`;
      setTimeout(() => setMsg(`${st}<br><kbd>R</kbd> もう一度`), 900);
    }
  };

  const loop = new FixedLoop({
    update: () => {
      sim.step();
      handle();
      if (sim.phase === 'fly' && sim.tick % 2 === 0) {
        trail.push({ ...sim.pos, dil: sim.dil });
        // 時間の遅れが大きいほど尾が長く残る
        const keep = Math.round(40 + 160 * Math.min(1, (sim.maxDil - 1) / 1.5));
        while (trail.length > keep) trail.shift();
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
      draw();
      hud.innerHTML = `<div style="color:var(--dim)">試作：スイングバイ</div><div class="big">${Math.round(sim.score)}</div>
        <div>★ ${'✦'.repeat(sim.stars)}${'·'.repeat(3 - sim.stars)}　時間の遅れ ×${sim.dil.toFixed(2)}</div>`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = () => {
    back.clear();
    g.clear();
    aimG.clear();
    // 重力レンズの歪みの輪と降着円盤
    for (const b of sim.holes) {
      const cx = px(b.x), cy = px(b.y), r = px(b.rh);
      for (let k = 1; k <= 4; k++) back.circle(cx, cy, r * (1 + k * 0.9) + Math.sin(t * 1.5 + k) * 2).stroke({ width: 1, color: 0xd0b0ff, alpha: 0.18 / k + 0.04 });
      // 降着円盤：斜めの楕円を何層も（回る光の粒）
      for (let k = 0; k < 3; k++) back.ellipse(cx, cy, r * (2.3 - k * 0.35), r * (0.55 - k * 0.1)).stroke({ width: 4 - k, color: k === 0 ? 0xff9a5a : k === 1 ? 0xffc080 : 0xfff0c8, alpha: 0.35 + k * 0.15 });
      for (let k = 0; k < 10; k++) {
        const a = t * (1.6 + (k % 3) * 0.4) + k * 0.63;
        const rr = r * (1.4 + (k % 4) * 0.22);
        const yy = cy + Math.sin(a) * rr * 0.24;
        back.circle(cx + Math.cos(a) * rr, yy, 1.6).fill({ color: 0xffe0b0, alpha: Math.sin(a) > 0 ? 0.9 : 0.35 });
      }
      g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 1 }).stroke({ width: 2, color: 0xffb0e0, alpha: 0.75 + 0.2 * Math.sin(t * 3) });
      // 降着円盤の手前側（穴の前を横切る）
      g.ellipse(cx, cy + r * 0.05, r * 2.3, r * 0.5).stroke({ width: 2, color: 0xffc080, alpha: 0.5 });
    }
    // 惑星
    for (const p of sim.planets) {
      const cx = px(p.x), cy = px(p.y), r = px(p.r);
      back.circle(cx, cy, r * 1.35).fill({ color: 0x5aa0ff, alpha: 0.08 });
      g.circle(cx, cy, r).fill({ color: 0x1a3a7a, alpha: 1 }).stroke({ width: 2, color: 0x8fc8ff, alpha: 0.85 });
      g.ellipse(cx - r * 0.1, cy - r * 0.2, r * 0.8, r * 0.18).fill({ color: 0x8fc8ff, alpha: 0.18 });
      g.ellipse(cx + r * 0.1, cy + r * 0.3, r * 0.7, r * 0.12).fill({ color: 0x8fc8ff, alpha: 0.12 });
    }
    // 星の門
    const gx = px(sim.gate.x), gy = px(sim.gate.y), gr = px(sim.cfg.gateR);
    gateGlow.position.set(gx, gy);
    gateGlow.scale.set(0.6 + 0.05 * Math.sin(t * 3));
    gateGlow.tint = 0x9ff6ff;
    gateGlow.alpha = 0.6;
    for (let k = 0; k < 6; k++) {
      const a = t * 1.2 + (k / 6) * Math.PI * 2;
      g.moveTo(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr).arc(gx, gy, gr, a, a + 0.6).stroke({ width: 3, color: 0x9ff6ff, alpha: 0.9 });
    }
    g.circle(gx, gy, gr * 0.45).stroke({ width: 1.5, color: 0xffe7a8, alpha: 0.8 });
    // 星のかけら
    for (const s of sim.shards) {
      if (s.got) continue;
      const cx = px(s.x), cy = px(s.y), k = 6 + Math.sin(t * 4 + s.x) * 1.5;
      g.poly([cx, cy - k, cx + k * 0.35, cy - k * 0.35, cx + k, cy, cx + k * 0.35, cy + k * 0.35, cx, cy + k, cx - k * 0.35, cy + k * 0.35, cx - k, cy, cx - k * 0.35, cy - k * 0.35]).fill({ color: 0xffe7a8, alpha: 0.95 });
    }
    // 発射台
    g.circle(px(sim.start.x), px(sim.start.y), 16).stroke({ width: 1.5, color: 0x9ff6ff, alpha: 0.4 });
    // 光の尾：時間が遅れた所ほど太く紫に
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const f = i / trail.length;
      const d = Math.min(1, (b.dil - 1) / 1.2);
      g.moveTo(px(a.x), px(a.y)).lineTo(px(b.x), px(b.y)).stroke({ width: 1.5 + 5 * d * f, color: d > 0.3 ? 0xd0a0ff : 0x9ff6ff, alpha: 0.2 + 0.7 * f });
    }
    // 探査機
    const showProbe = sim.phase !== 'fail' || sim.failWhy === '彼方へ流れていった';
    probeGlow.position.set(px(sim.pos.x), px(sim.pos.y));
    probeGlow.scale.set(0.22 + 0.08 * Math.min(2, sim.dil - 1));
    probeGlow.tint = sim.dil > 1.4 ? 0xd0a0ff : 0xe8fbff;
    probeGlow.alpha = showProbe ? 0.95 : 0;
    if (showProbe) g.circle(px(sim.pos.x), px(sim.pos.y), 3.5).fill({ color: 0xffffff });
    // 狙い：引いた向きの逆へ、予測線の最初の 1/3 だけ
    const a = aimVec();
    if (a && sim.phase === 'aim') {
      const sx = px(sim.start.x), sy = px(sim.start.y);
      aimG.moveTo(sx, sy).lineTo(sx - (a.dx / Math.max(a.len, 1e-3)) * Math.min(a.len, PULL_MAX) * S, sy - (a.dy / Math.max(a.len, 1e-3)) * Math.min(a.len, PULL_MAX) * S).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      aimG.circle(sx, sy, 22).stroke({ width: 4, color: 0x0a0620, alpha: 0.6 });
      aimG.moveTo(sx, sy - 22).arc(sx, sy, 22, -Math.PI / 2, -Math.PI / 2 + a.power * Math.PI * 2).stroke({ width: 4, color: 0xffe7a8, alpha: 0.95 });
      if (a.len > 0.3) {
        const pr = sim.predict(a.dx, a.dy, a.power);
        const n = Math.ceil(pr.pts.length / 3);
        for (let i = 0; i < n; i++) {
          const q = pr.pts[i];
          const f = 1 - i / n;
          aimG.circle(px(q.x), px(q.y), 1.4 + 1.8 * f).fill({ color: 0xffe7a8, alpha: 0.2 + 0.7 * f });
        }
      }
    }
  };

  const hook = installDebugHook('horizon-swingby', () => ({ phase: sim.phase, score: Math.round(sim.score), stars: sim.stars, pos: sim.pos, dil: +sim.dil.toFixed(2), maxDil: +sim.maxDil.toFixed(2), why: sim.failWhy }));
  hook.launch = (dx: number, dy: number, p: number) => sim.launch(dx, dy, p);
  hook.reset = reset;
  loop.start();
  hook.ready = true;
}

void main();
