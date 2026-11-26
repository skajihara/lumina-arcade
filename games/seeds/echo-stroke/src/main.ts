/**
 * EL-20 試作①「一筆のループ」：描画と操作（1面だけ。タイトル・保存なし）。
 * Z / ← ＝左フリッパー、/ / → ＝右フリッパー、Space（長押しで強く）＝発射、R＝やり直し。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { boardWalls, BOARD_W, BOARD_H, BALL_R } from '../../../nova-pinball/src/sim';
import { StrokeSim, stage, defaults, HZ, STAR_R, IN_LEFT, IN_RIGHT, IN_LAUNCH } from './sim';

const S = 34;
/** 左に説明の欄を空ける（HUD が盤面に重ならないように） */
const PANEL = 7.5;
const VIEW_W = (BOARD_W + PANEL) * S, VIEW_H = BOARD_H * S;
const GROUP_COLOR = [0x9fe0ff, 0xffd98a, 0xd9b3ff];
const GROUP_CSS = ['#9fe0ff', '#ffd98a', '#d9b3ff'];

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#08122e', '#03040c', ['#1b3a7a', '#2a1f66', '#0f4a6a']));
  const field = makeStarfield(VIEW_W, VIEW_H, 140, 17);
  const wallG = new Graphics();
  const strG = new Graphics();
  const starG = new Graphics();
  const ballG = new Graphics();
  const ballGlow = new Sprite(glowTexture());
  ballGlow.anchor.set(0.5);
  ballGlow.blendMode = 'add';
  const glowLayer = new Graphics();
  const particles = new Particles(1500);
  const banner = new Text({ text: '', style: { fill: 0xe6ecff, fontSize: 30, fontWeight: '600', letterSpacing: 6, align: 'center' } });
  banner.anchor.set(0.5);
  banner.position.set((BOARD_W * S) / 2 - 20, VIEW_H * 0.42);
  const board = new Container();
  board.x = PANEL * S;
  board.addChild(glowLayer, wallG, strG, starG, ballGlow, ballG, particles.container, banner);
  ga.world.addChild(sky, field.container, board);

  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  hud.append(tl);
  document.body.appendChild(hud);

  let sim = new StrokeSim(stage, defaults);
  const keys = new Set<string>();
  let t = 0;
  let bannerT = 0;
  const trail: { x: number; y: number }[] = [];
  /** 前の周の通り道（うすく残す。自分の一筆の跡） */
  let ghost: { x: number; y: number }[][] = [];
  const rings: { x: number; y: number; r: number; age: number; life: number; color: number }[] = [];

  const showBanner = (s: string) => { banner.text = s; bannerT = 1.8; };
  const restart = () => { sim = new StrokeSim(stage, defaults); trail.length = 0; ghost = []; rings.length = 0; showBanner('1 周目'); };
  showBanner('1 周目');

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    keys.add(e.code);
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  const input = () =>
    ((keys.has('KeyZ') || keys.has('ArrowLeft') || keys.has('ShiftLeft')) ? IN_LEFT : 0) |
    ((keys.has('Slash') || keys.has('ArrowRight') || keys.has('ShiftRight')) ? IN_RIGHT : 0) |
    ((keys.has('Space') || keys.has('ArrowDown')) ? IN_LAUNCH : 0);

  // 壁（動かない）
  for (const line of boardWalls({})) {
    const flat = line.map((p) => [p.x * S, p.y * S]).flat();
    wallG.poly(flat, false).stroke({ width: 6, color: 0x6fa8ff, alpha: 0.12 });
    wallG.poly(flat, false).stroke({ width: 2, color: 0xbfe0ff, alpha: 0.8 });
  }

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'flip') synth.flipper(e.side === 'L' ? 1 : 1.1);
      else if (e.t === 'launch') synth.launch(e.power);
      else if (e.t === 'light') {
        const s = sim.stars[e.star];
        const col = GROUP_COLOR[s.group];
        particles.emit(e.x * S, e.y * S, { count: 36, speed: [60, 260], life: [0.3, 0.8], size: [0.04, 0.12], color: [col, 0xffffff] });
        rings.push({ x: e.x, y: e.y, r: 1.4, age: 0, life: 0.5, color: col });
        synth.bell(sim.litCount + 2, 0.12);
        juice.hitstop(0.04);
        juice.shake(0.15);
      } else if (e.t === 'bump') {
        synth.tone(660, 0.08, { type: 'triangle', vol: 0.05 });
        rings.push({ x: e.x, y: e.y, r: 0.9, age: 0, life: 0.25, color: 0xffffff });
      } else if (e.t === 'string') {
        // 弦の長さで音の高さ：短いほど高い
        const g = sim.strings.get(e.link)!;
        const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
        synth.tone(1200 / Math.max(1, len), 0.5, { type: 'triangle', vol: 0.08, wet: 0.5 });
        particles.emit(e.x * S, e.y * S, { count: 10, speed: [40, 140], life: [0.2, 0.5], size: [0.03, 0.07], color: 0xffffff });
      } else if (e.t === 'snap') {
        // 弦が切れた：高い音と火花、一瞬止まる
        synth.noise(0.25, { vol: 0.1, from: 6000, to: 1500 });
        synth.tone(1760, 0.3, { type: 'triangle', vol: 0.06, slideTo: 440 });
        particles.emit(e.x * S, e.y * S, { count: 30, speed: [80, 320], life: [0.2, 0.6], size: [0.03, 0.09], color: [0xffffff, GROUP_COLOR[sim.stars[stage.links[e.link][0]].group]] });
        juice.hitstop(0.06);
        juice.shake(0.3);
      } else if (e.t === 'strung') {
        synth.tone(880, 0.6, { type: 'sine', vol: 0.06, slideTo: 1320 });
        sim.pluck.set(e.link, sim.tick);
      } else if (e.t === 'complete') {
        const col = GROUP_COLOR[e.group];
        juice.slowmo(0.3, 0.9);
        juice.doFlash(0.35, col);
        juice.shake(0.5);
        synth.arp([0, 4, 7, 11, 14], 0.06, 0.1);
        rings.push({ x: e.x, y: e.y, r: 5, age: 0, life: 0.9, color: col });
        for (const s of sim.stars) if (s.group === e.group) particles.emit(s.x * S, s.y * S, { count: 40, speed: [80, 360], life: [0.4, 1.2], size: [0.05, 0.16], color: [col, 0xffffff] });
        showBanner(`「${stage.groupNames[e.group]}」 完成`);
      } else if (e.t === 'drain') {
        synth.tone(260, 0.7, { type: 'sine', vol: 0.08, slideTo: 90 });
        juice.doFlash(0.25, 0x6fa8ff);
        // 前の周の一筆の跡は1本だけ残す（画面を静かに）
        if (trail.length) ghost = [trail.splice(0)];
      } else if (e.t === 'loop') {
        showBanner(`${e.loop} 周目`);
        synth.whoosh(0.8);
      } else if (e.t === 'clear') {
        juice.slowmo(0.25, 1.5);
        juice.doFlash(0.6, 0xfff1c8);
        synth.arp([0, 2, 4, 7, 9, 11, 14, 16], 0.07, 0.12);
        showBanner(`全部灯った ${'★'.repeat(sim.stars3())}${'☆'.repeat(3 - sim.stars3())}`);
        bannerT = 99;
      } else if (e.t === 'fail') {
        showBanner('周が尽きた — R でやり直し');
        bannerT = 99;
      }
    }
  };

  const loop = new FixedLoop({
    update: () => {
      sim.step(input());
      handle();
      if (sim.tick % 3 === 0) {
        const p = sim.ball.getPosition();
        trail.push({ x: p.x, y: p.y });
      }
    },
    render: (_a, dt) => {
      t += dt;
      field.update(t);
      particles.update(dt);
      juice.update(dt);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      bannerT -= dt;
      banner.alpha = Math.max(0, Math.min(1, bannerT));
      draw(dt);
      tl.innerHTML = `<div>一筆のループ（試作）— ${stage.name}</div>
        <div class="big">${sim.loop} 周目<span style="font-size:14px;color:var(--dim)"> / ${sim.cfg.maxLoops}</span></div>
        <div>灯した星 ${sim.litCount} / ${sim.stars.length}</div>
        <div style="font-size:13px">${stage.groupNames.map((n, i) => `<span style="color:${GROUP_CSS[i]}">${sim.complete[i] ? '◆' : '◇'}${n}</span>`).join('　')}</div>
        <div style="font-size:12px;color:var(--dim);margin-top:6px">Z・/ フリッパー　Space 発射　R やり直し<br>灯した星は次の周も残る。線の両端が灯ると光の弦になって球を弾く<br>速い球なら弦を切って通り抜ける（次の周で張り直す）</div>`;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = (dt: number) => {
    glowLayer.clear();
    // 前の周の一筆の跡（新しい周ほど濃く）
    ghost.forEach((path) => {
      const a = 0.06;
      if (path.length < 2) return;
      glowLayer.moveTo(path[0].x * S, path[0].y * S);
      for (const q of path) glowLayer.lineTo(q.x * S, q.y * S);
      glowLayer.stroke({ width: 2, color: 0x9fb8ff, alpha: a });
    });
    // 星座の線：弦になったものは震えて光る、まだのものは点線のうすい線
    strG.clear();
    stage.links.forEach(([a, b], i) => {
      const A = sim.stars[a], B = sim.stars[b];
      const col = GROUP_COLOR[A.group];
      const g = sim.strings.get(i);
      if (!g) {
        const n = 10;
        for (let k = 0; k < n; k += 2) {
          const f0 = k / n, f1 = (k + 1) / n;
          strG.moveTo((A.x + (B.x - A.x) * f0) * S, (A.y + (B.y - A.y) * f0) * S).lineTo((A.x + (B.x - A.x) * f1) * S, (A.y + (B.y - A.y) * f1) * S);
        }
        strG.stroke({ width: 1, color: col, alpha: 0.25 });
        return;
      }
      if (sim.snapped.has(i)) {
        // 切れた弦：両端から垂れた短い糸がちらつく（次の周で張り直す）
        const fl = 0.3 + 0.3 * Math.sin(t * 30 + i);
        strG.moveTo(g.x1 * S, g.y1 * S).lineTo((g.x1 + (g.x2 - g.x1) * 0.2) * S, (g.y1 + (g.y2 - g.y1) * 0.2 + 0.25) * S).stroke({ width: 1.5, color: col, alpha: fl });
        strG.moveTo(g.x2 * S, g.y2 * S).lineTo((g.x2 + (g.x1 - g.x2) * 0.2) * S, (g.y2 + (g.y1 - g.y2) * 0.2 + 0.25) * S).stroke({ width: 1.5, color: col, alpha: fl });
        return;
      }
      const since = (sim.tick - (sim.pluck.get(i) ?? -9999)) / HZ;
      const amp = since < 0.8 ? 0.22 * (1 - since / 0.8) * Math.sin(since * 60) : 0;
      const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
      const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
      const nx = -(g.y2 - g.y1) / len, ny = (g.x2 - g.x1) / len;
      const cx = (mx + nx * amp * 2) * S, cy = (my + ny * amp * 2) * S;
      strG.moveTo(g.x1 * S, g.y1 * S).quadraticCurveTo(cx, cy, g.x2 * S, g.y2 * S).stroke({ width: 8, color: col, alpha: 0.15 + (since < 0.3 ? 0.25 : 0) });
      strG.moveTo(g.x1 * S, g.y1 * S).quadraticCurveTo(cx, cy, g.x2 * S, g.y2 * S).stroke({ width: 2.2, color: 0xffffff, alpha: 0.9 });
    });
    // 星
    starG.clear();
    for (const s of sim.stars) {
      const col = GROUP_COLOR[s.group];
      const x = s.x * S, y = s.y * S, r = STAR_R * S;
      if (s.lit) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.id);
        glowLayer.circle(x, y, r * 2.4).fill({ color: col, alpha: 0.1 + 0.05 * pulse });
        starPath(starG, x, y, r * 1.15, r * 0.5);
        starG.fill({ color: col }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
        const since = (sim.tick - s.lastHit) / HZ;
        if (since < 0.3) starG.circle(x, y, r * (1.2 + since * 3)).stroke({ width: 2, color: 0xffffff, alpha: 1 - since / 0.3 });
      } else {
        starPath(starG, x, y, r, r * 0.45);
        starG.fill({ color: 0x141a3a }).stroke({ width: 1.5, color: col, alpha: 0.55 + 0.2 * Math.sin(t * 2 + s.id) });
      }
    }
    // フリッパー
    for (const f of sim.flippers) {
      const p = f.body.getPosition(), a = f.body.getAngle();
      const s = f.side === 'L' ? 1 : -1, L = sim.cfg.flipperLength;
      const pts = [[0, -0.26], [s * L, -0.11], [s * L, 0.11], [0, 0.26]].map(([x, y]) => [(p.x + x * Math.cos(a) - y * Math.sin(a)) * S, (p.y + x * Math.sin(a) + y * Math.cos(a)) * S]).flat();
      starG.poly(pts).fill({ color: 0x2a3474 }).stroke({ width: 2, color: 0xbfd0ff });
    }
    // 衝撃の輪
    for (let i = rings.length - 1; i >= 0; i--) {
      const k = rings[i];
      k.age += dt;
      const f = k.age / k.life;
      if (f >= 1) { rings.splice(i, 1); continue; }
      starG.circle(k.x * S, k.y * S, k.r * S * (0.3 + 0.7 * Math.sqrt(f))).stroke({ width: 3 * (1 - f) + 1, color: k.color, alpha: 0.8 * (1 - f) });
    }
    // 球：光の尾
    ballG.clear();
    const p = sim.ball.getPosition();
    const tail = trail.slice(-14);
    tail.forEach((q, i) => ballG.circle(q.x * S, q.y * S, BALL_R * S * (i / tail.length) * 0.8).fill({ color: 0xcfe0ff, alpha: 0.25 * (i / tail.length) }));
    ballG.circle(p.x * S, p.y * S, BALL_R * S).fill({ color: 0xf4f7ff }).stroke({ width: 1.5, color: 0x9fc0ff });
    ballGlow.position.set(p.x * S, p.y * S);
    ballGlow.scale.set(0.35);
    ballGlow.alpha = 0.6;
    // 発射の溜め
    if (sim.launchCharge > 0) ballG.rect(13.5 * S, (BOARD_H - 0.4) * S, 0.6 * S, -sim.launchCharge * 4 * S).fill({ color: 0xffd98a, alpha: 0.6 });
  };

  const hook = installDebugHook('echo-stroke', () => ({ loop: sim.loop, phase: sim.phase, lit: sim.litCount, strung: sim.strung.size, ball: sim.ball.getPosition() }));
  ga.setBloom(true);
  loop.start();
  hook.ready = true;
}

function starPath(g: Graphics, x: number, y: number, R: number, r: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts);
}

void main();
