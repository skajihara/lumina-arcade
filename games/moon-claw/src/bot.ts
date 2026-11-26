/**
 * Moon Claw のボット（自動プレイとステージの測定用）。MC-10 で物理の爪に合わせて作り直した。決定的（乱数は Rng）。
 * 一番点の高い宝石（同じなら近い方）の真上へ開いて動き、下ろして閉じ、持ち上げて、一番倍率の高い宝石箱の上で開く。
 * skill が低いほど狙いがずれ、運ぶのが速く（振れて落としやすく）なる。
 */
import { Rng } from '@engine/rng';
import { ClawSim, IN_CLOSE, IN_OPEN, FINGER_L, GEMS, type Gem } from './sim';

type Phase = 'aim' | 'down' | 'close' | 'lift' | 'carry' | 'release';

export class ClawBot {
  private rng: Rng;
  private phase: Phase = 'aim';
  private gem: Gem | null = null;
  private off = 0;
  private timer = 0;
  private skipped = new Map<number, number>();
  constructor(public skill = 0.8, seed = 7) {
    this.rng = new Rng(seed);
  }

  private pickGem(sim: ClawSim): Gem | null {
    const free = sim.gems.filter((g) => g.state === 'free' && !sim.stage.boxes.some((b) => {
      const q = g.body.getPosition();
      return q.x > b.x && q.x < b.x + b.w && q.y > b.y - 0.3 && q.y < b.y + b.h + 0.2;
    }));
    if (!free.length) return null;
    const hp = sim.head.getPosition();
    // 点が高く、近く、何度も失敗していない宝石。山の上の方（y が小さい）を先に
    free.sort((a, b) => this.score(b, hp, sim) - this.score(a, hp, sim));
    return free[0];
  }

  private score(g: Gem, hp: { x: number; y: number }, sim: ClawSim): number {
    const q = g.body.getPosition();
    // コンボを狙う：前に納めたのと同じ種類を先に
    const combo = sim.cfg.comboMax > 1 && g.kind === sim.lastKind ? 3 * this.skill : 0;
    return combo + GEMS[g.kind].value * 2 - Math.abs(q.x - hp.x) * 0.15 - q.y * 0.3 - (this.skipped.get(g.id) ?? 0) * 2.5;
  }

  /** このティックの入力ビットと、爪の頭の目標の位置 */
  act(sim: ClawSim): { bits: number; target: { x: number; y: number } } {
    const hp = sim.head.getPosition();
    this.timer++;
    const next = (p: Phase) => { this.phase = p; this.timer = 0; };
    if (this.phase === 'aim' || !this.gem || this.gem.state !== 'free') {
      if (this.phase !== 'aim' && this.phase !== 'release') next('aim');
      if (this.phase === 'aim' && (!this.gem || this.gem.state !== 'free' || this.timer === 1)) {
        this.gem = this.pickGem(sim);
        this.off = (this.rng.next() - 0.5) * 0.5 * (1 - this.skill);
      }
    }
    const g = this.gem;
    if (!g) return { bits: 0, target: { x: hp.x, y: 2.5 } };
    const q = g.body.getPosition();
    const box = [...sim.stage.boxes].sort((a, b) => b.mult - a.mult)[0];
    // 開きすぎると隣の宝石に指が当たって閉じられない。宝石の幅に合わせた開き具合にする
    const want = Math.min(1, 0.42 + GEMS[g.kind].w * 0.45);
    const openBits = sim.openness < want ? IN_OPEN : sim.openness > want + 0.08 ? IN_CLOSE : 0;
    switch (this.phase) {
      case 'aim': {
        const tx = q.x + this.off, ty = Math.min(hp.y, q.y - FINGER_L - 1.2);
        if (Math.abs(hp.x - tx) < 0.06 && Math.abs(sim.openness - want) < 0.1 && Math.abs(sim.vel.x) < 0.3) next('down');
        return { bits: openBits, target: { x: tx, y: Math.max(1.6, ty) } };
      }
      case 'down': {
        // 鉤が宝石の中心より少し下に来る高さ
        const ty = q.y - 1.2;
        if ((Math.abs(hp.y - ty) < 0.06 && Math.abs(sim.vel.y) < 0.2) || this.timer > 360 || Math.abs(sim.vel.y) < 0.05 && this.timer > 60) next('close');
        return { bits: openBits, target: { x: q.x + this.off, y: ty } };
      }
      case 'close': {
        if (this.timer > 60) next('lift');
        return { bits: IN_CLOSE, target: { x: hp.x, y: hp.y } };
      }
      case 'lift': {
        const top = Math.min(box.y - FINGER_L - 1.6, 2.4);
        if (!sim.heldGems().includes(g) && this.timer > 30) { this.skipped.set(g.id, (this.skipped.get(g.id) ?? 0) + 1); next('aim'); }
        else if (hp.y < top + 0.1) next('carry');
        return { bits: IN_CLOSE, target: { x: hp.x, y: top } };
      }
      case 'carry': {
        const tx = box.x + box.w / 2;
        const top = Math.min(box.y - FINGER_L - 1.6, 2.4);
        if (!sim.heldGems().includes(g)) { this.skipped.set(g.id, (this.skipped.get(g.id) ?? 0) + 1); next('aim'); }
        // 上手いほどゆっくり近づいて止まる
        const slow = 0.5 + this.skill * 0.5;
        const d = tx - hp.x;
        const x = hp.x + Math.sign(d) * Math.min(Math.abs(d), (2.5 - slow * 1.2) * Math.min(1, Math.abs(d)) + 0.02);
        if (Math.abs(d) < 0.08 && Math.abs(sim.vel.x) < 0.25 + (1 - this.skill)) next('release');
        return { bits: IN_CLOSE, target: { x, y: top } };
      }
      case 'release': {
        if (this.timer > 70) { this.gem = null; next('aim'); }
        return { bits: IN_OPEN, target: { x: hp.x, y: hp.y } };
      }
    }
    return { bits: 0, target: { x: hp.x, y: hp.y } };
  }
}
