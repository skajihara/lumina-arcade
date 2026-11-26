/**
 * Starsand のシミュレーション（描画なし）。SS-14 で「粒子の流体」に作り直した。
 *
 * - 砂は1粒ずつの丸い粒子（直径1マス）。重力で加速し、粒どうしは押し合う（位置ベースの解法：重ならないように位置を直してから速度を出す）
 *   → 斜面を水のように流れ、器の中では平らにならす
 * - プレイヤーの線は「なめらかな線分（太さのある棒＝カプセル）」の集まり。マスのギザギザがない
 *   粒は線を越えられない（前の位置がどちら側だったかで押し戻す向きを決めるので、強く押されてもすり抜けない）
 * - 壁（ステージ）は四角。画面の左右も壁、下は開いている（落ちた砂は消える）
 * - 砂は空の注ぎ口から決まった数だけ降ってくる。インクの量だけ線を引ける（消すとインクが戻る）
 * - 星座の器（四角い領域）に、決まった色の砂を決まった数だけ溜めればクリア（色の指定がなければ何色でもよい）
 * - 注ぎ口が空になり、全部の砂が止まって、器が満ちなければ失敗
 *
 * 座標の単位はマス（盤面は W×H、y は下向き）。乱数は Rng（シード固定）で、同じ操作なら同じ結果（決定的）。
 */
import { Rng } from '@engine/rng';
import type { SandConfig } from './config';

export const W = 200;
export const H = 120;
export const EMPTY = 0;
export const WALL = 1;
export const LINE = 2;
/** 砂の色は SAND + 色番号（0..）。get() の戻り値に使う */
export const SAND = 8;
/** 砂の色：0 金・1 水色・2 桃・3 紫（水色＋桃）・4 白（金＋水色） */
export const COLORS = [0xffd27f, 0x7ff0ff, 0xffa3e0, 0xc9a3ff, 0xffffff];
/** 色の混合：違う色の砂が触れ合ってゆっくりしていると、ある確率で両方が混ざった色になる */
const MIX: Record<string, number> = { '0,1': 4, '1,0': 4, '1,2': 3, '2,1': 3 };
/** 混ざった色の材料（器の中に材料が両方あれば、混ざる前でもその色として数える） */
export const RECIPE: Record<number, [number, number]> = { 4: [0, 1], 3: [1, 2] };

/** 1ティックの秒数（120Hz） */
export const DT = 1 / 120;
/** 粒の半径（マス） */
export const GR = 0.5;
/** 線を引く時、長さ1マスあたりに使うインク（前のマスの線で使っていた量に近づけた） */
export const INK_PER = 2.5;
/** 位置を直す回数（多いほど固く積もるが重い） */
const ITER = 2;
/** 線分を探すための区画の大きさ（マス） */
const BK = 4;
const BW = Math.ceil(W / BK), BH = Math.ceil(H / BK);

export interface Source {
  x: number;
  y: number;
  /** 色番号 */
  color: number;
  /** 降らせる砂の総数 */
  total: number;
  /** 1ティックに降らせる数 */
  rate: number;
  /** 何ティック目から降り始めるか */
  delay?: number;
  /** 注ぎ口の幅（マス） */
  width?: number;
}

export interface Cup {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 溜めるべき砂の数 */
  need: number;
  /** 色の指定（なければ何色でもよい） */
  color?: number;
}

export interface StageDef {
  id: string;
  name: string;
  hint: string;
  /** 壁（四角） */
  walls: { x: number; y: number; w: number; h: number }[];
  sources: Source[];
  cups: Cup[];
  /** 引ける線の量。ふつうの基準。プリセットで増減（長さ1マス＝INK_PER） */
  ink: number;
  /** 自動プレイ・検証用の解の線（折れ線の列） */
  solution?: { x: number; y: number }[][];
  /** 星風（SS-12）：四角の中の砂を (ax, ay) の向きへ押し続ける（マス/秒²） */
  winds?: Wind[];
  /** 星の門（SS-12）：入口の四角に入った砂は、出口 (tx, ty) から同じ速さで出てくる */
  portals?: Portal[];
}

export interface Wind { x: number; y: number; w: number; h: number; ax: number; ay: number }
export interface Portal { x: number; y: number; w: number; h: number; tx: number; ty: number }

