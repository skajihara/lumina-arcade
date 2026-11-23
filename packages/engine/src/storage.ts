/** 進行データの保存（localStorage）。壊れていても落ちないようにする */
export class Save<T extends object> {
  data: T;
  constructor(private key: string, defaults: T) {
    let loaded: Partial<T> = {};
    try {
      loaded = JSON.parse(localStorage.getItem(`lumina:${key}`) ?? '{}') as Partial<T>;
    } catch {
      loaded = {};
    }
    this.data = { ...defaults, ...loaded };
  }
  write(): void {
    try {
      localStorage.setItem(`lumina:${this.key}`, JSON.stringify(this.data));
    } catch {
      /* 保存できない環境では無視 */
    }
  }
}
