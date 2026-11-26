/**
 * HUD とメニューは DOM で作る（文字がくっきり、レイアウトが楽）。
 * 共通のスタイルをここで注入する。
 */
const CSS = `
:root { --ink:#e9ecff; --dim:#8f96c9; --accent:#9fd0ff; --gold:#ffd98a; }
html,body { margin:0; height:100%; overflow:hidden; background:#02030a; color:var(--ink);
  font-family: "Hiragino Maru Gothic ProN","Zen Maru Gothic","Yu Gothic UI","Segoe UI",system-ui,sans-serif; }
canvas#game { display:block; position:fixed; inset:0; touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
.hud { position:fixed; inset:0; pointer-events:none; z-index:10; }
.hud .tl,.hud .tr { position:absolute; top:12px; font-size:15px; letter-spacing:.08em; text-shadow:0 0 8px #000; }
.hud .tl { left:16px } .hud .tr { right:16px; text-align:right }
.hud .big { font-size:26px; font-weight:700; }
.hud .center { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); text-align:center; }
.chain { font-size:54px; font-weight:800; letter-spacing:.06em; color:#fff;
  text-shadow:0 0 18px var(--accent), 0 0 42px #5a7dff; transition:opacity .3s; transform-origin:center bottom; margin-bottom:10px; }
.toast { font-size:22px; color:var(--gold); text-shadow:0 0 12px #b8860b; opacity:0; transition:opacity .4s, transform .4s; }
.toast.show { opacity:1; transform:translateY(-8px); }
.menu { position:fixed; inset:0; z-index:20; display:flex; flex-direction:column; align-items:center; justify-content:safe center;
  overflow-y:auto; padding:16px 0; box-sizing:border-box;
  background:radial-gradient(ellipse at center, rgba(10,14,48,.72), rgba(2,3,10,.92)); backdrop-filter: blur(3px); pointer-events:auto; }
.menu h1 { font-size:clamp(28px, 7vw, 44px); text-align:center; margin:0 0 6px; letter-spacing:.14em; font-weight:800;
  background:linear-gradient(180deg,#fff,#9fd0ff); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 14px #5a7dff); }
.menu h2 { font-size:15px; margin:0 0 22px; color:var(--dim); letter-spacing:.3em; font-weight:400; }
.menu p { color:var(--dim); max-width:520px; text-align:center; line-height:1.7; margin:6px 16px; }
.btn { pointer-events:auto; cursor:pointer; border:1px solid #5866b8; background:rgba(40,50,120,.35); color:var(--ink);
  padding:10px 22px; margin:6px; border-radius:999px; font-size:16px; letter-spacing:.1em; transition:all .15s; font-family:inherit; }
.btn:hover,.btn:focus { background:rgba(90,110,230,.55); box-shadow:0 0 18px #5a7dff; outline:none; }
.btn.small { padding:6px 14px; font-size:13px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(84px, 1fr)); gap:10px; margin:14px 0; width:min(430px, calc(100vw - 32px)); }
.stage { height:clamp(58px, 9vh, 78px); border-radius:14px; border:1px solid #39407a; background:rgba(20,24,60,.6); cursor:pointer;
  display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:13px; color:var(--dim); }
.stage b { font-size:22px; color:var(--ink); }
.stage.cleared { border-color:#c9a64a; box-shadow: inset 0 0 14px rgba(255,217,138,.25); }
.stage.locked { opacity:.35; cursor:default; }
.stage:not(.locked):hover { box-shadow:0 0 16px #5a7dff; }
.row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:center; }
.sel { background:rgba(90,110,230,.7); box-shadow:0 0 14px #5a7dff; }
.keys { font-size:13px; color:var(--dim); margin-top:14px; text-align:center; line-height:1.8; }
kbd { border:1px solid #4a5290; border-radius:5px; padding:1px 6px; font-size:12px; color:var(--ink); }
.tbar { position:fixed; left:50%; transform:translateX(-50%); z-index:15; display:flex; gap:10px; pointer-events:none; }
.tbar.bottom { bottom:max(14px, env(safe-area-inset-bottom)); }
.tbar.top { top:max(46px, env(safe-area-inset-top)); }
/* 横持ちのスマホ：下は遊ぶ場所なので、右の余白に縦に並べる */
@media (orientation: landscape) and (max-height: 520px) {
  .tbar.bottom { left:auto; right:max(8px, env(safe-area-inset-right)); bottom:auto; top:50%; transform:translateY(-50%); flex-direction:column; align-items:flex-end; }
  .tbar.bottom .tbtn { height:46px; min-width:46px; padding:0 10px; font-size:13px; }
}
.tbtn { pointer-events:auto; touch-action:manipulation; -webkit-tap-highlight-color:transparent; user-select:none; -webkit-user-select:none;
  min-width:54px; height:54px; padding:0 14px; border-radius:27px; border:1px solid rgba(120,140,255,.55);
  background:rgba(20,26,70,.55); color:var(--ink); font-family:inherit; font-size:15px; letter-spacing:.06em;
  white-space:nowrap; box-shadow:0 0 14px rgba(90,125,255,.25); backdrop-filter:blur(2px); transition:background .12s, box-shadow .12s, transform .08s; }
.tbtn.on { background:rgba(255,217,138,.32); border-color:#ffd98a; box-shadow:0 0 18px rgba(255,217,138,.6); color:#fff; }
.tbtn:active { transform:scale(.93); background:rgba(90,110,230,.6); }
.tbar.top .tbtn { height:40px; min-width:40px; border-radius:20px; font-size:14px; opacity:.75; }
.rotnote { display:none; position:fixed; left:0; right:0; top:22%; text-align:center; z-index:12; font-size:13px; color:var(--dim); letter-spacing:.12em; pointer-events:none; text-shadow:0 0 8px #000; }
@media (orientation: portrait) { .touch-ui .rotnote { display:block; } }
@media (max-width:520px) {
  .hud .tl,.hud .tr { font-size:12px; top:8px; letter-spacing:.04em; } .hud .tl { left:10px } .hud .tr { right:10px }
  .hud .big { font-size:20px; } .gbar { font-size:8px; }
}
.touch-ui .tlift { bottom:84px !important; }
.back { position:fixed; left:12px; bottom:10px; z-index:15; font-size:12px; color:var(--dim); text-decoration:none; pointer-events:auto; transition:color .2s, text-shadow .2s; }
.back:hover { color:var(--ink); text-shadow:0 0 10px #7f9cff; }

/* ---------- UI-01：幻想的な UI（ガラスの光るパネル、舞う星の粒、光の流れ、入ってくる動き） ---------- */
@keyframes lm-fade { from { opacity:0 } to { opacity:1 } }
@keyframes lm-in { from { opacity:0; transform:translateY(16px) scale(.98); filter:blur(5px) } to { opacity:1; transform:none; filter:none } }
@keyframes lm-shimmer { from { background-position:200% 50% } to { background-position:0% 50% } }
@keyframes lm-drift { from { transform:translate3d(0,0,0) } to { transform:translate3d(-240px,-480px,0) } }
@keyframes lm-drift2 { from { transform:translate3d(0,0,0) } to { transform:translate3d(180px,-360px,0) } }
@keyframes lm-aurora { 0%,100% { opacity:.55; transform:translateX(-5%) scaleY(1) rotate(-2deg) } 50% { opacity:1; transform:translateX(5%) scaleY(1.2) rotate(2deg) } }
@keyframes lm-sweep { from { transform:translateX(-140%) skewX(-22deg) } to { transform:translateX(260%) skewX(-22deg) } }
@keyframes lm-breathe { 0%,100% { box-shadow:inset 0 0 14px rgba(255,217,138,.22), 0 0 10px rgba(255,217,138,.12) } 50% { box-shadow:inset 0 0 20px rgba(255,217,138,.38), 0 0 22px rgba(255,217,138,.3) } }
.menu { animation:lm-fade .5s ease both; isolation:isolate;
  background:radial-gradient(ellipse at 50% 30%, rgba(44,34,110,.62), rgba(8,10,36,.86) 58%, rgba(2,3,10,.95));
  backdrop-filter:blur(7px) saturate(1.25); -webkit-backdrop-filter:blur(7px) saturate(1.25); }
/* 舞う星の粒（2層、違う速さで上へ流れる） */
.menu::before, .menu::after { content:''; position:fixed; inset:-60% -60% -60% -60%; pointer-events:none; z-index:-1; }
.menu::before { opacity:.7; animation:lm-drift 70s linear infinite;
  background-image:
    radial-gradient(1.6px 1.6px at 22px 34px, rgba(255,255,255,.95), transparent 60%),
    radial-gradient(1.2px 1.2px at 140px 80px, rgba(191,232,255,.9), transparent 60%),
    radial-gradient(2px 2px at 90px 190px, rgba(255,231,176,.85), transparent 60%),
    radial-gradient(1px 1px at 200px 140px, rgba(255,255,255,.8), transparent 60%),
    radial-gradient(1.4px 1.4px at 60px 230px, rgba(201,163,255,.85), transparent 60%);
  background-size:250px 250px; }
.menu::after { opacity:.45; animation:lm-drift2 110s linear infinite;
  background-image:
    radial-gradient(2.4px 2.4px at 50px 60px, rgba(159,208,255,.7), transparent 65%),
    radial-gradient(1.8px 1.8px at 300px 210px, rgba(255,163,224,.6), transparent 65%),
    radial-gradient(2.8px 2.8px at 180px 330px, rgba(255,255,255,.55), transparent 65%);
  background-size:400px 400px; filter:blur(.4px); }
/* オーロラの帯（メニューの上の方でゆっくり揺れる） */
.menu > .aurora { position:fixed; left:-15%; right:-15%; top:-18%; height:62%; pointer-events:none; z-index:-1; filter:blur(28px);
  background:radial-gradient(ellipse 45% 38% at 28% 55%, rgba(127,240,255,.22), transparent 70%),
             radial-gradient(ellipse 40% 34% at 70% 45%, rgba(201,163,255,.26), transparent 70%),
             radial-gradient(ellipse 30% 26% at 50% 70%, rgba(255,210,150,.12), transparent 70%);
  animation:lm-aurora 16s ease-in-out infinite; }
/* 中身は少しずつ遅れて浮かび上がる */
.menu > *:not(.aurora) { animation:lm-in .7s cubic-bezier(.2,.8,.2,1) both; }
.menu > *:nth-child(2) { animation-delay:.04s } .menu > *:nth-child(3) { animation-delay:.09s } .menu > *:nth-child(4) { animation-delay:.14s }
.menu > *:nth-child(5) { animation-delay:.19s } .menu > *:nth-child(6) { animation-delay:.24s } .menu > *:nth-child(7) { animation-delay:.29s }
.menu > *:nth-child(n+8) { animation-delay:.34s }
.menu h1 { background:linear-gradient(100deg,#ffffff 18%,#9fd0ff 36%,#ffe7b0 50%,#c9a3ff 64%,#ffffff 82%); background-size:200% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent; animation:lm-in .7s cubic-bezier(.2,.8,.2,1) both, lm-shimmer 7s linear infinite;
  filter:drop-shadow(0 0 16px rgba(110,140,255,.85)) drop-shadow(0 0 40px rgba(160,120,255,.35)); }
.menu h2 { text-shadow:0 0 12px rgba(120,150,255,.6); }
/* ガラスのボタン：上に光の縁、触れると光が横切る */
.btn { position:relative; overflow:hidden; border:1px solid rgba(170,185,255,.45);
  background:linear-gradient(180deg, rgba(130,150,255,.26), rgba(36,44,120,.32) 55%, rgba(24,28,80,.4));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), inset 0 -8px 16px rgba(10,12,40,.35), 0 6px 22px rgba(6,8,40,.55);
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); text-shadow:0 0 8px rgba(160,190,255,.6);
  transition:transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .2s, background .2s, border-color .2s; }
.btn::after { content:''; position:absolute; top:0; bottom:0; left:0; width:40%; pointer-events:none;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); transform:translateX(-140%) skewX(-22deg); }
.btn:hover::after, .btn:focus::after { animation:lm-sweep .8s ease; }
.btn:hover, .btn:focus { transform:translateY(-2px); border-color:rgba(200,215,255,.8);
  background:linear-gradient(180deg, rgba(150,170,255,.4), rgba(70,90,210,.45) 55%, rgba(40,50,140,.5));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35), 0 0 24px rgba(110,140,255,.75), 0 0 60px rgba(150,110,255,.25); }
.btn:active { transform:translateY(0) scale(.97); }
.btn.sel, .sel { border-color:#ffd98a; background:linear-gradient(180deg, rgba(255,217,138,.32), rgba(120,90,200,.4));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 0 22px rgba(255,217,138,.45); }
/* ステージの札：ガラスの板、触れると浮かぶ。クリアした札は金色に息をする */
.stage { position:relative; overflow:hidden; border:1px solid rgba(120,135,230,.35);
  background:linear-gradient(160deg, rgba(60,70,160,.35), rgba(16,20,60,.55) 60%, rgba(30,22,80,.5));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12), 0 6px 18px rgba(4,6,30,.5);
  backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
  transition:transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s, border-color .2s; }
.stage::after { content:''; position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle at 30% 0%, rgba(255,255,255,.16), transparent 55%); }
.stage b { text-shadow:0 0 10px rgba(160,190,255,.7); }
.stage:not(.locked):hover { transform:translateY(-4px) scale(1.03); border-color:rgba(190,205,255,.8);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.25), 0 0 22px rgba(110,140,255,.65), 0 10px 26px rgba(4,6,30,.6); }
.stage.cleared { border-color:rgba(255,217,138,.65); animation:lm-breathe 4s ease-in-out infinite; }
.keys { opacity:.85 }
kbd { background:rgba(60,70,160,.3); box-shadow:inset 0 -1px 0 rgba(0,0,0,.4); }
/* HUD の文字にやわらかい光 */
.hud .tl, .hud .tr { text-shadow:0 0 8px #000, 0 0 14px rgba(110,140,255,.45); }
.hud .big { text-shadow:0 0 10px #000, 0 0 18px rgba(140,170,255,.7); }
.toast { text-shadow:0 0 12px #b8860b, 0 0 28px rgba(255,200,120,.45); }
/* 画面の切り替え：暗転してから移る */
.lm-veil { position:fixed; inset:0; z-index:100; pointer-events:none; background:radial-gradient(circle at 50% 50%, #0b0f33, #000); opacity:0; transition:opacity .35s ease; }
.lm-veil.on { opacity:1; pointer-events:auto; }
@media (prefers-reduced-motion: reduce) { .menu::before, .menu::after, .menu > .aurora, .menu h1, .stage.cleared { animation:none !important; } }
`;

