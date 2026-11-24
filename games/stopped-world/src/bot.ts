/**
 * Stopped World のボット（ランダム探索）。
 * 「止める→いくつか叩く→戻す」を何回か行う計画をランダムに作って最後まで試し、クリアできた計画を探す。
 * ステージが解けることの確認（難易度測定）と、自動プレイに使う。
 */
import { Rng } from '@engine/rng';
import { StopSim, HZ, slingPower, type Action, type StageDef } from './sim';
import type { StopConfig } from './config';

export interface Plan {
  /** ティック → そのティックの操作 */
  steps: Record<number, Action[]>;
}

/**
 * ランダムな計画を1つ作る。
 * human：人に近い速さで止める（止めている時間＝考えて矢印を置く時間：1秒＋1本0.6秒）。ゲージの減り方を測る時に使う
 */
export function randomPlan(stage: StageDef, cfg: StopConfig, rng: Rng, human = false): Plan {
  const steps: Record<number, Action[]> = {};
  const movable = stage.objects.map((o, i) => ({ o, i })).filter(({ o }) => !o.fixed);
  const stops = Math.min(rng.int(1, human ? 4 : 3), stage.stops ?? 99);
  let tick = 30;
  for (let k = 0; k < stops; k++) {
    const acts: Action[] = [{ t: 'stop' }];
    const n = rng.int(1, Math.min(Math.round(cfg.maxForces), stage.forces ?? 99));
    for (let j = 0; j < n; j++) {
      const { i } = rng.pick(movable);
      const a = rng.range(-Math.PI, 0.3); // ほとんど上向き〜横
      // 人と同じパチンコ式：引く長さをランダムに（力は slingPower の曲線で決まる）
      const power = slingPower(rng.range(0.05, 1) * cfg.slingPull, cfg);
      acts.push({ t: 'hit', id: i, dx: Math.cos(a), dy: Math.sin(a), power });
    }
    steps[tick] = acts;
    const hold = human ? Math.round(HZ * (1 + 0.6 * n)) : 1;
    steps[tick + hold] = [{ t: 'resume' }];
    tick += (human ? hold : 0) + rng.int(Math.round(HZ * 0.4), Math.round(HZ * 2.5));
  }
  return { steps };
}

/** 計画を最後まで試す */
export function runPlan(stage: StageDef, cfg: StopConfig, plan: Plan, maxSec = 20): StopSim {
  const sim = new StopSim(stage, cfg);
  const end = Math.round(maxSec * HZ);
  while (sim.phase === 'play' && sim.tick < end) sim.step(plan.steps[sim.tick] ?? []);
  return sim;
}

/** クリアできる計画を探す。見つからなければ null */
export function search(stage: StageDef, cfg: StopConfig, tries = 300, seed = 1): { plan: Plan; tries: number } | null {
  const rng = new Rng(seed);
  for (let t = 1; t <= tries; t++) {
    const plan = randomPlan(stage, cfg, rng);
    if (runPlan(stage, cfg, plan).phase === 'clear') return { plan, tries: t };
  }
  return null;
}
