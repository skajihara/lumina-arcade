import { describe, expect, it } from 'vitest';
import { hashNumbers } from '@engine/rng';
import { presets, DEFAULT_PRESET } from './config';
import { stages, type StageDef } from './stages';
import { NovaSim, IN_LAUNCH } from './sim';
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

  it('全ステージがボットで壊せる星を持つ（配置が壊れていない）', () => {
    for (const st of stages) {
      const sim = runBot(st, 90, 3);
      const destroyed = sim.stars.filter((s) => !s.alive).length;
      expect(destroyed, st.id).toBeGreaterThan(0);
    }
  });
});
