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

/** 保存データのキーはすべて `lumina:` で始まる（進行・リプレイ・調整パネル） */
export const STORE_PREFIX = 'lumina:';

/** 保存データのキーの一覧（gameId を渡すとその作品の分だけ：`lumina:<id>`・`lumina:<id>:…`・`lumina:<id>-…`） */
export function storedKeys(gameId?: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORE_PREFIX)) continue;
      if (gameId) {
        const base = STORE_PREFIX + gameId;
        if (k !== base && !k.startsWith(base + ':') && !k.startsWith(base + '-')) continue;
      }
      out.push(k);
    }
  } catch {
    /* 読めない環境 */
  }
  return out;
}

/** 保存データを消す（gameId なしで全部）。消した数を返す */
export function clearStored(gameId?: string): number {
  const keys = storedKeys(gameId);
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* 無視 */
    }
  }
  return keys.length;
}
