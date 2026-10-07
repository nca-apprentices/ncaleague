import { expect, type Locator, type Page, test } from '@playwright/test';

// The suite drives the app through the browser only, so it pins what a
// player sees and does, whatever the implementation behind it.

type Seats = { blueOffense: string; blueDefense: string; redOffense: string; redDefense: string; };

const score = (page: Page) => page.getByRole('heading', { level: 1 });
const matchOf = (page: Page) => page.getByRole('heading', { level: 2 });
const playersInput = (page: Page) => page.getByPlaceholder(/Shortsign of 4 players/);

// Starts a game from the New Game page and returns the match page's ID.
async function startGame(page: Page, players: string[], mode: string, location = 'Zurich'): Promise<string> {
  await page.goto('/');
  await page.locator('select[name=location]').selectOption(location);
  await page.locator('select[name=gameMode]').selectOption(mode);
  await playersInput(page).fill(players.join(', '));
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.waitForURL(/\/matches\/[^/]+$/);
  return page.url().split('/').pop()!;
}

// Reads the seats off the scoreboard. Blue plays on the left, red on the
// right, and defense sits in the top row.
async function seats(page: Page, players: string[]): Promise<Seats> {
  const boxes = await Promise.all(
    players.map(async (name) => ({ name, box: (await page.getByText(name, { exact: true }).boundingBox())! })),
  );
  boxes.sort((a, b) => a.box.y - b.box.y);
  const [top, bottom] = [boxes.slice(0, 2), boxes.slice(2)].map((row) =>
    row.sort((a, b) => a.box.x - b.box.x).map((seat) => seat.name)
  );
  return { blueDefense: top[0], redOffense: top[1], blueOffense: bottom[0], redDefense: bottom[1] };
}

// The board on the Live page of the game the player plays in. Other games
// may be live too.
const board = (page: Page, player: string) =>
  page.getByRole('link').filter({ hasText: new RegExp(`\\b${player.toUpperCase()}\\b`) });
const boardScore = (board: Locator) => board.getByText(/^\d+ : \d+$/);

// Clicks a player's tile and waits for the score to show the goal.
async function goal(page: Page, player: string, expected: string): Promise<void> {
  await page.getByText(player, { exact: true }).click();
  await expect(score(page)).toHaveText(expected);
}

// Scores goals for one player until one goal before the match ends, then
// the last goal, and waits to leave the match page.
async function winMatch(page: Page, player: string, goals: number, blueScores: boolean): Promise<void> {
  const matchUrl = page.url();
  for (let n = 1; n < goals; n++) {
    await goal(page, player, blueScores ? `${n} : 0` : `0 : ${n}`);
  }
  await page.getByText(player, { exact: true }).click();
  await page.waitForURL((url) => url.href !== matchUrl);
}

