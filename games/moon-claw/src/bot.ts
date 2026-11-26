/**
 * Moon Claw のボット（自動プレイとステージの測定用）。決定的（乱数は Rng）。
 * 爪：一番高い所にある精霊の上へ動き、下ろして掴み、こぼさない速さで落とし口の上へ運んで放す。
 * フリッパー：下の段の精霊がフリッパーの上に来たら弾く。skill が低いほど弾く時が遅れ・早まり、運ぶのも雑になる。
 */
import { Rng } from '@engine/rng';
import { ClawSim, IN_DROP, IN_LEFT, IN_OPEN, IN_RIGHT, HOLE_X0, HOLE_X1, PIVOT_L, PIVOT_R, DT, SHELF_Y } from './sim';

export class ClawBot {
  private rng: Rng;
  private target: number | null = null;
  private hold = { L: 0, R: 0 };
  private wait = 0;
  constructor(public skill = 0.8, seed = 7) {
    this.rng = new Rng(seed);
  }

  /** このティックの入力ビットと、爪の目標の x */
  act(sim: ClawSim): { bits: number; x: number } {
    let bits = 0;
    const c = sim.claw;
    let x = c.x;
    // ---- 爪 ----
    const held = sim.spirits.filter((s) => s.state === 'held').length;
    const mid = (HOLE_X0 + HOLE_X1) / 2;
    if (this.wait > 0) this.wait--;
    else if (sim.clawMode === 'idle') {
      if (held) {
        // こぼさない速さ（握力の 6 割未満）で落とし口へ。下手なほど速く動かしてこぼす
        const vmax = sim.cfg.grip * (0.35 + (1 - this.skill) * 0.4);
        const dx = mid - c.x;
        // 止まってから開く（動きながら開くと、精霊が勢いのまま飛んで落とし口を外れる）。下手なほど止まり切らずに開く
        if (Math.abs(dx) < 0.08 && Math.abs(c.vx) < 0.3 + (1 - this.skill) * 3) { bits |= IN_OPEN; this.wait = 30; this.target = null; }
        else x = c.x + Math.sign(dx) * Math.min(Math.abs(dx), vmax * DT);
      } else {
        // 一番高い精霊（山の頂）。爆弾は山の真ん中なら最後に
        const pile = sim.spirits.filter((s) => s.state === 'pile' && s.body.getPosition().y < SHELF_Y && s.body.getPosition().y > SHELF_Y - 3);
        if (pile.length) {
          if (this.target === null) {
            pile.sort((a, b) => a.body.getPosition().y - b.body.getPosition().y);
            const k = Math.min(pile.length - 1, Math.floor(this.rng.next() * 3 * (1 - this.skill)));
            this.target = pile[k].body.getPosition().x + (this.rng.next() - 0.5) * 0.4 * (1 - this.skill);
          }
          x = this.target;
          if (Math.abs(c.x - this.target) < 0.05) bits |= IN_DROP;
        }
      }
    } else if (sim.clawMode === 'down') {
      bits |= IN_DROP;
    }
    // ---- フリッパー ----
    for (const side of ['L', 'R'] as const) {
      const pv = side === 'L' ? PIVOT_L : PIVOT_R;
      const L = sim.cfg.flipperLength;
      const x0 = side === 'L' ? pv.x - 0.3 : pv.x - L - 0.2;
      const x1 = side === 'L' ? pv.x + L + 0.2 : pv.x + 0.3;
      // 下手なほど弾く高さがずれる
      const off = (1 - this.skill) * (this.rng.next() - 0.5) * 1.2;
      const ball = sim.spirits.some((s) => {
        if (s.state !== 'ball') return false;
        const p = s.body.getPosition();
        const v = s.body.getLinearVelocity();
        return p.x > x0 && p.x < x1 && p.y > pv.y - 1.4 + off && p.y < pv.y + 0.4 && v.y > -2;
      });
      if (ball && this.hold[side] <= 0) this.hold[side] = 18;
      if (this.hold[side] > 0) {
        this.hold[side]--;
        if (this.hold[side] > 4) bits |= side === 'L' ? IN_LEFT : IN_RIGHT;
      }
    }
    return { bits, x };
  }
}
