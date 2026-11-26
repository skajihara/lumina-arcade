import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { stages, type StageDef } from './stages';
import { MOON_L, NovaSim, IN_LAUNCH } from './sim';
import { NovaBot } from './bot';

const cfg = () => ({ ...presets[DEFAULT_PRESET] });

function runBot(stage: StageDef, seconds: number, seed = 1) {
  const sim = new NovaSim(stage, cfg());
  const bot = new NovaBot(seed);
  for (let i = 0; i < seconds * 120 && sim.phase === 'play'; i++) sim.step(bot.input(sim));
  return sim;
}

describe('NovaSim', () => {
  it('同じ入力なら同じ結果になる（決定性）', () => {
    const a = runBot(stages[0], 30, 7);
    const b = runBot(stages[0], 30, 7);
    expect(hashNumbers(a.digest())).toBe(hashNumbers(b.digest()));
  });

  it('発射したボールがプレイ領域に入る', () => {
    const sim = new NovaSim(stages[0], cfg());
    for (let i = 0; i < 60; i++) sim.step(0); // 着地を待つ
    for (let i = 0; i < 80; i++) sim.step(IN_LAUNCH);
    let entered = false;
    for (let i = 0; i < 240; i++) {
      sim.step(0);
      const p = sim.balls[0]?.body.getPosition();
      if (p && p.x < 13.0) entered = true;
    }
    expect(entered).toBe(true);
  });

  it('チャージ済みの星は爆発に巻き込まれて連鎖する', () => {
    const stage: StageDef = {
      id: 't', name: 't', hint: '',
      stars: [{ x: 4, y: 8, charge: 2 }, { x: 5.8, y: 8, charge: 1 }, { x: 7.6, y: 8, charge: 1 }, { x: 11, y: 4 }],
      links: [[0, 1], [1, 2]],
    };
    const sim = new NovaSim(stage, cfg());
    // 星0を直接チャージして爆発させる
    (sim as unknown as { addCharge(s: unknown, n: number): void }).addCharge(sim.stars[0], 1);
    let maxChain = 0;
    let links = 0;
    for (let i = 0; i < 240; i++) {
      sim.step(0);
      for (const e of sim.events) {
        if (e.t === 'explode') maxChain = Math.max(maxChain, e.chain);
        if (e.t === 'link') links++;
      }
    }
    expect(sim.stars.slice(0, 3).every((s) => !s.alive)).toBe(true);
    expect(sim.stars[3].alive).toBe(true);
    expect(maxChain).toBe(3);
    expect(links).toBe(2);
  });

  it('火は星座の線を伝って、離れた灯った星へ届く（灯っていない星には届かない）', () => {
    const stage: StageDef = {
      id: 't', name: 't', hint: '',
      // 0 と 1 は爆風が届かないほど離れているが、線でつながっている。2 は線の先だが灯っていない
      stars: [{ x: 2, y: 4, charge: 2 }, { x: 11, y: 12, charge: 1 }, { x: 3, y: 15 }],
      links: [[0, 1], [1, 2]],
    };
    const run = (fuseSpeed: number) => {
      const sim = new NovaSim(stage, { ...cfg(), fuseSpeed });
      (sim as unknown as { addCharge(s: unknown, n: number): void }).addCharge(sim.stars[0], 1);
      let fuses = 0;
      for (let i = 0; i < 360; i++) {
        sim.step(0);
        for (const e of sim.events) if (e.t === 'fuse') fuses++;
      }
      return { sim, fuses };
    };
    const on = run(9);
    expect(on.sim.stars[1].alive).toBe(false);
    expect(on.sim.stars[2].alive).toBe(true);
    expect(on.sim.litLinks.has(0)).toBe(true);
    expect(on.fuses).toBe(1);
    const off = run(0);
    expect(off.sim.stars[1].alive).toBe(true);
    expect(off.fuses).toBe(0);
  });

  it('ひねり3：爆発の引力がボールを星の方へ引き、時間で消える（なしでは引かない）', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 6.9, y: 6, charge: 2 }, { x: 2, y: 3 }], links: [] };
    const pull = (twist: number) => {
      const sim = new NovaSim(stage, { ...cfg(), twist, starPull: 0 });
      const b = sim.balls[0].body;
      b.setPosition({ x: 6.9, y: 11 });
      b.setLinearVelocity({ x: 0, y: 0 });
      (sim as unknown as { addCharge(s: unknown, n: number): void }).addCharge(sim.stars[0], 1);
      let minY = 99, wells = 0;
      for (let i = 0; i < 40; i++) {
        sim.step(0);
        wells = Math.max(wells, sim.wells.length);
      }
      minY = b.getPosition().y;
      for (let i = 0; i < 200; i++) sim.step(0);
      return { minY, wells, after: sim.wells.length };
    };
    const on = pull(3), off = pull(0);
    expect(on.wells).toBe(1);
    expect(on.after).toBe(0);
    expect(off.wells).toBe(0);
    expect(on.minY).toBeLessThan(off.minY - 0.3); // 上の星の方へ引かれて、落ちるのが遅れる
  });

  it('NP-14 星の引力：星はいつもボールを引く（灯った星ほど強い）。0 なら引かない', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 9, y: 10 }], links: [] };
    const drift = (starPull: number, charge = 0) => {
      const sim = new NovaSim(stage, { ...cfg(), twist: 0, starPull });
      sim.stars[0].charge = charge;
      const b = sim.balls[0].body;
      b.setPosition({ x: 6.5, y: 8 });
      b.setLinearVelocity({ x: 0, y: 0 });
      for (let i = 0; i < 30; i++) sim.step(0);
      return b.getPosition().x - 6.5;
    };
    expect(drift(0)).toBeCloseTo(0, 3);
    expect(drift(2.5)).toBeGreaterThan(0.05); // 右の星の方へ寄る
    expect(drift(2.5, 3)).toBeGreaterThan(drift(2.5, 0) * 1.3);
  });

  it('NP-11 アイテム：分裂でボールが2つ、ワームホールで出口へ、ブラックホールで井戸。使うとしばらく消える', () => {
    const mk = (items: StageDef['items']) => {
      const sim = new NovaSim({ id: 't', name: 't', hint: '', stars: [{ x: 2, y: 3 }], links: [], items }, { ...cfg(), twist: 0, starPull: 0 });
      const b = sim.balls[0].body;
      b.setPosition({ x: 6.9, y: 10 });
      b.setLinearVelocity({ x: 0, y: 1 });
      sim.balls[0].launched = true;
      for (let i = 0; i < 3; i++) sim.step(0);
      return sim;
    };
    const a = mk([{ kind: 'split', x: 6.9, y: 10 }]);
    expect(a.balls.length).toBe(2);
    expect(a.items[0].readyAt).toBeGreaterThan(a.tick);
    const w = mk([{ kind: 'warp', x: 6.9, y: 10, to: { x: 3, y: 4 } }]);
    const p = w.balls[0].body.getPosition();
    expect(Math.hypot(p.x - 3, p.y - 4)).toBeLessThan(0.5);
    const h = mk([{ kind: 'hole', x: 6.9, y: 10 }]);
    expect(h.wells.length).toBe(1);
  });

  it('NP-18b 満月で月に当てると、一番近い灯っていない星に光が飛んでチャージ', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', slings: true, stars: [{ x: 3, y: 12 }, { x: 11, y: 4 }], links: [] };
    const run = (moonCharge: number) => {
      const sim = new NovaSim(stage, { ...cfg(), twist: 0, starPull: 0, moonCharge, slingMode: 1 });
      // 左の月が満月になる時刻まで進める（左は周期の半分で満月）
      while (sim.moonPhase('L') < 0.995) sim.step(0);
      const b = sim.balls[0];
      b.launched = true;
      b.body.setPosition({ x: MOON_L.x, y: MOON_L.y - 1.2 });
      b.body.setLinearVelocity({ x: 0, y: 6 });
      let light = false;
      for (let i = 0; i < 40; i++) { sim.step(0); for (const e of sim.events) if (e.t === 'moonlight') light = true; }
      return { light, charge: sim.stars[0].charge };
    };
    expect(run(1)).toEqual({ light: true, charge: 1 });
    expect(run(0).light).toBe(false);
  });

  it('NP-11b 彗星は星をすり抜けて触れた星を灯し、磁石は灯った星へボールを引く', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 6.9, y: 7 }, { x: 6.9, y: 5 }], links: [], items: [{ kind: 'comet', x: 6.9, y: 10 }] };
    const sim = new NovaSim(stage, { ...cfg(), twist: 0, starPull: 0 });
    const b = sim.balls[0];
    b.body.setPosition({ x: 6.9, y: 10 });
    b.body.setLinearVelocity({ x: 0, y: -14 });
    b.launched = true;
    for (let i = 0; i < 70; i++) sim.step(0);
    // 2つの星を貫いて上へ抜けた（跳ね返らない）、どちらにもチャージ
    expect(b.body.getPosition().y).toBeLessThan(5);
    expect(sim.stars.every((s) => !s.alive || s.charge >= 1)).toBe(true);

    const ms: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 3, y: 6, charge: 1 }], links: [], items: [{ kind: 'magnet', x: 10, y: 12 }] };
    const pull = (on: boolean) => {
      const m = new NovaSim({ ...ms, items: on ? ms.items : [] }, { ...cfg(), twist: 0, starPull: 0 });
      const mb = m.balls[0];
      mb.body.setPosition({ x: 10, y: 12 });
      mb.body.setLinearVelocity({ x: 0, y: 0 });
      mb.launched = true;
      for (let i = 0; i < 90; i++) m.step(0);
      const p = mb.body.getPosition();
      return Math.hypot(p.x - 3, p.y - 6);
    };
    expect(pull(true)).toBeLessThan(pull(false) - 2);
  });

  it('チャージは時間で減る', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 6, y: 8, charge: 2 }], links: [] };
    const c = cfg();
    c.decayTime = 1;
    const sim = new NovaSim(stage, c);
    for (let i = 0; i < 125; i++) sim.step(0);
    expect(sim.stars[0].charge).toBe(1);
  });

  it('灯り（decayFloor）までのチャージは時間で減らない', () => {
    const stage: StageDef = { id: 't', name: 't', hint: '', stars: [{ x: 6, y: 8, charge: 2 }], links: [] };
    const c = cfg();
    c.decayTime = 1;
    c.decayFloor = 1;
    const sim = new NovaSim(stage, c);
    for (let i = 0; i < 600; i++) sim.step(0);
    expect(sim.stars[0].charge).toBe(1);
    c.decayFloor = 0;
    for (let i = 0; i < 130; i++) sim.step(0);
    expect(sim.stars[0].charge).toBe(0);
  });

  it('ボットは先読みで星を狙って弾く', () => {
    const sim = new NovaSim(stages[0], cfg());
    const bot = new NovaBot(5, 1);
    for (let i = 0; i < 120 * 40 && sim.phase === 'play'; i++) sim.step(bot.input(sim));
    expect(bot.stats.predictions).toBeGreaterThan(0);
    expect(bot.stats.aimed).toBeGreaterThan(0);
  });

  describe('盤面ギミック', () => {
    const gStage: StageDef = { id: 'g', name: 'g', hint: '', stars: [{ x: 7, y: 10 }], links: [], outlanes: true, slings: true, rollovers: true };
    const drop = (x: number, y: number, vy: number, c = cfg()) => {
      const sim = new NovaSim(gStage, c);
      const b = sim.balls[0].body;
      b.setPosition({ x, y });
      b.setLinearVelocity({ x: 0, y: vy });
      const ev: string[] = [];
      for (let i = 0; i < 360; i++) {
        sim.step(0);
        for (const e of sim.events) ev.push(e.t);
      }
      return { sim, ev };
    };
    it('アウトレーンに落ちるとキックバックで打ち返す（1回だけ）', () => {
      const { sim, ev } = drop(1.0, 15, 0);
      expect(ev).toContain('kickback');
      expect(ev).not.toContain('drain');
      expect(sim.kickback.L).toBe(false);
    });
    it('キックバックが消えていればアウトレーンはドレイン', () => {
      const c = cfg();
      c.kickbackStart = 0;
      const { ev } = drop(12.7, 15, 0, c);
      expect(ev).toContain('drain');
    });
    it('スリングショットが弾く（slingMode 0）', () => {
      expect(drop(3.0, 14, 3, { ...cfg(), slingMode: 0 }).ev).toContain('sling');
    });
    it('NP-18 月のバンパーは上へ弾く（穴の方へは弾かない）。満月ほど強い', () => {
      const hit = (tick: number) => {
        const sim = new NovaSim(gStage, cfg());
        sim.tick = tick;
        const b = sim.balls[0].body;
        b.setPosition({ x: 2.85, y: 16.3 });
        b.setLinearVelocity({ x: 0.5, y: 6 });
        for (let i = 0; i < 40; i++) {
          sim.step(0);
          if (sim.events.some((e) => e.t === 'sling')) return b.getLinearVelocity();
        }
        return null;
      };
      const P = cfg().moonPeriod * 120;
      const full = hit(Math.round(P / 2)), newMoon = hit(0);
      expect(full).not.toBeNull();
      expect(full!.y).toBeLessThan(0);
      expect(newMoon!.y).toBeLessThan(0);
      expect(Math.hypot(full!.x, full!.y)).toBeGreaterThan(Math.hypot(newMoon!.x, newMoon!.y) * 1.5);
    });
    it('ロールオーバーを3つ灯すとボールセーブが点く', () => {
      const sim = new NovaSim(gStage, cfg());
      sim.rollLit = [true, false, true];
      const b = sim.balls[0].body;
      b.setPosition({ x: 6.9, y: 3 });
      b.setLinearVelocity({ x: 0, y: -8 });
      let all = false;
      for (let i = 0; i < 120; i++) {
        sim.step(0);
        for (const e of sim.events) if (e.t === 'roll' && e.all) all = true;
      }
      expect(all).toBe(true);
      expect(sim.saveActive()).toBe(true);
    });
  });

  it('全ステージがボットで壊せる星を持つ（配置が壊れていない）', () => {
    for (const st of stages) {
      const sim = runBot(st, 90, 3);
      const destroyed = sim.stars.filter((s) => !s.alive).length;
      expect(destroyed, st.id).toBeGreaterThan(0);
    }
  });
});

