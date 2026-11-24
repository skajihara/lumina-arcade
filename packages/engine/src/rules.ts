/**
 * 図解ルールカード：絵（小さなアニメーション）＋短い文の3〜4コマで、
 * 「何をする → どうなる → 勝ち条件」を目に見える形で示す。
 * タイトルとポーズ画面に置く。絵は Canvas2D で描く（素材なし）。
 */
import { el } from './hud';

export interface RuleFrame {
  /** 短い説明（1〜2行） */
  caption: string;
  /** t：秒（コマごとにくり返す）。w×h は CSS ピクセル */
  draw: (g: CanvasRenderingContext2D, t: number, w: number, h: number) => void;
}

const CSS = `
.rules { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin:4px 0 10px; width:min(620px, calc(100vw - 24px)); }
.rule { width:136px; display:flex; flex-direction:column; align-items:center; }
.rule canvas { width:136px; height:96px; border-radius:12px; border:1px solid rgba(110,125,220,.45);
  background:radial-gradient(ellipse at 50% 40%, rgba(40,48,120,.55), rgba(6,8,26,.9)); box-shadow:0 0 14px rgba(70,90,220,.18); }
.rule .cap { font-size:12px; line-height:1.45; color:var(--ink); text-align:center; margin-top:5px; letter-spacing:.02em; }
.rule .cap b { color:var(--gold); font-weight:600; margin-right:3px; }
@media (max-width:520px) { .rule { width:42vw; } .rule canvas { width:42vw; height:calc(42vw * .7); } }
@keyframes ic-in { from { opacity:0; transform:translate(-50%, -18px) scale(.96) } to { opacity:1; transform:translate(-50%, 0) } }
.intro-card { position:fixed; left:50%; top:max(58px, 7vh); transform:translateX(-50%); z-index:14; display:flex; align-items:center; gap:12px;
  padding:10px 16px 10px 10px; border-radius:16px; max-width:min(520px, calc(100vw - 24px)); box-sizing:border-box; cursor:pointer;
  background:linear-gradient(160deg, rgba(70,80,190,.5), rgba(14,18,56,.82) 60%, rgba(40,26,96,.75)); border:1px solid rgba(255,217,138,.55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.2), 0 0 26px rgba(255,217,138,.25), 0 12px 30px rgba(2,3,20,.6); backdrop-filter:blur(8px);
  animation:ic-in .6s cubic-bezier(.2,.8,.2,1) both; transition:opacity .45s, transform .45s; }
.intro-card.out { opacity:0; transform:translate(-50%, -12px); }
.intro-card canvas { width:112px; height:79px; flex:none; border-radius:10px; border:1px solid rgba(110,125,220,.45);
  background:radial-gradient(ellipse at 50% 40%, rgba(40,48,120,.55), rgba(6,8,26,.9)); }
.intro-card .ic-text { font-size:14px; line-height:1.55; color:var(--ink); letter-spacing:.03em; }
.intro-card .ic-text .ic-title { display:block; font-weight:700; color:var(--gold); font-size:15px; letter-spacing:.12em; margin-bottom:2px; }
.intro-card .ic-new { position:absolute; top:-9px; left:12px; font-size:10px; font-weight:800; letter-spacing:.2em; color:#1a1030;
  background:linear-gradient(90deg,#ffe7b0,#ffd98a); padding:1px 8px; border-radius:999px; box-shadow:0 0 12px rgba(255,217,138,.6); }
.touch-ui .intro-card { top:max(50px, 6vh); }
`;
let styled = false;

const live = new Set<{ cv: HTMLCanvasElement; f: RuleFrame }>();
let raf = 0;
const t0 = performance.now();
function tick(): void {
  raf = 0;
  const t = (performance.now() - t0) / 1000;
  for (const item of live) {
    if (!item.cv.isConnected) { live.delete(item); continue; }
    const r = item.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (item.cv.width !== w * dpr) { item.cv.width = w * dpr; item.cv.height = h * dpr; }
    const g = item.cv.getContext('2d');
    if (!g) continue;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.save();
    // 絵は 136×96 の座標で描く（拡大縮小して合わせる）
    g.scale(w / 136, h / 96);
    item.f.draw(g, t, 136, 96);
    g.restore();
  }
  if (live.size) raf = requestAnimationFrame(tick);
}

/** ルールカードの列を作る。返した要素をメニューに入れるだけで動く */
export function ruleCards(frames: RuleFrame[]): HTMLDivElement {
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }
  const box = el('div', { class: 'rules' });
  frames.forEach((f, i) => {
    const card = el('div', { class: 'rule' });
    const cv = el('canvas');
    card.appendChild(cv);
    card.appendChild(el('div', { class: 'cap' }, `<b>${i + 1}</b>${f.caption}`));
    box.appendChild(card);
    live.add({ cv, f });
  });
  if (!raf) raf = requestAnimationFrame(tick);
  return box;
}

/**
 * ステージの最初に、新しく出てくる要素を1枚の図解で知らせる（RULE-01c）。
 * 画面の上の方に「NEW」の小さなカードが浮かび、数秒で消える（クリックしても消える）。操作のじゃまにならないよう、カード以外は触れる
 */
let introEl: HTMLDivElement | null = null;
let introTimer = 0;
export function introCard(frame: RuleFrame | null, title = '新しい要素', sec = 6): void {
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }
  introEl?.remove();
  introEl = null;
  clearTimeout(introTimer);
  if (!frame) return;
  const box = el('div', { class: 'intro-card' });
  const cv = el('canvas');
  box.append(el('div', { class: 'ic-new' }, 'NEW'), cv, el('div', { class: 'ic-text' }, `<span class="ic-title">${title}</span>${frame.caption}`));
  box.addEventListener('pointerdown', (e) => { e.stopPropagation(); box.classList.add('out'); setTimeout(() => box.remove(), 400); });
  document.body.appendChild(box);
  live.add({ cv, f: frame });
  if (!raf) raf = requestAnimationFrame(tick);
  introEl = box;
  introTimer = window.setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 500); }, sec * 1000);
}

// ---- 描くための小さな道具 ----

/** 0..1 のくり返し（period 秒） */
export const phase = (t: number, period: number): number => (t % period) / period;
/** a..b の間を 0..1 に（外は切る） */
export const seg = (p: number, a: number, b: number): number => Math.min(1, Math.max(0, (p - a) / (b - a)));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const ease = (k: number): number => 1 - (1 - k) * (1 - k);

export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (alpha <= 0 || r <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, alpha);
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r * 2.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function starShape(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

export function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1, width = 2): void {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

export function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, alpha = 1, width = 1.5, dash?: number[]): void {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  if (dash) g.setLineDash(dash);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.restore();
}

export function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, alpha = 1, width = 2.5): void {
  line(g, x1, y1, x2, y2, color, alpha, width);
  const a = Math.atan2(y2 - y1, x2 - x1), s = 6;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x2 + Math.cos(a) * 2, y2 + Math.sin(a) * 2);
  g.lineTo(x2 - Math.cos(a - 0.5) * s, y2 - Math.sin(a - 0.5) * s);
  g.lineTo(x2 - Math.cos(a + 0.5) * s, y2 - Math.sin(a + 0.5) * s);
  g.closePath();
  g.fill();
  g.restore();
}

export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#ffd98a', size = 11, alpha = 1): void {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.font = `700 ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
  g.restore();
}
