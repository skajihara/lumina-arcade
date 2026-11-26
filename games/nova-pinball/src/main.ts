/** Nova Pinball：画面遷移・HUD・入力をまとめる */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Input } from '@engine/input';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save, clearStored } from '@engine/storage';
import { injectBaseStyle, el, backLink, touchButtons, resetButton } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type NovaConfig } from './config';
import { stages } from './stages';
import { ruleCards, introCard } from '@engine/rules';
import { novaIntros } from './intro';
import { novaRules } from './rules';
import { NovaSim, HZ, IN_LEFT, IN_RIGHT } from './sim';
import { NovaView, VIEW_H, VIEW_W, chainTier } from './view';
import { BOARD_W } from './sim';
import { NovaBot } from './bot';
import { ReplayRecorder, ReplayPlayer, type ReplayData } from './replay';

interface Progress {
  cleared: Record<string, number>; // ステージID → 星評価(1-3)
  best: Record<string, number>;
}

const params = new URLSearchParams(location.search);
/** ステージごとのキー（C からの半音） */
const STAGE_KEYS = [0, 5, -3, 2, 7, -2, 4, -5, 1, 6, -4, 3];

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  // カメラが寄っても盤面の外へはみ出さないよう、論理画面で切り抜く
  const worldMask = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff });
  ga.root.addChild(worldMask);
  ga.world.mask = worldMask;
  const tuning = createTuning<NovaConfig>('nova-pinball', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('nova-pinball', { cleared: {}, best: {} });
  // ステージごとの「ベスト連鎖」のリプレイ
  const replays = new Save<{ best: Record<string, ReplayData> }>('nova-pinball-replays', { best: {} });
  // 登録順がビットになる：left=1(IN_LEFT), right=2(IN_RIGHT), launch=4(IN_LAUNCH)
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
        // 連鎖の段階で文字の色が変わる（青→金→桃→虹）
        const tier = chainTier(n);
        chainEl.style.color = ['#cfe0ff', '#ffd27f', '#ffa3e0', '#ffffff'][tier];
        chainEl.style.textShadow = tier === 3
          ? '0 0 12px #7ff0ff, 0 0 24px #ffa3e0, 0 0 36px #ffd27f'
          : `0 0 18px ${['#7fa8ff', '#ffb84d', '#ff6fcf', '#fff'][tier]}`;
      } else chainEl.style.opacity = '0';
    },
    toast(msg: string) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
    },
  };

  let sim: NovaSim | null = null;
  let view: NovaView | null = null;
  let stageIndex = 0;
  let mode: 'menu' | 'play' | 'pause' | 'result' | 'replay' = 'menu';
  let recorder: ReplayRecorder | null = null;
  let player: ReplayPlayer | null = null;
  let lastReplay: ReplayData | null = null;
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let bot = new NovaBot(1, 0.85);
  let resultTimer = -1;
  /** 狙いの線（NP-15）：先読み専用のボット（操作はしない）と、その結果 */
  const aimer = new NovaBot(0, 1);
  const aimG = new Graphics();
  let aims: { side: 'L' | 'R'; path: { x: number; y: number }[]; target: number }[] = [];
  let lastMask = 0;
  let cradleTold = false;

  const closeMenu = () => { menu?.remove(); menu = null; };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    aimG.parent?.removeChild(aimG);
    view?.destroy();
    sim = new NovaSim(stages[i], cfg);
    view = new NovaView(sim, juice, cfg, hudApi);
    ga.world.removeChildren();
    ga.world.addChild(view.container);
    view.container.addChild(aimG);
    aims = [];
    hudApi.chain(0);
    hudApi.toast(stages[i].hint);
    // このステージで初めて出てくる要素の図解（RULE-01c）
    { const it = novaIntros[stages[i].id]; introCard(it?.frame ?? null, it?.title); }
    mode = 'play';
    resultTimer = -1;
    bot = new NovaBot(i + 1, 0.85);
    recorder = new ReplayRecorder(cfg);
    player = null;
    // ステージごとにキー（環境音の根音と和音）を変える
    synth.setKey(STAGE_KEYS[i % STAGE_KEYS.length]);
  };

  /** リプレイを再生する。highlight なら、ベスト連鎖の3秒前まで早送りしてから */
  const startReplay = (data: ReplayData, highlight: boolean) => {
    const i = stages.findIndex((s) => s.id === data.stage);
    if (i < 0) return;
    closeMenu();
    stageIndex = i;
    aimG.parent?.removeChild(aimG);
    view?.destroy();
    player = new ReplayPlayer(data, stages[i], highlight ? Math.max(0, data.highlight - HZ * 3) : 0);
    sim = player.sim;
    view = new NovaView(sim, juice, player.sim.cfg, hudApi);
    ga.world.removeChildren();
    ga.world.addChild(view.container);
    hudApi.chain(0);
    hudApi.toast(`REPLAY　最大 ${data.bestChain} 連鎖`);
    mode = 'replay';
    resultTimer = -1;
    synth.setKey(STAGE_KEYS[i % STAGE_KEYS.length]);
  };

  const showReplayEnd = (data: ReplayData) => {
    mode = 'result';
    hudApi.chain(0);
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `<h1>REPLAY</h1><h2>${stages[stageIndex].name}</h2>
      <p>スコア <b style="color:var(--ink)">${data.score.toLocaleString()}</b>　最大連鎖 <b style="color:var(--ink)">${data.bestChain}</b></p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    const a = el('button', { class: 'btn' }, 'もう一度見る');
    a.onclick = () => startReplay(data, true);
    const b = el('button', { class: 'btn' }, 'このステージを遊ぶ');
    b.onclick = () => startStage(stageIndex);
    const c = el('button', { class: 'btn' }, 'ステージ選択');
    c.onclick = () => showTitle();
    row.append(a, b, c);
    document.body.appendChild(menu);
    (row.firstElementChild as HTMLElement)?.focus();
  };

  const rating = (s: NovaSim) => {
    // エンドレス：到達した波で評価
    if (s.stage.endless) return s.wave >= 8 ? 3 : s.wave >= 5 ? 2 : s.wave >= 3 ? 1 : 0;
    // ★2：星座の線を7割以上灯す。★3：超新星（全部灯す）か、星の6割以上を1回の連鎖で
    const frac = s.links.length ? s.litLinks.size / s.links.length : 1;
    if (s.supernova || s.bestChain >= Math.ceil(s.stars.length * 0.6)) return 3;
    return frac >= 0.7 ? 2 : 1;
  };

  const showResult = (cleared: boolean) => {
    if (!sim) return;
    mode = 'result';
    hudApi.chain(0);
    const st = stages[stageIndex];
    const endless = !!st.endless;
    if (endless) cleared = true;
    const stars = cleared ? rating(sim) : 0;
    if (cleared && (!endless || stars > 0 || sim.score > (save.data.best[st.id] ?? 0))) {
      if (stars > 0) save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.data.best[st.id] = Math.max(save.data.best[st.id] ?? 0, sim.score);
      save.write();
    }
    // リプレイを残す（ベスト連鎖を更新したら保存）
    lastReplay = recorder && !recorder.dirty ? recorder.toData(sim) : null;
    let newBest = false;
    if (lastReplay && lastReplay.bestChain >= 2 && lastReplay.bestChain > (replays.data.best[st.id]?.bestChain ?? 0)) {
      replays.data.best[st.id] = lastReplay;
      replays.write();
      newBest = true;
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${endless ? `WAVE ${sim.wave}` : cleared ? 'STAGE CLEAR' : 'GAME OVER'}</h1>
      <h2>${st.name}</h2>
      ${cleared ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      ${endless ? `<p>ベストスコア <b style="color:var(--ink)">${Math.max(save.data.best[st.id] ?? 0, sim.score).toLocaleString()}</b></p>` : ''}
      <p>スコア <b style="font-size:22px;color:var(--ink)">${sim.score.toLocaleString()}</b>　最大連鎖 <b style="color:var(--ink)">${sim.bestChain}</b>　星座 ${sim.litLinks.size}/${sim.links.length}${newBest ? '　<span style="color:var(--gold)">ベスト連鎖を更新！</span>' : ''}</p>
      <p style="font-size:13px">${endless ? '★1：WAVE 3　★2：WAVE 5　★3：WAVE 8 に到達（2波ごとに＋1ボール）' : '★2：星座の線を7割以上灯す　★3：超新星（線を全部灯す）か、星の6割以上を1回の連鎖で'}</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (cleared && !endless && stageIndex < stages.length - 1 && !stages[stageIndex + 1].endless) {
      const nb = el('button', { class: 'btn' }, '次のステージ →');
      nb.onclick = () => startStage(stageIndex + 1);
      row.appendChild(nb);
    }
    const rb = el('button', { class: 'btn' }, 'もう一度 (R)');
    rb.onclick = () => startStage(stageIndex);
    row.append(rb);
    if (lastReplay && lastReplay.bestChain >= 2) {
      const data = lastReplay;
      const pb = el('button', { class: 'btn' }, `▶ ${data.bestChain}連鎖を見る`);
      pb.onclick = () => startReplay(data, true);
      row.append(pb);
    }
    const best = replays.data.best[st.id];
    if (best && !newBest) {
      const bb = el('button', { class: 'btn' }, `★ ベスト ${best.bestChain}連鎖`);
      bb.onclick = () => startReplay(best, true);
      row.append(bb);
    }
    const mb = el('button', { class: 'btn' }, 'ステージ選択');
    mb.onclick = () => showTitle();
    row.append(mb);
    document.body.appendChild(menu);
    (row.firstElementChild as HTMLElement)?.focus();
  };

  const showTitle = () => {
    closeMenu();
    mode = 'menu';
    menu = el('div', { class: 'menu' });
    const clearedCount = stages.filter((st) => !st.endless && save.data.cleared[st.id] !== undefined).length;
    // エンドレスは4ステージクリアで解放
    const unlocked = (i: number) => i === 0 || params.has('all') || (stages[i].endless ? clearedCount >= 4 : save.data.cleared[stages[i - 1].id] !== undefined);
    menu.innerHTML = `
      <h1>NOVA PINBALL</h1>
      <h2>星 爆 ピ ン ボ ー ル</h2>
      <div class="rulebox"></div>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>←</kbd>/<kbd>Z</kbd> 左フリッパー　<kbd>→</kbd>/<kbd>/</kbd> 右フリッパー　<kbd>Space</kbd> 長押しで発射<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：画面の左下／右下でフリッパー、上半分で発射</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(novaRules));
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
        `<b>${st.endless ? '∞' : i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); synth.startAmbient(); startStage(i); };
      const rp = replays.data.best[st.id];
      if (ok && rp) {
        const a = el('span', { class: 'replay', title: 'ベスト連鎖のリプレイ' }, `▶ ${rp.bestChain}連鎖`);
        a.style.cssText = 'display:block;font-size:11px;color:var(--accent);margin-top:2px;cursor:pointer';
        a.onclick = (ev) => { ev.stopPropagation(); synth.unlock(); synth.startAmbient(); startReplay(rp, true); };
        d.appendChild(a);
      }
      grid.appendChild(d);
    });
    menu.appendChild(resetButton('nova-pinball', '星爆ピンボール', clearStored));
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
      menu.appendChild(ruleCards(novaRules));
      document.body.appendChild(menu);
    } else if (mode === 'pause') {
      closeMenu();
      mode = 'play';
    }
  };

  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if ((e.code === 'KeyP' || e.code === 'Escape') && mode === 'replay') { showTitle(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result' || mode === 'pause')) startStage(stageIndex);
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  window.addEventListener('pointerdown', () => synth.unlock());

  tuning.onChange((key, restart) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
    // 見た目・音以外の設定を途中で変えたら、そのプレイのリプレイは再現できないので保存しない
    if (mode === 'play' && recorder && !['volume', 'bloom', 'shake', 'particles', 'gameSpeed', 'slowmoAt'].includes(String(key))) recorder.dirty = true;
    if (restart && mode === 'play' && key !== '*') hudApi.toast('↻ の項目は R でやり直すと反映されます');
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('nova');
  ga.setBloom(cfg.bloom);

  // スマホ・タブレット：キーボードの代わりの画面ボタン
  const tbar = touchButtons([{ label: '‖', onPress: () => togglePause() }], 'bottom');

  let musicHeat = 0;
  const loop = new FixedLoop({
    update: () => {
      const mask = input.sample();
      if ((mode !== 'play' && mode !== 'replay') || !sim || !view) return;
      if (mode === 'replay' && player) {
        const live = sim.phase === 'play' && !player.done;
        sim.step(live ? player.next() : 0);
        for (const e of sim.events) view.handle(e);
        if (!live && resultTimer < 0) resultTimer = sim.tick + HZ * 2.2;
        if (resultTimer >= 0 && sim.tick >= resultTimer) {
          resultTimer = -1;
          showReplayEnd(player.data);
        }
        return;
      }
      let m = mask;
      if (autoplay) m |= bot.input(sim);
      recorder?.record(m);
      sim.step(m);
      lastMask = m;
      // 狙いの線：フリッパーの上のボールを「今弾いたら」で先読み（4ティックごと）。上げて抱えている時は、一度下ろしてから弾く想定
      if (cfg.aimLine > 0 && sim.tick % 4 === 0) {
        aims = [];
        for (const side of ['L', 'R'] as const) {
          const ball = aimer.ballOver(sim, side);
          if (!ball) continue;
          const held = (lastMask & (side === 'L' ? IN_LEFT : IN_RIGHT)) !== 0;
          const path = aimer.predict(sim, side, ball, held ? 8 : 0, true);
          aims.push({ side, path, target: aimer.firstStar(sim, path) });
          const v = ball.body.getLinearVelocity();
          if (held && Math.hypot(v.x, v.y) < 0.3 && !cradleTold && !autoplay) {
            cradleTold = true;
            hudApi.toast('ボールを抱えた — 放してすぐ押すと、点線の向きへ打てる');
          }
        }
      } else if (cfg.aimLine <= 0) aims = [];
      recorder?.observe(sim);
      for (const e of sim.events) {
        view.handle(e);
        if (e.t === 'clear') resultTimer = sim.tick + HZ * 2.2;
        if (e.t === 'gameover') resultTimer = sim.tick + HZ * 1.2;
      }
      if (resultTimer >= 0 && sim.tick >= resultTimer) {
        resultTimer = -1;
        showResult(sim.phase === 'clear');
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
      drawAim();
      // 発射の溜め音
      if (mode === 'play' && sim && sim.launchCharge > 0) synth.chargeTone(sim.launchCharge);
      else synth.chargeTone(-1);
      // BGM の盛り上がり：連鎖が続くほど、アルペジオが密に明るく。残りの星が少ないほど少し上がる
      if (sim && mode === 'play') {
        const left = sim.starsAlive() / Math.max(1, sim.stars.length);
        musicHeat = Math.max(musicHeat * Math.pow(0.6, realDt), Math.min(1, sim.chainCount * 0.12));
        synth.setMusicIntensity(0.3 + 0.25 * (1 - left) + 0.45 * musicHeat);
      }
      if (sim) {
        const st = stages[stageIndex];
        tl.innerHTML = `<div>${st.endless ? `エンドレス　WAVE ${sim.wave}` : `${stageIndex + 1}. ${st.name}`}</div><div class="big">${sim.score.toLocaleString()}</div>`;
        const balls = sim.ballsLeft + sim.balls.length;
        tr.innerHTML = `<div class="big">${'●'.repeat(Math.min(9, balls))}</div><div>残りの星 ${sim.starsAlive()}　連鎖 ${sim.bestChain}</div>${mode === 'replay' ? '<div style="color:var(--accent)">▶ REPLAY（P で終了）</div>' : autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      }
      tbar.update();
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

  /** 狙いの線：飛んでいく道を点で（先ほど淡く）、最初に当たる星に金の輪 */
  function drawAim(): void {
    aimG.clear();
    if (!sim || mode !== 'play' || sim.phase !== 'play') return;
    const S = VIEW_W / BOARD_W;
    const T = performance.now() / 1000;
    for (const a of aims) {
      const hit = a.target >= 0;
      const col = hit ? 0xffd98a : 0x9fd0ff;
      // 当たる星の手前で止める
      let end = a.path.length;
      if (hit) {
        const q = sim.stars[a.target].body.getPosition();
        const k = a.path.findIndex((p) => Math.hypot(p.x - q.x, p.y - q.y) < sim!.stars[a.target].r + 0.3);
        if (k >= 0) end = k + 1;
      }
      for (let i = 2; i < end; i += 2) {
        const p = a.path[i];
        const f = i / Math.max(1, end);
        aimG.circle(p.x * S, p.y * S, 2.8 - f * 1.2).fill({ color: col, alpha: (hit ? 0.85 : 0.6) * (1 - f * 0.55) });
      }
      if (hit) {
        const st = sim.stars[a.target];
        const q = st.body.getPosition();
        aimG.circle(q.x * S, q.y * S, (st.r + 0.25 + 0.06 * Math.sin(T * 10)) * S).stroke({ width: 2, color: 0xffd98a, alpha: 0.85 });
      }
    }
  }

  const hook = installDebugHook('nova-pinball', () => ({
    mode,
    stage: stageIndex,
    phase: sim?.phase,
    score: sim?.score,
    starsAlive: sim?.starsAlive(),
    bestChain: sim?.bestChain,
    particles: view?.particles.count,
  }));
  hook.start = (i: number) => startStage(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  hook.sim = () => sim;
  hook.lastReplay = () => lastReplay;
  hook.playReplay = (highlight = true) => { if (lastReplay) startReplay(lastReplay, highlight); };
  /** 演出確認用：全部の星を灯して1つ目を点火する（大連鎖→超新星→最後の爆発） */
  hook.ignite = () => {
    if (!sim) return;
    if (recorder) recorder.dirty = true; // 入力によらない変更なので、リプレイは残さない
    for (const s of sim.stars) if (s.alive) s.charge = Math.max(s.charge, 1);
    const first = sim.stars.find((s) => s.alive);
    if (first) (sim as unknown as { addCharge(s: unknown, n: number): void }).addCharge(first, 9);
  };

  loop.start();
  if (params.has('stage')) startStage(Math.min(stages.length - 1, Number(params.get('stage')) || 0));
  else showTitle();
  hook.ready = true;
}

void main();
