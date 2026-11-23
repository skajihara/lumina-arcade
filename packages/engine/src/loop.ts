/**
 * 固定タイムステップのゲームループ。
 * - シミュレーションは常に同じ dt（既定 1/120 秒）で進むので、同じ入力なら同じ結果になる
 * - timeScale でスロー／早送り、hitstop で一瞬の停止（演出用）
 * - 描画は requestAnimationFrame ごとに1回
 */
export interface LoopHandlers {
  /** 固定 dt で1ティック進める */
  update(dt: number, tick: number): void;
  /** 描画。alpha は次ティックまでの補間係数、realDt は実時間の経過 */
  render(alpha: number, realDt: number): void;
}

export class FixedLoop {
  readonly dt: number;
  tick = 0;
  /** 1.0 = 等速。0.3 ならスロー */
  timeScale = 1;
  /** 残りのヒットストップ（実時間秒） */
  hitstop = 0;
  paused = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(private handlers: LoopHandlers, hz = 120, private maxStepsPerFrame = 12) {
    this.dt = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const realDt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.advance(realDt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 実時間 realDt 分だけ進める（テストからも呼べる） */
  advance(realDt: number): void {
    if (!this.paused) {
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - realDt);
      } else {
        this.acc += realDt * this.timeScale;
        let steps = 0;
        while (this.acc >= this.dt && steps < this.maxStepsPerFrame) {
          this.handlers.update(this.dt, this.tick);
          this.tick++;
          this.acc -= this.dt;
          steps++;
        }
        if (steps >= this.maxStepsPerFrame) this.acc = 0;
      }
    }
    this.handlers.render(this.acc / this.dt, realDt);
  }
}
