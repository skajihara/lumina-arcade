/**
 * Echo Loop のシミュレーション（描画なし）。
 * 盤面と星は Nova Pinball の NovaSim をそのまま使い、その外側で「10秒ループ」を回す。
 *
 * - 1ループ = loopSec 秒。ループが終わると時間が巻き戻り、星はすべて復活する
 * - 過去のループの入力はそのまま再生される。過去の自分のボール（残響）も同じ時刻に同じ強さで発射される
 * - 各ループの自分は自分専用のフリッパーを持つ（他のボールはすり抜ける）
 * - 今のボールが残響にぶつかったり、残響より先に星を壊したりすると、過去が書き換わる
 * - 同じ1ループの中で全部の星を爆発させたらクリア。maxLoops を使い切ったら失敗
 */
import { NovaSim, HZ, type Ball, type SimEvent } from '../../nova-pinball/src/sim';
import type { StageDef } from '../../nova-pinball/src/stages';

/** Echo Loop のステージ：Nova の盤面に「このステージだけ増やすループ数」を足したもの */
export interface EchoStage extends StageDef {
  extraLoops?: number;
}
import type { EchoConfig } from './config';

export type EchoPhase = 'play' | 'clear' | 'fail';

export type EchoEvent =
  | SimEvent
  | { t: 'loopStart'; loop: number }
  | { t: 'loopEnd'; loop: number; destroyed: number }
  | { t: 'echoClear'; loop: number }
  | { t: 'echoFail' };

export class EchoSim {
  /** 今のループ番号（0 始まり）。今のボールの owner と同じ */
  loop = 0;
  phase: EchoPhase = 'play';
  sim!: NovaSim;
  /** 過去の各ループの入力（ティックごと） */
  history: number[][] = [];
  private current: number[] = [];
  events: EchoEvent[] = [];
  /** 各ループで壊せた星の数（今のループ含む） */
  destroyedPerLoop: number[] = [];
  /** 各ループで壊れた星の番号 */
  destroyedIds: Set<number>[] = [];
  /** 今までで一番多く壊せた数 */
  best = 0;
  totalTicks = 0;

  constructor(public stage: EchoStage, public cfg: EchoConfig) {
    this.startLoop();
  }

  /** このステージの最大ループ数（難易度の値＋ステージごとの追加） */
  get maxLoops(): number {
    return Math.round(this.cfg.maxLoops) + (this.stage.extraLoops ?? 0);
  }

  get loopTicks(): number {
    return Math.round(this.cfg.loopSec * HZ);
  }

  /** ループ内の経過秒 */
  get loopTime(): number {
    return this.sim.tick / HZ;
  }

  private startLoop(): void {
    const sim = new NovaSim(this.stage, this.cfg);
    sim.respawn = false;
    // 最初の1個は持ち主 0。残りのループの分を足す（全員レーンから、自分の入力で発射）
    // 各ループの自分は自分専用のフリッパーを持つ（他人のボールはすり抜ける）。だから邪魔しなければ過去はそのまま再生される
    for (let k = 1; k <= this.loop; k++) {
      sim.spawnBall(undefined, k);
      sim.addFlippers(k);
    }
    sim.flipperOwnerOnly = true;
    const now = this.loop;
    sim.ballCollide = (a: Ball, b: Ball) => {
      // レーンの中ではぶつけない（同じ場所に重なって待っているので）
      if (sim.inLane(a) || sim.inLane(b) || !a.launched || !b.launched) return false;
      if (a.owner === now || b.owner === now) return true;
      return this.cfg.echoCollide > 0;
    };
    this.sim = sim;
    this.current = [];
    this.destroyedPerLoop[this.loop] = 0;
    this.destroyedIds[this.loop] = new Set();
    this.events.push({ t: 'loopStart', loop: this.loop });
  }

  /** 持ち主 k の、このティックの入力 */
  inputOf(owner: number, tick = this.sim.tick): number {
    if (owner === this.loop) return this.current[tick] ?? 0;
    return this.history[owner]?.[tick] ?? 0;
  }

  step(input: number): void {
    this.events = [];
    if (this.phase !== 'play') {
      this.sim.step(0);
      this.events.push(...this.sim.events);
      return;
    }
    const t = this.sim.tick;
    this.current[t] = input;
    const masks: number[] = [];
    for (let k = 0; k <= this.loop; k++) masks.push(k === this.loop ? input : this.history[k]?.[t] ?? 0);
    this.sim.ownerInputs = masks;
    this.sim.step(input);
    this.totalTicks++;
    for (const e of this.sim.events) {
      if (e.t === 'explode') {
        this.destroyedPerLoop[this.loop]++;
        this.destroyedIds[this.loop].add(e.star);
      }
      this.events.push(e);
    }
    this.best = Math.max(this.best, this.destroyedPerLoop[this.loop]);
    if (this.sim.phase === 'clear') {
      this.phase = 'clear';
      this.events.push({ t: 'echoClear', loop: this.loop });
      return;
    }
    if (this.sim.tick >= this.loopTicks) {
      this.events.push({ t: 'loopEnd', loop: this.loop, destroyed: this.destroyedPerLoop[this.loop] });
      this.history[this.loop] = this.current.slice();
      if (this.loop + 1 >= this.maxLoops) {
        this.phase = 'fail';
        this.events.push({ t: 'echoFail' });
        return;
      }
      this.loop++;
      this.startLoop();
    }
  }

  /** 決定性テスト用 */
  digest(): number[] {
    return [this.loop, this.totalTicks, ...this.destroyedPerLoop, ...this.sim.digest()];
  }
}

/** ボット用：前のループで壊れた星（＝残響が壊してくれそうな星）は後回しにする */
export function echoBias(es: EchoSim): (id: number) => number {
  return (id) => (es.loop > 0 && es.destroyedIds[es.loop - 1]?.has(id) ? -1.6 : 0);
}