/** プレイヤーの線の1本（線分） */
export interface Seg {
  id: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  alive: boolean;
  /** この線分に使ったインク（消すと戻る） */
  ink: number;
}

export type SandEvent =
  /** 器が満ちた。chain：花火の雨から続けて満ちた数（1 で最初） */
  | { t: 'fill'; cup: number; chain: number }
  /** ひねり1：満ちた器の砂が花火の雨になった */
  | { t: 'rain'; cup: number; n: number; color: number }
  | { t: 'mix'; x: number; y: number; color: number }
  | { t: 'clear' }
  | { t: 'fail' };

export type Phase = 'play' | 'clear' | 'fail';

export class SandSim {
  tick = 0;
  phase: Phase = 'play';
  ink: number;
  inkMax: number;
  spawned: number[];
  /** 器ごとの今の砂の数（色指定の器は、その色だけ数える） */
  cupCount: number[];
  filled: boolean[];
  lost = 0;
  /** 星の門をくぐった粒の数（描画の光に使う） */
  portalCount = 0;
  events: SandEvent[] = [];
  /** 画面の上にある砂の数 */
  grains = 0;
  /** 粒：位置・速さ・色 */
  gx: Float64Array;
  gy: Float64Array;
  gvx: Float64Array;
  gvy: Float64Array;
  gc: Uint8Array;
  /** 線分（消したものも alive=false で残す。番号＝配列の添字） */
  segs: Seg[] = [];
  /** 線が変わるたびに増える（描画し直しの合図） */
  segVersion = 0;
  /** 線の半径（マス） */
  lineR: number;
  chain = 0;
  bestChain = 0;
  private rng: Rng;
  private still = 0;
  /** 花火の雨が降っている間（このティックまで） */
  private rainUntil = -1;
  private doneTicks = 0;
  private px: Float64Array;
  private py: Float64Array;
  private ox: Float64Array;
  private oy: Float64Array;
  private touch: Uint8Array;
  private head = new Int32Array(W * H);
  private next: Int32Array;
  private buckets: number[][] = Array.from({ length: BW * BH }, () => []);

  constructor(public stage: StageDef, public cfg: SandConfig, seed = 1) {
    this.rng = new Rng(seed);
    this.inkMax = Math.round(stage.ink * cfg.inkScale);
    this.ink = this.inkMax;
    this.spawned = stage.sources.map(() => 0);
    this.cupCount = stage.cups.map(() => 0);
    this.filled = stage.cups.map(() => false);
    this.lineR = 0.7 + 0.4 * (cfg.lineWidth ?? 1);
    const cap = stage.sources.reduce((m, s) => m + Math.round(s.total * cfg.sandScale), 0) + 64;
    this.gx = new Float64Array(cap);
    this.gy = new Float64Array(cap);
    this.gvx = new Float64Array(cap);
    this.gvy = new Float64Array(cap);
    this.gc = new Uint8Array(cap);
    this.px = new Float64Array(cap);
    this.py = new Float64Array(cap);
    this.ox = new Float64Array(cap);
    this.oy = new Float64Array(cap);
    this.touch = new Uint8Array(cap);
    this.next = new Int32Array(cap);
    this.head.fill(-1);
  }

  // ---------------------------------------------------------------- 調べる

  private inWall(x: number, y: number, pad = 0): boolean {
    for (const r of this.stage.walls) if (x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad) return true;
    return false;
  }

  /** (x,y) に一番近い、生きている線分までの距離（exclude の線分は除く） */
  private segDist(x: number, y: number, exclude?: Set<number>): { d: number; qx: number; qy: number; id: number } | null {
    let best: { d: number; qx: number; qy: number; id: number } | null = null;
    for (const s of this.segs) {
      if (!s.alive || exclude?.has(s.id)) continue;
      const q = closest(s, x, y);
      const d = Math.hypot(x - q.x, y - q.y);
      if (!best || d < best.d) best = { d, qx: q.x, qy: q.y, id: s.id };
    }
    return best;
  }

