import { it } from 'vitest';
import { presets } from '../../games/nova-pinball/src/config';
import { stages } from '../../games/nova-pinball/src/stages';
import { NovaSim } from '../../games/nova-pinball/src/sim';
import { NovaBot } from '../../games/nova-pinball/src/bot';
const RUNS = Number(process.env.R ?? 8);
it('twist', () => {
  for (const twist of [0, 1, 2, 3]) {
    let c = 0, ch = 0, nv = 0, t = 0, n = 0, explo = 0, links = 0;
    stages.forEach((st, i) => {
      if (st.endless) return;
      for (let r = 0; r < RUNS; r++) {
        const sim = new NovaSim(st, { ...presets['ふつう'], twist });
        const bot = new NovaBot(1000 + r * 7 + i, 0.85);
        while (sim.phase === 'play' && sim.time < 240) { sim.step(bot.input(sim)); for (const e of sim.events) if (e.t === 'explode' && e.chain >= 3) explo++; }
        n++; if (sim.phase === 'clear') { c++; t += sim.time; }
        ch += sim.bestChain; if (sim.supernova) nv++; links += sim.litLinks.size / Math.max(1, sim.links.length);
      }
    });
    console.log(`twist${twist}: clear ${Math.round(c / n * 100)}% chain ${(ch / n).toFixed(1)} nova ${Math.round(nv / n * 100)}% links ${Math.round(links / n * 100)}% t ${Math.round(t / Math.max(1, c))}s chain3+/game ${(explo / n).toFixed(1)}`);
  }
});
