import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { CourierSim, defaults, HZ, type CourierStage } from './sim';
import { courierStages, flat } from './stages';
import { CourierBot } from './bot';

const plain: CourierStage = {
  id: 't', name: 't', hint: '', start: { x: 5, y: 11.9 }, nest: { x: 28, y: 12.4, w: 2.4 },
  islands: [{ pts: flat(1, 31, 12.4) }], kinds: ['push', 'pull', 'lift', 'delay'], par: 3, maxBlasts: 9,
};
const settle = (s: CourierSim) => { for (let i = 0; i < HZ; i++) s.step(); };

describe('Blast Courier', () => {
  it('同じ爆風なら同じ結果（決定性）', () => {
    const run = () => { const s = new CourierSim(plain, defaults); settle(s); s.blast(4.4, 12.2, 'push'); for (let i = 0; i < 300; i++) s.step(); return s.digest(); };
    expect(hashNumbers(run())).toBe(hashNumbers(run()));
  });

  it('押す（BC-10）：選んだ向きへ、強さに比例して飛ぶ。強すぎるとひびが入る。卵が遠くても届く', () => {
    const s = new CourierSim(plain, defaults);
    settle(s);
    const e = s.eggPos;
    s.act({ k: 'push', x: e.x, y: e.y, ax: 1, ay: -1, p: 0.5 });
    s.step();
    const v = s.egg.getLinearVelocity();
    expect(v.x).toBeGreaterThan(3);
    expect(v.y).toBeLessThan(-3);
    expect(s.cracks).toBe(0);
    const weak = new CourierSim(plain, defaults);
    settle(weak);
    weak.act({ k: 'push', x: 0, y: 0, ax: 1, ay: -1, p: 0.25 });
    weak.step();
    expect(weak.egg.getLinearVelocity().x).toBeLessThan(v.x * 0.7);
    const s2 = new CourierSim(plain, defaults);
    settle(s2);
    s2.act({ k: 'push', x: 0, y: 0, ax: 0, ay: -1, p: 1 });
    expect(s2.cracks).toBe(1);
  });

  it('前の操作（その場を叩く）：卵の左下で弾けると右上へ。近すぎるとひび', () => {
    const s = new CourierSim(plain, defaults);
    settle(s);
    const e = s.eggPos;
    s.blast(e.x - 1.2, e.y + 0.9, 'push');
    s.step();
    const v = s.egg.getLinearVelocity();
    expect(v.x).toBeGreaterThan(2);
    expect(v.y).toBeLessThan(-2);
    expect(s.cracks).toBe(0);
    const s2 = new CourierSim(plain, defaults);
    settle(s2);
    s2.blast(s2.eggPos.x - 0.2, s2.eggPos.y + 0.1, 'push');
    expect(s2.cracks).toBe(1);
  });

  it('待ち時間は短い：0.2 秒後には空中でもう一吹きできる', () => {
    const s = new CourierSim(plain, defaults);
    settle(s);
    expect(s.act({ k: 'push', x: 0, y: 0, ax: 0, ay: -1, p: 0.5 })).toBe(true);
    for (let i = 0; i < HZ * 0.2; i++) s.step();
    expect(s.act({ k: 'push', x: 0, y: 0, ax: 1, ay: 0, p: 0.5 })).toBe(true);
    expect(s.blasts).toBe(2);
  });

  it('吸う：その場へ引き寄せる', () => {
    const s = new CourierSim(plain, defaults);
    settle(s);
    const x0 = s.eggPos.x;
    s.blast(x0 + 3, s.eggPos.y - 1, 'pull');
    for (let i = 0; i < 30; i++) s.step();
    expect(s.eggPos.x).toBeGreaterThan(x0 + 0.5);
  });

  it('昇る：上昇気流の柱で卵が上がる', () => {
    const s = new CourierSim(plain, defaults);
    settle(s);
    const y0 = s.eggPos.y;
    s.blast(s.eggPos.x, s.eggPos.y + 0.3, 'lift');
    for (let i = 0; i < HZ; i++) s.step();
    expect(s.eggPos.y).toBeLessThan(y0 - 2);
  });

  it('遅れ：1 秒後に弾ける', () => {
    const s = new CourierSim(plain, defaults);
    settle(s);
    const e = s.eggPos;
    s.act({ k: 'delay', x: e.x - 0.5, y: e.y + 0.3, ax: 1, ay: -0.5, p: 0.5 });
    for (let i = 0; i < HZ * 0.9; i++) s.step();
    expect(Math.abs(s.egg.getLinearVelocity().x)).toBeLessThan(0.2);
    const ev: string[] = [];
    for (let i = 0; i < HZ * 0.2; i++) { s.step(); for (const q of s.events) ev.push(q.t); }
    expect(ev).toContain('boom');
    expect(s.egg.getLinearVelocity().x).toBeGreaterThan(2);
  });

  it('雲海へ落ちると、最後に止まった所へ戻って爆風が1回ぶん足される', () => {
    const st: CourierStage = { ...plain, islands: [{ pts: flat(1, 8, 12.4) }] };
    const s = new CourierSim(st, defaults);
    settle(s);
    s.act({ k: 'push', x: 0, y: 0, ax: 1, ay: -0.4, p: 0.55 });
    const ev: string[] = [];
    for (let i = 0; i < HZ * 6; i++) { s.step(); for (const q of s.events) ev.push(q.t); }
    expect(ev).toContain('ob');
    expect(s.blasts).toBe(2);
    expect(Math.abs(s.eggPos.x - 5)).toBeLessThan(0.5);
  });

  it('巣の中で止まればクリア', () => {
    const st: CourierStage = { ...plain, start: { x: 28, y: 11.5 } };
    const s = new CourierSim(st, defaults);
    for (let i = 0; i < HZ * 2 && s.phase === 'play'; i++) s.step();
    expect(s.phase).toBe('clear');
  });

  it('全ステージ：何もしないとクリアできず、先読みボットならクリアできる', () => {
    for (const st of courierStages) {
      const idle = new CourierSim(st, defaults);
      for (let i = 0; i < HZ * 10; i++) idle.step();
      expect(idle.phase, st.name).toBe('play');
      const sim = new CourierSim(st, defaults);
      const bot = new CourierBot(0.9, 1);
      while (sim.phase === 'play' && sim.tick < HZ * 120) { const a = bot.act(sim); if (a) sim.act(a); sim.step(); }
      expect(sim.phase, st.name).toBe('clear');
    }
  }, 120_000);
});
