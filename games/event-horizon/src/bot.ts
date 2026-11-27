/**
 * Event Horizon（地平すれすれ）のボット（素朴）。
 * 噴射なしの先の軌道を読んで、一番近づく所（地平の何倍か）を見る。
 *   - 近すぎる（危ない）→ 加速して膨らむ
 *   - 外へ流されそう → 減速
 *   - 遠すぎる（倍率が低い）→ 短く減速して潜る
 * skill が高いほど攻める（目標がすれすれ）、読みが長い。
 */
import { Rng } from '@engine/rng';
import { SkimSim, HZ } from './sim';

export class SkimBot {
  private rng: Rng;
  private hold = 0;
  private last = 0;
  constructor(public skill = 0.8, seed = 3) {
    this.rng = new Rng(seed);
  }

  /** 1 加速・-1 減速・0 なし */
  input(sim: SkimSim): number {
    if (sim.phase !== 'play') return 0;
    if (this.hold > 0) { this.hold--; return this.last; }
    if (sim.tick % 6 !== 0) return 0;
    const la = sim.lookahead(Math.round(HZ * (1.6 + 1.6 * this.skill)));
    // 目標：地平の何倍の所をかすめるか（上手なほど近く）
    const target = 2.2 - 0.6 * this.skill + (this.rng.next() - 0.5) * 0.3;
    const danger = 1.35 + (1 - this.skill) * 0.3;
    let a = 0;
    if (la.minK < danger) a = 1;
    else if (la.out) a = -1;
    else if (la.minK > target && sim.fuel > sim.fuelMax * 0.3) a = -1;
    this.last = a;
    this.hold = a === 0 ? 0 : 5;
    return a;
  }
}
