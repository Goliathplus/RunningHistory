// 以真實瀏覽器（軟體 WebGL）驗證核心流程。用法：npm run build && npm run test:e2e
// 可用 CHROME_PATH 指定瀏覽器路徑。
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell`,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const year = () => page.getByTestId('year').textContent();
const count = () => page.getByTestId('count').textContent();
const open = async (query) => {
  await page.goto(`${BASE}?${query}`);
  await page.waitForSelector('.loading', { state: 'detached', timeout: 120000 });
};
const drawnCount = () => page.getByTestId('globe').evaluate((el) => (el.dataset.drawn ? el.dataset.drawn.split(',').length : 0));
const settle = async (expected) => page.waitForFunction(
  (n) => { const d = document.querySelector('[data-testid=globe]').dataset.drawn; return d !== undefined && (d ? d.split(',').length : 0) === n; },
  expected, { timeout: 60000 },
);
const nOf = (text) => Number(text.match(/\d+/)[0]);
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

try {
  await check('資料空白年代不繪製任何疆域', async () => {
    await open('year=-3450&paused');
    assert.equal(await year(), '西元前 3450 年');
    assert.equal(await count(), '超出資料範圍');
    await page.waitForTimeout(800);
    assert.equal(await drawnCount(), 0);
    assert.match(await page.getByTestId('notice').textContent(), /資料空白/);
    await page.screenshot({ path: `${SHOTS}/gap.png` });
  });

  await check('最早資料為蘇美城邦', async () => {
    await open('year=-3400&paused');
    await settle(1);
    assert.equal(nOf(await count()), 1);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/sumer.png` });
  });

  await check('拖曳時間軸會暫停並更新年份', async () => {
    const box = await page.locator('.scrubber').boundingBox();
    await page.mouse.click(box.x + box.width * 0.42, box.y + box.height / 2);
    await page.waitForTimeout(300);
    assert.match(await year(), /西元/);
    assert.notEqual(await year(), '西元前 3400 年');
  });

  await check('方向鍵跨越紀元時略過 0 年', async () => {
    await open('year=-5&paused');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    assert.equal(await year(), '西元 6 年');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    assert.equal(await year(), '西元前 5 年');
  });

  await check('播放、暫停與調速', async () => {
    await open('year=1000&paused');
    await page.getByRole('button', { name: '25', exact: true }).click();
    await page.getByTestId('play').click();
    await page.waitForTimeout(2000);
    await page.getByTestId('play').click();
    const stopped = await year();
    assert.ok(!stopped.includes('前') && nOf(stopped) > 1000, `實際 ${stopped}`);
    await page.waitForTimeout(500);
    assert.equal(await year(), stopped);
  });

  await check('點擊政權顯示名稱與年代', async () => {
    await open('year=1900&paused');
    await page.waitForFunction(() => document.querySelector('[data-testid=globe]').dataset.drawn, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    const g = await page.getByTestId('globe').boundingBox();
    await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
    await page.waitForSelector('.card', { timeout: 15000 });
    const name = await page.locator('.card h2').textContent();
    const text = await page.locator('.card').textContent();
    assert.ok(name.length > 0);
    assert.match(text, /此疆域紀錄適用/);
    console.log('      選到：', name);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/selected-1900.png` });
  });

  await check('旋轉與縮放不會誤判為點擊', async () => {
    await page.locator('.card-close').click();
    await page.mouse.move(720, 400);
    await page.mouse.down();
    await page.mouse.move(600, 380, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.card').count(), 0);
  });

  await check('資料來源說明可開啟', async () => {
    await page.getByRole('button', { name: '資料來源與不確定性' }).click();
    await page.waitForSelector('dialog[open]');
    assert.match(await page.locator('dialog').textContent(), /CC BY 4\.0/);
    await page.screenshot({ path: `${SHOTS}/sources.png` });
    await page.locator('dialog .card-close').click();
  });

  await check('語言切換：介面、年份與政權名稱', async () => {
    await open('year=117&paused');
    const select = page.getByTestId('lang');
    await select.selectOption('en');
    assert.equal(await year(), '117 CE');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.waitForFunction(() => [...document.querySelectorAll('.globe-label')].some((e) => e.textContent === 'Roman Empire'), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/english.png` });
    await select.selectOption('zh-Hant');
    assert.equal(await year(), '西元 117 年');
    await page.waitForFunction(() => [...document.querySelectorAll('.globe-label')].some((e) => e.textContent === '羅馬帝國'), null, { timeout: 30000 });
    await page.reload();
    await page.waitForSelector('.loading', { state: 'detached', timeout: 120000 });
    assert.equal(await year(), '西元 117 年');
  });

  for (const [y, file] of [[117, 'rome'], [1279, 'mongol'], [1914, 'wwi'], [2024, 'modern']]) {
    await open(`year=${y}&paused`);
    await page.waitForFunction(() => document.querySelector('[data-testid=globe]').dataset.drawn, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/${file}.png` });
    console.log(`  截圖 ${y}：${await count()}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await open('year=1500&paused');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/mobile.png` });

  assert.deepEqual(errors, []);
  console.log(`通過 ${passed} 項，瀏覽器無錯誤`);
} catch (e) {
  console.error('失敗：', e.message, errors);
  await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
