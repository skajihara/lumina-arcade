/** Nova Pinball：画面遷移・HUD・入力をまとめる */
import { createGameApp, installDebugHook } from '@engine/app';
import { FixedLoop } from '@engine/loop';
import { Input } from '@engine/input';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { createTuning } from '@engine/tuning';
import { Save } from '@engine/storage';
import { injectBaseStyle, el, backLink } from '@engine/hud';
import { schema, presets, DEFAULT_PRESET, type NovaConfig } from './config';
import { stages } from './stages';
import { NovaSim, HZ } from './sim';
import { NovaView, VIEW_H, VIEW_W, chainTier } from './view';
import { NovaBot } from './bot';

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
  const tuning = createTuning<NovaConfig>('nova-pinball', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<Progress>('nova-pinball', { cleared: {}, best: {} });
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
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  let autoplay = params.has('autoplay');
  let bot = new NovaBot(1, 0.85);
  let resultTimer = -1;

  const closeMenu = () => { menu?.remove(); menu = null; };

  const startStage = (i: number) => {
    closeMenu();
    stageIndex = i;
    view?.destroy();
    sim = new NovaSim(stages[i], cfg);
    view = new NovaView(sim, juice, cfg, hudApi);
    ga.world.removeChildren();
    ga.world.addChild(view.container);
    hudApi.chain(0);
    hudApi.toast(stages[i].hint);
    mode = 'play';
    resultTimer = -1;
    bot = new NovaBot(i + 1, 0.85);
    // ステージごとにキー（環境音の根音と和音）を変える
    synth.setKey(STAGE_KEYS[i % STAGE_KEYS.length]);
  };

  const rating = (s: NovaSim) => {
    let r = 1;
    if (s.supernova) r++;
    if (s.bestChain >= Math.ceil(s.stars.length * 0.6)) r++;
    return r;
  };

  const showResult = (cleared: boolean) => {
    if (!sim) return;
    mode = 'result';
    hudApi.chain(0);
    const st = stages[stageIndex];
    const stars = cleared ? rating(sim) : 0;
    if (cleared) {
      save.data.cleared[st.id] = Math.max(save.data.cleared[st.id] ?? 0, stars);
      save.data.best[st.id] = Math.max(save.data.best[st.id] ?? 0, sim.score);
      save.write();
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `
      <h1>${cleared ? 'STAGE CLEAR' : 'GAME OVER'}</h1>
      <h2>${st.name}</h2>
      ${cleared ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>スコア <b style="font-size:22px;color:var(--ink)">${sim.score.toLocaleString()}</b>　最大連鎖 <b style="color:var(--ink)">${sim.bestChain}</b>　星座 ${sim.litLinks.size}/${st.links.length}</p>
      <p style="font-size:13px">★2：星座の線を全部灯す（超新星）　★3：星の6割以上を1回の連鎖で</p>
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
      <h1>NOVA PINBALL</h1>
      <h2>星 爆 ピ ン ボ ー ル</h2>
      <p>星に当てるたびにチャージが溜まり、満タンで爆発。爆発は周りの星をチャージする。<br>
      一度当てた星は灯ったまま。全部灯してから一気に点火して、夜空を燃やし尽くせ。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><kbd>←</kbd>/<kbd>Z</kbd> 左フリッパー　<kbd>→</kbd>/<kbd>/</kbd> 右フリッパー　<kbd>Space</kbd> 長押しで発射<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：画面の左下／右下でフリッパー、上半分で発射</div>`;
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

  const loop = new FixedLoop({
    update: () => {
      const mask = input.sample();
      if (mode !== 'play' || !sim || !view) return;
      let m = mask;
      if (autoplay) m |= bot.input(sim);
      sim.step(m);
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
      // 発射の溜め音
      if (mode === 'play' && sim && sim.launchCharge > 0) synth.chargeTone(sim.launchCharge);
      else synth.chargeTone(-1);
      if (sim) {
        const st = stages[stageIndex];
        tl.innerHTML = `<div>${stageIndex + 1}. ${st.name}</div><div class="big">${sim.score.toLocaleString()}</div>`;
        const balls = sim.ballsLeft + sim.balls.length;
        tr.innerHTML = `<div class="big">${'●'.repeat(Math.min(9, balls))}</div><div>残りの星 ${sim.starsAlive()}　連鎖 ${sim.bestChain}</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      }
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);

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
  /** 演出確認用：全部の星を灯して1つ目を点火する（大連鎖→超新星→最後の爆発） */
  hook.ignite = () => {
    if (!sim) return;
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
