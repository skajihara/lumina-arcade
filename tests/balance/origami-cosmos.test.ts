/**
 * Origami Cosmos のパズル検証：ソルバーで全問に解があり、ステージの ignitions が最短と一致することを確かめ、
 * 最短の点火回数・折り回数・折らない時の点火回数・最短になる1手目の数（少ないほどひらめきが要る）を reports/ に書き出す。npm run balance で実行。
 */
import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { presets } from '../../games/origami-cosmos/src/config';
import { stages } from '../../games/origami-cosmos/src/stages';
import { solve, optimalFirstMoves } from '../../games/origami-cosmos/src/solver';

it('origami-cosmos puzzle report', () => {
  const lines = ['# Origami Cosmos パズル検証', '', `ソルバー（幅優先）で全問を解いた結果。生成: ${new Date().toISOString()}`, '',
    '点火の上限：やさしい＝最短＋' + presets['やさしい'].extraIgnitions + '（1手に折れる回数＋' + presets['やさしい'].extraFolds + '）、ふつう＝最短＋' + presets['ふつう'].extraIgnitions + '、むずかしい＝最短ちょうど', '',
    '| # | 問題 | 星 | 折り線 | 1手に折れる | 最短の点火 | その時の折り回数 | 折らない時の点火 | やさしい（折り＋1）の最短 | 最短になる1手目の数 |', '|---|---|---|---|---|---|---|---|---|---|'];
  stages.forEach((st, i) => {
    const blast = presets['ふつう'].blast;
    const sol = solve(st, { blast, maxFolds: st.maxFolds });
    const flat = solve(st, { blast, maxFolds: 0 });
    const easy = solve(st, { blast, maxFolds: st.maxFolds + presets['やさしい'].extraFolds });
    expect(sol, st.name).not.toBeNull();
    expect(sol!.ignitions, st.name).toBe(st.ignitions);
    lines.push(`| ${i + 1} | ${st.name} | ${st.stars.length} | ${st.folds.length} | ${st.maxFolds} | ${sol!.ignitions} | ${sol!.folds} | ${flat?.ignitions ?? '-'} | ${easy?.ignitions ?? '-'} | ${optimalFirstMoves(st, { blast, maxFolds: st.maxFolds })} |`);
  });
  mkdirSync(resolve(import.meta.dirname, '../../reports'), { recursive: true });
  writeFileSync(resolve(import.meta.dirname, '../../reports/origami-cosmos-puzzles.md'), lines.join('\n') + '\n');
});
