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
import { Rng, fxRandom } from '@engine/rng';
import { skyTexture, makeStarfield } from '@engine/gfx';
import { injectBaseStyle, el, backLink, touchButtons, touchText } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type StopConfig } from './config';
import { stages } from './stages';
import { ruleCards } from '@engine/rules';
import { stoppedRules } from './rules';
import { randomPlan, runPlan, type Plan } from './bot';
import { StopSim, HZ, WORLD_W, WORLD_H, CRACK_RATIO, slingPower, type Action, type Obj } from './sim';

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
  /** 止めている間に溜めた力の合計（解放の演出の強さ） */
  let storedForce = 0;
  /** 解放の衝撃波の輪 */
  const shock: { x: number; y: number; age: number; r: number }[] = [];
  /** 速く飛ぶ物の軌跡 */
  const trails = new Map<number, { x: number; y: number }[]>();
  /** 引いている強さの段（音を鳴らす区切り） */
  let pullStep = 0;
  /** マウスの位置（つかめる物を光らせる） */
  let hover: { x: number; y: number } | null = null;
  let t = 0;
  /** ひねり1：壊した所から時間停止ゲージへ飛んでいく「時の粒」 */
  let refillFx: { x: number; y: number; age: number; amount: number }[] = [];
  /** ひびの知らせを出した時刻 */
  let crackToldAt = -99;
  let gaugeGlow = 0;

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
    crackToldAt = -99;
    stageTime = 0;
    synth.muffleMusic(false);
    pending = [];
    drag = null;
    refillFx = [];
    gaugeGlow = 0;
    botRng = new Rng(i + 7);
    botSearch = null;
    resultTimer = -1;
    mode = 'play';
    drawGround();
    toast(touchText(stages[i].hint, [['もう一度 Space で解放', '「解き放つ」で解放'], ['Space で時間を止め', '「時を止める」で時間を止め'], ['卵を引っぱって放す', '卵を指で引っぱって放す']]));
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
      <p style="font-size:13px">★：時間停止ゲージを多く残すほど高い（★3：半分以上　★2：2割以上）${Math.round(cfg.twist) % 2 === 1 ? '<br>壊して連鎖させると、ゲージが戻る' : ''}</p>
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
      <div class="rulebox"></div>
      <p style="font-size:13px">止めている間は、解き放った直後の動きが点線で見える。<br>
      ${Math.round(cfg.twist) % 2 === 1 ? '箱が壊れる・爆弾が弾けるたびに、<b style="color:#7ff0ff">止められる時間が少し戻る</b>。連鎖させるほど、もう一度止められる。' : ''}</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>Space</kbd> 時間を止める／戻す　物体を<b>つかんで引っぱり、放す</b>と逆向きに力（引くほど強い）<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：下の「時を止める」ボタン、物体を指で引っぱって放す</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(stoppedRules));
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
      menu.appendChild(ruleCards(stoppedRules));
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
    hover = toWorld(e);
    if (!drag) return;
    const w = toWorld(e);
    drag.ex = w.x;
    drag.ey = w.y;
  });
  window.addEventListener('pointerup', () => {
    if (!drag || !sim) return;
    pending.push(...dragAction(sim));
    drag = null;
  });

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    if (restart && mode === 'play' && key !== '*') toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('stopped');
  ga.setBloom(cfg.bloom);

  /**
   * 自動プレイ：まずランダム探索でクリアできる計画を探し（1フレームに少しずつ、世界は始めないで待つ）、
   * 見つかったら見せるための間（止めて1つずつ矢印を置き、少し眺めてから戻す）を入れて再生する。
   * 見つからなければ、数秒ごとに止めて軽く叩く簡単な動きにする。
   */
  let botSearch: { rng: Rng; tries: number; timeline: Record<number, Action[]> | null; done: boolean } | null = null;
  const BOT_TRIES = 400;
  const showPlan = (plan: Plan): Record<number, Action[]> => {
    const out: Record<number, Action[]> = {};
    let shift = 0;
    for (const k of Object.keys(plan.steps).map(Number).sort((a, b) => a - b)) {
      const acts = plan.steps[k];
      if (acts[0]?.t === 'stop') {
        out[k + shift] = [acts[0]];
        for (const a of acts.slice(1)) {
          shift += Math.round(HZ * 0.2);
          out[k + shift] = [a];
        }
        shift += Math.round(HZ * 0.35);
      } else out[k + shift] = acts;
    }
    return out;
  };
  /** 探索を少し進める。見つかるか諦めたら true（世界を進めてよい） */
  const botReady = (): boolean => {
    if (!sim) return false;
    if (!botSearch) botSearch = { rng: new Rng(stageIndex * 31 + 5), tries: 0, timeline: null, done: false };
    if (botSearch.done) return true;
    const t0 = performance.now();
    while (performance.now() - t0 < 10 && botSearch.tries < BOT_TRIES) {
      botSearch.tries++;
      const plan = randomPlan(sim.stage, cfg, botSearch.rng);
      if (runPlan(sim.stage, cfg, plan).phase === 'clear') {
        botSearch.timeline = showPlan(plan);
        botSearch.done = true;
        return true;
      }
    }
    if (botSearch.tries >= BOT_TRIES) botSearch.done = true;
    return botSearch.done;
  };

  /** 計画が見つからなかった時：数秒ごとに時間を止め、卵は巣の方へ、ほかは上へ、軽く叩いて戻す */
  const botActions = (s: StopSim): Action[] => {
    if (botSearch?.timeline) return botSearch.timeline[s.tick] ?? [];
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
          synth.muffleMusic(true);
          synth.tone(880, 0.5, { type: 'sine', vol: 0.12, slideTo: 220 });
          synth.chargeTone(-1);
          break;
        case 'resume': {
          synth.muffleMusic(false);
          // 激しく弾く：溜めていた力の合計（storedForce、1回いっぱい ≒ 21）で、光・揺れ・音・止まりの長さが変わる
          const I = Math.min(3, storedForce / 21);
          juice.doFlash(0.45 + 0.25 * Math.min(1, I), 0xfff3d6);
          juice.shake((0.1 + e.forces * 0.06 + 0.35 * I) * cfg.shake);
          if (I > 0.5) juice.hitstop(0.03 + 0.03 * Math.min(1, I));
          synth.whoosh(0.8 + e.forces * 0.2 + I * 0.6);
          if (I > 0.7) synth.boom(0.5 + 0.3 * Math.min(1, I), 1);
          synth.arp([0, 2, 4, 6].slice(0, 1 + Math.min(3, e.forces)), 0.04, 0.09);
          flashColor = 1;
          // 飛び出す物から、進む向きと逆へ光の粒が吹き出す（衝撃波）
          for (const o of sim.objs) {
            if (!o.alive || o.def.fixed) continue;
            const v = o.body.getLinearVelocity();
            const sp = Math.hypot(v.x, v.y);
            if (sp < 4) continue;
            const p = o.body.getPosition();
            const ang = Math.atan2(-v.y, -v.x);
            particles.emit(p.x * SCALE, p.y * SCALE, { count: Math.round(12 + sp * 2), speed: [60, 120 + sp * 18], life: [0.25, 0.7], size: [0.05, 0.16], color: [0xffd27f, 0xffffff], angle: ang, spread: 1.2, drag: 2 });
            shock.push({ x: p.x * SCALE, y: p.y * SCALE, age: 0, r: 30 + sp * 4 });
          }
          storedForce = 0;
          break;
        }
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
          if (e.kind === 'egg') toast(e.byCracks ? `卵が割れた — ひびが ${Math.round(cfg.eggHp)} つ入った` : e.speed ? `卵が割れた — ぶつかった速さ ${e.speed.toFixed(1)}（${cfg.eggBreak} を超えると1回で割れる）` : '卵が割れた');
          break;
        case 'crack':
          particles.emit(e.x * SCALE, e.y * SCALE, { count: 10, speed: [30, 120], life: [0.2, 0.5], size: [0.04, 0.1], color: [0xffffff, 0xff6b8a] });
          synth.noise(0.08, { vol: 0.08, from: 4000, to: 2000 });
          if (t - crackToldAt > 2.5) {
            const hp = Math.round(cfg.eggHp);
            toast(hp > 0
              ? `ひび ${e.damage}/${hp}！ ${hp - e.damage === 1 ? 'あと1回ぶつけると割れる' : `あと${hp - e.damage}回で割れる`}（速さ ${e.speed.toFixed(1)}、${cfg.eggBreak} 超えは1回で割れる）`
              : `ひび！ ぶつかった速さ ${e.speed.toFixed(1)} — ${cfg.eggBreak} を超えると割れる`);
            crackToldAt = t;
          }
          break;
        case 'refill':
          refillFx.push({ x: e.x * SCALE, y: e.y * SCALE, age: 0, amount: e.amount });
          synth.arp([7, 9, 11], 0.035, 0.07);
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


  /** 物体ごとに描き分ける（一目で何か分かるように） */
  const rot = (x: number, y: number, a: number, pts: number[][]) => {
    const c = Math.cos(a), s = Math.sin(a);
    return pts.flatMap(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
  };
  const ROCK = [1, 0.82, 0.95, 0.78, 1.05, 0.86, 0.92];
  const drawObject = (g: Graphics, o: Obj, x: number, y: number, a: number, stopped: boolean) => {
    const d = o.def;
    const R = d.w * SCALE;
    if (d.kind === 'egg') {
      const hp = Math.round(cfg.eggHp);
      const dmg = o.damage;
      const danger = hp > 0 && dmg >= hp - 1;
      // 卵の形（上が細い）。体と一緒に回る
      const shape: number[][] = [];
      for (let i = 0; i < 28; i++) {
        const th = (i / 28) * Math.PI * 2;
        const top = Math.cos(th) > 0;
        shape.push([Math.sin(th) * 0.92 * (top ? 0.86 + 0.14 * (1 - Math.cos(th)) : 1), -Math.cos(th) * (top ? 1.22 : 0.98)]);
      }
      const glow = danger ? 0xff6b8a : 0xffd27f;
      g.circle(x, y, R * 1.55).fill({ color: glow, alpha: danger ? 0.18 + 0.1 * Math.sin(t * 9) : 0.12 });
      g.poly(rot(x, y, a, shape.map(([u, v]) => [u * R, v * R]))).fill({ color: 0xe9cf9c }).stroke({ width: 2, color: glow });
      // 殻の模様：金の帯と小さな星
      const band = rot(x, y, a, [[-0.86 * R, 0.1 * R], [-0.45 * R, -0.08 * R], [0, 0.12 * R], [0.45 * R, -0.08 * R], [0.86 * R, 0.1 * R]]);
      g.moveTo(band[0], band[1]);
      for (let i = 2; i < band.length; i += 2) g.lineTo(band[i], band[i + 1]);
      g.stroke({ width: 3, color: 0xb8641e, alpha: 0.95 });
      for (const [u, v] of [[-0.35, -0.55], [0.3, -0.7], [0.1, 0.55]]) {
        const q = rot(x, y, a, [[u * R, v * R]]);
        g.star(q[0], q[1], 4, 3.4, 1.3).fill({ color: 0x8a4a9a, alpha: 0.95 });
      }
      const hl = rot(x, y, a, [[-0.32 * R, -0.5 * R]]);
      g.ellipse(hl[0], hl[1], R * 0.13, R * 0.24).fill({ color: 0xfff8e8, alpha: 0.7 });
      // ひび（傷みの数だけ、だんだん太く赤く）
      for (let k = 0; k < Math.min(6, dmg); k++) {
        const ca = a + k * 2.1;
        const pts = rot(x, y, ca, [[0, -0.98 * R], [0.2 * R, -0.55 * R], [-0.1 * R, -0.28 * R], [0.18 * R, 0.08 * R], [0.02 * R, 0.3 * R]]);
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.stroke({ width: 1.6 + k * 0.6, color: danger ? 0xd8324f : 0x9a4a2a, alpha: 0.95 });
      }
      // 傷みのゲージ：卵の上に殻の粒（無傷は白、ひびは赤い×）
      if (hp > 0) {
        const w = 13;
        for (let i = 0; i < hp; i++) {
          const px = x + (i - (hp - 1) / 2) * w, py = y - R * 1.9 - 6;
          if (i < dmg) {
            g.moveTo(px - 4, py - 4).lineTo(px + 4, py + 4).moveTo(px + 4, py - 4).lineTo(px - 4, py + 4).stroke({ width: 2.2, color: 0xff6b8a, cap: 'round' });
          } else g.ellipse(px, py, 4, 5).fill({ color: 0xfff6e0, alpha: 0.95 }).stroke({ width: 1, color: 0xffd27f });
        }
      }
      // 速さのゲージ：卵の周りの弧。割れる速さに近づくほど長く・赤く（ひびが入る速さに印）
      if (!stopped) {
        const v = o.body.getLinearVelocity();
        const lim = cfg.eggBreak * (sim?.eggInNest() ? Math.max(1, cfg.nestSoft) : 1);
        const ratio = Math.hypot(v.x, v.y) / lim;
        if (ratio > 0.25) {
          const col = ratio < CRACK_RATIO ? 0x7ff0ff : ratio < 1 ? 0xffd27f : 0xff4d6d;
          const rr = R * 1.7;
          g.moveTo(x, y - rr).arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ratio)).stroke({ width: 3, color: col, alpha: 0.85 });
          const ca = -Math.PI / 2 + Math.PI * 2 * CRACK_RATIO;
          g.circle(x + Math.cos(ca) * rr, y + Math.sin(ca) * rr, 2.5).fill({ color: 0xffffff, alpha: 0.7 });
          if (ratio >= 1) g.circle(x, y, rr + 4).stroke({ width: 1.5, color: 0xff4d6d, alpha: 0.5 + 0.5 * Math.sin(t * 20) });
        }
      }
    } else if (d.kind === 'bomb') {
      // 爆風の届く範囲（止めている間だけ、点線の輪）
      if (stopped) {
        const Rr = cfg.bombRadius * SCALE;
        for (let i = 0; i < 24; i += 2) g.moveTo(x + Math.cos((i / 24) * Math.PI * 2) * Rr, y + Math.sin((i / 24) * Math.PI * 2) * Rr).arc(x, y, Rr, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
        g.stroke({ width: 1.5, color: 0xffa3e0, alpha: 0.4 });
      }
      g.circle(x, y, R * 1.5).fill({ color: 0xff5a8a, alpha: o.armed ? 0.25 + 0.15 * Math.sin(t * 30) : 0.08 });
      g.circle(x, y, R).fill({ color: 0x2a2450 }).stroke({ width: 2, color: 0xffa3e0 });
      g.circle(x - R * 0.3, y - R * 0.35, R * 0.25).fill({ color: 0xffffff, alpha: 0.35 });
      // 口金と導火線（体と一緒に回る）
      const cap = rot(x, y, a, [[-0.28 * R, -0.85 * R], [0.28 * R, -0.85 * R], [0.28 * R, -1.15 * R], [-0.28 * R, -1.15 * R]]);
      g.poly(cap).fill({ color: 0x8a7ab8 });
      const fuse = rot(x, y, a, [[0, -1.15 * R], [0.25 * R, -1.5 * R], [0.55 * R, -1.55 * R], [0.75 * R, -1.85 * R]]);
      g.moveTo(fuse[0], fuse[1]).bezierCurveTo(fuse[2], fuse[3], fuse[4], fuse[5], fuse[6], fuse[7]).stroke({ width: 2, color: 0xd9c7a0 });
      const spark = 0.6 + 0.4 * Math.sin(t * (o.armed ? 30 : 8));
      g.star(fuse[6], fuse[7], 5, 4 + (o.armed ? 5 : 1) * spark, 1.5).fill({ color: 0xffd27f, alpha: 0.6 + 0.4 * spark });
    } else if (d.kind === 'ball') {
      g.circle(x, y, R * 1.6).fill({ color: 0x7ff0ff, alpha: 0.12 });
      g.circle(x, y, R).fill({ color: 0x3fb8d8, alpha: 0.9 }).stroke({ width: 2, color: 0xbff8ff });
      g.circle(x, y, R * 0.55).fill({ color: 0xbff8ff, alpha: 0.8 });
      const ring = rot(x, y, a, [[R * 0.75, 0]]);
      g.circle(ring[0], ring[1], 3).fill({ color: 0xffffff });
    } else if (d.kind === 'rock') {
      const pts = ROCK.map((k, i) => { const th = (i / ROCK.length) * Math.PI * 2; return [Math.cos(th) * R * k, Math.sin(th) * R * k]; });
      g.poly(rot(x, y, a, pts)).fill({ color: 0x4a4f6e }).stroke({ width: 2, color: 0x8a90b8 });
      const facet = rot(x, y, a, [[-0.5 * R, -0.3 * R], [0.1 * R, -0.6 * R], [0.2 * R, -0.1 * R]]);
      g.poly(facet).fill({ color: 0x6a7098, alpha: 0.8 });
      for (const [u, v] of [[0.35, 0.3], [-0.3, 0.35]]) { const q = rot(x, y, a, [[u * R, v * R]]); g.circle(q[0], q[1], 2).fill({ color: 0x2a2e48 }); }
    } else {
      const hw = (d.w / 2) * SCALE, hh = ((d.h ?? d.w) / 2) * SCALE;
      const box = rot(x, y, a, [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]);
      if (d.kind === 'crate') {
        // 木の箱：枠・板目・筋交い
        g.poly(box).fill({ color: 0x6a4088 }).stroke({ width: 2, color: 0xb894e0 });
        const i = 0.17;
        const inner = rot(x, y, a, [[-hw * (1 - i * 2), -hh * (1 - i * 2)], [hw * (1 - i * 2), -hh * (1 - i * 2)], [hw * (1 - i * 2), hh * (1 - i * 2)], [-hw * (1 - i * 2), hh * (1 - i * 2)]]);
        g.poly(inner).fill({ color: 0x4a2a66 }).stroke({ width: 1.5, color: 0x8a64b0, alpha: 0.8 });
        const br = rot(x, y, a, [[-hw * 0.66, hh * 0.66], [hw * 0.66, -hh * 0.66]]);
        g.moveTo(br[0], br[1]).lineTo(br[2], br[3]).stroke({ width: hw * 0.28, color: 0x7e56a6, cap: 'round' });
        for (const v of [-0.33, 0.33]) { const l = rot(x, y, a, [[-hw * 0.66, hh * v], [hw * 0.66, hh * v]]); g.moveTo(l[0], l[1]).lineTo(l[2], l[3]).stroke({ width: 1, color: 0x3a2050, alpha: 0.6 }); }
        // 釘
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = rot(x, y, a, [[u * hw * 0.82, v * hh * 0.82]]); g.circle(q[0], q[1], 2).fill({ color: 0xffe7a8 }); }
      } else {
        // 板：細長い板と木目
        g.poly(box).fill({ color: 0x3a4a8a }).stroke({ width: 2, color: 0x9fb8ff });
        for (const v of [-0.3, 0.3]) { const l = rot(x, y, a, [[-hw * 0.92, hh * v], [hw * 0.92, hh * v]]); g.moveTo(l[0], l[1]).lineTo(l[2], l[3]).stroke({ width: 1, color: 0x9fb8ff, alpha: 0.35 }); }
      }
    }
  };

  /** 物体の名前と性質の吹き出し：ステージの最初の数秒と、止めている間（種類ごとに1つ） */
  const LABEL: Record<string, () => string> = {
    egg: () => `卵 — 巣へ運ぶ。${Math.round(cfg.eggHp) > 0 ? `強くぶつけるとひび、${Math.round(cfg.eggHp)}つで割れる` : '強くぶつけると割れる'}`,
    crate: () => '箱 — 強くぶつけるか、爆風で壊れる',
    bomb: () => '爆弾 — 止めて叩くと、解放の瞬間に爆発（点線が届く範囲）',
    ball: () => '光の玉 — よく弾む。ほかの物にぶつけて使う',
    rock: () => '岩 — 重い。押しのけるには強い力',
    plank: () => '板 — 上に物を乗せて運べる',
  };
  const labelBox = el('div', { class: 'sw-labels' });
  labelBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3';
  document.body.appendChild(labelBox);
  const labelEls = new Map<string, HTMLElement>();
  let stageTime = 0;
  const updateLabels = (stopped: boolean) => {
    if (!sim) return;
    const intro = Math.max(0, 1 - Math.max(0, stageTime - 4.5) / 0.6);
    const show = mode === 'play' && !drag && (intro > 0 || stopped);
    const alpha = stopped ? Math.max(intro, 0.85) : intro;
    const seen = new Set<string>();
    const placed: { e: HTMLElement; x: number; y: number; w: number }[] = [];
    for (const o of sim.objs) {
      if (!o.alive || o.def.fixed || seen.has(o.def.kind)) continue;
      seen.add(o.def.kind);
      let e = labelEls.get(o.def.kind);
      if (!e) {
        e = el('div', { class: 'sw-label' });
        e.style.cssText = 'position:fixed;transform:translate(-50%,-100%);padding:4px 10px;border-radius:10px;font-size:12px;white-space:nowrap;color:#fff6e0;background:rgba(20,16,48,.78);border:1px solid rgba(255,210,127,.45);box-shadow:0 0 12px rgba(255,210,127,.25);transition:opacity .2s';
        labelBox.appendChild(e);
        labelEls.set(o.def.kind, e);
      }
      e.textContent = LABEL[o.def.kind]?.() ?? '';
      const p = o.body.getPosition();
      const r = (o.def.h ?? o.def.w) * (o.def.kind === 'egg' ? 2.4 : 1.2) + 0.35;
      const sc = { x: ga.root.x + p.x * SCALE * ga.scale, y: ga.root.y + (p.y - r) * SCALE * ga.scale };
      const w = e.offsetWidth || 200;
      placed.push({ e, x: Math.max(w / 2 + 6, Math.min(window.innerWidth - w / 2 - 6, sc.x)), y: sc.y, w });
      e.style.opacity = show ? String(alpha) : '0';
    }
    // 重ならないように：左から順に、前の吹き出しと重なれば上へずらす
    placed.sort((p1, p2) => p2.y - p1.y);
    const done: { x: number; y: number; w: number }[] = [];
    for (const q of placed) {
      let y = q.y;
      for (let k = 0; k < 8; k++) {
        const hit = done.find((d) => Math.abs(d.x - q.x) < (d.w + q.w) / 2 + 6 && Math.abs(d.y - y) < 28);
        if (!hit) break;
        y = hit.y - 30;
      }
      done.push({ x: q.x, y, w: q.w });
      q.e.style.left = `${q.x}px`;
      q.e.style.top = `${y}px`;
    }
    for (const [k, e] of labelEls) if (!seen.has(k)) e.style.opacity = '0';
  };

  const draw = (dt: number) => {
    t += dt;
    if (mode === 'play') stageTime += dt;
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
    // 溜めた力の合計（解放の瞬間の演出に使う）
    if (stopped) storedForce = sim.objs.reduce((acc, o) => acc + (o.alive ? Math.hypot(o.force.x, o.force.y) + (o.armed ? 10 : 0) : 0), 0);
    // 引いている強さ：引くほど高い音（4段）
    const pullK = drag && Math.round(cfg.control) === 0 ? Math.min(1, Math.hypot(drag.ex - drag.x, drag.ey - drag.y) / cfg.slingPull) : 0;
    const step = Math.floor(pullK * 4.999);
    if (drag && step !== pullStep) {
      if (step > pullStep) synth.tone(330 * Math.pow(1.26, step), 0.12, { type: 'triangle', vol: 0.05 + step * 0.015 });
      pullStep = step;
    }
    if (!drag) pullStep = 0;
    // 解放の衝撃波
    for (let i = shock.length - 1; i >= 0; i--) {
      const s0 = shock[i];
      s0.age += dt;
      const k = s0.age / 0.45;
      if (k >= 1) { shock.splice(i, 1); continue; }
      g.circle(s0.x, s0.y, 10 + s0.r * Math.sqrt(k)).stroke({ width: 6 * (1 - k), color: 0xfff3d6, alpha: 0.8 * (1 - k) });
    }
    // 速く飛ぶ物の光の尾
    for (const o of sim.objs) {
      if (!o.alive || o.def.fixed) { trails.delete(o.id); continue; }
      const p = o.body.getPosition(), v = o.body.getLinearVelocity();
      const tr = trails.get(o.id) ?? [];
      if (!stopped) {
        if (Math.hypot(v.x, v.y) > 6) tr.push({ x: p.x * SCALE, y: p.y * SCALE });
        else tr.shift();
        if (tr.length > 14) tr.shift();
      }
      trails.set(o.id, tr);
      for (let j = 1; j < tr.length; j++) {
        const f = j / tr.length;
        g.moveTo(tr[j - 1].x, tr[j - 1].y).lineTo(tr[j].x, tr[j].y).stroke({ width: 2 + 8 * f, color: o.def.kind === 'egg' ? 0xffd27f : 0xbfe8ff, alpha: 0.35 * f, cap: 'round' });
      }
    }
    for (const o of sim.objs) {
      if (!o.alive) continue;
      const p = o.body.getPosition();
      const a = o.body.getAngle();
      // 引いている物は、引くほど震える（力が溜まっていく手触り）
      const jit = drag && drag.id === o.id ? pullK * pullK * 3.5 : 0;
      const x = p.x * SCALE + (jit ? fxRandom(-jit, jit) : 0), y = p.y * SCALE + (jit ? fxRandom(-jit, jit) : 0);
      drawObject(g, o, x, y, a, stopped);
    }
    updateLabels(stopped);
    // つかめる物：マウスの下の物に輪（つかめる範囲の目安）
    if (!drag && hover && mode === 'play') {
      const h = pick(hover.x, hover.y);
      if (h) {
        const hp = h.body.getPosition();
        const hr = Math.max(h.def.w, h.def.h ?? h.def.w) * SCALE * (h.def.kind === 'crate' || h.def.kind === 'plank' ? 0.75 : 1.5) + 8;
        g.circle(hp.x * SCALE, hp.y * SCALE, hr + 2 * Math.sin(t * 6)).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
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
      if (o.alive && Math.round(cfg.control) === 1) arrow(ag, drag.x * SCALE, drag.y * SCALE, drag.ex * SCALE, drag.ey * SCALE, 0xffffff, 0.8);
      else if (o.alive) drawSling(ag, o);
    }
    if (stopped && cfg.predictSec > 0) drawPrediction(ag, sim);
    // 時の粒：壊した所で時計の輪が開き、粒がゲージ（右上）へ吸い込まれる
    const gx = VIEW_W - 70, gy = 18;
    for (const f of refillFx) {
      f.age += dt;
      const k = Math.min(1, f.age / 0.9);
      const ring = Math.min(1, f.age / 0.35);
      if (ring < 1) ag.circle(f.x, f.y, 12 + ring * 40).stroke({ width: 3, color: 0x7ff0ff, alpha: 1 - ring });
      for (let j = 0; j < 7; j++) {
        const kj = Math.max(0, Math.min(1, k * 1.25 - j * 0.04));
        const e2 = kj * kj * (3 - 2 * kj);
        const bend = Math.sin(kj * Math.PI) * (40 + j * 12);
        const x = f.x + (gx - f.x) * e2 + bend * 0.6;
        const y = f.y + (gy - f.y) * e2 - bend;
        if (kj < 1) ag.circle(x, y, 4 - j * 0.4).fill({ color: j % 2 ? 0xffffff : 0x7ff0ff, alpha: 0.9 - j * 0.08 });
      }
      if (k >= 1 && f.amount > 0) { gaugeGlow = 1; f.amount = 0; synth.hbell(9, 0.06); }
    }
    refillFx = refillFx.filter((f) => f.age < 1.1);
    gaugeGlow = Math.max(0, gaugeGlow - dt * 2);
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
    const barCol = gaugeGlow > 0 ? `rgb(${Math.round(127 + 128 * gaugeGlow)},240,255)` : stopped ? '#fff' : 'var(--accent)';
    tr.innerHTML = `<div class="gbar" style="font-family:monospace;letter-spacing:-1px;color:${barCol};text-shadow:0 0 ${Math.round(gaugeGlow * 14)}px #7ff0ff">${'█'.repeat(bar)}${'░'.repeat(20 - bar)}</div><div>時間停止 ${gauge.toFixed(1)} 秒　力 ${sim.forcesThisStop}/${Math.round(cfg.maxForces)}</div>${stopped ? '<div style="color:#fff">— 停止中 —</div>' : ''}${autoplay ? `<div style="color:var(--gold)">AUTO${botSearch && !botSearch.done ? `　計画を探索中 ${botSearch.tries}` : ''}</div>` : ''}${stopped && pred.some((q) => q.kind === 'egg' && q.ends === 'gone') ? '<div style="color:#ff6b8a">✕ このままだと卵が割れる</div>' : ''}`;
  };

  // 予測線：止めている間、「今戻したら最初の数秒どう動くか」を点線で見せる。
  // 置いた力やドラッグ中の矢印が変わった時だけ計算し直す
  let predKey = '';
  let pred: ReturnType<StopSim['predict']> = [];
  /**
   * ドラッグ中（放した時）の力。パチンコ式：引いた向きの逆へ、引いた長さに比例（slingPull で最大 slingMax 倍）。
   * ドラッグ式：ドラッグの向きに一定の力
   */
  const dragAction = (s: StopSim): Action[] => {
    if (!drag) return [];
    const dx = drag.ex - drag.x, dy = drag.ey - drag.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0.25) return [];
    const o = s.objs[drag.id];
    if (!o.alive) return [];
    const p = o.body.getPosition();
    if (Math.round(cfg.control) === 1) return [{ t: 'hit', id: drag.id, dx, dy, px: drag.x - p.x, py: drag.y - p.y }];
    const power = slingPower(len, cfg);
    return [{ t: 'hit', id: drag.id, dx: -dx, dy: -dy, px: 0, py: 0, power }];
  };
  const drawPrediction = (g: Graphics, s: StopSim) => {
    const extra = dragAction(s);
    const key = [s.stage.id, s.worldTick, s.tick === 0 ? 0 : 1, cfg.predictSec, ...s.objs.flatMap((o) => [o.force.x, o.force.y, o.armed ? 1 : 0]),
      ...extra.flatMap((a) => (a.t === 'hit' ? [a.id, Math.round(a.dx * 20), Math.round(a.dy * 20)] : []))].join(',');
    if (key !== predKey) {
      predKey = key;
      pred = s.predict(cfg.predictSec, 3, extra);
    }
    const phase = (t * 1.6) % 1;
    for (const p of pred) {
      const col = p.kind === 'egg' ? 0xffd27f : p.kind === 'crate' ? 0xc9a3ff : 0xbfe8ff;
      const n = p.pts.length;
      // 点：先へ行くほど淡く、流れるように明るさが動く
      for (let i = 1; i < n; i++) {
        const q = p.pts[i];
        const f = i / n;
        const wave = 0.5 + 0.5 * Math.cos((f * 4 - phase) * Math.PI * 2);
        g.circle(q.x * SCALE, q.y * SCALE, 2.2 + wave * 1.2).fill({ color: col, alpha: (1 - f * 0.75) * (0.35 + 0.45 * wave) });
      }
      // ひびが入る所：小さな赤いひびの印
      for (const c of p.cracks) {
        const cx = c.x * SCALE, cy = c.y * SCALE;
        g.moveTo(cx - 6, cy - 7).lineTo(cx - 1, cy - 1).lineTo(cx - 4, cy + 2).lineTo(cx + 5, cy + 7).stroke({ width: 2.5, color: 0xff6b8a, alpha: 0.9, cap: 'round' });
        g.circle(cx, cy, 10).stroke({ width: 1.5, color: 0xff6b8a, alpha: 0.5 });
      }
      const e = p.pts[n - 1];
      const ex = e.x * SCALE, ey = e.y * SCALE;
      if (p.ends === 'gone') {
        // 消える（割れる・壊れる・爆発）所に×
        const c2 = p.kind === 'egg' ? 0xff6b8a : 0xffa3e0;
        const big = p.kind === 'egg' ? 10 : 7;
        g.moveTo(ex - big, ey - big).lineTo(ex + big, ey + big).moveTo(ex + big, ey - big).lineTo(ex - big, ey + big).stroke({ width: 3, color: c2, alpha: 0.9, cap: 'round' });
        // 卵が割れる所は、脈打つ輪で目立たせる
        if (p.kind === 'egg') g.circle(ex, ey, 14 + 4 * Math.sin(t * 8)).stroke({ width: 2, color: 0xff6b8a, alpha: 0.6 });
      } else if (n > 1) g.circle(ex, ey, 5).stroke({ width: 2, color: col, alpha: 0.55 });
    }
  };

  /** パチンコ式で引いている間：物体から指へのゴム、引ける限界の輪、放した時に飛ぶ向きの金の矢印 */
  const drawSling = (g: Graphics, o: StopSim['objs'][number]) => {
    if (!drag) return;
    const p = o.body.getPosition();
    const ox = p.x * SCALE, oy = p.y * SCALE;
    let dx = drag.ex - drag.x, dy = drag.ey - drag.y;
    const len = Math.hypot(dx, dy);
    const lim = cfg.slingPull;
    if (len > lim) { dx *= lim / len; dy *= lim / len; }
    const k = Math.min(1, len / lim);
    // 限界の輪（いっぱいに引くと金色に光る）
    g.circle(ox, oy, lim * SCALE).stroke({ width: 1.5, color: k >= 1 ? 0xffd27f : 0x9fb8ff, alpha: k >= 1 ? 0.55 : 0.22 });
    // ゴム：物体の両側から指先へ
    const hx = ox + dx * SCALE, hy = oy + dy * SCALE;
    const nx = -dy / (Math.hypot(dx, dy) || 1), ny = dx / (Math.hypot(dx, dy) || 1);
    const w = 0.35 * SCALE;
    g.moveTo(ox + nx * w, oy + ny * w).lineTo(hx, hy).lineTo(ox - nx * w, oy - ny * w).stroke({ width: 2, color: 0xffffff, alpha: 0.35 + 0.4 * k });
    g.circle(hx, hy, 6).fill({ color: 0xffffff, alpha: 0.85 });
    if (len <= 0.25) return;
    // 飛ぶ向き（逆向き）。長さは溜まる力に比例（置いた力の矢印と同じ縮尺）
    const f = cfg.forcePerHit * slingPower(len, cfg) * 0.14 * SCALE;
    const ux = -dx / (Math.hypot(dx, dy) || 1), uy = -dy / (Math.hypot(dx, dy) || 1);
    // 物体の光に隠れないよう、縁から出す
    const r0 = 0.45 * SCALE;
    arrow(g, ox + ux * r0, oy + uy * r0, ox + ux * (r0 + f), oy + uy * (r0 + f), 0xffd27f, 0.95);
  };

  const arrow = (g: Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number) => {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 4, color, alpha, cap: 'round' });
    g.moveTo(x1 - ux * 14 - uy * 8, y1 - uy * 14 + ux * 8).lineTo(x1, y1).lineTo(x1 - ux * 14 + uy * 8, y1 - uy * 14 - ux * 8)
      .stroke({ width: 4, color, alpha, cap: 'round', join: 'round' });
  };

  // スマホ・タブレット：キーボードの代わりの画面ボタン
  const tbar = touchButtons([
    {
      label: '時を止める',
      onPress: () => { synth.unlock(); if (mode === 'play' && sim) pending.push(sim.stopped ? { t: 'resume' } : { t: 'stop' }); },
      state: () => ({ on: !!sim?.stopped, label: sim?.stopped ? '解き放つ' : '時を止める' }),
    },
    { label: '‖', onPress: () => togglePause() },
  ], 'bottom', { landscape: true });

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play' || !sim) return;
      const acts = pending;
      pending = [];
      if (autoplay && sim.phase === 'play') {
        // 計画を探している間は世界を始めない
        if (sim.tick === 0 && !botReady()) return;
        acts.push(...botActions(sim));
      }
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
      tbar.update();
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
  /** 世界の座標 → 画面の座標（e2e で物体をつかむため） */
  hook.toScreen = (x: number, y: number) => ({ x: ga.root.x + x * SCALE * ga.scale, y: ga.root.y + y * SCALE * ga.scale });

  loop.start();
  if (params.has('stage')) startStage(Math.min(stages.length - 1, Number(params.get('stage')) || 0));
  else showTitle();
  hook.ready = true;
}

void main();
