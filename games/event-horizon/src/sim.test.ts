import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { HorizonSim, IN_BURST, IN_PULL, type StageDef, type HorizonInput } from './sim';

const cfg = () => ({ ...presets[DEFAULT_PRESET] });

const stage: StageDef = {
  id: 't', name: 't', hint: '',
  shards: [{ x: 5, y: 11.7 }, { x: 6, y: 11.7 }, { x: 14, y: 11.7, kind: 'heavy' }],
  goals: [{ x: 17, y: 3, r: 1 }],
  need: 2,
  start: { x: 10, y: 3 },
};

/** 入力を作る関数でティックを回す */
function run(st: StageDef, ticks: number, f: (i: number, s: HorizonSim) => HorizonInput) {
  const sim = new HorizonSim(st, cfg());
  const ev: string[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step(f(i, sim));
    for (const e of sim.events) ev.push(e.t);
  }
  return { sim, ev };
}

describe('HorizonSim', () => {
  it('同じ入力なら同じ結果になる（決定性）', () => {
    const f = (i: number): HorizonInput => ({ x: 5 + Math.sin(i / 50) * 4, y: 8, bits: i % 300 < 200 ? IN_PULL : i % 300 === 250 ? IN_BURST : 0 });
    const a = run(stage, 1200, f);
    const b = run(stage, 1200, f);
    expect(hashNumbers(a.sim.digest())).toBe(hashNumbers(b.sim.digest()));
  });

  it('ブラックホールは最高速度でしか動けない', () => {
    const sim = new HorizonSim(stage, cfg());
    sim.step({ x: 19, y: 3, bits: 0 });
    expect(sim.bh.x).toBeCloseTo(10 + cfg().bhSpeed / 120, 5);
  });

  it('星座の穴はブラックホールを寄せつけない', () => {
    const { sim } = run(stage, 240, () => ({ x: 17, y: 3, bits: 0 }));
    const g = stage.goals[0];
    expect(Math.hypot(sim.bh.x - g.x, sim.bh.y - g.y)).toBeGreaterThanOrEqual(g.r + cfg().goalGuard - 1e-6);
  });

  it('引くと近くのかけらが浮き上がる。引かなければ浮かない', () => {
    const lifted = (bits: number) => run({ ...stage, start: { x: 5, y: 8.5 } }, 90, () => ({ x: 5, y: 8.5, bits })).sim.shards[0].body.getPosition().y;
    expect(lifted(IN_PULL)).toBeLessThan(11);
    expect(lifted(0)).toBeGreaterThan(11.5);
  });

  it('地平の内側に入ったかけらは吸い込まれて消える', () => {
    // 上から勢いよく突っ込むと、輪に乗りきれずに地平の内へ入る
    const { sim, ev } = run({ ...stage, start: { x: 5, y: 5 } }, 400, () => ({ x: 5, y: 11.6, bits: IN_PULL }));
    expect(ev).toContain('swallow');
    expect(sim.shards[0].state).toBe('lost');
  });

  it('地平の近くにかけらがあると時間が遅れる', () => {
    let minScale = 1;
    run({ ...stage, start: { x: 5, y: 5 } }, 400, (_i, s) => {
      minScale = Math.min(minScale, s.timeScale);
      return { x: 5, y: 11.6, bits: IN_PULL };
    });
    expect(minScale).toBeLessThan(0.8);
  });

  it('解放は周りのかけらを外へ弾き、しばらく引力が消える', () => {
    const sim = new HorizonSim(stage, cfg());
    // かけら0と1の間の上に置いて解放
    for (let i = 0; i < 80; i++) sim.step({ x: 5.5, y: 10.5, bits: 0 });
    sim.step({ x: 5.5, y: 10.5, bits: IN_BURST });
    expect(sim.events.some((e) => e.t === 'burst' && e.n === 2)).toBe(true);
    expect(sim.shards[0].body.getLinearVelocity().x).toBeLessThan(-2);
    expect(sim.shards[1].body.getLinearVelocity().x).toBeGreaterThan(2);
    sim.step({ x: 5.5, y: 10.5, bits: IN_PULL });
    expect(sim.pulling).toBe(false);
  });

  it('穴に入ると捕まり、続けて入ると連鎖、必要数でクリア', () => {
    const st: StageDef = { ...stage, shards: [{ x: 17, y: 1.5 }, { x: 17.2, y: 0.8 }, { x: 3, y: 11.7 }], goals: [{ x: 17, y: 3, r: 1 }], need: 2 };
    const { sim, ev } = run(st, 240, () => ({ x: 3, y: 3, bits: 0 }));
    expect(ev.filter((e) => e === 'capture').length).toBe(2);
    expect(sim.bestChain).toBe(2);
    expect(sim.phase).toBe('clear');
  });

  it('残りのかけらが必要数に届かなくなったら失敗', () => {
    const st: StageDef = { ...stage, pits: [[4, 7]], shards: [{ x: 5, y: 11 }, { x: 6, y: 11 }, { x: 14, y: 11.7 }], need: 2 };
    const { sim, ev } = run(st, 400, () => ({ x: 15, y: 3, bits: 0 }));
    expect(ev).toContain('fall');
    expect(sim.phase).toBe('fail');
  });
});
