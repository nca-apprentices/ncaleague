import { expect, test } from '@playwright/test';

// What keeps the pages fast: files the browser caches for good, and a
// small fragment for the live games.

test('pages link static files by content, and browsers keep them', async ({ page, request }) => {
  await page.goto('/');
  const script = await page.locator('script[type=module]').getAttribute('src');
  expect(script).toMatch(/^\/static\/app\.js\?v=[0-9a-f]{12}$/);

  const res = await request.get(script!);
  expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});

test('Live polls the boards alone', async ({ request }) => {
  const res = await request.get('/live/boards');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-store');
  expect(await res.text()).not.toContain('<html');
});

test('pages fetch nothing from other origins and no images', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (req) => requests.push(req.url()));

  await page.goto('/');
  await page.getByPlaceholder(/Shortsign of 4 players/).fill('ia, ib, ic, id');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(/\/matches\/[^/]+$/);
  await page.goto('/ranking');
  await page.goto('/games');

  expect(requests.filter((url) => !url.startsWith(baseURL!))).toEqual([]);
  expect(requests.filter((url) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(url))).toEqual([]);
});
