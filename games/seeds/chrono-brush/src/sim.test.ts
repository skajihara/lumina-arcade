import { describe, expect, it } from 'vitest';
import { ChronoSim, chronoStages, defaults } from './sim';
import { ChronoBot } from './bot';

describe('時空の絵筆（実験）', () => {
  it('遅い時間の中では星がゆっくり落ちる', () => {
    const a = new ChronoSim(defaults, 3);
    const b = new ChronoSim(defaults, 3);
    for (let i = 0; i < 70; i++) { a.step(); b.step(); }
    const s = b.stars[0];
    b.paint(s.x, s.y + 20, 'slow');
    for (let i = 0; i < 60; i++) { a.step(); b.step(); }
    expect(b.stars[0].y).toBeLessThan(a.stars[0].y);
  });

  it('同じシードなら同じ結果、全部降り終わると終わる', () => {
    const run = () => { const s = new ChronoSim(defaults, 5); for (let i = 0; i < 120 * 40 && !s.done; i++) s.step(); return [s.caught, s.missed, s.done]; };
    expect(run()).toEqual(run());
    expect(run()[2]).toBe(true);
  });

  it('逆再生の中では、星が来た道を戻る（上へ）', () => {
    const s = new ChronoSim({ ...defaults, zoneLife: 0 }, 3);
    for (let i = 0; i < 120; i++) s.step();
    const st = s.stars[0];
    const y0 = st.y;
    s.paint(st.x, st.y, 'rewind');
    for (let i = 0; i < 20; i++) s.step();
    expect(s.stars[0].y).toBeLessThan(y0);
  });

  it('塗った時間は消える', () => {
    const s = new ChronoSim({ ...defaults, zoneLife: 1 }, 3);
    s.paint(500, 300, 'slow');
    for (let i = 0; i < 130; i++) s.step();
    expect(s.zones.length).toBe(0);
  });

  it('風は世界の時間で吹く：遅らせた星ほど横へ運ばれる', () => {
    const c = { ...defaults, windBias: 100, wind: 0, zoneLife: 0 };
    const a = new ChronoSim(c, 3);
    const b = new ChronoSim(c, 3);
    for (let i = 0; i < 70; i++) { a.step(); b.step(); }
    b.paint(b.stars[0].x, b.stars[0].y + 30, 'slow');
    while (a.stars[0].alive) a.step();
    while (b.stars[0].alive) b.step();
    expect(b.stars[0].x).toBeGreaterThan(a.stars[0].x + 30);
  });

  it('全ステージ：何もしないとクリアできず、先読みボットならクリアできる', () => {
    for (const st of chronoStages) {
      const idle = ChronoSim.of(st);
      while (!idle.done) idle.step();
      expect(idle.cleared).toBe(false);
      const sim = ChronoSim.of(st);
      const bot = new ChronoBot(0.85);
      while (!sim.done) { bot.act(sim); sim.step(); }
      expect(sim.cleared, st.name).toBe(true);
    }
  }, 30_000);
});
