/** 演出キット：画面揺れ、フラッシュ、スロー。どれも描画側の値で、シミュレーション結果は変えない（スローは時間の進みだけ） */
import type { FixedLoop } from './loop';

export class Juice {
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  shakeRot = 0;
  flash = 0;
  flashColor = 0xffffff;
  shakeScale = 1;
  private slowT = 0;
  private slowDur = 0;
  private slowScale = 1;
  private t = 0;

  constructor(private loop?: FixedLoop) {}

  /** 後からループを結びつける（スロー・ヒットストップが効くようになる） */
  attach(loop: FixedLoop): void {
    this.loop = loop;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  doFlash(alpha: number, color = 0xffffff): void {
    if (alpha > this.flash) {
      this.flash = alpha;
      this.flashColor = color;
    }
  }
  hitstop(sec: number): void {
    if (this.loop) this.loop.hitstop = Math.max(this.loop.hitstop, sec);
  }
  /** scale 倍速で duration 秒（実時間）。終わりに向けて等速に戻る */
  slowmo(scale: number, duration: number): void {
    if (scale < this.slowScale || this.slowT <= 0) {
      this.slowScale = scale;
      this.slowDur = duration;
      this.slowT = duration;
    } else {
      this.slowT = Math.max(this.slowT, duration);
      this.slowDur = Math.max(this.slowDur, duration);
    }
  }

  update(realDt: number, baseTimeScale = 1): void {
    this.t += realDt;
    this.trauma = Math.max(0, this.trauma - realDt * 1.4);
    const s = this.trauma * this.trauma * this.shakeScale;
    this.shakeX = 18 * s * Math.sin(this.t * 61.3);
    this.shakeY = 18 * s * Math.sin(this.t * 47.9 + 1.3);
    this.shakeRot = 0.02 * s * Math.sin(this.t * 37.1 + 2.1);
    this.flash = Math.max(0, this.flash - realDt * 1.8);
    let ts = 1;
    if (this.slowT > 0) {
      this.slowT -= realDt;
      const k = Math.max(0, this.slowT / this.slowDur);
      // 終盤で滑らかに等速へ戻す
      const e = k > 0.35 ? 1 : k / 0.35;
      ts = this.slowScale + (1 - this.slowScale) * (1 - e);
      if (this.slowT <= 0) this.slowScale = 1;
    }
    if (this.loop) this.loop.timeScale = ts * baseTimeScale;
  }
}
