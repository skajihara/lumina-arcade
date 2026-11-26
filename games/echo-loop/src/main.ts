/**
 * Echo Loop：画面遷移・HUD・入力。
 * 盤面の描画は Nova Pinball の NovaView をそのまま使い、その上に「残響の軌跡」と「ループの時計」を重ねる。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Container, Graphics, Text } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Input } from '@engine/input';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save, clearStored } from '@engine/storage';
import { lerpColor } from '@engine/gfx';
import { injectBaseStyle, el, touchButtons, resetButton, goTo } from '@engine/hud';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { schema, presets, DEFAULT_PRESET, type EchoConfig } from './config';
import { stages } from './stages';
import { ruleCards, introCard } from '@engine/rules';
import { echoRules, handFrame, shrinkFrame } from './rules';
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
/** 残響の光の帯の長さ（記録の点の数） */
const RIBBON_LEN = 14;
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
  // UX-01：左上の戻る・Esc・ブラウザの戻る。プレイ中はポーズ、ポーズは続ける、リザルトはステージ選択、タイトルは星図へ
  installNav(
    () => {
      if (mode === 'play' || mode === 'pause') togglePause();
      else if (mode === 'result') showTitle();
      else goTo('./index.html');
    },
    () => (mode === 'play' ? '‖ ポーズ' : mode === 'pause' ? '▶ 続ける' : mode === 'result' ? '← ステージ選択' : '← 星図へ'),
  );
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
  /** 背景の時計（EL-10：Nova とはっきり違う「時間」の見た目）。盤面の後ろに大きな文字盤と針、時間の波紋 */
  const clockG = new Graphics();
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
  /** このループで、だれ（持ち主）がいつどの星に当てたか（次のループで「残響がここで当てる」✕の予告に使う） */
  let hitLog: { tick: number; star: number; x: number; y: number; by: number }[] = [];
  let prevHitLog: typeof hitLog = [];
  /** 残響の番号と「今の自分」の札（ボールの横に付ける） */
  const tags = new Container();
  const tagPool: Text[] = [];
  /** ループの最初の短い説明（画面の中央に数秒） */
  let loopNote: { text: string; t: number } | null = null;
  /** 時計の針にボールが当たった直後の光（1→0） */
  let handFlash = 0;
  let handTouching = new Set<number>();
  const noteText = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 22, fill: 0xffffff, align: 'center', dropShadow: { color: 0x000000, blur: 6, distance: 0, alpha: 0.9 } } });
  noteText.anchor.set(0.5);

  const closeMenu = () => { menu?.remove(); menu = null; };

  const attachView = () => {
    if (!es) return;
    // 重ね絵はカメラ（ズーム）と一緒に動くよう view の中に入れる。view を壊す前に外す
    if (view) {
      view.container.removeChild(overlay);
      view.container.removeChild(clockG);
      view.container.removeChild(tags);
      view.container.removeChild(noteText);
      view.destroy();
    }
    // EL-10b：Nova とはっきり違う空。水色〜青緑の夜明け前の空と、青緑の星雲
    view = new NovaView(es.sim, juice, cfg, hudApi, { top: '#06303a', bottom: '#020a10', nebula: ['#1a7a86', '#1b5a8f', '#2a9a8a'] });
    const cur = es.loop;
    // 今の自分は大きく白く、残響は色付きで半透明・少し小さく（EL-11：区別がつくように）
    view.ballStyle = (b) => (b.owner === cur ? { tint: 0xffffff, alpha: 1, scale: 1.3 } : { tint: echoColor(cur - b.owner), alpha: echoAlpha(cur - b.owner) * 0.7, scale: 0.85 });
    // 残響の当たり音は、古いほど小さく遠く
    view.soundScale = (owner) => (owner === cur ? 1 : Math.max(0.25, 0.6 - (cur - owner) * 0.08));
    view.container.addChild(overlay);
    view.container.addChild(tags);
    view.container.addChild(noteText);
    // 時計は夜空のすぐ上（盤面の線より後ろ）
    view.container.addChildAt(clockG, Math.min(2, view.container.children.length));
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
    hitLog = [];
    prevHitLog = [];
    loopNote = { text: '星をねらって打つ。10秒たつと時間が巻き戻り、\n今の自分は「残響」になって同じ動きをくり返す', t: 0 };
    finaleT = -1;
    attachView();
    hudApi.chain(0);
    hudApi.toast(stages[i].hint);
    // このステージで初めて出てくる要素の図解（RULE-01c）：1面は残響、4面は共鳴
    { const r = echoRules(cfg.loopSec, cfg.echoTwist); const id = stages[i].id; introCard(id === 'echo-bridge' ? r[1] : id === 'echo-clock' && cfg.hand > 0 ? handFrame : id === 'echo-mirror' && Math.round(cfg.echoTwist) === 1 ? shrinkFrame : id === 'echo-twin' && cfg.resonance > 0 && r[3] ? r[3] : null, id === 'echo-bridge' ? '残響' : id === 'echo-clock' ? '時計の針' : id === 'echo-mirror' ? '縮む時間' : '共鳴'); }
    mode = 'play';
    resultTimer = -1;
    bot = new NovaBot(i + 1, 0.85);
    bot.bias = echoBias(es);
    synth.setKey(STAGE_KEYS[i % STAGE_KEYS.length]);
  };

  /** 星評価：少ないループでクリアするほど高い */
  const rating = (loopsUsed: number) => {
    const max = es?.maxLoops ?? Math.round(cfg.maxLoops);
    // ★3：半分以内（切り上げ）、★2：最後のループより前（EL-08 でループ数を絞ったので、残りではなく割合で）
    return loopsUsed <= Math.ceil(max / 2) ? 3 : loopsUsed <= max - 1 ? 2 : 1;
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
      <p style="font-size:13px">★：少ないループでクリアするほど高い（★3：${Math.ceil(es.maxLoops / 2)}ループ以内　★2：${es.maxLoops - 1}ループ以内）</p>
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
    row.append(launcherButton());
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
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(echoRules(cfg.loopSec, cfg.echoTwist)));
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
      menu.appendChild(ruleCards(echoRules(cfg.loopSec, cfg.echoTwist)));
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
  synth.setMusicStyle('echo');
  ga.setBloom(cfg.bloom);

  /** 全員そろって燃やしきった瞬間：残響ひとりひとりから光が弾け、和音が人数分だけ積み上がる */
  let finaleT = -1;
  /** 縮む時間：共鳴で時間を取り戻した時の時計の波紋 */
  let regainFx = 0;
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
    hudApi.toast(`${n} 人の自分が、同じ ${+es.loopSecNow.toFixed(1)} 秒で`);
  };

  /** ループが巻き戻った瞬間 */
  const onRewind = (loop: number) => {
    prevPaths = paths;
    paths = [];
    prevHitLog = hitLog;
    hitLog = [];
    loopNote = loop === 1
      ? { text: '巻き戻った — 前の自分（残響）が、同じ動きをくり返す\n✕ は残響がこれから当てる星。残りの星をねらえ', t: 0 }
      : { text: `LOOP ${loop + 1} — 残響 ${loop} 人が、それぞれの動きをくり返す`, t: 0 };
    if (es && Math.round(es.cfg.echoTwist) === 1 && es.loopSecNow < es.cfg.loopSec) {
      loopNote.text += `\nループは ${+es.loopSecNow.toFixed(1)} 秒に縮んだ — 共鳴で取り戻せる`;
    }
    if (es && Math.round(es.cfg.echoTwist) === 2 && loop === 1) loopNote.text += '\n残響が壊した星は「影」— 少しすると戻る';
    rewritten.clear();
    attachView();
    rewindFx = 1;
    juice.doFlash(0.55, 0xc9a3ff);
    juice.shake(0.25 * cfg.shake);
    synth.whoosh(1.2);
    synth.arp([8, 6, 4, 2, 0], 0.045, 0.07);
    synth.nextChord(0.05);
    const last = loop === (es?.maxLoops ?? 0) - 1;
    if (last) {
      hudApi.toast(`最後のループ — ${loop + 1} 人の自分と`);
      loopNote = { text: `最後のループ — 残響 ${loop} 人と今の自分で、残りを全部`, t: 0 };
    }
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
      // 時計の針に当たった瞬間：光と音（今の自分のボールだけ大きく）
      if (es.hand && es.loop === before) {
        const now = new Set<number>();
        for (let c = es.hand.getContactList(); c; c = c.next ?? null) {
          if (!c.contact.isTouching()) continue;
          const other = c.other?.getUserData() as { kind?: string; id?: number } | null;
          if (other?.kind !== 'ball' || other.id === undefined) continue;
          now.add(other.id);
          if (!handTouching.has(other.id)) {
            const ball = es.sim.balls.find((b) => b.id === other.id);
            const mine = ball?.owner === es.loop;
            handFlash = mine ? 1 : Math.max(handFlash, 0.5);
            synth.tone(mine ? 1320 : 990, 0.12, { type: 'triangle', vol: mine ? 0.08 : 0.035, slideTo: mine ? 1760 : 1180 });
            if (ball) {
              const p = ball.body.getPosition();
              view.particles.emit(p.x * SCALE, p.y * SCALE, { count: mine ? 16 : 6, speed: [60, 220], life: [0.2, 0.5], size: [0.04, 0.12], color: [0x7ff0ff, 0xffffff] });
            }
          }
        }
        handTouching = now;
      }
      for (const e of es.events) {
        if (e.t === 'hit' && e.by !== undefined && es.loop === before) hitLog.push({ tick: es.sim.tick, star: e.star, x: e.x, y: e.y, by: e.by });
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
        else if (e.t === 'regain') {
          // 縮む時間：共鳴でこのループの時間を取り戻した。時の粒が上の時計の帯へ飛ぶ
          view.particles.emit(e.x * SCALE, e.y * SCALE, { count: 40, speed: [80, 360], life: [0.5, 1.2], size: [0.05, 0.18], color: [0x9fe8ff, 0xffffff], drag: 1.2 });
          synth.arp([12, 16, 19], 0.04, 0.08);
          regainFx = 1;
          hudApi.toast(`共鳴 — 時間を ${e.sec.toFixed(1)} 秒取り戻した`);
        }
        else if (e.t === 'shadow') {
          if (es.loop === before) view.particles.emit(e.x * SCALE, e.y * SCALE, { count: 10, speed: [20, 90], life: [0.6, 1.2], size: [0.05, 0.14], color: [0x8a7cc8, 0x5a6fa8] });
        }
        else if (e.t === 'revive') {
          if (es.loop === before) {
            view.particles.emit(e.x * SCALE, e.y * SCALE, { count: 18, speed: [40, 160], life: [0.3, 0.8], size: [0.05, 0.16], color: [0xa38cff, 0xffffff] });
            synth.tone(392, 0.25, { type: 'sine', vol: 0.05, slideTo: 523 });
          }
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

  /**
   * 背景の時計：盤面いっぱいの文字盤（60の目盛り、12の太い目盛り）、ループの進みで1周する長い針、
   * ループの番号で進む短い針、中心から広がる時間の波紋。巻き戻る時は針が逆向きに速く回る
   */
  const drawClock = () => {
    const g = clockG;
    g.clear();
    if (!es) return;
    const cx = VIEW_W / 2, cy = VIEW_H * 0.44, R = VIEW_W * 0.47;
    const k = Math.min(1, es.sim.tick / es.loopTicks);
    const T = performance.now() / 1000;
    // 時間の波紋（ゆっくり広がる）
    for (let i = 0; i < 4; i++) {
      const f = (T * 0.12 + i / 4) % 1;
      g.circle(cx, cy, R * (0.15 + 0.95 * f)).stroke({ width: 1.2, color: 0x7ff0ff, alpha: 0.12 * (1 - f) });
    }
    g.circle(cx, cy, R).stroke({ width: 2, color: 0x7ff0ff, alpha: 0.16 });
    g.circle(cx, cy, R * 0.93).stroke({ width: 1, color: 0xc9a3ff, alpha: 0.12 });
    for (let i = 0; i < 60; i++) {
      const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      const passed = i / 60 <= k;
      const r0 = R * (big ? 0.86 : 0.9), r1 = R * 0.96;
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0).lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        .stroke({ width: big ? 2.5 : 1, color: passed ? 0x9fe8ff : 0x6a6fb0, alpha: passed ? 0.45 : 0.2 });
    }
    // 長い針：今のループの進み（巻き戻りの瞬間は逆へ速く回る）
    const back = rewindFx > 0 ? rewindFx * Math.PI * 2 : 0;
    const a1 = -Math.PI / 2 + k * Math.PI * 2 - back;
    g.moveTo(cx, cy).lineTo(cx + Math.cos(a1) * R * 0.84, cy + Math.sin(a1) * R * 0.84).stroke({ width: 2, color: 0x9fe8ff, alpha: es.hand ? 0.12 : 0.35, cap: 'round' });
    // 短い針：何ループ目か
    const a2 = -Math.PI / 2 + ((es.loop + k) / Math.max(1, es.maxLoops)) * Math.PI * 2;
    g.moveTo(cx, cy).lineTo(cx + Math.cos(a2) * R * 0.5, cy + Math.sin(a2) * R * 0.5).stroke({ width: 5, color: 0xc9a3ff, alpha: 0.3, cap: 'round' });
    // 過ぎたループの印：文字盤の縁に、残響の色の小さな月
    for (let l = 0; l < es.maxLoops; l++) {
      const a = -Math.PI / 2 + (l / es.maxLoops) * Math.PI * 2;
      const x = cx + Math.cos(a) * R * 0.78, y = cy + Math.sin(a) * R * 0.78;
      if (l < es.loop) g.circle(x, y, 5).fill({ color: echoColor(es.loop - l), alpha: 0.55 });
      else if (l === es.loop) g.circle(x, y, 6 + Math.sin(T * 4)).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
      else g.circle(x, y, 3).stroke({ width: 1, color: 0x8f96c9, alpha: 0.35 });
    }
    g.circle(cx, cy, 6).fill({ color: 0x9fe8ff, alpha: 0.4 });
  };

  /** 残響の軌跡とループの時計 */
  const drawOverlay = (dt: number) => {
    drawClock();
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
    // 残響の光の帯（EL-10c）：過去の自分は、通ってきた道に細く消えていく光の帯を引く（今の自分は Nova と同じ短い尾だけ）
    paths.forEach((path, owner) => {
      if (!path || owner >= cur) return;
      const col = echoColor(cur - owner);
      const n = RIBBON_LEN;
      for (let k = 1; k < n; k++) {
        const a = path[idxNow - k], b = path[idxNow - k + 1];
        if (!a || !b) continue;
        const f = 1 - k / n;
        g.moveTo(a.x * SCALE, a.y * SCALE).lineTo(b.x * SCALE, b.y * SCALE);
        g.stroke({ width: 2 + 10 * f, color: col, alpha: 0.05 + 0.22 * f * f, cap: 'round' });
      }
    });
    // 時計の針（EL-12）：盤面を回る光の棒。当たった直後は明るく
    if (es.hand && es.stage.hand) {
      const h = es.stage.hand;
      const a = es.hand.getAngle();
      const len = h.len * cfg.handLen * SCALE;
      const x0 = h.x * SCALE, y0 = h.y * SCALE;
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      // 通り過ぎた跡（扇形の淡い光）
      const dir = Math.sign(es.handSpeed) || 1;
      for (let k = 1; k <= 6; k++) {
        const b = a - dir * k * 0.06;
        g.moveTo(x0, y0).lineTo(x0 + Math.cos(b) * len, y0 + Math.sin(b) * len).stroke({ width: 3, color: 0x7ff0ff, alpha: 0.12 * (1 - k / 7) });
      }
      const hot = handFlash;
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 14, color: 0x7ff0ff, alpha: 0.12 + 0.25 * hot, cap: 'round' });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 5, color: hot > 0.1 ? 0xffffff : 0xbff8ff, alpha: 0.9, cap: 'round' });
      g.circle(x0, y0, 0.3 * SCALE).fill({ color: 0x0b1030, alpha: 0.9 }).stroke({ width: 2.5, color: 0x9fe8ff, alpha: 0.9 });
      g.circle(x1, y1, 4 + 4 * hot).fill({ color: 0xffffff, alpha: 0.8 });
      handFlash = Math.max(0, handFlash - dt * 4);
    }
    // 残響がこれから当てる星の予告（✕）：前のループの記録から、書き換わっていない残響の、この先 2 秒の当たり
    const LOOK = Math.round(HZ * 2);
    const marked = new Set<number>();
    for (const h of prevHitLog) {
      if (h.by >= cur || rewritten.has(h.by) || h.tick < t || h.tick > t + LOOK || marked.has(h.star)) continue;
      const star = es.sim.stars[h.star];
      if (!star || !star.alive) continue;
      marked.add(h.star);
      const p = star.body.getPosition();
      const x = p.x * SCALE, y = p.y * SCALE;
      const k = 1 - (h.tick - t) / LOOK; // 0 → 1（当たる瞬間）
      const col = echoColor(cur - h.by);
      const r = 9 + (1 - k) * 16;
      g.circle(x, y, r).stroke({ width: 1.5, color: col, alpha: 0.25 + 0.5 * k });
      const d = 6;
      g.moveTo(x - d, y - d).lineTo(x + d, y + d).moveTo(x + d, y - d).lineTo(x - d, y + d).stroke({ width: 2.5, color: col, alpha: 0.4 + 0.5 * k, cap: 'round' });
    }
    // ボールの札：今の自分に「今」、残響には何ループ目の自分かの番号
    let ti = 0;
    for (const b of es.sim.balls) {
      if (!b.launched && b.owner !== cur) continue;
      const tag = tagPool[ti] ?? (tagPool[ti] = tags.addChild(new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: 'bold', fill: 0xffffff, dropShadow: { color: 0x000000, blur: 4, distance: 0, alpha: 0.9 } } })));
      ti++;
      const p = b.body.getPosition();
      const now = b.owner === cur;
      tag.text = now ? '今' : String(b.owner + 1);
      tag.style.fill = now ? 0xffffff : echoColor(cur - b.owner);
      tag.alpha = now ? 1 : 0.8;
      tag.anchor.set(0.5);
      tag.x = p.x * SCALE + (now ? 0 : 12);
      tag.y = p.y * SCALE - (now ? 26 : 14);
      tag.visible = es.phase === 'play';
    }
    for (let i = ti; i < tagPool.length; i++) tagPool[i].visible = false;
    // ループの最初の短い説明（4 秒）
    if (loopNote && es.phase === 'play') {
      loopNote.t += dt;
      const a = Math.min(1, loopNote.t * 3) * Math.min(1, Math.max(0, 4 - loopNote.t));
      noteText.text = loopNote.text;
      noteText.alpha = a;
      noteText.x = VIEW_W / 2;
      noteText.y = VIEW_H * 0.6; // 上の知らせ（ステージの説明）と重ならない高さ
      noteText.visible = a > 0;
      if (loopNote.t > 4) loopNote = null;
    } else noteText.visible = false;
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
    // 影：残響が壊した星の跡（戻るまでの残りを細い輪で）
    for (const [id, until] of es.shadows) {
      const d = es.stage.stars[id];
      if (!d) continue;
      const rest = Math.max(0, (until - es.sim.tick) / (es.cfg.shadowSec * HZ));
      const x = d.x * SCALE, y = d.y * SCALE, r = (d.r ?? 0.5) * SCALE;
      g.circle(x, y, r).stroke({ width: 1.5, color: 0x8a7cc8, alpha: 0.5 });
      g.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rest).stroke({ width: 2, color: 0xa38cff, alpha: 0.8 });
    }
    // ループの時計（盤面の上端の光の帯）。縮む時間：帯の長さは元の秒数のまま、縮んだ分は右端に暗い赤で
    const full = es.cfg.loopSec, nowSec = es.loopSecNow;
    const k = Math.min(1, t / es.loopTicks);
    const left = nowSec * (1 - k);
    const col = left < 2 ? lerpColor(0xffa3e0, 0xffffff, 0.5 + 0.5 * Math.sin(t * 0.3)) : lastLoop ? 0xffd27f : 0xc9a3ff;
    const x0 = 3.0 * SCALE, x1 = 11.8 * SCALE, y = 0.32 * SCALE;
    g.moveTo(x0, y).lineTo(x1, y).stroke({ width: 3, color: 0x2a2450, alpha: 0.9, cap: 'round' });
    const xs = (sec: number) => x0 + ((x1 - x0) * sec) / full;
    if (nowSec < full - 1e-6) {
      // 縮んだ分（残響の数だけ失った時間）
      g.moveTo(xs(nowSec), y).lineTo(x1, y).stroke({ width: 5, color: 0x8a2c58, alpha: 0.85 });
      for (let sx = xs(nowSec) + 4; sx < x1; sx += 7) g.moveTo(sx, y - 3).lineTo(sx - 4, y + 3).stroke({ width: 1, color: 0xff7fb0, alpha: 0.5 });
      g.circle(xs(nowSec), y, 3.5).fill({ color: 0xff9fc8, alpha: 0.9 });
    }
    if (regainFx > 0) {
      regainFx = Math.max(0, regainFx - dt * 1.4);
      g.circle(xs(nowSec), y, 4 + (1 - regainFx) * 26).stroke({ width: 2, color: 0x9fe8ff, alpha: regainFx });
    }
    g.moveTo(x0, y).lineTo(xs(left), y).stroke({ width: 3, color: col, alpha: 0.95, cap: 'round' });
    for (let s = 1; s < full; s++) {
      const x = xs(s);
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