export function injectBaseStyle(extra = ''): void {
  const st = document.createElement('style');
  st.textContent = CSS + extra;
  document.head.appendChild(st);
  if (document.body) watchMenus();
  else addEventListener('DOMContentLoaded', watchMenus, { once: true });
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

/**
 * メニュー（タイトル・ポーズ・リザルト）にオーロラの帯を足す。innerHTML で中身を入れた後でも残るよう、
 * 画面に入った時（MutationObserver）に先頭へ差し込む
 */
let auroraWatch = false;
function watchMenus(): void {
  if (auroraWatch || typeof MutationObserver === 'undefined') return;
  auroraWatch = true;
  const add = (m: Element) => {
    if (!m.classList.contains('menu') || m.querySelector(':scope > .aurora')) return;
    m.insertBefore(el('div', { class: 'aurora' }), m.firstChild);
  };
  new MutationObserver((list) => {
    for (const r of list) r.addedNodes.forEach((n) => { if (n instanceof Element) add(n); });
  }).observe(document.body, { childList: true });
}

/** 暗転してから別のページへ移る（画面の切り替えの遷移） */
export function goTo(href: string): void {
  let v = document.querySelector('.lm-veil');
  if (!v) { v = el('div', { class: 'lm-veil' }); document.body.appendChild(v); }
  requestAnimationFrame(() => v!.classList.add('on'));
  setTimeout(() => { location.href = href; }, 360);
}

/** ランチャーへ戻るリンク（同じフォルダに index.html がある前提） */
export function backLink(): HTMLAnchorElement {
  const a = el('a', { class: 'back', href: './index.html' }, '← 星図へ戻る');
  a.addEventListener('click', (e) => { e.preventDefault(); goTo('./index.html'); });
  document.body.appendChild(a);
  return a;
}

export interface TouchButton {
  /** ボタンの文字（短く） */
  label: string;
  onPress: () => void;
  /** 毎フレーム呼んで、押されている状態（金色）と文字を更新する */
  state?: () => { on?: boolean; label?: string; hidden?: boolean };
}

/** タッチ操作の画面かどうか（`?touch=1` で強制的に表示、`?touch=0` で隠す） */
export function isTouchUi(): boolean {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/**
 * スマホ・タブレット用の画面ボタン（キーボードでしかできない操作の代わり）。
 * タッチの画面でだけ出る。パソコンでも最初に画面をタッチした時点で出る。
 * menu（z-index 20）より下なので、タイトル・ポーズ・リザルトの間は隠れる。
 */
export function touchButtons(buttons: TouchButton[], pos: 'bottom' | 'top' = 'bottom', opts: { landscape?: boolean } = {}): { el: HTMLDivElement; update(): void } {
  const bar = el('div', { class: `tbar ${pos}` });
  // 横長の画面のゲームは、縦持ちだと小さいので一言そえる
  if (opts.landscape) document.body.appendChild(el('div', { class: 'rotnote' }, '⟲ 横向きにすると大きく遊べます'));
  const els = buttons.map((b) => {
    const e = el('button', { class: 'tbtn', type: 'button' }, b.label);
    // pointerdown で即反応（click の遅延を待たない）。キャンバスへは伝えない
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); b.onPress(); });
    e.addEventListener('click', (ev) => ev.preventDefault());
    bar.appendChild(e);
    return e;
  });
  const show = (on: boolean) => { bar.style.display = on ? 'flex' : 'none'; document.body.classList.toggle('touch-ui', on); };
  show(isTouchUi());
  if (new URLSearchParams(location.search).get('touch') !== '0') {
    window.addEventListener('touchstart', () => show(true), { once: true, passive: true });
  }
  document.body.appendChild(bar);
  const last: string[] = buttons.map((b) => b.label);
  return {
    el: bar,
    update() {
      if (bar.style.display === 'none') return;
      buttons.forEach((b, i) => {
        if (!b.state) return;
        const st = b.state();
        els[i].classList.toggle('on', !!st.on);
        els[i].style.display = st.hidden ? 'none' : '';
        const lb = st.label ?? b.label;
        if (lb !== last[i]) { els[i].textContent = lb; last[i] = lb; }
      });
    },
  };
}

