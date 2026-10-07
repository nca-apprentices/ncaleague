import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import {
  createNewMatch,
  createNewGoal,
  createNewPlayer,
  getAllPlayers,
  getMatchByIdAndReturnWithNames,
  undoGoalAndReturnScore,
  calculateWinRates,
  getAllMatchesAndWinningTeams,
  goToLastMatch,
  getAllLiveMatchesService,
  calculatePlayerScoresByMatchId,
  abortGame,
  getMatchesOfGame,
  isDatabaseReachable,
} from 'src/service';
import { getGoalsByMatchId, getMatchById, getMatchesByGameIdList } from 'src/repository/GameRepository';
import { getMaxScoreCount } from 'src/gameUtils';
import { mayAbortMatch, mayChangeGame, mayChangeMatch } from 'src/gameControl';
import { logger } from 'src/logger';

const apiPrefix = '/api';
const GAME_TOKEN_HEADER = 'X-Game-Token';
const HEALTH_PATH = `${apiPrefix}/health`;

const app = new Hono<{ Variables: RequestIdVariables }>();

// Every response carries an X-Request-Id, and every log line about the
// request carries the same ID.
app.use('*', requestId());

// One line per request. The probes call health every few seconds, so it
// stays out.
app.use('*', async (c, next) => {
  const start = performance.now();
  await next();
  if (c.req.path === HEALTH_PATH) {
    return;
  }
  logger.info(
    {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    },
    'request',
  );
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  logger.error({ err: error, requestId: c.get('requestId'), method: c.req.method, path: c.req.path }, 'request failed');
  return c.text('Internal Server Error', 500);
});

app.use(
  '*',
  cors({
    origin: ['http://localhost:5173'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE'],
    maxAge: 600,
    credentials: true,
  }),
);

app.get(HEALTH_PATH, async (c) => {
  if (await isDatabaseReachable()) {
    return c.json({ status: 'ok' }, 200);
  }
  return c.json({ status: 'unavailable' }, 503);
});

app.get(`${apiPrefix}/players`, async (c) => {
  const players = await getAllPlayers();
  return c.json(players, 200);
});

app.get(`${apiPrefix}/matches`, async (c) => {
  const players = await getAllMatchesAndWinningTeams();
  return c.json(players, 200);
});

app.get(`${apiPrefix}/matches/live`, async (c) => {
  const matches = await getAllLiveMatchesService();
  return c.json(matches, 200);
});

app.post(`${apiPrefix}/players`, async (c) => {
  const newPlayer = await c.req.json();
  await createNewPlayer(newPlayer);
  return c.json(204);
});

app.post(`${apiPrefix}/matches`, async (c) => {
  const newMatch = await c.req.json();
  if ('gameId' in newMatch && !(await mayChangeGame(newMatch.gameId, c.req.header(GAME_TOKEN_HEADER)))) {
    return c.body(null, 403);
  }
  const createdMatch = await createNewMatch(newMatch);
  return c.json(createdMatch, 201);
});

app.get(`${apiPrefix}/matches/:id`, async (c) => {
  const matchId = c.req.param('id');
  const match = await getMatchByIdAndReturnWithNames(matchId);
  return c.json(match, 200);
});

app.get(`${apiPrefix}/games/:id/summary`, async (c) => {
  const gameId = c.req.param("id");
  const allMatchesOfGame = await getMatchesOfGame(gameId);
  if (allMatchesOfGame.length > 0) {
    return c.json(allMatchesOfGame, 200);
  } else {
    return c.body(null, 404);
  }
})

app.delete(`${apiPrefix}/matches/:id`, async (c) => {
  const matchId = c.req.param('id');
  if (!(await mayAbortMatch(matchId, c.req.header(GAME_TOKEN_HEADER)))) {
    return c.body(null, 403);
  }
  if ((await abortGame(matchId)) === 'finished') {
    return c.body(null, 403);
  }
  return c.body(null, 204);
});

app.post(`${apiPrefix}/matches/:id/goals`, async (c) => {
  const matchId = c.req.param('id');
  if (!(await mayChangeMatch(matchId, c.req.header(GAME_TOKEN_HEADER)))) {
    return c.body(null, 403);
  }
  const goal = await c.req.json();
  const scoringPlayer = goal.scoringPlayer;
  const match = await getMatchById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }
  const maxScoreCount = getMaxScoreCount(match.mode);
  const matchWithScores = await getMatchByIdAndReturnWithNames(matchId);
  if (
    matchWithScores.blueScore >= maxScoreCount ||
    matchWithScores.redScore >= maxScoreCount ||
    matchWithScores.status === 'done'
  ) {
    return c.body(null, 403);
  }
  const createdGoal = await createNewGoal(matchId, scoringPlayer);
  return c.json(createdGoal, 201);
});

app.get(`${apiPrefix}/matches/:id/goals`, async (c) => {
  const matchId = c.req.param('id');
  const goals = await getGoalsByMatchId(matchId);
  return c.json(goals, 200);
});

app.post(`${apiPrefix}/matches/:id/goals/undo`, async (c) => {
  const matchId = c.req.param('id');
  if (!(await mayChangeMatch(matchId, c.req.header(GAME_TOKEN_HEADER)))) {
    return c.body(null, 403);
  }
  const currentMatch = await getMatchById(matchId);
  const currentMatchGoals = await getGoalsByMatchId(matchId);

  if (!currentMatch) {
    throw new Error('Match not found');
  }

  const maxScoreCount = getMaxScoreCount(currentMatch.mode);

  let res;

  if (currentMatch && currentMatchGoals && currentMatchGoals.length == 0) {
    const allMatches = await getMatchesByGameIdList([currentMatch.gameId]);
    if (allMatches.length < 2) {
      return c.body(null, 204);
    }
    const lastMatch = await goToLastMatch(currentMatch.gameId);
    res = await undoGoalAndReturnScore(lastMatch.id);
  } else if (currentMatch.status === 'done') {
    return c.body(null, 403);
  } else if (currentMatch && currentMatchGoals && currentMatchGoals.length > 0) {
    const playersAndScores = await calculatePlayerScoresByMatchId(
      [currentMatch.blueDefensive, currentMatch.blueOffensive, currentMatch.redDefensive, currentMatch.redOffensive],
      [matchId],
    );

    let isMatchAlreadyDone: boolean = false;

    playersAndScores.map((player) => {
      if (player.goals >= maxScoreCount) {
        isMatchAlreadyDone = true;
      }
    });

    if (isMatchAlreadyDone) {
      return c.body(null, 403);
    } else {
      res = await undoGoalAndReturnScore(matchId);
    }
  } else {
    throw new Error('Match not Found');
  }

  return c.json(res, 200);
});

app.get(`${apiPrefix}/players/ranking`, async (c) => {
  const players = (await getAllPlayers()) || [];
  const playerNames = players.map((player) => player.name);
  const winRates = await calculateWinRates(playerNames);
  const playersWithWinRates = winRates.map(({ playerName: playerId, winrate }) => {
    const player = players.find((p) => p.name === playerId);
    return { player, winrate };
  });

  return c.json(playersWithWinRates, 200);
});

export default app;
