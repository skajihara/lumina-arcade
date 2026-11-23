/**
 * Origami Cosmos のルール（描画なし）。
 *
 * - 盤面は1枚の紙のような宇宙（w×h のマス）。星はマスの上にある
 * - 決められた折り線（縦か横）で、片側を反対側へ折り重ねる。1手に折れるのは maxFolds 回まで
 * - 折った状態で星を1つ点火すると、爆風が届く星（折った後の位置でチェビシェフ距離 blast 以内。重なった星は距離0）へ連鎖する
 * - 点火すると紙は開いて元に戻る。燃えた星は消えたまま
 * - 限られた点火回数で、全部の星を燃やせばクリア
 *
 * 折り線は盤面に固定。折る時は「今の（折った後の）座標」で、線のどちら側にある紙が動くかを決める（実際の紙と同じ）。
 */
import type { OrigamiConfig } from './config';

export interface StarDef {
  x: number;
  y: number;
}

/** 折り線：axis='x' なら x=at の縦線（列 at-1 と列 at の間）。'y' なら横線 */
export interface FoldLine {
  axis: 'x' | 'y';
  at: number;
}

export interface StageDef {
  id: string;
  name: string;
  hint: string;
  w: number;
  h: number;
  stars: StarDef[];
  folds: FoldLine[];
  /** 点火できる回数（ふつう）。やさしい・むずかしいはプリセットで増減 */
  ignitions: number;
  /** 1手に折れる回数 */
  maxFolds: number;
  /** 星座の線（見た目。開いた時に灯る） */
  links?: [number, number][];
}

/** 1回の折り：line は stage.folds の番号、side=+1 は線より大きい側が、-1 は小さい側が動く */
export interface Fold {
  line: number;
  side: 1 | -1;
}

export interface Placed {
  x: number;
  y: number;
  /** 重なりの順（大きいほど上） */
  z: number;
  /** 裏返っているか（奇数回折られた） */
  flipped: boolean;
}

/** 折りの列を順に当てた時の、各マスの位置 */
export function foldPoint(stage: StageDef, folds: Fold[], x: number, y: number): Placed {
  let px = x, py = y, z = 0, flips = 0;
  folds.forEach((f, k) => {
    const L = stage.folds[f.line];
    const c = L.axis === 'x' ? px : py;
    const moves = f.side === 1 ? c >= L.at : c < L.at;
    if (!moves) return;
    const m = 2 * L.at - 1 - c;
    if (L.axis === 'x') px = m;
    else py = m;
    z = k + 1;
    flips++;
  });
  return { x: px, y: py, z, flipped: flips % 2 === 1 };
}

/** 星 i と j が、折った状態で爆風の届く距離にあるか */
export function adjacency(stage: StageDef, folds: Fold[], blast: number): number[][] {
  const pos = stage.stars.map((s) => foldPoint(stage, folds, s.x, s.y));
  return pos.map((a, i) => {
    const out: number[] = [];
    pos.forEach((b, j) => {
      if (i !== j && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= blast) out.push(j);
    });
    return out;
  });
}

/** 点火した星から、生きている星をたどった連鎖。波ごとの星の番号の列を返す */
export function chain(adj: number[][], alive: boolean[], start: number): number[][] {
  if (!alive[start]) return [];
  const seen = new Set([start]);
  const waves: number[][] = [[start]];
  for (;;) {
    const next: number[] = [];
    for (const i of waves[waves.length - 1]) {
      for (const j of adj[i]) {
        if (!alive[j] || seen.has(j)) continue;
        seen.add(j);
        next.push(j);
      }
    }
    if (!next.length) break;
    waves.push(next.sort((a, b) => a - b));
  }
  return waves;
}

export type OrigamiEvent =
  | { t: 'fold'; fold: Fold }
  | { t: 'unfoldOne' }
  | { t: 'ignite'; star: number; waves: number[][] }
  | { t: 'clear' }
  | { t: 'fail' };

export type Phase = 'play' | 'clear' | 'fail';


/** 1つの盤面の進行。操作（折る・戻す・点火）を受けて、状態とイベントを返す */
export class OrigamiSim {
  alive: boolean[];
  folds: Fold[] = [];
  ignitionsLeft: number;
  phase: Phase = 'play';
  moves = 0;
  foldsUsed = 0;
  events: OrigamiEvent[] = [];

  constructor(public stage: StageDef, public cfg: OrigamiConfig) {
    this.alive = stage.stars.map(() => true);
    this.ignitionsLeft = stage.ignitions + cfg.extraIgnitions;
  }

  get maxFolds(): number {
    return Math.max(0, this.stage.maxFolds + this.cfg.extraFolds);
  }

  starsAlive(): number {
    return this.alive.filter(Boolean).length;
  }

  /** 今の折り方での星の位置 */
  positions(): Placed[] {
    return this.stage.stars.map((s) => foldPoint(this.stage, this.folds, s.x, s.y));
  }

  canFold(): boolean {
    return this.phase === 'play' && this.folds.length < this.maxFolds;
  }

  fold(f: Fold): boolean {
    this.events = [];
    if (!this.canFold() || !this.stage.folds[f.line]) return false;
    this.folds.push(f);
    this.foldsUsed++;
    this.events.push({ t: 'fold', fold: f });
    return true;
  }

  unfoldOne(): boolean {
    this.events = [];
    if (!this.folds.length) return false;
    this.folds.pop();
    this.events.push({ t: 'unfoldOne' });
    return true;
  }

  /** 星を点火する。連鎖が終わると紙は開く */
  ignite(star: number): number[][] {
    this.events = [];
    if (this.phase !== 'play' || !this.alive[star] || this.ignitionsLeft <= 0) return [];
    const adj = adjacency(this.stage, this.folds, this.cfg.blast);
    const waves = chain(adj, this.alive, star);
    for (const w of waves) for (const i of w) this.alive[i] = false;
    this.ignitionsLeft--;
    this.moves++;
    this.folds = [];
    this.events.push({ t: 'ignite', star, waves });
    if (this.starsAlive() === 0) {
      this.phase = 'clear';
      this.events.push({ t: 'clear' });
    } else if (this.ignitionsLeft <= 0) {
      this.phase = 'fail';
      this.events.push({ t: 'fail' });
    }
    return waves;
  }
}
