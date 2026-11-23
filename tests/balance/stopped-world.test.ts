/**
 * Stopped World の解けることの確認：ランダム探索のボットで、各ステージにクリアできる操作の計画があるかを調べる。
 * 「何回の試行で見つかったか」を難しさの目安にする（少ないほど易しい）。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/stopped-world/src/config';
import { stages } from '../../games/stopped-world/src/stages';
import { search } from '../../games/stopped-world/src/bot';

const SEEDS = 6;
const TRIES = 400;

it('stopped-world solvability report', () => {
  const lines = ['# Stopped World 解けることの確認', '', `ランダム探索（1回の探索で最大${TRIES}計画）を${SEEDS}回。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | 目的 | 解けた探索 | 平均試行数 |', '|---|---|---|---|---|');
    stages.forEach((st, i) => {
      let ok = 0, tries = 0;
      for (let s = 0; s < SEEDS; s++) {
        const r = search(st, { ...presets[preset] }, TRIES, s + 1);
        if (r) { ok++; tries += r.tries; }
      }
      lines.push(`| ${i + 1} | ${st.name} | ${st.goal === 'nest' ? '卵を巣へ' : '箱を壊す'} | ${ok}/${SEEDS} | ${ok ? Math.round(tries / ok) : '-'} |`);
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/stopped-world-balance.md'), lines.join('\n'));
});
