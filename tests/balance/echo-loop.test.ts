/**
 * Echo Loop の難易度測定（EL-20b：一筆のループ）：素朴なボットで各ステージを遊ばせ、クリア率・使った周の数・灯せた星の割合を reports/ に書く。
 * ボットはフリッパーの上に来たら打つだけ（狙わない）。狙うボットは EL-20b の続きで作る。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets, toSim } from '../../games/echo-loop/src/config';
import { stages } from '../../games/echo-loop/src/stages';
import { EchoSim, HZ } from '../../games/echo-loop/src/sim';
import { EchoBot } from '../../games/echo-loop/src/bot';

const RUNS = Number(process.env.BALANCE_RUNS ?? 6);

it('echo-loop balance report', () => {
  const lines = ['# Echo Loop 難易度レポート', '', `素朴なボット（フリッパーの上に来たら打つ）で各ステージを${RUNS}回ずつ。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | 目安 | skill | クリア率 | 平均の周 | 灯せた星 |', '|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      for (const skill of [0.6, 0.9]) {
        let c = 0, loops = 0, lit = 0;
        for (let r = 0; r < RUNS; r++) {
          const s = new EchoSim(st, toSim(presets[preset]));
          const bot = new EchoBot(r + 1 + i * 31, skill);
          while (s.phase === 'play' && s.tick < HZ * 240) s.step(bot.input(s));
          if (s.phase === 'clear') { c++; loops += s.loop; }
          lit += s.litCount / s.stars.length;
        }
        lines.push(`| ${i + 1} | ${st.name} | ${st.par} | ${skill} | ${Math.round((c / RUNS) * 100)}% | ${c ? (loops / c).toFixed(1) : '-'} | ${Math.round((lit / RUNS) * 100)}% |`);
      }
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/echo-loop-balance.md'), lines.join('\n'));
});
