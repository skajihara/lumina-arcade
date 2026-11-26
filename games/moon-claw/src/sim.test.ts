import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { ClawSim, defaults, IN_DROP, IN_OPEN, HOLE_X0, HOLE_X1, SHELF_Y, type ClawStage } from './sim';

const pile = (x0: number, n: number, bomb = -1) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + (i % 4) * 0.66, y: SHELF_Y - 0.33 - Math.floor(i / 4) * 0.62, bomb: i === bomb }));
const stage: ClawStage = {
  id: 't', name: 't', hint: '', need: 3,
  spirits: pile(1.6, 8),
  goals: [{ x: 1.2, y: 14, r: 0.7, mult: 1 }, { x: 12.8, y: 14, r: 0.7, mult: 2 }],
};

/** 爪を x へ動かし、下ろして掴み、上げる */
function grabAt(sim: ClawSim, x: number) {
  for (let i = 0; i < 400; i++) sim.step(0, x);
  for (let i = 0; i < 400 && sim.clawMode !== 'up'; i++) sim.step(IN_DROP, x);
  for (let i = 0; i < 400 && sim.clawMode !== 'idle'; i++) sim.step(0, x);
}

describe('Moon Claw', () => {
  it('同じ入力なら同じ結果になる（決定性）', () => {
    const run = () => { const s = new ClawSim(stage, defaults); grabAt(s, 2.6); for (let i = 0; i < 300; i++) s.step(i % 50 < 10 ? 1 : 0, 7); return s; };
    expect(hashNumbers(run().digest())).toBe(hashNumbers(run().digest()));
  });

  it('山の上で爪を下ろすと掴み、落とし口の上で放すと下の段へ落ちる', () => {
    const sim = new ClawSim(stage, defaults);
    for (let i = 0; i < 240; i++) sim.step(0);
    grabAt(sim, 2.6);
    const held = sim.spirits.filter((s) => s.state === 'held').length;
    expect(held).toBeGreaterThan(0);
    // ゆっくり落とし口の上へ（速く動かすとこぼれる）
    const mid = (HOLE_X0 + HOLE_X1) / 2;
    for (let i = 0; i < 900; i++) sim.step(0, Math.min(mid, sim.claw.x + 0.025));
    const ev: string[] = [];
    sim.step(IN_OPEN, mid);
    for (let i = 0; i < 300; i++) { sim.step(0, mid); for (const e of sim.events) ev.push(e.t); }
    expect(ev).toContain('fall');
  });

  it('速く動かすと、掴んだ精霊がこぼれる', () => {
    const sim = new ClawSim(stage, defaults);
    for (let i = 0; i < 240; i++) sim.step(0);
    grabAt(sim, 2.6);
    const ev: string[] = [];
    for (let i = 0; i < 240; i++) { sim.step(0, i % 120 < 60 ? 13 : 1); for (const e of sim.events) ev.push(e.t); }
    expect(ev).toContain('slip');
  });

  it('爆弾は山に強くぶつかると爆発し、周りを吹き飛ばす', () => {
    const st: ClawStage = { ...stage, spirits: [...pile(1.6, 8), { x: 2.6, y: 2, bomb: true }] };
    const sim = new ClawSim(st, defaults);
    const ev: string[] = [];
    for (let i = 0; i < 240; i++) { sim.step(0); for (const e of sim.events) ev.push(e.t); }
    expect(ev).toContain('boom');
  });

  it('下の段の精霊が巣穴に入ると倍率の点が入り、need でクリア', () => {
    const st: ClawStage = { ...stage, need: 2, spirits: [{ x: 12.8, y: 13.2 }] };
    const sim = new ClawSim(st, defaults);
    sim.spirits[0].state = 'ball';
    for (let i = 0; i < 120 && sim.phase === 'play'; i++) sim.step(0);
    expect(sim.score).toBe(2);
    expect(sim.phase).toBe('clear');
  });
});

describe('Moon Claw のステージとボット', () => {
  it('どの面も：何もしないと失敗し、ボット（上手）ならクリアできる', async () => {
    const { clawStages } = await import('./stages');
    const { ClawBot } = await import('./bot');
    for (const st of clawStages) {
      const idle = new ClawSim(st, defaults);
      while (idle.phase === 'play') idle.step(0);
      expect(idle.phase, st.name).toBe('fail');
      let clears = 0;
      for (const seed of [1, 2, 3]) {
        const sim = new ClawSim(st, defaults);
        const bot = new ClawBot(0.9, seed);
        while (sim.phase === 'play') { const a = bot.act(sim); sim.step(a.bits, a.x); }
        if (sim.phase === 'clear') clears++;
      }
      expect(clears, st.name).toBeGreaterThanOrEqual(2);
    }
  }, 120_000);
});
