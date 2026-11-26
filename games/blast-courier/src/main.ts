/**
 * Blast Courier（爆風便）。NEW-06：描画・操作・タイトル・ポーズ・リザルト・自動プレイ。
 * 割れやすい灯の卵を、クリックした所の爆風だけで、雲海に浮かぶ島から島へ運び、星の巣へ届ける。
 * 押す・吸う・昇る・遅れ（1〜4・ボタン・ホイールで選ぶ）。爆風が少ないほど★（爆風ゴルフ）。
 * BC-10：押す・遅れは「押す長さで強さ、ドラッグで向き」。構えている間、飛ぶ先の予測線と強さのゲージ。卵が飛んでいる間に構えると時間がゆっくりになる。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { fxRandom } from '@engine/rng';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, goTo, resetButton, touchButtons } from '@engine/hud';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { Save, clearStored } from '@engine/storage';
import { createTuning } from '@engine/tuning';
import { ruleCards, introCard } from '@engine/rules';
import { blastRules, blastIntros } from './rules';
import { schema, presets, DEFAULT_PRESET, toCourier, type BlastConfig } from './config';
import { CourierSim, HZ, WORLD_W, WORLD_H, type BlastKind, type CourierAction } from './sim';
import { courierStages } from './stages';
import { CourierBot } from './bot';

const params = new URLSearchParams(location.search);
const S = 30;
const VIEW_W = WORLD_W * S;
const VIEW_H = WORLD_H * S;
const px = (x: number) => x * S;
const py = (y: number) => y * S;
const KIND_NAME: Record<BlastKind, string> = { push: '押す', pull: '吸う', lift: '昇る', delay: '遅れ' };
const KIND_KEY: Record<BlastKind, string> = { push: '1', pull: '2', lift: '3', delay: '4' };
const KIND_COLOR: Record<BlastKind, number> = { push: 0xffd98a, pull: 0x9fe0ff, lift: 0x9fc0ff, delay: 0xd9b3ff };
const KIND_CSS: Record<BlastKind, string> = { push: '#ffd98a', pull: '#9fe0ff', lift: '#9fc0ff', delay: '#d9b3ff' };

async function main() {
  injectBaseStyle(`
    .kinds { position:fixed; left:50%; bottom:14px; transform:translateX(-50%); display:flex; gap:8px; z-index:6; }
    .kinds button { font:inherit; font-size:13px; color:var(--ink); padding:6px 12px; border-radius:12px; cursor:pointer;
      background:rgba(14,18,56,.7); border:1px solid rgba(140,150,230,.45); }
    .kinds button.sel { border-color:var(--gold); box-shadow:0 0 12px rgba(255,217,138,.35); color:#fff; }
    .kinds button kbd { font-size:11px; opacity:.7; margin-right:4px; }
    body.touch-ui .kinds { bottom:70px; }
  `);
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  // 盤面の外（縦長の画面の上下）へ雲海の光がはみ出さないよう、論理画面で切り抜く
  const worldMask = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff });
  ga.root.addChild(worldMask);
  ga.world.mask = worldMask;
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0c1238', '#24183f', ['#1e2a6a', '#2a2060', '#163a6a']));
  const field = makeStarfield(VIEW_W, VIEW_H, 150, 91);
  const seaBack = new Graphics();
  const landG = new Graphics();
  const nestG = new Graphics();
  const fxBack = new Graphics();
  const eggG = new Graphics();
  const eggGlow = new Sprite(glowTexture());
  eggGlow.anchor.set(0.5);
  eggGlow.blendMode = 'add';
  const seaFront = new Graphics();
  const aimG = new Graphics();
  const particles = new Particles(1800);
  // 卵の伸び縮み：外側を伸ばす向きへ回し、内側で戻す（卵の形は立ったまま、向きに沿って伸びる）
  const eggWrap = new Graphics();
  eggWrap.addChild(eggG);
  ga.world.addChild(sky, field.container, seaBack, landG, nestG, fxBack, eggGlow, eggWrap, seaFront, particles.container, aimG);

  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const center = el('div', { class: 'center' });
  hud.append(tl, center);
  document.body.appendChild(hud);
  const kindBar = el('div', { class: 'kinds' });
  document.body.appendChild(kindBar);

  const tuning = createTuning<BlastConfig>('blast-courier', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<{ cleared: Record<string, number>; best: Record<string, number> }>('blast-courier', { cleared: {}, best: {} });
  let stageIndex = Math.min(courierStages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = new CourierSim(courierStages[stageIndex], toCourier(cfg));
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  let autoplay = params.has('autoplay');
  let bot = new CourierBot(0.85, 1);
  let kind: BlastKind = 'push';
  let mouse = { x: -100, y: -100, in: false };
  /** 構え（押す・遅れ）：押した所・押した時刻（実時間） */
  let charge: { sx: number; sy: number; t0: number; kind: BlastKind } | null = null;
  /** 空中で構えた時のスロー（なめらかに） */
  let slowK = 1;
  /** 卵の伸び縮み：強さ（1→0）と向き。構えている間は縮む */
  let stretch = 0, stretchAng = 0;
  /** 予測線（毎フレームは重いので、間引いて計算） */
  let predPts: { x: number; y: number }[] = [];
  let predFrame = 0;
  let t = 0;
  let resultTimer = -1;
  /** 卵が割れた・巣に入った後の見た目 */
  let shattered = false;
  let respawnFade = 0;
  const rings: { x: number; y: number; r: number; age: number; life: number; color: number; inward?: boolean }[] = [];

  const kinds = () => courierStages[stageIndex].kinds;
  const updateKindBar = () => {
    kindBar.innerHTML = '';
    kindBar.style.display = mode === 'play' ? 'flex' : 'none';
    for (const k of kinds()) {
      const b = el('button', { class: k === kind ? 'sel' : '' }, `<kbd>${KIND_KEY[k]}</kbd>${KIND_NAME[k]}`);
      b.style.color = KIND_CSS[k];
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); kind = k; charge = null; updateKindBar(); });
      kindBar.appendChild(b);
    }
  };

  const start = (i: number) => {
    closeMenu();
    mode = 'play';
    stageIndex = i;
    sim = new CourierSim(courierStages[i], toCourier(cfg));
    bot = new CourierBot(0.85, 1 + i);
    kind = 'push';
    charge = null;
    predPts = [];
    resultTimer = -1;
    shattered = false;
    respawnFade = 0;
    rings.length = 0;
    drawLand();
    updateKindBar();
    const it = blastIntros[courierStages[i].id];
    introCard(it?.frame ?? null, it?.title);
    center.innerHTML = `<div style="color:var(--gold);max-width:520px;margin:0 auto">${courierStages[i].hint}</div>`;
    const cur = sim;
    setTimeout(() => { if (sim === cur) center.innerHTML = ''; }, 4500);
  };
  const restart = () => start(stageIndex);

  /** ★：par 以内で★3、par＋2 以内で★2、それ以外のクリアで★1 */
  const starsOf = () => {
    if (sim.phase !== 'clear') return 0;
    const par = courierStages[stageIndex].par;
    return sim.blasts <= par ? 3 : sim.blasts <= par + 2 ? 2 : 1;
  };

  const showResult = () => {
    mode = 'result';
    updateKindBar();
    const st = courierStages[stageIndex];
    const stars = starsOf();
    if (stars > 0) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.data.best[st.id] = Math.min(save.data.best[st.id] ?? 99, sim.blasts);
      save.write();
    }
    const why = sim.phase === 'fail' ? (sim.cracks >= sim.cfg.cracksMax ? '卵が割れてしまった' : '爆風を使いすぎた') : '';
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `<h1>${stars ? 'DELIVERED' : 'FAILED'}</h1><h2>${st.name}</h2>
      ${stars ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : `<p>${why}</p>`}
      <p>爆風 ${sim.blasts}（目安 ${st.par}）　ひび ${sim.cracks} / ${sim.cfg.cracksMax}${save.data.best[st.id] ? `　これまでの最少 ${save.data.best[st.id]}` : ''}</p>
      <p style="font-size:13px">★：目安の数以内で★3、目安＋2 以内で★2</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (stars && stageIndex < courierStages.length - 1) {
      const nb = el('button', { class: 'btn' }, '次のステージ →');
      nb.onclick = () => start(stageIndex + 1);
      row.appendChild(nb);
    }
    const rb = el('button', { class: 'btn' }, 'もう一度 (R)');
    rb.onclick = () => start(stageIndex);
    const mb = el('button', { class: 'btn' }, 'ステージ選択');
    mb.onclick = () => showTitle();
    row.append(rb, mb, launcherButton());
    document.body.appendChild(menu);
    (row.firstElementChild as HTMLElement)?.focus();
  };

  const showTitle = () => {
    closeMenu();
    mode = 'menu';
    updateKindBar();
    center.innerHTML = '';
    menu = el('div', { class: 'menu' });
    const unlocked = (i: number) => i === 0 || params.has('all') || save.data.cleared[courierStages[i - 1].id] !== undefined;
    menu.innerHTML = `
      <h1>BLAST COURIER</h1>
      <h2>爆 風 便</h2>
      <div class="rulebox"></div>
      <p style="max-width:640px;line-height:1.8;font-size:13px">割れやすい<b style="color:#ffe7b0">灯の卵</b>を、雲海に浮かぶ島から島へ運び、<b style="color:var(--gold)">星の巣</b>へ届けよう。卵には触れない — <b>爆風だけ</b>で動かす。<br>
      向きと強さは自分で決める。でも強すぎる爆風や強いぶつかりで<b style="color:#ff9f9f">ひび</b>が入る。使った爆風が少ないほど★。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><b>押す・遅れ</b>：押さえて<b>ドラッグで向き</b>、<b>押す長さで強さ</b>（卵の周りの輪。赤い所はひびが入る）。放すと撃つ。空中で構えると時間がゆっくりになる<br>
      <b>吸う・昇る</b>：その場をクリック　爆風の切り替え：<kbd>1</kbd>押す <kbd>2</kbd>吸う <kbd>3</kbd>昇る <kbd>4</kbd>遅れ・<kbd>Q</kbd><kbd>E</kbd>・ホイール・下のボタン（面によって使えるものが違う）<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：下のボタンで爆風を選んで、画面を長押し＋なぞって放す</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(blastRules));
    const diff = menu.querySelector('.diff')!;
    for (const name of Object.keys(presets)) {
      const b = el('button', { class: 'btn small' + (tuning.preset === name ? ' sel' : '') }, name);
      b.onclick = () => { tuning.applyPreset(name); showTitle(); };
      diff.appendChild(b);
    }
    const grid = menu.querySelector('.grid')!;
    courierStages.forEach((st, i) => {
      const r = save.data.cleared[st.id];
      const ok = unlocked(i);
      const d = el('div', { class: 'stage' + (r ? ' cleared' : '') + (ok ? '' : ' locked') }, `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); start(i); };
      grid.appendChild(d);
    });
    menu.appendChild(resetButton('blast-courier', '爆風便', clearStored));
    document.body.appendChild(menu);
  };

  const togglePause = () => {
    if (mode === 'play') {
      mode = 'pause';
      updateKindBar();
      menu = el('div', { class: 'menu' });
      menu.innerHTML = '<h1>PAUSE</h1><div class="row"></div>';
      const row = menu.querySelector('.row')!;
      const c = el('button', { class: 'btn' }, '続ける (P)');
      c.onclick = togglePause;
      const r = el('button', { class: 'btn' }, 'やり直す (R)');
      r.onclick = () => start(stageIndex);
      const m = el('button', { class: 'btn' }, 'ステージ選択');
      m.onclick = showTitle;
      row.append(c, r, m, launcherButton());
      menu.appendChild(settingsRow(tuning.gui, () => tuning.toggle()));
      menu.appendChild(ruleCards(blastRules));
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
      updateKindBar();
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

  // ---- 入力（BC-10）----
  // 押す・遅れ：押した所から構え、押す長さで強さ（chargeTime 秒で満ちる）、ドラッグで向き。放すと撃つ
  // ドラッグしない時の向きは、押した所から卵へ（その場を叩いた向き）。吸う・昇るは押した所にすぐ
  const fire = (a: CourierAction) => {
    if (mode !== 'play' || !kinds().includes(a.k)) return false;
    if (!sim.act(a)) {
      if (sim.cooldownLeft > 0) synth.tone(180, 0.08, { type: 'square', vol: 0.03 });
      return false;
    }
    return true;
  };
  const chargePower = () => (charge ? Math.min(1, (performance.now() - charge.t0) / 1000 / Math.max(0.05, cfg.chargeTime)) : 0);
  /** 今の構えを操作にする */
  const chargeAction = (): CourierAction | null => {
    if (!charge) return null;
    const e = sim.eggPos;
    let ax = mouse.x - charge.sx, ay = mouse.y - charge.sy;
    if (Math.hypot(ax, ay) < 0.35) { ax = e.x - charge.sx; ay = e.y - charge.sy; }
    if (Math.hypot(ax, ay) < 1e-3) { ax = 0; ay = -1; }
    const at = charge.kind === 'delay' ? { x: charge.sx, y: charge.sy } : e;
    return { k: charge.kind, x: at.x, y: at.y, ax, ay, p: Math.max(cfg.minPower, chargePower()) };
  };
  const release = () => {
    const a = chargeAction();
    charge = null;
    predPts = [];
    if (a) fire(a);
  };
  const cycleKind = (d: number) => {
    const ks = kinds();
    kind = ks[(ks.indexOf(kind) + d + ks.length) % ks.length];
    charge = null;
    updateKindBar();
  };
  ga.app.canvas.addEventListener('pointermove', (e) => {
    const p = ga.toLogical(e.clientX, e.clientY);
    mouse = { x: p.x / S, y: p.y / S, in: true };
  });
  ga.app.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.in = false; });
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play' || autoplay) return;
    // 右ボタンは使わない（構えの取り消しだけ）
    if (e.button === 2) { charge = null; predPts = []; return; }
    const p = ga.toLogical(e.clientX, e.clientY);
    mouse = { x: p.x / S, y: p.y / S, in: true };
    if (kind === 'push' || kind === 'delay') {
      charge = { sx: mouse.x, sy: mouse.y, t0: performance.now(), kind };
      ga.app.canvas.setPointerCapture?.(e.pointerId);
      synth.tone(330, 0.08, { type: 'sine', vol: 0.03 });
    } else fire({ k: kind, x: mouse.x, y: mouse.y });
  });
  ga.app.canvas.addEventListener('pointerup', () => { if (charge) release(); });
  ga.app.canvas.addEventListener('pointercancel', () => { charge = null; predPts = []; });
  ga.app.canvas.addEventListener('wheel', (e) => { if (mode === 'play') { e.preventDefault(); cycleKind(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'result')) restart();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyT') tuning.toggle();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
    const map: Record<string, BlastKind> = { Digit1: 'push', Digit2: 'pull', Digit3: 'lift', Digit4: 'delay' };
    if (map[e.code] && kinds().includes(map[e.code])) { kind = map[e.code]; charge = null; updateKindBar(); }
    if (e.code === 'KeyQ') cycleKind(-1);
    if (e.code === 'KeyE') cycleKind(1);
  });
  const tbar = touchButtons([{ label: '‖', onPress: () => togglePause() }], 'top');
  tuning.onChange((key) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    // 爆風・卵の値は今のプレイにもすぐ反映（重力・空気抵抗はやり直しで）
    const c = toCourier(cfg);
    Object.assign(sim.cfg, { cracksMax: c.cracksMax, crackSpeed: c.crackSpeed, blastCrack: c.blastCrack, blastForce: c.blastForce, blastR: c.blastR, pullForce: c.pullForce, liftAccel: c.liftAccel, liftTime: c.liftTime, delayTime: c.delayTime, cooldown: c.cooldown });
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('courier');
  ga.setBloom(cfg.bloom);

  // ---- 動かない物：島・棘・巣・雲 ----
  const drawLand = () => {
    const st = courierStages[stageIndex];
    landG.clear();
    for (const isl of st.islands) {
      if (isl.move) continue;
      drawIsland(landG, isl.pts, 0, 0);
    }
    for (const th of st.thorns ?? []) {
      landG.poly(th.pts.map((p) => [px(p.x), py(p.y)]).flat()).fill({ color: 0x2a0f2a, alpha: 0.95 }).stroke({ width: 2, color: 0xff7aa8, alpha: 0.9 });
      // 棘の先の光
      const top = th.pts.reduce((a, b) => (b.y < a.y ? b : a));
      landG.circle(px(top.x), py(top.y), 4).fill({ color: 0xff9ac0 });
    }
  };
  const drawIsland = (g: Graphics, pts: { x: number; y: number }[], ox: number, oy: number) => {
    const flat = pts.map((p) => [px(p.x + ox), py(p.y + oy)]).flat();
    g.poly(flat).fill({ color: 0x161b46, alpha: 0.97 });
    g.poly(flat).stroke({ width: 1.5, color: 0x5a64b8, alpha: 0.6 });
    // 上の面（一番上の2点を結ぶ辺）を明るく：草のような光の縁
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const ys = sorted[0].y;
    const top = pts.filter((p) => Math.abs(p.y - ys) < 0.05).sort((a, b) => a.x - b.x);
    if (top.length >= 2) {
      const a = top[0], b = top[top.length - 1];
      g.moveTo(px(a.x + ox), py(a.y + oy)).lineTo(px(b.x + ox), py(b.y + oy)).stroke({ width: 8, color: 0x9fe0c8, alpha: 0.12 });
      g.moveTo(px(a.x + ox), py(a.y + oy)).lineTo(px(b.x + ox), py(b.y + oy)).stroke({ width: 2.5, color: 0xbff0dc, alpha: 0.9 });
      for (let x = a.x + 0.4; x < b.x - 0.2; x += 0.9) g.circle(px(x + ox), py(a.y + oy) - 3, 1.4).fill({ color: 0xdffff0, alpha: 0.6 });
    }
  };

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play' && mode !== 'result') return;
      if (mode === 'play' && autoplay) {
        const a = bot.act(sim);
        if (a) fire(a);
      }
      sim.step();
      handleEvents();
      if (sim.phase !== 'play' && resultTimer < 0) resultTimer = sim.tick + Math.round(HZ * 1.8);
      if (resultTimer >= 0 && sim.tick >= resultTimer && mode === 'play') { resultTimer = -1; showResult(); }
    },
    render: (_a, dt) => {
      t += dt;
      field.update(t);
      particles.update(dt);
      // 空中で構えている間はゆっくり（上昇気流のてっぺんで狙える）
      const ev = sim.egg.getLinearVelocity();
      const slowTarget = charge && mode === 'play' && Math.hypot(ev.x, ev.y) > 1.2 ? cfg.airSlow : 1;
      slowK += (slowTarget - slowK) * Math.min(1, dt * 10);
      juice.update(dt, cfg.gameSpeed * slowK);
      juice.shakeScale = cfg.shake;
      particles.multiplier = cfg.particles;
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      draw(dt);
      if (mode === 'menu') tl.innerHTML = '';
      else {
        const st = courierStages[stageIndex];
        const eggs = Array.from({ length: sim.cfg.cracksMax }, (_, i) => (i < sim.cfg.cracksMax - sim.cracks ? '◆' : '◇')).join('');
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">爆風 ${sim.blasts}<span style="font-size:14px;color:var(--dim)">（目安 ${st.par}）</span></div>
          <div style="font-size:14px;color:${sim.cracks ? '#ff9f9f' : 'var(--dim)'}">卵 ${eggs}</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const handleEvents = () => {
    for (const e of sim.events) {
      if (e.t === 'blast') {
        const col = KIND_COLOR[e.kind];
        if (e.kind === 'push') {
          // 卵のすぐ後ろで弾ける：衝撃の輪、後ろへ飛ぶ火花、強さに応じたヒットストップと揺れ、卵が伸びる
          const bx = e.x - e.ax * 0.55, by = e.y - e.ay * 0.55;
          const k = Math.min(1, e.dv / sim.cfg.blastForce);
          rings.push({ x: bx, y: by, r: 0.9 + 1.6 * k, age: 0, life: 0.4, color: col });
          rings.push({ x: bx, y: by, r: 0.5 + 0.8 * k, age: 0, life: 0.25, color: 0xffffff });
          const back = Math.atan2(-e.ay, -e.ax);
          particles.emit(px(bx), py(by), { count: Math.round(20 + 40 * k), speed: [80, 300 + 300 * k], angle: back, spread: 1.8, life: [0.2, 0.6], size: [0.05, 0.16], color: [col, 0xffffff, 0xff9f6a] });
          synth.boom(0.3 + 0.6 * k, 2);
          synth.tone(220 + 440 * k, 0.12, { type: 'triangle', vol: 0.05, slideTo: 110 });
          juice.shake(0.1 + 0.35 * k);
          juice.hitstop(0.02 + 0.06 * k);
          stretch = 1; stretchAng = Math.atan2(e.ay, e.ax);
        } else if (e.kind === 'pull') {
          rings.push({ x: e.x, y: e.y, r: sim.cfg.blastR * 1.4, age: 0, life: 0.5, color: col, inward: true });
          synth.tone(880, 0.35, { type: 'sine', vol: 0.07, slideTo: 330 });
        } else if (e.kind === 'lift') {
          synth.whoosh(0.9);
          synth.tone(330, 0.6, { type: 'triangle', vol: 0.05, slideTo: 990 });
        } else {
          synth.tone(520, 0.12, { type: 'square', vol: 0.03 });
        }
      } else if (e.t === 'boom') {
        if (e.dv > 0) { stretch = 1; stretchAng = Math.atan2(e.ay, e.ax); }
        rings.push({ x: e.x, y: e.y, r: sim.cfg.blastR * 1.1, age: 0, life: 0.5, color: KIND_COLOR.delay });
        particles.emit(px(e.x), py(e.y), { count: 60, speed: [100, 460], life: [0.3, 0.8], size: [0.05, 0.18], color: [0xd9b3ff, 0xffffff, 0xff9fe0] });
        synth.boom(0.8, 4);
        juice.shake(0.35);
        juice.hitstop(0.05);
        juice.doFlash(0.18, 0xe6ccff);
      } else if (e.t === 'crack') {
        juice.doFlash(0.3, 0xff8f8f);
        juice.shake(0.4);
        juice.hitstop(0.08);
        synth.noise(0.18, { vol: 0.12, from: 4000, to: 900 });
        particles.emit(px(e.x), py(e.y), { count: 18, speed: [40, 160], life: [0.2, 0.5], size: [0.03, 0.08], color: [0xfff1c8, 0xff8f8f] });
      } else if (e.t === 'bounce') {
        synth.tone(160 + e.speed * 12, 0.1, { type: 'sine', vol: Math.min(0.08, e.speed * 0.008) });
      } else if (e.t === 'cloud') {
        particles.emit(px(e.x), py(e.y), { count: 20, speed: [20, 90], life: [0.5, 1.1], size: [0.08, 0.2], color: [0xe6ecff, 0xbfd0ff] });
        synth.noise(0.4, { vol: 0.04, from: 800, to: 300 });
      } else if (e.t === 'ob') {
        // 雲海へ落ちた：しぶき、最後に止まった所へ戻る
        particles.emit(px(e.x), py(WORLD_H - 0.5), { count: 40, speed: [40, 200], life: [0.5, 1.2], size: [0.08, 0.22], color: [0xe6ecff, 0xa9b8ff] });
        synth.tone(300, 0.6, { type: 'sine', vol: 0.08, slideTo: 120 });
        respawnFade = 1;
      } else if (e.t === 'nest') {
        synth.hbell(6, 0.08, 1.0);
      } else if (e.t === 'clear') {
        // 届いた：スロー、金の光、巣から星が噴き上がる
        juice.slowmo(0.35, 1.0);
        juice.doFlash(0.5, 0xffe7a8);
        synth.arp([0, 2, 4, 7, 9, 11, 14], 0.07, 0.1);
        const n = sim.stage.nest;
        for (let k = 0; k < 3; k++) particles.emit(px(n.x), py(n.y - 0.6), { count: 70, speed: [100, 520], life: [0.6, 1.6], size: [0.05, 0.2], color: [0xffd98a, 0xfff1c8, 0xbfe3ff] });
        rings.push({ x: n.x, y: n.y - 0.6, r: 5, age: 0, life: 0.9, color: 0xffe7a8 });
      } else if (e.t === 'fail') {
        if (e.why === 'broken') {
          shattered = true;
          const p = sim.eggPos;
          particles.emit(px(p.x), py(p.y), { count: 90, speed: [60, 340], life: [0.5, 1.4], size: [0.04, 0.16], color: [0xffe7b0, 0xfff6dc, 0xff9f6a] });
          juice.slowmo(0.3, 0.8);
          juice.shake(0.7);
          synth.noise(0.5, { vol: 0.16, from: 5000, to: 400 });
        }
        synth.tone(196, 1.0, { type: 'sine', vol: 0.12, slideTo: 80 });
      }
    }
  };

  const draw = (dt: number) => {
    const st = courierStages[stageIndex];
    // 雲海（下）：ゆっくり流れる雲の層。奥と手前で速さを変える
    seaBack.clear();
    seaFront.clear();
    for (let layer = 0; layer < 2; layer++) {
      const g = layer === 0 ? seaBack : seaFront;
      const y0 = VIEW_H - (layer === 0 ? 46 : 22);
      for (let k = 0; k < 14; k++) {
        const x = ((k * 97 + t * (layer === 0 ? 8 : 18)) % (VIEW_W + 160)) - 80;
        g.ellipse(x, y0 + Math.sin(k * 1.7 + t * 0.5) * 5, 70 + (k % 3) * 20, 22 + (k % 2) * 8).fill({ color: layer === 0 ? 0x8a90d8 : 0xc8ccf6, alpha: layer === 0 ? 0.12 : 0.14 });
      }
    }
    // 受け止める雲
    fxBack.clear();
    for (const c of st.clouds ?? []) {
      for (let k = 0; k < 6; k++) {
        const ox = Math.cos(k * 1.1 + t * 0.4) * c.rx * 0.35, oy = Math.sin(k * 1.7 + t * 0.3) * c.ry * 0.2;
        fxBack.ellipse(px(c.x + ox), py(c.y + oy), px(c.rx * (0.5 + 0.12 * (k % 3))), py(c.ry * 0.8)).fill({ color: 0xe6ecff, alpha: 0.045 });
      }
      fxBack.ellipse(px(c.x), py(c.y), px(c.rx), py(c.ry)).stroke({ width: 1, color: 0xe6ecff, alpha: 0.3 });
    }
    // 動く島
    for (const isl of st.islands) if (isl.move) { const o = sim.moverOffset(isl); drawIsland(fxBack, isl.pts, o.x, o.y); }
    // 上昇気流の柱：上へ流れる光の筋
    for (const z of sim.lifts) {
      const a = Math.min(1, (sim.cfg.liftTime - z.age) / 0.4);
      const w = sim.cfg.liftW;
      fxBack.rect(px(z.x - w / 2), 0, px(w), py(z.y + 0.6)).fill({ color: 0x9fc0ff, alpha: 0.07 * a });
      for (let k = 0; k < 7; k++) {
        const yy = py(z.y) - ((t * 260 + k * 53) % py(z.y + 0.6));
        const xx = px(z.x - w / 2 + (k + 0.5) * (w / 7));
        fxBack.moveTo(xx, yy).lineTo(xx, yy - 18).stroke({ width: 2, color: 0xcfe0ff, alpha: 0.6 * a });
      }
    }
    // 遅れ爆風：導火線の輪（残り時間で欠けていく）
    for (const q of sim.pending) {
      const left = (q.at - sim.tick) / HZ / sim.cfg.delayTime;
      const r = 12 + 3 * Math.sin(t * 20);
      fxBack.circle(px(q.x), py(q.y), 6).fill({ color: 0xd9b3ff, alpha: 0.9 });
      fxBack.moveTo(px(q.x), py(q.y) - r).arc(px(q.x), py(q.y), r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).stroke({ width: 3, color: 0xd9b3ff, alpha: 0.9 });
      fxBack.circle(px(q.x), py(q.y), px(sim.cfg.blastR)).stroke({ width: 1, color: 0xd9b3ff, alpha: 0.25 });
    }
    // 衝撃の輪
    for (let i = rings.length - 1; i >= 0; i--) {
      const k = rings[i];
      k.age += dt;
      const f = k.age / k.life;
      if (f >= 1) { rings.splice(i, 1); continue; }
      const r = k.inward ? k.r * (1 - f) : k.r * (0.2 + 0.8 * Math.sqrt(f));
      fxBack.circle(px(k.x), py(k.y), px(r)).stroke({ width: 4 * (1 - f) + 1, color: k.color, alpha: 0.85 * (1 - f) });
    }
    // 巣：金の枝で編んだ弧と、瞬く星
    const n = st.nest;
    nestG.clear();
    const nx = px(n.x), ny = py(n.y), nw = px(n.w / 2 + 0.3);
    nestG.ellipse(nx, ny - 14, nw + 16, 26).fill({ color: 0xffd98a, alpha: 0.06 + 0.03 * Math.sin(t * 2) });
    for (let k = 0; k < 4; k++) {
      nestG.moveTo(nx - nw, ny - 33 + k * 3).quadraticCurveTo(nx, ny + 8 - k * 2, nx + nw, ny - 33 + k * 3).stroke({ width: 2, color: 0xffd98a, alpha: 0.5 + k * 0.1 });
    }
    for (let k = 0; k < 5; k++) {
      const a = t * 0.8 + k * 1.26;
      nestG.circle(nx + Math.cos(a) * (nw + 6), ny - 22 + Math.sin(a) * 10, 1.8).fill({ color: 0xfff1c8, alpha: 0.5 + 0.5 * Math.sin(t * 3 + k) });
    }
    // 卵：脈打つ光。ひびの数だけ赤い割れ目。撃った瞬間は飛ぶ向きへ伸び、構えている間は強さに応じて縮む
    eggG.clear();
    const e = sim.eggPos;
    const ex = px(e.x), ey = py(e.y);
    if (respawnFade > 0) respawnFade = Math.max(0, respawnFade - dt * 1.5);
    const alpha = shattered ? 0 : 1 - respawnFade * 0.8;
    const beat = 0.5 + 0.5 * Math.sin(t * (sim.cracks ? 9 : 4));
    eggGlow.position.set(ex, ey);
    eggGlow.scale.set(0.3 + beat * 0.08);
    eggGlow.tint = sim.cracks >= sim.cfg.cracksMax - 1 && sim.cracks > 0 ? 0xffa08a : 0xffe7b0;
    eggGlow.alpha = alpha * 0.55;
    const act = mode === 'play' && !autoplay ? chargeAction() : null;
    stretch = Math.max(0, stretch - dt * 4);
    let sAng = stretchAng, sx = 1, sy = 1;
    if (stretch > 0) {
      // 伸びて、少し縮み返す（減衰する振動）
      const w = Math.sin((1 - stretch) * Math.PI * 2.2) * stretch;
      sx = 1 + 0.38 * w; sy = 1 - 0.26 * w;
    } else if (act && act.k === 'push') {
      const k = act.p ?? 0;
      sAng = Math.atan2(act.ay ?? 0, act.ax ?? 0);
      sx = 1 - 0.18 * k; sy = 1 + 0.1 * k;
    }
    eggWrap.position.set(ex, ey);
    eggWrap.rotation = sAng;
    eggWrap.scale.set(sx, sy);
    eggG.rotation = -sAng;
    if (!shattered) {
      const rx = sim.cfg.eggR * S, ry = sim.cfg.eggR * S * 1.25;
      eggG.ellipse(0, -2, rx, ry).fill({ color: 0xffdf9a, alpha: 0.75 * alpha }).stroke({ width: 1.5, color: 0xfff6dc, alpha });
      eggG.ellipse(-rx * 0.3, -ry * 0.45, rx * 0.25, ry * 0.18).fill({ color: 0xffffff, alpha: 0.8 * alpha });
      for (let i = 0; i < sim.cracks; i++) {
        const cx = -rx * 0.5 + i * rx * 0.5, cy = -ry * 0.6 + (i % 2) * ry * 0.3;
        eggG.moveTo(cx, cy).lineTo(cx + 4, cy + 5).lineTo(cx - 1, cy + 9).lineTo(cx + 3, cy + 14).stroke({ width: 1.6, color: 0xd0405a, alpha });
      }
    }
    // 狙い：カーソルの印。構えている間は、強さのゲージ（卵の周りの輪。赤い所はひびが入る強さ）・向きの矢印・飛ぶ先の予測線
    aimG.clear();
    if (mode === 'play' && !autoplay && mouse.in) {
      const col = KIND_COLOR[kind];
      const ready = sim.cooldownLeft <= 0;
      const mx = px(mouse.x), my = py(mouse.y);
      if (kind === 'pull') aimG.circle(mx, my, px(sim.cfg.blastR * 1.4)).stroke({ width: 1.5, color: col, alpha: ready ? 0.3 : 0.12 });
      if (kind === 'lift') aimG.rect(mx - px(sim.cfg.liftW / 2), 0, px(sim.cfg.liftW), my).fill({ color: col, alpha: 0.06 });
      if (kind === 'delay' && !charge) aimG.circle(mx, my, px(sim.cfg.blastR)).stroke({ width: 1.5, color: col, alpha: ready ? 0.3 : 0.12 });
      if (!charge) aimG.circle(mx, my, 4).fill({ color: col, alpha: ready ? 0.9 : 0.35 });
      if (!ready) aimG.moveTo(mx, my - 10).arc(mx, my, 10, -Math.PI / 2, -Math.PI / 2 + (1 - sim.cooldownLeft / Math.max(0.01, sim.cfg.cooldown)) * Math.PI * 2).stroke({ width: 2, color: col, alpha: 0.7 });
    }
    if (act && charge) {
      const col = KIND_COLOR[act.k];
      const pw = act.p ?? 0;
      const pCrack = sim.cfg.blastCrack / (sim.cfg.blastForce * (act.k === 'delay' ? sim.cfg.delayMul : 1));
      const crack = pw > pCrack;
      // ドラッグの線（押した所から今のカーソルへ）
      const sx0 = px(charge.sx), sy0 = py(charge.sy);
      aimG.circle(sx0, sy0, 5).stroke({ width: 1.5, color: col, alpha: 0.8 });
      aimG.moveTo(sx0, sy0).lineTo(px(mouse.x), py(mouse.y)).stroke({ width: 1, color: col, alpha: 0.35 });
      // 強さのゲージ：卵（遅れは置いた所）の周りの輪
      const gx = act.k === 'delay' ? sx0 : ex, gy = act.k === 'delay' ? sy0 : ey;
      const gr = sim.cfg.eggR * S + 16;
      const a0 = -Math.PI / 2;
      aimG.circle(gx, gy, gr).stroke({ width: 5, color: 0x0c1238, alpha: 0.55 });
      if (pCrack < 1) aimG.moveTo(gx + Math.cos(a0 + pCrack * Math.PI * 2) * gr, gy + Math.sin(a0 + pCrack * Math.PI * 2) * gr).arc(gx, gy, gr, a0 + pCrack * Math.PI * 2, a0 + Math.PI * 2).stroke({ width: 5, color: 0xff6a6a, alpha: 0.28 });
      aimG.moveTo(gx, gy - gr).arc(gx, gy, gr, a0, a0 + Math.max(0.02, pw) * Math.PI * 2).stroke({ width: 5, color: crack ? 0xff6a6a : col, alpha: 0.95 });
      if (pw >= 1) aimG.circle(gx, gy, gr + 4 + 2 * Math.sin(t * 20)).stroke({ width: 1.5, color: crack ? 0xff6a6a : 0xffffff, alpha: 0.6 });
      // 向きの矢印
      const al = Math.hypot(act.ax ?? 0, act.ay ?? 0) || 1;
      const ux = (act.ax ?? 0) / al, uy = (act.ay ?? 0) / al;
      const len = gr + 10 + sim.shotDv(act.k, pw) * 4;
      const tx = gx + ux * len, ty = gy + uy * len;
      const c2 = crack ? 0xff6a6a : col;
      aimG.moveTo(gx + ux * (gr + 6), gy + uy * (gr + 6)).lineTo(tx, ty).stroke({ width: 3, color: c2, alpha: 0.9 });
      aimG.moveTo(tx, ty).lineTo(tx - (ux * 10 - uy * 7), ty - (uy * 10 + ux * 7)).stroke({ width: 3, color: c2, alpha: 0.9 });
      aimG.moveTo(tx, ty).lineTo(tx - (ux * 10 + uy * 7), ty - (uy * 10 - ux * 7)).stroke({ width: 3, color: c2, alpha: 0.9 });
      if (crack) aimG.circle(ex, ey, sim.cfg.eggR * S + 7).stroke({ width: 2, color: 0xff6a6a, alpha: 0.5 + 0.4 * Math.sin(t * 16) });
      // 予測線：今撃ったら卵がどう飛ぶか（cfg.aim 秒ぶん。間引いて計算）
      if (cfg.aim > 0 && (predFrame++ % 2 === 0 || predPts.length === 0)) {
        const c = sim.clone();
        c.lastBlastTick = -1e9;
        predPts = [];
        if (c.act(act)) {
          const n = Math.round((cfg.aim + (act.k === 'delay' ? sim.cfg.delayTime : 0)) * HZ);
          for (let i = 0; i < n && c.phase === 'play'; i++) {
            c.step();
            if (c.events.some((q) => q.t === 'ob')) break;
            if (i % 5 === 0) predPts.push(c.eggPos);
          }
        }
      }
      predPts.forEach((q, i) => {
        const f = 1 - i / Math.max(1, predPts.length);
        aimG.circle(px(q.x), py(q.y), 1.5 + 1.8 * f).fill({ color: c2, alpha: 0.25 + 0.6 * f });
      });
    }
    // 卵の小さな光の尾（飛んでいる時）
    const v = sim.egg.getLinearVelocity();
    if (!shattered && Math.hypot(v.x, v.y) > 4 && fxRandom() < 0.5) particles.emit(ex, ey, { count: 1, speed: [0, 20], life: [0.3, 0.6], size: [0.04, 0.09], color: 0xffe7b0 });
  };

  const hook = installDebugHook('blast-courier', () => ({ mode, stage: stageIndex, phase: sim.phase, blasts: sim.blasts, cracks: sim.cracks, egg: sim.eggPos, time: +sim.time.toFixed(1), power: charge ? +chargePower().toFixed(2) : null, chargeTime: cfg.chargeTime }));
  hook.start = (i: number) => start(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  if (params.has('stage') || autoplay) start(stageIndex);
  else showTitle();
  loop.start();
  hook.ready = true;
}

void main();
