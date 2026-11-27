/**
 * Echo Loop の自動プレイのボット（EL-20b：素朴）。
 * 球がフリッパーの上へ落ちてきたら、その側のフリッパーを短く打つ。発射レーンで止まったら、ばらつく強さで発射する。
 * skill が低いほど打つ瞬間が遅れたり、打ち損じたりする。
 */
import { Rng } from '@engine/rng';
import { PIVOT_L, PIVOT_R } from '../../nova-pinball/src/sim';
import { IN_LAUNCH, IN_LEFT, IN_RIGHT, type EchoSim } from './sim';

export class EchoBot {
  private rng: Rng;
  private hold = { L: 0, R: 0, launch: 0 };
  private rest = { L: 0, R: 0 };
  /** 発射の溜め（ティック） */
  private charge = 0;
  constructor(seed = 1, public skill = 0.85) {
    this.rng = new Rng(seed);
  }

  input(sim: EchoSim): number {
    if (sim.phase !== 'play') return 0;
    let m = 0;
    const p = sim.ball.getPosition(), v = sim.ball.getLinearVelocity();
    // 発射：レーンで止まったら、0.3〜0.9 秒溜めて放す
    if (sim.canLaunch() && (this.charge > 0 || Math.abs(v.y) < 0.5)) {
      if (this.charge === 0) this.charge = Math.round(36 + this.rng.next() * 72);
      this.hold.launch++;
      if (this.hold.launch < this.charge) m |= IN_LAUNCH;
      else { this.hold.launch = 0; this.charge = 0; }
      return m;
    }
    this.hold.launch = 0;
    this.charge = 0;
    for (const side of ['L', 'R'] as const) {
      const pv = side === 'L' ? PIVOT_L : PIVOT_R;
      const dx = (p.x - pv.x) * (side === 'L' ? 1 : -1);
      if (this.hold[side] > 0) {
        this.hold[side]--;
        m |= side === 'L' ? IN_LEFT : IN_RIGHT;
        if (this.hold[side] === 0) this.rest[side] = 14;
        continue;
      }
      if (this.rest[side] > 0) { this.rest[side]--; continue; }
      // フリッパーの上の、先の方（打つと上へ飛ぶ所）に来たら打つ。下手なほど早すぎ・遅すぎ・打ち損じ
      const near = dx > -0.2 && dx < 2.4 && p.y > pv.y - 1.6 - this.skill * 0.4 && p.y < pv.y + 0.6 && v.y > -2;
      if (near && this.rng.next() < 0.25 + this.skill * 0.6) {
        this.hold[side] = 14 + Math.round(this.rng.next() * 6);
        m |= side === 'L' ? IN_LEFT : IN_RIGHT;
      }
    }
    return m;
  }
}
