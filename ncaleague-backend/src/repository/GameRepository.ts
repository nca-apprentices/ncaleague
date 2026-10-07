import { db } from 'src/database';
import { NotFoundError } from 'src/errors';
import { sql } from 'kysely';
import { NewGoal } from 'src/types';
import { Goal, Match, NewMatch, Player, NewPlayer } from 'api/types';

export const findMatchById = async (id: string): Promise<Match | undefined> => {
  const dbMatch = await db.selectFrom('matches').where('id', '=', id).selectAll().executeTakeFirst();

  if (!dbMatch) throw new Error('Match does not exist');

  const match: Match = {
    location: dbMatch.location,
    status: dbMatch.status,
    mode: dbMatch.mode,
    id: dbMatch.id,
    gameId: dbMatch.game_id,
    startDate: dbMatch.start_date,
    blueOffensive: dbMatch.blue_offensive,
    blueDefensive: dbMatch.blue_defensive,
    redOffensive: dbMatch.red_offensive,
    redDefensive: dbMatch.red_defensive,
    winningTeam: dbMatch.winningTeam,
  };

  return match;
};

export const findNewestMatchByGameId = async (gameId: string): Promise<Match> => {
  const dbMatch = await db
    .selectFrom('matches')
    .where('game_id', '=', gameId)
    .orderBy('start_date', 'desc')
    .limit(1)
    .selectAll()
    .executeTakeFirstOrThrow(() => new NotFoundError(`Game ${gameId} not found`));

  const match: Match = {
    location: dbMatch.location,
    status: dbMatch.status,
    mode: dbMatch.mode,
    id: dbMatch.id,
    gameId: dbMatch.game_id,
    startDate: dbMatch.start_date,
    blueOffensive: dbMatch.blue_offensive,
    blueDefensive: dbMatch.blue_defensive,
    redOffensive: dbMatch.red_offensive,
    redDefensive: dbMatch.red_defensive,
    winningTeam: dbMatch.winningTeam,
  };

  return match;
};

export const createMatch = async (newMatch: NewMatch): Promise<Match | undefined> => {
  const dbNewMatch = {
    location: newMatch.location,
    status: newMatch.status,
    mode: newMatch.mode,
    id: newMatch.id,
    game_id: newMatch.gameId,
    start_date: newMatch.startDate,
    blue_offensive: newMatch.blueOffensive,
    blue_defensive: newMatch.blueDefensive,
    red_offensive: newMatch.redOffensive,
    red_defensive: newMatch.redDefensive,
    winningTeam: newMatch.winningTeam,
  };

  const dbMatch = await db.insertInto('matches').values(dbNewMatch).returningAll().executeTakeFirstOrThrow();

  if (!dbMatch) throw new Error('Match does not exist');

  const createdMatch: Match = {
    location: dbMatch.location,
    status: dbMatch.status,
    mode: dbMatch.mode,
    id: dbMatch.id,
    gameId: dbMatch.game_id,
    startDate: dbMatch.start_date,
    blueOffensive: dbMatch.blue_offensive,
    blueDefensive: dbMatch.blue_defensive,
    redOffensive: dbMatch.red_offensive,
    redDefensive: dbMatch.red_defensive,
    winningTeam: dbMatch.winningTeam,
  };

  return createdMatch;
};

export const getPlayerByName = async (name: string): Promise<Player | undefined> => {
  return await db.selectFrom('players').where('name', '=', name).selectAll().executeTakeFirst();
};

export const createPlayer = async (player: NewPlayer): Promise<Player> => {
  return await db.insertInto('players').values(player).returningAll().executeTakeFirstOrThrow();
};

export const createGoal = async (goal: NewGoal): Promise<Goal> => {
  const dbCreatedGoal = await db.insertInto('goals').values(goal).returningAll().executeTakeFirstOrThrow();

  const createdGoal: Goal = {
    matchId: dbCreatedGoal.match_id,
    scoringPlayer: dbCreatedGoal.scoring_player,
    timeStamp: dbCreatedGoal.time_stamp,
  };

  const match = await getMatchById(goal.match_id);
  if (!match) throw new Error('Match does not exist');

  return createdGoal;
};

export const listOfPlayers = async (): Promise<Player[] | undefined> => {
  return await db.selectFrom('players').selectAll().execute();
};

export const getMatchById = async (matchId: string): Promise<Match | undefined> => {
  const dbMatch = await db
    .selectFrom('matches')
    .where('id', '=', matchId)
    .selectAll()
    .executeTakeFirstOrThrow(() => new NotFoundError(`Match ${matchId} not found`));

  if (!dbMatch) throw new Error('Match does not exist');

  const match: Match = {
    location: dbMatch.location,
    status: dbMatch.status,
    mode: dbMatch.mode,
    id: dbMatch.id,
    gameId: dbMatch.game_id,
    startDate: dbMatch.start_date,
    blueOffensive: dbMatch.blue_offensive,
    blueDefensive: dbMatch.blue_defensive,
    redOffensive: dbMatch.red_offensive,
    redDefensive: dbMatch.red_defensive,
    winningTeam: dbMatch.winningTeam,
  };

  return match;
};