  /**
   * マス (x,y) に何があるか（テスト・互換用）：盤の外と壁は WALL、線は LINE、砂の粒の中心があれば SAND+色、なければ EMPTY。
   * 盤の下（y ≥ H）は開いているが、ここでは WALL を返す（前のマスの版と同じ）
   */
  get(x: number, y: number): number {
    if (x < 0 || x >= W || y < 0 || y >= H) return WALL;
    if (this.inWall(x + 0.5, y + 0.5)) return WALL;
    const s = this.segDist(x + 0.5, y + 0.5);
    if (s && s.d <= this.lineR) return LINE;
    for (let i = this.head[y * W + x]; i >= 0; i = this.next[i]) return SAND + this.gc[i];
    return EMPTY;
  }

  /** 列 x の、線の一番下の y（なければ -1）。テスト用 */
  lineBottomAt(x: number): number {
    let yb = -1;
    for (const s of this.segs) {
      if (!s.alive) continue;
      const x0 = Math.min(s.ax, s.bx) - this.lineR, x1 = Math.max(s.ax, s.bx) + this.lineR;
      if (x < x0 || x > x1) continue;
      for (let y = 0; y < H; y += 0.25) if (Math.hypot(x - closest(s, x, y).x, y - closest(s, x, y).y) <= this.lineR) yb = Math.max(yb, y);
    }
    return yb;
  }

  // ---------------------------------------------------------------- 線

  /** 線を引く（a→b の線分）。インクが尽きたらそこまで。使ったインクを返す */
  drawLine(ax: number, ay: number, bx: number, by: number): number {
    const before = this.ink;
    this.drawLineIds(ax, ay, bx, by);
    return before - this.ink;
  }

  /** drawLine と同じだが、引いた線分の番号を返す（一筆ごとに消せるように） */
  drawLineIds(ax: number, ay: number, bx: number, by: number): number[] {
    if (this.ink <= 0) return [];
    let L = Math.hypot(bx - ax, by - ay);
    let cost = Math.max(1, L * INK_PER);
    if (cost > this.ink) {
      // インクの分だけ短く
      const k = Math.max(0, (this.ink / INK_PER) / Math.max(1e-6, L));
      bx = ax + (bx - ax) * k;
      by = ay + (by - ay) * k;
      L = Math.hypot(bx - ax, by - ay);
      cost = this.ink;
    }
    const s: Seg = { id: this.segs.length, ax, ay, bx, by, alive: true, ink: cost };
    this.segs.push(s);
    this.ink -= cost;
    this.bucketAdd(s);
    this.pushOutGrains(s);
    this.segVersion++;
    return [s.id];
  }

  /** 線分の番号で消す（インクが戻る）。戻ったインクを返す */
  eraseIds(ids: number[]): number {
    let back = 0;
    for (const id of ids) {
      const s = this.segs[id];
      if (!s || !s.alive) continue;
      s.alive = false;
      this.bucketRemove(s);
      this.ink = Math.min(this.inkMax, this.ink + s.ink);
      back += s.ink;
    }
    if (back > 0) this.segVersion++;
    return back;
  }

  /** (cx,cy) から半径 r の中にかかる線分を消す（インクが戻る）。砂や壁は消さない。戻ったインクを返す */
  erase(cx: number, cy: number, r = 3): number {
    const ids: number[] = [];
    for (const s of this.segs) {
      if (!s.alive) continue;
      const q = closest(s, cx, cy);
      if (Math.hypot(cx - q.x, cy - q.y) <= r + this.lineR) ids.push(s.id);
    }
    return this.eraseIds(ids);
  }

