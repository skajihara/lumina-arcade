/**
 * Stopped World：画面遷移・入力・描画。
 * 止めている間は世界がモノクロになり、置いた力が金色の矢印で浮かぶ。解放の瞬間に色が戻り、全部が一斉に動く。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite, ColorMatrixFilter } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save } from '@engine/storage';
import { Particles } from '@engine/particles';
import { Rng } from '@engine/rng';
import { skyTexture, makeStarfield } from '@engine/gfx';
import { injectBaseStyle, el, backLink } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type StopConfig } from './config';
import { stages } from './stages';
import { StopSim, HZ, WORLD_W, WORLD_H, type Action, type Obj } from './sim';

const SCALE = 50;
const VIEW_W = WORLD_W * SCALE;
const VIEW_H = WORLD_H * SCALE;
const params = new URLSearchParams(location.search);

interface Progress {
  cleared: Record<string, number>;
}

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const tuning = createTuning<StopConfig>('stopped-world', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('stopped-world', { cleared: {} });

  // 描画の層：背景・世界（止めるとモノクロ）・矢印（色のまま）
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0d0b2e', '#03030c'));
  const field = makeStarfield(VIEW_W, VIEW_H, 140, 21);
  const worldLayer = new Container();
  const groundG = new Graphics();
  const nestG = new Graphics();
  const objG = new Graphics();
  const particles = new Particles(2000);
  worldLayer.addChild(sky, field.container, nestG, groundG, objG, particles.container);
  const arrowG = new Graphics();
  ga.world.addChild(worldLayer, arrowG);
  const gray = new ColorMatrixFilter();
  gray.desaturate();

  // HUD
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  const toastEl = el('div', { class: 'toast' });
  center.append(toastEl);
  hud.append(tl, tr, center);
  document.body.appendChild(hud);
  backLink();
  let toastTimer = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
  };

  let sim: StopSim | null = null;
  let stageIndex = 0;
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let botRng = new Rng(1);
  let resultTimer = -1;
  let pending: Action[] = [];
  let drag: { id: number; x: number; y: number; ex: number; ey: number } | null = null;
  let flashColor = 0;
  let t = 0;

  const closeMenu = () => { menu?.remove(); menu = null; };

  const drawGround = () => {
    if (!sim) return;
    const g = groundG;
    g.clear();
    g.rect(0, WORLD_H * SCALE - 2, VIEW_W, 2).fill({ color: 0x9fb8ff, alpha: 0.6 });
    for (const line of sim.stage.ground ?? []) {
      g.moveTo(line[0].x * SCALE, line[0].y * SCALE);
      for (const p of line.slice(1)) g.lineTo(p.x * SCALE, p.y * SCALE);
      g.stroke({ width: 4, color: 0x9fb8ff, alpha: 0.8, cap: 'round' });
    }
  };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    sim = new StopSim(stages[i], cfg);
    pending = [];
    drag = null;
    botRng = new Rng(i + 7);
    resultTimer = -1;
    mode = 'play';
    drawGround();
    toast(stages[i].hint);
  };

  const showResult = () => {
    if (!sim) return;
    mode = 'result';
    const st = stages[stageIndex];
    const cleared = sim.phase === 'clear';
    // 星評価：ゲージを多く残すほど高い
    const left = sim.gauge / cfg.stopGauge;
    const stars = cleared ? (left > 0.5 ? 3 : left > 0.2 ? 2 : 1) : 0;
    if (cleared) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.write();
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${cleared ? 'CLEAR' : 'FAILED'}</h1><h2>${st.name}</h2>
      ${cleared ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>${cleared ? `残りの時間停止 ${sim.gauge.toFixed(1)} 秒` : '卵が割れた／もう動かせない'}</p>
      <p style="font-size:13px">★：時間停止ゲージを多く残すほど高い（★3：半分以上　★2：2割以上）</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (cleared && stageIndex < stages.length - 1) {
      const nb = el('button', { class: 'btn' }, '次のステージ →');
      nb.onclick = () => startStage(stageIndex + 1);
      row.appendChild(nb);
    }
    const rb = el('button', { class: 'btn' }, 'もう一度 (R)');
    rb.onclick = () => startStage(stageIndex);
    const mb = el('button', { class: 'btn' }, 'ステージ選択');
    mb.onclick = () => showTitle();
    row.append(rb, mb);
    document.body.appendChild(menu);
    (row.firstElementChild as HTMLElement)?.focus();
  };

  const showTitle = () => {
    closeMenu();
    mode = 'menu';
    menu = el('div', { class: 'menu' });
    const unlocked = (i: number) => i === 0 || params.has('all') || save.data.cleared[stages[i - 1].id] !== undefined;
    menu.innerHTML = `
      <h1>STOPPED WORLD</h1>
      <h2>時 止 め の 一 撃</h2>
      <p>時間を止めると、世界は色を失って静止する。止まった物体を叩いても動かない — 力が矢印として溜まるだけ。<br>
      時間を戻した瞬間、溜めた力が<b style="color:var(--ink)">全部同時に</b>解き放たれる。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>Space</kbd> 時間を止める／戻す　物体を<b>ドラッグ</b>で力を置く（向きと長さ）<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音</div>`;
    const diff = menu.querySelector('.diff')!;
    for (const name of Object.keys(presets)) {
      const b = el('button', { class: 'btn small' + (tuning.preset === name ? ' sel' : '') }, name);
      b.onclick = () => { tuning.applyPreset(name); showTitle(); };
      diff.appendChild(b);
    }
    const grid = menu.querySelector('.grid')!;
    stages.forEach((st, i) => {
      const r = save.data.cleared[st.id];
      const ok = unlocked(i);
      const d = el('div', { class: 'stage' + (r ? ' cleared' : '') + (ok ? '' : ' locked') },
        `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(55); startStage(i); };
      grid.appendChild(d);
    });
    document.body.appendChild(menu);
  };

  const togglePause = () => {
    if (mode === 'play') {
      mode = 'pause';
      menu = el('div', { class: 'menu' });
      menu.innerHTML = '<h1>PAUSE</h1><div class="row"></div>';
      const row = menu.querySelector('.row')!;
      const c = el('button', { class: 'btn' }, '続ける (P)');
      c.onclick = togglePause;
      const r = el('button', { class: 'btn' }, 'やり直す (R)');
      r.onclick = () => startStage(stageIndex);
      const m = el('button', { class: 'btn' }, 'ステージ選択');
      m.onclick = showTitle;
      row.append(c, r, m);
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
    }
  };

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'Space' && mode === 'play' && sim) {
      e.preventDefault();
      pending.push(sim.stopped ? { t: 'resume' } : { t: 'stop' });
    }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });

  // ドラッグで力を置く（走っている時に物体を掴むと、自動で時間が止まる）
  const pick = (x: number, y: number): Obj | undefined => {
    if (!sim) return undefined;
    let best: Obj | undefined, bd = 1.2;
    for (const o of sim.objs) {
      if (!o.alive || o.def.fixed) continue;
      const p = o.body.getPosition();
      const d = Math.hypot(p.x - x, p.y - y) - Math.max(o.def.w, o.def.h ?? o.def.w) * 0.5;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };
  const toWorld = (e: PointerEvent) => {
    const p = ga.toLogical(e.clientX, e.clientY);
    return { x: p.x / SCALE, y: p.y / SCALE };
  };
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play' || !sim) return;
    const w = toWorld(e);
    const o = pick(w.x, w.y);
    if (!o) return;
    if (!sim.stopped) pending.push({ t: 'stop' });
    drag = { id: o.id, x: w.x, y: w.y, ex: w.x, ey: w.y };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const w = toWorld(e);
    drag.ex = w.x;
    drag.ey = w.y;
  });
  window.addEventListener('pointerup', () => {
    if (!drag || !sim) return;
    const dx = drag.ex - drag.x, dy = drag.ey - drag.y;
    if (Math.hypot(dx, dy) > 0.25) {
      const o = sim.objs[drag.id];
      const p = o.alive ? o.body.getPosition() : { x: drag.x, y: drag.y };
      pending.push({ t: 'hit', id: drag.id, dx, dy, px: drag.x - p.x, py: drag.y - p.y });
    }
    drag = null;
  });

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    if (restart && mode === 'play' && key !== '*') toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  ga.setBloom(cfg.bloom);

  /** 自動プレイ：数秒ごとに時間を止め、卵は巣の方へ、ほかは上へ、軽く叩いて戻す */
  const botActions = (s: StopSim): Action[] => {
    if (s.stopped) return s.forcesThisStop > 0 ? [{ t: 'resume' }] : [];
    if (s.tick % 300 !== 90 || s.gauge < 0.5) return [];
    const live = s.objs.filter((o) => o.alive && !o.def.fixed);
    if (!live.length) return [];
    const o = s.stage.goal === 'nest' ? live.find((x) => x.def.kind === 'egg') ?? live[0] : live[botRng.int(0, live.length - 1)];
    const p = o.body.getPosition();
    const n = s.stage.nest;
    const dx = n ? Math.sign(n.x - p.x) : botRng.range(-1, 1);
    return [{ t: 'stop' }, { t: 'hit', id: o.id, dx, dy: -0.3 }];
  };

  const handleEvents = () => {
    if (!sim) return;
    for (const e of sim.events) {
      switch (e.t) {
        case 'stop':
          synth.tone(880, 0.5, { type: 'sine', vol: 0.12, slideTo: 220 });
          synth.chargeTone(-1);
          break;
        case 'resume':
          juice.doFlash(0.45, 0xfff3d6);
          juice.shake((0.1 + e.forces * 0.06) * cfg.shake);
          synth.whoosh(0.8 + e.forces * 0.2);
          synth.arp([0, 2, 4, 6].slice(0, 1 + Math.min(3, e.forces)), 0.04, 0.09);
          flashColor = 1;
          break;
        case 'hit':
          synth.hbell(3 + (sim.forcesThisStop % 5), 0.09);
          particles.emit(e.x * SCALE, e.y * SCALE, { count: 10, speed: [40, 140], life: [0.3, 0.6], size: [0.05, 0.12], color: 0xffd27f });
          break;
        case 'boom':
          particles.emit(e.x * SCALE, e.y * SCALE, { count: 120, speed: [80, 600], life: [0.5, 1.4], size: [0.06, 0.3], color: [0xffd27f, 0xffa3e0, 0xffffff], drag: 1.6 });
          juice.shake(0.5 * cfg.shake);
          juice.hitstop(0.04);
          synth.boom(0.9, 2);
          break;
        case 'break':
          particles.emit(e.x * SCALE, e.y * SCALE, { count: e.kind === 'egg' ? 60 : 40, speed: [60, 300], life: [0.4, 1.0], size: [0.05, 0.2], color: e.kind === 'egg' ? [0xffffff, 0xffd27f] : [0x9fb8ff, 0xc9a3ff] });
          synth.noise(0.3, { vol: 0.25, from: 3000, to: 300 });
          if (e.kind === 'egg') toast('卵が割れた');
          break;
        case 'clear':
          juice.slowmo(0.25, 1.4);
          juice.doFlash(0.7, 0xffe7a8);
          synth.arp([0, 2, 4, 5, 7, 9], 0.07, 0.11);
          toast(sim.stage.goal === 'nest' ? '卵は巣へ' : '全部壊れた');
          resultTimer = sim.tick + Math.round(HZ * 1.8);
          break;
        case 'fail':
          synth.tone(196, 1, { type: 'sine', vol: 0.15, slideTo: 60 });
          resultTimer = sim.tick + Math.round(HZ * 1.4);
          break;
        default:
          break;
      }
    }
  };

  const draw = (dt: number) => {
    t += dt;
    field.update(t);
    if (!sim) return;
    const stopped = sim.stopped;
    worldLayer.filters = stopped ? [gray] : [];
    flashColor = Math.max(0, flashColor - dt * 2);
    // 巣
    const n = sim.stage.nest;
    nestG.clear();
    if (n) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2);
      nestG.roundRect((n.x - n.w / 2) * SCALE, (n.y - n.h / 2) * SCALE, n.w * SCALE, n.h * SCALE, 18).fill({ color: 0xffd27f, alpha: 0.06 + pulse * 0.05 }).stroke({ width: 2, color: 0xffd27f, alpha: 0.5 });
      nestG.ellipse(n.x * SCALE, (n.y + n.h / 2 - 0.15) * SCALE, n.w * SCALE * 0.42, 8).stroke({ width: 3, color: 0xffd27f, alpha: 0.7 });
    }
    // 物体
    const g = objG;
    g.clear();
    for (const o of sim.objs) {
      if (!o.alive) continue;
      const p = o.body.getPosition();
      const a = o.body.getAngle();
      const x = p.x * SCALE, y = p.y * SCALE;
      const d = o.def;
      if (d.kind === 'egg') {
        g.ellipse(x, y, d.w * SCALE * 1.25, d.w * SCALE * 1.35).fill({ color: 0xffd27f, alpha: 0.15 });
        g.ellipse(x, y, d.w * SCALE * 0.95, d.w * SCALE * 1.1).fill({ color: 0xfff6e0 }).stroke({ width: 2, color: 0xffd27f });
      } else if (d.kind === 'bomb') {
        g.circle(x, y, d.w * SCALE).fill({ color: 0x2a2450 }).stroke({ width: 2, color: 0xffa3e0 });
        const spark = 0.6 + 0.4 * Math.sin(t * (o.armed ? 30 : 8));
        g.circle(x + Math.cos(a - 0.8) * d.w * SCALE, y + Math.sin(a - 0.8) * d.w * SCALE, 4 + (o.armed ? 4 : 0)).fill({ color: 0xffd27f, alpha: spark });
      } else if (d.kind === 'ball' || d.kind === 'rock') {
        g.circle(x, y, d.w * SCALE).fill({ color: d.kind === 'rock' ? 0x4a4f6e : 0x7ff0ff, alpha: 0.9 }).stroke({ width: 2, color: 0xbfd0ff });
      } else {
        const hw = (d.w / 2) * SCALE, hh = ((d.h ?? d.w) / 2) * SCALE;
        const c = Math.cos(a), s = Math.sin(a);
        const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
        const col = d.kind === 'crate' ? 0x6a5acd : 0x3a4a8a;
        g.poly(pts).fill({ color: col, alpha: 0.85 }).stroke({ width: 2, color: 0xc9a3ff });
        if (d.kind === 'crate') g.circle(x, y, Math.min(hw, hh) * 0.35).fill({ color: 0xffffff, alpha: 0.6 });
      }
    }
    // 溜めた力の矢印（色のまま）
    const ag = arrowG;
    ag.clear();
    for (const o of sim.objs) {
      if (!o.alive || (o.force.x === 0 && o.force.y === 0 && !o.armed)) continue;
      const p = o.body.getPosition();
      const x0 = (p.x + o.at.x) * SCALE, y0 = (p.y + o.at.y) * SCALE;
      const k = 0.14 * SCALE;
      const x1 = x0 + o.force.x * k, y1 = y0 + o.force.y * k;
      arrow(ag, x0, y0, x1, y1, 0xffd27f, 0.6 + 0.4 * Math.sin(t * 6));
      if (o.armed) ag.circle(p.x * SCALE, p.y * SCALE, cfg.bombRadius * SCALE * (0.3 + 0.05 * Math.sin(t * 10))).stroke({ width: 2, color: 0xffa3e0, alpha: 0.6 });
    }
    if (drag) {
      const o = sim.objs[drag.id];
      if (o.alive) arrow(ag, drag.x * SCALE, drag.y * SCALE, drag.ex * SCALE, drag.ey * SCALE, 0xffffff, 0.8);
    }
    if (stopped) {
      // 止まっている印：画面の縁
      ag.rect(3, 3, VIEW_W - 6, VIEW_H - 6).stroke({ width: 4, color: 0xffffff, alpha: 0.25 + 0.1 * Math.sin(t * 3) });
    } else particles.update(dt);
    if (flashColor > 0) ag.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xfff3d6, alpha: flashColor * 0.15 });
    // HUD
    const st = stages[stageIndex];
    const gauge = Math.max(0, sim.gauge);
    const bar = Math.round((gauge / cfg.stopGauge) * 20);
    tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">${st.goal === 'nest' ? '卵を巣へ' : '箱を全部壊す'}</div>`;
    tr.innerHTML = `<div style="font-family:monospace;letter-spacing:-1px;color:${stopped ? '#fff' : 'var(--accent)'}">${'█'.repeat(bar)}${'░'.repeat(20 - bar)}</div><div>時間停止 ${gauge.toFixed(1)} 秒　力 ${sim.forcesThisStop}/${Math.round(cfg.maxForces)}</div>${stopped ? '<div style="color:#fff">— 停止中 —</div>' : ''}${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
  };

  const arrow = (g: Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number) => {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 4, color, alpha, cap: 'round' });
    g.moveTo(x1 - ux * 14 - uy * 8, y1 - uy * 14 + ux * 8).lineTo(x1, y1).lineTo(x1 - ux * 14 + uy * 8, y1 - uy * 14 - ux * 8)
      .stroke({ width: 4, color, alpha, cap: 'round', join: 'round' });
  };

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play' || !sim) return;
      const acts = pending;
      pending = [];
      if (autoplay && sim.phase === 'play') acts.push(...botActions(sim));
      sim.step(acts);
      handleEvents();
      if (resultTimer >= 0 && sim.tick >= resultTimer) {
        resultTimer = -1;
        showResult();
      }
    },
    render: (_a, realDt) => {
      juice.shakeScale = cfg.shake;
      juice.update(realDt, cfg.gameSpeed);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      draw(realDt);
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const hook = installDebugHook('stopped-world', () => ({
    mode, stage: stageIndex, phase: sim?.phase, stopped: sim?.stopped, gauge: sim?.gauge,
  }));
  hook.start = (i: number) => startStage(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  hook.sim = () => sim;

  loop.start();
  if (params.has('stage')) startStage(Math.min(stages.length - 1, Number(params.get('stage')) || 0));
  else showTitle();
  hook.ready = true;
}

void main();