describe('リプレイ', () => {
  it('記録した入力と設定で同じ結果が再現される（途中から早送りしても同じ）', async () => {
    const { ReplayRecorder, ReplayPlayer } = await import('./replay');
    const st = stages[1];
    const sim = new NovaSim(st, cfg());
    const bot = new NovaBot(9, 0.85);
    const rr = new ReplayRecorder(sim.cfg);
    for (let i = 0; i < 120 * 40 && sim.phase === 'play'; i++) {
      const m = bot.input(sim);
      rr.record(m);
      sim.step(m);
      rr.observe(sim);
    }
    const data = JSON.parse(JSON.stringify(rr.toData(sim)));
    for (const from of [0, Math.max(0, data.highlight - 360)]) {
      const p = new ReplayPlayer(data, st, from);
      while (!p.done) p.sim.step(p.next());
      expect(hashNumbers(p.sim.digest())).toBe(hashNumbers(sim.digest()));
      expect(p.sim.bestChain).toBe(sim.bestChain);
    }
  });
});

describe('NP-16 発射', () => {
  it('レーンで跳ねている・落ちてくる途中でも、放せば発射できる', () => {
    for (const vy of [3, -1.5, 6]) {
      const sim = new NovaSim(stages[0], cfg());
      const b = sim.balls[0];
      for (let i = 0; i < 30; i++) sim.step(IN_LAUNCH);
      b.body.setTransform({ x: b.body.getPosition().x, y: 19 }, 0);
      b.body.setLinearVelocity({ x: 0, y: vy });
      sim.step(0);
      expect(b.body.getLinearVelocity().y).toBeLessThan(-10);
      expect(b.launched).toBe(true);
    }
  });
  it('発射した直後（勢いよく上がっている間）はもう一度発射しない', () => {
    const sim = new NovaSim(stages[0], cfg());
    const b = sim.balls[0];
    for (let i = 0; i < 30; i++) sim.step(IN_LAUNCH);
    sim.step(0);
    const v1 = b.body.getLinearVelocity().y;
    sim.step(IN_LAUNCH);
    sim.step(0);
    expect(b.body.getLinearVelocity().y).toBeGreaterThan(v1 - 0.5);
  });

  it('エンドレスでは3波目から波ごとにアイテムが1つ置かれ、星と重ならない（NP-11c）', () => {
    const endless = stages.find((s) => s.endless)!;
    const sim = new NovaSim(endless, cfg());
    expect(sim.items.length).toBe(0);
    const kinds: string[] = [];
    for (let w = 2; w <= 8; w++) {
      if (w === 2) { const p = sim as unknown as { wave: number; spawnWave(): void }; for (const s of sim.stars) s.alive = false; p.wave = 2; p.spawnWave(); expect(sim.items.length).toBe(0); continue; }
      const priv = sim as unknown as { wave: number; spawnWave(): void };
      for (const s of sim.stars) s.alive = false;
      priv.wave = w;
      priv.spawnWave();
      expect(sim.items.length).toBe(1);
      const it = sim.items[0];
      kinds.push(it.kind);
      for (const s of sim.stars) {
        if (!s.alive) continue;
        const q = s.body.getPosition();
        expect(Math.hypot(q.x - it.x, q.y - it.y)).toBeGreaterThan(1.3);
      }
      if (it.kind === 'warp') expect(it.to).toBeDefined();
    }
    expect(kinds.slice(0, 5)).toEqual(['hole', 'comet', 'split', 'magnet', 'warp']);
    const off = new NovaSim(endless, { ...cfg(), endlessItems: 0 });
    const p2 = off as unknown as { wave: number; spawnWave(): void };
    p2.wave = 3; p2.spawnWave();
    expect(off.items.length).toBe(0);
  });

  it('回る星は中心の周りを決まった周期で回り、半径が変わらない（NP-13b）', () => {
    const st = stages.find((s) => s.id === 'orbit')!;
    const sim = new NovaSim(st, cfg());
    const s0 = sim.stars[0];
    const o = s0.orbit!;
    const start = s0.body.getPosition().clone();
    for (let i = 0; i < 120 * 4.5; i++) sim.step(0);
    const p = s0.body.getPosition();
    expect(Math.hypot(p.x - o.cx, p.y - o.cy)).toBeCloseTo(o.rad, 1);
    // 9 秒で1周 → 4.5 秒で反対側
    expect(Math.hypot(p.x - (2 * o.cx - start.x), p.y - (2 * o.cy - start.y))).toBeLessThan(0.1);
  });
});