export const allLiveMatches = async (): Promise<Match[]> => {
  const dbMatches = await db.selectFrom('matches').where('status', '=', 'live').selectAll().execute();

  const matches: Match[] = dbMatches.map((match) => ({
    location: match.location,
    status: match.status,
    mode: match.mode,
    id: match.id,
    gameId: match.game_id,
    startDate: match.start_date,
    blueOffensive: match.blue_offensive,
    blueDefensive: match.blue_defensive,
    redOffensive: match.red_offensive,
    redDefensive: match.red_defensive,
    winningTeam: match.winningTeam,
  }));

  return matches;
};

export const getMatchesByGameIdList = async (gameIdList: string[]): Promise<Match[]> => {
  const dbMatches = await db.selectFrom('matches').where('game_id', 'in', gameIdList).selectAll().execute();

  const matches: Match[] = dbMatches.map((match) => ({
    location: match.location,
    status: match.status,
    mode: match.mode,
    id: match.id,
    gameId: match.game_id,
    startDate: match.start_date,
    blueOffensive: match.blue_offensive,
    blueDefensive: match.blue_defensive,
    redOffensive: match.red_offensive,
    redDefensive: match.red_defensive,
    winningTeam: match.winningTeam,
  }));

  return matches;
};

export const getGoalsByMatchId = async (matchId: string): Promise<Goal[] | undefined> => {
  const dbGoals = await db.selectFrom('goals').where('goals.match_id', '=', matchId).selectAll().execute();

  const goals: Goal[] = dbGoals.map((goal) => ({
    matchId: goal.match_id,
    scoringPlayer: goal.scoring_player,
    timeStamp: goal.time_stamp,
  }));

  return goals;
};

export const getGoalsForMatchIds = async (matchIds: string[]): Promise<Goal[]> => {
  const dbGoals = await db.selectFrom('goals').where('match_id', 'in', matchIds).selectAll().execute();

  const goals: Goal[] = dbGoals.map((goal) => ({
    matchId: goal.match_id,
    scoringPlayer: goal.scoring_player,
    timeStamp: goal.time_stamp,
  }));

  return goals;
};

export const getLastGoalOfMatch = async (matchId: string): Promise<Goal> => {
  const dbGoal = await db
    .selectFrom('goals')
    .orderBy('goals.time_stamp', 'desc')
    .where('goals.match_id', '=', matchId)
    .selectAll()
    .executeTakeFirst();

  if (!dbGoal) {
    throw new Error('Failed to fetch the last goal of the match');
  }

  const goal: Goal = {
    scoringPlayer: dbGoal.scoring_player,
    matchId: dbGoal.match_id,
    timeStamp: dbGoal.time_stamp,
  };

  return goal;
};

export const getLastGoalsOfAllMatches = async (): Promise<Goal[]> => {
  const dbGoals = await db
    .selectFrom('goals')
    .distinctOn('goals.match_id')
    .orderBy('goals.match_id')
    .orderBy('goals.time_stamp', 'desc')
    .selectAll()
    .execute();

  const goals: Goal[] = dbGoals.map((goal) => ({
    matchId: goal.match_id,
    scoringPlayer: goal.scoring_player,
    timeStamp: goal.time_stamp,
  }));

  return goals;
};

export const deleteAllGoalsOfMatch = async (matchId: string): Promise<void> => {
  await db.deleteFrom('goals').where('match_id', '=', matchId).execute();
};

