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

const RUNS = Number(process.env.BALANCE_RUNS ?? 16);
const LIMIT_SEC = 240;

it('nova-pinball balance report', () => {
  const lines: string[] = ['# Nova Pinball 難易度レポート', '', `ボット（フリッパー上のボールを先読みして狙い撃つ。星座計画：線の星を先に灯し、取り残しのない時だけ起爆。skill が低いほど反応が遅く狙いがぶれる）で各ステージを${RUNS}回ずつ（制限${LIMIT_SEC}秒）。生成: ${new Date().toISOString()}`, ''];
  for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
    lines.push(`## ${preset}`, '', '| # | ステージ | skill | クリア率 | 平均クリア秒 | 平均最大連鎖 | 星座完成率 | 線の点灯率 | ★2以上 | ★3 | ゲームオーバー率 |', '|---|---|---|---|---|---|---|---|---|---|---|');
    stages.forEach((st, i) => {
      if (st.endless) return;
      for (const skill of [0.6, 0.85]) {
        let clears = 0, tSum = 0, chainSum = 0, nova = 0, over = 0, linkSum = 0, s2 = 0, s3 = 0;
        for (let r = 0; r < RUNS; r++) {
          const sim = new NovaSim(st, { ...presets[preset] });
          const bot = new NovaBot(1000 + r * 7 + i, skill);
          while (sim.phase === 'play' && sim.time < LIMIT_SEC) sim.step(bot.input(sim));
          if (sim.phase === 'clear') { clears++; tSum += sim.time; }
          chainSum += sim.bestChain;
          if (sim.supernova) nova++;
          const frac = sim.links.length ? sim.litLinks.size / sim.links.length : 1;
          linkSum += frac;
          // main.ts の星評価と同じ基準
          if (sim.phase === 'clear') {
            if (sim.supernova || sim.bestChain >= Math.ceil(sim.stars.length * 0.6)) { s3++; s2++; } else if (frac >= 0.7) s2++;
          }
          if (sim.phase === 'gameover') over++;
        }
        lines.push(`| ${i + 1} | ${st.name} | ${skill} | ${Math.round((clears / RUNS) * 100)}% | ${clears ? (tSum / clears).toFixed(0) : '-'} | ${(chainSum / RUNS).toFixed(1)} | ${Math.round((nova / RUNS) * 100)}% | ${Math.round((linkSum / RUNS) * 100)}% | ${Math.round((s2 / RUNS) * 100)}% | ${Math.round((s3 / RUNS) * 100)}% | ${Math.round((over / RUNS) * 100)}% |`);
      }
    });
    lines.push('');
  }
  // エンドレス：到達した波とスコア
  const endless = stages.find((s) => s.endless);
  if (endless) {
    lines.push('## エンドレス', '', '| 難易度 | skill | 平均到達波 | 最高到達波 | 平均スコア |', '|---|---|---|---|---|');
    for (const preset of ['やさしい', 'ふつう', 'むずかしい']) {
      for (const skill of [0.6, 0.85]) {
        let wSum = 0, wMax = 0, sSum = 0;
        const n = Math.max(4, Math.round(RUNS / 2));
        for (let r = 0; r < n; r++) {
          const sim = new NovaSim({ ...endless, endless: { seed: 100 + r } }, { ...presets[preset] });
          const bot = new NovaBot(500 + r, skill);
          while (sim.phase === 'play' && sim.time < 600) sim.step(bot.input(sim));
          wSum += sim.wave; wMax = Math.max(wMax, sim.wave); sSum += sim.score;
        }
        lines.push(`| ${preset} | ${skill} | ${(wSum / n).toFixed(1)} | ${wMax} | ${Math.round(sSum / n).toLocaleString()} |`);
      }
    }
    lines.push('');
  }
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/nova-pinball-balance.md'), lines.join('\n'));
});
