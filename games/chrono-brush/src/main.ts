/**
 * 時空の絵筆（Chrono Brush）。NEW-01a で実験枠から本編へ昇格（タイトル・難易度・ステージ選択・ポーズ・リザルト・★・保存・調整パネル）。
 * ドラッグで「遅い時間（青）」、右ドラッグで「速い時間（赤）」、Shift＋ドラッグで「逆再生（紫）」を塗り、降ってくる星を籠へ導く。
 * 風は世界の時間で吹くので、遅らせた星ほど風に運ばれる。6ステージ（数字キーか ?stage=N で選ぶ）。
 */
import { createGameApp, installDebugHook } from '@engine/app';
import { Graphics, Sprite, Container } from 'pixi.js';
import { FixedLoop } from '@engine/loop';
import { Juice } from '@engine/juice';
import { synth } from '@engine/audio';
import { Particles } from '@engine/particles';
import { skyTexture, makeStarfield, glowTexture } from '@engine/gfx';
import { injectBaseStyle, el, goTo, resetButton, touchButtons } from '@engine/hud';
import { installNav, launcherButton, settingsRow } from '@engine/nav';
import { Save, clearStored } from '@engine/storage';
import { createTuning } from '@engine/tuning';
import { ruleCards } from '@engine/rules';
import { chronoRules } from './rules';
import { schema, presets, DEFAULT_PRESET, toChrono, type BrushConfig } from './config';
import { ChronoSim, chronoStages, VIEW_W, VIEW_H, HZ, type Brush } from './sim';
import { ChronoBot } from './bot';

const params = new URLSearchParams(location.search);

