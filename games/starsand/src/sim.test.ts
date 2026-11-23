import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { SandSim, W, H, SAND, LINE, EMPTY, type StageDef } from './sim';
import { stages, cupBox } from './stages';

const cfg = () => ({ ...presets[DEFAULT_PRESET] });
const box = cupBox(150, H - 20, 30, 16, 100);
const simple: StageDef = {
  id: 't', name: 't', hint: '', walls: box.walls, cups: [box.cup], ink: 400,
  sources: [{ x: 40, y: 2, color: 0, total: 200, rate: 2 }],
};

function run(st: StageDef, ticks: number, setup?: (s: SandSim) => void, seed = 1) {
  const sim = new SandSim(st, cfg(), seed);
  setup?.(sim);
  for (let i = 0; i < ticks && sim.phase === 'play'; i++) sim.step();
  return sim;
}

describe('SandSim', () => {
  it('同じシードなら同じ結果（決定性）', () => {
    const a = run(simple, 400, (s) => s.drawLine(30, 40, 150, 90));
    const b = run(simple, 400, (s) => s.drawLine(30, 40, 150, 90));
    expect(hashNumbers(a.digest())).toBe(hashNumbers(b.digest()));
  });

  it('砂は落ちて、下に何もなければ画面の外へ消える', () => {
    const sim = run(simple, 400);
    expect(sim.lost).toBeGreaterThan(100);
    expect(sim.cupCount[0]).toBe(0);
  });

  it('砂は積もって山になる（斜めに崩れる）', () => {
    const st: StageDef = { ...simple, walls: [{ x: 0, y: H - 2, w: W, h: 2 }], cups: [] };
    const sim = run(st, 600);
    // 注ぎ口の真下に山。山の幅は高さより広い
    let top = H;
    for (let y = 0; y < H; y++) if (sim.get(40, y) >= SAND) { top = y; break; }
    const height = H - 2 - top;
    let width = 0;
    for (let x = 0; x < W; x++) if (sim.get(x, H - 3) >= SAND) width++;
    expect(height).toBeGreaterThan(3);
    expect(width).toBeGreaterThan(height);
  });

  it('線で流れを器へ導くとクリア。インクは引いた分だけ減り、消すと戻る', () => {
    const sim = new SandSim(simple, cfg());
    const used = sim.drawLine(30, 40, 150, 90);
    expect(used).toBeGreaterThan(50);
    expect(sim.ink).toBe(sim.inkMax - used);
    expect(sim.get(30, 40)).toBe(LINE);
    for (let i = 0; i < 3000 && sim.phase === 'play'; i++) sim.step();
    expect(sim.phase).toBe('clear');
    const back = sim.erase(30, 40);
    expect(back).toBeGreaterThan(0);
    expect(sim.get(30, 40)).toBe(EMPTY);
  });

  it('インクが尽きたら線は引けない', () => {
    const sim = new SandSim({ ...simple, ink: 20 }, cfg());
    sim.drawLine(0, 50, 199, 50);
    expect(sim.ink).toBe(0);
    let n = 0;
    for (let x = 0; x < W; x++) if (sim.get(x, 50) === LINE) n++;
    expect(n).toBeLessThan(20);
  });

  it('砂が尽きて器が満ちなければ失敗', () => {
    const sim = run(simple, 2000);
    expect(sim.phase).toBe('fail');
  });

  it('全ステージ：解の線を引けばクリアできる', () => {
    for (const st of stages) {
      const sim = new SandSim(st, cfg());
      for (const line of st.solution ?? []) for (let i = 1; i < line.length; i++) sim.drawLine(line[i - 1].x, line[i - 1].y, line[i].x, line[i].y);
      for (let i = 0; i < 6000 && sim.phase === 'play'; i++) sim.step();
      expect(sim.phase, st.name).toBe('clear');
    }
  });
});
