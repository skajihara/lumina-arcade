import { describe, expect, it } from 'vitest';
import { presets } from './config';
import { OrigamiSim, foldPoint, adjacency, chain, type StageDef } from './sim';
import { solve, foldSequences } from './solver';
import { stages } from './stages';

const cfg = () => ({ ...presets['むずかしい'] });

// 8×4 の紙。左端と右端に星。真ん中で折ると重なる
const stage: StageDef = {
  id: 't', name: 't', hint: '', w: 8, h: 4,
  stars: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 7, y: 1 }, { x: 6, y: 1 }, { x: 3, y: 3 }],
  folds: [{ axis: 'x', at: 4 }, { axis: 'y', at: 2 }],
  ignitions: 2,
  maxFolds: 1,
};

describe('折る', () => {
  it('折り線の大きい側が反対側へ鏡写しに重なる', () => {
    expect(foldPoint(stage, [{ line: 0, side: 1 }], 7, 1)).toMatchObject({ x: 0, y: 1, flipped: true });
    expect(foldPoint(stage, [{ line: 0, side: 1 }], 4, 1)).toMatchObject({ x: 3, y: 1 });
    // 動かない側はそのまま
    expect(foldPoint(stage, [{ line: 0, side: 1 }], 2, 1)).toMatchObject({ x: 2, y: 1, flipped: false });
    // 小さい側を折る
    expect(foldPoint(stage, [{ line: 0, side: -1 }], 0, 1)).toMatchObject({ x: 7, y: 1 });
  });

  it('2回目の折りは、折った後の位置で動く側を決める', () => {
    // 右を左へ折ってから、上下で折る：右上の星は左下へ
    const p = foldPoint(stage, [{ line: 0, side: 1 }, { line: 1, side: -1 }], 7, 0);
    expect(p).toMatchObject({ x: 0, y: 3, z: 2, flipped: false });
  });

  it('折ると、離れた星が爆風の届く距離に来る', () => {
    const flat = adjacency(stage, [], 1);
    expect(flat[0]).toEqual([1]);
    const folded = adjacency(stage, [{ line: 0, side: 1 }], 1);
    expect(folded[0].sort()).toEqual([1, 2, 3]);
  });

  it('連鎖は生きている星だけをたどり、波ごとに並ぶ', () => {
    const adj = adjacency(stage, [{ line: 0, side: 1 }], 1);
    const waves = chain(adj, [true, true, true, true, true], 0);
    expect(waves[0]).toEqual([0]);
    expect(waves.flat().sort()).toEqual([0, 1, 2, 3]);
    expect(chain(adj, [true, false, false, true, true], 0).flat().sort()).toEqual([0, 3]);
  });
});

describe('OrigamiSim', () => {
  it('折って点火すると重なった星まで燃え、紙は開く。全部燃やせばクリア', () => {
    const sim = new OrigamiSim(stage, cfg());
    expect(sim.fold({ line: 0, side: 1 })).toBe(true);
    expect(sim.fold({ line: 1, side: 1 })).toBe(false); // 1手に1回まで
    sim.ignite(0);
    expect(sim.starsAlive()).toBe(1);
    expect(sim.folds.length).toBe(0);
    sim.ignite(4);
    expect(sim.phase).toBe('clear');
  });

  it('点火回数が尽きたら失敗', () => {
    const sim = new OrigamiSim(stage, cfg());
    sim.ignite(0);
    sim.ignite(2);
    expect(sim.phase).toBe('fail');
  });
});

describe('ソルバー', () => {
  it('折りの列：同じ線を続けて折らない', () => {
    const seqs = foldSequences(stage, 2);
    expect(seqs.length).toBe(1 + 4 + 4 * 2);
  });

  it('最短の点火回数と、その手順を見つける', () => {
    const sol = solve(stage, { blast: 1, maxFolds: 1 })!;
    expect(sol.ignitions).toBe(2);
    expect(sol.folds).toBe(1);
    // 手順をそのまま再生するとクリアできる
    const sim = new OrigamiSim(stage, cfg());
    for (const m of sol.moves) {
      for (const f of m.folds) sim.fold(f);
      sim.ignite(m.star);
    }
    expect(sim.phase).toBe('clear');
  });

  it('折れなければ点火回数が増える', () => {
    expect(solve(stage, { blast: 1, maxFolds: 0 })!.ignitions).toBe(3);
  });
});

describe('問題', () => {
  it('全問、ソルバーで解があり、ignitions が最短と一致する', () => {
    for (const st of stages) {
      const sol = solve(st, { blast: 1, maxFolds: st.maxFolds });
      expect(sol?.ignitions, st.name).toBe(st.ignitions);
    }
  });

  it('途中の状態からも解ける（ヒント用）', () => {
    const st = stages[2];
    const sim = new OrigamiSim(st, cfg());
    sim.ignite(4);
    const sol = solve(st, { blast: 1, maxFolds: st.maxFolds }, sim.alive)!;
    expect(sol.moves.every((m) => sim.alive[m.star])).toBe(true);
  });
});
