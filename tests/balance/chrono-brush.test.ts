/**
 * 時空の絵筆の難易度測定：先読みボット（上手さ違い）で各ステージを遊ばせ、籠に入れた数・★を reports/ に書く。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets, toChrono } from '../../games/chrono-brush/src/config';
import { chronoStages, ChronoSim } from '../../games/chrono-brush/src/sim';
import { ChronoBot } from '../../games/chrono-brush/src/bot';

it('chrono-brush balance report', () => {
  const lines = ['# 時空の絵筆 難易度レポート', '', `先読みボット（skill が低いほど判断の間隔が長く、試す場所が少ない）。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | 必要 | skill 0.5 | skill 0.7 | skill 0.85 | 何もしない |', '|---|---|---|---|---|---|---|');
    chronoStages.forEach((st, i) => {
      const cells = [0.5, 0.7, 0.85, -1].map((skill) => {
        const sim = ChronoSim.of(st, toChrono({ ...presets[preset] }));
        const bot = skill > 0 ? new ChronoBot(skill) : null;
        while (!sim.done && sim.tick < 120 * 120) { bot?.act(sim); sim.step(); }
        return `${sim.caught}/${sim.cfg.stars}${sim.cleared ? ' ✓' : ''}`;
      });
      lines.push(`| ${i + 1} | ${st.name} | ${st.need} | ${cells.join(' | ')} |`);
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/chrono-brush-balance.md'), lines.join('\n'));
});
