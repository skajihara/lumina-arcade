// 任意のステージのスクリーンショットを撮る（目視確認用）
// 例: node scripts/shot.mjs nova-pinball.html '?stage=6&autoplay=1' out.png 12000
//     node scripts/shot.mjs nova-pinball.html '?stage=2' out.png 3000 ignite 600,1400,2600
//     （ignite：window.__lumina.ignite() を呼んで、指定ミリ秒後ごとに out-<ms>.png を撮る）
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const [, , file, query, out, wait, action, times] = process.argv;
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((x) => fs.existsSync(x));
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + process.cwd() + '/play/' + file + query);
await p.waitForTimeout(Number(wait ?? 8000));
if (action) {
  await p.evaluate((a) => window.__lumina[a](), action);
  let prev = 0;
  for (const t of (times ?? '1000').split(',').map(Number)) {
    await p.waitForTimeout(t - prev);
    prev = t;
    await p.screenshot({ path: out.replace(/\.png$/, `-${t}.png`) });
  }
} else await p.screenshot({ path: out });
console.log('errors', errs);
await b.close();
