/**
 * Blast Courier の難易度測定：先読みボット（上手さ違い × シード2つ）で各ステージを遊ばせ、使った爆風の数・★・失敗を reports/ に書く。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets, toCourier } from '../../games/blast-courier/src/config';
import { CourierSim, HZ } from '../../games/blast-courier/src/sim';
import { courierStages } from '../../games/blast-courier/src/stages';
import { CourierBot } from '../../games/blast-courier/src/bot';

const lines: string[] = [];
const write = () => {
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/blast-courier-balance.md'), lines.join('\n'));
};
it('blast-courier balance report: 見出し', () => {
  lines.push('# Blast Courier 難易度レポート', '', `先読みボット（BC-12：人と同じ操作＝向きと強さで撃つ。skill が低いほど試す数が少なく、向き・強さがぶれる）。各欄は 爆風の数（★）、X＝割れた、B＝爆風の使いすぎ、—＝90 秒で届かず。生成: ${new Date().toISOString()}`, '');
});
for (const preset of ['やさしい', 'ふつう', 'むずかしい']) it(`blast-courier balance report: ${preset}`, () => {
  {
    lines.push(`## ${preset}`, '', '| # | ステージ | 目安 | skill 0.5 | skill 0.9 | クリア | ★3 |', '|---|---|---|---|---|---|---|');
    courierStages.forEach((st, i) => {
      let clears = 0, three = 0;
      const cells = [0.5, 0.9].map((skill) => [1, 2].map((seed) => {
        const sim = new CourierSim(st, toCourier({ ...presets[preset] }));
        const bot = new CourierBot(skill, seed);
        while (sim.phase === 'play' && sim.tick < HZ * 90) { const a = bot.act(sim); if (a) sim.act(a); sim.step(); }
        if (sim.phase === 'clear') { clears++; if (sim.blasts <= st.par) three++; return `${sim.blasts}${sim.blasts <= st.par ? '★3' : sim.blasts <= st.par + 2 ? '★2' : '★1'}`; }
        return sim.phase === 'fail' ? (sim.cracks >= sim.cfg.cracksMax ? 'X' : 'B') : '—';
      }).join(' ・ '));
      lines.push(`| ${i + 1} | ${st.name} | ${st.par} | ${cells.join(' | ')} | ${clears}/4 | ${three}/4 |`);
    });
    lines.push('');
  }
  write();
});
