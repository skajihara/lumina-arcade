/**
 * Moon Claw の難易度測定：ボット（上手さ違い × シード3つ）で各ステージを遊ばせ、クリア率と時間を reports/ に書く。
 */
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets, toClaw } from '../../games/moon-claw/src/config';
import { ClawSim } from '../../games/moon-claw/src/sim';
import { clawStages } from '../../games/moon-claw/src/stages';
import { ClawBot } from '../../games/moon-claw/src/bot';

it('moon-claw balance report', () => {
  const lines = ['# Moon Claw 難易度レポート', '', `ボット（MC-10 の物理の爪。skill が低いほど狙いがずれ、運ぶのが雑）。各欄は シード3つのクリア数／平均の点／クリアした時の平均秒。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | 必要 | skill 0.5 | skill 0.7 | skill 0.9 |', '|---|---|---|---|---|---|');
    clawStages.forEach((st, i) => {
      const cells = [0.5, 0.7, 0.9].map((skill) => {
        let clears = 0, pts = 0, secs = 0;
        for (const seed of [1, 2, 3]) {
          const sim = new ClawSim(st, toClaw({ ...presets[preset] }));
          const bot = new ClawBot(skill, seed);
          while (sim.phase === 'play') { const a = bot.act(sim); sim.step(a.bits, a.target); }
          pts += sim.score;
          if (sim.phase === 'clear') { clears++; secs += sim.time; }
        }
        return `${clears}/3 ・ ${(pts / 3).toFixed(1)}点 ・ ${clears ? (secs / clears).toFixed(0) + '秒' : '—'}`;
      });
      lines.push(`| ${i + 1} | ${st.name} | ${st.need} | ${cells.join(' | ')} |`);
    });
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/moon-claw-balance.md'), lines.join('\n'));
});
