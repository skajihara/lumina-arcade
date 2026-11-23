/**
 * 動作確認：ビルド済みの play/*.html を file:// で開き、
 * ・エラーなく起動する
 * ・自動プレイで30秒動かしても落ちない
 * ・スクリーンショットを test-results/shots に保存（PR に添付する）
 */
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const playDir = resolve(import.meta.dirname, '../../play');
const shots = resolve(import.meta.dirname, '../../test-results/shots');
mkdirSync(shots, { recursive: true });
const pages = readdirSync(playDir).filter((f) => f.endsWith('.html'));

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __lumina?: { ready: boolean } }).__lumina?.ready === true, null, { timeout: 30_000 });
}

for (const file of pages) {
  const name = file.replace('.html', '');
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

  if (name === 'index') continue;
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
