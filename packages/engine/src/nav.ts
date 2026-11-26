/**
 * 画面の行き来（UX-01）：どの画面にも左上の「戻る」。Esc とブラウザの戻る（history）でも同じ「一つ前へ」。
 *
 * 遷移：星図 ⇄ タイトル（難易度・ステージ選択） → プレイ ⇄ ポーズ → リザルト
 *   - タイトルで戻る → 星図
 *   - プレイ中に戻る → ポーズ（いきなり抜けない）
 *   - ポーズで戻る → 続ける
 *   - リザルト・リプレイで戻る → ステージ選択
 * 各作品は back（今の画面での「戻る」）と label（ボタンの文字）を渡す。
 */
import type { GUI } from 'lil-gui';
import { el, goTo } from './hud';
import { synth } from './audio';

export interface Nav {
  /** 左上のボタン（文字は毎フレーム update で今の画面に合わせる） */
  button: HTMLButtonElement;
  update(): void;
  back(): void;
}

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `.nav-back{position:fixed;left:10px;top:10px;z-index:30;min-height:40px;min-width:44px;padding:0 14px;border-radius:20px;border:1px solid rgba(160,180,255,.35);background:rgba(16,20,50,.55);backdrop-filter:blur(6px);color:#dfe5ff;font-size:13px;letter-spacing:.06em;cursor:pointer;pointer-events:auto;transition:background .2s,box-shadow .2s}
.nav-back:hover{background:rgba(50,60,130,.7);box-shadow:0 0 14px rgba(127,156,255,.5)}
.nav-back:focus-visible{outline:2px solid #ffd98a;outline-offset:2px}
.hud .tl{top:58px!important}
.menu .nav-settings{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;margin:10px 0 4px;font-size:13px;color:var(--dim,#8f96c9)}
.menu .nav-settings input[type=range]{width:140px;accent-color:#ffd98a}
.menu .nav-settings label{display:flex;gap:6px;align-items:center;min-height:40px}
@media (max-width:520px){.hud .tl{top:54px!important}.nav-back{font-size:12px;min-height:38px}}`;
  document.head.appendChild(st);
}

/** 左上の戻るボタンと、Esc・ブラウザの戻るをつなぐ */
export function installNav(back: () => void, label: () => string): Nav {
  style();
  const button = el('button', { class: 'nav-back', 'aria-label': '戻る' });
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => { e.stopPropagation(); synth.unlock(); nav.back(); });
  document.body.appendChild(button);
  // ブラウザの戻る：1つ履歴を積んでおき、戻られたらゲームの「戻る」をしてまた積む（タイトルなら星図へ移る）
  try { history.pushState({ lumina: 1 }, ''); } catch { /* file:// などで使えない時 */ }
  addEventListener('popstate', () => {
    nav.back();
    try { history.pushState({ lumina: 1 }, ''); } catch { /* 無視 */ }
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || document.querySelector('.lumina-confirm')) return;
    e.preventDefault();
    nav.back();
  });
  let last = '';
  const nav: Nav = {
    button,
    update() {
      const t = label();
      if (t !== last) { button.textContent = t; last = t; }
    },
    back() { back(); nav.update(); },
  };
  // 作品の main() が最後まで走ってから（mode などが決まってから）文字を入れる
  setTimeout(() => nav.update(), 0);
  setInterval(() => nav.update(), 200);
  return nav;
}

/** 星図へ戻るボタン（ポーズ・リザルトに置く） */
export function launcherButton(): HTMLButtonElement {
  const b = el('button', { class: 'btn' }, '星図へ');
  b.onclick = () => goTo('./index.html');
  return b;
}

/** ポーズに置く設定：音量と消音、調整パネルを開く */
export function settingsRow(gui: GUI, toggleTuning: () => void): HTMLDivElement {
  const row = el('div', { class: 'nav-settings' });
  const ctrl = gui.controllersRecursive().find((c) => c.property === 'volume');
  const vol = el('label', {}, '音量 <input type="range" min="0" max="1" step="0.05">');
  const input = vol.querySelector('input')!;
  input.value = String(synth.volume);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (ctrl) ctrl.setValue(v);
    else synth.setVolume(v);
  });
  const mute = el('label', {}, '<input type="checkbox"> 消音（M）');
  const mi = mute.querySelector('input')!;
  mi.checked = synth.muted;
  mi.addEventListener('change', () => synth.setMuted(mi.checked));
  const tb = el('button', { class: 'btn small' }, '調整パネル（T）');
  tb.onclick = () => toggleTuning();
  row.append(vol, mute, tb);
  return row;
}