/** タッチの画面なら、説明文の「クリック」「Space」などをタッチの言い方に置き換える */
export function touchText(text: string, pairs: [string, string][]): string {
  if (!document.body.classList.contains('touch-ui')) return text;
  let t = text;
  for (const [a, b] of pairs) t = t.split(a).join(b);
  return t;
}

/**
 * 確認ダイアログ（UX-02）。何が起きるかの一覧と、元に戻せないことを見せる。danger なら決定ボタンを赤く。
 * 「やめる」・Esc・外側のクリックで false、決定で true。
 */
export function confirmDialog(opts: { title: string; items?: string[]; note?: string; ok: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'lumina-confirm';
    bg.setAttribute('role', 'dialog');
    bg.setAttribute('aria-modal', 'true');
    bg.innerHTML = `<div class="box"><h3></h3>${opts.items?.length ? '<ul></ul>' : ''}${opts.note ? '<p class="note"></p>' : ''}<div class="row"><button class="cancel"></button><button class="ok${opts.danger ? ' danger' : ''}"></button></div></div>`;
    bg.querySelector('h3')!.textContent = opts.title;
    const ul = bg.querySelector('ul');
    for (const it of opts.items ?? []) { const li = document.createElement('li'); li.textContent = it; ul?.appendChild(li); }
    const note = bg.querySelector('.note');
    if (note) note.textContent = opts.note!;
    const okB = bg.querySelector<HTMLButtonElement>('.ok')!, noB = bg.querySelector<HTMLButtonElement>('.cancel')!;
    okB.textContent = opts.ok;
    noB.textContent = opts.cancel ?? 'やめる';
    if (!document.getElementById('lumina-confirm-style')) {
      const st = document.createElement('style');
      st.id = 'lumina-confirm-style';
      st.textContent = `.lumina-confirm{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(4,6,20,.72);backdrop-filter:blur(4px);pointer-events:auto;font-family:system-ui,sans-serif}
.lumina-confirm .box{max-width:min(440px,calc(100vw - 32px));background:rgba(20,24,60,.96);border:1px solid rgba(160,180,255,.35);border-radius:16px;padding:22px 22px 18px;color:#e8ecff;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.lumina-confirm h3{margin:0 0 10px;font-size:18px;letter-spacing:.05em}
.lumina-confirm ul{margin:0 0 10px;padding-left:1.2em;font-size:14px;line-height:1.7;color:#c9d0ff}
.lumina-confirm .note{margin:0 0 14px;font-size:13px;color:#ff9db0}
.lumina-confirm .row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.lumina-confirm button{min-height:44px;min-width:96px;padding:0 18px;border-radius:22px;border:1px solid rgba(160,180,255,.4);background:rgba(60,70,140,.5);color:#e8ecff;font-size:15px;cursor:pointer}
.lumina-confirm button.danger{background:#c8324f;border-color:#ff6b8a;color:#fff}
.lumina-confirm button:focus-visible{outline:2px solid #ffd98a;outline-offset:2px}`;
      document.head.appendChild(st);
    }
    const done = (v: boolean) => { removeEventListener('keydown', onKey, true); bg.remove(); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } };
    addEventListener('keydown', onKey, true);
    okB.addEventListener('click', () => done(true));
    noB.addEventListener('click', () => done(false));
    bg.addEventListener('pointerdown', (e) => { if (e.target === bg) done(false); });
    document.body.appendChild(bg);
    noB.focus();
  });
}

/**
 * タイトルに置く「この作品の記録を消す」ボタン（UX-02）。確認してから消し、ページを読み直す
 */
export function resetButton(gameId: string, gameName: string, clear: (id: string) => number): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'reset-data';
  b.textContent = 'この作品の記録を消す';
  b.style.cssText = 'margin-top:14px;background:none;border:none;color:var(--dim,#8f96c9);font-size:12px;text-decoration:underline;cursor:pointer;min-height:32px';
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `「${gameName}」の記録を消しますか？`,
      items: ['クリアしたステージと★', 'ベスト記録・リプレイ', '調整パネルの設定（難易度・音量など）'],
      note: '消した記録は元に戻せません。',
      ok: '消す',
      danger: true,
    });
    if (!ok) return;
    clear(gameId);
    location.reload();
  });
  return b;
}
