/**
 * Echo Loop（残響ループ）：描画・操作・画面遷移。EL-20b で「一筆のループ」に作り直した。
 * 球は1つ。落ちると次の周になるが、灯した星は残る。星座の線の両端が灯ると光の弦になって球を弾く。速い球なら弦を切れる。
 * ←/Z 左フリッパー、→// 右フリッパー、Space（長押しで強く）発射、P ポーズ、R やり直し、T 調整パネル、M 消音。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Input } from '@engine/input';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { createTuning } from '@engine/tuning';
import { Save, clearStored } from '@engine/storage';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, touchButtons, resetButton, goTo } from '@engine/hud';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { ruleCards, introCard } from '@engine/rules';
import { boardWalls, BOARD_W, BOARD_H, BALL_R } from '../../nova-pinball/src/sim';
import { schema, presets, DEFAULT_PRESET, toSim, type EchoConfig } from './config';
import { stages } from './stages';
import { echoRules } from './rules';
import { EchoSim, HZ, STAR_R, IN_LEFT, IN_RIGHT, IN_LAUNCH } from './sim';
import { EchoBot } from './bot';

interface Progress {
  cleared: Record<string, number>;
  /** ステージID → クリアに使った最少の周 */
  best: Record<string, number>;
}

const params = new URLSearchParams(location.search);
const S = 40;
const VIEW_W = BOARD_W * S, VIEW_H = BOARD_H * S;
/** 星座の色：水色・金・藤・青緑（Echo の空に合わせて） */
const GROUP_COLOR = [0x7ff0ff, 0xffd98a, 0xd9b3ff, 0x9fffd0];
const GROUP_CSS = ['#7ff0ff', '#ffd98a', '#d9b3ff', '#9fffd0'];
const STAGE_KEYS = [2, 7, -3, 4, -5, 0, 5, -2, 3, -4];

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const worldMask = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff });
  ga.root.addChild(worldMask);
  ga.world.mask = worldMask;
  // 水色〜青緑の夜明け前の空（Nova の青紫と見分ける）
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#06303a', '#020a10', ['#1a7a86', '#1b5a8f', '#2a9a8a']));
  const field = makeStarfield(VIEW_W, VIEW_H, 150, 23);
  const glowLayer = new Graphics();
  const wallG = new Graphics();
  const strG = new Graphics();
  const starG = new Graphics();
  const ballG = new Graphics();
  const ballGlow = new Sprite(glowTexture());
  ballGlow.anchor.set(0.5);
  ballGlow.blendMode = 'add';
  const particles = new Particles(1800);
  const banner = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fill: 0xe6fbff, fontSize: 34, fontWeight: '600', letterSpacing: 6, align: 'center', dropShadow: { color: 0x000000, blur: 8, distance: 0, alpha: 0.9 } } });
  banner.anchor.set(0.5);
  banner.position.set(VIEW_W / 2 - 20, VIEW_H * 0.6);
  const board = new Container();
  board.addChild(glowLayer, wallG, strG, starG, ballGlow, ballG, particles.container, banner);
  ga.world.addChild(sky, field.container, board);

  for (const line of boardWalls({})) {
    const flat = line.map((p) => [p.x * S, p.y * S]).flat();
    wallG.poly(flat, false).stroke({ width: 7, color: 0x6ff0ff, alpha: 0.1 });
    wallG.poly(flat, false).stroke({ width: 2, color: 0xbff6ff, alpha: 0.8 });
  }

  const tuning = createTuning<EchoConfig>('echo-loop', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('echo-loop', { cleared: {}, best: {} });
  const input = new Input({
    left: { keys: ['ArrowLeft', 'KeyZ', 'ShiftLeft', 'KeyA'], touch: { x0: 0, y0: 0.5, x1: 0.5, y1: 1 } },
    right: { keys: ['ArrowRight', 'Slash', 'ShiftRight', 'KeyL'], touch: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 } },
    launch: { keys: ['Space', 'ArrowDown', 'Enter'], touch: { x0: 0, y0: 0, x1: 1, y1: 0.5 } },
  });

  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  const toastEl = el('div', { class: 'toast' });
  center.append(toastEl);
  hud.append(tl, tr, center);
  document.body.appendChild(hud);
  let toastTimer = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
  };

  let stageIndex = Math.min(stages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = new EchoSim(stages[stageIndex], toSim(cfg));
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let bot = new EchoBot(1, 0.85);
  let resultTimer = -1;
  let t = 0;
  let bannerT = 0;
  const trail: { x: number; y: number }[] = [];
  /** 前の周の一筆の跡（1本だけ、うすく） */
  let ghost: { x: number; y: number }[] = [];
  const rings: { x: number; y: number; r: number; age: number; life: number; color: number }[] = [];

  const closeMenu = () => { menu?.remove(); menu = null; };
  const showBanner = (s: string, sec = 1.8) => { banner.text = s; bannerT = sec; };

  installNav(
    () => {
      if (mode === 'play' || mode === 'pause') togglePause();
      else if (mode === 'result') showTitle();
      else goTo('./index.html');
    },
    () => (mode === 'play' ? '‖ ポーズ' : mode === 'pause' ? '▶ 続ける' : mode === 'result' ? '← ステージ選択' : '← 星図へ'),
  );

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    sim = new EchoSim(stages[i], toSim(cfg));
    bot = new EchoBot(i + 1, 0.85);
    trail.length = 0;
    ghost = [];
    rings.length = 0;
    resultTimer = -1;
    mode = 'play';
    showBanner('1 周目');
    toast(stages[i].hint);
    const id = stages[i].id;
    introCard(id === 'echo-first' ? echoRules[2] : id === 'echo-snap' || id === 'echo-cage' ? echoRules[3] : null, id === 'echo-first' ? '光の弦' : '弦を切る');
    synth.setKey(STAGE_KEYS[i % STAGE_KEYS.length]);
  };

  const showResult = () => {
    mode = 'result';
    const st = stages[stageIndex];
    const stars = sim.rating();
    if (stars) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.data.best[st.id] = Math.min(save.data.best[st.id] ?? 99, sim.loop);
      save.write();
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${stars ? 'ALL LIT' : 'LOOP OUT'}</h1>
      <h2>${st.name}</h2>
      ${stars ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>${stars ? `${sim.loop} 周で、${sim.stars.length} の星を全部灯した` : `灯した星 <b style="color:var(--ink)">${sim.litCount} / ${sim.stars.length}</b> — 周（${sim.cfg.maxLoops}）が尽きた`}</p>
      <p style="font-size:13px">★：${st.par} 周以内で★3、${st.par + 1} 周以内で★2${save.data.best[st.id] ? `　これまでの最少 ${save.data.best[st.id]} 周` : ''}</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (stars && stageIndex < stages.length - 1) {
      const nb = el('button', { class: 'btn' }, '次のステージ →');
      nb.onclick = () => startStage(stageIndex + 1);
      row.appendChild(nb);
    }
    const rb = el('button', { class: 'btn' }, 'もう一度 (R)');
    rb.onclick = () => startStage(stageIndex);
    const mb = el('button', { class: 'btn' }, 'ステージ選択');
    mb.onclick = () => showTitle();
    row.append(rb, mb, launcherButton());
    document.body.appendChild(menu);
    (row.firstElementChild as HTMLElement)?.focus();
  };

  const showTitle = () => {
    closeMenu();
    mode = 'menu';
    menu = el('div', { class: 'menu' });
    const unlocked = (i: number) => i === 0 || params.has('all') || save.data.cleared[stages[i - 1].id] !== undefined;
    menu.innerHTML = `
      <h1>ECHO LOOP</h1>
      <h2>残 響 ル ー プ</h2>
      <div class="rulebox"></div>
      <p style="max-width:620px;line-height:1.8;font-size:13px">球は1つ。落ちても<b style="color:#7ff0ff">次の周</b>が始まり、灯した星はそのまま残る — 自分の一筆が盤面を変えていく。<br>
      線の両端が灯ると<b>光の弦</b>が張られて球を弾く。足場にも、奥の星を塞ぐ壁にもなる。少ない周で全部灯すほど★。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>←</kbd>/<kbd>Z</kbd> 左フリッパー　<kbd>→</kbd>/<kbd>/</kbd> 右フリッパー　<kbd>Space</kbd> 長押しで発射<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：画面の左下／右下でフリッパー、上半分で発射</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(echoRules));
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
      const best = save.data.best[st.id];
      const d = el('div', { class: 'stage' + (r ? ' cleared' : '') + (ok ? '' : ' locked') },
        `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>${best ? `<span style="display:block;font-size:11px;color:var(--accent)">${best}周</span>` : ''}`);
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(); startStage(i); };
      grid.appendChild(d);
    });
    menu.appendChild(resetButton('echo-loop', '残響ループ', clearStored));
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
      row.append(c, r, m, launcherButton());
      menu.appendChild(settingsRow(tuning.gui, () => tuning.toggle()));
      menu.appendChild(ruleCards(echoRules));
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
    }
  };

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyT') tuning.toggle();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  window.addEventListener('pointerdown', () => synth.unlock());
  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    // 弾き・切れる速さ・発射はすぐ反映（重力・フリッパーの長さなどはやり直しで）
    const c = toSim(cfg);
    Object.assign(sim.cfg, { stringKick: c.stringKick, snapSpeed: c.snapSpeed, completeKick: c.completeKick, hitKick: c.hitKick, bumperKick: c.bumperKick, flipperSpeed: c.flipperSpeed, launchMin: c.launchMin, launchMax: c.launchMax });
    if (restart && mode === 'play' && key !== '*') toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('echo');
  ga.setBloom(cfg.bloom);

  const tbar = touchButtons([{ label: '‖', onPress: () => togglePause() }], 'bottom');

  const handle = () => {
    for (const e of sim.events) {
      if (e.t === 'flip') synth.flipper(e.side === 'L' ? 1 : 1.1);
      else if (e.t === 'launch') synth.launch(e.power);
      else if (e.t === 'light') {
        const col = GROUP_COLOR[sim.stars[e.star].group % GROUP_COLOR.length];
        particles.emit(e.x * S, e.y * S, { count: 36, speed: [60, 280], life: [0.3, 0.8], size: [0.04, 0.12], color: [col, 0xffffff] });
        rings.push({ x: e.x, y: e.y, r: 1.4, age: 0, life: 0.5, color: col });
        synth.bell(sim.litCount + 2, 0.12);
        juice.hitstop(0.04);
        juice.shake(0.15 * cfg.shake);
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
        synth.noise(0.25, { vol: 0.1, from: 6000, to: 1500 });
        synth.tone(1760, 0.3, { type: 'triangle', vol: 0.06, slideTo: 440 });
        const col = GROUP_COLOR[sim.stars[sim.stage.links[e.link][0]].group % GROUP_COLOR.length];
        particles.emit(e.x * S, e.y * S, { count: 30, speed: [80, 320], life: [0.2, 0.6], size: [0.03, 0.09], color: [0xffffff, col] });
        juice.hitstop(0.06);
        juice.shake(0.3 * cfg.shake);
      } else if (e.t === 'strung') {
        synth.tone(880, 0.6, { type: 'sine', vol: 0.06, slideTo: 1320 });
        sim.pluck.set(e.link, sim.tick);
      } else if (e.t === 'complete') {
        const col = GROUP_COLOR[e.group % GROUP_COLOR.length];
        juice.slowmo(0.3, 0.9);
        juice.doFlash(0.35, col);
        juice.shake(0.5 * cfg.shake);
        synth.arp([0, 4, 7, 11, 14], 0.06, 0.1);
        rings.push({ x: e.x, y: e.y, r: 5, age: 0, life: 0.9, color: col });
        for (const s of sim.stars) if (s.group === e.group) particles.emit(s.x * S, s.y * S, { count: 40, speed: [80, 360], life: [0.4, 1.2], size: [0.05, 0.16], color: [col, 0xffffff] });
        showBanner(`「${sim.stage.groupNames[e.group]}」 完成`);
      } else if (e.t === 'drain') {
        synth.tone(260, 0.7, { type: 'sine', vol: 0.08, slideTo: 90 });
        juice.doFlash(0.25, 0x6ff0ff);
        if (trail.length) ghost = trail.splice(0);
      } else if (e.t === 'loop') {
        showBanner(`${e.loop} 周目${e.loop === sim.cfg.maxLoops ? ' — 最後の周' : ''}`);
        synth.whoosh(0.8);
      } else if (e.t === 'clear') {
        juice.slowmo(0.25, 1.5);
        juice.doFlash(0.6, 0xfff1c8);
        synth.arp([0, 2, 4, 7, 9, 11, 14, 16], 0.07, 0.12);
        for (const s of sim.stars) particles.emit(s.x * S, s.y * S, { count: 30, speed: [80, 420], life: [0.5, 1.4], size: [0.05, 0.18], color: [GROUP_COLOR[s.group % GROUP_COLOR.length], 0xfff1c8] });
        showBanner('全部灯った', 99);
        resultTimer = sim.tick + Math.round(HZ * 2.2);
      } else if (e.t === 'fail') {
        synth.tone(196, 1.2, { type: 'sine', vol: 0.15, slideTo: 60 });
        showBanner('周が尽きた', 99);
        resultTimer = sim.tick + Math.round(HZ * 1.4);
      }
    }
  };

  const loop = new FixedLoop({
    update: () => {
      const mask = input.sample();
      if (mode !== 'play') return;
      let m = (mask & 1 ? IN_LEFT : 0) | (mask & 2 ? IN_RIGHT : 0) | (mask & 4 ? IN_LAUNCH : 0);
      if (autoplay) m |= bot.input(sim);
      sim.step(m);
      handle();
      if (sim.tick % 3 === 0) {
        const p = sim.ball.getPosition();
        trail.push({ x: p.x, y: p.y });
        if (trail.length > 600) trail.shift();
      }
      if (resultTimer >= 0) {
        if (sim.tick >= resultTimer) { resultTimer = -1; showResult(); }
        else sim.tick++;
      }
    },
    render: (_a, dt) => {
      t += dt;
      field.update(t);
      particles.update(dt);
      particles.multiplier = cfg.particles;
      juice.update(dt, cfg.gameSpeed);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      bannerT -= dt;
      banner.alpha = mode === 'menu' ? 0 : Math.max(0, Math.min(1, bannerT));
      draw(dt);
      if (mode === 'menu') { tl.innerHTML = ''; tr.innerHTML = ''; }
      else {
        const st = stages[stageIndex];
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">${sim.loop} 周目<span style="font-size:14px;color:var(--dim)"> / ${sim.cfg.maxLoops}（目安 ${st.par}）</span></div>
          <div>灯した星 ${sim.litCount} / ${sim.stars.length}</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
        tr.innerHTML = st.groupNames.map((n, i) => `<div style="color:${GROUP_CSS[i % GROUP_CSS.length]}">${sim.complete[i] ? '◆' : '◇'} ${n}</div>`).join('');
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const draw = (dt: number) => {
    const st = sim.stage;
    glowLayer.clear();
    // 前の周の一筆の跡（うすく1本だけ）
    if (ghost.length > 1) {
      glowLayer.moveTo(ghost[0].x * S, ghost[0].y * S);
      for (const q of ghost) glowLayer.lineTo(q.x * S, q.y * S);
      glowLayer.stroke({ width: 2, color: 0x9ff0ff, alpha: 0.06 });
    }
    // 星座の線：弦になったものは震えて光る、まだのものはうすい点線
    strG.clear();
    st.links.forEach(([a, b], i) => {
      const A = sim.stars[a], B = sim.stars[b];
      const col = GROUP_COLOR[A.group % GROUP_COLOR.length];
      const g = sim.strings.get(i);
      if (!g) {
        const n = 10;
        for (let k = 0; k < n; k += 2) {
          const f0 = k / n, f1 = (k + 1) / n;
          strG.moveTo((A.x + (B.x - A.x) * f0) * S, (A.y + (B.y - A.y) * f0) * S).lineTo((A.x + (B.x - A.x) * f1) * S, (A.y + (B.y - A.y) * f1) * S);
        }
        strG.stroke({ width: 1, color: col, alpha: 0.3 });
        return;
      }
      if (sim.snapped.has(i)) {
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
      const col = GROUP_COLOR[s.group % GROUP_COLOR.length];
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
        starG.fill({ color: 0x0c2630 }).stroke({ width: 1.5, color: col, alpha: 0.55 + 0.2 * Math.sin(t * 2 + s.id) });
      }
    }
    // フリッパー
    for (const f of sim.flippers) {
      const p = f.body.getPosition(), a = f.body.getAngle();
      const s = f.side === 'L' ? 1 : -1, L = sim.cfg.flipperLength;
      const pts = [[0, -0.26], [s * L, -0.11], [s * L, 0.11], [0, 0.26]].map(([x, y]) => [(p.x + x * Math.cos(a) - y * Math.sin(a)) * S, (p.y + x * Math.sin(a) + y * Math.cos(a)) * S]).flat();
      starG.poly(pts).fill({ color: 0x1a4a5a }).stroke({ width: 2, color: 0xbff6ff });
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
    tail.forEach((q, i) => ballG.circle(q.x * S, q.y * S, BALL_R * S * (i / tail.length) * 0.8).fill({ color: 0xcff8ff, alpha: 0.25 * (i / tail.length) }));
    ballG.circle(p.x * S, p.y * S, BALL_R * S).fill({ color: 0xf4fdff }).stroke({ width: 1.5, color: 0x7ff0ff });
    ballGlow.position.set(p.x * S, p.y * S);
    ballGlow.scale.set(0.35);
    ballGlow.alpha = mode === 'menu' ? 0 : 0.6;
    if (sim.launchCharge > 0) ballG.rect(13.5 * S, (BOARD_H - 0.4) * S, 0.6 * S, -sim.launchCharge * 4 * S).fill({ color: 0xffd98a, alpha: 0.6 });
  };

  const hook = installDebugHook('echo-loop', () => ({ mode, stage: stageIndex, phase: sim.phase, loop: sim.loop, lit: sim.litCount, stars: sim.stars.length, strung: sim.strung.size }));
  hook.start = (i: number) => startStage(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  if (params.has('stage') || autoplay) startStage(stageIndex);
  else showTitle();
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
