import { expect, test } from '@playwright/test';

// What the app refuses: other origins, browsers without a game's token,
// and input it doesn't expect.

const game = { location: 'Zurich', gameMode: '1-10', name: 'xa, xb, xc, xd' };

test('pages confine themselves to this origin', async ({ request }) => {
  const res = await request.get('/');
  const headers = res.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
});

test('a form posted from another site is refused', async ({ request }) => {
  const res = await request.post('/games', {
    form: game,
    headers: { 'Sec-Fetch-Site': 'cross-site' },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
});

test('the token cookie is out of reach of scripts and other sites', async ({ request }) => {
  const res = await request.post('/games', { form: game, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const cookie = res.headers()['set-cookie'];
  expect(cookie).toMatch(/^__Host-game-/);
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Strict');
});

test('a browser without the token changes nothing', async ({ page, playwright, baseURL }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Shortsign of 4 players/).fill('ya, yb, yc, yd');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(/\/matches\/[^/]+$/);
  const match = page.url();

  const stranger = await playwright.request.newContext({ baseURL });
  for (const [path, form] of [['/goals', { player: 'ya' }], ['/undo', {}], ['/abort', {}]] as const) {
    const res = await stranger.post(match + path, { form, maxRedirects: 0 });
    expect(res.status(), path).toBe(403);
  }
  await stranger.dispose();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('0 : 0');
});

test("input the app doesn't expect is refused", async ({ page, request }) => {
  const bad = [
    { ...game, name: 'xa, xb, xc' },
    { ...game, name: 'xa, xb, xc, xa' },
    { ...game, name: 'xa, xb, xc, <script>' },
    { ...game, location: 'Mars' },
    { ...game, gameMode: '2-7' },
  ];
  for (const form of bad) {
    const res = await request.post('/games', { form, maxRedirects: 0 });
    expect(res.status(), JSON.stringify(form)).toBe(400);
  }

  // The browser that started the game names a player outside the match.
  await page.goto('/');
  await page.getByPlaceholder(/Shortsign of 4 players/).fill('za, zb, zc, zd');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(/\/matches\/[^/]+$/);
  const outsider = await page.evaluate(async (url) => {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ player: 'xa' }) });
    return res.status;
  }, `${page.url()}/goals`);
  expect(outsider).toBe(400);

  const large = await request.post('/games', { form: { ...game, name: 'x'.repeat(10_000) }, maxRedirects: 0 });
  expect(large.status()).toBe(400);
});

test('only the static files are served from /static', async ({ request }) => {
  expect((await request.get('/static/app.js')).status()).toBe(200);
  expect((await request.get('/static/new.html')).status()).toBe(404);
  expect((await request.get('/static/../main.go')).status()).toBe(404);
});

test('health checks the database', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe('ok');
});
