/**
 * Event Horizon の難易度測定：ボット（上手さ違い）で各ステージを複数回遊ばせ、
 * クリア率・時間・失ったかけら・連鎖を reports/ に書き出す。npm run balance で実行。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/event-horizon/src/config';
import { stages } from '../../games/event-horizon/src/stages';
import { HorizonSim } from '../../games/event-horizon/src/sim';
import { HorizonBot } from '../../games/event-horizon/src/bot';

const RUNS = Number(process.env.BALANCE_RUNS ?? 8);

it('event-horizon balance report', () => {
  const lines = ['# Event Horizon 難易度レポート', '', `ボット（輪に乗せて運び、放す／解放の放物線を先読みして投げる。skill が低いほど円がぶれ、先読みが減る）で各ステージを${RUNS}回ずつ。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | skill | クリア率 | 平均クリア秒 | 平均の失ったかけら | 平均最大連鎖 | ★3 |', '|---|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      for (const skill of [0.6, 0.85]) {
        let clears = 0, tSum = 0, lost = 0, chain = 0, s3 = 0, score = 0;
        for (let r = 0; r < RUNS; r++) {
          const sim = new HorizonSim(st, { ...presets[preset] });
          const bot = new HorizonBot(100 + r * 13 + i, skill);
          while (sim.phase === 'play' && sim.time < 400) sim.step(bot.input(sim));
          if (sim.phase === 'clear') { clears++; tSum += sim.worldTime; }
          const l = sim.shards.filter((s) => s.state === 'lost').length;
          lost += l;
          chain += sim.bestChain;
          score += sim.score;
          // main.ts の星評価と同じ基準（スコアアタックは別）
          if (sim.phase === 'clear' && !st.attack && l === 0 && sim.bestChain >= Math.min(sim.need, 3)) s3++;
        }
        const extra = st.attack ? `平均スコア ${Math.round(score / RUNS)}` : `${Math.round((s3 / RUNS) * 100)}%`;
        lines.push(`| ${i + 1} | ${st.name} | ${skill} | ${Math.round((clears / RUNS) * 100)}% | ${clears ? (tSum / clears).toFixed(0) : '-'} | ${(lost / RUNS).toFixed(1)} | ${(chain / RUNS).toFixed(1)} | ${extra} |`);
      }
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/event-horizon-balance.md'), lines.join('\n'));
});
