/**
 * Starsand のシミュレーション（描画なし）。
 *
 * - 盤面は W×H のマス（落ちる砂のセルオートマトン）。空・壁（ステージ）・線（プレイヤーが引く）・砂（色つき）
 * - 砂は1ティックに1マス落ちる。下が埋まっていれば左下か右下へ（どちらを先に試すかは乱数。シード固定で決定的）
 * - 砂は空の注ぎ口から決まった数だけ降ってくる
 * - プレイヤーはインクの量だけ線を引ける（消すとインクが戻る）。線で砂の流れを導く
 * - 星座の器（四角い領域）に、決まった色の砂を決まった数だけ溜めればクリア（色の指定がなければ何色でもよい）
 * - 画面の下へ落ちた砂は消える。注ぎ口が空になり、全部の砂が止まって、器が満ちなければ失敗
 */
import { Rng } from '@engine/rng';
import type { SandConfig } from './config';

export const W = 200;
export const H = 120;
export const EMPTY = 0;
export const WALL = 1;
export const LINE = 2;
/** 砂の色は SAND + 色番号（0..） */
export const SAND = 8;
/** 砂の色：0 金・1 水色・2 桃・3 紫（水色＋桃）・4 白（金＋水色） */
export const COLORS = [0xffd27f, 0x7ff0ff, 0xffa3e0, 0xc9a3ff, 0xffffff];
/** 色の混合：違う色の砂が触れて止まると、ある確率で両方が混ざった色になる */
const MIX: Record<string, number> = { '0,1': 4, '1,0': 4, '1,2': 3, '2,1': 3 };
/** 混ざった色の材料（器の中に材料が両方あれば、混ざる前でもその色として数える） */
export const RECIPE: Record<number, [number, number]> = { 4: [0, 1], 3: [1, 2] };

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
  /** 引ける線の量（マス）。ふつうの基準。プリセットで増減 */
  ink: number;
  /** 自動プレイ・検証用の解の線（折れ線の列） */
  solution?: { x: number; y: number }[][];
}

export type SandEvent =
  | { t: 'fill'; cup: number }
  | { t: 'mix'; x: number; y: number; color: number }
  | { t: 'clear' }
  | { t: 'fail' };

export type Phase = 'play' | 'clear' | 'fail';

export class SandSim {
  grid = new Uint8Array(W * H);
  tick = 0;
  phase: Phase = 'play';
  ink: number;
  inkMax: number;
  spawned: number[];
  /** 器ごとの今の砂の数（色指定の器は、その色だけ数える） */
  cupCount: number[];
  filled: boolean[];
  lost = 0;
  events: SandEvent[] = [];
  /** 砂の総数（画面の上にある分） */
  grains = 0;
  private rng: Rng;
  private still = 0;
  private doneTicks = 0;

  constructor(public stage: StageDef, public cfg: SandConfig, seed = 1) {
    this.rng = new Rng(seed);
    for (const r of stage.walls) this.fillRect(r.x, r.y, r.w, r.h, WALL);
    this.inkMax = Math.round(stage.ink * cfg.inkScale);
    this.ink = this.inkMax;
    this.spawned = stage.sources.map(() => 0);
    this.cupCount = stage.cups.map(() => 0);
    this.filled = stage.cups.map(() => false);
  }

