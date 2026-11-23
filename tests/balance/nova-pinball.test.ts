/**
 * 難易度測定：ボット（上手さ違い）で各ステージを複数回遊ばせ、クリア率・時間・連鎖を reports/ に書き出す。
 * npm run balance で実行。数値はステージの並び順・調整の判断材料にする。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/nova-pinball/src/config';
import { stages } from '../../games/nova-pinball/src/stages';
import { NovaSim } from '../../games/nova-pinball/src/sim';
import { NovaBot } from '../../games/nova-pinball/src/bot';

const RUNS = Number(process.env.BALANCE_RUNS ?? 12);
const LIMIT_SEC = 240;

it('nova-pinball balance report', () => {
  const lines: string[] = ['# Nova Pinball 難易度レポート', '', `ボットで各ステージを${RUNS}回ずつ（制限${LIMIT_SEC}秒）。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | skill | クリア率 | 平均クリア秒 | 平均最大連鎖 | 星座完成率 |', '|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      for (const skill of [0.6, 0.85]) {
        let clears = 0, tSum = 0, chainSum = 0, nova = 0;
        for (let r = 0; r < RUNS; r++) {
          const sim = new NovaSim(st, { ...presets[preset] });
          const bot = new NovaBot(1000 + r * 7 + i, skill);
          while (sim.phase === 'play' && sim.time < LIMIT_SEC) sim.step(bot.input(sim));
          if (sim.phase === 'clear') { clears++; tSum += sim.time; }
          chainSum += sim.bestChain;
          if (sim.supernova) nova++;
        }
        lines.push(`| ${i + 1} | ${st.name} | ${skill} | ${Math.round((clears / RUNS) * 100)}% | ${clears ? (tSum / clears).toFixed(0) : '-'} | ${(chainSum / RUNS).toFixed(1)} | ${Math.round((nova / RUNS) * 100)}% |`);
      }
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/nova-pinball-balance.md'), lines.join('\n'));
});
