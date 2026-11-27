/**
 * Event Horizon — 地平すれすれ（EH-20b）。描画・入力・画面遷移。シミュレーションは sim.ts（Pixi を使わない）。
 * 船でブラックホールの周りを回り、地平すれすれをかすめるほど時計が遅れて倍率が上がる。かけらを拾うと 10 × 倍率 点。
 * 操作は2つ：加速（↑・Space・W・左クリック長押し／スマホは画面の右半分）、減速（↓・X・S／スマホは左半分）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save, clearStored } from '@engine/storage';
import { Particles } from '@engine/particles';
import { fxRandom } from '@engine/rng';
import { skyTexture, makeStarfield, glowTexture, lerpColor } from '@engine/gfx';
import { injectBaseStyle, el, touchButtons, touchText, resetButton, goTo } from '@engine/hud';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { ruleCards, introCard } from '@engine/rules';
import { schema, presets, DEFAULT_PRESET, toSkim, type HorizonConfig } from './config';
import { stages } from './stages';
import { horizonRules, horizonIntros } from './rules';
import { SkimSim, HZ, WORLD_W, WORLD_H } from './sim';
import { SkimBot } from './bot';

const S = 30;
const VW = WORLD_W * S, VH = WORLD_H * S;
const px = (x: number) => x * S;
const params = new URLSearchParams(location.search);

interface Progress { cleared: Record<string, number>; best: Record<string, number> }

async function main() {
  injectBaseStyle(`
    .pops { position:fixed; z-index:6; pointer-events:none; font-weight:700; text-shadow:0 0 8px #000 }
    .ehbar { width:170px; height:6px; border-radius:3px; background:rgba(120,140,220,.2); overflow:hidden; margin:3px 0 6px }
    .ehbar i { display:block; height:100% }
  `);
  const ga = await createGameApp(VW, VH);
  const juice = new Juice();
  const tuning = createTuning<HorizonConfig>('event-horizon', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('event-horizon', { cleared: {}, best: {} });
  save.data.best ??= {};

  const sky = new Sprite(skyTexture(VW, VH, '#070a22', '#010208', ['#2a1a5a', '#13306a', '#4a1a4a']));
  // 背景の星：倍率が上がるとブラックホールへ寄って（縮んで）青くなる
  const fieldWrap = new Container();
  const field = makeStarfield(VW, VH, 220, 41);
  fieldWrap.addChild(field.container);
  const trailG = new Graphics();
  const diskBack = new Graphics();
  const holeG = new Graphics();
  const diskFront = new Graphics();
  const shardLayer = new Container();
  const predG = new Graphics();
  const shipG = new Graphics();
  const shipGlow = new Sprite(glowTexture());
  shipGlow.anchor.set(0.5);
  shipGlow.blendMode = 'add';
  const lensLayer = new Container();
  const blueWash = new Graphics().rect(0, 0, VW, VH).fill({ color: 0x3a6cff });
  blueWash.blendMode = 'add';
  blueWash.alpha = 0;
  const particles = new Particles(1600);
  ga.world.addChild(sky, fieldWrap, lensLayer, trailG, diskBack, holeG, diskFront, shardLayer, predG, shipGlow, shipG, particles.container, blueWash);

  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  hud.append(tl, tr, center);
  document.body.appendChild(hud);

  let stageIndex = Math.min(stages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = new SkimSim(stages[stageIndex], toSkim(cfg));
  let bot = new SkimBot(0.85, 1);
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let resultTimer = -1;
  let t = 0;
  let skimGlow = 0;
  let toneT = 0;
  const trail: { x: number; y: number; m: number }[] = [];
  let shardSprites: Sprite[] = [];
  let lensSprites: Sprite[] = [];
  const pops: { x: number; y: number; age: number; node: HTMLElement }[] = [];
  const closeMenu = () => { menu?.remove(); menu = null; };

  const multColor = (m: number) => (m < 1.6 ? lerpColor(0xffe2b0, 0xffffff, (m - 1) / 0.6) : lerpColor(0xffffff, 0x5a9cff, Math.min(1, (m - 1.6) / 2.5)));

  const buildSprites = () => {
    shardLayer.removeChildren().forEach((c) => c.destroy());
    lensLayer.removeChildren().forEach((c) => c.destroy());
    shardSprites = sim.shards.map(() => {
      const sp = new Sprite(glowTexture());
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      shardLayer.addChild(sp);
      return sp;
    });
    // 重力レンズの光の暈（ブラックホールごと）
    lensSprites = sim.stage.holes.map(() => {
      const sp = new Sprite(glowTexture());
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.tint = 0x8fa8ff;
      sp.alpha = 0.35;
      lensLayer.addChild(sp);
      return sp;
    });
  };

  const start = (i: number) => {
    closeMenu();
    mode = 'play';
    stageIndex = i;
    sim = new SkimSim(stages[i], toSkim(cfg), 7);
    bot = new SkimBot(0.85, 1 + i);
    resultTimer = -1;
    trail.length = 0;
    skimGlow = 0;
    for (const p of pops) p.node.remove();
    pops.length = 0;
    buildSprites();
    const it = stages[i].intro ? horizonIntros[stages[i].intro!] : null;
    introCard(it?.frame ?? null, it?.title);
    center.innerHTML = `<div style="color:var(--gold);max-width:560px;margin:0 auto">${touchText(stages[i].hint, [['↓（減速）', '左半分を押す（減速）'], ['↑（加速）', '右半分を押す（加速）']])}</div>`;
    const cur = sim;
    setTimeout(() => { if (sim === cur) center.innerHTML = ''; }, 5000);
    synth.setKey(i % 5);
  };
  const restart = () => start(stageIndex);

  const showResult = () => {
    mode = 'result';
    const st = stages[stageIndex];
    const stars = sim.starsFor();
    if (stars > 0) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.data.best[st.id] = Math.max(save.data.best[st.id] ?? 0, sim.score);
      save.write();
    }
    const why = sim.endWhy === 'horizon' ? '地平に飲み込まれた' : sim.endWhy === 'drift' ? '遠くへ流された' : '船の時計が尽きた';
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `<h1>${stars ? 'CLEAR' : 'FAILED'}</h1><h2>${st.name}</h2>
      <p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
      <p>${why}　得点 <b style="color:#ffe7a8;font-size:22px">${sim.score}</b>　かけら ${sim.picks}　最高倍率 ×${sim.bestMult.toFixed(1)}${save.data.best[st.id] ? `　これまでの最高 ${save.data.best[st.id]}` : ''}</p>
      <p style="font-size:13px">★ ${st.stars.join(' / ')} 点（★1 で次の面へ）</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (stars && stageIndex < stages.length - 1) {
      const nb = el('button', { class: 'btn' }, '次のステージ →');
      nb.onclick = () => start(stageIndex + 1);
      row.appendChild(nb);
    }
    const rb = el('button', { class: 'btn' }, 'もう一度 (R)');
    rb.onclick = restart;
    const mb = el('button', { class: 'btn' }, 'ステージ選択');
    mb.onclick = () => showTitle();
    row.append(rb, mb, launcherButton());
    document.body.appendChild(menu);
    (row.firstElementChild as HTMLElement)?.focus();
  };

  const showTitle = () => {
    closeMenu();
    mode = 'menu';
    center.innerHTML = '';
    menu = el('div', { class: 'menu' });
    const unlocked = (i: number) => i === 0 || params.has('all') || save.data.cleared[stages[i - 1].id] !== undefined;
    menu.innerHTML = `
      <h1>EVENT HORIZON</h1>
      <h2>事 象 の 地 平</h2>
      <div class="rulebox"></div>
      <p style="max-width:640px;line-height:1.8;font-size:13px">小さな船でブラックホールの周りを回ろう。<b style="color:#9fc0ff">地平に近いほど船の時計が遅れ</b>、倍率が上がる。光る<b style="color:var(--gold)">かけら</b>を拾うと 10 × 倍率 点。<br>
      攻めるほど高得点 — でも地平の内側に入ったら終わり。すれすれで加速して離脱しろ。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>↑</kbd><kbd>Space</kbd>／左クリック長押し 加速（軌道が膨らむ）　<kbd>↓</kbd><kbd>X</kbd> 減速（地平へ潜る）<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：画面の右半分を押すと加速、左半分で減速</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(horizonRules));
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
      const d = el('div', { class: 'stage' + (r ? ' cleared' : '') + (ok ? '' : ' locked') }, `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(49); start(i); };
      grid.appendChild(d);
    });
    menu.appendChild(resetButton('event-horizon', '事象の地平', clearStored));
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
      r.onclick = restart;
      const m = el('button', { class: 'btn' }, 'ステージ選択');
      m.onclick = showTitle;
      row.append(c, r, m, launcherButton());
      menu.appendChild(settingsRow(tuning.gui, () => tuning.toggle()));
      menu.appendChild(ruleCards(horizonRules));
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
    }
  };
  installNav(
    () => {
      if (mode === 'play' || mode === 'pause') togglePause();
      else if (mode === 'result') showTitle();
      else goTo('./index.html');
    },
    () => (mode === 'play' ? '‖ ポーズ' : mode === 'pause' ? '▶ 続ける' : mode === 'result' ? '← ステージ選択' : '← 星図へ'),
  );

  // ---- 入力 ----
  const keys = { up: false, down: false };
  const pointers = new Map<number, 1 | -1>();
  let playerInput = 0;
  const applyInput = () => {
    const ps = [...pointers.values()];
    const up = keys.up || ps.includes(1), down = keys.down || ps.includes(-1);
    playerInput = up && !down ? 1 : down && !up ? -1 : 0;
  };
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)) { keys.up = true; if (mode === 'play') e.preventDefault(); }
    if (['ArrowDown', 'KeyX', 'KeyS'].includes(e.code)) { keys.down = true; if (mode === 'play') e.preventDefault(); }
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'result')) restart();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyT') tuning.toggle();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
    applyInput();
  });
  window.addEventListener('keyup', (e) => {
    if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)) keys.up = false;
    if (['ArrowDown', 'KeyX', 'KeyS'].includes(e.code)) keys.down = false;
    applyInput();
  });
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (e.pointerType === 'mouse') { if (e.button === 0) pointers.set(e.pointerId, 1); else if (e.button === 2) pointers.set(e.pointerId, -1); }
    else pointers.set(e.pointerId, e.clientX > window.innerWidth / 2 ? 1 : -1);
    applyInput();
  });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); applyInput(); };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const tbar = touchButtons([{ label: '‖', onPress: () => togglePause() }], 'top', { landscape: true });
  tuning.onChange((key) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    // 噴射・倍率・拾える距離は今のプレイにもすぐ反映（重力・燃料・持ち時間はやり直しで）
    const c = toSkim(cfg);
    Object.assign(sim.cfg, { thrust: c.thrust, maxMult: c.maxMult, pickR: c.pickR });
  });
  synth.setVolume(cfg.volume);

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'pick') {
        const col = multColor(e.mult);
        particles.emit(px(e.x), px(e.y), { count: 18 + Math.round(e.mult * 6), speed: [40, 200 + e.mult * 40], life: [0.3, 0.9], size: [0.04, 0.12], color: [col, 0xffffff] });
        synth.hbell(Math.min(14, 4 + Math.round(e.mult * 2)), 0.08 + Math.min(0.06, e.mult * 0.01), 0.7);
        if (e.mult >= 2.5) { juice.hitstop(0.04); juice.doFlash(0.15, 0x9fc0ff); }
        const node = el('div', { class: 'pops' }, `+${e.pts}${e.mult >= 1.5 ? ` <small>×${e.mult.toFixed(1)}</small>` : ''}`);
        node.style.color = `#${col.toString(16).padStart(6, '0')}`;
        document.body.appendChild(node);
        pops.push({ x: e.x, y: e.y, age: 0, node });
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
      } else if (e.t === 'fuelOut') {
        synth.tone(240, 0.4, { type: 'square', vol: 0.04, slideTo: 120 });
      } else if (e.t === 'end') {
        if (e.why === 'horizon') {
          particles.emit(px(sim.x), px(sim.y), { count: 120, speed: [20, 160], life: [0.6, 1.6], size: [0.03, 0.1], color: [0x9fc0ff, 0xffffff, 0xff9f6a] });
          juice.slowmo(0.2, 1.4);
          juice.doFlash(0.5, 0x2a3a8a);
          synth.tone(220, 2, { type: 'sine', vol: 0.12, slideTo: 30 });
        } else {
          synth.arp([0, 2, 4, 7, 9, 11, 14], 0.07, 0.08);
        }
        resultTimer = Math.round(HZ * 1.6);
      }
    }
  };

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play') return;
      sim.input = autoplay ? bot.input(sim) : playerInput;
      sim.step();
      handle();
      if (sim.tick % 4 === 0 && sim.phase === 'play') {
        trail.push({ x: sim.x, y: sim.y, m: sim.dilation() });
        if (trail.length > 900) trail.shift();
      }
      if (sim.firing && sim.phase === 'play' && sim.tick % 2 === 0) {
        const sp = Math.hypot(sim.vx, sim.vy) || 1;
        const bx = (-sim.vx / sp) * sim.firing, by = (-sim.vy / sp) * sim.firing;
        particles.emit(px(sim.x + bx * 0.35), px(sim.y + by * 0.35), { count: 1, speed: [60, 140], angle: Math.atan2(by, bx), spread: 0.6, life: [0.15, 0.35], size: [0.03, 0.07], color: sim.firing > 0 ? [0xffd98a, 0xff9f6a] : [0x9fe0ff, 0xbfd0ff] });
      }
      // 終わってからリザルトまでの間（sim は進まないので、残りを数える）
      if (sim.phase !== 'play' && resultTimer > 0) resultTimer--;
    },
    render: (_a, dt) => {
      t += dt;
      const dil = mode === 'menu' ? 1 : sim.dilation();
      // 時計が遅れるほど、画面の時間もゆっくりに
      const base = 1 - (1 - Math.max(0.42, 1 / Math.sqrt(dil))) * cfg.slowFx;
      juice.shakeScale = cfg.shake;
      juice.update(dt, base * cfg.gameSpeed);
      particles.multiplier = cfg.particles;
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      field.update(t);
      particles.update(dt);
      const pull = Math.min(1, (dil - 1) / 3);
      const h0 = sim.holes[0];
      fieldWrap.pivot.set(px(h0.x), px(h0.y));
      fieldWrap.position.set(px(h0.x), px(h0.y));
      fieldWrap.scale.set(1 - 0.12 * pull);
      field.container.tint = lerpColor(0xffffff, 0x7fa8ff, pull);
      skimGlow = Math.max(0, skimGlow - dt * 0.8);
      blueWash.alpha = 0.04 * pull + 0.08 * skimGlow;
      ga.setBloom(cfg.bloom, 1 + pull * 0.8);
      draw(dil);
      // 音：倍率に応じて低くなる鼓動
      toneT -= dt;
      if (toneT <= 0 && mode === 'play' && sim.phase === 'play') {
        toneT = 0.45 * Math.min(2.5, dil);
        synth.tone(196 / Math.sqrt(dil), 0.35, { type: 'sine', vol: 0.025 + 0.02 * pull });
      }
      // 得点の飛び出し
      const rect = ga.app.canvas.getBoundingClientRect();
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.age += dt;
        const lp = { x: rect.left + (px(p.x) / VW) * rect.width, y: rect.top + (px(p.y) / VH) * rect.height };
        p.node.style.left = `${lp.x}px`;
        p.node.style.top = `${lp.y - 20 - p.age * 40}px`;
        p.node.style.opacity = String(Math.max(0, 1 - p.age / 1.1));
        if (p.age > 1.1) { p.node.remove(); pops.splice(i, 1); }
      }
      if (mode === 'play' && sim.phase !== 'play' && resultTimer === 0) { resultTimer = -1; showResult(); }
      // HUD
      if (mode === 'menu') { tl.innerHTML = ''; tr.innerHTML = ''; }
      else {
        const st = stages[stageIndex];
        const left = Math.max(0, sim.timeMax - sim.shipTime);
        const mc = multColor(dil).toString(16).padStart(6, '0');
        const next = st.stars.find((v) => sim.score < v);
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big" style="color:#${mc}">×${dil.toFixed(1)}</div>
          <div style="font-size:20px;color:#ffe7a8">${sim.score} 点<span style="font-size:13px;color:var(--dim)">${next ? `（次の★ ${next}）` : '（★★★）'}</span></div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
        tr.innerHTML = `<div>船の時計 ${left.toFixed(1)} 秒</div><div class="ehbar"><i style="width:${(left / sim.timeMax) * 100}%;background:#bfd0ff"></i></div>
          <div>燃料</div><div class="ehbar"><i style="width:${(sim.fuel / sim.fuelMax) * 100}%;background:${sim.fuel < sim.fuelMax * 0.2 ? '#ff8f8f' : '#ffd98a'}"></i></div>
          <div style="font-size:12px;color:var(--dim)">最高 ×${sim.bestMult.toFixed(1)}　かけら ${sim.picks}</div>`;
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = (dil: number) => {
    // 残光：これまでの軌道。倍率が高い所ほど青く太く
    trailG.clear();
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const f = i / trail.length;
      trailG.moveTo(px(a.x), px(a.y)).lineTo(px(b.x), px(b.y)).stroke({ width: 1 + Math.min(3, (b.m - 1) * 1.2), color: multColor(b.m), alpha: 0.06 + 0.4 * f * f });
    }
    diskBack.clear(); diskFront.clear(); holeG.clear();
    sim.holes.forEach((h, hi) => {
      const def = sim.stage.holes[hi];
      const cx = px(h.x), cy = px(h.y), rs = px(def.rs);
      lensSprites[hi]?.position.set(cx, cy);
      lensSprites[hi]?.scale.set((rs * 6) / 64);
      // 降着円盤：傾いた楕円の輪。奥の半分は穴の後ろ、手前の半分は前
      for (let k = 0; k < 7; k++) {
        const rr = rs * (1.5 + k * 0.32);
        const col = lerpColor(0xffe2b0, 0xff7a4a, k / 7);
        const al = 0.5 - k * 0.05;
        const ry = rr * 0.28;
        const ph = t * (1.6 - k * 0.15) + hi;
        diskBack.ellipse(cx, cy, rr, ry).stroke({ width: 2.2, color: col, alpha: al * 0.55 });
        diskFront.moveTo(cx + rr, cy);
        for (let i = 1; i <= 24; i++) {
          const a = (i / 24) * Math.PI;
          diskFront.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * ry);
        }
        diskFront.stroke({ width: 2.6, color: col, alpha: al });
        for (let j = 0; j < 3; j++) {
          const a = ph + j * 2.1 + k;
          const front = Math.sin(a) > 0;
          (front ? diskFront : diskBack).circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * ry, 1.8).fill({ color: 0xfff4d8, alpha: front ? 0.9 : 0.4 });
        }
      }
      // 穴：真っ黒な円と、光子球の細い輪
      holeG.circle(cx, cy, rs * 1.5).stroke({ width: 1.5, color: 0xbfd0ff, alpha: 0.35 + 0.15 * Math.sin(t * 3) });
      holeG.circle(cx, cy, rs).fill({ color: 0x000000 }).stroke({ width: 2, color: 0x9fb8ff, alpha: 0.8 });
      // 倍率の目安の輪（×2・×3）
      for (const m of [2, 3]) {
        const r = def.rs / (1 - 1 / (m * m));
        holeG.circle(cx, cy, px(r)).stroke({ width: 1, color: multColor(m), alpha: 0.18 });
      }
    });
    // かけら
    sim.shards.forEach((s, i) => {
      const sp = shardSprites[i];
      if (!sp) return;
      sp.position.set(px(s.x), px(s.y));
      const m = sim.dilationAt(s.x, s.y);
      sp.tint = multColor(m);
      sp.scale.set(0.16 + 0.03 * Math.sin(t * 5 + i) + Math.min(0.1, (m - 1) * 0.04));
      sp.alpha = mode === 'menu' ? 0.4 : 0.9;
    });
    // 予測線（噴射しないとどう飛ぶか）
    predG.clear();
    if (mode !== 'menu' && sim.phase === 'play' && cfg.predict > 0) {
      const pts = sim.predict(Math.round(HZ * cfg.predict), 6);
      pts.forEach((q, i) => {
        const f = 1 - i / pts.length;
        predG.circle(px(q.x), px(q.y), 1.2 + 1.2 * f).fill({ color: multColor(sim.dilationAt(q.x, q.y)), alpha: 0.15 + 0.4 * f });
      });
    }
    // 船：進む向きの細い三角。地平に近いほど進む向きに引き伸ばされる
    shipG.clear();
    if (mode !== 'menu' && (sim.phase === 'play' || sim.endWhy !== 'horizon')) {
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

  const hook = installDebugHook('event-horizon', () => ({
    mode, stage: stageIndex, phase: sim.phase, why: sim.endWhy, score: sim.score, picks: sim.picks, mult: sim.mult,
    fuel: +sim.fuel.toFixed(2), shipTime: +sim.shipTime.toFixed(1), best: +sim.bestMult.toFixed(2), input: sim.input, time: +sim.time.toFixed(1),
  }));
  hook.start = (i: number) => start(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  hook.sim = () => sim;
  buildSprites();
  loop.start();
  if (params.has('stage') || autoplay) start(stageIndex);
  else showTitle();
  hook.ready = true;
}

void main();
