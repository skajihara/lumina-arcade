import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { stages } from './stages';
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
function run(st: StageDef, ticks: number, f: (i: number, s: HorizonSim) => HorizonInput, over: Record<string, number> = {}) {
  const sim = new HorizonSim(st, { ...cfg(), ...over } as ReturnType<typeof cfg>);
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

  it('やさしいは、必要数が4以上の面だけ1つ少なくてよい', () => {
    const mk = (need: number): StageDef => ({ ...(stages[0] as StageDef), need });
    expect(new HorizonSim(mk(7), { ...presets['やさしい'] }).need).toBe(6);
    expect(new HorizonSim(mk(3), { ...presets['やさしい'] }).need).toBe(3);
    expect(new HorizonSim(mk(7), { ...presets['ふつう'] }).need).toBe(7);
  });

  it('ブラックホールはカーソルの真下に付く（follow 0 なら最高速度で追いかける）', () => {
    const sim = new HorizonSim(stage, cfg());
    sim.step({ x: 19, y: 3, bits: 0 });
    expect(sim.bh.x).toBeCloseTo(19, 5);
    const slow = new HorizonSim(stage, { ...cfg(), follow: 0 });
    slow.step({ x: 19, y: 3, bits: 0 });
    expect(slow.bh.x).toBeCloseTo(10 + cfg().bhSpeed / 120, 5);
  });

  it('ブラックホールは星座の穴にも重ねられる。穴の上では引力が切れる', () => {
    const g = stage.goals[0];
    const { sim } = run(stage, 240, () => ({ x: g.x, y: g.y, bits: IN_PULL }));
    expect(Math.hypot(sim.bh.x - g.x, sim.bh.y - g.y)).toBeLessThan(1e-6);
    expect(sim.overGoal()).toBe(true);
    expect(sim.pulling).toBe(false);
  });

  it('引くと近くのかけらが浮き上がる。引かなければ浮かない', () => {
    const lifted = (bits: number) => run({ ...stage, start: { x: 5, y: 8.5 } }, 90, () => ({ x: 5, y: 8.5, bits })).sim.shards[0].body.getPosition().y;
    expect(lifted(IN_PULL)).toBeLessThan(11);
    expect(lifted(0)).toBeGreaterThan(11.5);
  });

  it('地平の内側に入ったかけらは吸い込まれて消える（ひねりなし）', () => {
    // 上から勢いよく突っ込むと、輪に乗りきれずに地平の内へ入る
    const { sim, ev } = run({ ...stage, start: { x: 5, y: 5 } }, 400, () => ({ x: 5, y: 11.6, bits: IN_PULL }), { twist: 0 });
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

  it('ひねり1：地平に入ったかけらは抱えられ、解放で吐き出される（抱えすぎると蒸発）', () => {
    const one: StageDef = { id: 't1', name: 't', hint: '', shards: [{ x: 10, y: 6 }], goals: [{ x: 2, y: 2, r: 1 }], need: 1, start: { x: 10, y: 6.1 } };
    const sim = new HorizonSim(one, { ...cfg(), twist: 1, gravity: 0 });
    sim.step({ x: 10, y: 6, bits: 0 });
    expect(sim.shards[0].state).toBe('held');
    expect(sim.phase).toBe('play');
    for (let i = 0; i < 30; i++) sim.step({ x: 10, y: 6, bits: 0 });
    sim.step({ x: 10, y: 6, bits: IN_BURST });
    expect(sim.shards[0].state).toBe('free');
    const v = sim.shards[0].body.getLinearVelocity();
    expect(Math.hypot(v.x, v.y)).toBeGreaterThan(5);
    // もう一度抱えて、解放しないと蒸発する
    const sim2 = new HorizonSim(one, { ...cfg(), twist: 1, gravity: 0, holdSec: 1 });
    let ev: string[] = [];
    for (let i = 0; i < 200; i++) { sim2.step({ x: 10, y: 6, bits: 0 }); ev = ev.concat(sim2.events.map((e) => e.t)); }
    expect(ev).toContain('evaporate');
    expect(sim2.shards[0].state).toBe('lost');
    expect(sim2.phase).toBe('fail');
  });

  it('ひねりなしでは、地平に入ったかけらはすぐ失われる', () => {
    const one: StageDef = { id: 't1', name: 't', hint: '', shards: [{ x: 10, y: 6 }], goals: [{ x: 2, y: 2, r: 1 }], need: 1, start: { x: 10, y: 6.1 } };
    const sim = new HorizonSim(one, { ...cfg(), twist: 0, gravity: 0 });
    sim.step({ x: 10, y: 6, bits: 0 });
    expect(sim.shards[0].state).toBe('lost');
  });

  it('ひねり2：かけらが入った穴は、縁の近くのかけらを引き込む', () => {
    const st: StageDef = { id: 't2', name: 't', hint: '', shards: [{ x: 5, y: 5 }, { x: 5 + 1 + 1.2, y: 5 }], goals: [{ x: 5, y: 5, r: 1 }], need: 2, start: { x: 15, y: 10 } };
    const sim = new HorizonSim(st, { ...cfg(), twist: 2, gravity: 0 });
    sim.step({ x: 15, y: 10, bits: 0 });
    expect(sim.goalFilled[0]).toBe(true);
    for (let i = 0; i < 240 && sim.phase === 'play'; i++) sim.step({ x: 15, y: 10, bits: 0 });
    expect(sim.phase).toBe('clear');
    const off = new HorizonSim(st, { ...cfg(), twist: 0, gravity: 0 });
    for (let i = 0; i < 240; i++) off.step({ x: 15, y: 10, bits: 0 });
    expect(off.phase).toBe('play');
  });
});
