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
.back { position:fixed; left:12px; bottom:10px; z-index:15; font-size:12px; color:var(--dim); text-decoration:none; pointer-events:auto; }
`;

export function injectBaseStyle(extra = ''): void {
  const st = document.createElement('style');
  st.textContent = CSS + extra;
  document.head.appendChild(st);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

/** ランチャーへ戻るリンク（同じフォルダに index.html がある前提） */
export function backLink(): HTMLAnchorElement {
  const a = el('a', { class: 'back', href: './index.html' }, '← 星図へ戻る');
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
