/**
 * Event Horizon（地平すれすれ・EH-20b）の難易度測定：ボット（上手さ違い × シード）で各ステージを遊ばせ、
 * 得点・★・終わり方を reports/ に書き出す。npm run balance で実行。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets, toSkim } from '../../games/event-horizon/src/config';
import { stages } from '../../games/event-horizon/src/stages';
import { SkimSim, HZ } from '../../games/event-horizon/src/sim';
import { SkimBot } from '../../games/event-horizon/src/bot';

const RUNS = Number(process.env.BALANCE_RUNS ?? 4);
const WHY = { horizon: '地平', drift: '流された', time: '時間' } as const;

it('event-horizon balance report', () => {
  const lines = ['# Event Horizon 難易度レポート（地平すれすれ）', '', `ボット（噴射なしの先の軌道を読み、近すぎたら加速・遠ければ短く減速。skill が高いほど攻める）で各ステージを${RUNS}回ずつ。各欄は 平均点（★3 の回数／終わり方）。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | ★の点 | skill 0.5 | skill 0.9 | ★1 以上 | ★3 |', '|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      let one = 0, three = 0;
      const cells = [0.5, 0.9].map((skill) => {
        let sum = 0;
        const ends: Record<string, number> = {};
        for (let r = 0; r < RUNS; r++) {
          const sim = new SkimSim(st, toSkim({ ...presets[preset] }), 7 + r);
          const bot = new SkimBot(skill, 100 + r * 13 + i);
          while (sim.phase === 'play' && sim.tick < HZ * 300) { sim.input = bot.input(sim); sim.step(); }
          sum += sim.score;
          const s = sim.starsFor();
          if (s >= 1) one++;
          if (s >= 3) three++;
          const w = sim.endWhy ? WHY[sim.endWhy] : '—';
          ends[w] = (ends[w] ?? 0) + 1;
        }
        return `${Math.round(sum / RUNS)}（${Object.entries(ends).map(([k, v]) => `${k}${v}`).join('・')}）`;
      });
      lines.push(`| ${i + 1} | ${st.name} | ${st.stars.join(' / ')} | ${cells.join(' | ')} | ${one}/${RUNS * 2} | ${three}/${RUNS * 2} |`);
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/event-horizon-balance.md'), lines.join('\n'));
});
