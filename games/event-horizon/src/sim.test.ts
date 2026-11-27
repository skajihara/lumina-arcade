import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { SkimSim, defaults, HZ, type StageDef } from './sim';
import { stages } from './stages';
import { SkimBot } from './bot';
import { presets, toSkim } from './config';

const plain: StageDef = { id: 't', name: 't', hint: '', holes: [{ x: 16, y: 9, gm: 150, rs: 1.3 }], start: { around: 0, r: 5.5 }, rings: [], stars: [1, 2, 3] };
const run = (s: SkimSim, sec: number, input = 0) => { s.input = input; for (let i = 0; i < HZ * sec && s.phase === 'play'; i++) s.step(); };

describe('Event Horizon（地平すれすれ）', () => {
  it('同じ入力なら同じ結果（決定性）', () => {
    const go = () => { const s = new SkimSim(stages[0], defaults); run(s, 2, -1); run(s, 5, 0); return s.digest(); };
    expect(hashNumbers(go())).toBe(hashNumbers(go()));
  });

  it('何もしなければ円軌道のまま（10 秒たっても落ちない・流されない）', () => {
    const s = new SkimSim(plain, defaults);
    run(s, 10);
    expect(s.phase).toBe('play');
    expect(Math.abs(s.nearest().r - 5.5)).toBeLessThan(0.3);
  });

  it('減速し続けると地平の内側へ落ちて終わる', () => {
    const s = new SkimSim(plain, defaults);
    run(s, 20, -1);
    expect(s.phase).toBe('over');
    expect(s.endWhy).toBe('horizon');
  });

  it('減速の長さはなだらか：0.9 秒と 1.2 秒の減速で、どちらも落ちない', () => {
    for (const sec of [0.9, 1.2]) {
      const s = new SkimSim(plain, defaults);
      run(s, sec, -1);
      run(s, 8, 0);
      expect(s.phase, `${sec}`).toBe('play');
    }
  });

  it('地平に近いほど倍率が上がる', () => {
    const s = new SkimSim(plain, defaults);
    expect(s.dilationAt(16 + 5, 9)).toBeLessThan(s.dilationAt(16 + 2, 9));
    expect(s.dilationAt(16 + 1.4, 9)).toBeGreaterThan(3);
  });

  it('かけらを拾うと 10 × 倍率 点', () => {
    const st: StageDef = { ...plain, rings: [{ hole: 0, r: 5.5, count: 1, spin: 0 }] };
    const s = new SkimSim(st, defaults);
    // かけらを船の少し先へ置き直す
    s.shards[0].a = -Math.PI / 2 + 0.3;
    run(s, 2);
    expect(s.picks).toBe(1);
    expect(s.score).toBe(Math.round(10 * Math.round(s.dilationAt(16 + 5.5, 9) * 10) / 10));
  });

  it('燃料が尽きると噴射できない', () => {
    const s = new SkimSim({ ...plain, fuel: 0.5 }, defaults);
    run(s, 0.6, 1);
    expect(s.fuel).toBe(0);
    const v0 = Math.hypot(s.vx, s.vy);
    s.input = 1;
    s.step();
    expect(s.firing).toBe(0);
    expect(Math.abs(Math.hypot(s.vx, s.vy) - v0)).toBeLessThan(0.1);
  });

  it('何もしないと、どの面もかけらを（ほとんど）拾えない', () => {
    for (const st of stages) {
      const s = new SkimSim(st, defaults);
      run(s, 30);
      expect(s.score, st.name).toBeLessThan(st.stars[0]);
    }
  });

  it('全ステージ：ボットなら0点で終わらず、★1 に届く', () => {
    for (const st of stages) {
      const s = new SkimSim(st, toSkim(presets['ふつう']));
      const bot = new SkimBot(0.85, 1);
      while (s.phase === 'play' && s.tick < HZ * 200) { s.input = bot.input(s); s.step(); }
      expect(s.score, st.name).toBeGreaterThan(0);
      expect(s.score, st.name).toBeGreaterThanOrEqual(st.stars[0]);
    }
  }, 60_000);
});
