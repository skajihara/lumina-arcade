/**
 * Starsand — 星砂（描画・入力・画面遷移）。
 * シミュレーションは sim.ts（Pixi を使わない）。砂は小さなキャンバスに1マス1画素で描き、拡大して表示する。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite, Texture } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save } from '@engine/storage';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield } from '@engine/gfx';
import { injectBaseStyle, el, backLink, touchButtons, touchText } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type SandConfig } from './config';
import { stages } from './stages';
import { SandSim, W, H, SAND, LINE, WALL, COLORS, type SandEvent } from './sim';

const CELL = 5;
const VIEW_W = W * CELL;
const VIEW_H = H * CELL;
const HZ = 60;
const params = new URLSearchParams(location.search);

interface Progress {
  cleared: Record<string, number>;
}

/** 混ぜて作る色の材料（sim.ts の MIX と同じ組） */
const RECIPE: Record<number, [number, number]> = { 4: [0, 1], 3: [1, 2] };
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const tuning = createTuning<SandConfig>('starsand', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('starsand', { cleared: {} });

  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0a1026', '#020308', ['#1b4b6f', '#3b2a6e', '#1b5b4f']));
  const field = makeStarfield(VIEW_W, VIEW_H, 180, 51);
  // 砂の画素
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  const sandSprite = new Sprite(tex);
  sandSprite.scale.set(CELL);
  const cupG = new Graphics();
  const fxG = new Graphics();
  const particles = new Particles(3000);
  ga.world.addChild(sky, field.container, cupG, sandSprite, fxG, particles.container);

  // HUD
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  const toastEl = el('div', { class: 'toast' });
  center.append(toastEl);
  const hintEl = el('div');
  hintEl.style.cssText = 'position:absolute;left:50%;top:88px;transform:translateX(-50%);font-size:15px;color:var(--dim);letter-spacing:.06em;text-align:center;text-shadow:0 0 8px #000;width:50%';
  hud.append(tl, tr, center, hintEl);
  document.body.appendChild(hud);
  backLink();
  let toastTimer = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
  };

  let sim: SandSim | null = null;
  let stageIndex = 0;
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let t = 0;
  let resultAt = -1;
  // 線を引く：一筆ごとにマスを覚えて、Z で消せるように
  let drawing: { erase: boolean; last: { x: number; y: number } } | null = null;
  let strokes: number[][] = [];
  let cupGlow: number[] = [];
  /** 色つきの器の壁は、その色に染める（-1 はふつうの壁の色） */
  let wallTint = new Int32Array(W * H).fill(-1);
  const blend = (a: number, b: number, k: number) => {
    const x = rgb(a), y = rgb(b);
    return (Math.round(x[0] + (y[0] - x[0]) * k) << 16) | (Math.round(x[1] + (y[1] - x[1]) * k) << 8) | Math.round(x[2] + (y[2] - x[2]) * k);
  };
  /** 自動プレイ：解の線を少しずつ引く */
  let botLine = 0, botT = 0;

  const closeMenu = () => { menu?.remove(); menu = null; };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    sim = new SandSim(stages[i], cfg, i + 1);
    strokes = [];
    cupGlow = sim.stage.cups.map(() => 0);
    wallTint = new Int32Array(W * H).fill(-1);
    for (const c of sim.stage.cups) {
      if (c.color === undefined) continue;
      const tint = blend(0x5a5f9a, COLORS[c.color], 0.7);
      for (let y = c.y; y < Math.min(H, c.y + c.h + 2); y++) for (let x = Math.max(0, c.x - 2); x < Math.min(W, c.x + c.w + 2); x++) wallTint[y * W + x] = tint;
    }
    resultAt = -1;
    botLine = 0;
    botT = 0;
    mode = 'play';
    hintEl.textContent = touchText(stages[i].hint, [['ドラッグで線', 'なぞって線'], ['右ドラッグで消す', '「消しゴム」で消す']]);
    synth.setKey(i % 5);
  };

  /** 星評価：インクを多く残すほど高い（★3：半分以上　★2：2割以上） */
  const rating = (s: SandSim) => {
    if (s.phase !== 'clear') return 0;
    const left = s.ink / Math.max(1, s.inkMax);
    return left >= 0.5 ? 3 : left >= 0.2 ? 2 : 1;
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
      <p>${cleared ? `残りのインク ${Math.round((sim.ink / sim.inkMax) * 100)}%　こぼれた砂 ${sim.lost}` : '砂が尽きた — 器が満ちなかった'}</p>
      <p style="font-size:13px">★：インクを多く残すほど高い（★3：半分以上　★2：2割以上）</p>
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
      <h1>STARSAND</h1>
      <h2>星 砂</h2>
      <p>夜空から、光る砂が降ってくる。<br>
      指でなぞった線が砂の道になる。星座の器へ導いて満たせ。<br>
      違う色の砂が触れ合うと、混ざって新しい光になる。満ちた器は花火になって弾ける。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><b>ドラッグ</b>で線を引く　<b>右ドラッグ</b>で消す　<kbd>Z</kbd> 最後の線を消す<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：なぞって線を引く、下の「消しゴム」で消す側に切り替え</div>`;
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
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(52); startStage(i); };
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

  // ---- 線を引く ----
  const toCell = (cx: number, cy: number) => {
    const p = ga.toLogical(cx, cy);
    return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
  };
  /** 線を引いて、引いたマスを今の一筆に記録する */
  const drawSeg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (!sim) return;
    const before = sim.ink;
    const cells = sim.drawLineCells(a.x, a.y, b.x, b.y);
    if (strokes.length) strokes[strokes.length - 1].push(...cells);
    if (cells.length) synth.tone(900 + (b.y % 20) * 20, 0.05, { type: 'sine', vol: 0.015, wet: 0.3 });
    if (before > 0 && sim.ink <= 0) toast(touchText('インクが尽きた（右ドラッグか Z で消すと戻る）', [['右ドラッグか Z', '「消しゴム」か「戻す」']]));
  };
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play' || !sim || sim.phase !== 'play' || autoplay) return;
    const c = toCell(e.clientX, e.clientY);
    drawing = { erase: e.button === 2 || eraseMode, last: c };
    if (drawing.erase) sim.erase(c.x, c.y);
    else { strokes.push([]); drawSeg(c, c); }
  });
  window.addEventListener('pointermove', (e) => {
    if (!drawing || !sim) return;
    const c = toCell(e.clientX, e.clientY);
    if (drawing.erase) sim.erase(c.x, c.y);
    else drawSeg(drawing.last, c);
    drawing.last = c;
  });
  window.addEventListener('pointerup', () => { drawing = null; });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let eraseMode = false;
  const undoStroke = () => {
    if (!sim || !strokes.length) return;
    const cells = strokes.pop()!;
    sim.eraseCells(cells);
    synth.noise(0.15, { vol: 0.05, from: 3000, to: 800 });
  };

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyZ' && mode === 'play') undoStroke();
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    if (restart && mode === 'play' && key !== '*') toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  ga.setBloom(cfg.bloom);

  /** 自動プレイ：解の線を1本ずつ、少し間を置いて引く（検証と同じ線になるよう、1本はまとめて引く） */
  const botStep = (dt: number) => {
    if (!sim || sim.phase !== 'play') return;
    const flat = (sim.stage.solution ?? []).flatMap((line) => line.slice(1).map((b, i) => ({ a: line[i], b })));
    if (botLine >= flat.length) return;
    botT += dt;
    if (botT < 0.35) return;
    botT = 0;
    const seg = flat[botLine++];
    strokes.push([]);
    drawSeg(seg.a, seg.b);
  };

  const handle = (e: SandEvent) => {
    if (!sim) return;
    const st = sim.stage;
    switch (e.t) {
      case 'rain': {
        // 花火の雨：器の上の広い範囲へ、色の粒がきらめいて散る
        const c = st.cups[e.cup];
        const cx = (c.x + c.w / 2) * CELL, cy = (c.y - 24) * CELL;
        particles.emit(cx, cy, { count: 80, speed: [150, 500], angle: -Math.PI / 2, spread: 2.4, life: [0.5, 1.2], size: [0.04, 0.12], color: [COLORS[e.color], 0xffffff], gravity: 220, drag: 1 });
        break;
      }
      case 'fill': {
        // 器が満ちる：中の砂が花火になって弾ける
        const c = st.cups[e.cup];
        cupGlow[e.cup] = 1;
        const cx = (c.x + c.w / 2) * CELL, cy = (c.y + c.h / 2) * CELL;
        const col = c.color !== undefined ? COLORS[c.color] : 0xffffff;
        for (let k = 0; k < 3; k++) {
          const fx = cx + (k - 1) * c.w * CELL * 0.3, fy = cy - 120 - k * 30;
          particles.emit(fx, fy, { count: 90, speed: [80, 420], life: [0.8, 1.8], size: [0.05, 0.2], color: [col, 0xffffff, col], gravity: 160, drag: 1.2 });
        }
        particles.emit(cx, cy, { count: 60, speed: [100, 300], angle: -Math.PI / 2, spread: 0.8, life: [0.4, 1], size: [0.05, 0.15], color: [col, 0xffffff], drag: 1 });
        juice.shake(0.3 * cfg.shake);
        juice.doFlash(0.35, col);
        synth.boom(0.7, 4);
        synth.arp([0, 4, 7, 11, 14].map((n) => n + e.cup * 2), 0.06, 0.1);
        if (e.chain >= 2) {
          // 花火の雨から続けて満ちた：連鎖
          toast(`連鎖 ×${e.chain} — 器が満ちた（${sim.filled.filter(Boolean).length} / ${st.cups.length}）`);
          juice.slowmo(0.3, 0.8);
          synth.arp([7, 11, 14, 19].map((n) => n + e.chain), 0.05, 0.1);
        } else toast(`器が満ちた（${sim.filled.filter(Boolean).length} / ${st.cups.length}）`);
        break;
      }
      case 'mix': {
        if (Math.random() < 0.35) particles.emit(e.x * CELL, e.y * CELL, { count: 3, speed: [20, 80], life: [0.2, 0.5], size: [0.04, 0.08], color: [COLORS[e.color], 0xffffff] });
        break;
      }
      case 'clear':
        juice.slowmo(0.3, 1.2);
        juice.doFlash(0.6, 0xffe7a8);
        synth.arp([0, 2, 4, 5, 7, 9, 11, 12], 0.07, 0.11);
        for (let k = 0; k < 6; k++) particles.emit(VIEW_W * (0.15 + k * 0.14), VIEW_H * (0.2 + (k % 2) * 0.1), { count: 80, speed: [80, 380], life: [0.8, 1.8], size: [0.05, 0.2], color: COLORS, gravity: 120, drag: 1.2 });
        toast('夜空が満ちた');
        resultAt = t + 2.2;
        break;
      case 'fail':
        synth.tone(196, 1, { type: 'sine', vol: 0.15, slideTo: 60 });
        toast('砂が尽きた');
        resultAt = t + 1.5;
        break;
    }
  };

  // ---- 描画 ----
  const draw = (dt: number) => {
    t += dt;
    field.update(t);
    particles.update(dt);
    if (!sim) return;
    const s = sim;
    // 砂の画素：色ごとにきらめきを少し揺らす
    const d = img.data;
    const g = s.grid;
    const tick8 = Math.floor(t * 6);
    const wall = rgb(0x5a5f9a), line = rgb(0xdfe8ff);
    for (let i = 0; i < g.length; i++) {
      const v = g[i];
      const o = i * 4;
      if (v === 0) { d[o + 3] = 0; continue; }
      if (v === WALL) {
        const tw = wallTint[i];
        if (tw >= 0) { d[o] = (tw >> 16) & 255; d[o + 1] = (tw >> 8) & 255; d[o + 2] = tw & 255; d[o + 3] = 235; continue; }
        d[o] = wall[0]; d[o + 1] = wall[1]; d[o + 2] = wall[2]; d[o + 3] = 200; continue;
      }
      if (v === LINE) { d[o] = line[0]; d[o + 1] = line[1]; d[o + 2] = line[2]; d[o + 3] = 235; continue; }
      const c = rgb(COLORS[(v - SAND) % COLORS.length]);
      const h = ((i * 2654435761) ^ (tick8 * 40503)) >>> 0;
      const k = 0.72 + ((h >>> 24) / 255) * 0.42;
      d[o] = Math.min(255, c[0] * k); d[o + 1] = Math.min(255, c[1] * k); d[o + 2] = Math.min(255, c[2] * k); d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tex.source.update();

    // 器：星座の形の縁。満ちるほど内側が光る
    const cg = cupG;
    cg.clear();
    s.stage.cups.forEach((c, i) => {
      cupGlow[i] = Math.max(0, (cupGlow[i] ?? 0) - dt * 0.6);
      const x = c.x * CELL, y = c.y * CELL, w = c.w * CELL, h = c.h * CELL;
      const col = c.color !== undefined ? COLORS[c.color] : 0xfff3d6;
      const k = s.filled[i] ? 1 : Math.min(1, s.cupCount[i] / c.need);
      cg.rect(x, y + h * (1 - k), w, h * k).fill({ color: col, alpha: 0.08 + 0.1 * k + cupGlow[i] * 0.3 });
      // 縁の星と線
      const pts = [[x, y], [x, y + h], [x + w, y + h], [x + w, y]];
      for (let j = 0; j < 3; j++) cg.moveTo(pts[j][0], pts[j][1]).lineTo(pts[j + 1][0], pts[j + 1][1]);
      cg.stroke({ width: 2, color: col, alpha: s.filled[i] ? 0.9 : 0.45 });
      for (const [px, py] of pts) cg.circle(px, py, s.filled[i] ? 4 : 2.5).fill({ color: 0xffffff, alpha: s.filled[i] ? 1 : 0.7 });
      // 目盛り：どれだけ満ちたか
      if (!s.filled[i]) {
        const tw = Math.min(w, 60);
        cg.rect(x + w / 2 - tw / 2, y - 12, tw, 4).fill({ color: 0x2a2f5a, alpha: 0.8 });
        cg.rect(x + w / 2 - tw / 2, y - 12, tw * k, 4).fill({ color: col, alpha: 0.9 });
      }
      // 色つきの器：上に、その色の宝石（混ぜて作る色は「材料＋材料」も添える）
      if (c.color !== undefined && !s.filled[i]) {
        const gx = x + w / 2, gy = y - 30;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        cg.circle(gx, gy, 13 + pulse * 3).fill({ color: col, alpha: 0.12 + pulse * 0.08 });
        cg.poly([gx, gy - 9, gx + 7, gy, gx, gy + 9, gx - 7, gy]).fill({ color: col }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
        const parts = RECIPE[c.color];
        if (parts) {
          // 材料：宝石の左右に小さな粒を2つ
          cg.circle(gx - 20, gy, 4).fill({ color: COLORS[parts[0]] });
          cg.circle(gx + 20, gy, 4).fill({ color: COLORS[parts[1]] });
          cg.moveTo(gx - 15, gy).lineTo(gx - 10, gy).moveTo(gx + 10, gy).lineTo(gx + 15, gy).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
        }
      }
    });
    // 注ぎ口：残りの量で光る
    const fg = fxG;
    fg.clear();
    s.stage.sources.forEach((src, i) => {
      const left = Math.round(src.total * cfg.sandScale) - s.spawned[i];
      const x = src.x * CELL + CELL / 2, y = src.y * CELL;
      const a = left > 0 ? 0.6 + 0.3 * Math.sin(t * 5 + i) : 0.15;
      fg.circle(x, y, 10).fill({ color: COLORS[src.color], alpha: a * 0.35 });
      fg.circle(x, y, 4).fill({ color: 0xffffff, alpha: a });
    });

    // HUD
    const st = stages[stageIndex];
    const inkK = s.ink / Math.max(1, s.inkMax);
    const bar = Math.round(inkK * 20);
    tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">器 ${s.filled.filter(Boolean).length} / ${st.cups.length}</div><div style="font-size:13px;color:var(--dim)">残りの砂 ${s.remaining() + s.grains}</div>`;
    tr.innerHTML = `<div class="gbar" style="font-family:monospace;letter-spacing:-1px;color:var(--accent)">${'█'.repeat(bar)}${'░'.repeat(20 - bar)}</div><div>インク ${Math.round(inkK * 100)}%</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
  };

  // スマホ・タブレット：キーボードの代わりの画面ボタン
  const tbar = touchButtons([
    { label: '消しゴム', onPress: () => { eraseMode = !eraseMode; }, state: () => ({ on: eraseMode }) },
    { label: '戻す', onPress: () => { if (mode === 'play') undoStroke(); } },
    { label: '‖', onPress: () => togglePause() },
  ], 'bottom', { landscape: true });

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play' || !sim) return;
      if (autoplay && sim.tick === 0) {
        // 自動プレイ：砂が降り始める前に、解の線をなぞって引き終える
        botStep(1 / HZ);
        if (botLine < (sim.stage.solution ?? []).reduce((m, l) => m + l.length - 1, 0)) return;
      }
      for (let k = 0; k < Math.round(cfg.speed); k++) {
        sim.step();
        for (const e of sim.events) handle(e);
        if (sim.phase !== 'play') break;
      }
    },
    render: (_a, realDt) => {
      juice.shakeScale = cfg.shake;
      juice.update(realDt, 1);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      particles.multiplier = cfg.particles;
      draw(realDt);
      if (resultAt > 0 && t >= resultAt && mode === 'play') { resultAt = -1; showResult(); }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const hook = installDebugHook('starsand', () => ({
    mode, stage: stageIndex, phase: sim?.phase, ink: sim?.ink, cups: sim?.cupCount, filled: sim?.filled, lost: sim?.lost, grains: sim?.grains,
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
