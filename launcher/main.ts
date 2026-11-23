/** 星図ランチャー。各ゲームが1つの星座。Canvas2D だけで描く軽量ページ */
import { games, type GameEntry } from './games';
import { injectBaseStyle } from '@engine/hud';

injectBaseStyle(`
#sky { position:fixed; inset:0; }
.title { position:fixed; top:4vh; left:0; right:0; text-align:center; pointer-events:none; }
.title h1 { font-size:clamp(28px,5vw,54px); margin:0; letter-spacing:.3em; font-weight:800;
  background:linear-gradient(180deg,#fff,#9fd0ff); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 16px #5a7dff); }
.title p { color:var(--dim); letter-spacing:.4em; margin:6px 0 0; font-size:13px; }
.card { position:fixed; left:50%; bottom:3vh; transform:translateX(-50%); max-width:560px; width:90vw; text-align:center;
  padding:16px 20px; border-radius:18px; background:rgba(12,16,48,.6); border:1px solid #39407a; backdrop-filter:blur(4px);
  transition:opacity .25s; }
.card h3 { margin:0; font-size:22px; letter-spacing:.12em; }
.card small { color:var(--dim); letter-spacing:.2em; }
.card p { color:var(--dim); margin:8px 0 0; line-height:1.7; }
.wip { color:#8f96c9; font-size:12px; border:1px solid #4a5290; border-radius:999px; padding:1px 8px; margin-left:6px; }
`);

const cv = document.createElement('canvas');
cv.id = 'sky';
document.body.appendChild(cv);
const ctx = cv.getContext('2d')!;
document.body.insertAdjacentHTML('beforeend', `
  <div class="title"><h1>LUMINA ARCADE</h1><p>光 の 遊 技 場</p></div>
  <div class="card" id="card"><h3>星座を選んでください</h3><p>光っている星座が遊べるゲーム。灰色は制作中です。</p></div>`);
const card = document.getElementById('card')!;

let W = 0, H = 0, dpr = 1;
const bg: { x: number; y: number; r: number; p: number; s: number }[] = [];
const resize = () => {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  bg.length = 0;
  for (let i = 0; i < 420; i++) bg.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() ** 3 * 1.8 + 0.3, p: Math.random() * 9, s: 0.5 + Math.random() * 2 });
};
addEventListener('resize', resize);
resize();

/** 各ゲームの進行（localStorage の lumina:<id>）から、クリアした数と★の数を読む */
const progress = (g: GameEntry): { cleared: number; stars: number } => {
  try {
    const d = JSON.parse(localStorage.getItem(`lumina:${g.id}`) ?? '{}') as { cleared?: Record<string, number> };
    const v = Object.values(d.cleared ?? {});
    return { cleared: v.length, stars: v.reduce((a, b) => a + (b || 0), 0) };
  } catch {
    return { cleared: 0, stars: 0 };
  }
};
const prog = new Map(games.map((g) => [g.id, progress(g)]));
const total = [...prog.values()].reduce((a, p) => a + p.stars, 0);
const totalMax = games.filter((g) => g.status === 'ready').reduce((a, g) => a + g.stages * 3, 0);

let hover: GameEntry | null = null;
const size = () => Math.min(W, H) * 0.17;
const pts = (g: GameEntry) => {
  const s = size();
  return g.shape.map(([x, y]) => ({ x: g.at[0] * W + (x - 0.5) * s, y: g.at[1] * H + (y - 0.5) * s }));
};
const hit = (mx: number, my: number) => games.find((g) => Math.hypot(mx - g.at[0] * W, my - g.at[1] * H) < size() * 0.6) ?? null;

const showCard = (g: GameEntry | null) => {
  if (!g) {
    card.innerHTML = `<h3>星座を選んでください</h3><p>光っている星座が遊べるゲーム。灰色は制作中です。</p>${total ? `<p style="color:#ffd98a">集めた星 ★ ${total} / ${totalMax}</p>` : ''}`;
    return;
  }
  const p = prog.get(g.id)!;
  const pr = g.status === 'ready' ? `<p style="color:#ffd98a">クリア ${p.cleared} / ${g.stages}　★ ${p.stars} / ${g.stages * 3}</p>` : '';
  card.innerHTML = `<h3>${g.title}${g.status === 'wip' ? '<span class="wip">制作中</span>' : ''}</h3><small>${g.jp}</small><p>${g.desc}</p>${pr}`;
};

cv.addEventListener('pointermove', (e) => {
  const h = hit(e.clientX, e.clientY);
  if (h !== hover) { hover = h; showCard(h); }
  cv.style.cursor = h && h.status === 'ready' ? 'pointer' : 'default';
});
cv.addEventListener('click', (e) => {
  const g = hit(e.clientX, e.clientY);
  if (g && g.status === 'ready') location.href = `./${g.id}.html`;
  else if (g) { hover = g; showCard(g); }
});

let t0 = performance.now();
const frame = (now: number) => {
  const t = (now - t0) / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const grd = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  grd.addColorStop(0, '#111845');
  grd.addColorStop(0.55, '#070a22');
  grd.addColorStop(1, '#02030a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const s of bg) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * s.s + s.p);
    ctx.fillStyle = '#cfe0ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const g of games) {
    const ready = g.status === 'ready';
    const p = pts(g);
    const on = hover === g;
    const col = ready ? g.hue : '#5a6090';
    ctx.globalAlpha = (ready ? 0.55 : 0.25) + (on ? 0.35 : 0) + (ready ? 0.1 * Math.sin(t * 2) : 0);
    ctx.strokeStyle = col;
    ctx.lineWidth = on ? 2 : 1.2;
    ctx.beginPath();
    for (const [a, b] of g.edges) { ctx.moveTo(p[a].x, p[a].y); ctx.lineTo(p[b].x, p[b].y); }
    ctx.stroke();
    p.forEach((q, i) => {
      const r = (i === 0 ? 5 : 3) * (on ? 1.4 : 1);
      const gl = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 6);
      gl.addColorStop(0, col);
      gl.addColorStop(1, 'transparent');
      ctx.globalAlpha = ready ? 0.9 : 0.35;
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(q.x, q.y, r * 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = ready ? 0.9 : 0.4;
    ctx.fillStyle = ready ? '#e9ecff' : '#7a80b0';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.jp, g.at[0] * W, g.at[1] * H + size() * 0.62);
    // クリア状況：名前の下に小さな★と、全部クリアしたら星座が金色に輪をまとう
    const pg = prog.get(g.id)!;
    if (ready && pg.cleared > 0) {
      ctx.fillStyle = '#ffd98a';
      ctx.font = '500 11px system-ui, sans-serif';
      ctx.fillText(`★ ${pg.stars} / ${g.stages * 3}`, g.at[0] * W, g.at[1] * H + size() * 0.62 + 16);
      if (pg.cleared >= g.stages) {
        ctx.strokeStyle = '#ffd98a';
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 1.5);
        ctx.beginPath();
        ctx.arc(g.at[0] * W, g.at[1] * H, size() * 0.56, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
(window as unknown as { __lumina: unknown }).__lumina = { game: 'launcher', ready: true, errors: [], state: () => ({ games: games.length, stars: total }) };
