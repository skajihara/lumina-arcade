import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { EchoSim, echoBias } from './sim';
import { stages as echoStages } from './stages';
import { stages } from '../../nova-pinball/src/stages';
import { NovaBot } from '../../nova-pinball/src/bot';
import type { StageDef } from '../../nova-pinball/src/stages';

const cfg = () => ({ ...presets[DEFAULT_PRESET] });

function runBot(stage: StageDef, loops: number, seed = 1) {
  const es = new EchoSim(stage, cfg());
  const bot = new NovaBot(seed, 0.85);
  while (es.phase === 'play' && es.loop < loops) es.step(bot.input(es.sim));
  return es;
}

describe('EchoSim', () => {
  it('同じ入力なら同じ結果になる（決定性）', () => {
    const a = runBot(stages[3], 3, 4);
    const b = runBot(stages[3], 3, 4);
    expect(a.loop).toBe(3);
    expect(hashNumbers(a.digest())).toBe(hashNumbers(b.digest()));
  });

  it('ループが終わると時間が巻き戻り、星が復活し、ボールが1つ増える', () => {
    const es = new EchoSim(stages[0], cfg());
    const bot = new NovaBot(2, 0.85);
    let started = 0;
    while (es.loop < 1) {
      es.step(bot.input(es.sim));
      for (const e of es.events) if (e.t === 'loopStart') started++;
    }
    expect(started).toBe(1);
    expect(es.sim.tick).toBe(0);
    expect(es.sim.starsAlive()).toBe(stages[0].stars.length);
    expect(es.sim.balls.length).toBe(2);
    expect(es.history[0].length).toBe(es.loopTicks);
  });

  it('邪魔しなければ、残響は前のループと同じ動きをする', () => {
    const es = new EchoSim(stages[0], cfg());
    const bot = new NovaBot(3, 0.85);
    const path0: number[] = [];
    while (es.loop < 1) {
      es.step(bot.input(es.sim));
      if (es.loop === 0 && es.sim.tick % 60 === 0) {
        const b = es.sim.balls.find((x) => x.owner === 0);
        if (b) path0.push(b.body.getPosition().x, b.body.getPosition().y);
      }
    }
    // 2ループ目：今のボールは発射せず、フリッパーも触らない
    const path1: number[] = [];
    while (es.loop < 2) {
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
