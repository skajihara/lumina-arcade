/**
 * Echo Loop の難易度測定：ボットで各ステージを遊ばせ、クリア率・使ったループ数・1ループで壊せた最大割合を reports/ に書く。
 * ボットは「前のループで壊れた星（残響が壊してくれる星）」を後回しにする。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/echo-loop/src/config';
import { stages } from '../../games/echo-loop/src/stages';
import { EchoSim, echoBias } from '../../games/echo-loop/src/sim';
import { NovaBot } from '../../games/nova-pinball/src/bot';

const RUNS = Number(process.env.BALANCE_RUNS ?? 12);

it('echo-loop balance report', () => {
  const lines = ['# Echo Loop 難易度レポート', '', `ボットで各ステージを${RUNS}回ずつ。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | skill | クリア率 | 平均ループ数 | 最大ループ | 1ループの最大破壊率 |', '|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      for (const skill of [0.6, 0.85]) {
        let c = 0, loops = 0, best = 0, max = 0;
        for (let r = 0; r < RUNS; r++) {
          const es = new EchoSim(st, { ...presets[preset] });
          max = es.maxLoops;
          const bot = new NovaBot(r + 1 + i * 31, skill);
          bot.bias = echoBias(es);
          while (es.phase === 'play') {
            bot.owner = es.loop;
            es.step(bot.input(es.sim));
          }
          if (es.phase === 'clear') { c++; loops += es.loop + 1; }
          best += es.best / st.stars.length;
        }
        lines.push(`| ${i + 1} | ${st.name} | ${skill} | ${Math.round((c / RUNS) * 100)}% | ${c ? (loops / c).toFixed(1) : '-'} | ${max} | ${Math.round((best / RUNS) * 100)}% |`);
      }
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/echo-loop-balance.md'), lines.join('\n'));
});
