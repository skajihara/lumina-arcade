/**
 * Moon Claw（月の爪クレーン）。NEW-03：描画・操作・タイトル・ポーズ・リザルト・ボット・仮の3面。
 * 上の段：月の爪（クレーン）で精霊の山から掴み、ゆっくり運んで落とし口で放す。
 * 下の段：落ちた精霊はピンボールの球。フリッパーで打ち上げて、金の巣穴（倍率）へ。
 * 「慎重（クレーン）→ 暴れる（ピンボール）」の緩急。爆弾精霊で山を崩すとマルチボール。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite, Container, Text } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, goTo, resetButton, touchButtons } from '@engine/hud';
import { Input } from '@engine/input';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { Save, clearStored } from '@engine/storage';
import { createTuning } from '@engine/tuning';
import { ruleCards } from '@engine/rules';
import { moonRules } from './rules';
import { schema, presets, DEFAULT_PRESET, toClaw, type MoonConfig } from './config';
import { ClawSim, HZ, WORLD_W, WORLD_H, SHELF_Y, HOLE_X0, HOLE_X1, RAIL_Y, PIVOT_L, PIVOT_R, IN_DROP, IN_OPEN, DT } from './sim';
import { clawStages } from './stages';
import { ClawBot } from './bot';

const params = new URLSearchParams(location.search);
/** 1 m を何ピクセルで描くか。盤（14×24 m）を真ん中に置き、左右の余白に HUD */
const S = 30;
const VIEW_W = 760;
const VIEW_H = 740;
const OX = (VIEW_W - WORLD_W * S) / 2;
const OY = 10;
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
  const flipG = new Graphics();
  const spiritLayer = new Container();
  const particles = new Particles(1800);
  const fxG = new Graphics();
  ga.world.addChild(sky, field.container, boardG, goalG, goalText, flipG, spiritLayer, clawG, particles.container, fxG);

  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const center = el('div', { class: 'center' });
  hud.append(tl, center);
  document.body.appendChild(hud);

  const tuning = createTuning<MoonConfig>('moon-claw', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<{ cleared: Record<string, number> }>('moon-claw', { cleared: {} });
  // 登録順がビットになる：left=1(IN_LEFT), right=2(IN_RIGHT), drop=4(IN_DROP), open=8(IN_OPEN)
  const input = new Input({
    left: { keys: ['KeyZ', 'ShiftLeft'], touch: { x0: 0, y0: 0.62, x1: 0.5, y1: 1 } },
    right: { keys: ['Slash', 'ShiftRight'], touch: { x0: 0.5, y0: 0.62, x1: 1, y1: 1 } },
    drop: { keys: ['ArrowDown', 'KeyS', 'Space'] },
    open: { keys: ['ArrowUp', 'KeyW', 'Enter'] },
  });

  let stageIndex = Math.min(clawStages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = new ClawSim(clawStages[stageIndex], toClaw(cfg));
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  let autoplay = params.has('autoplay');
  let bot = new ClawBot(0.85, 1);
  let t = 0;
  /** 爪の目標の x（マウス・キー・タッチ） */
  let targetX = WORLD_W / 2;
  /** マウス・タッチで押している入力（キーボードの Input に重ねる） */
  let mouseBits = 0;
  /** 1ティックだけ送る入力（開く） */
  let pulse = 0;
  /** スマホの「下ろす」：押したら、爪が上がり始めるまで下ろし続ける */
  let dropLatch = false;
  let resultTimer = -1;
  let recentFalls: number[] = [];
  const sprites = new Map<number, Sprite>();
  const popups: { x: number; y: number; text: string; age: number; color: number }[] = [];

  const start = (i: number) => {
    closeMenu();
    mode = 'play';
    stageIndex = i;
    sim = new ClawSim(clawStages[i], toClaw(cfg));
    bot = new ClawBot(0.85, 1 + i);
    targetX = WORLD_W / 2;
    resultTimer = -1;
    recentFalls = [];
    for (const sp of sprites.values()) sp.destroy();
    sprites.clear();
    popups.length = 0;
    buildBoard();
    center.innerHTML = `<div style="color:var(--gold);max-width:380px;margin:0 auto">${clawStages[i].hint}</div>`;
    const cur = sim;
    setTimeout(() => { if (sim === cur) center.innerHTML = ''; }, 4000);
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
      <p>巣穴の点 ${sim.score} / ${st.need}　残り時間 ${sim.timeLeft.toFixed(1)} 秒</p>
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
      <p style="max-width:620px;line-height:1.8;font-size:13px">上の段は<b style="color:var(--gold)">クレーン</b>。月の爪で精霊の山から掴み、<b>こぼさないようにゆっくり</b>運んで、真ん中の落とし口で放す。<br>
      下の段は<b style="color:#bfe3ff">ピンボール</b>。落ちた精霊をフリッパーで打ち上げ、金の巣穴（数字は倍率）へ。時間内に必要な点を集めよう。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><b>マウス</b>で爪を動かす　<b>左クリック長押し</b>＝下ろす（放すと掴む）　<b>右クリック</b>＝開く<br>
      キー：<kbd>A</kbd><kbd>D</kbd>／<kbd>←</kbd><kbd>→</kbd> 爪　<kbd>↓</kbd><kbd>S</kbd> 下ろす　<kbd>↑</kbd><kbd>W</kbd> 開く　<kbd>Z</kbd> <kbd>/</kbd> フリッパー<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：上の段を指でなぞって爪、上のボタンで下ろす・開く、画面の下の左右でフリッパー</div>`;
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
  const toWorldX = (cx: number, cy: number) => (ga.toLogical(cx, cy).x - OX) / S;
  const toWorldY = (cx: number, cy: number) => (ga.toLogical(cx, cy).y - OY) / S;
  ga.app.canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'play') return;
    // タッチは上の段（棚より上）をなぞった時だけ爪を動かす（下はフリッパー）
    if (e.pointerType === 'touch' && toWorldY(e.clientX, e.clientY) > SHELF_Y + 2) return;
    targetX = toWorldX(e.clientX, e.clientY);
  });
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play') return;
    if (e.pointerType === 'touch') {
      if (toWorldY(e.clientX, e.clientY) <= SHELF_Y + 2) targetX = toWorldX(e.clientX, e.clientY);
      return;
    }
    targetX = toWorldX(e.clientX, e.clientY);
    if (e.button === 2) pulse |= IN_OPEN;
    else mouseBits |= IN_DROP;
  });
  window.addEventListener('pointerup', () => { mouseBits = 0; });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'result')) restart();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyT') tuning.toggle();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const tbar = touchButtons([
    { label: '‖', onPress: () => togglePause() },
    { label: '▼ 下ろす', onPress: () => { dropLatch = true; } },
    { label: '◇ 開く', onPress: () => { pulse |= IN_OPEN; } },
  ], 'top');

  tuning.onChange((key) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    // ルールの値は今のプレイにもすぐ反映（↻ の項目はやり直しで）
    Object.assign(sim.cfg, { grip: cfg.grip, grabMax: cfg.grabMax, grabR: cfg.grabR, clawSpeed: cfg.clawSpeed, clawDown: cfg.clawDown, bombForce: cfg.bombForce, bombR: cfg.bombR });
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('moon');
  ga.setBloom(cfg.bloom);

  // ---- 盤（動かない物）を描く ----
  const buildBoard = () => {
    const st = clawStages[stageIndex];
    boardG.clear();
    // 盤の地（少し明るい夜空）
    boardG.rect(px(0), py(-0.3), WORLD_W * S, (WORLD_H + 0.3) * S).fill({ color: 0x0c1238, alpha: 0.35 });
    // 外壁
    const glowLine = (x0: number, y0: number, x1: number, y1: number, col = 0x8fa6ff, w = 3) => {
      boardG.moveTo(px(x0), py(y0)).lineTo(px(x1), py(y1)).stroke({ width: w + 6, color: col, alpha: 0.12 });
      boardG.moveTo(px(x0), py(y0)).lineTo(px(x1), py(y1)).stroke({ width: w, color: col, alpha: 0.85 });
    };
    glowLine(0, -0.3, 0, WORLD_H);
    glowLine(WORLD_W, -0.3, WORLD_W, WORLD_H);
    // 爪のレール
    glowLine(0.2, RAIL_Y - 0.5, WORLD_W - 0.2, RAIL_Y - 0.5, 0xffd98a, 2);
    // 棚と落とし口の縁
    glowLine(0, SHELF_Y, HOLE_X0, SHELF_Y, 0xb9c6ff);
    glowLine(HOLE_X1, SHELF_Y, WORLD_W, SHELF_Y, 0xb9c6ff);
    glowLine(HOLE_X0, SHELF_Y, HOLE_X0, SHELF_Y - 0.45, 0xb9c6ff, 2);
    glowLine(HOLE_X1, SHELF_Y, HOLE_X1, SHELF_Y - 0.45, 0xb9c6ff, 2);
    // 落とし口：下へ向かう光の筋
    for (let k = 0; k < 5; k++) boardG.rect(px(HOLE_X0 + 0.2 + k * 0.38), py(SHELF_Y + 0.1), 2, S * 0.9).fill({ color: 0xffd98a, alpha: 0.18 - k * 0.02 });
    // 下の段の斜面
    glowLine(0, 18.5, PIVOT_L.x - 0.1, PIVOT_L.y - 0.3);
    glowLine(WORLD_W, 18.5, PIVOT_R.x + 0.1, PIVOT_R.y - 0.3);
    // 柱
    for (const p of st.posts ?? []) {
      boardG.circle(px(p.x), py(p.y), p.r * S + 5).fill({ color: 0x8fa6ff, alpha: 0.12 });
      boardG.circle(px(p.x), py(p.y), p.r * S).fill({ color: 0x1a2260, alpha: 0.9 }).stroke({ width: 2, color: 0xb9c6ff, alpha: 0.9 });
    }
    // 巣穴の倍率の文字
    goalText.removeChildren().forEach((c) => c.destroy());
    for (const g of st.goals) {
      const tx = new Text({ text: `×${g.mult}`, style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xffe7a8 } });
      tx.anchor.set(0.5);
      tx.position.set(px(g.x), py(g.y));
      goalText.addChild(tx);
    }
  };
  buildBoard();

  const loop = new FixedLoop({
    update: () => {
      const mask = input.sample();
      if (mode !== 'play' && mode !== 'result') return;
      // キーボードで爪を動かす（押している間、目標を進める）
      const kdir = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if (kdir) targetX = Math.max(0.6, Math.min(WORLD_W - 0.6, sim.claw.x + kdir * sim.cfg.clawSpeed * DT * 1.5));
      let bits = mask | mouseBits | pulse;
      pulse = 0;
      if (dropLatch) {
        bits |= IN_DROP;
        if (sim.clawMode === 'up') dropLatch = false;
      }
      let tx = targetX;
      if (mode === 'play' && autoplay) {
        const a = bot.act(sim);
        bits = a.bits;
        tx = a.x;
        targetX = a.x;
      }
      if (mode !== 'play') bits = 0;
      sim.step(bits, tx);
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
        const left = sim.spirits.filter((s) => s.state !== 'home' && s.state !== 'lost').length;
        const tl0 = sim.timeLeft;
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">${sim.score} / ${st.need}</div>
          <div style="font-size:14px;color:${tl0 < 15 ? '#ff9f9f' : 'var(--dim)'}">残り ${tl0.toFixed(0)} 秒</div>
          <div style="font-size:13px;color:var(--dim)">精霊 ${left}</div>
          <div style="font-size:12px;color:var(--dim);margin-top:6px;line-height:1.6">マウス＝爪<br>長押し＝下ろす<br>右クリック＝開く<br>Z ／ ＝フリッパー</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const handleEvents = () => {
    for (const e of sim.events) {
      if (e.t === 'grab') {
        particles.emit(px(e.x), py(e.y), { count: 10 * e.n, speed: [20, 90], life: [0.2, 0.5], size: [0.04, 0.1], color: [0xffd98a, 0xbfe3ff] });
        synth.chord(2, [0, 4, 7].slice(0, e.n), 0.05, 0.07);
      } else if (e.t === 'slip') {
        synth.tone(330, 0.25, { type: 'sine', vol: 0.06, slideTo: 180 });
        particles.emit(px(e.x), py(e.y), { count: 8, speed: [20, 80], life: [0.2, 0.4], size: [0.04, 0.08], color: 0x8fa6ff });
      } else if (e.t === 'release') {
        synth.whoosh(0.5);
      } else if (e.t === 'fall') {
        // 解放：落とし口をくぐった瞬間。2つ以上が続けて落ちると（マルチボール）、スローと金の光
        recentFalls = recentFalls.filter((k) => sim.tick - k < HZ * 0.8);
        recentFalls.push(sim.tick);
        synth.hbell(4 + recentFalls.length, 0.1, 1.1);
        particles.emit(px(e.x), py(e.y), { count: 26, speed: [40, 220], life: [0.3, 0.8], size: [0.05, 0.14], color: [0xffd98a, 0xffffff] });
        popups.push({ x: px(e.x), y: py(e.y) - 10, text: '↓', age: 0, color: 0xffd98a });
        if (recentFalls.length >= 2) {
          juice.slowmo(0.35, cfg.slowmo);
          juice.doFlash(0.18 + 0.06 * recentFalls.length, 0xffe7a8);
          juice.shake(0.15 * recentFalls.length);
          // 前の MULTI の文字は消して、数字だけ大きくなっていくように
          for (let k = popups.length - 1; k >= 0; k--) if (popups[k].text.startsWith('MULTI')) popups.splice(k, 1);
          popups.push({ x: px(7), y: py(SHELF_Y + 1.6), text: `MULTI ×${recentFalls.length}`, age: 0, color: 0xffe7a8 });
        }
      } else if (e.t === 'boom') {
        juice.shake(0.6);
        juice.hitstop(0.06);
        juice.doFlash(0.35, 0xff9f8a);
        synth.boom(0.8, 2);
        particles.emit(px(e.x), py(e.y), { count: 70, speed: [80, 420], life: [0.3, 1], size: [0.06, 0.2], color: [0xff8f8f, 0xffd98a, 0xffffff] });
        shock.push({ x: px(e.x), y: py(e.y), r: e.r * S, age: 0 });
      } else if (e.t === 'home') {
        juice.hitstop(0.05);
        juice.shake(0.25);
        synth.arp([0, 4, 7, 9 + e.mult].map((n) => n + e.total), 0.05, 0.09);
        particles.emit(px(e.x), py(e.y), { count: 50 + 20 * e.mult, speed: [60, 330], life: [0.4, 1.1], size: [0.05, 0.18], color: [0xffd98a, 0xfff1c8, 0xbfe3ff] });
        shock.push({ x: px(e.x), y: py(e.y), r: 40, age: 0 });
        popups.push({ x: px(e.x), y: py(e.y) - 18, text: `+${e.mult}`, age: 0, color: 0xffe7a8 });
      } else if (e.t === 'lost') {
        synth.tone(180, 0.4, { type: 'sine', vol: 0.07, slideTo: 80 });
      } else if (e.t === 'flip') {
        synth.flipper(e.side === 'L' ? 1 : 1.1);
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
  const popTexts: Text[] = [];
  const draw = (dt: number) => {
    const st = clawStages[stageIndex];
    // 巣穴：金の輪がゆっくり脈打つ
    goalG.clear();
    for (const g of st.goals) {
      const pulseK = 0.5 + 0.5 * Math.sin(t * 2.4 + g.x);
      goalG.circle(px(g.x), py(g.y), g.r * S + 8 + pulseK * 4).fill({ color: 0xffd98a, alpha: 0.06 + 0.04 * pulseK });
      goalG.circle(px(g.x), py(g.y), g.r * S).fill({ color: 0x2a1e08, alpha: 0.55 }).stroke({ width: 2.5, color: 0xffd98a, alpha: 0.75 + 0.25 * pulseK });
      for (let k = 0; k < 6; k++) {
        const a = t * 0.9 + (k * Math.PI) / 3;
        goalG.circle(px(g.x) + Math.cos(a) * (g.r * S + 4), py(g.y) + Math.sin(a) * (g.r * S + 4), 1.6).fill({ color: 0xfff1c8, alpha: 0.8 });
      }
    }
    // フリッパー
    flipG.clear();
    for (const f of sim.flipperPoses()) {
      const s = f.side === 'L' ? 1 : -1;
      const ex = f.x + Math.cos(f.angle) * s * f.length, ey = f.y + Math.sin(f.angle) * s * f.length;
      flipG.moveTo(px(f.x), py(f.y)).lineTo(px(ex), py(ey)).stroke({ width: 14, color: 0x8fa6ff, alpha: 0.18, cap: 'round' });
      flipG.moveTo(px(f.x), py(f.y)).lineTo(px(ex), py(ey)).stroke({ width: 8, color: 0xe6ecff, alpha: 0.95, cap: 'round' });
      flipG.circle(px(f.x), py(f.y), 4).fill({ color: 0xffd98a });
    }
    // 精霊
    for (const s of sim.spirits) {
      let sp = sprites.get(s.id);
      const gone = s.state === 'home' || s.state === 'lost';
      if (!sp) {
        sp = new Sprite(glowTexture());
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        spiritLayer.addChild(sp);
        sprites.set(s.id, sp);
      }
      sp.visible = !gone;
      if (gone) continue;
      const p = s.body.getPosition();
      sp.position.set(px(p.x), py(p.y));
      const tw = 0.9 + 0.1 * Math.sin(t * 5 + s.id);
      sp.scale.set((sim.cfg.spiritR * S * 2.1) / 64 * tw * (s.bomb ? 1.2 : 1));
      sp.alpha = s.bomb ? 1 : 0.85;
      sp.tint = s.bomb ? 0xff5a5a : s.state === 'held' ? 0xffe7a8 : s.state === 'ball' ? 0xd8f0ff : 0xa9cfff;
    }
    // 月の爪：レールから吊り下がる糸、三日月の頭、2本の爪（開き具合）
    clawG.clear();
    const c = sim.claw;
    const cx = px(c.x), cy = py(c.y);
    clawG.moveTo(cx, py(RAIL_Y - 0.5)).lineTo(cx, cy).stroke({ width: 1.5, color: 0xb9c6ff, alpha: 0.7 });
    clawG.circle(cx, py(RAIL_Y - 0.5), 4).fill({ color: 0xffd98a });
    // 三日月（外の円から内の円を抜いた形を、2本の弧で）
    clawG.moveTo(cx + Math.cos(Math.PI * 0.1) * 12, cy + Math.sin(Math.PI * 0.1) * 12).arc(cx, cy, 12, Math.PI * 0.1, Math.PI * 0.9, true).arc(cx, cy - 4, 10, Math.PI * 0.82, Math.PI * 0.18, false).fill({ color: 0xffe7a8, alpha: 0.95 });
    const tip = py(sim.clawTip);
    const a = 0.25 + c.open * 0.55;
    const armL = 0.9 * S;
    for (const sgn of [-1, 1]) {
      const bx = cx + sgn * 6, by = cy + 4;
      const ex = bx + sgn * Math.sin(a) * armL, ey = by + Math.cos(a) * armL;
      const hx = ex - sgn * 7, hy = ey + 2;
      clawG.moveTo(bx, by).lineTo(ex, ey).lineTo(hx, hy).stroke({ width: 3.5, color: 0xffd98a, alpha: 0.95, cap: 'round', join: 'round' });
    }
    // 爪の真下に、下ろした時に届く所の目安（点線）
    if (sim.clawMode === 'idle' && mode === 'play') {
      for (let y = tip + 10; y < py(SHELF_Y) - 4; y += 14) clawG.rect(cx - 1, y, 2, 6).fill({ color: 0xffd98a, alpha: 0.25 });
    }
    // 握力：掴んでいる時、爪が速く動いていたら、爪の周りに赤い揺れ（こぼれそう）
    const heldN = sim.spirits.filter((s) => s.state === 'held').length;
    if (heldN) {
      const sh = Math.abs(c.vx) / Math.max(0.1, sim.cfg.grip) / 0.6;
      clawG.circle(cx, tip, 22).stroke({ width: 2, color: sh > 1 ? 0xff8f8f : 0xffd98a, alpha: Math.min(0.9, 0.2 + sh * 0.5) });
    }
    // 衝撃の輪と文字。爆弾精霊には赤い棘の輪（ひと目で分かるように）
    fxG.clear();
    for (const s of sim.spirits) {
      if (!s.bomb || s.state === 'home' || s.state === 'lost') continue;
      const p = s.body.getPosition();
      const r = sim.cfg.spiritR * S + 3;
      fxG.circle(px(p.x), py(p.y), r).stroke({ width: 2, color: 0xff6a6a, alpha: 0.9 });
      for (let k = 0; k < 6; k++) {
        const a = t * 2 + (k * Math.PI) / 3;
        fxG.moveTo(px(p.x) + Math.cos(a) * r, py(p.y) + Math.sin(a) * r).lineTo(px(p.x) + Math.cos(a) * (r + 4), py(p.y) + Math.sin(a) * (r + 4)).stroke({ width: 2, color: 0xff9a8a, alpha: 0.9 });
      }
    }
    for (let i = shock.length - 1; i >= 0; i--) {
      const k = shock[i];
      k.age += dt;
      const f = k.age / 0.5;
      if (f >= 1) { shock.splice(i, 1); continue; }
      fxG.circle(k.x, k.y, k.r * (0.3 + f)).stroke({ width: 3 * (1 - f) + 1, color: 0xffe7a8, alpha: 0.8 * (1 - f) });
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

  const hook = installDebugHook('moon-claw', () => ({ mode, stage: stageIndex, phase: sim.phase, score: sim.score, need: clawStages[stageIndex].need, time: +sim.time.toFixed(1), held: sim.spirits.filter((s) => s.state === 'held').length, balls: sim.spirits.filter((s) => s.state === 'ball').length }));
  hook.start = (i: number) => start(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  // ?stage=N&autoplay=1 ならすぐに始める。それ以外はタイトルから
  if (params.has('stage') || autoplay) start(stageIndex);
  else showTitle();
  loop.start();
  hook.ready = true;
}

void main();
