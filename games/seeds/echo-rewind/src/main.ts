/**
 * 試作 EL-20 案③「時間の巻き戻し」：描画・入力。
 * Z と / でフリッパー、Space で発射、Shift（または ↓）を押している間だけ時間が巻き戻る。R でやり直し。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el } from '@engine/hud';
import { RewindSim, HZ, W, H, FIELD_R, BALL_R, stars, links, PIVOT_L, PIVOT_R, FLIP_LEN } from './sim';

const S = 30;
const VW = W * S, VH = H * S;
const px = (v: number) => v * S;

async function main() {
  injectBaseStyle(`
    .rw-hud { position:fixed; left:12px; top:10px; color:#cdeff5; font-size:14px; z-index:5; pointer-events:none; line-height:1.6; text-shadow:0 0 6px #0a3a4a; }
    .rw-hud b { color:#fff; font-size:20px; }
    .rw-center { position:fixed; left:50%; top:42%; transform:translate(-50%,-50%); color:#e6fbff; font-size:20px; text-align:center; z-index:5; pointer-events:none; text-shadow:0 0 10px #18a0c0; }
    .rw-keys { position:fixed; left:50%; bottom:8px; transform:translateX(-50%); color:#8fc8d4; font-size:12px; z-index:5; pointer-events:none; white-space:nowrap; }
  `);
  const ga = await createGameApp(VW, VH);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VW, VH, '#04222e', '#020a14', ['#0f4a5a', '#123d66', '#0c5a5a']));
  const field = makeStarfield(VW, VH, 120, 17);
  const back = new Graphics();
  const ghost = new Graphics();
  const board = new Graphics();
  const ballG = new Graphics();
  const ballGlow = new Sprite(glowTexture());
  ballGlow.anchor.set(0.5);
  ballGlow.blendMode = 'add';
  const front = new Graphics();
  const particles = new Particles(800);
  ga.world.addChild(sky, field.container, back, ghost, board, ballGlow, ballG, particles.container, front);

  const hud = el('div', { class: 'rw-hud' });
  const center = el('div', { class: 'rw-center' });
  const keys = el('div', { class: 'rw-keys' }, 'Z / ＝フリッパー　Space＝発射　<b style="color:#e6fbff">Shift か ↓（押している間）＝時間を巻き戻す</b>　R＝やり直し');
  document.body.append(hud, center, keys);

  let sim = new RewindSim();
  const held = new Set<string>();
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    held.add(e.code);
    if (e.code === 'KeyR') { sim = new RewindSim(); trail.length = 0; center.innerHTML = ''; }
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (['Space', 'ArrowDown', 'Slash'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  synth.setVolume(0.6);

  let t = 0;
  /** 巻き戻しの見た目の強さ（なめらかに） */
  let rw = 0;
  /** 球の通った跡（巻き戻し中は戻る道を見せる） */
  const trail: { x: number; y: number }[] = [];
  const starFlash = new Array(stars.length).fill(0);
  let rewindTone = 0;

  const loop = new FixedLoop({
    update: () => {
      const inp = {
        left: held.has('KeyZ') || held.has('ArrowLeft'),
        right: held.has('Slash') || held.has('ArrowRight'),
        launch: held.has('Space'),
        rewind: held.has('ShiftLeft') || held.has('ShiftRight') || held.has('ArrowDown'),
      };
      sim.step(inp);
      const b = sim.ballPos;
      if (!sim.rewinding && sim.phase === 'play') { trail.push(b); if (trail.length > 50) trail.shift(); } else if (sim.rewinding) trail.pop();
      if (sim.rewinding && sim.tick % 9 === 0) synth.tone(880 - (rewindTone++ % 8) * 60, 0.08, { type: 'sine', vol: 0.035, slideTo: 440 });
      for (const e of sim.events) {
        if (e.t === 'star') {
          starFlash[e.i] = 1;
          particles.emit(px(e.x), px(e.y), { count: 26, speed: [60, 260], life: [0.3, 0.8], size: [0.05, 0.14], color: [0x9ff4ff, 0xffffff, 0x6fe0d0] });
          synth.hbell(4 + sim.litCount, 0.1, 1.0);
          juice.shake(0.15);
          juice.hitstop(0.03);
          if (e.first) synth.tone(1320, 0.25, { type: 'triangle', vol: 0.04 });
        } else if (e.t === 'bump') {
          synth.tone(200 + e.speed * 15, 0.06, { type: 'sine', vol: Math.min(0.06, e.speed * 0.005) });
        } else if (e.t === 'flip') {
          synth.flipper(e.side === 'l' ? 1 : 1.1);
        } else if (e.t === 'launch') {
          synth.launch(0.8);
        } else if (e.t === 'drain') {
          synth.tone(330, 0.5, { type: 'sine', vol: 0.08, slideTo: 110 });
          juice.doFlash(0.2, 0x3a8aa0);
        } else if (e.t === 'saved') {
          synth.arp([0, 4, 7], 0.05, 0.06);
        } else if (e.t === 'lost') {
          trail.length = 0;
          center.innerHTML = `球を失った　のこり ${e.left}`;
          setTimeout(() => { if (sim.phase === 'play') center.innerHTML = ''; }, 1500);
        } else if (e.t === 'clear') {
          juice.slowmo(0.3, 1.2);
          juice.doFlash(0.5, 0xbff8ff);
          synth.arp([0, 2, 4, 7, 9, 11, 14], 0.07, 0.1);
          for (const s of stars) particles.emit(px(s.x), px(s.y), { count: 30, speed: [80, 400], life: [0.5, 1.4], size: [0.05, 0.18], color: [0x9ff4ff, 0xffffff] });
          center.innerHTML = `星座がすべて灯った<br><span style="color:#ffd98a;font-size:34px">${'★'.repeat(sim.stars3)}${'☆'.repeat(3 - sim.stars3)}</span><br><span style="font-size:13px">ゲージを残すほど★（R でもう一度）</span>`;
        } else if (e.t === 'fail') {
          center.innerHTML = '球がなくなった<br><span style="font-size:13px">R でもう一度</span>';
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
      rw += ((sim.rewinding ? 1 : 0) - rw) * Math.min(1, dt * 12);
      draw(dt);
      const gaugeF = sim.gauge / sim.cfg.gaugeMax;
      hud.innerHTML = `試作：時間の巻き戻し<br>星 <b>${sim.litCount}</b> / ${stars.length}　球 ${'●'.repeat(sim.balls)}<br>時間 ${sim.time.toFixed(1)} 秒`;
      if (sim.phase === 'drain') center.innerHTML = `<span style="color:#9ff4ff">落ちる — Shift で巻き戻せ</span><br><span style="font-size:13px">あと ${(sim.graceLeft / HZ).toFixed(1)} 秒</span>`;
      else if (sim.phase === 'play' && center.innerHTML.startsWith('<span style="color:#9ff4ff">')) center.innerHTML = '';
      void gaugeF;
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = (dt: number) => {
    // 巻き戻し中：空が反転気味の色、走査線
    sky.tint = rw > 0.01 ? lerp(0xffffff, 0xb6a4ff, rw) : 0xffffff;
    back.clear();
    // 盤面の外形
    const outline = [[0, 22.5], [0, 4.5], [3, 1], [6, 0], [15, 0], [18.4, 1.2], [20, 3.8], [20, 30]];
    back.poly(outline.map(([x, y]) => [px(x), px(y)]).flat(), false).stroke({ width: 3, color: 0x6fd8e8, alpha: 0.7 });
    back.moveTo(px(FIELD_R), px(7.5)).lineTo(px(FIELD_R), px(30)).stroke({ width: 2, color: 0x6fd8e8, alpha: 0.5 });
    back.moveTo(px(0), px(22.5)).lineTo(px(PIVOT_L.x - 0.2), px(PIVOT_L.y - 0.15)).stroke({ width: 3, color: 0x6fd8e8, alpha: 0.7 });
    back.moveTo(px(FIELD_R), px(22.5)).lineTo(px(PIVOT_R.x + 0.2), px(PIVOT_R.y - 0.15)).stroke({ width: 3, color: 0x6fd8e8, alpha: 0.7 });
    for (const sgn of [1, -1]) {
      const cx = sgn > 0 ? 3.4 : FIELD_R - 3.4;
      back.poly([px(cx - 0.9 * sgn), px(19.6), px(cx - 0.9 * sgn), px(22.6), px(cx + 1.1 * sgn), px(23.6)]).fill({ color: 0x0c3a48, alpha: 0.8 }).stroke({ width: 2, color: 0x9ff4ff, alpha: 0.8 });
    }
    // 大きな時計の文字盤（巻き戻し中は針が逆回り）
    const cx = px(9.3), cy = px(10);
    back.circle(cx, cy, px(7.6)).stroke({ width: 1, color: 0x6fd8e8, alpha: 0.12 + 0.25 * rw });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      back.moveTo(cx + Math.cos(a) * px(7.2), cy + Math.sin(a) * px(7.2)).lineTo(cx + Math.cos(a) * px(7.6), cy + Math.sin(a) * px(7.6)).stroke({ width: 2, color: 0x6fd8e8, alpha: 0.2 + 0.3 * rw });
    }
    const ha = sim.time * 0.8 - Math.PI / 2;
    back.moveTo(cx, cy).lineTo(cx + Math.cos(ha) * px(6.6), cy + Math.sin(ha) * px(6.6)).stroke({ width: 2, color: rw > 0.3 ? 0xc8b4ff : 0x6fd8e8, alpha: 0.18 + 0.5 * rw });
    // 星座の線と星
    for (const [a, b] of links) {
      const on = (sim.lit & (1 << a)) && (sim.lit & (1 << b));
      back.moveTo(px(stars[a].x), px(stars[a].y)).lineTo(px(stars[b].x), px(stars[b].y)).stroke({ width: on ? 2.5 : 1, color: on ? 0x9ff4ff : 0x3a7080, alpha: on ? 0.8 : 0.4 });
    }
    board.clear();
    stars.forEach((s, i) => {
      const on = !!(sim.lit & (1 << i));
      starFlash[i] = Math.max(0, starFlash[i] - dt * 2.5);
      const r = px(0.55) + starFlash[i] * 8;
      if (on) board.circle(px(s.x), px(s.y), r + 6).fill({ color: 0x9ff4ff, alpha: 0.15 + 0.1 * Math.sin(t * 3 + i) });
      board.star(px(s.x), px(s.y), 5, r, r * 0.45, t * 0.3 + i).fill({ color: on ? 0xe6fdff : 0x1a4a58, alpha: on ? 1 : 0.9 }).stroke({ width: 1.5, color: on ? 0xffffff : 0x6fb8c8, alpha: 0.9 });
    });
    // フリッパー
    for (const [b, p, dir] of [[sim.flipL, PIVOT_L, 1], [sim.flipR, PIVOT_R, -1]] as const) {
      const a = b.getAngle();
      const tx = p.x + Math.cos(a) * FLIP_LEN * dir, ty = p.y + Math.sin(a) * FLIP_LEN * dir;
      board.moveTo(px(p.x), px(p.y)).lineTo(px(tx), px(ty)).stroke({ width: 16, color: 0x0e4a5a, alpha: 1, cap: 'round' });
      board.moveTo(px(p.x), px(p.y)).lineTo(px(tx), px(ty)).stroke({ width: 3, color: 0xbff8ff, alpha: 0.95, cap: 'round' });
    }
    // 跡（巻き戻し中は紫の残像）
    ghost.clear();
    trail.forEach((q, i) => {
      const f = i / trail.length;
      ghost.circle(px(q.x), px(q.y), 1.5 + f * 4).fill({ color: rw > 0.3 ? 0xc8b4ff : 0x6fe0d0, alpha: 0.05 + f * (0.25 + 0.35 * rw) });
    });
    // 球
    const bp = sim.ballPos;
    ballG.clear();
    ballG.circle(px(bp.x), px(bp.y), px(BALL_R)).fill({ color: rw > 0.3 ? 0xe2d6ff : 0xf0feff }).stroke({ width: 1.5, color: 0xffffff });
    ballGlow.position.set(px(bp.x), px(bp.y));
    ballGlow.scale.set(0.28 + 0.1 * rw);
    ballGlow.tint = rw > 0.3 ? 0xb6a4ff : 0x9ff4ff;
    ballGlow.alpha = 0.6;
    // 手前：時間のゲージ（下の真ん中の弧）と、巻き戻し中の走査線と縁取り
    front.clear();
    // 時間のゲージ：盤面の上の帯（金の印＝★3・★2 の境）
    const f = sim.gauge / sim.cfg.gaugeMax;
    const gx0 = px(6.3), gx1 = px(14.7), gy = px(0.75);
    front.roundRect(gx0, gy - 5, gx1 - gx0, 10, 5).fill({ color: 0x0a2a34, alpha: 0.9 });
    front.roundRect(gx0, gy - 5, Math.max(4, (gx1 - gx0) * f), 10, 5).fill({ color: f < 0.25 ? 0xff9f8f : rw > 0.3 ? 0xc8b4ff : 0x9ff4ff, alpha: 0.95 });
    for (const k of [0.25, 0.6]) front.rect(gx0 + (gx1 - gx0) * k - 1, gy - 8, 2, 16).fill({ color: 0xffd98a });
    if (rw > 0.02) {
      for (let y = (t * 300) % 12; y < VH; y += 12) front.rect(0, y, VW, 1).fill({ color: 0xc8b4ff, alpha: 0.05 * rw });
      front.rect(0, 0, VW, VH).stroke({ width: 10, color: 0xb6a4ff, alpha: 0.35 * rw });
      // 逆回りの小さな時計（左上）
      const sx = VW - 40, sy = 40;
      front.circle(sx, sy, 18).stroke({ width: 2, color: 0xe2d6ff, alpha: rw });
      const a = -t * 8;
      front.moveTo(sx, sy).lineTo(sx + Math.cos(a) * 14, sy + Math.sin(a) * 14).stroke({ width: 2, color: 0xe2d6ff, alpha: rw });
    }
    if (sim.phase === 'drain') front.rect(0, VH - 60, VW, 60).fill({ color: 0xff9f8f, alpha: 0.08 + 0.06 * Math.sin(t * 12) });
  };

  const hook = installDebugHook('seed-echo-rewind', () => ({ phase: sim.phase, lit: sim.litCount, gauge: +sim.gauge.toFixed(2), balls: sim.balls, rewinding: sim.rewinding, ball: sim.ballPos, time: +sim.time.toFixed(1) }));
  loop.start();
  hook.ready = true;
}

function lerp(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
}

void main();
