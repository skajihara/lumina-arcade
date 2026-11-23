/** シード固定の乱数（mulberry32）。リプレイを再現するため Math.random は使わない */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  /** 標準正規分布（Box-Muller） */
  gauss(): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  get state(): number {
    return this.s;
  }
  set state(v: number) {
    this.s = v >>> 0;
  }
}

/** 描画専用の乱数（シミュレーション結果に影響しない演出に使う） */
export const fxRandom = (min = 0, max = 1) => min + (max - min) * Math.random();

/** 数値配列の簡易ハッシュ（決定性テスト用） */
export function hashNumbers(values: number[]): string {
  let h = 2166136261 >>> 0;
  for (const v of values) {
    const s = v.toFixed(6);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h.toString(16);
}
