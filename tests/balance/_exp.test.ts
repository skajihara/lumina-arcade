import { it } from 'vitest';
import { presets } from '../../games/nova-pinball/src/config';
import { stages } from '../../games/nova-pinball/src/stages';
import { NovaSim } from '../../games/nova-pinball/src/sim';
import { NovaBot } from '../../games/nova-pinball/src/bot';
const RUNS = Number(process.env.R ?? 10);
it('quick', () => {
  for (const preset of (process.env.P ?? 'ふつう').split(',')) {
    let line = preset + '\n';
    for (const skill of (process.env.K ?? '0.6,0.85').split(',').map(Number)) {
      line += ` s${skill}:`;
      stages.forEach((st, i) => {
        if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(i + 1))) return;
        let c = 0, ch = 0, nv = 0, t = 0, go = 0;
        for (let r = 0; r < RUNS; r++) {
          const sim = new NovaSim(st, { ...presets[preset], ...JSON.parse(process.env.O ?? '{}') });
          const bot = new NovaBot(1000 + r * 7 + i, skill);
          while (sim.phase === 'play' && sim.time < 240) sim.step(bot.input(sim));
          if (sim.phase === 'clear') { c++; t += sim.time; } if (sim.phase === 'gameover') go++;
          ch += sim.bestChain; if (sim.supernova) nv++;
        }
        line += ` ${i + 1}:${Math.round(c / RUNS * 100)}%/${(ch / RUNS).toFixed(1)}/n${nv}/${c ? Math.round(t / c) : '-'}s`;
      });
      line += '\n';
    }
    console.log(line);
  }
});
