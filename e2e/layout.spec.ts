import { expect, type Page, test } from '@playwright/test';

// How the pages fit the screens the league plays on: a phone upright and
// sideways, a tablet, and a laptop.

async function startGame(page: Page, players: string): Promise<void> {
  await page.goto('/');
  await page.locator('select[name=gameMode]').selectOption('1-10');
  await page.getByPlaceholder(/Shortsign of 4 players/).fill(players);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(/\/matches\/[^/]+$/);
}

// The page holds still while the players type: the hints float over it.
test('typing on New Game moves nothing', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  const start = page.getByRole('button', { name: 'Start Game' });
  const before = { main: await main.boundingBox(), start: await start.boundingBox() };

  await page.getByPlaceholder(/Shortsign of 4 players/).fill('ya, yb, ya, yd');
  await expect(page.getByText(/written more than once/)).toBeVisible();
  await page.getByPlaceholder(/Shortsign of 4 players/).fill('ya, yb, yc, yd');
  await expect(page.getByText(/will be created on the database/)).toBeVisible();

  expect(await main.boundingBox()).toEqual(before.main);
  expect(await start.boundingBox()).toEqual(before.start);
});

test('the scoreboard fits a phone held sideways', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await startGame(page, 'lsa, lsb, lsc, lsd');

  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(overflow).toBe(0);
  for (const name of ['Undo Goal', 'Abort Game']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.y + box.height, name).toBeLessThanOrEqual(390);
  }
  for (const name of ['lsa', 'lsb', 'lsc', 'lsd']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.y + box.height, name).toBeLessThanOrEqual(390);
  }
});

test('the tables fit a phone and a tablet without sideways scrolling', async ({ page }) => {
  await startGame(page, 'lta, ltb, ltc, ltd');
  for (let n = 0; n < 10; n++) {
    await page.getByRole('button', { name: 'lta' }).click();
  }
  await page.waitForURL(/\/summary$/);
  const summary = page.url();

  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [summary, '/games', '/ranking']) {
      await page.goto(path);
      const scroll = page.locator('table').evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth);
      expect(await scroll, `${width}px ${path}`).toBe(0);
      await expect(page.locator('tbody tr').first().locator('td').last()).toBeInViewport();
    }
  }
});

test('the live boards sit in the middle of a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startGame(page, 'lwa, lwb, lwc, lwd');
  await page.goto('/live');

  // Other tests leave games running, so the first row may hold several.
  const boxes = await page.locator('.boards a').evaluateAll((boards) => boards.map((b) => b.getBoundingClientRect()));
  const row = boxes.filter((b) => b.y === boxes[0].y);
  const middle = (row[0].x + row[row.length - 1].right) / 2;
  expect(Math.abs(middle - 640)).toBeLessThan(10);
  expect(row[0].width).toBeLessThanOrEqual(384);
});
