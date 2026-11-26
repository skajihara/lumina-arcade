import { describe, expect, it, beforeEach } from 'vitest';
import { clearStored, storedKeys, Save } from './storage';

/** node には localStorage がないので、小さな代わりを置く */
class Mem {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('UX-02 データを消す', () => {
  beforeEach(() => {
    const mem = new Mem();
    (globalThis as unknown as { localStorage: Mem }).localStorage = mem;
    for (const k of ['lumina:nova-pinball', 'lumina:nova-pinball-replays', 'lumina:nova-pinball:tuning', 'lumina:echo-loop', 'lumina:echo-loop:tuning', 'other-app']) mem.setItem(k, '{}');
  });
  it('作品ごとに消せる（ほかの作品・ほかのアプリのデータは残る）', () => {
    expect(storedKeys('nova-pinball').sort()).toEqual(['lumina:nova-pinball', 'lumina:nova-pinball-replays', 'lumina:nova-pinball:tuning']);
    expect(clearStored('nova-pinball')).toBe(3);
    expect(storedKeys()).toEqual(['lumina:echo-loop', 'lumina:echo-loop:tuning']);
    expect(localStorage.getItem('other-app')).toBe('{}');
  });
  it('全部消すと lumina: のデータだけがなくなり、読み直すと初期値になる', () => {
    clearStored();
    expect(storedKeys()).toEqual([]);
    expect(localStorage.getItem('other-app')).toBe('{}');
    expect(new Save('nova-pinball', { cleared: {} as Record<string, number> }).data.cleared).toEqual({});
  });
});
