/**
 * Moon Claw（月の爪クレーン）。MC-10 で作り直した：ピンボールの段をやめ、物理の爪で宝石を運んで宝石箱に納める。
 * 爪の頭は ←→↑↓ かマウスのドラッグで動かし、指は Z（開く）／X（閉じる）を押している間だけ動く（放すとそこで止まる）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite, Container, Text } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { fxRandom } from '@engine/rng';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, goTo, resetButton, touchButtons } from '@engine/hud';
import { Input } from '@engine/input';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { Save, clearStored } from '@engine/storage';
import { createTuning } from '@engine/tuning';
import { ruleCards, introCard } from '@engine/rules';
import { moonRules, moonIntros } from './rules';
import { schema, presets, DEFAULT_PRESET, toClaw, type MoonConfig } from './config';
import { ClawSim, HZ, WORLD_W, WORLD_H, FLOOR_Y, RAIL_Y, FINGER_L, GEMS, IN_OPEN, IN_CLOSE } from './sim';
import { clawStages } from './stages';
import { ClawBot } from './bot';

const params = new URLSearchParams(location.search);
/** 1 m を何ピクセルで描くか。部屋（22×14 m）を下寄りに置き、上の余白に HUD */
const S = 33;
const VIEW_W = 760;
const VIEW_H = 640;
const OX = (VIEW_W - WORLD_W * S) / 2;
const OY = VIEW_H - WORLD_H * S - 8;
const px = (x: number) => OX + x * S;
const py = (y: number) => OY + y * S;

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0a1030', '#03030c', ['#2a3a8a', '#1b4b8f', '#5a2a7e']));
  const field = makeStarfield(VIEW_W, VIEW_H, 170, 77);
  const boardG = new Graphics();
  const goalG = new Graphics();
  const goalText = new Container();
  const clawG = new Graphics();
  const gemG = new Graphics();
  const spiritLayer = new Container();
  const particles = new Particles(1800);
  const fxG = new Graphics();
  ga.world.addChild(sky, field.container, boardG, goalG, goalText, spiritLayer, gemG, clawG, particles.container, fxG);

  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const center = el('div', { class: 'center' });
  hud.append(tl, center);
  document.body.appendChild(hud);

  const tuning = createTuning<MoonConfig>('moon-claw', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<{ cleared: Record<string, number> }>('moon-claw', { cleared: {} });
  // 登録順がビットになる：left=1, right=2, up=4, down=8, open=16, close=32
  const input = new Input({
    left: { keys: ['ArrowLeft', 'KeyA'] },
    right: { keys: ['ArrowRight', 'KeyD'] },
    up: { keys: ['ArrowUp', 'KeyW'] },
    down: { keys: ['ArrowDown', 'KeyS'] },
    open: { keys: ['KeyZ', 'Space'] },
    close: { keys: ['KeyX', 'ShiftLeft', 'ShiftRight'] },
  });

  let stageIndex = Math.min(clawStages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = new ClawSim(clawStages[stageIndex], toClaw(cfg));
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  let autoplay = params.has('autoplay');
  let bot = new ClawBot(0.85, 1);
  let t = 0;
  /** マウス・タッチで引いている時の、爪の頭の目標（引いていない時は null＝キー） */
  let target: { x: number; y: number } | null = null;
  /** マウスのボタンで押している開閉（左＝閉じる、右＝開く）。タッチのボタンは押してから少しの間 */
  let mouseBits = 0;
  let touchBits = 0;
  let touchUntil = 0;
  let resultTimer = -1;
  const sprites = new Map<number, Sprite>();
  const popups: { x: number; y: number; text: string; age: number; color: number }[] = [];

  const start = (i: number) => {
    closeMenu();
    mode = 'play';
    stageIndex = i;
    sim = new ClawSim(clawStages[i], toClaw(cfg));
    bot = new ClawBot(0.85, 1 + i);
    target = null;
    resultTimer = -1;
    for (const sp of sprites.values()) sp.destroy();
    sprites.clear();
    popups.length = 0;
    buildBoard();
    const it = moonIntros[clawStages[i].id];
    introCard(it?.frame ?? null, it?.title);
    // ヒントは盤の上ではなく左の余白に（巣穴や柱に重ならないように）。最初の 8 秒だけ
    center.innerHTML = '';
  };
  const restart = () => start(stageIndex);

  /** ★：クリアで★1、残り時間 45% 以上で★2、65% 以上で★3 */
  const starsOf = () => {
    if (sim.phase !== 'clear') return 0;
    const left = sim.timeLeft / sim.cfg.timeLimit;
    return left >= 0.65 ? 3 : left >= 0.45 ? 2 : 1;
  };

  const showResult = () => {
    mode = 'result';
    const st = clawStages[stageIndex];
    const stars = starsOf();
    if (stars > 0) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.write();
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `<h1>${stars ? 'CLEAR' : 'FAILED'}</h1><h2>${st.name}</h2>
      ${stars ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>宝石の点 ${sim.score} / ${st.need}　残り時間 ${sim.timeLeft.toFixed(1)} 秒</p>
      <p style="font-size:13px">★：クリアで★1、残り時間が 45% 以上で★2、65% 以上で★3</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (stars && stageIndex < clawStages.length - 1) {
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
    center.innerHTML = '';
    menu = el('div', { class: 'menu' });
    const unlocked = (i: number) => i === 0 || params.has('all') || save.data.cleared[clawStages[i - 1].id] !== undefined;
    menu.innerHTML = `
      <h1>MOON CLAW</h1>
      <h2>月 の 爪 ク レ ー ン</h2>
      <div class="rulebox"></div>
      <p style="max-width:620px;line-height:1.8;font-size:13px">月の爪で<b style="color:var(--gold)">宝石</b>をつかみ、<b>宝石箱</b>へ運んで納める。爪は本物の物理 — 指で挟み、指先の鉤に乗せて持ち上げる。<br>
      重い宝石・丸い宝石・細長い宝石は、挟み方が悪いと落ちる。時間内に必要な点を集めよう（数字は宝石箱の倍率）。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys">キー：<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd>（<kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><kbd>S</kbd>）爪を動かす　<kbd>Z</kbd> 開く　<kbd>X</kbd> 閉じる（押している間だけ）<br>
      マウス：<b>ドラッグ</b>で爪を動かす（指の位置へ向かう）　<b>ホイール</b>（上へ＝開く・下へ＝閉じる）、<b>右ボタン</b>（押している間）＝開く<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：画面をなぞって爪、上のボタンで開く・閉じる</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(moonRules));
    const diff = menu.querySelector('.diff')!;
    for (const name of Object.keys(presets)) {
      const b = el('button', { class: 'btn small' + (tuning.preset === name ? ' sel' : '') }, name);
      b.onclick = () => { tuning.applyPreset(name); showTitle(); };
      diff.appendChild(b);
    }
    const grid = menu.querySelector('.grid')!;
    clawStages.forEach((st, i) => {
      const r = save.data.cleared[st.id];
      const ok = unlocked(i);
      const d = el('div', { class: 'stage' + (r ? ' cleared' : '') + (ok ? '' : ' locked') }, `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); start(i); };
      grid.appendChild(d);
    });
    menu.appendChild(resetButton('moon-claw', '月の爪クレーン', clearStored));
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
      r.onclick = () => start(stageIndex);
      const m = el('button', { class: 'btn' }, 'ステージ選択');
      m.onclick = showTitle;
      row.append(c, r, m, launcherButton());
      menu.appendChild(settingsRow(tuning.gui, () => tuning.toggle()));
      menu.appendChild(ruleCards(moonRules));
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

  // ---- マウス・タッチ ----
  const toWorld = (cx: number, cy: number) => { const l = ga.toLogical(cx, cy); return { x: (l.x - OX) / S, y: (l.y - OY) / S }; };
  let dragging = false;
  ga.app.canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'play' || !dragging) return;
    target = toWorld(e.clientX, e.clientY);
  });
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play') return;
    dragging = true;
    target = toWorld(e.clientX, e.clientY);
    if (e.pointerType !== 'touch') mouseBits = e.button === 2 ? IN_OPEN : 0;
  });
  window.addEventListener('pointerup', () => { dragging = false; mouseBits = 0; });
  // ホイール：上へ回すと開く、下へ回すと閉じる（回した分だけ）
  let wheelBits = 0, wheelUntil = 0;
  ga.app.canvas.addEventListener('wheel', (e) => {
    if (mode !== 'play') return;
    e.preventDefault();
    wheelBits = e.deltaY < 0 ? IN_OPEN : IN_CLOSE;
    wheelUntil = sim.tick + Math.min(40, Math.round(Math.abs(e.deltaY) / 5) + 6);
  }, { passive: false });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'result')) restart();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyT') tuning.toggle();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  // キーで爪を動かしたら、マウスの目標はやめる
  window.addEventListener('keydown', (e) => { if (e.code.startsWith('Arrow') || ['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) target = null; });
  const tbar = touchButtons([
    { label: '‖', onPress: () => togglePause() },
    { label: '◇ 開く', onPress: () => { touchBits = IN_OPEN; touchUntil = sim.tick + 30; } },
    { label: '◆ 閉じる', onPress: () => { touchBits = IN_CLOSE; touchUntil = sim.tick + 30; } },
  ], 'top');

  tuning.onChange((key) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    // ルールの値は今のプレイにもすぐ反映（↻ の項目はやり直しで）
    Object.assign(sim.cfg, { clawSpeed: cfg.clawSpeed, clawAccel: cfg.clawAccel, fingerSpeed: cfg.fingerSpeed, fingerTorque: cfg.fingerTorque, settle: cfg.settle });
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('moon');
  ga.setBloom(cfg.bloom);

  // ---- 部屋（動かない物）を描く ----
  const buildBoard = () => {
    const st = clawStages[stageIndex];
    boardG.clear();
    boardG.rect(px(0), py(-0.2), WORLD_W * S, (WORLD_H + 0.2) * S).fill({ color: 0x0c1238, alpha: 0.35 });
    const glowLine = (x0: number, y0: number, x1: number, y1: number, col = 0x8fa6ff, w = 3) => {
      boardG.moveTo(px(x0), py(y0)).lineTo(px(x1), py(y1)).stroke({ width: w + 6, color: col, alpha: 0.12 });
      boardG.moveTo(px(x0), py(y0)).lineTo(px(x1), py(y1)).stroke({ width: w, color: col, alpha: 0.85 });
    };
    glowLine(0, -0.2, 0, FLOOR_Y);
    glowLine(WORLD_W, -0.2, WORLD_W, FLOOR_Y);
    glowLine(0, FLOOR_Y, WORLD_W, FLOOR_Y, 0xb9c6ff);
    // 爪のレール（天井）
    glowLine(0.3, RAIL_Y, WORLD_W - 0.3, RAIL_Y, 0xffd98a, 2);
    // 台
    for (const b of st.blocks ?? []) {
      boardG.rect(px(b.x), py(b.y), b.w * S, b.h * S).fill({ color: 0x1a2260, alpha: 0.85 }).stroke({ width: 2, color: 0xb9c6ff, alpha: 0.8 });
    }
    // 宝石箱：金の縁（底と左右）と、倍率の文字
    goalText.removeChildren().forEach((c) => c.destroy());
    for (const bx of st.boxes) {
      const col = bx.mult > 1 ? 0xffd98a : 0xdfe6ff;
      boardG.rect(px(bx.x), py(bx.y), bx.w * S, bx.h * S).fill({ color: col, alpha: 0.06 });
      boardG.moveTo(px(bx.x - 0.1), py(bx.y)).lineTo(px(bx.x - 0.1), py(bx.y + bx.h + 0.1)).lineTo(px(bx.x + bx.w + 0.1), py(bx.y + bx.h + 0.1)).lineTo(px(bx.x + bx.w + 0.1), py(bx.y))
        .stroke({ width: 10, color: col, alpha: 0.12, join: 'round' });
      boardG.moveTo(px(bx.x - 0.1), py(bx.y)).lineTo(px(bx.x - 0.1), py(bx.y + bx.h + 0.1)).lineTo(px(bx.x + bx.w + 0.1), py(bx.y + bx.h + 0.1)).lineTo(px(bx.x + bx.w + 0.1), py(bx.y))
        .stroke({ width: 4, color: col, alpha: 0.95, join: 'round' });
      const tx = new Text({ text: `×${bx.mult}`, style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: bx.mult > 1 ? 0xffe7a8 : 0xdfe6ff } });
      tx.anchor.set(0.5);
      tx.position.set(px(bx.x + bx.w / 2), py(bx.y) - 14);
      goalText.addChild(tx);
    }
  };
  buildBoard();

  const loop = new FixedLoop({
    update: () => {
      const mask = input.sample();
      if (mode !== 'play' && mode !== 'result') return;
      let bits = mask | mouseBits;
      if (sim.tick < touchUntil) bits |= touchBits;
      if (sim.tick < wheelUntil) bits |= wheelBits;
      let tg = target ?? undefined;
      if (mode === 'play' && autoplay) {
        const a = bot.act(sim);
        bits = a.bits;
        tg = a.target;
      }
      if (mode !== 'play') bits = 0;
      sim.step(bits, tg);
      handleEvents();
      if (sim.phase !== 'play' && resultTimer < 0) resultTimer = sim.tick + Math.round(HZ * 1.6);
      if (resultTimer >= 0 && sim.tick >= resultTimer && mode === 'play') { resultTimer = -1; showResult(); }
    },
    render: (_a, dt) => {
      t += dt;
      field.update(t);
      particles.update(dt);
      juice.update(dt, cfg.gameSpeed);
      juice.shakeScale = cfg.shake;
      particles.multiplier = cfg.particles;
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      draw(dt);
      if (mode === 'menu') tl.innerHTML = '';
      else {
        const st = clawStages[stageIndex];
        const left = sim.gems.filter((g) => g.state === 'free').length;
        const tl0 = sim.timeLeft;
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">${sim.score} / ${st.need}</div>
          <div style="font-size:14px;color:${tl0 < 15 ? '#ff9f9f' : 'var(--dim)'}">残り ${tl0.toFixed(0)} 秒　宝石 ${left}</div>
          ${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}${sim.time < 9 ? `<div style="font-size:13px;color:var(--gold);max-width:420px;margin-top:8px;line-height:1.6;opacity:${Math.min(1, (9 - sim.time) / 1.5).toFixed(2)}">${st.hint}</div>` : ''}`;
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const handleEvents = () => {
    for (const e of sim.events) {
      if (e.t === 'grip') {
        particles.emit(px(e.x), py(e.y), { count: 12, speed: [20, 90], life: [0.2, 0.5], size: [0.04, 0.1], color: [0xffd98a, 0xbfe3ff] });
        synth.tone(660, 0.12, { type: 'triangle', vol: 0.07, slideTo: 990 });
      } else if (e.t === 'drop') {
        synth.tone(420, 0.22, { type: 'sine', vol: 0.05, slideTo: 240 });
      } else if (e.t === 'clack') {
        synth.tone(fxRandom(900, 1300), 0.06, { type: 'triangle', vol: Math.min(0.08, 0.01 * e.speed) });
        if (e.speed > 6) juice.shake(0.08);
      } else if (e.t === 'home') {
        // 解放：宝石が箱の中で落ち着いた瞬間。光の柱・高い和音・点数の飛び出し。コンボで強く
        const big = e.value * e.mult;
        juice.hitstop(0.04 + 0.01 * big);
        juice.shake(0.12 + 0.05 * big);
        if (big >= 4) { juice.slowmo(0.5, 0.35); juice.doFlash(0.2, 0xffe7a8); }
        synth.arp([0, 4, 7, 11].map((n) => n + e.total % 12), 0.05, 0.09);
        particles.emit(px(e.x), py(e.y), { count: 30 + 14 * big, speed: [60, 300], life: [0.4, 1.1], size: [0.05, 0.18], color: [GEMS[sim.gems[e.id].kind].color, 0xfff1c8, 0xffffff] });
        shock.push({ x: px(e.x), y: py(e.y), r: 30 + 8 * big, age: 0 });
        beams.push({ x: px(e.x), age: 0, color: GEMS[sim.gems[e.id].kind].color });
        popups.push({ x: px(e.x), y: py(e.y) - 24, text: e.mult > 1 ? `+${e.value}×${e.mult}` : `+${e.value}`, age: 0, color: 0xffe7a8 });
      } else if (e.t === 'clear') {
        juice.doFlash(0.55, 0xffe7a8);
        juice.slowmo(0.4, 0.9);
        synth.arp([0, 2, 4, 7, 9, 11], 0.07, 0.1);
      } else if (e.t === 'fail') {
        synth.tone(196, 1.0, { type: 'sine', vol: 0.12, slideTo: 80 });
      }
    }
  };

  const shock: { x: number; y: number; r: number; age: number }[] = [];
  const beams: { x: number; age: number; color: number }[] = [];
  const popTexts: Text[] = [];
  const draw = (dt: number) => {
    // 宝石：形どおりに描く（水晶・星の結晶は四角、真珠・月長石は丸）。光の芯を重ねる
    gemG.clear();
    for (const g of sim.gems) {
      let sp = sprites.get(g.id);
      if (!sp) {
        sp = new Sprite(glowTexture());
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        spiritLayer.addChild(sp);
        sprites.set(g.id, sp);
      }
      sp.visible = g.state === 'free';
      if (g.state !== 'free') continue;
      const d = GEMS[g.kind];
      const p = g.body.getPosition(), a = g.body.getAngle();
      const held = sim.heldGems().includes(g);
      sp.position.set(px(p.x), py(p.y));
      sp.scale.set((Math.max(d.w, d.h) * S * 2.0) / 64 * (0.92 + 0.08 * Math.sin(t * 4 + g.id)));
      sp.tint = d.color;
      sp.alpha = held ? 0.45 : 0.28;
      if (d.shape === 'circle') {
        gemG.circle(px(p.x), py(p.y), d.w * S).fill({ color: d.color, alpha: 0.55 }).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
        gemG.circle(px(p.x) - d.w * S * 0.3, py(p.y) - d.w * S * 0.3, d.w * S * 0.25).fill({ color: 0xffffff, alpha: 0.7 });
      } else {
        const c = Math.cos(a), s2 = Math.sin(a), hw = (d.w / 2) * S, hh = (d.h / 2) * S;
        const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: px(p.x) + x * c - y * s2, y: py(p.y) + x * s2 + y * c }));
        gemG.poly(pts).fill({ color: d.color, alpha: 0.5 }).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
        // 結晶の面（中心から角への線）
        for (const q of pts) gemG.moveTo(px(p.x), py(p.y)).lineTo(q.x, q.y).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      }
    }
    // 月の爪：レールから吊る糸、頭、2本の指（物理の形のまま）
    clawG.clear();
    const hp = sim.head.getPosition();
    clawG.moveTo(px(hp.x), py(RAIL_Y)).lineTo(px(hp.x), py(hp.y)).stroke({ width: 1.5, color: 0xb9c6ff, alpha: 0.7 });
    clawG.circle(px(hp.x), py(RAIL_Y), 4).fill({ color: 0xffd98a });
    clawG.roundRect(px(hp.x - 0.45), py(hp.y - 0.18), 0.9 * S, 0.36 * S, 4).fill({ color: 0xffe7a8, alpha: 0.95 });
    const holding = sim.heldGems().length > 0;
    for (const f of sim.fingers) {
      const s = f.side === 'L' ? 1 : -1;
      const fp = f.body.getPosition(), a = f.body.getAngle();
      const tr = (x: number, y: number) => ({ x: px(fp.x + x * Math.cos(a) - y * Math.sin(a)), y: py(fp.y + x * Math.sin(a) + y * Math.cos(a)) });
      const top = tr(0, 0), bot = tr(0, FINGER_L - 0.05), hook = tr(s * 0.34, FINGER_L - 0.05);
      const col = holding ? 0xfff1c8 : 0xffd98a;
      clawG.moveTo(top.x, top.y).lineTo(bot.x, bot.y).lineTo(hook.x, hook.y).stroke({ width: 10, color: col, alpha: 0.15, cap: 'round', join: 'round' });
      clawG.moveTo(top.x, top.y).lineTo(bot.x, bot.y).lineTo(hook.x, hook.y).stroke({ width: 4.5, color: col, alpha: 0.95, cap: 'round', join: 'round' });
      clawG.circle(top.x, top.y, 3.5).fill({ color: 0xffffff });
    }
    // 爪の真下の目安（点線）：何も持っていない時
    if (!holding && mode === 'play') {
      const tip = sim.tip;
      for (let y = py(tip.y) + 12; y < py(FLOOR_Y) - 4; y += 14) clawG.rect(px(hp.x) - 1, y, 2, 6).fill({ color: 0xffd98a, alpha: 0.2 });
    }
    // マウスの目標
    if (target && mode === 'play' && !autoplay) clawG.circle(px(target.x), py(target.y), 6).stroke({ width: 1.5, color: 0xffd98a, alpha: 0.5 });
    // 衝撃の輪・光の柱・文字
    fxG.clear();
    for (let i = shock.length - 1; i >= 0; i--) {
      const k = shock[i];
      k.age += dt;
      const f = k.age / 0.5;
      if (f >= 1) { shock.splice(i, 1); continue; }
      fxG.circle(k.x, k.y, k.r * (0.3 + f)).stroke({ width: 3 * (1 - f) + 1, color: 0xffe7a8, alpha: 0.8 * (1 - f) });
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.age += dt;
      const f = b.age / 0.8;
      if (f >= 1) { beams.splice(i, 1); continue; }
      const w = 26 * (1 - f) + 4;
      fxG.rect(b.x - w / 2, py(0), w, py(FLOOR_Y) - py(0)).fill({ color: b.color, alpha: 0.22 * (1 - f) });
    }
    while (popTexts.length < popups.length) {
      const tx = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fontWeight: '800', fill: 0xffffff } });
      tx.anchor.set(0.5);
      ga.world.addChild(tx);
      popTexts.push(tx);
    }
    for (let i = popups.length - 1; i >= 0; i--) if ((popups[i].age += dt) > 1.1) popups.splice(i, 1);
    popTexts.forEach((tx, i) => {
      const p = popups[i];
      tx.visible = !!p;
      if (!p) return;
      tx.text = p.text;
      tx.tint = p.color;
      tx.position.set(p.x, p.y - p.age * 30);
      tx.alpha = Math.min(1, (1.1 - p.age) * 2);
    });
  };

  const hook = installDebugHook('moon-claw', () => ({ mode, stage: stageIndex, phase: sim.phase, score: sim.score, need: clawStages[stageIndex].need, time: +sim.time.toFixed(1), held: sim.heldGems().length, gems: sim.gems.filter((g) => g.state === 'free').length, open: +sim.openness.toFixed(2) }));
  hook.start = (i: number) => start(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  // ?stage=N&autoplay=1 ならすぐに始める。それ以外はタイトルから
  if (params.has('stage') || autoplay) start(stageIndex);
  else showTitle();
  loop.start();
  hook.ready = true;
}

void main();