  private fillRect(x: number, y: number, w: number, h: number, v: number): void {
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) this.grid[j * W + i] = v;
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= W || y < 0 || y >= H) return WALL;
    return this.grid[y * W + x];
  }

  /** 線を引く（太さ r の円を a→b に並べる）。インクが尽きたらそこまで。引けたマス数を返す */
  drawLine(ax: number, ay: number, bx: number, by: number, r = this.cfg.lineWidth): number {
    return this.drawLineCells(ax, ay, bx, by, r).length;
  }

  /** drawLine と同じだが、引いたマスの番号を返す（一筆ごとに消せるように） */
  drawLineCells(ax: number, ay: number, bx: number, by: number, r = this.cfg.lineWidth): number[] {
    const out: number[] = [];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(ax + ((bx - ax) * s) / steps), cy = Math.round(ay + ((by - ay) * s) / steps);
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          if (i * i + j * j > r * r + 0.5) continue;
          const x = cx + i, y = cy + j;
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          if (this.ink <= 0) return out;
          if (this.grid[y * W + x] !== EMPTY) continue;
          this.grid[y * W + x] = LINE;
          this.ink--;
          out.push(y * W + x);
        }
      }
    }
    return out;
  }

  /** マスの番号で線を消す（インクが戻る） */
  eraseCells(cells: number[]): number {
    let n = 0;
    for (const c of cells) {
      if (this.grid[c] !== LINE) continue;
      this.grid[c] = EMPTY;
      this.ink++;
      n++;
    }
    return n;
  }

  /** 線を消す（インクが戻る）。砂や壁は消さない */
  erase(cx: number, cy: number, r = 3): number {
    let n = 0;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (i * i + j * j > r * r + 0.5) continue;
        const x = cx + i, y = cy + j;
        if (this.get(x, y) !== LINE) continue;
        this.grid[y * W + x] = EMPTY;
        this.ink++;
        n++;
      }
    }
    return n;
  }

  /** 1ティック進める */
  step(): void {
    this.events = [];
    this.tick++;
    if (this.phase !== 'play') return;
    this.spawn();
    this.fall();
    this.countCups();
    this.checkEnd();
  }

  private spawn(): void {
    this.stage.sources.forEach((s, i) => {
      if (this.tick < (s.delay ?? 0)) return;
      const width = s.width ?? 3;
      for (let k = 0; k < s.rate; k++) {
        const x = s.x + this.rng.int(-Math.floor(width / 2), Math.floor(width / 2));
        if (this.spawned[i] >= Math.round(s.total * this.cfg.sandScale)) break;
        if (this.get(x, s.y) !== EMPTY) continue;
        this.grid[s.y * W + x] = SAND + s.color;
        this.spawned[i]++;
      }
    });
  }

  /** 砂を落とす。下の行から上へ。行ごとに左右の走査の向きを変えて偏りを消す */
  private fall(): void {
    const g = this.grid;
    let moved = 0, grains = 0;
    const flip = this.tick & 1;
    for (let y = H - 1; y >= 0; y--) {
      const ltr = ((y + flip) & 1) === 0;
      for (let k = 0; k < W; k++) {
        const x = ltr ? k : W - 1 - k;
        const v = g[y * W + x];
        if (v < SAND) continue;
        grains++;
        if (y === H - 1) {
          // 画面の下へ落ちた
          g[y * W + x] = EMPTY;
          this.lost++;
          moved++;
          continue;
        }
        const below = (y + 1) * W;
        if (g[below + x] === EMPTY) {
          g[below + x] = v;
          g[y * W + x] = EMPTY;
          moved++;
          continue;
        }
        const first = this.rng.next() < 0.5 ? -1 : 1;
        let done = false;
        for (const d of [first, -first]) {
          const nx = x + d;
          if (nx < 0 || nx >= W) continue;
          if (g[below + nx] === EMPTY && g[y * W + nx] === EMPTY) {
            g[below + nx] = v;
            g[y * W + x] = EMPTY;
            moved++;
            done = true;
            break;
          }
        }
        // 止まった砂が違う色の砂の上なら、混ざって新しい光になる
        if (!done) {
          // 下・左・右の順に、混ざる相手を探す
          for (const nb of [below + x, x > 0 ? y * W + x - 1 : -1, x < W - 1 ? y * W + x + 1 : -1]) {
            if (nb < 0) continue;
            const u = g[nb];
            if (u < SAND || u === v) continue;
            const m = MIX[`${v - SAND},${u - SAND}`];
            if (m === undefined || this.rng.next() >= this.cfg.mixRate) continue;
            g[y * W + x] = SAND + m;
            g[nb] = SAND + m;
            this.events.push({ t: 'mix', x, y, color: m });
            done = true;
            break;
          }
        }
        // 斜めにも行けない時：線や壁の上なら、ときどき横へ滑る（ゆるい坂でも流れる）。
        // 砂の山の上では滑らない（山の形が残る）。段差のある方（2マス先の下が空いている方）へ滑る
        if (!done && g[below + x] <= LINE && this.rng.next() < this.cfg.slide) {
          // 何マス先に段差があるか（近い方へ滑る。どちらにもなければ動かない）
          const drop = (dd: number) => {
            for (let k = 1; k <= 5; k++) {
              const xx = x + dd * k;
              if (xx < 0 || xx >= W || g[y * W + xx] !== EMPTY) return 99;
              if (g[below + xx] === EMPTY) return k;
            }
            return 99;
          };
          const a1 = drop(first), a2 = drop(-first);
          const d = a1 === 99 && a2 === 99 ? 0 : a1 <= a2 ? first : -first;
          const nx = x + d;
          if (d !== 0 && nx >= 0 && nx < W && g[y * W + nx] === EMPTY && g[below + nx] !== EMPTY && g[below + nx] <= LINE) {
            g[y * W + nx] = v;
            g[y * W + x] = EMPTY;
            moved++;
          }
        }
      }
    }
    this.grains = grains;
    this.still = moved === 0 ? this.still + 1 : 0;
  }

  private countCups(): void {
    this.stage.cups.forEach((c, i) => {
      const per = new Array(COLORS.length).fill(0);
      let all = 0;
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          const v = this.get(x, y);
          if (v >= SAND) { per[v - SAND]++; all++; }
        }
      }
      let n = all;
      if (c.color !== undefined) {
        n = per[c.color];
        // 混ざった色の器：材料の2色がそろっている分も数える（器の中でいずれ混ざる）
        const r = RECIPE[c.color];
        if (r) n += 2 * Math.min(per[r[0]], per[r[1]]);
      }
      this.cupCount[i] = n;
      if (!this.filled[i] && n >= c.need) {
        this.filled[i] = true;
        this.events.push({ t: 'fill', cup: i });
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

  /** 器の砂を消す（花火になって弾けた後） */
  emptyCup(i: number): number {
    const c = this.stage.cups[i];
    let n = 0;
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        if (this.get(x, y) >= SAND) { this.grid[y * W + x] = EMPTY; n++; }
      }
    }
    return n;
  }

  digest(): number[] {
    let h = 0;
    for (let i = 0; i < this.grid.length; i++) h = (h * 31 + this.grid[i]) | 0;
    return [this.tick, h, this.lost, ...this.cupCount];
  }
}
