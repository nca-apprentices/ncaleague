import { expect, test, type Page } from '@playwright/test';

type Positions = { blue: string[]; red: string[] };

// Starts a game from the New Game page and returns the match page's ID.
async function startGame(page: Page, players: string[], mode: string, location = 'Zurich'): Promise<string> {
  await page.goto('/');
  await page.locator('select[name=location]').selectOption(location);
  await page.locator('select[name=gameMode]').selectOption(mode);
  await page.getByPlaceholder(/Shortsign of 4 players/).fill(players.join(', '));
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(/\/matches\/[^/]+$/);
  return page.url().split('/').pop()!;
}

// Team assignment is random, so the tests ask the API who plays where.
async function positions(page: Page, matchId: string): Promise<Positions> {
  const match = await (await page.request.get(`/api/matches/${matchId}`)).json();
  return {
    blue: [match.players.blueOffensive.name, match.players.blueDefensive.name],
    red: [match.players.redOffensive.name, match.players.redDefensive.name],
  };
}

const score = (page: Page) => page.getByRole('heading', { level: 1 });

// Clicks a player's tile and waits for the score to show the goal.
async function goal(page: Page, player: string, expected: string): Promise<void> {
  await page.getByText(player, { exact: true }).click();
  await expect(score(page)).toHaveText(expected);
}

test('a 1-10 game runs from new players to the summary', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Shortsign of 4 players/).fill('ea, eb, ec, ed');
  await expect(page.getByText('Players that are not found will be created on the database')).toBeVisible();

  const matchId = await startGame(page, ['ea', 'eb', 'ec', 'ed'], '1-10', 'Winterthur');
  await expect(score(page)).toHaveText('0 : 0');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Match 1 of 1');

  const { blue, red } = await positions(page, matchId);
  await goal(page, blue[0], '1 : 0');
  await goal(page, red[0], '1 : 1');

  await page.getByRole('button', { name: 'Undo Goal' }).click();
  await expect(score(page)).toHaveText('1 : 0');

  for (let blueGoals = 2; blueGoals <= 9; blueGoals++) {
    await goal(page, blue[1], `${blueGoals} : 0`);
  }
  await page.getByText(blue[1], { exact: true }).click();

  await page.waitForURL(/\/games\/[^/]+\/summary$/);
  await expect(page.getByRole('heading', { name: 'Game Over' })).toBeVisible();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('td').last()).toHaveText('Blue');
});

test('a new match follows the last goal, and undo returns to the last match', async ({ page }) => {
  const firstId = await startGame(page, ['ra', 'rb', 'rc', 'rd'], '3-5');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Match 1 of 3');

  const { blue } = await positions(page, firstId);
  for (let blueGoals = 1; blueGoals <= 4; blueGoals++) {
    await goal(page, blue[0], `${blueGoals} : 0`);
  }
  await page.getByText(blue[0], { exact: true }).click();

  await page.waitForURL((url) => !url.pathname.endsWith(firstId));
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Match 2 of 3');
  await expect(score(page)).toHaveText('0 : 0');

  await page.getByRole('button', { name: 'Undo Goal' }).click();
  await page.waitForURL((url) => url.pathname.endsWith(firstId));
  await expect(score(page)).toHaveText('4 : 0');
});

test('a running game shows on the New Game page and opens from there', async ({ page }) => {
  const matchId = await startGame(page, ['la', 'lb', 'lc', 'ld'], '4-5', 'Winterthur');
  const { blue } = await positions(page, matchId);
  await goal(page, blue[0], '1 : 0');

  await page.goto('/');
  const card = page.getByRole('heading', { name: 'Winterthur 1 : 0' });
  await expect(card).toBeVisible();
  await expect(card.locator('..').getByText('Match 1 of 4')).toBeVisible();

  await card.click();
  await page.waitForURL(`/matches/${matchId}`);
  await expect(score(page)).toHaveText('1 : 0');
});

test('abort deletes the match and returns to New Game', async ({ page }) => {
  const matchId = await startGame(page, ['aa', 'ab', 'ac', 'ad'], '1-10');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Abort Game' }).click();
  await page.waitForURL('/');

  expect((await page.request.get(`/api/matches/${matchId}`)).ok()).toBe(false);
});

test('a rematch starts a new game with the same players', async ({ page }) => {
  const matchId = await startGame(page, ['ma', 'mb', 'mc', 'md'], '1-10');
  const { blue } = await positions(page, matchId);
  for (let blueGoals = 1; blueGoals <= 9; blueGoals++) {
    await goal(page, blue[0], `${blueGoals} : 0`);
  }
  await page.getByText(blue[0], { exact: true }).click();
  await page.waitForURL(/\/summary$/);

  await page.locator('select[name=newGameMode]').selectOption('3-5');
  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.waitForURL((url) => /\/matches\/[^/]+$/.test(url.pathname));
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Match 1 of 3');
  await expect(score(page)).toHaveText('0 : 0');

  const rematch = await positions(page, page.url().split('/').pop()!);
  expect([...rematch.blue, ...rematch.red].sort()).toEqual(['ma', 'mb', 'mc', 'md']);
});

test('ranking and games pages list the results', async ({ page }) => {
  const matchId = await startGame(page, ['ka', 'kb', 'kc', 'kd'], '1-10');
  const { blue, red } = await positions(page, matchId);
  for (let redGoals = 1; redGoals <= 9; redGoals++) {
    await goal(page, red[0], `0 : ${redGoals}`);
  }
  await page.getByText(red[0], { exact: true }).click();
  await page.waitForURL(/\/summary$/);

  await page.getByRole('link', { name: 'Ranking' }).click();
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  const winner = page.getByRole('row').filter({ hasText: red[0] });
  const loser = page.getByRole('row').filter({ hasText: blue[0] });
  await expect(winner.locator('td').last()).toHaveText(/^\d+(\.\d)?%$/);
  const rate = async (row: typeof winner) => parseFloat((await row.locator('td').last().innerText()).replace('%', ''));
  expect(await rate(winner)).toBeGreaterThan(await rate(loser));

  await page.getByRole('link', { name: 'Games' }).click();
  const newest = page.locator('tbody tr').first();
  await expect(newest.locator('td').nth(1)).toHaveText('1-10');
  await expect(newest.locator('td').nth(4)).toHaveText(red[0].toUpperCase());
  await expect(newest.locator('td').last()).toHaveText('Red');
});

// compose.yaml builds the frontend with this version.
test('the navigation bar shows the build version', async ({ page }) => {
  await page.goto('/ranking');
  await expect(page.getByRole('navigation').getByText('v0.0.0-harness', { exact: true })).toBeVisible();
});
