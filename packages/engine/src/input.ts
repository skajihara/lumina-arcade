/**
 * 入力。ゲームごとに「アクション名 → キー」を登録し、ティックごとにビットマスクで読む。
 * ビットマスクにしておくと、そのまま記録・再生（リプレイ／Echo Loop）に使える。
 */
export interface ActionDef {
  keys: string[];
  /** タッチ領域（0..1 の画面比率）。触れている間 ON */
  touch?: { x0: number; y0: number; x1: number; y1: number };
}

export class Input<A extends string> {
  private down = new Set<string>();
  private touches = new Map<number, { x: number; y: number }>();
  private bits = new Map<A, number>();
  private prev = 0;
  current = 0;
  /** 外部から強制的に ON にするビット（ボットや自動テスト用） */
  injected = 0;

  constructor(private defs: Record<A, ActionDef>, target: HTMLElement | Window = window) {
    let i = 0;
    for (const name of Object.keys(defs) as A[]) this.bits.set(name, 1 << i++);
    const kd = (e: KeyboardEvent) => {
      if (this.isBound(e.code)) e.preventDefault();
      this.down.add(e.code);
    };
    const ku = (e: KeyboardEvent) => this.down.delete(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => this.down.clear());
    const el = target as HTMLElement;
    const upd = (e: TouchEvent) => {
      this.touches.clear();
      for (const t of Array.from(e.touches)) {
        this.touches.set(t.identifier, { x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight });
      }
    };
    el.addEventListener('touchstart', (e) => { upd(e as TouchEvent); }, { passive: true });
    el.addEventListener('touchmove', (e) => { upd(e as TouchEvent); }, { passive: true });
    el.addEventListener('touchend', (e) => { upd(e as TouchEvent); }, { passive: true });
    el.addEventListener('touchcancel', (e) => { upd(e as TouchEvent); }, { passive: true });
  }

  private isBound(code: string): boolean {
    for (const d of Object.values(this.defs) as ActionDef[]) if (d.keys.includes(code)) return true;
    return false;
  }

  bit(name: A): number {
    return this.bits.get(name) ?? 0;
  }

  /** ティックの頭で1回呼ぶ。現在の入力をビットマスクで返す */
  sample(): number {
    let m = 0;
    for (const [name, def] of Object.entries(this.defs) as [A, ActionDef][]) {
      let on = def.keys.some((k) => this.down.has(k));
      if (!on && def.touch) {
        for (const t of this.touches.values()) {
          if (t.x >= def.touch.x0 && t.x <= def.touch.x1 && t.y >= def.touch.y0 && t.y <= def.touch.y1) on = true;
        }
      }
      if (on) m |= this.bits.get(name)!;
    }
    m |= this.injected;
    this.prev = this.current;
    this.current = m;
    return m;
  }

  isDown(name: A): boolean {
    return (this.current & this.bit(name)) !== 0;
  }
  pressed(name: A): boolean {
    const b = this.bit(name);
    return (this.current & b) !== 0 && (this.prev & b) === 0;
  }
  released(name: A): boolean {
    const b = this.bit(name);
    return (this.current & b) === 0 && (this.prev & b) !== 0;
  }
}

/** ティックごとの入力ビットを記録・再生する */
export class InputRecorder {
  frames: number[] = [];
  record(mask: number): void {
    this.frames.push(mask);
  }
  at(tick: number): number {
    return this.frames[tick] ?? 0;
  }
  clear(): void {
    this.frames = [];
  }
  /** ランレングス圧縮した文字列（保存用） */
  serialize(): string {
    const out: string[] = [];
    let i = 0;
    while (i < this.frames.length) {
      const v = this.frames[i];
      let n = 1;
      while (i + n < this.frames.length && this.frames[i + n] === v) n++;
      out.push(`${v.toString(36)}*${n.toString(36)}`);
      i += n;
    }
    return out.join(',');
  }
  static deserialize(s: string): InputRecorder {
    const r = new InputRecorder();
    if (!s) return r;
    for (const part of s.split(',')) {
      const [v, n] = part.split('*');
      const val = parseInt(v, 36);
      const cnt = parseInt(n, 36);
      for (let k = 0; k < cnt; k++) r.frames.push(val);
    }
    return r;
  }
}
