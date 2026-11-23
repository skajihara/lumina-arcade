/**
 * Stopped World のステージ（世界は 20×12。y は下向き、床は y=12）。
 * いまは操作と描画を確かめるための3面。SW-03 で10面に増やし、ボットで解けることを確かめる。
 */
import type { StageDef } from './sim';

export const stages: StageDef[] = [
  {
    id: 'sw-roll',
    name: '最初のひと押し',
    hint: 'Space で時間を止め、卵をドラッグして矢印を置く。もう一度 Space で解放',
    goal: 'nest',
    nest: { x: 15.5, y: 11.2, w: 3.2, h: 1.8 },
    objects: [{ kind: 'egg', x: 4, y: 11.5, w: 0.45 }],
  },
  {
    id: 'sw-boom',
    name: '止まった爆発',
    hint: '止めている間に爆弾を叩くと、解放の瞬間に爆発する',
    goal: 'destroy',
    objects: [
      { kind: 'crate', x: 7.6, y: 11.4, w: 1.2 },
      { kind: 'bomb', x: 10, y: 11.55, w: 0.45 },
      { kind: 'crate', x: 12.4, y: 11.4, w: 1.2 },
      { kind: 'crate', x: 12.4, y: 10.2, w: 1.2 },
    ],
  },
  {
    id: 'sw-shelf',
    name: '棚の上',
    hint: '卵を棚から下ろす。強く落とすと割れる — 下で受け止める力を同時に置け',
    goal: 'nest',
    nest: { x: 16.5, y: 11.2, w: 3, h: 1.8 },
    ground: [[{ x: 2, y: 6 }, { x: 8, y: 6 }]],
    objects: [
      { kind: 'egg', x: 3, y: 5.5, w: 0.45 },
      { kind: 'plank', x: 12, y: 11.75, w: 3, h: 0.5 },
    ],
  },
];
