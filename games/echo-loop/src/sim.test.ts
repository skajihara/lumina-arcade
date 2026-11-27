import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { EchoSim, defaults, HZ, IN_LAUNCH, type EchoStage } from './sim';
import { stages } from './stages';
import { EchoBot } from './bot';

/** テスト用の小さな面：真ん中に線でつながった2つの星 */
const pair: EchoStage = {
  id: 't', name: 't', hint: '', par: 2, groupNames: ['対', '一'],
  stars: [{ x: 5, y: 8, group: 0 }, { x: 9, y: 8, group: 0 }, { x: 7, y: 3, group: 1 }],
  links: [[0, 1]],
};

/** 球を (x, y) に速さ (vx, vy) で置く */
const place = (s: EchoSim, x: number, y: number, vx = 0, vy = 0) => {
  s.ball.setTransform({ x, y }, 0);
  s.ball.setLinearVelocity({ x: vx, y: vy });
  s.ball.setAwake(true);
};
const run = (s: EchoSim, sec: number, input = 0) => { for (let i = 0; i < HZ * sec; i++) s.step(input); };

describe('Echo Loop（一筆のループ）', () => {
  it('同じ入力なら同じ結果（決定性）', () => {
    const go = () => {
      const s = new EchoSim(stages[3], defaults);
      const bot = new EchoBot(3, 0.8);
      for (let i = 0; i < HZ * 20; i++) s.step(bot.input(s));
      return s.digest();
    };
    expect(hashNumbers(go())).toBe(hashNumbers(go()));
  });

  it('発射できる：レーンで溜めて放すと球が上へ', () => {
    const s = new EchoSim(pair, defaults);
    run(s, 1);
    run(s, 0.5, IN_LAUNCH);
    s.step(0);
    expect(s.ball.getLinearVelocity().y).toBeLessThan(-15);
  });

  it('落ちたら次の周になり、灯した星はそのまま残る', () => {
    const s = new EchoSim(pair, defaults);
    place(s, 5, 6.5, 0, 6);
    run(s, 0.5);
    expect(s.stars[0].lit).toBe(true);
    // 真ん中の穴へ落とす
    place(s, 6.9, 23.5, 0, 8);
    run(s, 1);
    expect(s.loop).toBe(2);
    expect(s.stars[0].lit).toBe(true);
    expect(s.phase).toBe('play');
  });

  it('線の両端が灯ると弦になり、上から落ちる球を弾き返す', () => {
    const s = new EchoSim(pair, defaults);
    place(s, 5, 6.5, 0, 6);
    run(s, 0.4);
    place(s, 9, 6.5, 0, 6);
    run(s, 0.4);
    expect(s.strung.has(0)).toBe(true);
    // 弦の真ん中へ、ゆっくり落とす → 上へ弾かれる
    place(s, 7, 6.6, 0, 5);
    let bounced = false;
    for (let i = 0; i < HZ * 0.6; i++) { s.step(0); if (s.events.some((e) => e.t === 'string')) bounced = true; }
    expect(bounced).toBe(true);
    expect(s.ball.getPosition().y).toBeLessThan(8);
  });

  it('速い球は弦を切って通り抜ける（次の周で張り直す）', () => {
    const s = new EchoSim(pair, defaults);
    place(s, 5, 6.5, 0, 6);
    run(s, 0.4);
    place(s, 9, 6.5, 0, 6);
    run(s, 0.4);
    place(s, 7, 6.0, 0, 22);
    let snapped = false;
    for (let i = 0; i < HZ * 0.3; i++) { s.step(0); if (s.events.some((e) => e.t === 'snap')) snapped = true; }
    expect(snapped).toBe(true);
    expect(s.ball.getPosition().y).toBeGreaterThan(8.5);
    expect(s.snapped.has(0)).toBe(true);
    place(s, 6.9, 23.5, 0, 8);
    run(s, 1);
    expect(s.snapped.size).toBe(0);
  });

  it('全部の星を灯すとクリア。周の上限を超えて落ちると失敗', () => {
    const s = new EchoSim(pair, defaults);
    for (const st of s.stars) { place(s, st.x, st.y - 1.5, 0, 6); run(s, 0.4); }
    expect(s.phase).toBe('clear');
    expect(s.rating()).toBe(3);
    const f = new EchoSim(pair, { ...defaults, maxLoops: 1 });
    place(f, 6.9, 23.5, 0, 8);
    run(f, 1);
    expect(f.phase).toBe('fail');
  });

  it('ボットはどの面でも数分動いて、壊れない（星をいくつか灯す）', () => {
    for (const st of stages) {
      const s = new EchoSim(st, defaults);
      const bot = new EchoBot(1, 0.85);
      while (s.phase === 'play' && s.tick < HZ * 120) s.step(bot.input(s));
      expect(s.litCount, st.name).toBeGreaterThan(0);
    }
  }, 120_000);
});
