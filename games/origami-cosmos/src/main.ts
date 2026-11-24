/**
 * Origami Cosmos — 折紙宇宙（描画・入力・画面遷移）。
 * ルールは sim.ts、解の探索は solver.ts（どちらも Pixi を使わない）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save } from '@engine/storage';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, backLink, touchButtons, touchText } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type OrigamiConfig } from './config';
import { stages } from './stages';
import { ruleCards } from '@engine/rules';
import { origamiRules } from './rules';
import { OrigamiSim, foldCenter, type Fold } from './sim';
import { solve, type Move } from './solver';

const VIEW_W = 1000;
const VIEW_H = 640;
const HZ = 60;
const params = new URLSearchParams(location.search);

interface Progress {
  cleared: Record<string, number>;
}

/** 演出の段取り（折る・燃える・開く）。ルールの状態は sim が持ち、ここは見た目の時間だけ */
type Anim =
  | { k: 'fold'; t: number }
  | { k: 'burn'; t: number; waves: number[][]; folds: Fold[]; star: number; lit: number[] }
  | { k: 'unfold'; t: number; folds: Fold[] }
  | null;

async function main() {
  // 20問を1画面に収める
  injectBaseStyle('.grid { width: min(480px, calc(100vw - 32px)); gap: 8px; margin: 10px 0; } .stage { height: 60px; } .menu p { margin: 4px 16px; }');
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const tuning = createTuning<OrigamiConfig>('origami-cosmos', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('origami-cosmos', { cleared: {} });

  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0b0a22', '#020208', ['#2a2a6e', '#4a2a5e', '#1b3b6f']));
  const field = makeStarfield(VIEW_W, VIEW_H, 160, 41);
  const board = new Container();
  const paperG = new Graphics();
  const lineG = new Graphics();
  const linkG = new Graphics();
  const starLayer = new Container();
  const fxG = new Graphics();
  const particles = new Particles(2000);
  board.addChild(paperG, linkG, lineG, starLayer, fxG);
  ga.world.addChild(sky, field.container, board, particles.container);

  // HUD
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  const chainEl = el('div', { class: 'chain' });
  chainEl.style.opacity = '0';
  const toastEl = el('div', { class: 'toast' });
  center.append(chainEl, toastEl);
  const hintEl = el('div');
  hintEl.className = 'tlift';
  hintEl.style.cssText = 'position:absolute;left:50%;bottom:34px;transform:translateX(-50%);font-size:15px;color:var(--dim);letter-spacing:.06em;text-align:center;text-shadow:0 0 8px #000;width:90%';
  hud.append(tl, tr, center, hintEl);
  document.body.appendChild(hud);
  backLink();
  let toastTimer = 0;
  const toast = (msg: string, sec = 3) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), sec * 1000);
  };
  let chainTimer = 0;
  const showChain = (n: number) => {
    chainEl.textContent = `${n} CHAIN`;
    chainEl.style.opacity = '1';
    chainEl.style.color = n >= 8 ? '#ffb3e6' : n >= 5 ? '#ffd98a' : '#fff';
    clearTimeout(chainTimer);
    chainTimer = window.setTimeout(() => (chainEl.style.opacity = '0'), 1500);
  };

  let sim: OrigamiSim | null = null;
  let stageIndex = 0;
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let anim: Anim = null;
  let t = 0;
  let hover: { fold: Fold } | { star: number } | null = null;
  let pointer = { x: -1, y: -1 };
  let hintMove: Move | null = null;
  let hintsUsed = 0;
  let botPlan: Move[] = [];
  let botWait = 0;
  let resultAt = -1;
  // カメラ：折った紙全体が収まるように寄る
  const cam = { x: 0, y: 0, cs: 60 };
  const camTarget = { x: 0, y: 0, cs: 60 };
  let starSprites: { glow: Sprite; core: Sprite }[] = [];
  /** 星が燃えた見た目（燃えている途中の星は alive でもまだ光る） */
  let burnt: boolean[] = [];
  let litLinks = new Set<number>();
  let linkFlash = 0;

  const closeMenu = () => { menu?.remove(); menu = null; };

  const buildStars = () => {
    starLayer.removeChildren();
    starSprites = [];
    if (!sim) return;
    for (let i = 0; i < sim.stage.stars.length; i++) {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      const core = new Sprite(glowTexture());
      core.anchor.set(0.5);
      starLayer.addChild(glow, core);
      starSprites.push({ glow, core });
    }
  };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    sim = new OrigamiSim(stages[i], cfg);
    anim = null;
    hover = null;
    hintMove = null;
    hintsUsed = 0;
    botPlan = [];
    botWait = 1;
    resultAt = -1;
    burnt = sim.alive.map(() => false);
    litLinks = new Set();
    mode = 'play';
    buildStars();
    fitCamera(true);
    hintEl.textContent = touchText(stages[i].hint, [['クリック', 'タップ'], ['つまんで', '指で']]);
  };

  /** 今の（または折り終わった後の）紙が全部入るようにカメラを決める */
  const fitCamera = (snap = false) => {
    if (!sim) return;
    const st = sim.stage;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const p = foldCenter(st, sim.folds, x, y);
        x0 = Math.min(x0, p.x - 0.5); x1 = Math.max(x1, p.x + 0.5);
        y0 = Math.min(y0, p.y - 0.5); y1 = Math.max(y1, p.y + 0.5);
      }
    }
    // 開いた紙も入るように（折ると小さくなりすぎないよう、元の大きさとまとめる）
    x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, st.w); y1 = Math.max(y1, st.h);
    const cs = Math.min(70, (VIEW_W - 120) / (x1 - x0), (VIEW_H - 170) / (y1 - y0));
    camTarget.cs = cs;
    camTarget.x = VIEW_W / 2 - ((x0 + x1) / 2) * cs;
    camTarget.y = VIEW_H / 2 + 22 - ((y0 + y1) / 2) * cs;
    if (snap) Object.assign(cam, camTarget);
  };

  /** 星評価：ふつうの最短（stage.ignitions）で★3、1回多くて★2、それ以上は★1。ヒントを使うと★2まで */
  const rating = (s: OrigamiSim) => {
    if (s.phase !== 'clear') return 0;
    const over = s.moves - s.stage.ignitions;
    let r = over <= 0 ? 3 : over === 1 ? 2 : 1;
    if (hintsUsed > 0) r = Math.min(r, 2);
    return r;
  };

  const showResult = () => {
    if (!sim) return;
    mode = 'result';
    const st = stages[stageIndex];
    const cleared = sim.phase === 'clear';
    const stars = rating(sim);
    if (cleared) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.write();
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${cleared ? 'CLEAR' : 'FAILED'}</h1><h2>${st.name}</h2>
      ${cleared ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>${cleared ? `点火 ${sim.moves} 回（最短 ${st.ignitions} 回）　折った回数 ${sim.foldsUsed}` : `点火が尽きた — 残りの星 ${sim.starsAlive()}`}</p>
      <p style="font-size:13px">★3：最短の点火回数で　★2：最短＋1回（ヒントを使うと★2まで）</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (cleared && stageIndex < stages.length - 1) {
      const nb = el('button', { class: 'btn' }, '次の問題 →');
      nb.onclick = () => startStage(stageIndex + 1);
      row.appendChild(nb);
    }
    const rb = el('button', { class: 'btn' }, 'もう一度 (R)');
    rb.onclick = () => startStage(stageIndex);
    const mb = el('button', { class: 'btn' }, '問題を選ぶ');
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
      <h1>ORIGAMI COSMOS</h1>
      <h2>折 紙 宇 宙</h2>
      <div class="rulebox"></div>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys">線の片側を<b>クリック</b>（または紙を線の向こうへ<b>ドラッグ</b>）で折る　星を<b>クリック</b>で点火　<kbd>Z</kbd>／右クリック 1つ戻す<br>
      <kbd>H</kbd> ヒント　<kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：タップで折る・点火、下のボタンで戻す／ヒント</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(origamiRules));
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
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(58); startStage(i); };
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
      const m = el('button', { class: 'btn' }, '問題を選ぶ');
      m.onclick = showTitle;
      row.append(c, r, m);
      menu.appendChild(ruleCards(origamiRules));
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
    }
  };

  // ---- 操作 ----
  const busy = () => anim !== null || !sim || sim.phase !== 'play';

  const doFold = (f: Fold) => {
    if (busy() || !sim!.fold(f)) return;
    hintMove = null;
    anim = { k: 'fold', t: 0 };
    synth.noise(cfg.foldTime + 0.1, { vol: 0.08, from: 900, to: 2600, q: 1.5 });
    // 紙のこすれる音：短いノイズを少しずつずらして重ねる
    for (let k = 0; k < 3; k++) window.setTimeout(() => synth.noise(0.05, { vol: 0.05, from: 4000 + k * 900, to: 1800, q: 4, wet: 0.05 }), (cfg.foldTime * 1000 * (k + 1)) / 4);
    synth.tone(330 + sim!.folds.length * 110, 0.25, { type: 'triangle', vol: 0.05, slideTo: 440 + sim!.folds.length * 110 });
    fitCamera();
  };

  const undoFold = () => {
    if (busy() || !sim!.folds.length) return;
    const last = sim!.folds[sim!.folds.length - 1];
    sim!.unfoldOne();
    anim = { k: 'unfold', t: 0, folds: [...sim!.folds, last] };
    synth.noise(cfg.foldTime * 0.8, { vol: 0.06, from: 2600, to: 900, q: 1.5 });
    fitCamera();
  };

  const doIgnite = (star: number) => {
    if (busy() || !sim!.alive[star]) return;
    const folds = [...sim!.folds];
    const before = [...sim!.alive];
    const waves = sim!.ignite(star);
    if (!waves.length) return;
    hintMove = null;
    // この点火で灯る星座の線：両端が同じ点火で燃えた線
    const burntNow = new Set(waves.flat());
    const lit: number[] = [];
    (sim!.stage.links ?? []).forEach(([a, b], i) => {
      if (before[a] && before[b] && burntNow.has(a) && burntNow.has(b)) lit.push(i);
    });
    anim = { k: 'burn', t: 0, waves, folds, star, lit };
    synth.tone(220, 0.3, { type: 'sine', vol: 0.12, slideTo: 660 });
  };

  /** 画面座標 → 盤面の連続座標（マス単位） */
  const toBoard = (px: number, py: number) => ({ x: (px - cam.x) / cam.cs, y: (py - cam.y) / cam.cs });

  /** カーソルの下：星（今見えている位置）か、近くの折り線とその側 */
  const pick = (px: number, py: number): typeof hover => {
    if (!sim) return null;
    const b = toBoard(px, py);
    let best = -1, bd = 0.42;
    sim.stage.stars.forEach((s, i) => {
      if (!sim!.alive[i]) return;
      const p = foldCenter(sim!.stage, sim!.folds, s.x, s.y);
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) return { star: best };
    if (!sim.canFold()) return null;
    // 近い折り線（紙の上にいる時だけ）
    let line = -1, ld = 2.2;
    sim.stage.folds.forEach((L, i) => {
      const d = Math.abs((L.axis === 'x' ? b.x : b.y) - L.at);
      if (d < ld) { ld = d; line = i; }
    });
    if (line < 0) return null;
    const L = sim.stage.folds[line];
    const c = L.axis === 'x' ? b.x : b.y;
    const side: 1 | -1 = c >= L.at ? 1 : -1;
    // その側に紙があるか
    const has = paperCells().some((p) => (L.axis === 'x' ? (side === 1 ? p.x >= L.at : p.x < L.at) : (side === 1 ? p.y >= L.at : p.y < L.at)));
    return has ? { fold: { line, side } } : null;
  };

  const paperCells = () => {
    const out: { x: number; y: number }[] = [];
    if (!sim) return out;
    for (let y = 0; y < sim.stage.h; y++) for (let x = 0; x < sim.stage.w; x++) out.push(foldCenter(sim.stage, sim.folds, x, y));
    return out;
  };

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if ((e.code === 'KeyZ' || e.code === 'Backspace') && mode === 'play') undoFold();
    if (e.code === 'KeyH' && mode === 'play') showHint();
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  window.addEventListener('pointermove', (e) => {
    const p = ga.toLogical(e.clientX, e.clientY);
    pointer = p;
  });
  // クリック：星なら点火、線の近くなら（クリックした側を）折る。
  // ドラッグ：紙をつまんで折り線の向こうへ運ぶと、つまんだ側が折れる
  let press: { x: number; y: number } | null = null;
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play' || !sim) return;
    if (e.button === 2) { undoFold(); return; }
    const p = ga.toLogical(e.clientX, e.clientY);
    const h = pick(p.x, p.y);
    if (h && 'star' in h) { doIgnite(h.star); return; }
    press = p;
  });
  window.addEventListener('pointerup', (e) => {
    if (!press || !sim) return;
    const p = ga.toLogical(e.clientX, e.clientY);
    const start = press;
    press = null;
    if (Math.hypot(p.x - start.x, p.y - start.y) < 14) {
      const h = pick(start.x, start.y);
      if (h && 'fold' in h) doFold(h.fold);
      return;
    }
    // ドラッグで越えた折り線（つまんだ所に近い線）
    const a = toBoard(start.x, start.y), b = toBoard(p.x, p.y);
    let best: Fold | null = null, bd = Infinity;
    sim.stage.folds.forEach((L, line) => {
      const ca = L.axis === 'x' ? a.x : a.y, cb = L.axis === 'x' ? b.x : b.y;
      if ((ca - L.at) * (cb - L.at) >= 0) return;
      const d = Math.abs(ca - L.at);
      if (d < bd) { bd = d; best = { line, side: ca >= L.at ? 1 : -1 }; }
    });
    if (best) doFold(best);
  });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const showHint = () => {
    if (!sim || busy()) return;
    const sol = solve({ ...sim.stage, stars: sim.stage.stars }, { blast: cfg.blast, maxFolds: sim.maxFolds, maxIgnitions: sim.ignitionsLeft }, sim.alive);
    if (!sol) { toast('この状態からは、残りの点火では全部燃やせない（R でやり直し）'); return; }
    hintsUsed++;
    hintMove = sol.moves[0];
    const f = hintMove.folds;
    toast(f.length ? `ヒント：光る線で ${f.length} 回折って、光る星を点火` : 'ヒント：折らずに、光る星を点火');
  };

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    if (restart && mode === 'play' && key !== '*') toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('origami');
  ga.setBloom(cfg.bloom);

  // ---- 自動プレイ：ソルバーの手順を、間を置いて再生 ----
  const botStep = (dt: number) => {
    if (!sim || busy()) return;
    botWait -= dt;
    if (botWait > 0) return;
    if (!botPlan.length) {
      const sol = solve(sim.stage, { blast: cfg.blast, maxFolds: sim.maxFolds, maxIgnitions: sim.ignitionsLeft }, sim.alive);
      if (!sol) return;
      botPlan = sol.moves.map((m) => ({ folds: [...m.folds], star: m.star }));
    }
    const m = botPlan[0];
    if (m.folds.length > sim.folds.length) {
      doFold(m.folds[sim.folds.length]);
      botWait = 0.5;
    } else {
      doIgnite(m.star);
      botPlan.shift();
      botWait = 0.9;
    }
  };

  // ---- 描画 ----
  const PAPER = 0x1a1d4a, PAPER_BACK = 0x2a1a4a;

  const draw = (dt: number) => {
    t += dt;
    field.update(t);
    particles.update(dt);
    if (!sim) return;
    const st = sim.stage;
    // アニメの進み
    let folds = sim.folds;
    let lastT = 1;
    if (anim) {
      anim.t += dt;
      if (anim.k === 'fold') {
        lastT = Math.min(1, anim.t / cfg.foldTime);
        if (lastT >= 1) { anim = null; synth.click(1.4); juice.shake(0.05 * cfg.shake); }
      } else if (anim.k === 'unfold') {
        folds = anim.folds;
        lastT = Math.max(0, 1 - anim.t / (cfg.foldTime * 0.7));
        if (lastT <= 0) anim = null;
      } else if (anim.k === 'burn') {
        folds = anim.folds;
        const total = anim.waves.length * cfg.waveTime + 0.5;
        // 燃える波
        const shown = Math.min(anim.waves.length, Math.floor(anim.t / cfg.waveTime) + 1);
        let count = 0;
        for (let w = 0; w < shown; w++) {
          for (const i of anim.waves[w]) {
            count++;
            if (burnt[i]) continue;
            burnt[i] = true;
            const p = foldCenter(st, folds, st.stars[i].x, st.stars[i].y);
            const sx = cam.x + p.x * cam.cs, sy = cam.y + p.y * cam.cs;
            particles.emit(sx, sy, { count: 40 + w * 6, speed: [60, 360 + w * 20], life: [0.4, 1.1], size: [0.05, 0.22], color: w === 0 ? [0xffffff, 0xffe7a8] : w < 3 ? [0xffd98a, 0xffb36b] : [0xffb3e6, 0xc9a3ff], drag: 1.8 });
            synth.hbell(2 + w * 2 + (i % 2), 0.1, 1.2);
            juice.shake((0.08 + w * 0.02) * cfg.shake);
          }
        }
        if (count >= 3 && shown === anim.waves.length && anim.t - (shown - 1) * cfg.waveTime < dt * 1.5) {
          showChain(count);
          if (count >= 5) { juice.slowmo(0.35, 0.8); juice.doFlash(0.4, 0xffe7a8); }
        }
        if (anim.t >= total) {
          // 紙が開く
          const prev = anim;
          for (const i of prev.lit) litLinks.add(i);
          if (prev.lit.length) { linkFlash = 1; synth.arp([0, 2, 4, 7, 9, 11].slice(0, 2 + prev.lit.length), 0.06, 0.08); }
          anim = prev.folds.length ? { k: 'unfold', t: 0, folds: prev.folds } : null;
          fitCamera();
          if (sim.phase !== 'play') resultAt = t + (sim.phase === 'clear' ? 1.6 : 1.2);
          if (sim.phase === 'clear') {
            juice.slowmo(0.3, 1.2);
            juice.doFlash(0.6, 0xffe7a8);
            synth.arp([0, 2, 4, 5, 7, 9, 11, 12], 0.07, 0.11);
            toast('星座がそろった');
          } else if (sim.phase === 'fail') {
            synth.tone(196, 1, { type: 'sine', vol: 0.15, slideTo: 60 });
            toast('点火が尽きた');
          }
        }
      }
    }
    if (resultAt > 0 && t >= resultAt && mode === 'play') { resultAt = -1; showResult(); }

    // カメラ
    const k = Math.min(1, dt * 5);
    cam.x += (camTarget.x - cam.x) * k;
    cam.y += (camTarget.y - cam.y) * k;
    cam.cs += (camTarget.cs - cam.cs) * k;
    const cs = cam.cs;
    const X = (x: number) => cam.x + x * cs, Y = (y: number) => cam.y + y * cs;

    // 紙：マスを重なりの順に。裏は紫。半透明で下の層が透ける
    const cells: { x: number; y: number; z: number; flipped: boolean; sx: number; sy: number; lift: number; ox: number; oy: number }[] = [];
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) cells.push({ ...foldCenter(st, folds, x, y, lastT), ox: x, oy: y });
    cells.sort((a, b) => a.z - b.z);
    const g = paperG;
    g.clear();
    // 元の紙の位置（影）
    g.rect(X(0), Y(0), st.w * cs, st.h * cs).stroke({ width: 1, color: 0x6a74c9, alpha: 0.18 });
    for (const c of cells) {
      const w = Math.max(1.5, Math.abs(c.sx) * cs), h = Math.max(1.5, Math.abs(c.sy) * cs);
      const back = c.sx * c.sy < 0 ? !c.flipped : c.flipped;
      const shade = 1 - Math.min(0.5, c.z * 0.08);
      g.rect(X(c.x) - w / 2 + 1, Y(c.y) - h / 2 + 1 - c.lift * 6, w - 2, h - 2)
        .fill({ color: back ? PAPER_BACK : PAPER, alpha: 0.5 * shade + 0.1 })
        .stroke({ width: 1, color: back ? 0xb48cff : 0x8fa8ff, alpha: 0.22 + c.lift * 0.3 });
      // 紙の質感：マスごとに決まった小さな星の粒（紙と一緒に動き、裏返ると鏡写し）
      for (let k = 0; k < 3; k++) {
        const hsh = Math.sin((c.ox * 12.9898 + c.oy * 78.233 + k * 37.719) * 43758.5453);
        const u = hsh - Math.floor(hsh), v = (hsh * 7.31) - Math.floor(hsh * 7.31);
        g.circle(X(c.x) + (u - 0.5) * w * 0.8, Y(c.y) + (v - 0.5) * h * 0.8 - c.lift * 6, 1 + (k === 0 ? 0.6 : 0)).fill({ color: 0xdfe6ff, alpha: 0.25 + 0.15 * k });
      }
    }

    // 折り線（空間に固定）。カーソルの近くでは動く側を光らせて矢印
    const lg = lineG;
    lg.clear();
    st.folds.forEach((L, i) => {
      const hl = hover && 'fold' in hover && hover.fold.line === i;
      const hint = hintMove && hintMove.folds[sim!.folds.length]?.line === i;
      const col = hint ? 0xffd98a : hl ? 0xffffff : 0x9fd0ff;
      const a = hint ? 0.6 + 0.4 * Math.sin(t * 6) : hl ? 0.9 : 0.45;
      const n = 40;
      for (let s = 0; s < n; s += 2) {
        if (L.axis === 'x') lg.moveTo(X(L.at), 10 + ((VIEW_H - 20) * s) / n).lineTo(X(L.at), 10 + ((VIEW_H - 20) * (s + 1)) / n);
        else lg.moveTo(10 + ((VIEW_W - 20) * s) / n, Y(L.at)).lineTo(10 + ((VIEW_W - 20) * (s + 1)) / n, Y(L.at));
      }
      lg.stroke({ width: hl || hint ? 2.5 : 1.5, color: col, alpha: a });
    });
    if (hover && 'fold' in hover && !busy()) {
      const L = st.folds[hover.fold.line];
      const side = hover.fold.side;
      // 動く側の紙を明るく
      for (const c of cells) {
        const cc = L.axis === 'x' ? c.x : c.y;
        if (side === 1 ? cc >= L.at : cc < L.at) lg.rect(X(c.x) - cs / 2 + 1, Y(c.y) - cs / 2 + 1, cs - 2, cs - 2).fill({ color: 0xffffff, alpha: 0.06 });
      }
      // 矢印
      const b = toBoard(pointer.x, pointer.y);
      const ax = L.axis === 'x' ? X(L.at) + side * cs * 0.9 : X(b.x);
      const ay = L.axis === 'x' ? Y(b.y) : Y(L.at) + side * cs * 0.9;
      const dx = L.axis === 'x' ? -side : 0, dy = L.axis === 'y' ? -side : 0;
      lg.moveTo(ax, ay).lineTo(ax + dx * cs * 1.2, ay + dy * cs * 1.2).stroke({ width: 3, color: 0xffffff, alpha: 0.8, cap: 'round' });
      const hx = ax + dx * cs * 1.2, hy = ay + dy * cs * 1.2;
      lg.moveTo(hx - dx * 10 - dy * 8, hy - dy * 10 + dx * 8).lineTo(hx, hy).lineTo(hx - dx * 10 + dy * 8, hy - dy * 10 - dx * 8).stroke({ width: 3, color: 0xffffff, alpha: 0.8, cap: 'round' });
    }

    // ドラッグ中：つまんだ所から指先まで
    if (press && !busy()) {
      lg.moveTo(press.x, press.y).lineTo(pointer.x, pointer.y).stroke({ width: 2, color: 0xffffff, alpha: 0.5, cap: 'round' });
      lg.circle(press.x, press.y, 5).fill({ color: 0xffffff, alpha: 0.6 });
    }

    // 星座の線（元の紙の上の位置で。灯った線は金）
    linkFlash = Math.max(0, linkFlash - dt * 0.8);
    const kg = linkG;
    kg.clear();
    (st.links ?? []).forEach(([a, b], i) => {
      const pa = foldCenter(st, folds, st.stars[a].x, st.stars[a].y, lastT);
      const pb = foldCenter(st, folds, st.stars[b].x, st.stars[b].y, lastT);
      if (litLinks.has(i)) {
        kg.moveTo(X(pa.x), Y(pa.y)).lineTo(X(pb.x), Y(pb.y)).stroke({ width: 7, color: 0xffd98a, alpha: 0.15 + linkFlash * 0.3 });
        kg.moveTo(X(pa.x), Y(pa.y)).lineTo(X(pb.x), Y(pb.y)).stroke({ width: 2, color: 0xfff3d6, alpha: 0.85 });
      } else kg.moveTo(X(pa.x), Y(pa.y)).lineTo(X(pb.x), Y(pb.y)).stroke({ width: 1, color: 0x9fb8ff, alpha: 0.18 });
    });

    // 星
    const fg = fxG;
    fg.clear();
    st.stars.forEach((s, i) => {
      const sv = starSprites[i];
      if (!sv) return;
      const gone = burnt[i];
      sv.glow.visible = sv.core.visible = !gone;
      if (gone) {
        // 燃えた跡：小さな灰の輪
        const p = foldCenter(st, folds, s.x, s.y, lastT);
        fg.circle(X(p.x), Y(p.y), cs * 0.12).stroke({ width: 1, color: 0x6a74c9, alpha: 0.35 });
        return;
      }
      const p = foldCenter(st, folds, s.x, s.y, lastT);
      sv.glow.x = sv.core.x = X(p.x);
      sv.glow.y = sv.core.y = Y(p.y) - p.lift * 6;
      const hov = hover && 'star' in hover && hover.star === i;
      const hint = hintMove && hintMove.folds.length <= sim!.folds.length && hintMove.star === i;
      const pulse = 0.8 + 0.2 * Math.sin(t * 3 + i);
      sv.glow.scale.set((cs * (hov || hint ? 1.5 : 1.1) * pulse) / 128);
      sv.glow.tint = hint ? 0xffd98a : p.flipped ? 0xd0b0ff : 0xbfe0ff;
      sv.glow.alpha = 0.85;
      sv.core.scale.set((cs * 0.32) / 128);
      // 爆風の届く範囲（カーソルを乗せた星）
      if (hov && !busy()) {
        const r = (cfg.blast + 0.5) * cs;
        fg.rect(X(p.x) - r, Y(p.y) - r, r * 2, r * 2).stroke({ width: 1.5, color: 0xffd98a, alpha: 0.5 });
      }
    });
    // 重なった星の数（同じマスに2つ以上）
    if (!anim) {
      const stack = new Map<string, { n: number; x: number; y: number }>();
      st.stars.forEach((s2, i) => {
        if (burnt[i]) return;
        const p = foldCenter(st, folds, s2.x, s2.y);
        const key = `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`;
        const e = stack.get(key);
        if (e) e.n++;
        else stack.set(key, { n: 1, x: p.x, y: p.y });
      });
      for (const e of stack.values()) {
        if (e.n < 2) continue;
        const bx = X(e.x) + cs * 0.3, by = Y(e.y) - cs * 0.3;
        fg.circle(bx, by, 9).fill({ color: 0x2a1a4a, alpha: 0.9 }).stroke({ width: 1.5, color: 0xffd98a, alpha: 0.9 });
        for (let k = 0; k < Math.min(e.n, 6); k++) {
          const a = (k / Math.min(e.n, 6)) * Math.PI * 2 - Math.PI / 2;
          fg.circle(bx + Math.cos(a) * 4.5, by + Math.sin(a) * 4.5, 1.6).fill({ color: 0xfff3d6 });
        }
      }
    }
    // 燃えている途中：点火した星から、波ごとに火が走る線
    if (anim && anim.k === 'burn') {
      const shown = Math.min(anim.waves.length, Math.floor(anim.t / cfg.waveTime) + 1);
      for (let w = 1; w < shown; w++) {
        for (const j of anim.waves[w]) {
          // 前の波の中で一番近い星から
          const pj = foldCenter(st, anim.folds, st.stars[j].x, st.stars[j].y);
          let best = anim.waves[w - 1][0], bd = Infinity;
          for (const i of anim.waves[w - 1]) {
            const pi = foldCenter(st, anim.folds, st.stars[i].x, st.stars[i].y);
            const d = Math.hypot(pi.x - pj.x, pi.y - pj.y);
            if (d < bd) { bd = d; best = i; }
          }
          const pi = foldCenter(st, anim.folds, st.stars[best].x, st.stars[best].y);
          const fade = Math.max(0, 1 - (anim.t - w * cfg.waveTime) / 0.6);
          fg.moveTo(X(pi.x), Y(pi.y)).lineTo(X(pj.x), Y(pj.y)).stroke({ width: 3, color: 0xffd98a, alpha: 0.8 * fade });
        }
      }
    }

    // HUD
    hover = mode === 'play' && !busy() && !autoplay ? pick(pointer.x, pointer.y) : null;
    ga.app.canvas.style.cursor = hover ? 'pointer' : 'default';
    const ign = sim.ignitionsLeft;
    tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">残りの星 ${sim.starsAlive()}</div><div style="font-size:13px;color:var(--dim)">最短 ${st.ignitions} 回</div>`;
    tr.innerHTML = `<div class="big" style="color:var(--gold)">${'✦'.repeat(Math.max(0, ign))}<span style="color:#444a7a">${'✧'.repeat(Math.max(0, sim.moves))}</span></div><div>点火 あと ${ign} 回</div><div>折り ${sim.folds.length} / ${sim.maxFolds}</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
  };

  // スマホ・タブレット：キーボードの代わりの画面ボタン
  const tbar = touchButtons([
    { label: '戻す', onPress: () => { if (mode === 'play') undoFold(); } },
    { label: 'ヒント', onPress: () => { if (mode === 'play') showHint(); } },
    { label: '‖', onPress: () => togglePause() },
  ], 'bottom', { landscape: true });

  const loop = new FixedLoop({
    update: () => {
      if (mode === 'play' && autoplay) botStep(1 / HZ);
    },
    render: (_a, realDt) => {
      juice.shakeScale = cfg.shake;
      juice.update(realDt, 1);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      particles.multiplier = cfg.particles;
      draw(realDt);
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const hook = installDebugHook('origami-cosmos', () => ({
    mode, stage: stageIndex, phase: sim?.phase, alive: sim?.starsAlive(), moves: sim?.moves, ignitionsLeft: sim?.ignitionsLeft, folds: sim?.folds.length, anim: anim?.k ?? null,
  }));
  hook.start = (i: number) => startStage(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  hook.sim = () => sim;
  hook.fold = (line: number, side: 1 | -1) => doFold({ line, side });
  hook.ignite = (i: number) => doIgnite(i);

  loop.start();
  if (params.has('stage')) startStage(Math.min(stages.length - 1, Number(params.get('stage')) || 0));
  else showTitle();
  hook.ready = true;
}

void main();
