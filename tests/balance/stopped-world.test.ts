/**
 * Stopped World の解けることの確認：ランダム探索のボットで、各ステージにクリアできる操作の計画があるかを調べる。
 * 「何回の試行で見つかったか」を難しさの目安にする（少ないほど易しい）。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/stopped-world/src/config';
import { stages } from '../../games/stopped-world/src/stages';
import { search, randomPlan, runPlan } from '../../games/stopped-world/src/bot';
import { Rng } from '../../packages/engine/src/rng';

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
  // ひねりの比較：人に近い速さの計画で、解けた時に残るゲージ（★の基準）を、ひねり0（なし）と1（壊すと時間が戻る）で比べる
  const HN = 150;
  lines.push('## ひねりの比較（ふつう）', '', `人に近い速さの計画（止めている時間＝1秒＋矢印1本0.6秒）をランダムに${HN}個。解けた計画の割合／その平均残りゲージ／★3（残り半分以上）の数`, '',
    '| # | ステージ | ひねり0（なし） | ひねり1（壊すと時間が戻る・標準） | ひねり2（向きを変える） |', '|---|---|---|---|---|');
  stages.forEach((st, i) => {
    const cells = [0, 1, 2].map((twist) => {
      const cfg = { ...presets['ふつう'], twist };
      const rng = new Rng(1000 + i);
      let ok = 0, left = 0, s3 = 0;
      for (let k = 0; k < HN; k++) {
        const sim = runPlan(st, cfg, randomPlan(st, cfg, rng, true));
        if (sim.phase !== 'clear') continue;
        ok++;
        left += sim.gauge / cfg.stopGauge;
        if (sim.gauge / cfg.stopGauge > 0.5) s3++;
      }
      return `${((ok / HN) * 100).toFixed(1)}% / ${ok ? Math.round((left / ok) * 100) + '%' : '-'} / ★3 ${s3}`;
    });
    lines.push(`| ${i + 1} | ${st.name} | ${cells.join(' | ')} |`);
  });
  lines.push('');
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/stopped-world-balance.md'), lines.join('\n'));
});
