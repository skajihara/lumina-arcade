/**
 * 動作確認：ビルド済みの play/*.html を file:// で開き、
 * ・エラーなく起動する
 * ・自動プレイで30秒動かしても落ちない
 * ・スクリーンショットを test-results/shots に保存（PR に添付する）
 */
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const playDir = resolve(import.meta.dirname, '../../play');
const shots = resolve(import.meta.dirname, '../../test-results/shots');
mkdirSync(shots, { recursive: true });
// 実験枠（play/seeds/）も起動とエラーだけ確かめる
const seedsDir = resolve(playDir, 'seeds');
const pages = [
  ...readdirSync(playDir).filter((f) => f.endsWith('.html')),
  ...(existsSync(seedsDir) ? readdirSync(seedsDir).filter((f) => f.endsWith('.html')).map((f) => `seeds/${f}`) : []),
];

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __lumina?: { ready: boolean } }).__lumina?.ready === true, null, { timeout: 30_000 });
}

for (const file of pages) {
  const name = file.replace('.html', '').replace('/', '-');
  test(`${name}: 起動してエラーが出ない`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(pathToFileURL(resolve(playDir, file)).href);
    await waitReady(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(shots, `${name}-title.png`) });
    expect(errors).toEqual([]);
  });

  if (name === 'index' || file.startsWith('seeds/')) continue;
  test(`${name}: 自動プレイで30秒動く`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(resolve(playDir, file)).href + '?stage=0&autoplay=1');
    await waitReady(page);
    for (let i = 1; i <= 3; i++) {
      await page.waitForTimeout(10_000);
      await page.screenshot({ path: resolve(shots, `${name}-play-${i}.png`) });
    }
    const st = await page.evaluate(() => (window as unknown as { __lumina: { frames: number; state(): Record<string, unknown> } }).__lumina);
    const state = await page.evaluate(() => (window as unknown as { __lumina: { state(): Record<string, unknown> } }).__lumina.state());
    console.log(name, JSON.stringify(state), 'frames', st.frames);
    expect(st.frames).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
}

// スマホ（タッチの画面）：キーボードの代わりの画面ボタンが出て、押すと効く
test.describe('スマホの画面ボタン', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const games = ['nova-pinball', 'echo-loop', 'stopped-world', 'event-horizon', 'origami-cosmos', 'starsand'];
  for (const g of games) {
    test(`${g}: 画面ボタンが出て、ポーズできる`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(pathToFileURL(resolve(playDir, `${g}.html`)).href + '?stage=0');
      await waitReady(page);
      await page.waitForTimeout(800);
      const bar = page.locator('.tbar');
      await expect(bar).toBeVisible();
      await page.screenshot({ path: resolve(shots, `${g}-phone.png`) });
      if (g === 'stopped-world') {
        // 時を止める → 解き放つ（以前はタッチだと止めた時間を戻せなかった）
        const state = () => page.evaluate(() => (window as unknown as { __lumina: { state(): { stopped?: boolean } } }).__lumina.state().stopped);
        await page.locator('.tbtn', { hasText: '時を止める' }).tap();
        await expect.poll(state).toBe(true);
        await page.locator('.tbtn', { hasText: '解き放つ' }).tap();
        await expect.poll(state).toBe(false);
      }
      await page.locator('.tbtn', { hasText: '‖' }).tap();
      const mode = await page.evaluate(() => (window as unknown as { __lumina: { state(): { mode: string } } }).__lumina.state().mode);
      expect(mode).toBe('pause');
      await page.screenshot({ path: resolve(shots, `${g}-phone-pause.png`) });
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Event Horizon のタッチ', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('指を置くと、着くまでは引かずに動き、着いたら離すまで引き寄せる', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(playDir, 'event-horizon.html')).href + '?stage=0');
    await waitReady(page);
    await page.waitForTimeout(500);
    type S = { pulling?: boolean; bh?: { x: number; y: number } };
    const state = () => page.evaluate(() => (window as unknown as { __lumina: { state(): S } }).__lumina.state());
    const fire = (type: string, x: number, y: number) => page.evaluate(([type, x, y]) => {
      const c = document.querySelector('canvas#game')!;
      const ev = new PointerEvent(type as string, { pointerType: 'touch', clientX: x as number, clientY: y as number, bubbles: true, button: 0, isPrimary: true });
      (type === 'pointerdown' ? c : window).dispatchEvent(ev);
    }, [type, x, y] as const);
    const s0 = await state();
    await fire('pointerdown', 740, 330);
    await page.waitForTimeout(60);
    const s1 = await state();
    expect(s1.pulling).toBe(false); // 遠いので、まだ引かない
    await expect.poll(async () => (await state()).pulling, { timeout: 5000 }).toBe(true);
    const s2 = await state();
    await page.screenshot({ path: resolve(shots, 'event-horizon-phone-landscape.png') });
    expect(Math.hypot(s2.bh!.x - s0.bh!.x, s2.bh!.y - s0.bh!.y)).toBeGreaterThan(0.5);
    await fire('pointerup', 740, 330);
    await expect.poll(async () => (await state()).pulling).toBe(false);
  });
});

test('stopped-world: 卵を引っぱって放すと、逆向きに飛ぶ（パチンコ式）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(resolve(playDir, 'stopped-world.html')).href + '?stage=0');
  await waitReady(page);
  await page.waitForTimeout(1200);
  type H = { sim(): { objs: { def: { kind: string }; body: { getPosition(): { x: number; y: number } } }[] }; toScreen(x: number, y: number): { x: number; y: number }; state(): { stopped?: boolean } };
  const egg = await page.evaluate(() => {
    const h = (window as unknown as { __lumina: H }).__lumina;
    const o = h.sim().objs.find((q) => q.def.kind === 'egg')!;
    const p = o.body.getPosition();
    return { w: { x: p.x, y: p.y }, s: h.toScreen(p.x, p.y), s2: h.toScreen(p.x - 2, p.y + 1) };
  });
  await page.mouse.move(egg.s.x, egg.s.y);
  await page.mouse.down();
  await page.mouse.move((egg.s.x + egg.s2.x) / 2, (egg.s.y + egg.s2.y) / 2, { steps: 4 });
  await page.mouse.move(egg.s2.x, egg.s2.y, { steps: 4 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(shots, 'stopped-world-sling.png') });
  await page.mouse.up();
  const stopped = await page.evaluate(() => (window as unknown as { __lumina: H }).__lumina.state().stopped);
  expect(stopped).toBe(true); // つかんだ時に時間が止まる
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(shots, 'stopped-world-fly.png') });
  await page.waitForTimeout(250);
  const x1 = await page.evaluate(() => {
    const o = (window as unknown as { __lumina: H }).__lumina.sim().objs.find((q) => q.def.kind === 'egg')!;
    return o.body.getPosition().x;
  });
  expect(x1).toBeGreaterThan(egg.w.x + 0.5); // 左下へ引いた → 右上へ飛ぶ
  expect(errors).toEqual([]);
});
