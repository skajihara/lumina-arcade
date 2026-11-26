import { describe, expect, it } from 'vitest';
import { ClawSim, defaults, FLOOR_Y, IN_CLOSE, IN_OPEN, type ClawStage, type GemKind } from './sim';

const one = (kind: GemKind): ClawStage => ({ id: 't', name: 't', hint: '', gems: [{ kind, x: 6, y: FLOOR_Y - 0.4 }], boxes: [{ x: 16, y: FLOOR_Y - 2, w: 3, h: 1.6, mult: 1 }], need: 1, startX: 6 });

/** 目標へ動かしながら n ティック */
function go(sim: ClawSim, x: number, y: number, bits: number, n: number) {
  for (let i = 0; i < n; i++) sim.step(bits, { x, y });
}
/** 宝石の上で開いて下ろし、閉じて持ち上げる */
function pick(sim: ClawSim, kind: GemKind) {
  const g = sim.gems[0].body.getPosition();
  go(sim, g.x, 4, IN_OPEN, 120);
  go(sim, g.x, FLOOR_Y - 1.6 - (kind === 'moonstone' ? 0.3 : 0.1), 0, 320);
  go(sim, g.x, sim.head.getPosition().y, IN_CLOSE, 90);
  go(sim, g.x, 3, IN_CLOSE, 240);
}

describe('ClawSim（物理の爪）', () => {
  it('指で挟んだ水晶が持ち上がり、開くと落ちる', () => {
    const sim = new ClawSim(one('crystal'), defaults);
    pick(sim, 'crystal');
    const y = sim.gems[0].body.getPosition().y;
    expect(y).toBeLessThan(FLOOR_Y - 4);
    expect(sim.heldGems().length).toBe(1);
    go(sim, 6, 3, IN_OPEN, 300);
    expect(sim.gems[0].body.getPosition().y).toBeGreaterThan(FLOOR_Y - 1);
  });

  it('重い月長石も持ち上がる', () => {
    const sim = new ClawSim(one('moonstone'), defaults);
    pick(sim, 'moonstone');
    expect(sim.gems[0].body.getPosition().y).toBeLessThan(FLOOR_Y - 4);
  });

  it('宝石箱の上で放すと納まって点が入る', () => {
    const sim = new ClawSim(one('crystal'), defaults);
    pick(sim, 'crystal');
    go(sim, 17.5, 3, IN_CLOSE, 400);
    go(sim, 17.5, 3, IN_OPEN, 400);
    expect(sim.score).toBe(1);
  });

  it('同じ入力なら同じ結果（決定的）', () => {
    const a = new ClawSim(one('pearl'), defaults), b = new ClawSim(one('pearl'), defaults);
    pick(a, 'pearl'); pick(b, 'pearl');
    expect(a.digest()).toEqual(b.digest());
  });
});
