/**
 * Echo Loop：画面遷移・HUD・入力。
 * 盤面の描画は Nova Pinball の NovaView をそのまま使い、その上に「残響の軌跡」と「ループの時計」を重ねる。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Input } from '@engine/input';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save } from '@engine/storage';
import { lerpColor } from '@engine/gfx';
import { injectBaseStyle, el, backLink, touchButtons } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type EchoConfig } from './config';
import { stages } from './stages';
import { ruleCards } from '@engine/rules';
import { echoRules } from './rules';
import { EchoSim, echoBias } from './sim';
import { HZ, type SimEvent } from '../../nova-pinball/src/sim';
import { NovaView, VIEW_H, VIEW_W, SCALE, chainTier } from '../../nova-pinball/src/view';
import { NovaBot } from '../../nova-pinball/src/bot';

interface Progress {
  cleared: Record<string, number>; // ステージID → 星評価(1-3)
  /** ステージID → クリアに使った最少ループ数 */
  best: Record<string, number>;
}

const params = new URLSearchParams(location.search);
const STAGE_KEYS = [2, 7, -3, 4, -5, 0, 5, -2, 3, -4];
/** 何ループ前の残響か（0=今）で色を変える：今は白、古いほど紫へ、淡く */
const echoColor = (age: number) => (age === 0 ? 0xffffff : lerpColor(0x9fe8ff, 0x9a7dff, Math.min(1, (age - 1) / 4)));
const echoAlpha = (age: number) => (age === 0 ? 1 : Math.max(0.35, 0.85 - age * 0.1));
const PATH_EVERY = 4;

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const worldMask = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff });
  ga.root.addChild(worldMask);
  ga.world.mask = worldMask;
  const tuning = createTuning<EchoConfig>('echo-loop', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('echo-loop', { cleared: {}, best: {} });
  const input = new Input({
    left: { keys: ['ArrowLeft', 'KeyZ', 'ShiftLeft', 'KeyA'], touch: { x0: 0, y0: 0.5, x1: 0.5, y1: 1 } },
    right: { keys: ['ArrowRight', 'Slash', 'ShiftRight', 'KeyL'], touch: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 } },
    launch: { keys: ['Space', 'ArrowDown', 'Enter'], touch: { x0: 0, y0: 0, x1: 1, y1: 0.5 } },
  });

  // HUD
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const tr = el('div', { class: 'tr' });
  const center = el('div', { class: 'center' });
  const chainEl = el('div', { class: 'chain' });
  const toastEl = el('div', { class: 'toast' });
  center.append(chainEl, toastEl);
  hud.append(tl, tr, center);
  document.body.appendChild(hud);
  backLink();
  let toastTimer = 0;
  const hudApi = {
    chain(n: number) {
      if (n >= 2) {
        chainEl.textContent = `${n} CHAIN`;
        chainEl.style.opacity = '1';
        chainEl.style.transform = `scale(${1 + Math.min(0.6, n * 0.04)})`;
        const tier = chainTier(n);
        chainEl.style.color = ['#e6dcff', '#ffd27f', '#ffa3e0', '#ffffff'][tier];
      } else chainEl.style.opacity = '0';
    },
    toast(msg: string) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
    },
  };

  let es: EchoSim | null = null;
  let view: NovaView | null = null;
  const overlay = new Graphics();
  let stageIndex = 0;
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let bot = new NovaBot(1, 0.85);
  let resultTimer = -1;
  /** 今のループの各ボールの軌跡（持ち主ごと、PATH_EVERY ティックおき） */
  let paths: { x: number; y: number }[][] = [];
  /** 前のループの軌跡（残響が「本来たどるはずの道」） */
  let prevPaths: { x: number; y: number }[][] = [];
  /** このループで過去が書き換わった残響 */
  const rewritten = new Set<number>();
  let rewindFx = 0;

  const closeMenu = () => { menu?.remove(); menu = null; };

  const attachView = () => {
    if (!es) return;
    // 重ね絵はカメラ（ズーム）と一緒に動くよう view の中に入れる。view を壊す前に外す
    if (view) {
      view.container.removeChild(overlay);
      view.destroy();
    }
    view = new NovaView(es.sim, juice, cfg, hudApi);
    const cur = es.loop;
    view.ballStyle = (b) => ({ tint: echoColor(cur - b.owner), alpha: echoAlpha(cur - b.owner) });
    // 残響の当たり音は、古いほど小さく遠く
    view.soundScale = (owner) => (owner === cur ? 1 : Math.max(0.25, 0.6 - (cur - owner) * 0.08));
    view.container.addChild(overlay);
    ga.world.removeChildren();
    ga.world.addChild(view.container);
  };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    es = new EchoSim(stages[i], cfg);
    paths = [];
    prevPaths = [];
    rewritten.clear();
    finaleT = -1;
    attachView();
    hudApi.chain(0);
    hudApi.toast(stages[i].hint);
    mode = 'play';
    resultTimer = -1;
    bot = new NovaBot(i + 1, 0.85);
    bot.bias = echoBias(es);
    synth.setKey(STAGE_KEYS[i % STAGE_KEYS.length]);
  };

  /** 星評価：少ないループでクリアするほど高い */
  const rating = (loopsUsed: number) => {
    const max = es?.maxLoops ?? Math.round(cfg.maxLoops);
    return loopsUsed <= max - 3 ? 3 : loopsUsed <= max - 2 ? 2 : 1;
  };

  const showResult = () => {
    if (!es) return;
    mode = 'result';
    hudApi.chain(0);
    const st = stages[stageIndex];
    const cleared = es.phase === 'clear';
    const used = es.loop + 1;
    const stars = cleared ? rating(used) : 0;
    if (cleared) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.data.best[st.id] = Math.min(save.data.best[st.id] ?? 99, used);
      save.write();
    }
    const total = st.stars.length;
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${cleared ? 'LOOP CLEAR' : 'TIME OUT'}</h1>
      <h2>${st.name}</h2>
      ${cleared ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>${cleared ? `${used} ループ目で、${used} 人の自分が同じ ${cfg.loopSec} 秒に全部の星を燃やした` : `1ループで壊せた最多 <b style="color:var(--ink)">${es.best} / ${total}</b>`}</p>
      <p style="font-size:13px">★：少ないループでクリアするほど高い（★3：${es.maxLoops - 3}ループ以内　★2：${es.maxLoops - 2}ループ以内）</p>
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
      <h1>ECHO LOOP</h1>
      <h2>残 響 ル ー プ</h2>
      <div class="rulebox"></div>
      <p style="font-size:13px">残響にぶつかると、過去が書き換わる。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>←</kbd>/<kbd>Z</kbd> 左フリッパー　<kbd>→</kbd>/<kbd>/</kbd> 右フリッパー　<kbd>Space</kbd> 長押しで発射<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>フリッパーはループごとに自分専用（過去の自分のフリッパーは淡い紫の影）<br>スマホ：画面の左下／右下でフリッパー、上半分で発射</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(echoRules(cfg.loopSec)));
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
        `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>${best ? `<span style="display:block;font-size:11px;color:var(--accent)">${best}ループ</span>` : ''}`);
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(); startStage(i); };
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
      menu.appendChild(ruleCards(echoRules(cfg.loopSec)));
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
    }
  };

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  window.addEventListener('pointerdown', () => synth.unlock());

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    if (restart && mode === 'play' && key !== '*') hudApi.toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  ga.setBloom(cfg.bloom);

  /** 全員そろって燃やしきった瞬間：残響ひとりひとりから光が弾け、和音が人数分だけ積み上がる */
  let finaleT = -1;
  const onAllClear = () => {
    if (!es || !view) return;
    const n = es.loop + 1;
    finaleT = 0;
    juice.slowmo(0.12, 2.6);
    juice.doFlash(0.8, 0xffe7a8);
    for (const b of es.sim.balls) {
      const p = b.body.getPosition();
      const age = es.loop - b.owner;
      view.particles.emit(p.x * SCALE, p.y * SCALE, { count: 90, speed: [60, 700], life: [0.8, 2.2], size: [0.06, 0.34], color: [echoColor(age), 0xffe7a8, 0xffffff], drag: 1.2 });
    }
    synth.arp(Array.from({ length: Math.min(12, n + 4) }, (_, k) => k), 0.07, 0.11);
    synth.pad(0.07, 4);
    hudApi.toast(`${n} 人の自分が、同じ ${cfg.loopSec} 秒で`);
  };

  /** ループが巻き戻った瞬間 */
  const onRewind = (loop: number) => {
    prevPaths = paths;
    paths = [];
    rewritten.clear();
    attachView();
    rewindFx = 1;
    juice.doFlash(0.55, 0xc9a3ff);
    juice.shake(0.25 * cfg.shake);
    synth.whoosh(1.2);
    synth.arp([8, 6, 4, 2, 0], 0.045, 0.07);
    synth.nextChord(0.05);
    const last = loop === (es?.maxLoops ?? 0) - 1;
    hudApi.toast(last ? `最後のループ — ${loop + 1} 人の自分と` : `LOOP ${loop + 1}　残響 ${loop} 人`);
  };

  // スマホ・タブレット：キーボードの代わりの画面ボタン
  const tbar = touchButtons([{ label: '‖', onPress: () => togglePause() }], 'bottom');

  const loop = new FixedLoop({
    update: () => {
      const mask = input.sample();
      if (mode !== 'play' || !es || !view) return;
      let m = mask;
      if (autoplay) {
        bot.owner = es.loop;
        m |= bot.input(es.sim);
      }
      const before = es.loop;
      es.step(m);
      for (const e of es.events) {
        if (e.t === 'echoClear' || e.t === 'echoFail') resultTimer = es.totalTicks + Math.round(HZ * (e.t === 'echoClear' ? 3.2 : 1.2));
        if (e.t === 'echoClear') onAllClear();
        if (e.t === 'echoFail') {
          synth.tone(196, 1.2, { type: 'sine', vol: 0.15, slideTo: 60 });
          hudApi.toast('時間切れ — 残響は消えていく');
        }
        else if ((e as { t: string }).t === 'resonance') {
          // 共鳴：過去の自分と今の自分が同じ星を同時に打った。二人の色の光が交わり、時間が一瞬止まる
          const r = e as unknown as { x: number; y: number; a: number; b: number };
          const cur = es.loop;
          view.particles.emit(r.x * SCALE, r.y * SCALE, { count: 70, speed: [120, 520], life: [0.4, 1.1], size: [0.05, 0.22], color: [echoColor(cur - r.a), echoColor(cur - r.b), 0xffe7a8], drag: 1.5 });
          juice.hitstop(0.09);
          juice.slowmo(0.35, 0.5);
          juice.doFlash(0.35, 0xe8dcff);
          synth.arp([0, 4, 7, 12], 0.03, 0.1);
          hudApi.toast('共鳴 — 過去の自分と重なった');
        }
        else if (e.t !== 'loopStart' && e.t !== 'loopEnd' && es.loop === before) view.handle(e as SimEvent);
      }
      if (es.loop !== before) onRewind(es.loop);
      if (resultTimer >= 0) {
        es.totalTicks++;
        if (es.totalTicks >= resultTimer) {
          resultTimer = -1;
          showResult();
        }
      }
      // 軌跡の記録と、残響が本来の道から外れたかの判定
      const t = es.sim.tick;
      if (t % PATH_EVERY === 0) {
        const idx = t / PATH_EVERY;
        for (const b of es.sim.balls) {
          if (!b.launched) continue;
          const p = b.body.getPosition();
          (paths[b.owner] ??= [])[idx] = { x: p.x, y: p.y };
          if (b.owner < es.loop && !rewritten.has(b.owner)) {
            const q = prevPaths[b.owner]?.[idx];
            if (q && Math.hypot(q.x - p.x, q.y - p.y) > 0.8) {
              rewritten.add(b.owner);
              synth.tone(880, 0.25, { type: 'triangle', vol: 0.06, slideTo: 440 });
              hudApi.toast('過去が書き換わった');
            }
          }
        }
      }
    },
    render: (_a, realDt) => {
      juice.shakeScale = cfg.shake;
      juice.update(realDt, cfg.gameSpeed);
      ga.root.pivot.set(-juice.shakeX, -juice.shakeY);
      ga.world.rotation = juice.shakeRot;
      ga.flash.alpha = juice.flash;
      ga.flash.tint = juice.flashColor;
      view?.update(realDt);
      if (es) {
        drawOverlay(realDt);
        const st = stages[stageIndex];
        const max = es.maxLoops;
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">LOOP ${es.loop + 1}<span style="font-size:16px;color:var(--dim)"> / ${max}</span></div>`;
        const destroyed = es.destroyedPerLoop[es.loop] ?? 0;
        tr.innerHTML = `<div class="big">${destroyed}<span style="font-size:16px;color:var(--dim)"> / ${st.stars.length}</span></div><div>このループで壊した星　最多 ${es.best}</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  /** 残響の軌跡とループの時計 */
  const drawOverlay = (dt: number) => {
    const g = overlay;
    g.clear();
    if (!es) return;
    const cur = es.loop;
    const t = es.sim.tick;
    const idxNow = Math.floor(t / PATH_EVERY);
    // 前のループの軌跡：残響がこれから通る道（先の部分を明るく）
    prevPaths.forEach((path, owner) => {
      if (!path || owner >= cur) return;
      const age = cur - owner;
      const col = echoColor(age);
      const broken = rewritten.has(owner);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (!a || !b) continue;
        const ahead = i > idxNow;
        const alpha = broken ? 0.22 : ahead ? (i < idxNow + 60 ? 0.35 : 0.12) : 0.06;
        g.moveTo(a.x * SCALE, a.y * SCALE).lineTo(b.x * SCALE, b.y * SCALE);
        g.stroke({ width: ahead ? 2 : 1.2, color: broken ? 0xff8fb0 : col, alpha });
      }
      // 書き換わった残響は、今の実際の道も重ねる（前後の軌跡を両方見せる）
      if (broken) {
        const now = paths[owner] ?? [];
        for (let i = 1; i < now.length; i++) {
          const a = now[i - 1], b = now[i];
          if (!a || !b) continue;
          g.moveTo(a.x * SCALE, a.y * SCALE).lineTo(b.x * SCALE, b.y * SCALE);
        }
        g.stroke({ width: 2, color: col, alpha: 0.45 });
      }
    });
    // 最後のループ：盤面の縁が金色に脈打つ
    const lastLoop = es.loop === es.maxLoops - 1;
    if (lastLoop && es.phase === 'play') {
      const a = 0.12 + 0.08 * Math.sin(t * 0.08);
      g.rect(4, 4, VIEW_W - 8, VIEW_H - 8).stroke({ width: 6, color: 0xffd27f, alpha: a });
    }
    // 全員クリア：残響それぞれから金の光の線が中央へ集まる
    if (finaleT >= 0) {
      finaleT += dt;
      const k2 = Math.min(1, finaleT / 1.2);
      const cx = VIEW_W / 2, cy = VIEW_H * 0.4;
      for (const b of es.sim.balls) {
        const p = b.body.getPosition();
        const x = p.x * SCALE, y = p.y * SCALE;
        g.moveTo(x, y).lineTo(x + (cx - x) * k2, y + (cy - y) * k2).stroke({ width: 2, color: echoColor(es.loop - b.owner), alpha: 0.8 * (1 - Math.max(0, finaleT - 2) / 1.5) });
      }
      g.circle(cx, cy, 20 + 60 * k2).stroke({ width: 3, color: 0xffe7a8, alpha: Math.max(0, 0.7 - finaleT * 0.2) });
    }
    // ループの時計（盤面の上端の光の帯。残り2秒で桃色に。最後のループは金）
    const k = Math.min(1, t / es.loopTicks);
    const left = es.cfg.loopSec * (1 - k);
    const col = left < 2 ? lerpColor(0xffa3e0, 0xffffff, 0.5 + 0.5 * Math.sin(t * 0.3)) : lastLoop ? 0xffd27f : 0xc9a3ff;
    const x0 = 3.0 * SCALE, x1 = 11.8 * SCALE, y = 0.32 * SCALE;
    g.moveTo(x0, y).lineTo(x1, y).stroke({ width: 3, color: 0x2a2450, alpha: 0.9, cap: 'round' });
    g.moveTo(x0, y).lineTo(x0 + (x1 - x0) * (1 - k), y).stroke({ width: 3, color: col, alpha: 0.95, cap: 'round' });
    for (let s = 1; s < es.cfg.loopSec; s++) {
      const x = x0 + ((x1 - x0) * s) / es.cfg.loopSec;
      g.circle(x, y, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
    }
    // 巻き戻りの波紋
    if (rewindFx > 0) {
      rewindFx = Math.max(0, rewindFx - dt * 1.6);
      const r = (1 - rewindFx) * VIEW_H * 0.9;
      g.circle(VIEW_W / 2, VIEW_H * 0.45, r).stroke({ width: 3 + rewindFx * 10, color: 0xc9a3ff, alpha: rewindFx * 0.6 });
      g.circle(VIEW_W / 2, VIEW_H * 0.45, r * 0.7).stroke({ width: 2, color: 0x9fe8ff, alpha: rewindFx * 0.4 });
    }
  };

  const hook = installDebugHook('echo-loop', () => ({
    mode,
    stage: stageIndex,
    loop: es?.loop,
    phase: es?.phase,
    destroyed: es ? es.destroyedPerLoop[es.loop] : 0,
    best: es?.best,
    balls: es?.sim.balls.length,
    particles: view?.particles.count,
  }));
  hook.start = (i: number) => startStage(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  hook.es = () => es;
  /** 演出確認用：全部の星を点火してクリアさせる */
  hook.ignite = () => {
    if (!es) return;
    for (const st of es.sim.stars) if (st.alive) (es.sim as unknown as { addCharge(s: unknown, n: number): void }).addCharge(st, 9);
  };

  loop.start();
  if (params.has('stage')) startStage(Math.min(stages.length - 1, Number(params.get('stage')) || 0));
  else showTitle();
  hook.ready = true;
}

void main();
