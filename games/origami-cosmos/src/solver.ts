/**
 * Origami Cosmos のソルバー：全部の星を燃やす最短の手順を探す（幅優先）。
 * 1手 = 折り方（0〜maxFolds 回の折りの列）＋ 点火1回。
 * 最短の点火回数を第一に、同じ点火回数なら折った回数の合計が少ないものを選ぶ。
 * パズルの検証（全問に解があるか）と、難しさ（最短手数）の目安、ヒント・自動プレイに使う。
 */
import { adjacency, type Fold, type StageDef } from './sim';

export interface Move {
  folds: Fold[];
  star: number;
}

export interface Solution {
  ignitions: number;
  folds: number;
  moves: Move[];
}

/** 折りの列を全部作る（同じ線を続けて折る列は除く） */
export function foldSequences(stage: StageDef, maxFolds: number): Fold[][] {
  const all: Fold[] = [];
  stage.folds.forEach((_, line) => { all.push({ line, side: 1 }, { line, side: -1 }); });
  const out: Fold[][] = [[]];
  let layer: Fold[][] = [[]];
  for (let d = 0; d < maxFolds; d++) {
    const next: Fold[][] = [];
    for (const seq of layer) {
      for (const f of all) {
        if (seq.length && seq[seq.length - 1].line === f.line) continue;
        next.push([...seq, f]);
      }
    }
    out.push(...next);
    layer = next;
  }
  return out;
}

/** 生きている星の集合（ビット）の上で、点火した星からの連鎖（ビット） */
function chainMask(adj: number[], alive: number, start: number): number {
  let seen = 1 << start;
  let frontier = seen;
  while (frontier) {
    let next = 0;
    for (let i = 0; frontier >> i; i++) if (frontier & (1 << i)) next |= adj[i];
    next &= alive & ~seen;
    seen |= next;
    frontier = next;
  }
  return seen;
}

/** alive を渡すと、その途中の状態から解く */
export function solve(stage: StageDef, opts: { blast: number; maxFolds: number; maxIgnitions?: number }, alive?: boolean[]): Solution | null {
  const n = stage.stars.length;
  if (n > 20) throw new Error('星が多すぎる');
  // 折り方ごとの隣接（ビット）。同じ隣接になる折り方は、折った回数が少ない方だけ残す
  const sigs = new Map<string, { adj: number[]; folds: Fold[] }>();
  for (const seq of foldSequences(stage, opts.maxFolds)) {
    const lists = adjacency(stage, seq, opts.blast);
    const adj = lists.map((l) => l.reduce((m, j) => m | (1 << j), 0));
    const key = adj.join(',');
    const prev = sigs.get(key);
    if (!prev || prev.folds.length > seq.length) sigs.set(key, { adj, folds: seq });
  }
  const shapes = [...sigs.values()];
  const full = alive ? alive.reduce((m, a, i) => (a ? m | (1 << i) : m), 0) : (1 << n) - 1;
  if (full === 0) return { ignitions: 0, folds: 0, moves: [] };
  // 状態：生きている星のビット。点火回数ごとに広げ、各状態は最少の折り回数を覚える
  const best = new Map<number, { folds: number; prev: number; move: Move | null }>();
  best.set(full, { folds: 0, prev: -1, move: null });
  let frontier = [full];
  const limit = opts.maxIgnitions ?? n;
  for (let ign = 1; ign <= limit; ign++) {
    const layer = new Map<number, { folds: number; prev: number; move: Move }>();
    for (const cur0 of frontier) {
      const base = best.get(cur0)!.folds;
      for (const sh of shapes) {
        let rest = cur0;
        while (rest) {
          const i = 31 - Math.clz32(rest & -rest);
          const burnt = chainMask(sh.adj, cur0, i);
          rest &= ~burnt; // 同じ連鎖になる星は1回だけ試す
          const next = cur0 & ~burnt;
          if (best.has(next)) continue;
          const f = base + sh.folds.length;
          const cur = layer.get(next);
          if (!cur || cur.folds > f) layer.set(next, { folds: f, prev: cur0, move: { folds: sh.folds, star: i } });
        }
      }
    }
    for (const [k, v] of layer) best.set(k, v);
    if (layer.has(0)) {
      const moves: Move[] = [];
      let s = 0;
      while (s !== full) {
        const b = best.get(s)!;
        moves.unshift(b.move!);
        s = b.prev;
      }
      return { ignitions: ign, folds: layer.get(0)!.folds, moves };
    }
    frontier = [...layer.keys()];
    if (!frontier.length) break;
  }
  return null;
}
