import { expect, test } from '@playwright/test';

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
