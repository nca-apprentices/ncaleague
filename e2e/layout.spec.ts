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

test('the scoreboard scales with the screen', async ({ page }) => {
  await startGame(page, 'sca, scb, scc, scd');
  const size = async (width: number, height: number): Promise<{ score: number; tile: number }> => {
    await page.setViewportSize({ width, height });
    return page.evaluate(() => ({
      score: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
      tile: document.querySelector('.tile')!.getBoundingClientRect().width,
    }));
  };
  const phone = await size(390, 844);
  const kiosk = await size(1920, 1080);
  expect(kiosk.score).toBeGreaterThan(phone.score * 2);
  expect(kiosk.tile).toBeGreaterThan(phone.tile * 2);
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

// The app runs on kiosks of any size, so no page may need scrolling.
// Live is left out: other tests leave more games running than any
// screen holds.
test('no page needs scrolling on any screen', async ({ page }) => {
  await startGame(page, 'nsa, nsb, nsc, nsd');
  const match = page.url();
  for (let n = 0; n < 10; n++) {
    await page.getByRole('button', { name: 'nsa' }).click();
  }
  await page.waitForURL(/\/summary$/);
  const summary = page.url();

  // A running game puts a shorter row above the finished game's taller
  // one, so the lists hold rows of two heights.
  await startGame(page, 'nse, nsf, nsg, nsh');

  // A list settles with one reload at most, whatever the rows' heights.
  const loads: string[] = [];
  page.on('request', (req) => {
    if (req.isNavigationRequest()) {
      loads.push(new URL(req.url()).pathname);
    }
  });

  // Phones, tablets upright, wide, and square, a laptop, and a kiosk.
  const sizes = [
    [390, 844], [844, 390], [768, 1024], [1024, 768], [1024, 600], [1180, 820], [1366, 1024],
    [800, 800], [1024, 1024], [1280, 800], [1920, 1080],
  ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const path of ['/', match, summary, '/games', '/ranking']) {
      loads.length = 0;
      await page.goto(path);
      if (path === '/games' || path === '/ranking') {
        await page.locator('table[data-fitted]').waitFor();
        expect(loads.length, `${width}x${height} ${path} loads`).toBeLessThanOrEqual(2);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
      expect(overflow, `${width}x${height} ${path}`).toBe(0);
    }
  }
});

// Other tests leave games running, so this checks the first row only.
test('two live games fit a tablet side by side', async ({ page }) => {
  await startGame(page, 'tla, tlb, tlc, tld');
  await startGame(page, 'tle, tlf, tlg, tlh');
  const tablets = [[1024, 768], [1024, 600], [1180, 820], [1366, 1024], [800, 800], [1024, 1024]];
  for (const [width, height] of tablets) {
    await page.setViewportSize({ width, height });
    await page.goto('/live');
    const [a, b] = await page.locator('.boards a').evaluateAll((boards) => boards.map((board) => board.getBoundingClientRect()));
    expect(b.y, `${width}x${height}`).toBe(a.y);
    expect(Math.max(a.bottom, b.bottom), `${width}x${height}`).toBeLessThanOrEqual(height);
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
