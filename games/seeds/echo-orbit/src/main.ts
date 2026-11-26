/**
 * 試作 EL-20 案②「軌道のループ（トーラス）」。
 * 盤の左右の端は輪：左から出ると右から戻る。周回するほど球は速く、倍率（周回＋1）が上がる。
 * 4 秒以内に次の周回をしないと途切れる。フリッパー（Z と /、← →、画面の左右）で球を端へ送り続け、倍率が高いうちに星を弾けさせる。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { OrbitSim, HZ, W, H, OPEN_Y } from './sim';

const S = 30;
const VW = W * S, VH = H * S;
const px = (x: number) => x * S;

async function main() {
  injectBaseStyle(`.orb { position:fixed; left:12px; bottom:10px; z-index:5; color:var(--ink); font-size:14px; line-height:1.6 }
    .orb .big { font-size:26px; color:#bff6ff } .orb .mult { font-size:20px; color:#ffe7a8 }
    .orbmsg { position:fixed; left:50%; top:42%; transform:translate(-50%,-50%); z-index:6; text-align:center; color:#dff; font-size:15px; text-shadow:0 0 12px #0ff8 }`);
  const ga = await createGameApp(VW, VH);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VW, VH, '#06303f', '#020a12', ['#0f5a6a', '#16507a', '#0a6a5a']));
  const field = makeStarfield(VW, VH, 120, 17);
  const g = new Graphics();
  const fx = new Graphics();
  const ballGlow = new Sprite(glowTexture());
  ballGlow.anchor.set(0.5);
  ballGlow.blendMode = 'add';
  const particles = new Particles(1500);
  const starGlows = new Map<number, Sprite>();
  ga.world.addChild(sky, field.container, fx, g, ballGlow, particles.container);

  const hud = el('div', { class: 'orb' });
  const msg = el('div', { class: 'orbmsg' }, '輪の盤：左右の端は反対側へつながっている<br>端から抜けるたびに <b>周回 +1</b>・球が速くなり、星の得点の倍率が上がる<br>4 秒抜けないと周回は途切れる<br><br><kbd>Z</kbd> <kbd>/</kbd>（← →・画面の左右）でフリッパー　<kbd>R</kbd> やり直し');
  document.body.append(hud, msg);
  setTimeout(() => msg.remove(), 7000);

  let sim = new OrbitSim();
  let t = 0;
  let portalFlash = { l: 0, r: 0 };
  const trail: { x: number; y: number }[] = [];
  const pops: { x: number; y: number; txt: string; age: number; col: string }[] = [];
  const popLayer = el('div');
  document.body.appendChild(popLayer);

  const makeStars = () => {
    for (const s of starGlows.values()) s.destroy();
    starGlows.clear();
    sim.stars.forEach((st, i) => {
      const sp = new Sprite(glowTexture());
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.position.set(px(st.x), px(st.y));
      ga.world.addChildAt(sp, 2);
      starGlows.set(i, sp);
    });
  };
  makeStars();

  const keys = { l: false, r: false };
  const pointerSide = new Map<number, -1 | 1>();
  const apply = () => {
    sim.setFlipper(-1, keys.l || [...pointerSide.values()].includes(-1));
    sim.setFlipper(1, keys.r || [...pointerSide.values()].includes(1));
  };
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyZ' || e.code === 'ArrowLeft' || e.code === 'ShiftLeft') keys.l = true;
    if (e.code === 'Slash' || e.code === 'ArrowRight' || e.code === 'ShiftRight') keys.r = true;
    if (e.code === 'KeyR') { sim = new OrbitSim(); makeStars(); trail.length = 0; }
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    apply();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyZ' || e.code === 'ArrowLeft' || e.code === 'ShiftLeft') keys.l = false;
    if (e.code === 'Slash' || e.code === 'ArrowRight' || e.code === 'ShiftRight') keys.r = false;
    apply();
  });
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    const p = ga.toLogical(e.clientX, e.clientY);
    pointerSide.set(e.pointerId, p.x < VW / 2 ? -1 : 1);
    apply();
  });
  const up = (e: PointerEvent) => { pointerSide.delete(e.pointerId); apply(); };
  ga.app.canvas.addEventListener('pointerup', up);
  ga.app.canvas.addEventListener('pointercancel', up);
  synth.setVolume(0.7);

  const pop = (x: number, y: number, txt: string, col: string) => pops.push({ x, y, txt, age: 0, col });

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'wrap') {
        // 輪をくぐった：門が光り、上がっていく音、倍率の文字
        if (e.side < 0) portalFlash.l = 1; else portalFlash.r = 1;
        const ex = e.side < 0 ? W : 0;
        particles.emit(px(ex), px(e.y), { count: 26, speed: [60, 260], life: [0.3, 0.8], size: [0.04, 0.12], color: [0x9ff6ff, 0xffffff, 0x7fd8ff] });
        synth.tone(330 * Math.pow(2, Math.min(e.laps, 14) / 7), 0.25, { type: 'triangle', vol: 0.07, slideTo: 660 * Math.pow(2, Math.min(e.laps, 14) / 7) });
        synth.whoosh(0.5 + Math.min(1, e.laps * 0.1));
        juice.shake(0.08 + Math.min(0.25, e.laps * 0.02));
        pop(ex + (e.side < 0 ? -1.6 : 1.6), e.y, `周回 ${e.laps}　×${e.laps + 1}`, '#bff6ff');
      } else if (e.t === 'lapBreak') {
        synth.tone(260, 0.5, { type: 'sine', vol: 0.06, slideTo: 120 });
        pop(10, 14, `周回が途切れた（${e.laps}）`, '#ff9fb0');
      } else if (e.t === 'star') {
        const col = e.mult >= 6 ? [0xffe7a8, 0xff9fe0, 0xffffff] : e.mult >= 3 ? [0xffe7a8, 0x9ff6ff, 0xffffff] : [0x9ff6ff, 0xffffff];
        particles.emit(px(e.x), px(e.y), { count: 30 + e.mult * 6, speed: [80, 300 + e.mult * 30], life: [0.3, 0.9], size: [0.04, 0.14], color: col });
        synth.bell(4 + e.chain + Math.min(e.mult, 10), 0.1);
        juice.hitstop(0.03 + Math.min(0.06, e.mult * 0.008));
        juice.shake(0.15 + e.chain * 0.08);
        if (e.chain >= 2) juice.slowmo(0.4, 0.5);
        pop(e.x, e.y - 0.6, `+${e.score}`, e.mult >= 3 ? '#ffe7a8' : '#dff');
      } else if (e.t === 'bumper') {
        synth.click(1.4);
      } else if (e.t === 'flip') {
        synth.flipper(e.side < 0 ? 1 : 1.12);
      } else if (e.t === 'drain') {
        synth.tone(200, 0.7, { type: 'sine', vol: 0.1, slideTo: 70 });
        juice.doFlash(0.2, 0x7fd8ff);
        trail.length = 0;
      } else if (e.t === 'clear') {
        juice.slowmo(0.3, 1.2);
        juice.doFlash(0.5, 0xbff6ff);
        synth.arp([0, 2, 4, 7, 9, 11, 14], 0.07, 0.1);
        pop(10, 11, `ALL CLEAR　${sim.score}`, '#ffe7a8');
      } else if (e.t === 'over') {
        pop(10, 11, `おしまい　${sim.score}（R でもう一度）`, '#ff9fb0');
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
      portalFlash.l = Math.max(0, portalFlash.l - dt * 2);
      portalFlash.r = Math.max(0, portalFlash.r - dt * 2);
      draw();
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].age += dt; if (pops[i].age > 1.2) pops.splice(i, 1); }
      const rect = ga.app.canvas.getBoundingClientRect();
      popLayer.innerHTML = pops.map((q) => `<div style="position:fixed;left:${rect.left + (q.x * S * ga.scale) + ga.root.x - rect.left}px;top:${rect.top + (q.y * S * ga.scale) + ga.root.y - rect.top - q.age * 30}px;transform:translateX(-50%);color:${q.col};opacity:${1 - q.age / 1.2};font-size:15px;z-index:7;pointer-events:none;text-shadow:0 0 8px #000">${q.txt}</div>`).join('');
      const left = sim.stars.filter((s) => s.alive).length;
      hud.innerHTML = `<div style="color:var(--dim)">試作：軌道のループ</div><div class="big">${sim.score}</div>
        <div class="mult">周回 ${sim.laps}　×${sim.mult}</div><div>星 ${left} / ${sim.stars.length}　球 ${'●'.repeat(Math.max(0, sim.balls))}</div><div style="color:var(--dim)">最高 周回 ${sim.bestLaps}</div>`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = () => {
    g.clear();
    fx.clear();
    // 輪の門：左右の端の光の帯（周回が続いている間は、残り時間で明るさが減る）
    const live = sim.lapLeft;
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? 2 : VW - 2;
      const f = side < 0 ? portalFlash.l : portalFlash.r;
      fx.rect(side < 0 ? 0 : VW - 14, 0, 14, px(OPEN_Y)).fill({ color: 0x7fd8ff, alpha: 0.06 + 0.25 * f + 0.1 * live });
      g.moveTo(x, 0).lineTo(x, px(OPEN_Y)).stroke({ width: 2 + 3 * f, color: 0xbff6ff, alpha: 0.35 + 0.5 * f + 0.3 * live });
      for (let k = 0; k < 6; k++) {
        const yy = ((t * 80 * (1 + sim.laps * 0.3) + k * 90) % px(OPEN_Y));
        g.circle(x + side * -4, side < 0 ? yy : px(OPEN_Y) - yy, 1.6).fill({ color: 0xdfffff, alpha: 0.6 });
      }
    }
    // 周回の残り時間：天井の下の細い帯
    if (sim.laps > 0) g.rect(VW / 2 - 120 * live, px(0.4), 240 * live, 4).fill({ color: live < 0.3 ? 0xff9fb0 : 0xbff6ff, alpha: 0.85 });
    // 壁・天井・案内
    const ceil: number[] = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24; ceil.push(px(-1 + u * (W + 2)), px(0.8 + 1.0 * (1 - Math.sin(u * Math.PI)))); }
    g.poly(ceil, false).stroke({ width: 3, color: 0x7fd8ff, alpha: 0.7 });
    g.moveTo(px(-1), px(OPEN_Y)).lineTo(px(6.2), px(20.6)).stroke({ width: 3, color: 0x7fd8ff, alpha: 0.8 });
    g.moveTo(px(W + 1), px(OPEN_Y)).lineTo(px(W - 6.2), px(20.6)).stroke({ width: 3, color: 0x7fd8ff, alpha: 0.8 });
    // バンパー
    for (const [x, y] of [[6.2, 8.4], [13.8, 8.4]]) {
      g.circle(px(x), px(y), px(0.75)).fill({ color: 0x0c3a4a, alpha: 0.9 }).stroke({ width: 2.5, color: 0x9ff6ff, alpha: 0.9 });
      g.circle(px(x), px(y), px(0.3) + Math.sin(t * 4) * 2).fill({ color: 0xbff6ff, alpha: 0.6 });
    }
    // フリッパー
    for (const f of sim.flippers) {
      const p = f.body.getPosition(), a = f.body.getAngle();
      const s = f.side < 0 ? 1 : -1;
      const L = sim.cfg.flipperLen;
      const tip = { x: p.x + Math.cos(a) * s * L, y: p.y + Math.sin(a) * s * L };
      g.moveTo(px(p.x), px(p.y)).lineTo(px(tip.x), px(tip.y)).stroke({ width: 13, color: 0x0c3a4a, alpha: 1, cap: 'round' });
      g.moveTo(px(p.x), px(p.y)).lineTo(px(tip.x), px(tip.y)).stroke({ width: 4, color: f.up ? 0xffffff : 0xbff6ff, alpha: 0.95, cap: 'round' });
    }
    // 星
    sim.stars.forEach((st, i) => {
      const sp = starGlows.get(i)!;
      if (!st.alive) { sp.visible = false; return; }
      const beat = 0.5 + 0.5 * Math.sin(t * 3 + i);
      sp.scale.set(0.22 + beat * 0.05);
      sp.tint = 0x9ff6ff;
      sp.alpha = 0.7;
      const r = px(st.r);
      const pts: number[] = [];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2 + t * 0.4; const rr = k % 2 ? r * 0.45 : r; pts.push(px(st.x) + Math.cos(a) * rr, px(st.y) + Math.sin(a) * rr); }
      g.poly(pts).fill({ color: 0xe6ffff, alpha: 0.9 });
      // 連鎖の届く範囲（うすく）
      g.circle(px(st.x), px(st.y), px(sim.cfg.chainR * (1 + 0.08 * sim.laps))).stroke({ width: 1, color: 0x9ff6ff, alpha: 0.06 });
    });
    // 球と光の尾（速いほど長く、周回で色が金へ）
    const b = sim.ball.getPosition();
    if (trail.length && Math.abs(trail[trail.length - 1].x - b.x) > 5) trail.length = 0; // 輪をくぐった時は尾を切る
    trail.push({ x: b.x, y: b.y });
    const maxT = 8 + Math.min(24, sim.laps * 3);
    while (trail.length > maxT) trail.shift();
    const tc = sim.laps >= 5 ? 0xffe7a8 : sim.laps >= 2 ? 0xdfffff : 0x9ff6ff;
    for (let i = 1; i < trail.length; i++) {
      const f = i / trail.length;
      g.moveTo(px(trail[i - 1].x), px(trail[i - 1].y)).lineTo(px(trail[i].x), px(trail[i].y)).stroke({ width: 1 + 7 * f, color: tc, alpha: 0.5 * f });
    }
    g.circle(px(b.x), px(b.y), px(sim.cfg.ballR)).fill({ color: 0xffffff });
    ballGlow.position.set(px(b.x), px(b.y));
    ballGlow.scale.set(0.3 + Math.min(0.3, sim.laps * 0.03));
    ballGlow.tint = tc;
    void H;
  };

  const hook = installDebugHook('echo-orbit', () => ({ phase: sim.phase, score: sim.score, laps: sim.laps, bestLaps: sim.bestLaps, stars: sim.stars.filter((s) => s.alive).length, balls: sim.balls, ball: sim.ball.getPosition() }));
  (hook as unknown as { sim: () => OrbitSim }).sim = () => sim;
  loop.start();
  hook.ready = true;
}

void main();
