/**
 * Starsand の検証：各ステージの「解の線」を引いて砂を流し、3つの難易度でクリアできるかと、
 * 使ったインク・こぼれた砂・かかった時間を reports/ に書き出す。npm run balance で実行。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/starsand/src/config';
import { stages } from '../../games/starsand/src/stages';
import { SandSim } from '../../games/starsand/src/sim';

it('starsand solution report', () => {
  const lines = ['# Starsand 解の線の検証', '', `各ステージの解の線（stages.ts の solution）を引いて流した結果。シードを3つ変えて試す。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | 器 | クリア | 平均の秒 | 使ったインク | こぼれた砂 |', '|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      let ok = 0, sec = 0, ink = 0, lost = 0;
      const seeds = [1, 2, 3];
      for (const seed of seeds) {
        const sim = new SandSim(st, { ...presets[preset] }, seed);
        for (const l of st.solution ?? []) for (let k = 1; k < l.length; k++) sim.drawLine(l[k - 1].x, l[k - 1].y, l[k].x, l[k].y);
        for (let k = 0; k < 8000 && sim.phase === 'play'; k++) sim.step();
        if (sim.phase === 'clear') { ok++; sec += sim.tick / 120; }
        ink += 1 - sim.ink / sim.inkMax;
        lost += sim.lost;
      }
      lines.push(`| ${i + 1} | ${st.name} | ${st.cups.length} | ${ok}/${seeds.length} | ${ok ? (sec / ok).toFixed(0) : '-'} | ${Math.round((ink / seeds.length) * 100)}% | ${Math.round(lost / seeds.length)} |`);
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/starsand-balance.md'), lines.join('\n'));
});
