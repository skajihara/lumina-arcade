/**
 * HUD とメニューは DOM で作る（文字がくっきり、レイアウトが楽）。
 * 共通のスタイルをここで注入する。
 */
const CSS = `
:root { --ink:#e9ecff; --dim:#8f96c9; --accent:#9fd0ff; --gold:#ffd98a; }
html,body { margin:0; height:100%; overflow:hidden; background:#02030a; color:var(--ink);
  font-family: "Hiragino Maru Gothic ProN","Zen Maru Gothic","Yu Gothic UI","Segoe UI",system-ui,sans-serif; }
canvas#game { display:block; position:fixed; inset:0; }
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
