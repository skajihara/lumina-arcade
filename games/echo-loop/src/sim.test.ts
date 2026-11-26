import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { EchoSim, echoBias } from './sim';
import { stages as echoStages } from './stages';
import { stages } from '../../nova-pinball/src/stages';
import { NovaBot } from '../../nova-pinball/src/bot';
import type { StageDef } from '../../nova-pinball/src/stages';

const cfg = () => ({ ...presets[DEFAULT_PRESET], echoTwist: 0 });

function runBot(stage: StageDef, loops: number, seed = 1) {
  const es = new EchoSim(stage, cfg());
  const bot = new NovaBot(seed, 0.85);
  while (es.phase === 'play' && es.loop < loops) es.step(bot.input(es.sim));
  return es;
}

describe('EchoSim', () => {
  it('同じ入力なら同じ結果になる（決定性）', () => {
    const a = runBot(stages[11], 3, 4);
    const b = runBot(stages[11], 3, 4);
    expect(a.loop).toBe(3);
    expect(hashNumbers(a.digest())).toBe(hashNumbers(b.digest()));
  });

  it('ループが終わると時間が巻き戻り、星が復活し、ボールが1つ増える', () => {
    const es = new EchoSim(stages[11], cfg());
    const bot = new NovaBot(2, 0.85);
    let started = 0;
    while (es.loop < 1 && es.phase === 'play') {
      es.step(bot.input(es.sim));
      for (const e of es.events) if (e.t === 'loopStart') started++;
    }
    expect(started).toBe(1);
    expect(es.sim.tick).toBe(0);
    expect(es.sim.starsAlive()).toBe(stages[11].stars.length);
    expect(es.sim.balls.length).toBe(2);
    expect(es.history[0].length).toBe(es.loopTicks);
  });

  it('邪魔しなければ、残響は前のループと同じ動きをする', () => {
    const es = new EchoSim(stages[11], cfg());
    const bot = new NovaBot(3, 0.85);
    const path0: number[] = [];
    while (es.loop < 1 && es.phase === 'play') {
      es.step(bot.input(es.sim));
      if (es.loop === 0 && es.sim.tick % 60 === 0) {
        const b = es.sim.balls.find((x) => x.owner === 0);
        if (b) path0.push(b.body.getPosition().x, b.body.getPosition().y);
      }
    }
    // 2ループ目：今のボールは発射せず、フリッパーも触らない
    const path1: number[] = [];
    while (es.loop < 2 && es.phase === 'play') {
      es.step(0);
      if (es.loop === 1 && es.sim.tick % 60 === 0) {
        const b = es.sim.balls.find((x) => x.owner === 0);
        if (b) path1.push(b.body.getPosition().x, b.body.getPosition().y);
      }
    }
    expect(path1.length).toBeGreaterThan(4);
    expect(hashNumbers(path1)).toBe(hashNumbers(path0));
  });

  it('最大ループ数を使い切ると失敗', () => {
    const c = cfg();
    c.maxLoops = 2;
    c.loopSec = 5;
    const es = new EchoSim(stages[0], c);
    let fail = false;
    for (let i = 0; i < 120 * 12 && es.phase === 'play'; i++) {
      es.step(0);
      for (const e of es.events) if (e.t === 'echoFail') fail = true;
    }
    expect(fail).toBe(true);
    expect(es.phase).toBe('fail');
  });

  it('1ループの中で全部の星が爆発したらクリア', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 6, y: 8, charge: 2 }], links: [] };
    const es = new EchoSim(stage, cfg());
    (es.sim as unknown as { addCharge(s: unknown, n: number): void }).addCharge(es.sim.stars[0], 1);
    for (let i = 0; i < 60 && es.phase === 'play'; i++) es.step(0);
    expect(es.phase).toBe('clear');
  });

  it('共鳴：違うループの自分がほぼ同時に同じ星を打つと共鳴が起き、共鳴なしの設定では起きない', () => {
    const count = (res: number) => {
      let n = 0;
      for (let r = 0; r < 4; r++) {
        const st = echoStages[8];
        const es = new EchoSim(st, { ...cfg(), resonance: res });
        const bot = new NovaBot(r + 1 + 8 * 31, 0.85);
        bot.bias = echoBias(es);
        while (es.phase === 'play') { bot.owner = es.loop; es.step(bot.input(es.sim)); n += es.events.filter((e) => (e as { t: string }).t === 'resonance').length; }
      }
      return n;
    };
    expect(count(0.4)).toBeGreaterThan(0);
    expect(count(0)).toBe(0);
  }, 60_000);
});

describe('EL-11/12 残響の再生', () => {
  it('今のボールを発射しても、通り道で残響にぶつからず、残響は前と同じ道をたどる（時計の針の面でも）', () => {
    for (const st of [echoStages[0], echoStages[1]]) {
      const es = new EchoSim(st, cfg());
      const bot = new NovaBot(1, 0.85);
      const p0: { x: number; y: number }[] = [];
      while (es.loop === 0 && es.phase === 'play') {
        bot.owner = 0;
        es.step(bot.input(es.sim));
        const b = es.sim.balls.find((q) => q.owner === 0)!;
        p0[es.sim.tick] = { x: b.body.getPosition().x, y: b.body.getPosition().y };
      }
      // 2ループ目：今のボールは発射だけして何もしない（最初の3秒）
      let maxd = 0;
      while (es.sim.tick < 360 && es.phase === 'play') {
        es.step(es.sim.tick > 30 && es.sim.tick < 100 ? 4 : 0);
        const b = es.sim.balls.find((q) => q.owner === 0)!;
        const q = p0[es.sim.tick];
        if (q) maxd = Math.max(maxd, Math.hypot(b.body.getPosition().x - q.x, b.body.getPosition().y - q.y));
      }
      expect(maxd).toBeLessThan(0.01);
    }
  });

  it('ひねり「縮む時間」：残響の数だけループが短くなり、下限で止まる', () => {
    const c = { ...cfg(), echoTwist: 1, loopSec: 10, shrinkSec: 1, minLoopSec: 7, maxLoops: 6 };
    const es = new EchoSim(echoStages[0], c);
    const lens: number[] = [];
    let last = -1;
    while (es.phase === 'play') {
      if (es.loop !== last) { lens.push(es.loopTicks); last = es.loop; }
      es.step(0);
    }
    expect(lens).toEqual([1200, 1080, 960, 840, 840, 840]);
  });

  it('ひねり「影」：残響の連鎖で壊れた星は shadowSec 秒後に戻る', () => {
    const c = { ...cfg(), echoTwist: 2, shadowSec: 1 };
    const es = new EchoSim(echoStages[4], c);
    const bot = new NovaBot(3, 0.85);
    bot.bias = echoBias(es);
    // 1ループ目はボットが壊す。2ループ目は何もしない → 残響（1ループ目の自分）が壊した星は影になって戻る
    while (es.loop === 0 && es.phase === 'play') { bot.owner = 0; es.step(bot.input(es.sim)); }
    let shadows = 0, revives = 0;
    while (es.loop === 1 && es.phase === 'play') {
      es.step(0);
      for (const e of es.events) { if (e.t === 'shadow') shadows++; if (e.t === 'revive') revives++; }
    }
    expect(shadows).toBeGreaterThan(0);
    expect(revives).toBeGreaterThan(0);
  });
});
