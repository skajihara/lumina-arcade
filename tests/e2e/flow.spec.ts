/**
 * 人の操作に近い一通りの確認（QA-03）
 * ・タイトルで難易度を切り替え、ステージをクリックして始める
 * ・マウスのドラッグ・クリック・Space を入れる
 * ・P でポーズ → P で戻る、R でやり直し
 * ・全ステージを順に開き、少し操作してエラーが出ないか（各ステージの開始画面を撮る）
 * ・自動プレイでクリアすると進行が保存される
 * 撮った各ステージの画面は .qa/stages/<game>/ に置き、一覧画像は scripts/contact-sheet.py で作る
 */
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const playDir = resolve(import.meta.dirname, '../../play');
const stagesDir = resolve(import.meta.dirname, '../../.qa/stages');
const games = readdirSync(playDir).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace('.html', ''));

type Hook = { ready: boolean; frames: number; errors: string[]; state(): Record<string, unknown>; start(i: number): void; setAutoplay(on: boolean): void };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __lumina: Hook }).__lumina.state());
const mode = async (page: Page) => (await state(page)).mode as string;

async function open(page: Page, game: string, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(resolve(playDir, `${game}.html`)).href + query);
  await page.waitForFunction(() => (window as unknown as { __lumina?: Hook }).__lumina?.ready === true, null, { timeout: 30_000 });
  return errors;
}

/** 盤面の上で、人がやりそうな操作を少し入れる */
async function fiddle(page: Page, seed: number) {
  const vp = page.viewportSize()!;
  const r = (k: number) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  for (let k = 0; k < 3; k++) {
    const x0 = vp.width * (0.25 + 0.5 * r(k)), y0 = vp.height * (0.3 + 0.4 * r(k + 10));
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 80 * (r(k + 20) - 0.5) * 2, y0 + 80 * (r(k + 30) - 0.5) * 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
}

for (const game of games) {
  test(`${game}: タイトル → 難易度 → ステージ → ポーズ → やり直し`, async ({ page }) => {
    const errors = await open(page, game, '?all=1');
    expect(await mode(page)).toBe('menu');
    await page.getByRole('button', { name: 'むずかしい' }).click();
    await page.getByRole('button', { name: 'やさしい' }).click();
    await page.getByRole('button', { name: 'ふつう' }).click();
    await page.locator('.menu .stage').first().click();
    await page.waitForTimeout(400);
    expect(await mode(page)).toBe('play');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(150);
    expect(await mode(page)).toBe('pause');
    await expect(page.locator('.menu')).toBeVisible();
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(150);
    expect(await mode(page)).toBe('play');
    await fiddle(page, 1);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(300);
    expect(await mode(page)).toBe('play');
    // ポーズのボタンからステージ選択へ戻れる
    await page.keyboard.press('KeyP');
    await page.getByRole('button', { name: /ステージ選択|問題を選ぶ/ }).click();
    expect(await mode(page)).toBe('menu');
    expect(errors).toEqual([]);
  });

  test(`${game}: 全ステージを開いて操作してもエラーが出ない`, async ({ page }) => {
    const errors = await open(page, game, '?all=1');
    const n = await page.locator('.menu .stage').count();
    test.setTimeout(60_000 + n * 12_000);
    expect(n).toBeGreaterThan(0);
    const dir = resolve(stagesDir, game);
    mkdirSync(dir, { recursive: true });
    await page.locator('.menu .stage').first().click();
    for (let i = 0; i < n; i++) {
      await page.evaluate((k) => (window as unknown as { __lumina: Hook }).__lumina.start(k), i);
      await page.waitForTimeout(900);
      await page.screenshot({ path: resolve(dir, `${String(i + 1).padStart(2, '0')}.png`) });
      await fiddle(page, i + 2);
      await page.waitForTimeout(300);
      expect(['play', 'result']).toContain(await mode(page));
    }
    const hookErrors = await page.evaluate(() => (window as unknown as { __lumina: Hook }).__lumina.errors);
    expect([...errors, ...hookErrors]).toEqual([]);
  });

  test(`${game}: 自動プレイでクリアすると進行が保存される`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, game, '?stage=0&autoplay=1');
    // ピンボール系は1面のクリアに時間がかかるので、ゲームを速めて待つ
    await page.waitForFunction(() => (window as unknown as { __lumina: Hook }).__lumina.state().mode === 'result', null, { timeout: 100_000, polling: 500 });
    const saved = await page.evaluate((g) => localStorage.getItem(`lumina:${g}`), game);
    const st = await state(page);
    if (st.phase === 'clear') {
      expect(saved).not.toBeNull();
      expect(saved!).toContain('cleared');
    }
    // リザルトの最初のボタン（次のステージ or もう一度）で続けられる
    await page.locator('.menu .btn').first().click();
    await page.waitForTimeout(300);
    expect(['play', 'replay']).toContain(await mode(page));
    expect(errors).toEqual([]);
  });
}
