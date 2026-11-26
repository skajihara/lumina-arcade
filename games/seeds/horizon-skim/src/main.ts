/**
 * 試作 EH-20 案③「地平すれすれ」。
 * 船でブラックホールの周りを回り、地平すれすれをかすめるほど時計が遅れて倍率が上がる。かけらを拾うと 10 × 倍率 点。
 * 操作は2つ：加速（↑・Space・W・左クリック長押し／スマホは画面の右半分）、減速（↓・X・S／スマホは左半分）。
 * 減速すると軌道が縮んで地平へ潜り、加速すると膨らんで離れる。持ち時間は船の時計 — すれすれを飛ぶほど長持ちする。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { fxRandom } from '@engine/rng';
import { skyTexture, makeStarfield, glowTexture, lerpColor } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { SkimSim, HZ, W, H, CX, CY } from './sim';

const S = 30;
const VW = W * S, VH = H * S;
const px = (x: number) => x * S;

async function main() {
  injectBaseStyle(`
    .skh { position:fixed; left:14px; top:12px; z-index:5; color:var(--ink); font-size:14px; line-height:1.55 }
    .skh .mult { font-size:34px; font-weight:700; letter-spacing:.02em }
    .skh .score { font-size:22px; color:#ffe7a8 }
    .skh .bar { width:180px; height:6px; border-radius:3px; background:rgba(120,140,220,.2); overflow:hidden; margin:3px 0 6px }
    .skh .bar i { display:block; height:100% }
    .skmsg { position:fixed; left:50%; top:16%; transform:translateX(-50%); z-index:6; text-align:center; color:#dfe8ff; font-size:15px; line-height:1.8; text-shadow:0 0 12px #6af8; pointer-events:none }
    .skend { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:7; text-align:center; color:#fff; font-size:16px; line-height:1.8;
      background:rgba(8,10,30,.72); border:1px solid rgba(140,160,255,.4); border-radius:16px; padding:18px 30px; }
    .skend .stars { font-size:34px; color:var(--gold); letter-spacing:.2em }
  `);
  const ga = await createGameApp(VW, VH);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VW, VH, '#070a22', '#010208', ['#2a1a5a', '#13306a', '#4a1a4a']));
  // 背景の星：倍率が上がるとブラックホールへ寄って（縮んで）青くなる
  const fieldWrap = new Container();
  const field = makeStarfield(VW, VH, 220, 41);
  fieldWrap.addChild(field.container);
  fieldWrap.pivot.set(px(CX), px(CY));
  fieldWrap.position.set(px(CX), px(CY));
  const trailG = new Graphics();
  const diskBack = new Graphics();
  const hole = new Graphics();
  const diskFront = new Graphics();
  const shardLayer = new Container();
  const predG = new Graphics();
  const shipG = new Graphics();
  const shipGlow = new Sprite(glowTexture());
  shipGlow.anchor.set(0.5);
  shipGlow.blendMode = 'add';
  const lens = new Sprite(glowTexture());
  lens.anchor.set(0.5);
  lens.blendMode = 'add';
  lens.position.set(px(CX), px(CY));
  const blueWash = new Graphics().rect(0, 0, VW, VH).fill({ color: 0x3a6cff });
  blueWash.blendMode = 'add';
  blueWash.alpha = 0;
  const particles = new Particles(1600);
  ga.world.addChild(sky, fieldWrap, lens, trailG, diskBack, hole, diskFront, shardLayer, predG, shipGlow, shipG, particles.container, blueWash);

  const hud = el('div', { class: 'skh' });
  const msg = el('div', { class: 'skmsg' }, '地平に近いほど<b>船の時計が遅れ</b>、倍率が上がる。光る<b>かけら</b>を拾うと 10 × 倍率 点<br><kbd>↑</kbd><kbd>Space</kbd> 加速（軌道が膨らむ）　<kbd>↓</kbd><kbd>X</kbd> 減速（地平へ潜る）　<kbd>R</kbd> やり直し<br>地平の内側に入ったら終わり。すれすれで加速して離脱しろ');
  document.body.append(hud, msg);
  setTimeout(() => msg.remove(), 8000);
  let endBox: HTMLElement | null = null;

  let sim = new SkimSim();
  let t = 0;
  const trail: { x: number; y: number; m: number }[] = [];
  const shardSprites: Sprite[] = [];
  const pops: { x: number; y: number; age: number; txt: string; node: HTMLElement }[] = [];
  let skimGlow = 0;
  let toneT = 0;

  const makeShards = () => {
    for (const s of shardSprites) s.destroy();
    shardSprites.length = 0;
    for (let i = 0; i < sim.shards.length; i++) {
      const sp = new Sprite(glowTexture());
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      shardLayer.addChild(sp);
      shardSprites.push(sp);
    }
  };
  makeShards();
  const restart = () => {
    sim = new SkimSim();
    trail.length = 0;
    endBox?.remove();
    endBox = null;
    makeShards();
  };

  // ---- 入力 ----
  const keys = { up: false, down: false };
  const pointers = new Map<number, 1 | -1>();
  const applyInput = () => {
    const ps = [...pointers.values()];
    const up = keys.up || ps.includes(1), down = keys.down || ps.includes(-1);
    sim.input = up && !down ? 1 : down && !up ? -1 : 0;
  };
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)) { keys.up = true; e.preventDefault(); }
    if (['ArrowDown', 'KeyX', 'KeyS'].includes(e.code)) { keys.down = true; e.preventDefault(); }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    applyInput();
  });
  window.addEventListener('keyup', (e) => {
    if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)) keys.up = false;
    if (['ArrowDown', 'KeyX', 'KeyS'].includes(e.code)) keys.down = false;
    applyInput();
  });
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (e.pointerType === 'mouse') { if (e.button === 0) pointers.set(e.pointerId, 1); }
    else pointers.set(e.pointerId, e.clientX > window.innerWidth / 2 ? 1 : -1);
    applyInput();
  });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); applyInput(); };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const multColor = (m: number) => (m < 1.6 ? lerpColor(0xffe2b0, 0xffffff, (m - 1) / 0.6) : lerpColor(0xffffff, 0x5a9cff, Math.min(1, (m - 1.6) / 2.5)));

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'pick') {
        const col = multColor(e.mult);
        particles.emit(px(e.x), px(e.y), { count: 18 + Math.round(e.mult * 6), speed: [40, 200 + e.mult * 40], life: [0.3, 0.9], size: [0.04, 0.12], color: [col, 0xffffff] });
        synth.hbell(Math.min(14, 4 + Math.round(e.mult * 2)), 0.08 + Math.min(0.06, e.mult * 0.01), 0.7);
        if (e.mult >= 2.5) { juice.hitstop(0.04); juice.doFlash(0.15, 0x9fc0ff); }
        const node = el('div', {}, `+${e.pts}${e.mult >= 1.5 ? ` <small>×${e.mult.toFixed(1)}</small>` : ''}`);
        node.style.cssText = `position:fixed;z-index:6;pointer-events:none;font-weight:700;color:#${col.toString(16).padStart(6, '0')};text-shadow:0 0 8px #000`;
        document.body.appendChild(node);
        pops.push({ x: e.x, y: e.y, age: 0, txt: '', node });
      } else if (e.t === 'skim') {
        // すれすれに入った：スロー・青い光・低い音
        juice.slowmo(0.3, 0.9);
        juice.doFlash(0.22, 0x6f9cff);
        synth.whoosh(1.2);
        synth.tone(110, 1.2, { type: 'sine', vol: 0.1, slideTo: 55 });
        skimGlow = 1;
      } else if (e.t === 'perihelion') {
        if (e.mult >= 2) {
          // 一番近い所を抜けた：離脱の手応え
          synth.chord(Math.min(10, Math.round(e.mult * 2)), [0, 4, 7, 11], 0.05, 0.07);
          juice.shake(0.15 + Math.min(0.3, (e.mult - 2) * 0.1));
        }
      } else if (e.t === 'end') {
        if (e.why === 'horizon') {
          // 飲み込まれる：船が引き伸ばされて消える光
          particles.emit(px(sim.x), px(sim.y), { count: 120, speed: [20, 160], life: [0.6, 1.6], size: [0.03, 0.1], color: [0x9fc0ff, 0xffffff, 0xff9f6a] });
          juice.slowmo(0.2, 1.4);
          juice.doFlash(0.5, 0x2a3a8a);
          synth.tone(220, 2, { type: 'sine', vol: 0.12, slideTo: 30 });
        } else {
          synth.arp([0, 2, 4, 7, 9, 11, 14], 0.07, 0.08);
        }
        setTimeout(showEnd, 1200);
      }
    }
  };

  const starsOf = (score: number) => (score >= 2200 ? 3 : score >= 1200 ? 2 : score >= 500 ? 1 : 0);
  const showEnd = () => {
    if (sim.phase !== 'over' || endBox) return;
    const st = starsOf(sim.score);
    const why = sim.endWhy === 'horizon' ? '地平に飲み込まれた' : sim.endWhy === 'drift' ? '遠くへ流された' : '船の時計が尽きた';
    endBox = el('div', { class: 'skend' }, `<div>${why}</div><div class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div>
      <div>得点 <b style="font-size:24px;color:#ffe7a8">${sim.score}</b>　かけら ${sim.picks}　最高倍率 ×${sim.bestMult.toFixed(1)}</div>
      <div style="font-size:13px;color:var(--dim)">★ 500 / 1200 / 2200 点　<kbd>R</kbd> もう一度</div>`);
    document.body.appendChild(endBox);
  };

  const loop = new FixedLoop({
    update: () => {
      sim.step();
      handle();
      if (sim.tick % 4 === 0 && sim.phase === 'play') {
        trail.push({ x: sim.x, y: sim.y, m: sim.dilation() });
        if (trail.length > 900) trail.shift();
      }
      if (sim.firing && sim.phase === 'play') {
        const sp = Math.hypot(sim.vx, sim.vy) || 1;
        const bx = -sim.vx / sp * sim.firing, by = -sim.vy / sp * sim.firing;
        if (sim.tick % 2 === 0) particles.emit(px(sim.x + bx * 0.35), px(sim.y + by * 0.35), { count: 1, speed: [60, 140], angle: Math.atan2(by, bx), spread: 0.6, life: [0.15, 0.35], size: [0.03, 0.07], color: sim.firing > 0 ? [0xffd98a, 0xff9f6a] : [0x9fe0ff, 0xbfd0ff] });
      }
    },
    render: (_a, dt) => {
      t += dt;
      const dil = sim.dilation();
      // 時計が遅れるほど、画面の時間もゆっくりに
      const base = Math.max(0.42, 1 / Math.sqrt(dil));
      juice.update(dt, base);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      field.update(t);
      particles.update(dt);
      const pull = Math.min(1, (dil - 1) / 3);
      fieldWrap.scale.set(1 - 0.12 * pull);
      field.container.tint = lerpColor(0xffffff, 0x7fa8ff, pull);
      skimGlow = Math.max(0, skimGlow - dt * 0.8);
      blueWash.alpha = 0.04 * pull + 0.08 * skimGlow;
      ga.setBloom(true, 1 + pull * 0.8);
      draw(dil);
      // 音：倍率に応じて低くなる鼓動
      toneT -= dt;
      if (toneT <= 0 && sim.phase === 'play') {
        toneT = 0.45 * Math.min(2.5, dil);
        synth.tone(196 / Math.sqrt(dil), 0.35, { type: 'sine', vol: 0.025 + 0.02 * pull });
      }
      // 得点の飛び出し
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.age += dt;
        const r = ga.app.canvas.getBoundingClientRect();
        p.node.style.left = `${r.left + (px(p.x) / VW) * r.width}px`;
        p.node.style.top = `${r.top + (px(p.y) / VH) * r.height - 20 - p.age * 40}px`;
        p.node.style.opacity = String(Math.max(0, 1 - p.age / 1.1));
        if (p.age > 1.1) { p.node.remove(); pops.splice(i, 1); }
      }
      const left = Math.max(0, sim.cfg.time - sim.shipTime);
      const mc = multColor(dil).toString(16).padStart(6, '0');
      hud.innerHTML = `<div style="color:var(--dim);font-size:12px">試作：地平すれすれ</div>
        <div class="mult" style="color:#${mc}">×${dil.toFixed(1)}</div>
        <div class="score">${sim.score} 点</div>
        <div>船の時計 ${left.toFixed(1)} 秒</div><div class="bar"><i style="width:${(left / sim.cfg.time) * 100}%;background:#bfd0ff"></i></div>
        <div>燃料</div><div class="bar"><i style="width:${(sim.fuel / sim.cfg.fuel) * 100}%;background:${sim.fuel < 3 ? '#ff8f8f' : '#ffd98a'}"></i></div>
        <div style="font-size:12px;color:var(--dim)">最高 ×${sim.bestMult.toFixed(1)}　かけら ${sim.picks}</div>`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = (dil: number) => {
    const cx = px(CX), cy = px(CY), rs = px(sim.cfg.rs);
    // 重力レンズの光の輪（地平の 2.6 倍の所）と、うすい光の暈
    lens.scale.set((rs * 6) / 64);
    lens.alpha = 0.35;
    lens.tint = 0x8fa8ff;
    // 残光：これまでの軌道。倍率が高い所ほど青く太く
    trailG.clear();
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const f = i / trail.length;
      trailG.moveTo(px(a.x), px(a.y)).lineTo(px(b.x), px(b.y)).stroke({ width: 1 + Math.min(3, (b.m - 1) * 1.2), color: multColor(b.m), alpha: 0.06 + 0.4 * f * f });
    }
    // 降着円盤：傾いた楕円の輪。奥の半分は穴の後ろ、手前の半分は前
    diskBack.clear(); diskFront.clear();
    for (let k = 0; k < 7; k++) {
      const rr = rs * (1.5 + k * 0.32);
      const col = lerpColor(0xffe2b0, 0xff7a4a, k / 7);
      const al = 0.5 - k * 0.05;
      const ry = rr * 0.28;
      const ph = t * (1.6 - k * 0.15);
      // 奥（上半分）
      diskBack.ellipse(cx, cy, rr, ry).stroke({ width: 2.2, color: col, alpha: al * 0.55 });
      // 手前（下半分）：弧で描く
      diskFront.moveTo(cx + rr, cy);
      for (let i = 1; i <= 24; i++) {
        const a = (i / 24) * Math.PI;
        diskFront.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * ry);
      }
      diskFront.stroke({ width: 2.6, color: col, alpha: al });
      // 円盤の上を流れる光の粒
      for (let j = 0; j < 3; j++) {
        const a = ph + j * 2.1 + k;
        const front = Math.sin(a) > 0;
        (front ? diskFront : diskBack).circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * ry, 1.8).fill({ color: 0xfff4d8, alpha: front ? 0.9 : 0.4 });
      }
    }
    // 穴：真っ黒な円と、光子球の細い輪
    hole.clear();
    hole.circle(cx, cy, rs * 1.5).stroke({ width: 1.5, color: 0xbfd0ff, alpha: 0.35 + 0.15 * Math.sin(t * 3) });
    hole.circle(cx, cy, rs).fill({ color: 0x000000 }).stroke({ width: 2, color: 0x9fb8ff, alpha: 0.8 });
    // 倍率の目安の輪（×2・×3）
    for (const m of [2, 3]) {
      const r = sim.cfg.rs / (1 - 1 / (m * m));
      hole.circle(cx, cy, px(r)).stroke({ width: 1, color: multColor(m), alpha: 0.18 });
    }
    // かけら
    sim.shards.forEach((s, i) => {
      const sp = shardSprites[i];
      if (!sp) return;
      sp.position.set(px(s.x), px(s.y));
      const m = sim.dilation(s.r);
      sp.tint = multColor(m);
      sp.scale.set(0.16 + 0.03 * Math.sin(t * 5 + i) + Math.min(0.1, (m - 1) * 0.04));
      sp.alpha = 0.9;
    });
    // 予測線（噴射しないとどう飛ぶか、1.6 秒ぶん）
    predG.clear();
    if (sim.phase === 'play') {
      const pts = sim.predict(Math.round(HZ * 1.6), 6);
      pts.forEach((q, i) => {
        const f = 1 - i / pts.length;
        predG.circle(px(q.x), px(q.y), 1.2 + 1.2 * f).fill({ color: multColor(sim.dilation(Math.hypot(q.x - CX, q.y - CY))), alpha: 0.15 + 0.4 * f });
      });
    }
    // 船：進む向きの細い三角。地平に近いほど進む向きに引き伸ばされる
    shipG.clear();
    if (sim.phase === 'play' || sim.endWhy !== 'horizon') {
      const ang = Math.atan2(sim.vy, sim.vx);
      const stretch = 1 + Math.min(1.2, (dil - 1) * 0.35);
      shipG.position.set(px(sim.x), px(sim.y));
      shipG.rotation = ang;
      shipG.poly([10 * stretch, 0, -6, 5, -3, 0, -6, -5]).fill({ color: 0xf4f6ff }).stroke({ width: 1, color: multColor(dil) });
      if (sim.firing) {
        const fl = 6 + fxRandom(0, 5);
        if (sim.firing > 0) shipG.poly([-4, 2.5, -4 - fl, 0, -4, -2.5]).fill({ color: 0xffd98a, alpha: 0.9 });
        else shipG.poly([10 * stretch, 2, 10 * stretch + fl, 0, 10 * stretch, -2]).fill({ color: 0x9fe0ff, alpha: 0.9 });
      }
      shipGlow.position.set(px(sim.x), px(sim.y));
      shipGlow.scale.set(0.22 + 0.06 * Math.min(3, dil - 1));
      shipGlow.tint = multColor(dil);
      shipGlow.alpha = 0.7;
    } else {
      shipGlow.alpha = Math.max(0, shipGlow.alpha - 0.02);
    }
  };

  const hook = installDebugHook('horizon-skim', () => ({ phase: sim.phase, why: sim.endWhy, r: +sim.r.toFixed(2), mult: sim.mult, score: sim.score, picks: sim.picks, fuel: +sim.fuel.toFixed(2), shipTime: +sim.shipTime.toFixed(1), best: +sim.bestMult.toFixed(2) }));
  hook.restart = restart;
  loop.start();
  hook.ready = true;
}

void main();