test.describe('new game', () => {
  test('warns about new players and repeated names, and starts only with four', async ({ page }) => {
    await page.goto('/');
    const start = page.getByRole('button', { name: 'Start Game' });
    await expect(start).toBeDisabled();

    await playersInput(page).fill('na, nb, nc');
    await expect(start).toBeDisabled();

    await playersInput(page).fill('na, nb, nc, na');
    await expect(page.getByText(/written more than once/)).toBeVisible();
    await expect(start).toBeDisabled();

    await playersInput(page).fill('na, nb, nc, nd');
    await expect(page.getByText(/written more than once/)).toHaveCount(0);
    await expect(page.getByText('Players that are not found will be created on the database')).toBeVisible();
    await expect(start).toBeEnabled();
  });

  test('suggests known players and fills in the one clicked', async ({ page }) => {
    await startGame(page, ['sgalpha', 'sgb', 'sgc', 'sgd'], '1-10');

    await page.goto('/');
    await playersInput(page).pressSequentially('sga');
    const suggestion = page.getByRole('listitem').filter({ hasText: 'sgalpha' });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(playersInput(page)).toHaveValue('sgalpha');
  });

  test('accepts names in any case and separated by spaces or commas', async ({ page }) => {
    await startGame(page, ['CA', 'cb', 'cc', 'cd'], '1-10');
    await page.goto('/');
    await playersInput(page).fill('ca cb,cc  cd');
    await expect(page.getByText('Players that are not found will be created on the database')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start Game' }).click();
    await page.waitForURL(/\/matches\/[^/]+$/);
    await expect(score(page)).toHaveText('0 : 0');
  });
});

test('a 1-10 game runs from new players to the summary', async ({ page }) => {
  await startGame(page, ['ea', 'eb', 'ec', 'ed'], '1-10', 'Winterthur');
  await expect(score(page)).toHaveText('0 : 0');
  await expect(matchOf(page)).toHaveText('Match 1 of 1');

  const s = await seats(page, ['ea', 'eb', 'ec', 'ed']);
  await goal(page, s.blueOffense, '1 : 0');
  await goal(page, s.redDefense, '1 : 1');

  await page.getByRole('button', { name: 'Undo Goal' }).click();
  await expect(score(page)).toHaveText('1 : 0');

  for (let blueGoals = 2; blueGoals <= 9; blueGoals++) {
    await goal(page, s.blueDefense, `${blueGoals} : 0`);
  }
  await page.getByText(s.blueDefense, { exact: true }).click();

  await page.waitForURL(/\/games\/[^/]+\/summary$/);
  await expect(page.getByRole('heading', { name: 'Game Over' })).toBeVisible();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(1);
  const cells = rows.first().locator('td');
  await expect(cells).toHaveText([
    '1',
    s.blueOffense.toUpperCase(),
    s.blueDefense.toUpperCase(),
    s.redOffense.toUpperCase(),
    s.redDefense.toUpperCase(),
    'Blue',
  ]);
});

test("undo in a game's first match without goals changes nothing", async ({ page }) => {
  await startGame(page, ['ua', 'ub', 'uc', 'ud'], '3-5');
  await page.getByRole('button', { name: 'Undo Goal' }).click();
  await page.reload();
  await expect(score(page)).toHaveText('0 : 0');
  await expect(matchOf(page)).toHaveText('Match 1 of 3');
});

test('players rotate between the matches of a 4-5 game', async ({ page }) => {
  const players = ['ro1', 'ro2', 'ro3', 'ro4'];
  await startGame(page, players, '4-5');
  const first = await seats(page, players);

  // After the first match, red defense stays and the others move one seat
  // along.
  await winMatch(page, first.blueOffense, 5, true);
  await expect(matchOf(page)).toHaveText('Match 2 of 4');
  await expect(score(page)).toHaveText('0 : 0');
  const second = await seats(page, players);
  expect(second).toEqual({
    blueOffense: first.redOffense,
    blueDefense: first.blueOffense,
    redOffense: first.blueDefense,
    redDefense: first.redDefense,
  });

  // After the second match, everyone moves one seat along.
  await winMatch(page, second.redDefense, 5, false);
  await expect(matchOf(page)).toHaveText('Match 3 of 4');
  const third = await seats(page, players);
  expect(third).toEqual({
    blueOffense: second.redDefense,
    blueDefense: second.blueOffense,
    redOffense: second.blueDefense,
    redDefense: second.redOffense,
  });

  // After the third match, blue defense stays and red defense moves to
  // blue offense.
  await winMatch(page, third.blueDefense, 5, true);
  await expect(matchOf(page)).toHaveText('Match 4 of 4');
  const fourth = await seats(page, players);
  expect(fourth).toEqual({
    blueOffense: third.redDefense,
    blueDefense: third.blueDefense,
    redOffense: third.blueOffense,
    redDefense: third.redOffense,
  });

  await winMatch(page, fourth.redOffense, 5, false);
  await page.waitForURL(/\/summary$/);
  // The old app listed a game's matches in no fixed order.
  await expect(page.locator('tbody tr td:first-child')).toHaveText(['1', '2', '3', '4']);
  const winners = await page.locator('tbody tr td:last-child').allInnerTexts();
  expect(winners.sort()).toEqual(['Blue', 'Blue', 'Red', 'Red']);
});

test('a new match follows the last goal, and undo returns to the last match', async ({ page }) => {
  const firstId = await startGame(page, ['ra', 'rb', 'rc', 'rd'], '3-5');
  await expect(matchOf(page)).toHaveText('Match 1 of 3');

  const s = await seats(page, ['ra', 'rb', 'rc', 'rd']);
  await winMatch(page, s.blueOffense, 5, true);
  await expect(matchOf(page)).toHaveText('Match 2 of 3');
  await expect(score(page)).toHaveText('0 : 0');

  await page.getByRole('button', { name: 'Undo Goal' }).click();
  await page.waitForURL((url) => url.pathname.endsWith(firstId));
  await expect(score(page)).toHaveText('4 : 0');
  await expect(matchOf(page)).toHaveText('Match 1 of 3');

  // The reopened match takes goals again.
  await goal(page, s.redOffense, '4 : 1');
});

test('a running game shows on the Live page and opens from there', async ({ page }) => {
  const matchId = await startGame(page, ['la', 'lb', 'lc', 'ld'], '4-5', 'Winterthur');
  const s = await seats(page, ['la', 'lb', 'lc', 'ld']);
  await goal(page, s.blueOffense, '1 : 0');

  await page.goto('/live');
  await expect(page.getByRole('heading', { name: 'Live Games' })).toBeVisible();
  const live = board(page, s.blueOffense);
  await expect(boardScore(live)).toHaveText('1 : 0');
  await expect(live).toContainText('Winterthur');
  await expect(live).toContainText('Match 1 of 4');
  await expect(live).toContainText(`Last goal: ${s.blueOffense.toUpperCase()}`);

  await live.click();
  await page.waitForURL(`/matches/${matchId}`);
  await expect(score(page)).toHaveText('1 : 0');
});

test('the Live page shows goals as they fall', async ({ page, browser }) => {
  const players = ['wa', 'wb', 'wc', 'wd'];
  await startGame(page, players, '1-10', 'Winterthur');
  const s = await seats(page, players);
  await goal(page, s.redDefense, '0 : 1');

  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const watcher = await context.newPage();
  await watcher.goto('/live');
  const live = boardScore(board(watcher, s.redDefense));
  await expect(live).toHaveText('0 : 1');

  await goal(page, s.redDefense, '0 : 2');
  await expect(live).toHaveText('0 : 2');
  await context.close();
});

test.describe('abort', () => {
  test('deletes the match and returns to New Game', async ({ page }) => {
    const matchId = await startGame(page, ['aa', 'ab', 'ac', 'ad'], '1-10');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Abort Game' }).click();
    await page.waitForURL('/');

    // A match that doesn't exist sends the browser to New Game.
    await page.goto(`/matches/${matchId}`);
    await expect(page).toHaveURL('/');
  });

  test('changes nothing when the confirmation is dismissed', async ({ page }) => {
    const matchId = await startGame(page, ['ba', 'bb', 'bc', 'bd'], '1-10');

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Abort Game' }).click();
    await page.goto(`/matches/${matchId}`);
    await expect(page).toHaveURL(`/matches/${matchId}`);
    await expect(score(page)).toHaveText('0 : 0');
  });
});

test('a rematch starts a new game with the same players', async ({ page }) => {
  const players = ['ma', 'mb', 'mc', 'md'];
  await startGame(page, players, '1-10');
  const s = await seats(page, players);
  await winMatch(page, s.blueOffense, 10, true);
  await page.waitForURL(/\/summary$/);

  await page.locator('select[name=newGameMode]').selectOption('3-5');
  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.waitForURL((url) => /\/matches\/[^/]+$/.test(url.pathname));
  await expect(matchOf(page)).toHaveText('Match 1 of 3');
  await expect(score(page)).toHaveText('0 : 0');

  const rematch = await seats(page, players);
  expect(Object.values(rematch).sort()).toEqual(players);
  await expect(page.getByRole('button', { name: 'Abort Game' })).toBeVisible();
});

test('ranking and games pages list the results', async ({ page }) => {
  const players = ['ka', 'kb', 'kc', 'kd'];
  await startGame(page, players, '1-10');
  const s = await seats(page, players);
  await winMatch(page, s.redOffense, 10, false);
  await page.waitForURL(/\/summary$/);

  await page.getByRole('link', { name: 'Ranking' }).click();
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  await expect(page.locator('thead th')).toHaveText(['Rank', 'Name', 'Winrate']);
  // The ranking shows as many players as fit the screen, a page at a
  // time, so a player may be on a later page.
  const rate = async (name: string): Promise<number> => {
    await page.goto('/ranking');
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
    while ((await row.count()) === 0) {
      await page.getByText('Next', { exact: true }).click();
    }
    const cell = row.locator('td').last();
    await expect(cell).toHaveText(/^\d+(\.\d)?%$/);
    return parseFloat((await cell.innerText()).replace('%', ''));
  };
  expect(await rate(s.redOffense)).toBeGreaterThan(await rate(s.blueOffense));
  expect(await rate(s.redDefense)).toEqual(await rate(s.redOffense));

  // Ranks count from 1 down a list ordered by win rate.
  const ranks = await page.locator('tbody tr td:first-child').allInnerTexts();
  expect(ranks).toEqual(ranks.map((_, i) => `${i + 1}`));
  const rates = (await page.locator('tbody tr td:last-child').allInnerTexts()).map((r) => parseFloat(r));
  expect(rates).toEqual([...rates].sort((a, b) => b - a));

  await page.getByRole('link', { name: 'Games' }).click();
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  await expect(page.locator('thead th')).toHaveText([
    'Start Date',
    'Mode',
    'Blue Offensive',
    'Blue Defensive',
    'Red Offensive',
    'Red Defensive',
    'Winning Team',
  ]);
  const newest = page.locator('tbody tr').first().locator('td');
  await expect(newest.nth(0)).toHaveText(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  await expect(newest).toHaveText([
    /./,
    '1-10',
    s.blueOffense.toUpperCase(),
    s.blueDefense.toUpperCase(),
    s.redOffense.toUpperCase(),
    s.redDefense.toUpperCase(),
    'Red',
  ]);
});

test('a running match shows as not finished in the games list', async ({ page }) => {
  await startGame(page, ['gna', 'gnb', 'gnc', 'gnd'], '1-10');
  await page.goto('/games');
  const newest = page.locator('tbody tr').first().locator('td');
  await expect(newest.last()).toHaveText('Not finished');
});

test('the navigation bar links the pages and shows the build version', async ({ page }) => {
  await page.goto('/ranking');
  const nav = page.getByRole('navigation');
  // compose.yaml builds the app with this version.
  await expect(nav.getByText('v0.0.0-e2e', { exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Games' }).click();
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  await nav.getByRole('link', { name: 'Live' }).click();
  await expect(page.getByRole('heading', { name: 'Live Games' })).toBeVisible();
  await nav.getByRole('link', { name: 'New Game' }).click();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();
});

test('another browser watches a game but cannot change it', async ({ page, browser }) => {
  const players = ['va', 'vb', 'vc', 'vd'];
  const matchId = await startGame(page, players, '1-10');

  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const viewer = await context.newPage();
  await viewer.goto(`/matches/${matchId}`);
  await expect(score(viewer)).toHaveText('0 : 0');
  await expect(viewer.getByText('Only the device that started this game can change it.')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Undo Goal' })).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Abort Game' })).toHaveCount(0);

  await viewer.getByText('va', { exact: true }).click();
  await context.close();

  // The starting browser keeps control after a reload, and the viewer's
  // click scored nothing.
  await page.reload();
  await expect(score(page)).toHaveText('0 : 0');
  await expect(page.getByRole('button', { name: 'Abort Game' })).toBeVisible();
  await expect(page.getByText('Only the device that started this game can change it.')).toHaveCount(0);
});

// Runs last: it leaves more than a page of running matches behind.
test('the games list pages by the matches that fit the screen', async ({ page }) => {
  for (let n = 0; n < 21; n++) {
    await startGame(page, [`p${n}a`, `p${n}b`, `p${n}c`, `p${n}d`], '1-10');
  }

  await page.goto('/games');
  const table = page.locator('table[data-fitted]');
  await table.waitFor();
  const rows = Number(await table.getAttribute('data-rows'));
  expect(rows).toBeLessThanOrEqual(20);
  await expect(page.locator('tbody tr')).toHaveCount(rows);
  await expect(page.locator('tbody tr').first().locator('td').nth(2)).toHaveText(/^P20/);
  await page.getByText('Next', { exact: true }).click();
  await expect(page.locator('tbody tr').first().locator('td').nth(2)).toHaveText(new RegExp(`^P${20 - rows}[A-D]$`));
  await page.getByText('Previous', { exact: true }).click();
  await expect(page.locator('tbody tr').first().locator('td').nth(2)).toHaveText(/^P20/);
});