  /**
   * (x,y) の近く（半径 r）にある線・壁のうち一番近い点。exclude の線分（今の一筆）は除く。
   * すでに触れていれば null。線の書き始め・書き終わりを近くの線や壁へつなぐのに使う
   */
  nearestSolid(x: number, y: number, r: number, exclude?: Set<number>): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bd = Infinity;
    const s = this.segDist(x, y, exclude);
    if (s) { best = { x: s.qx, y: s.qy }; bd = s.d - this.lineR; }
    for (const w of this.stage.walls) {
      const qx = Math.max(w.x, Math.min(w.x + w.w, x)), qy = Math.max(w.y, Math.min(w.y + w.h, y));
      const d = Math.hypot(x - qx, y - qy);
      if (d < bd) { bd = d; best = { x: qx, y: qy }; }
    }
    if (!best || bd > r) return null;
    // 今の線の端（太さ lineR）がもう触れている
    return bd <= this.lineR * 0.5 ? null : best;
  }

  private bucketRange(s: Seg): [number, number, number, number] {
    const pad = this.lineR + GR + 0.5;
    const x0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - pad) / BK)), x1 = Math.min(BW - 1, Math.floor((Math.max(s.ax, s.bx) + pad) / BK));
    const y0 = Math.max(0, Math.floor((Math.min(s.ay, s.by) - pad) / BK)), y1 = Math.min(BH - 1, Math.floor((Math.max(s.ay, s.by) + pad) / BK));
    return [x0, x1, y0, y1];
  }

  private bucketAdd(s: Seg): void {
    const [x0, x1, y0, y1] = this.bucketRange(s);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) this.buckets[j * BW + i].push(s.id);
  }

  private bucketRemove(s: Seg): void {
    const [x0, x1, y0, y1] = this.bucketRange(s);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const b = this.buckets[j * BW + i];
      const k = b.indexOf(s.id);
      if (k >= 0) b.splice(k, 1);
    }
  }

  /** 引いた線の中にいる粒は、線の上側へ押し出す（線に穴をあけない・下へすり抜けさせない） */
  private pushOutGrains(s: Seg): void {
    const R = this.lineR + GR + 0.05;
    let nx = -(s.by - s.ay), ny = s.bx - s.ax;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-6) { nx = 0; ny = -1; } else { nx /= nl; ny /= nl; if (ny > 0) { nx = -nx; ny = -ny; } }
    const n = this.grains;
    for (let i = 0; i < n; i++) {
      const q = closest(s, this.gx[i], this.gy[i]);
      const d = Math.hypot(this.gx[i] - q.x, this.gy[i] - q.y);
      if (d >= R) continue;
      // ほぼ縦の線では、粒がいる側へ。それ以外は上側へ
      let ux = nx, uy = ny;
      if (Math.abs(ny) < 0.2) { const side = (this.gx[i] - q.x) * nx + (this.gy[i] - q.y) * ny; if (side < 0) { ux = -nx; uy = -ny; } }
      this.gx[i] = q.x + ux * R;
      this.gy[i] = q.y + uy * R;
      this.gvx[i] = 0;
      this.gvy[i] = 0;
    }
  }

  // ---------------------------------------------------------------- 進める

  /** 1ティック進める */
  step(): void {
    this.events = [];
    this.tick++;
    if (this.phase !== 'play') return;
    this.spawn();
    this.integrate();
    this.countCups();
    this.checkEnd();
  }

  private addGrain(x: number, y: number, color: number, vx = 0, vy = 0): boolean {
    const i = this.grains;
    if (i >= this.gx.length) return false;
    this.gx[i] = x; this.gy[i] = y; this.gvx[i] = vx; this.gvy[i] = vy; this.gc[i] = color;
    this.grains++;
    return true;
  }

  private removeGrain(i: number): void {
    const last = --this.grains;
    if (i === last) return;
    this.gx[i] = this.gx[last]; this.gy[i] = this.gy[last];
    this.gvx[i] = this.gvx[last]; this.gvy[i] = this.gvy[last];
    this.gc[i] = this.gc[last];
    this.px[i] = this.px[last]; this.py[i] = this.py[last];
  }

  /** 近くに粒があるか（注ぎ口がふさがっていたら降らせない） */
  private crowded(x: number, y: number): boolean {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let j = cy - 1; j <= cy + 1; j++) {
      if (j < 0 || j >= H) continue;
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (i < 0 || i >= W) continue;
        for (let k = this.head[j * W + i]; k >= 0; k = this.next[k]) if (Math.hypot(this.gx[k] - x, this.gy[k] - y) < 0.9) return true;
      }
    }
    return false;
  }

  private spawn(): void {
    const start = this.grains;
    this.stage.sources.forEach((s, si) => {
      if (this.tick < (s.delay ?? 0)) return;
      const width = s.width ?? 3;
      const total = Math.round(s.total * this.cfg.sandScale);
      for (let k = 0; k < s.rate; k++) {
        if (this.spawned[si] >= total) break;
        const x = s.x + 0.5 + this.rng.range(-width / 2, width / 2);
        const y = s.y + 0.5;
        if (this.crowded(x, y)) continue;
        let near = false;
        for (let j = start; j < this.grains; j++) if (Math.hypot(this.gx[j] - x, this.gy[j] - y) < 0.9) { near = true; break; }
        if (near) continue;
        if (this.addGrain(x, y, s.color, 0, 25)) this.spawned[si]++;
      }
    });
  }

  /** 粒の位置で区画の表を作る（近くの粒を探すため） */
  private buildHash(xs: Float64Array, ys: Float64Array): void {
    this.head.fill(-1);
    for (let i = 0; i < this.grains; i++) {
      const cx = Math.min(W - 1, Math.max(0, Math.floor(xs[i]))), cy = Math.min(H - 1, Math.max(0, Math.floor(ys[i])));
      const c = cy * W + cx;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private integrate(): void {
    const n = this.grains;
    const g = this.cfg.gravity ?? 420, vmax = this.cfg.maxSpeed ?? 100;
    const { px, py, ox, oy, gx, gy, gvx, gvy } = this;
    const winds = this.stage.winds ?? [];
    for (let i = 0; i < n; i++) {
      gvy[i] += g * DT;
      for (const w of winds) {
        if (gx[i] >= w.x && gx[i] < w.x + w.w && gy[i] >= w.y && gy[i] < w.y + w.h) { gvx[i] += w.ax * DT; gvy[i] += w.ay * DT; }
      }
      const sp = Math.hypot(gvx[i], gvy[i]);
      if (sp > vmax) { gvx[i] *= vmax / sp; gvy[i] *= vmax / sp; }
      ox[i] = gx[i]; oy[i] = gy[i];
      px[i] = gx[i] + gvx[i] * DT;
      py[i] = gy[i] + gvy[i] * DT;
    }
    this.touch.fill(0);
    const D = 2 * GR;
    const mixRate = (this.cfg.mixRate ?? 0.5) * 0.04;
    for (let it = 0; it < ITER; it++) {
      this.buildHash(px, py);
      // 粒どうし：重なった分だけ半分ずつ押し離す
      for (let i = 0; i < n; i++) {
        const cx = Math.floor(px[i]), cy = Math.floor(py[i]);
        for (let j0 = cy - 1; j0 <= cy + 1; j0++) {
          if (j0 < 0 || j0 >= H) continue;
          for (let i0 = cx - 1; i0 <= cx + 1; i0++) {
            if (i0 < 0 || i0 >= W) continue;
            for (let k = this.head[j0 * W + i0]; k >= 0; k = this.next[k]) {
              if (k <= i) continue;
              const dx = px[k] - px[i], dy = py[k] - py[i];
              const d2 = dx * dx + dy * dy;
              if (d2 >= D * D) continue;
              const d = Math.sqrt(d2) || 1e-6;
              const push = (D - d) * 0.5;
              const ux = d2 > 0 ? dx / d : 0, uy = d2 > 0 ? dy / d : -1;
              px[i] -= ux * push; py[i] -= uy * push;
              px[k] += ux * push; py[k] += uy * push;
              // 色の混合：違う色どうしがゆっくり触れ合っていると、ときどき混ざる
              if (it === 0 && this.gc[i] !== this.gc[k]) {
                const m = MIX[`${this.gc[i]},${this.gc[k]}`];
                if (m !== undefined && Math.abs(gvy[i]) + Math.abs(gvy[k]) < 30 && this.rng.next() < mixRate) {
                  this.gc[i] = m;
                  this.gc[k] = m;
                  this.events.push({ t: 'mix', x: px[i], y: py[i], color: m });
                }
              }
            }
          }
        }
      }
      // 壁と線：前の位置の側へ押し戻す
      for (let i = 0; i < n; i++) this.collideStatic(i);
    }
    // 速さ＝直した位置の差。壁や線に触れている粒は少しだけ摩擦で遅くする
    const fr = this.cfg.friction ?? 0.04;
    for (let i = 0; i < n; i++) {
      let vx = (px[i] - gx[i]) / DT, vy = (py[i] - gy[i]) / DT;
      if (this.touch[i]) { vx *= 1 - fr; vy *= 1 - fr; }
      gvx[i] = vx; gvy[i] = vy;
      gx[i] = px[i]; gy[i] = py[i];
    }
    // 星の門：入口に入った粒は出口へ（速さはそのまま。少しずらして重なりを避ける）
    for (const pt of this.stage.portals ?? []) {
      for (let i = 0; i < this.grains; i++) {
        if (gx[i] < pt.x || gx[i] >= pt.x + pt.w || gy[i] < pt.y || gy[i] >= pt.y + pt.h) continue;
        gx[i] = pt.tx + this.rng.range(-1.5, 1.5);
        gy[i] = pt.ty + this.rng.range(-0.5, 0.5);
        this.portalCount++;
      }
    }
    // 画面の下へ落ちた
    let maxSp = 0;
    for (let i = this.grains - 1; i >= 0; i--) {
      if (gy[i] > H + 1) { this.removeGrain(i); this.lost++; continue; }
      maxSp = Math.max(maxSp, Math.abs(gvx[i]) + Math.abs(gvy[i]));
    }
    this.buildHash(gx, gy);
    this.still = maxSp < 4 ? this.still + 1 : 0;
  }

  /** 粒 i を壁・線・画面の左右から押し出す */
  private collideStatic(i: number): void {
    const { px, py, ox, oy } = this;
    // 画面の左右
    if (px[i] < GR) { px[i] = GR; this.touch[i] = 1; }
    if (px[i] > W - GR) { px[i] = W - GR; this.touch[i] = 1; }
    // 壁（四角）：半径の分だけ広げた四角の中なら、前の位置が外だった側へ出す（なければ一番浅い側）
    for (const r of this.stage.walls) {
      const x0 = r.x - GR, x1 = r.x + r.w + GR, y0 = r.y - GR, y1 = r.y + r.h + GR;
      const x = px[i], y = py[i];
      if (x <= x0 || x >= x1 || y <= y0 || y >= y1) continue;
      const ux = ox[i], uy = oy[i];
      const pen = [
        { d: x - x0, ok: ux <= x0, ax: x0, ay: NaN },
        { d: x1 - x, ok: ux >= x1, ax: x1, ay: NaN },
        { d: y - y0, ok: uy <= y0, ax: NaN, ay: y0 },
        { d: y1 - y, ok: uy >= y1, ax: NaN, ay: y1 },
      ];
      let best = -1;
      for (let k = 0; k < 4; k++) if (pen[k].ok && (best < 0 || pen[k].d < pen[best].d)) best = k;
      if (best < 0) for (let k = 0; k < 4; k++) if (best < 0 || pen[k].d < pen[best].d) best = k;
      const p = pen[best];
      if (!Number.isNaN(p.ax)) px[i] = p.ax; else py[i] = p.ay;
      this.touch[i] = 1;
    }
    // 線（カプセル）
    const R = this.lineR + GR;
    const bx = Math.floor(px[i] / BK), by = Math.floor(py[i] / BK);
    if (bx < 0 || bx >= BW || by < 0 || by >= BH) return;
    for (const id of this.buckets[by * BW + bx]) {
      const s = this.segs[id];
      const q = closest(s, px[i], py[i]);
      let dx = px[i] - q.x, dy = py[i] - q.y;
      const d = Math.hypot(dx, dy);
      if (d >= R) continue;
      // 前の位置がどちら側にいたか（線を越えて押し込まれても、元の側へ戻す）
      const q0 = closest(s, ox[i], oy[i]);
      const sx = ox[i] - q0.x, sy = oy[i] - q0.y;
      if (d < 1e-6) { dx = sx; dy = sy; }
      else if (dx * sx + dy * sy < 0) { dx = -dx; dy = -dy; }
      let l = Math.hypot(dx, dy);
      if (l < 1e-6) { dx = 0; dy = -1; l = 1; }
      px[i] = q.x + (dx / l) * R;
      py[i] = q.y + (dy / l) * R;
      this.touch[i] = 1;
    }
  }

  private countCups(): void {
    const per = this.stage.cups.map(() => new Array(COLORS.length).fill(0));
    const all = this.stage.cups.map(() => 0);
    for (let i = 0; i < this.grains; i++) {
      const x = this.gx[i], y = this.gy[i];
      this.stage.cups.forEach((c, ci) => {
        if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) { per[ci][this.gc[i]]++; all[ci]++; }
      });
    }
    this.stage.cups.forEach((c, i) => {
      let n = all[i];
      if (c.color !== undefined) {
        n = per[i][c.color];
        // 混ざった色の器：材料の2色がそろっている分も数える（器の中でいずれ混ざる）
        const r = RECIPE[c.color];
        if (r) n += 2 * Math.min(per[i][r[0]], per[i][r[1]]);
      }
      this.cupCount[i] = n;
      if (!this.filled[i] && n >= c.need) {
        this.filled[i] = true;
        // 花火の雨が降っている間（4秒）に満ちたら連鎖
        this.chain = this.tick < this.rainUntil ? this.chain + 1 : 1;
        this.events.push({ t: 'fill', cup: i, chain: this.chain });
        this.burstCup(i, per[i]);
      }
    });
  }

  /** 注ぎ口に残っている砂 */
  remaining(): number {
    return this.stage.sources.reduce((m, s, i) => m + Math.max(0, Math.round(s.total * this.cfg.sandScale) - this.spawned[i]), 0);
  }

  private checkEnd(): void {
    if (this.filled.length && this.filled.every(Boolean)) {
      this.phase = 'clear';
      this.events.push({ t: 'clear' });
      return;
    }
    // 全部降り終わって、しばらく何も動かなければ（または降り終わってから長くたったら）失敗
    if (this.remaining() === 0) this.doneTicks++;
    if (this.remaining() === 0 && (this.still > 30 || this.doneTicks > 1200)) {
      this.phase = 'fail';
      this.events.push({ t: 'fail' });
    }
  }

  /** 満ちた器が弾ける：中の砂を消し、ひねり1なら一部を花火の雨として周りの空へ撒く（そのまま落ちてくる） */
  private burstCup(i: number, per: number[]): void {
    const c = this.stage.cups[i];
    // 雨の色：色の器はその色、色なしの器は中で一番多い色
    const color = c.color ?? per.indexOf(Math.max(...per));
    const n = this.emptyCup(i);
    this.bestChain = Math.max(this.bestChain, this.chain);
    if (Math.round(this.cfg.twist ?? 0) !== 1) return;
    const want = Math.round(n * this.cfg.rainFrac);
    const cx = c.x + c.w / 2;
    let put = 0;
    for (let k = 0; k < want * 4 && put < want; k++) {
      const x = cx + this.rng.range(-this.cfg.rainSpread, this.cfg.rainSpread);
      const y = c.y - 8 - this.rng.range(0, 40);
      if (x < 1 || x >= W - 1 || y < 1 || y >= H) continue;
      if (this.inWall(x, y, GR)) continue;
      if (this.addGrain(x, y, color, this.rng.range(-20, 20), this.rng.range(-40, 0))) put++;
    }
    if (put > 0) {
      this.rainUntil = this.tick + 120 * 4;
      this.events.push({ t: 'rain', cup: i, n: put, color });
    }
  }

  /** 器の砂を消す（花火になって弾けた後） */
  emptyCup(i: number): number {
    const c = this.stage.cups[i];
    let n = 0;
    for (let k = this.grains - 1; k >= 0; k--) {
      const x = this.gx[k], y = this.gy[k];
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) { this.removeGrain(k); n++; }
    }
    this.buildHash(this.gx, this.gy);
    return n;
  }

  digest(): number[] {
    let h = 0;
    for (let i = 0; i < this.grains; i++) h = (h * 31 + Math.round(this.gx[i] * 64) * 7 + Math.round(this.gy[i] * 64) + this.gc[i]) | 0;
    return [this.tick, h, this.lost, this.grains, ...this.cupCount];
  }
}

/** 線分 s の上で (x,y) に一番近い点 */
export function closest(s: { ax: number; ay: number; bx: number; by: number }, x: number, y: number): { x: number; y: number } {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return { x: s.ax, y: s.ay };
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
  return { x: s.ax + dx * t, y: s.ay + dy * t };
}
