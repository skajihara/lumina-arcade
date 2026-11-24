import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { SandSim, W, H, LINE, EMPTY, type StageDef } from './sim';
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
    const sim = run(simple, 700);
    expect(sim.lost).toBeGreaterThan(100);
    expect(sim.cupCount[0]).toBe(0);
  });

  it('砂は流体のように流れて、床の上で広がる（ギザギザの段で止まらない）', () => {
    const st: StageDef = { ...simple, walls: [{ x: 0, y: H - 2, w: W, h: 2 }], cups: [] };
    const sim = run(st, 900);
    let x0 = W, x1 = 0, top = H;
    for (let i = 0; i < sim.grains; i++) { x0 = Math.min(x0, sim.gx[i]); x1 = Math.max(x1, sim.gx[i]); top = Math.min(top, sim.gy[i]); }
    expect(sim.grains).toBe(200);
    expect(x1 - x0).toBeGreaterThan(40);
    expect(H - 2 - top).toBeLessThan(10);
  });

  it('ゆるい坂の線（5°）でも砂は流れ落ちる', () => {
    const st: StageDef = { ...simple, cups: [], walls: [] };
    const sim = new SandSim(st, cfg());
    sim.drawLine(20, 40, 140, 40 + Math.tan((5 * Math.PI) / 180) * 120);
    for (let i = 0; i < 2500; i++) sim.step();
    let onLine = 0;
    for (let i = 0; i < sim.grains; i++) if (sim.gx[i] > 20 && sim.gx[i] < 140 && sim.gy[i] < 52) onLine++;
    expect(onLine).toBeLessThan(40);
    expect(sim.lost).toBeGreaterThan(120);
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
    expect(n).toBeLessThan(12);
    expect(sim.drawLineIds(0, 60, 50, 60)).toEqual([]);
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

  it('ひねり1：満ちた器の砂は花火の雨になって周りへ降る（ひねりなしでは消えるだけ）', () => {
    const a = new SandSim(stages[1], { ...cfg(), twist: 1 }, 1);
    for (const l of stages[1].solution ?? []) for (let k = 1; k < l.length; k++) a.drawLine(l[k - 1].x, l[k - 1].y, l[k].x, l[k].y);
    let rain = 0;
    for (let k = 0; k < 8000 && a.phase === 'play'; k++) { a.step(); rain += a.events.filter((e) => e.t === 'rain').length; }
    expect(a.phase).toBe('clear');
    expect(rain).toBeGreaterThan(0);
    const b = new SandSim(stages[1], { ...cfg(), twist: 0 }, 1);
    for (const l of stages[1].solution ?? []) for (let k = 1; k < l.length; k++) b.drawLine(l[k - 1].x, l[k - 1].y, l[k].x, l[k].y);
    let rain0 = 0;
    for (let k = 0; k < 8000 && b.phase === 'play'; k++) { b.step(); rain0 += b.events.filter((e) => e.t === 'rain').length; }
    expect(rain0).toBe(0);
  });
});