export const deleteGoal = async (matchId: string, scoringPlayer: string): Promise<void> => {
  const latestGoal = await db
    .selectFrom('goals')
    .select(['scoring_player', 'time_stamp'])
    .where('match_id', '=', matchId)
    .where('scoring_player', '=', scoringPlayer)
    .orderBy('time_stamp', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (latestGoal) {
    await db
      .deleteFrom('goals')
      .where('match_id', '=', matchId)
      .where('scoring_player', '=', scoringPlayer)
      .where('time_stamp', '=', latestGoal.time_stamp)
      .execute();
  }
};

export const getGoalsForPlayers = async (matchId: string[], playerIds: string[]): Promise<Goal[]> => {
  // SQL rejects an empty IN list.
  if (matchId.length === 0 || playerIds.length === 0) {
    return [];
  }

  const dbGoals = await db
    .selectFrom('goals')
    .where('scoring_player', 'in', playerIds)
    .where('match_id', 'in', matchId)
    .selectAll()
    .execute();

  const goals: Goal[] = dbGoals.map((goal) => ({
    matchId: goal.match_id,
    scoringPlayer: goal.scoring_player,
    timeStamp: goal.time_stamp,
  }));

  return goals;
};

export const updateMatchStatus = async (matchId: string, newStatus: 'live' | 'done'): Promise<void> => {
  await db
    .updateTable('matches')
    .set({
      status: newStatus,
    })
    .where('id', '=', matchId)
    .execute();
};

// In the order played.
export const findAllMatchesByGameId = async (gameId: string): Promise<Match[]> => {
  const dbMatches = await db
    .selectFrom('matches')
    .where('game_id', '=', gameId)
    .orderBy('start_date', 'asc')
    .selectAll()
    .execute();

  const matches: Match[] = dbMatches.map((match) => ({
    location: match.location,
    status: match.status,
    mode: match.mode,
    id: match.id,
    gameId: match.game_id,
    startDate: match.start_date,
    blueOffensive: match.blue_offensive,
    blueDefensive: match.blue_defensive,
    redOffensive: match.red_offensive,
    redDefensive: match.red_defensive,
    winningTeam: match.winningTeam,
  }));

  return matches;
};

export const getAllMatchesByPlayerNames = async (playerName: string): Promise<Match[]> => {
  const dbMatches = await db
    .selectFrom('matches')
    .where((eb) =>
      eb.or([
        eb('blue_offensive', '=', playerName),
        eb('blue_defensive', '=', playerName),
        eb('red_offensive', '=', playerName),
        eb('red_defensive', '=', playerName),
      ]),
    )
    .selectAll()
    .execute();

  const matches: Match[] = dbMatches.map((match) => ({
    location: match.location,
    status: match.status,
    mode: match.mode,
    id: match.id,
    gameId: match.game_id,
    startDate: match.start_date,
    blueOffensive: match.blue_offensive,
    blueDefensive: match.blue_defensive,
    redOffensive: match.red_offensive,
    redDefensive: match.red_defensive,
    winningTeam: match.winningTeam,
  }));

  return matches.length > 0 ? matches : [];
};

export const getAllMatches = async (): Promise<Match[]> => {
  const dbMatches = await db.selectFrom('matches').selectAll().orderBy('start_date', 'desc').execute();

  const matches: Match[] = dbMatches.map((match) => ({
    location: match.location,
    status: match.status,
    mode: match.mode,
    id: match.id,
    gameId: match.game_id,
    startDate: match.start_date,
    blueOffensive: match.blue_offensive,
    blueDefensive: match.blue_defensive,
    redOffensive: match.red_offensive,
    redDefensive: match.red_defensive,
    winningTeam: match.winningTeam,
  }));

  return matches;
};

export const getAllGoals = async (): Promise<Goal[]> => {
  const dbGoals = await db.selectFrom('goals').selectAll().execute();

  const goals: Goal[] = dbGoals.map((goal) => ({
    matchId: goal.match_id,
    scoringPlayer: goal.scoring_player,
    timeStamp: goal.time_stamp,
  }));

  return goals;
};

export const findMatchStatus = async (matchId: string): Promise<'live' | 'done' | undefined> => {
  const match = await db.selectFrom('matches').where('id', '=', matchId).select('status').executeTakeFirst();
  return match?.status;
};

export const createGame = async (id: string, tokenHash: string): Promise<void> => {
  await db.insertInto('games').values({ id, token_hash: tokenHash }).execute();
};

// Undefined when the game doesn't exist, null when it predates tokens.
export const findGameTokenHash = async (gameId: string): Promise<string | null | undefined> => {
  const game = await db.selectFrom('games').where('id', '=', gameId).select('token_hash').executeTakeFirst();
  return game?.token_hash;
};

export const findGameIdOfMatch = async (matchId: string): Promise<string | undefined> => {
  const match = await db.selectFrom('matches').where('id', '=', matchId).select('game_id').executeTakeFirst();
  return match?.game_id;
};

// The time of a game's latest goal or match start.
export const findLastActivity = async (gameId: string): Promise<Date | undefined> => {
  const [matchStart, goal] = await Promise.all([
    db
      .selectFrom('matches')
      .where('game_id', '=', gameId)
      .select((eb) => eb.fn.max('start_date').as('last'))
      .executeTakeFirst(),
    db
      .selectFrom('goals')
      .innerJoin('matches', 'matches.id', 'goals.match_id')
      .where('matches.game_id', '=', gameId)
      .select((eb) => eb.fn.max('goals.time_stamp').as('last'))
      .executeTakeFirst(),
  ]);
  const times = [matchStart?.last, goal?.last].filter((time): time is Date => time instanceof Date);
  return times.length > 0 ? new Date(Math.max(...times.map((time) => time.getTime()))) : undefined;
};

export const pingDatabase = async (): Promise<void> => {
  await sql`SELECT 1`.execute(db);
};

export const deleteMatch = async (matchId: string): Promise<void> => {
  await db.deleteFrom('matches').where('id', '=', matchId).execute();
};
