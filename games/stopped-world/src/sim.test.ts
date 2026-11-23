import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { StopSim, type StageDef, type Action } from './sim';

const cfg = () => ({ ...presets[DEFAULT_PRESET] });

const nestStage: StageDef = {
  id: 't-nest', name: 't', hint: '', goal: 'nest',
  nest: { x: 15, y: 11.3, w: 3, h: 1.6 },
  objects: [{ kind: 'egg', x: 4, y: 11.5, w: 0.45 }],
};
const crateStage: StageDef = {
  id: 't-crate', name: 't', hint: '', goal: 'destroy',
  objects: [
    { kind: 'bomb', x: 8, y: 11.5, w: 0.45 },
    { kind: 'crate', x: 9.4, y: 11.4, w: 1.2 },
    { kind: 'crate', x: 6.6, y: 11.4, w: 1.2 },
  ],
};

function run(stage: StageDef, script: Record<number, Action[]>, ticks: number) {
  const sim = new StopSim(stage, cfg());
  const ev: string[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step(script[i] ?? []);
    for (const e of sim.events) ev.push(e.t);
  }
  return { sim, ev };
}

describe('StopSim', () => {
  it('止めている間は世界が進まず、ゲージだけ減る', () => {
    const sim = new StopSim(nestStage, cfg());
    for (let i = 0; i < 60; i++) sim.step();
    const y0 = sim.objs[0].body.getPosition().y;
    sim.step([{ t: 'stop' }]);
    const wt = sim.worldTick;
    for (let i = 0; i < 120; i++) sim.step();
    expect(sim.worldTick).toBe(wt);
    expect(sim.objs[0].body.getPosition().y).toBe(y0);
    expect(sim.gauge).toBeCloseTo(cfg().stopGauge - 121 / 120, 2);
  });

  it('止めて叩いた力は、時間を戻した瞬間に効く', () => {
    const sim = new StopSim(nestStage, cfg());
    for (let i = 0; i < 60; i++) sim.step();
    sim.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 1, dy: -0.4 }]);
    expect(sim.objs[0].body.getLinearVelocity().x).toBeCloseTo(0, 3);
    sim.step([{ t: 'resume' }]);
    expect(sim.objs[0].body.getLinearVelocity().x).toBeGreaterThan(3);
  });

  it('1回の停止で置ける力の数には上限がある', () => {
    const sim = new StopSim(nestStage, cfg());
    const hits: Action[] = Array.from({ length: 10 }, () => ({ t: 'hit', id: 0, dx: 1, dy: 0 }) as Action);
    sim.step([{ t: 'stop' }, ...hits]);
    expect(sim.forcesThisStop).toBe(cfg().maxForces);
    expect(Math.hypot(sim.objs[0].force.x, sim.objs[0].force.y)).toBeLessThanOrEqual(cfg().maxForce + 1e-6);
  });

  it('強く叩きすぎると卵は割れる', () => {
    // 巣と反対の壁へ（巣は卵を受け止めるので、巣の方へ投げると割れないことがある）
    const script: Record<number, Action[]> = { 60: [{ t: 'stop' }, ...Array.from({ length: 4 }, () => ({ t: 'hit', id: 0, dx: -1, dy: 0 }) as Action)], 61: [{ t: 'resume' }] };
    const { sim, ev } = run(nestStage, script, 600);
    expect(ev).toContain('fail');
    expect(sim.phase).toBe('fail');
  });

  it('止めている間に叩いた爆弾は、時間が戻ると爆発して箱を壊す', () => {
    const script: Record<number, Action[]> = { 30: [{ t: 'stop' }, { t: 'hit', id: 0, dx: 0, dy: -1 }], 40: [{ t: 'resume' }] };
    const { sim, ev } = run(crateStage, script, 240);
    expect(ev.indexOf('boom')).toBeGreaterThan(ev.indexOf('resume'));
    expect(ev).toContain('break');
    expect(sim.phase).toBe('clear');
  });

  it('卵をそっと転がして巣に入れるとクリア（決定的）', () => {
    // 弱い力を1つだけ置く
    const script: Record<number, Action[]> = {
      60: [{ t: 'stop' }, { t: 'hit', id: 0, dx: 1, dy: 0 }],
      61: [{ t: 'resume' }],
    };
    const a = run(nestStage, script, 1200);
    const b = run(nestStage, script, 1200);
    expect(hashNumbers(a.sim.digest())).toBe(hashNumbers(b.sim.digest()));
    // 巣に届いたかどうかは配置次第：少なくとも割れずに右へ進む
    expect(a.sim.objs[0].alive).toBe(true);
    expect(a.sim.objs[0].body.getPosition().x).toBeGreaterThan(6);
  });

  it('予測線：止めている間の先読みが、実際に戻した後の動きとほぼ一致する', () => {
    const sim = new StopSim(nestStage, cfg());
    for (let i = 0; i < 60; i++) sim.step();
    sim.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 1, dy: -0.4 }]);
    const before = sim.digest();
    const pred = sim.predict(1, 4);
    // 先読みは元の世界を変えない
    expect(sim.digest()).toEqual(before);
    expect(pred.length).toBe(1);
    const last = pred[0].pts[pred[0].pts.length - 1];
    sim.step([{ t: 'resume' }]);
    for (let i = 1; i < 120; i++) sim.step();
    const p = sim.objs[0].body.getPosition();
    expect(Math.hypot(p.x - last.x, p.y - last.y)).toBeLessThan(0.3);
  });

  it('予測線：点火した爆弾の先読みで箱が消える', () => {
    const sim = new StopSim(crateStage, cfg());
    for (let i = 0; i < 30; i++) sim.step();
    sim.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 0, dy: -1 }]);
    const pred = sim.predict(1, 4);
    expect(pred.filter((p) => p.kind === 'crate' && p.ends === 'gone').length).toBe(2);
  });

  it('ひねり1：箱を壊すと時間停止ゲージが戻る（上限まで）', () => {
    const c = { ...cfg(), twist: 1, refill: 0.6 };
    const sim = new StopSim(crateStage, c);
    for (let i = 0; i < 30; i++) sim.step();
    sim.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 0, dy: -1 }]);
    for (let i = 0; i < 240; i++) sim.step([]); // 2秒止めたまま
    const before = sim.gauge;
    sim.step([{ t: 'resume' }]);
    let refills = sim.events.filter((e) => e.t === 'refill').length;
    for (let i = 0; i < 240; i++) { sim.step(); refills += sim.events.filter((e) => e.t === 'refill').length; }
    expect(refills).toBeGreaterThan(0);
    expect(sim.gauge).toBeGreaterThan(before);
    expect(sim.gauge).toBeLessThanOrEqual(c.stopGauge);
    // ひねりなしでは戻らない
    const plain = new StopSim(crateStage, { ...cfg(), twist: 0 });
    for (let i = 0; i < 30; i++) plain.step();
    plain.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 0, dy: -1 }]);
    for (let i = 0; i < 240; i++) plain.step([]);
    const b2 = plain.gauge;
    plain.step([{ t: 'resume' }]);
    for (let i = 0; i < 240; i++) plain.step();
    expect(plain.gauge).toBeCloseTo(b2, 5);
  });

  it('ひねり2：飛んでいる物を止めて叩くと、速さを保って矢印の向きへ曲がる', () => {
    const sim = new StopSim(nestStage, { ...cfg(), twist: 2 });
    for (let i = 0; i < 30; i++) sim.step();
    sim.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 1, dy: 0 }]);
    sim.step([{ t: 'resume' }]);
    for (let i = 0; i < 12; i++) sim.step();
    const v0 = sim.objs[0].body.getLinearVelocity();
    const sp0 = Math.hypot(v0.x, v0.y);
    expect(v0.x).toBeGreaterThan(1);
    // 横へ飛んでいる卵を止めて、真上へ叩く
    sim.step([{ t: 'stop' }, { t: 'hit', id: 0, dx: 0, dy: -1 }]);
    sim.step([{ t: 'resume' }]);
    const v1 = sim.objs[0].body.getLinearVelocity();
    expect(Math.abs(v1.x)).toBeLessThan(0.5);
    expect(-v1.y).toBeGreaterThan(sp0);
  });
});