async function main() {
  injectBaseStyle();
  const ga = await createGameApp(VIEW_W, VIEW_H);
  const juice = new Juice();
  const sky = new Sprite(skyTexture(VIEW_W, VIEW_H, '#0b0d2a', '#020308'));
  const field = makeStarfield(VIEW_W, VIEW_H, 160, 61);
  const zoneG = new Graphics();
  const basketG = new Graphics();
  const starLayer = new Container();
  const particles = new Particles(1500);
  ga.world.addChild(sky, field.container, zoneG, basketG, starLayer, particles.container);
  const hud = el('div', { class: 'hud' });
  const tl = el('div', { class: 'tl' });
  const center = el('div', { class: 'center' });
  hud.append(tl, center);
  document.body.appendChild(hud);

  const tuning = createTuning<BrushConfig>('chrono-brush', schema, presets, DEFAULT_PRESET);
  const cfg = tuning.config;
  const save = new Save<{ cleared: Record<string, number> }>('chrono-brush', { cleared: {} });
  const stageId = (i: number) => `cb-${i + 1}`;
  let stageIndex = Math.min(chronoStages.length - 1, Math.max(0, Number(params.get('stage') ?? 0) || 0));
  let sim = ChronoSim.of(chronoStages[stageIndex], toChrono(cfg));
  let mode: 'menu' | 'play' | 'pause' | 'result' = 'menu';
  let menu: HTMLElement | null = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  let sprites: Sprite[] = [];
  let autoplay = params.has('autoplay');
  let painting: Brush | null = null;
  let t = 0;
  let bot = new ChronoBot(0.85);
  const voidG = new Graphics();
  ga.world.addChildAt(voidG, 2);
  const start = (i: number) => {
    closeMenu();
    mode = 'play';
    stageIndex = i;
    sim = ChronoSim.of(chronoStages[i], toChrono(cfg));
    links = [];
    bot = new ChronoBot(0.85);
    starLayer.removeChildren();
    sprites = [];
    center.innerHTML = `<div style="color:var(--gold)">${chronoStages[i].hint}</div>`;
    setTimeout(() => { if (sim === cur) center.innerHTML = ''; }, 3500);
    const cur = sim;
  };
  const restart = () => start(stageIndex);
  /** 捕まえた所（星座の線の点） */
  let links: { x: number; y: number; age: number }[] = [];
  const linkG = new Graphics();
  ga.world.addChild(linkG);

  /** ★：必要数で★1、残りの半分で★2、残りの 8 割で★3 */
  const starsOf = (caught: number) => {
    const st = chronoStages[stageIndex];
    if (caught < st.need) return 0;
    const rest = sim.cfg.stars - st.need;
    return caught >= st.need + Math.ceil(rest * 0.8) ? 3 : caught >= st.need + Math.ceil(rest * 0.5) ? 2 : 1;
  };

  const showResult = () => {
    mode = 'result';
    const st = chronoStages[stageIndex];
    const stars = starsOf(sim.caught);
    if (stars > 0) {
      save.data.cleared[stageId(stageIndex)] = Math.max(save.data.cleared[stageId(stageIndex)] ?? 0, stars);
      save.write();
    }
    menu = el('div', { class: 'menu' });
    menu.innerHTML = `<h1>${stars ? 'CLEAR' : 'FAILED'}</h1><h2>${st.name}</h2>
      ${stars ? `<p style="font-size:34px;color:var(--gold);letter-spacing:.2em">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>` : ''}
      <p>籠に入れた星 ${sim.caught} / ${sim.cfg.stars}（必要 ${st.need}）</p>
      <p style="font-size:13px">★：必要な数で★1、残りの星の半分で★2、8割で★3</p>
      <div class="row" style="margin-top:12px"></div>`;
    const row = menu.querySelector('.row')!;
    if (stars && stageIndex < chronoStages.length - 1) {
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
    const unlocked = (i: number) => i === 0 || params.has('all') || save.data.cleared[stageId(i - 1)] !== undefined;
    menu.innerHTML = `
      <h1>CHRONO BRUSH</h1>
      <h2>時 空 の 絵 筆</h2>
      <div class="rulebox"></div>
      <p style="max-width:620px;line-height:1.8;font-size:13px">空から星が降ってくる。夜空に<b style="color:#9fc0ff">時間の流れ</b>を塗って、星を星座の籠へ導こう。<br>
      <b style="color:#9fc0ff">青＝遅い時間</b>（星がふわりと浮く）　<b style="color:#ffb3b3">赤＝速い時間</b>（すぐ落ちる）　<b style="color:#d9b3ff">紫＝逆再生</b>（来た道を戻る）<br>
      風は世界の時間で吹く — <b>遅らせた星ほど風に運ばれる</b>。インクは限られている。</p>
      <div class="row diff" style="margin:12px 0"></div>
      <div class="grid"></div>
      <div class="keys"><b>ドラッグ</b>＝遅い（青）　<b>右ドラッグ</b>＝速い（赤）　<b>Shift＋ドラッグ</b>＝逆再生（紫）<br>
      <kbd>P</kbd> ポーズ　<kbd>R</kbd> やり直し　<kbd>T</kbd> 調整パネル　<kbd>M</kbd> 消音<br>スマホ：下のボタンで色を切り替えて、指でなぞる</div>`;
    menu.querySelector('.rulebox')!.replaceWith(ruleCards(chronoRules));
    const diff = menu.querySelector('.diff')!;
    for (const name of Object.keys(presets)) {
      const b = el('button', { class: 'btn small' + (tuning.preset === name ? ' sel' : '') }, name);
      b.onclick = () => { tuning.applyPreset(name); showTitle(); };
      diff.appendChild(b);
    }
    const grid = menu.querySelector('.grid')!;
    chronoStages.forEach((st, i) => {
      const r = save.data.cleared[stageId(i)];
      const ok = unlocked(i);
      const d = el('div', { class: 'stage' + (r ? ' cleared' : '') + (ok ? '' : ' locked') }, `<b>${i + 1}</b>${st.name}<span style="color:var(--gold)">${r ? '★'.repeat(r) : ''}</span>`);
      if (ok) d.onclick = () => { synth.unlock(); start(i); };
      grid.appendChild(d);
    });
    menu.appendChild(resetButton('chrono-brush', '時空の絵筆', clearStored));
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
      menu.appendChild(ruleCards(chronoRules));
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
  // スマホ：色の切り替え（タッチでは右ドラッグ・Shift が使えない）
  let touchBrush: Brush = 'slow';
  const brushName = { slow: '青：遅い', fast: '赤：速い', rewind: '紫：逆再生' } as const;
  const tbar = touchButtons([
    { label: '‖', onPress: () => togglePause() },
    { label: brushName.slow, onPress: () => { touchBrush = touchBrush === 'slow' ? 'fast' : touchBrush === 'fast' ? 'rewind' : 'slow'; } },
  ], 'bottom');

  const paintAt = (cx: number, cy: number) => {
    if (!painting) return;
    const p = ga.toLogical(cx, cy);
    if (sim.paint(p.x, p.y, painting)) synth.tone(painting === 'fast' ? 660 : painting === 'slow' ? 330 : 440, 0.2, { type: 'sine', vol: 0.05, slideTo: painting === 'fast' ? 990 : painting === 'slow' ? 220 : 280 });
  };
  ga.app.canvas.addEventListener('pointerdown', (e) => {
    synth.unlock();
    if (mode !== 'play') return;
    painting = e.pointerType === 'touch' ? touchBrush : e.button === 2 ? 'fast' : e.shiftKey || e.button === 1 ? 'rewind' : 'slow';
    paintAt(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', (e) => paintAt(e.clientX, e.clientY));
  window.addEventListener('pointerup', () => { painting = null; });
  ga.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    synth.unlock();
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'result')) restart();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyT') tuning.toggle();
    if (e.code === 'KeyM') synth.setMuted(!synth.muted);
    if (e.code === 'KeyB' && e.shiftKey) autoplay = !autoplay;
  });
  tuning.onChange((key) => {
    if (key === 'volume') synth.setVolume(cfg.volume);
    if (key === 'bloom') ga.setBloom(cfg.bloom);
  });
  synth.setVolume(cfg.volume);
  synth.setMusicStyle('chrono');
  ga.setBloom(cfg.bloom);

  const loop = new FixedLoop({
    update: () => {
      if (mode !== 'play' && mode !== 'result') return;
      if (mode === 'play' && autoplay) bot.act(sim);
      sim.step();
      for (const e of sim.events) {
        if (e.t === 'catch') {
          // 捕まえた星どうしを金の線で結ぶ（籠に星座が描かれていく）
          links.push({ x: e.x, y: e.y, age: 0 });
          juice.hitstop(0.03);
          particles.emit(e.x, e.y, { count: 40, speed: [60, 300], life: [0.4, 1], size: [0.05, 0.18], color: [0xffd98a, 0xffffff] });
          synth.hbell(3 + e.n, 0.1, 1.2);
          juice.shake(0.1);
        } else if (e.t === 'miss') {
          particles.emit(e.x, e.y, { count: 14, speed: [30, 120], life: [0.2, 0.5], size: [0.04, 0.1], color: 0x6a74c9 });
          synth.tone(200, 0.3, { type: 'sine', vol: 0.06, slideTo: 90 });
        } else if (e.t === 'void') {
          particles.emit(e.x, e.y, { count: 20, speed: [20, 90], life: [0.3, 0.7], size: [0.04, 0.1], color: [0x6a3a9a, 0x2a1a4a] });
          synth.tone(120, 0.5, { type: 'sine', vol: 0.08, slideTo: 50 });
        } else if (e.t === 'end') {
          if (sim.cleared) { juice.doFlash(0.5, 0xffe7a8); synth.arp([0, 2, 4, 7, 9], 0.07, 0.1); juice.slowmo(0.4, 0.8); }
          else synth.tone(196, 1.0, { type: 'sine', vol: 0.12, slideTo: 80 });
          const cur = sim;
          setTimeout(() => { if (sim === cur && mode === 'play') showResult(); }, 1400);
        }
      }
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
      // 塗った時間：遅い所は青い渦、速い所は赤い筋
      zoneG.clear();
      for (const z of sim.zones) {
        const col = z.k === 'slow' ? 0x5a8cff : z.k === 'fast' ? 0xff6b6b : 0xc07bff;
        const fade = sim.cfg.zoneLife > 0 ? Math.min(1, (sim.cfg.zoneLife - z.age) / 1.5) : 1;
        zoneG.circle(z.x, z.y, z.r).fill({ color: col, alpha: 0.12 * fade });
        for (let k = 0; k < 3; k++) {
          // 逆再生の渦は逆向きに回る
          const a = (z.k === 'slow' ? t * 0.4 : z.k === 'fast' ? t * 3 : -t * 1.5) + (k * Math.PI * 2) / 3;
          const rr = z.r * (0.5 + k * 0.2);
          zoneG.moveTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr).arc(z.x, z.y, rr, a, a + 1.4).stroke({ width: 2, color: col, alpha: 0.4 * fade });
        }
      }
      // 虚空：星を飲む黒い穴（縁がゆっくり回る）
      voidG.clear();
      for (const v of sim.stage?.voids ?? []) {
        voidG.circle(v.x, v.y, v.r * 1.3).fill({ color: 0x000000, alpha: 0.35 });
        voidG.circle(v.x, v.y, v.r).fill({ color: 0x05030c, alpha: 0.95 });
        for (let k = 0; k < 8; k++) {
          const a = -t * 0.8 + (k * Math.PI) / 4;
          voidG.moveTo(v.x + Math.cos(a) * v.r, v.y + Math.sin(a) * v.r).arc(v.x, v.y, v.r, a, a + 0.3).stroke({ width: 2, color: 0x8a5acd, alpha: 0.6 });
        }
      }
      // 捕まえた星の星座：籠の上に、捕まえた順に点を並べて線で結ぶ（新しい線ほど明るく）
      linkG.clear();
      links.forEach((l) => { l.age += dt; });
      const lx = (k: number) => VIEW_W / 2 + (k - (links.length - 1) / 2) * 34;
      const ly = (k: number) => 70 + Math.sin(k * 1.7) * 14;
      for (let k = 0; k < links.length; k++) {
        const a = Math.min(1, links[k].age * 3);
        // 籠から星座の点へ飛んでいく光
        const f = Math.min(1, links[k].age / 0.6);
        if (f < 1) linkG.moveTo(links[k].x, links[k].y).lineTo(links[k].x + (lx(k) - links[k].x) * f, links[k].y + (ly(k) - links[k].y) * f).stroke({ width: 2, color: 0xffd98a, alpha: 0.8 * (1 - f) });
        linkG.circle(lx(k), ly(k), 3.5 + 2 * Math.max(0, 1 - links[k].age)).fill({ color: 0xfff1c8, alpha: a });
        if (k > 0) linkG.moveTo(lx(k - 1), ly(k - 1)).lineTo(lx(k), ly(k)).stroke({ width: 1.5, color: 0xffd98a, alpha: 0.5 * a });
      }
      // 籠
      const bx = sim.basketX(), by = VIEW_H - 40, w = sim.cfg.basketW;
      basketG.clear();
      basketG.moveTo(bx - w / 2, by - 20).lineTo(bx - w / 2 + 12, by + 12).lineTo(bx + w / 2 - 12, by + 12).lineTo(bx + w / 2, by - 20).stroke({ width: 3, color: 0xffd98a, alpha: 0.85 });
      for (const [px, py] of [[bx - w / 2, by - 20], [bx - w / 2 + 12, by + 12], [bx + w / 2 - 12, by + 12], [bx + w / 2, by - 20]]) basketG.circle(px, py, 3.5).fill({ color: 0xffffff });
      // 星
      while (sprites.length < sim.stars.length) {
        const sp = new Sprite(glowTexture());
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        sp.scale.set(0.35);
        starLayer.addChild(sp);
        sprites.push(sp);
      }
      sim.stars.forEach((s, i) => {
        const sp = sprites[i];
        sp.visible = s.alive;
        sp.x = s.x; sp.y = s.y;
        const r = sim.rate(s.x, s.y);
        sp.tint = r < 0 ? 0xd9b3ff : r < 1 ? 0x9fc0ff : r > 1 ? 0xffb3b3 : 0xfff3d6;
      });
      if (mode === 'menu') tl.innerHTML = '';
      else tl.innerHTML = `<div>${stageIndex + 1}. ${chronoStages[stageIndex].name}</div><div class="big">籠 ${sim.caught} / ${chronoStages[stageIndex].need}<span style="font-size:14px;color:var(--dim)">（星 ${sim.cfg.stars}）</span></div><div style="font-size:13px;color:var(--dim)">インク ${'●'.repeat(Math.min(30, sim.ink))} ${sim.ink}<br>ドラッグ＝遅い（青）　右ドラッグ＝速い（赤）　Shift＋ドラッグ＝逆再生（紫）</div>${autoplay ? '<div style="color:var(--gold)">AUTO</div>' : ''}`;
      tbar.update();
      const tb = tbar.el.querySelectorAll('button')[1];
      if (tb) tb.textContent = brushName[touchBrush];
      hook.frames++;
    },
  }, HZ);
  juice.attach(loop);
  const hook = installDebugHook('chrono-brush', () => ({ mode, stage: stageIndex, phase: sim.done ? (sim.cleared ? 'clear' : 'fail') : 'play', caught: sim.caught, missed: sim.missed, ink: sim.ink, done: sim.done, cleared: sim.cleared }));
  hook.start = (i: number) => start(i);
  hook.setAutoplay = (on: boolean) => { autoplay = on; };
  // ?stage=N&autoplay=1 ならすぐに始める。それ以外はタイトルから
  if (params.has('stage') || autoplay) start(stageIndex);
  else showTitle();
  loop.start();
  hook.ready = true;
}

void main();
