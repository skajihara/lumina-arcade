import { describe, expect, it } from 'vitest';
import { Harmony, PROGRESSION } from './audio';

describe('Harmony（和音進行）', () => {
  it('構成音を上へ積む：構成音の数だけ進むと1オクターブ上', () => {
    const h = new Harmony();
    const len = h.chord().length;
    expect(h.semis(len) - h.semis(0)).toBe(12);
    expect(h.freq(len) / h.freq(0)).toBeCloseTo(2, 6);
  });
  it('advance で次の和音へ、一周すると戻る', () => {
    const h = new Harmony();
    const first = h.semis(0);
    h.advance();
    expect(h.chord()).toEqual(PROGRESSION[1]);
    for (let i = 1; i < PROGRESSION.length; i++) h.advance();
    expect(h.semis(0)).toBe(first);
  });
  it('キーを変えると全体が平行移動する', () => {
    const h = new Harmony();
    const a = h.semis(3);
    h.reset(5);
    expect(h.semis(3)).toBe(a + 5);
  });
});
