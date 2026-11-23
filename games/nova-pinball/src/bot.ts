/**
 * 簡単な自動プレイヤー。難易度測定と自動テストに使う。
 * ボールがフリッパーに近づいたら弾き、レーンにボールがあればランダムな強さで発射する。
 */
import { Rng } from '@engine/rng';
import { IN_LAUNCH, IN_LEFT, IN_RIGHT, PIVOT_L, PIVOT_R, type NovaSim } from './sim';

export class NovaBot {
  private rng: Rng;
  private holdLaunch = 0;
  private flipHold = { L: 0, R: 0 };
  /** 0..1。低いほど反応が遅く下手になる */
  skill: number;

  constructor(seed = 1, skill = 0.8) {
    this.rng = new Rng(seed);
    this.skill = skill;
  }

  input(sim: NovaSim): number {
    let m = 0;
    for (const side of ['L', 'R'] as const) {
      if (this.flipHold[side] > 0) {
        this.flipHold[side]--;
        m |= side === 'L' ? IN_LEFT : IN_RIGHT;
      }
    }
    for (const b of sim.balls) {
      const p = b.body.getPosition();
      const v = b.body.getLinearVelocity();
      if (p.x > 13.2) continue;
      for (const [side, pv] of [['L', PIVOT_L], ['R', PIVOT_R]] as const) {
        const dx = p.x - pv.x;
        // 支点の上で止まっているボールは叩かない（転がり落ちるのを待つ）
        const near = side === 'L' ? dx > 0.7 && dx < 2.6 : dx < -0.7 && dx > -2.6;
        const moving = Math.hypot(v.x, v.y) > 0.6;
        if (near && moving && p.y > 20.6 && p.y < 23.2 && v.y > -2 && this.flipHold[side] === 0) {
          if (this.rng.next() < this.skill) this.flipHold[side] = 14 + this.rng.int(0, 10);
        }
      }
    }
    const lane = sim.balls.some((b) => sim.inLane(b));
    if (lane) {
      if (this.holdLaunch === 0) this.holdLaunch = 20 + this.rng.int(0, 90);
      this.holdLaunch--;
      if (this.holdLaunch > 0) m |= IN_LAUNCH;
    } else this.holdLaunch = 0;
    return m;
  }
}
