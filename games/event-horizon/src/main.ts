/**
 * Event Horizon — 事象の地平クレーン（描画・入力・画面遷移）。
 * シミュレーションは sim.ts（Pixi を使わない）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Sprite } from 'pixi.js';
import { BulgePinchFilter } from 'pixi-filters';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save } from '@engine/storage';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, backLink } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type HorizonConfig } from './config';
import { stages } from './stages';
import { HorizonSim, HZ, WORLD_W, WORLD_H, IN_PULL, IN_BURST, type HorizonInput, type HorizonEvent } from './sim';
import { HorizonBot } from './bot';

const SCALE = 50;
const VIEW_W = WORLD_W * SCALE;
const VIEW_H = WORLD_H * SCALE;
const params = new URLSearchParams(location.search);

interface Progress {
  cleared: Record<string, number>;
}

const SHARD_COLOR = { dust: 0xbfe8ff, heavy: 0xffd27f };

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const tuning = createTuning<HorizonConfig>('event-horizon', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('event-horizon', { cleared: {} });

  // 描画の層：背景（重力レンズで歪む）・世界・前景
  const bgLayer = new Container();
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#140a26', '#03030c', ['#6a2a5e', '#2a3a8f', '#8a4a2a']));
  const field = makeStarfield(VIEW_W, VIEW_H, 220, 31);
  bgLayer.addChild(sky, field.container);
  const lens = new BulgePinchFilter({ radius: 150, strength: -0.5 });
  bgLayer.filters = [lens];
  const staticG = new Graphics();
  const goalG = new Graphics();
  const trailG = new Graphics();
  const shardLayer = new Container();
  const diskBackG = new Graphics();
  const holeG = new Graphics();
  const diskFrontG = new Graphics();
  const fxG = new Graphics();
  const particles = new Particles(2500);
  const dilateG = new Graphics();
  ga.world.addChild(bgLayer, staticG, goalG, trailG, diskBackG, shardLayer, holeG, diskFrontG, particles.container, fxG, dilateG);

  // HUD
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  const chainEl = el('div', { class: 'chain' });
  chainEl.style.opacity = '0';
  const toastEl = el('div', { class: 'toast' });
  center.append(chainEl, toastEl);
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
  let chainTimer = 0;
  const showChain = (n: number) => {
    chainEl.textContent = `${n} CHAIN`;
    chainEl.style.opacity = '1';
    chainEl.style.color = n >= 4 ? '#ffb3e6' : n >= 3 ? '#ffd98a' : '#fff';
    clearTimeout(chainTimer);
    chainTimer = window.setTimeout(() => (chainEl.style.opacity = '0'), 1400);
  };

  let sim: HorizonSim | null = null;
  let bot: HorizonBot | null = null;
  let stageIndex = 0;
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let resultTimer = -1;
  let t = 0;
  // 入力：マウスの位置（論理座標）・引く・解放
  const pointer = { x: VIEW_W / 2, y: VIEW_H / 3 };
  let pullDown = false;
  let burstQueued = false;
  const keys = new Set<string>();
  // かけらの見た目
  let shardSprites: { glow: Sprite; core: Sprite; trail: { x: number; y: number }[] }[] = [];
  const goalFlash: number[] = [];
  let burstRings: { x: number; y: number; r: number; age: number }[] = [];
  let whiteHole = 0;
  let lastInput: HorizonInput = { x: 0, y: 0, bits: 0 };

  const closeMenu = () => { menu?.remove(); menu = null; };

  const drawStatic = () => {
    if (!sim) return;
    const g = staticG;
    g.clear();
    const pits = [...(sim.stage.pits ?? [])].sort((a, b) => a[0] - b[0]);
    // 床（穴の部分は抜く）
    let x0 = 0;
    const floorY = WORLD_H * SCALE - 1;
    for (const [a, b] of pits) {
      if (a > x0) g.moveTo(x0 * SCALE, floorY).lineTo(a * SCALE, floorY);
      x0 = b;
    }
    if (x0 < WORLD_W) g.moveTo(x0 * SCALE, floorY).lineTo(VIEW_W, floorY);
    g.stroke({ width: 3, color: 0xb8a8ff, alpha: 0.7 });
    // 奈落：下から立ち上る暗い赤紫の光
    for (const [a, b] of pits) {
      for (let k = 0; k < 6; k++) {
        g.rect(a * SCALE, VIEW_H - 8 - k * 10, (b - a) * SCALE, 10).fill({ color: 0xff4f8a, alpha: 0.05 * (6 - k) / 6 });
      }
      g.moveTo(a * SCALE, VIEW_H).lineTo(a * SCALE, VIEW_H - 18).moveTo(b * SCALE, VIEW_H).lineTo(b * SCALE, VIEW_H - 18).stroke({ width: 2, color: 0xff7fae, alpha: 0.6 });
    }
    for (const line of sim.stage.walls ?? []) {
      g.moveTo(line[0].x * SCALE, line[0].y * SCALE);
      for (const p of line.slice(1)) g.lineTo(p.x * SCALE, p.y * SCALE);
      g.stroke({ width: 8, color: 0x9fb8ff, alpha: 0.12, cap: 'round' });
      g.moveTo(line[0].x * SCALE, line[0].y * SCALE);
      for (const p of line.slice(1)) g.lineTo(p.x * SCALE, p.y * SCALE);
      g.stroke({ width: 3, color: 0xc9d6ff, alpha: 0.85, cap: 'round' });
    }
  };

  /** かけらの見た目を作る（スコアアタックで増えた分だけ足す） */
  const buildShards = (reset = false) => {
    if (reset) {
      shardLayer.removeChildren();
      shardSprites = [];
    }
    if (!sim) return;
    for (const s of sim.shards.slice(shardSprites.length)) {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = SHARD_COLOR[s.kind];
      glow.scale.set((s.r * SCALE * 4) / 128);
      const core = new Sprite(glowTexture());
      core.anchor.set(0.5);
      core.tint = 0xffffff;
      core.scale.set((s.r * SCALE * 1.4) / 128);
      shardLayer.addChild(glow, core);
      shardSprites.push({ glow, core, trail: [] });
    }
  };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    sim = new HorizonSim(stages[i], cfg);
    bot = new HorizonBot(i + 3, 0.85);
    resultTimer = -1;
    burstRings = [];
    whiteHole = 0;
    goalFlash.length = 0;
    sim.stage.goals.forEach(() => goalFlash.push(0));
    mode = 'play';
    drawStatic();
    buildShards(true);
    synth.setKey(i % 5);
    toast(stages[i].hint);
  };

  /** 星評価：クリアで★1、かけらを1つも失わずに★2、1回の投げで（必要数か3つの少ない方）を連鎖して★3 */
  const ATTACK_STARS = [5000, 10000];
  const rating = (s: HorizonSim) => {
    if (s.phase !== 'clear') return 0;
    if (s.stage.attack) return 1 + ATTACK_STARS.filter((v) => s.score >= v).length;
    let r = 1;
    if (!s.shards.some((x) => x.state === 'lost')) r++;
    if (s.bestChain >= Math.min(s.need, 3)) r++;
    return r;
  };

  const showResult = () => {
    if (!sim) return;
    mode = 'result';
    synth.chargeTone(-1);
    const st = stages[stageIndex];
    const cleared = sim.phase === 'clear';
    const stars = rating(sim);
    if (cleared) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.write();
    }
    const lost = sim.shards.filter((x) => x.state === 'lost').length;
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${cleared ? 'CLEAR' : 'FAILED'}</h1><h2>${st.name}</h2>
      ${cleared ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>${cleared ? `スコア ${sim.score.toLocaleString()}　最大連鎖 ${sim.bestChain}　失ったかけら ${lost}` : sim.worldTime >= cfg.timeLimit ? '時間切れ' : 'かけらが足りなくなった'}</p>
      <p style="font-size:13px">${st.attack ? `★2：${ATTACK_STARS[0].toLocaleString()} 点　★3：${ATTACK_STARS[1].toLocaleString()} 点` : `★2：かけらを1つも失わない　★3：1回の投げで ${Math.min(sim.need, 3)} 連鎖`}</p>
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
    synth.chargeTone(-1);
    menu = el('div', { class: 'menu' });
    // スコアアタックは4ステージクリアで解放
    const clearedCount = stages.filter((x) => save.data.cleared[x.id] !== undefined).length;
    const unlocked = (i: number) => i === 0 || params.has('all') || (stages[i].attack ? clearedCount >= 4 : save.data.cleared[stages[i - 1].id] !== undefined);
    menu.innerHTML = `
      <h1>EVENT HORIZON</h1>
      <h2>事 象 の 地 平 ク レ ー ン</h2>
      <p>爪の代わりに、小さなブラックホール。<br>引き寄せたかけらは輪に乗って周回する。<br>
      速く動かしすぎると、地平の内へ落ちて消える。<br>地平のそばでは時間が遅れる。<br>
      星座の穴には近づけない — 輪ごと運んで<b style="color:var(--ink)">解放</b>で投げ入れろ。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys">マウスで動かす　<b>クリックしている間</b> 引き寄せる　<kbd>Space</kbd>／右クリック 解放<br>
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
        `<b>${st.attack ? '∞' : i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(49); startStage(i); };
      grid.appendChild(d);
    });
    document.body.appendChild(menu);
  };

  const togglePause = () => {
    if (mode === 'play') {
      mode = 'pause';
      synth.chargeTone(-1);
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
    keys.add(e.code);
    if (e.code === 'Space' && mode === 'play') {
      e.preventDefault();
      burstQueued = true;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  const setPointer = (cx: number, cy: number) => {
    const p = ga.toLogical(cx, cy);
    pointer.x = p.x;
    pointer.y = p.y;
  };
  window.addEventListener('pointermove', (e) => setPointer(e.clientX, e.clientY));
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    setPointer(e.clientX, e.clientY);
    if (e.button === 2) burstQueued = true;
    else pullDown = true;
  });
  window.addEventListener('pointerup', (e) => { if (e.button !== 2) pullDown = false; });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // タッチ：2本目の指で解放
  ga.app.canvas.addEventListener('touchstart', (e) => { if (e.touches.length >= 2) burstQueued = true; }, { passive: true });

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    if (restart && mode === 'play' && key !== '*') toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  ga.setBloom(cfg.bloom);

  const handle = (e: HorizonEvent) => {
    if (!sim) return;
    switch (e.t) {
      case 'burst': {
        whiteHole = 1;
        burstRings.push({ x: e.x * SCALE, y: e.y * SCALE, r: e.r * SCALE, age: 0 });
        juice.doFlash(0.35 + Math.min(0.4, e.n * 0.08), 0xfff6e8);
        juice.shake((0.2 + e.n * 0.07) * cfg.shake);
        if (e.n >= 2) juice.hitstop(0.05);
        synth.boom(0.6 + e.n * 0.1, 3);
        synth.whoosh(1 + e.n * 0.2);
        particles.emit(e.x * SCALE, e.y * SCALE, { count: 60 + e.n * 25, speed: [120, 700], life: [0.4, 1.1], size: [0.05, 0.22], color: [0xffffff, 0xfff0c8, 0xbfe8ff], drag: 2 });
        if (e.n >= 3) toast(`ホワイトホール ×${e.n}`);
        break;
      }
      case 'capture': {
        goalFlash[e.goal] = 1;
        const col = e.chain >= 4 ? [0xffb3e6, 0xffffff] : e.chain >= 2 ? [0xffd98a, 0xffffff] : [0xbfe8ff, 0xffffff];
        particles.emit(e.x * SCALE, e.y * SCALE, { count: 40 + e.chain * 15, speed: [60, 420], life: [0.5, 1.3], size: [0.05, 0.2], color: col, drag: 1.6 });
        synth.hbell(4 + e.chain * 2, 0.12, 1.4);
        if (e.chain >= 2) {
          showChain(e.chain);
          juice.slowmo(0.4, 0.6 + e.chain * 0.15);
          synth.arp([0, 2, 4, 7, 9].slice(0, Math.min(5, e.chain + 1)).map((n) => n + e.chain), 0.05, 0.08);
        }
        juice.shake(0.08 * cfg.shake);
        break;
      }
      case 'swallow': {
        // 地平へ引き込まれる光の筋
        const bx = sim.bh.x * SCALE, by = sim.bh.y * SCALE;
        const ang = Math.atan2(by - e.y * SCALE, bx - e.x * SCALE);
        particles.emit(e.x * SCALE, e.y * SCALE, { count: 30, speed: [200, 420], angle: ang, spread: 0.6, life: [0.12, 0.25], size: [0.04, 0.12], color: [0xffb36b, 0xff6b8a], drag: 0 });
        synth.tone(180, 0.9, { type: 'sine', vol: 0.16, slideTo: 40 });
        juice.shake(0.15 * cfg.shake);
        toast('地平の向こうへ…');
        break;
      }
      case 'spawn':
        buildShards();
        break;
      case 'fall':
        synth.tone(300, 0.6, { type: 'triangle', vol: 0.08, slideTo: 90 });
        toast('奈落へ落ちた');
        break;
      case 'clear':
        juice.slowmo(0.2, 1.6);
        juice.doFlash(0.7, 0xffe7a8);
        synth.arp([0, 2, 4, 5, 7, 9, 11], 0.07, 0.11);
        synth.chargeTone(-1);
        toast('星座がそろった');
        resultTimer = sim.tick + Math.round(HZ * 2);
        break;
      case 'fail':
        synth.tone(196, 1, { type: 'sine', vol: 0.15, slideTo: 60 });
        synth.chargeTone(-1);
        if (e.why === 'time') toast('時間切れ');
        resultTimer = sim.tick + Math.round(HZ * 1.5);
        break;
      default:
        break;
    }
  };

  const readInput = (s: HorizonSim): HorizonInput => {
    if (autoplay && bot) return bot.input(s);
    // キーボードでも動かせる（矢印・WASD）
    const kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    const ky = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
    if (kx || ky) {
      pointer.x = Math.min(VIEW_W, Math.max(0, pointer.x + kx * 7));
      pointer.y = Math.min(VIEW_H, Math.max(0, pointer.y + ky * 7));
    }
    let bits = 0;
    if (pullDown || keys.has('ShiftLeft') || keys.has('KeyZ')) bits |= IN_PULL;
    if (burstQueued) bits |= IN_BURST;
    burstQueued = false;
    return { x: pointer.x / SCALE, y: pointer.y / SCALE, bits };
  };

  // 降着円盤：ブラックホールの周りの傾いた光の輪。奥の半分は穴の後ろ、手前の半分は前に描く
  const drawDisk = (g: Graphics, front: boolean, bx: number, by: number, glow: number) => {
    const R = cfg.ringR * SCALE;
    const tilt = 0.32;
    const spin = t * (1.2 + glow * 2.5);
    for (let band = 0; band < 3; band++) {
      const rr = R * (0.75 + band * 0.22);
      const col = band === 0 ? 0xfff0c8 : band === 1 ? 0xffb36b : 0xff6b8a;
      const a = (0.18 + glow * 0.35) * (1 - band * 0.25);
      const from = front ? 0 : Math.PI, to = front ? Math.PI : Math.PI * 2;
      const n = 28;
      g.moveTo(bx + Math.cos(from) * rr, by + Math.sin(from) * rr * tilt);
      for (let k = 1; k <= n; k++) {
        const th = from + ((to - from) * k) / n;
        g.lineTo(bx + Math.cos(th) * rr, by + Math.sin(th) * rr * tilt);
      }
      g.stroke({ width: 5 - band, color: col, alpha: a });
      // 流れる光の粒
      for (let k = 0; k < 5; k++) {
        const th = spin * (1 + band * 0.3) + (k * Math.PI * 2) / 5 + band;
        const s = Math.sin(th);
        if ((s > 0) !== front) continue;
        g.circle(bx + Math.cos(th) * rr, by + s * rr * tilt, 2.2).fill({ color: 0xffffff, alpha: 0.35 + glow * 0.5 });
      }
    }
  };

  const draw = (dt: number) => {
    t += dt;
    field.update(t);
    if (!sim) return;
    particles.update(dt);
    const s = sim;
    const bx = s.bh.x * SCALE, by = s.bh.y * SCALE;
    const hr = cfg.horizon * SCALE;
    const pulling = s.pulling;
    const orbiting = s.shards.filter((x) => x.state === 'free' && Math.hypot(x.body.getPosition().x - s.bh.x, x.body.getPosition().y - s.bh.y) < cfg.ringR * 1.6).length;

    // 重力レンズ：ブラックホールの周りの背景が引き込まれて歪む
    lens.centerX = s.bh.x / WORLD_W;
    lens.centerY = s.bh.y / WORLD_H;
    lens.radius = (90 + cfg.horizon * 120 + (pulling ? 40 : 0)) * ga.scale;
    lens.strength = whiteHole > 0 ? 0.45 * whiteHole : pulling ? -0.75 : -0.45;

    // 星座の穴：暗い穴の縁を小さな星が回る。寄せつけない範囲は淡い点線
    const gg = goalG;
    gg.clear();
    s.stage.goals.forEach((g, i) => {
      goalFlash[i] = Math.max(0, (goalFlash[i] ?? 0) - dt * 1.5);
      const x = g.x * SCALE, y = g.y * SCALE, r = g.r * SCALE;
      const guard = (g.r + cfg.goalGuard) * SCALE;
      const n = Math.max(12, Math.floor(guard / 7));
      for (let k = 0; k < n; k += 2) {
        const a0 = (k / n) * Math.PI * 2 + t * 0.1, a1 = ((k + 1) / n) * Math.PI * 2 + t * 0.1;
        gg.moveTo(x + Math.cos(a0) * guard, y + Math.sin(a0) * guard).lineTo(x + Math.cos(a1) * guard, y + Math.sin(a1) * guard);
      }
      gg.stroke({ width: 1.2, color: 0xffd98a, alpha: 0.18 });
      gg.circle(x, y, r * 1.25).fill({ color: 0xffd98a, alpha: 0.05 + goalFlash[i] * 0.25 });
      gg.circle(x, y, r).fill({ color: 0x05040e, alpha: 0.85 }).stroke({ width: 2, color: 0xffd98a, alpha: 0.55 + goalFlash[i] * 0.45 });
      for (let k = 0; k < 6; k++) {
        const a = t * 0.6 + (k * Math.PI * 2) / 6 + i;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        gg.circle(px, py, 2.6 + goalFlash[i] * 3).fill({ color: 0xfff3d6, alpha: 0.9 });
        const b = a + (Math.PI * 2) / 6;
        gg.moveTo(px, py).lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r).stroke({ width: 1, color: 0xffd98a, alpha: 0.35 });
      }
    });

    // かけらと軌跡
    const tg = trailG;
    tg.clear();
    s.shards.forEach((sh, i) => {
      const sv = shardSprites[i];
      if (!sv) return;
      if (sh.state !== 'free') {
        sv.glow.visible = sv.core.visible = false;
        sv.trail.length = 0;
        return;
      }
      const p = sh.body.getPosition();
      const x = p.x * SCALE, y = p.y * SCALE;
      sv.glow.x = sv.core.x = x;
      sv.glow.y = sv.core.y = y;
      const d = Math.hypot(p.x - s.bh.x, p.y - s.bh.y);
      const hot = Math.max(0, 1 - (d - cfg.horizon) / (cfg.dilateRange + 0.6));
      sv.glow.alpha = 0.7 + 0.3 * Math.sin(t * 5 + i);
      sv.glow.tint = hot > 0.5 ? 0xffb36b : SHARD_COLOR[sh.kind];
      sv.trail.push({ x, y });
      if (sv.trail.length > 18) sv.trail.shift();
      for (let k = 1; k < sv.trail.length; k++) {
        const a = sv.trail[k - 1], b = sv.trail[k];
        tg.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1 + (k / sv.trail.length) * sh.r * SCALE * 0.5, color: SHARD_COLOR[sh.kind], alpha: (k / sv.trail.length) * 0.45 });
      }
    });

    // ブラックホール
    whiteHole = Math.max(0, whiteHole - dt * 1.6);
    const glow = pulling ? Math.min(1, 0.45 + orbiting * 0.15) : 0.12;
    diskBackG.clear();
    diskFrontG.clear();
    holeG.clear();
    drawDisk(diskBackG, false, bx, by, glow);
    // 引く範囲と輪
    if (pulling) {
      diskBackG.circle(bx, by, cfg.bhReach * SCALE).stroke({ width: 1, color: 0xffb36b, alpha: 0.08 + 0.04 * Math.sin(t * 4) });
      diskBackG.circle(bx, by, cfg.ringR * SCALE).stroke({ width: 1, color: 0xfff0c8, alpha: 0.12 });
    }
    holeG.circle(bx, by, hr * 2.2).fill({ color: 0x000000, alpha: 0.35 });
    holeG.circle(bx, by, hr).fill({ color: whiteHole > 0 ? 0xffffff : 0x000000, alpha: whiteHole > 0 ? 0.6 + whiteHole * 0.4 : 1 });
    holeG.circle(bx, by, hr + 2).stroke({ width: 2.5, color: 0xfff0c8, alpha: 0.65 + glow * 0.35 });
    holeG.circle(bx, by, hr + 6).stroke({ width: 4, color: 0xffb36b, alpha: 0.12 + glow * 0.2 });
    if (s.cooldown > 0) holeG.circle(bx, by, hr + 10).stroke({ width: 2, color: 0xffffff, alpha: Math.min(1, s.cooldown / cfg.burstCooldown) * 0.6 });
    drawDisk(diskFrontG, true, bx, by, glow);
    // 解放の衝撃波の輪
    const fg = fxG;
    fg.clear();
    burstRings = burstRings.filter((b) => (b.age += dt) < 0.6);
    for (const b of burstRings) {
      const k = b.age / 0.6;
      fg.circle(b.x, b.y, b.r * (0.3 + 0.9 * k)).stroke({ width: 10 * (1 - k) + 1, color: 0xfff6e8, alpha: 0.7 * (1 - k) });
    }
    // 目標位置（自分で動かしている時だけ）
    if (!autoplay && mode === 'play') fg.circle(pointer.x, pointer.y, 5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });

    // 時間の遅れ：画面の縁が青く沈む
    const dil = 1 - s.timeScale;
    dilateG.clear();
    if (dil > 0.05) {
      for (let k = 0; k < 4; k++) {
        const m = 10 + k * 16;
        dilateG.rect(m, m, VIEW_W - m * 2, VIEW_H - m * 2).stroke({ width: 18, color: 0x4a6aff, alpha: dil * 0.12 * (4 - k) / 4 });
      }
    }

    // 引く音：周回しているかけらが多いほど高く
    if (mode === 'play' && pulling) synth.chargeTone(Math.min(1, 0.15 + orbiting * 0.17));
    else synth.chargeTone(-1);

    // HUD
    const st = stages[stageIndex];
    const left = Math.max(0, cfg.timeLimit - s.worldTime);
    tl.innerHTML = `<div>${st.attack ? '∞' : stageIndex + 1}. ${st.name}</div><div class="big">穴へ ${s.captured}${st.attack ? '' : ` / ${s.need}`}</div><div style="font-size:13px;color:var(--dim)">残りのかけら ${s.free().length}</div>`;
    tr.innerHTML = `<div class="big">${s.score.toLocaleString()}</div><div>残り ${left.toFixed(0)} 秒</div>${dil > 0.08 ? `<div style="color:#9fb8ff">時間の遅れ ×${s.timeScale.toFixed(2)}</div>` : ''}${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
  };

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play' || !sim) return;
      lastInput = readInput(sim);
      sim.step(lastInput);
      for (const e of sim.events) handle(e);
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
      particles.multiplier = cfg.particles;
      draw(realDt);
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  const hook = installDebugHook('event-horizon', () => ({
    mode, stage: stageIndex, phase: sim?.phase, captured: sim?.captured, need: sim?.need, score: sim?.score,
    timeScale: sim?.timeScale, free: sim?.free().length, bestChain: sim?.bestChain, input: lastInput,
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
