import {
  createGoal,
  createMatch,
  createPlayer,
  deleteGoal,
  findAllMatchesByGameId,
  getGoalsForPlayers,
  getMatchById,
  getPlayerByName,
  listOfPlayers,
  updateMatchStatus,
  getAllMatchesByPlayerNames,
  getAllMatches,
  getAllGoals,
  findNewestMatchByGameId,
  deleteMatch,
  allLiveMatches,
  getGoalsForMatchIds,
  getMatchesByGameIdList,
  getLastGoalsOfAllMatches,
  deleteAllGoalsOfMatch,
  getLastGoalOfMatch,
  findMatchStatus,
  pingDatabase,
} from 'src/repository/GameRepository';
import { logger } from 'src/logger';

import { PlayerConstellation } from 'src/types';
import { Goal, Match, NewMatch, Player, RunningMatch } from 'api/types';
import { determineWinningTeam, getMaxScoreCount, getNumberOfMatches } from 'src/gameUtils';
import { startGame } from 'src/gameControl';

export const getPlayer = async (name: string): Promise<Player | undefined> => {
  const player = await getPlayerByName(name);
  return player;
};

export const createNewMatch = async (
  match:
    | {
        players: string[];
        location: string;
        mode: string;
      }
    | { gameId: string },
): Promise<{
  id: string;
  gameId: string;
  players: {
    blueOffensive: string;
    blueDefensive: string;
    redOffensive: string;
    redDefensive: string;
  };
  blueScore: number;
  redScore: number;
  token?: string;
}> => {
  const startDate = new Date();
  const id = crypto.randomUUID();
  let newMatch: NewMatch;
  let token: string | undefined;
  if ('gameId' in match) {
    const game = await findNewestMatchByGameId(match.gameId);
    newMatch = await createANewMatchInAExistingGame(game.gameId, game.mode, game.id);
  } else {
    const currentGameId = crypto.randomUUID();

    match.players = match.players.map((name) => name.toLowerCase());

    const players = await Promise.all(match.players.map((name) => getPlayer(name).then((player) => player?.name)));

    if (players.some((name) => name === undefined)) {
      throw new Error('Player was not found');
    }

    const playerLocations = await firstMatchPlayerLocation(players.filter((name) => name !== undefined) as string[]);

    const playerConstellation = {
      blueOffensive: playerLocations[0],
      blueDefensive: playerLocations[1],
      redOffensive: playerLocations[2],
      redDefensive: playerLocations[3],
    };

    newMatch = {
      location: match.location,
      status: 'live',
      mode: match.mode,
      id: id,
      gameId: currentGameId,
      startDate: startDate,
      blueOffensive: playerConstellation.blueOffensive,
      blueDefensive: playerConstellation.blueDefensive,
      redOffensive: playerConstellation.redOffensive,
      redDefensive: playerConstellation.redDefensive,
    };
    token = await startGame(currentGameId);
  }

  const matchFromDb = await createMatch(newMatch);

  if (!matchFromDb) {
    throw new Error('Failed to create match in database');
  }

  const blueScore = 0;
  const redScore = 0;

  return {
    id: matchFromDb.id,
    gameId: matchFromDb.gameId,
    players: {
      blueOffensive: matchFromDb.blueOffensive,
      blueDefensive: matchFromDb.blueDefensive,
      redOffensive: matchFromDb.redOffensive,
      redDefensive: matchFromDb.redDefensive,
    },
    blueScore: blueScore,
    redScore: redScore,
    token,
  };
};

export const createNewGoal = async (
  matchId: string,
  player: string,
): Promise<{
  players: {
    blueOffensive: { name: string; score: number };
    blueDefensive: { name: string; score: number };
    redOffensive: { name: string; score: number };
    redDefensive: { name: string; score: number };
  };
  blueScore: number;
  redScore: number;
  matchStatus: string;
  newMatch: boolean;
  gameId: string;
}> => {
  const match = await getMatchById(matchId);
  if (!match) throw new Error('Match does not exist');

  const scoresBeforeGoal = await calculateTeamScores(matchId);

  const maxScoreCount = getMaxScoreCount(match.mode);

  if (scoresBeforeGoal.blueScore >= maxScoreCount || scoresBeforeGoal.redScore >= maxScoreCount) {
    throw new Error('Match already finished');
  }

  const currentDate = new Date();
  await createGoal({
    scoring_player: player,
    match_id: matchId,
    time_stamp: currentDate,
  });

  const { blueScore, redScore } = await calculateTeamScores(matchId);

  const playersAndScores = await calculatePlayerScoresByMatchId(
    [match.blueOffensive, match.blueDefensive, match.redOffensive, match.redDefensive],
    [matchId],
  );

  const blueOffensiveScore = playersAndScores.find((player) => player.scoringPlayer == match.blueOffensive)?.goals;
  const blueDefensiveScore = playersAndScores.find((player) => player.scoringPlayer == match.blueDefensive)?.goals;
  const redOffensiveScore = playersAndScores.find((player) => player.scoringPlayer == match.redOffensive)?.goals;
  const redDefensiveScore = playersAndScores.find((player) => player.scoringPlayer == match.redDefensive)?.goals;

  if (
    blueOffensiveScore == undefined ||
    blueDefensiveScore == undefined ||
    redOffensiveScore == undefined ||
    redDefensiveScore == undefined
  ) {
    throw new Error('Could not find the score.');
  }

  const blueOffensive = { name: match.blueOffensive, score: blueOffensiveScore };
  const blueDefensive = { name: match.blueDefensive, score: blueDefensiveScore };
  const redOffensive = { name: match.redOffensive, score: redOffensiveScore };
  const redDefensive = { name: match.redDefensive, score: redDefensiveScore };

  if (blueScore >= maxScoreCount || redScore >= maxScoreCount) {
    await updateMatchStatus(matchId, 'done');
    const allMatches = await findAllMatchesByGameId(match.gameId);
    const numberOfCompletedMatches = allMatches?.filter((m) => m.status === 'done').length ?? 0;

    const numberOfRequiredMatches: number = getNumberOfMatches(match.mode);

    if (numberOfCompletedMatches === numberOfRequiredMatches) {
      return {
        players: {
          blueOffensive,
          blueDefensive,
          redOffensive,
          redDefensive,
        },
        blueScore: blueScore,
        redScore: redScore,
        matchStatus: 'done',
        newMatch: false,
        gameId: match.gameId,
      };
    }

    return {
      players: {
        blueOffensive,
        blueDefensive,
        redOffensive,
        redDefensive,
      },
      blueScore: blueScore,
      redScore: redScore,
      matchStatus: 'done',
      newMatch: true,
      gameId: match.gameId,
    };
  }

  return {
    players: {
      blueOffensive,
      blueDefensive,
      redOffensive,
      redDefensive,
    },
    blueScore: blueScore,
    redScore: redScore,
    matchStatus: match.status,
    newMatch: false,
    gameId: match.gameId,
  };
};

export const rotatePlayers = (players: string[], numberOfMatches: number): PlayerConstellation => {
  if (numberOfMatches === 1) {
    const playerToRotate = players.splice(2, 1);

    if (playerToRotate) {
      players.unshift(playerToRotate[0]);
    }
  } else if (numberOfMatches === 3) {
    const fixedPlayer = players.splice(1, 1);

    const playerToRotate = players.pop();

    if (playerToRotate && fixedPlayer) {
      players.unshift(fixedPlayer[0]);
      players.unshift(playerToRotate);
    }
  } else {
    const playerToRotate = players.pop();

    if (playerToRotate) {
      players.unshift(playerToRotate);
    }
  }

  return {
    blue_offensive: players[0],
    blue_defensive: players[1],
    red_offensive: players[2],
    red_defensive: players[3],
  };
};

export const createANewMatchInAExistingGame = async (
  gameId: string,
  mode: string,
  currentMatchId: string,
): Promise<{
  id: string;
  gameId: string;
  location: string;
  status: 'live' | 'done';
  mode: string;
  startDate: Date;
  blueOffensive: string;
  blueDefensive: string;
  redOffensive: string;
  redDefensive: string;
}> => {
  const currentMatch = await getMatchById(currentMatchId);
  if (!currentMatch) {
    throw new Error('Current match not found');
  }

  const players = [
    currentMatch.blueOffensive,
    currentMatch.blueDefensive,
    currentMatch.redOffensive,
    currentMatch.redDefensive,
  ];

  const allMatchesByGameId = await findAllMatchesByGameId(currentMatch.gameId);

  const rotatedPlayerPositions = rotatePlayers(players, allMatchesByGameId.length);

  if (
    !rotatedPlayerPositions.blue_offensive ||
    !rotatedPlayerPositions.blue_defensive ||
    !rotatedPlayerPositions.red_offensive ||
    !rotatedPlayerPositions.red_defensive
  ) {
    throw new Error('Player positions are not properly defined');
  }

  const newMatch = {
    location: currentMatch.location,
    status: 'live' as const,
    mode: currentMatch.mode,
    id: crypto.randomUUID(),
    gameId: gameId,
    startDate: new Date(),
    blueOffensive: rotatedPlayerPositions.blue_offensive,
    blueDefensive: rotatedPlayerPositions.blue_defensive,
    redOffensive: rotatedPlayerPositions.red_offensive,
    redDefensive: rotatedPlayerPositions.red_defensive,
  };

  return newMatch;
};

export const undoGoalAndReturnScore = async (
  matchId: string,
): Promise<{
  id: string;
  players: {
    blueOffensive: { name: string; score: number };
    blueDefensive: { name: string; score: number };
    redOffensive: { name: string; score: number };
    redDefensive: { name: string; score: number };
  };
  scoreTeamBlue: number;
  scoreTeamRed: number;
}> => {
  const match = await getMatchById(matchId);

  if (!match) {
    throw new Error('Match does not exist');
  }

  const [goalsTeamBlue, goalsTeamRed] = await Promise.all([
    getGoalsForPlayers([matchId], [match.blueDefensive, match.blueOffensive]),
    getGoalsForPlayers([matchId], [match.redDefensive, match.redOffensive]),
  ]);

  const latestGoalBlue = goalsTeamBlue.length > 0 ? goalsTeamBlue[goalsTeamBlue.length - 1] : null;
  const latestGoalRed = goalsTeamRed.length > 0 ? goalsTeamRed[goalsTeamRed.length - 1] : null;

  if (latestGoalBlue && (!latestGoalRed || latestGoalBlue.timeStamp > latestGoalRed.timeStamp)) {
    await deleteGoal(matchId, latestGoalBlue.scoringPlayer);
  } else if (latestGoalRed) {
    await deleteGoal(matchId, latestGoalRed.scoringPlayer);
  }

  const playersList = [match.blueDefensive, match.blueOffensive, match.redDefensive, match.redOffensive];

  const scoresOfAllPlayers = await calculatePlayerScoresByMatchId(playersList, [match.id]);

  const blueOffensiveAndScore = scoresOfAllPlayers.find((player) => player.scoringPlayer == match.blueOffensive);
  const blueDefensiveAndScore = scoresOfAllPlayers.find((player) => player.scoringPlayer == match.blueDefensive);
  const redOffensiveAndScore = scoresOfAllPlayers.find((player) => player.scoringPlayer == match.redOffensive);
  const redDefensiveAndScore = scoresOfAllPlayers.find((player) => player.scoringPlayer == match.redDefensive);

  const blueOffensiveGoals = blueOffensiveAndScore != undefined ? blueOffensiveAndScore.goals : 0;
  const blueDefensiveGoals = blueDefensiveAndScore != undefined ? blueDefensiveAndScore.goals : 0;
  const redOffensiveGoals = redOffensiveAndScore != undefined ? redOffensiveAndScore.goals : 0;
  const redDefensiveGoals = redDefensiveAndScore != undefined ? redDefensiveAndScore.goals : 0;

  const remainingGoalsTeamBlue = await getGoalsForPlayers([matchId], [match.blueDefensive, match.blueOffensive]);
  const remainingGoalsTeamRed = await getGoalsForPlayers([matchId], [match.redDefensive, match.redOffensive]);

  const scoreTeamBlue = remainingGoalsTeamBlue.length;
  const scoreTeamRed = remainingGoalsTeamRed.length;

  return {
    id: matchId,
    players: {
      blueOffensive: { name: match.blueOffensive, score: blueOffensiveGoals },
      blueDefensive: { name: match.blueDefensive, score: blueDefensiveGoals },
      redOffensive: { name: match.redOffensive, score: redOffensiveGoals },
      redDefensive: { name: match.redDefensive, score: redDefensiveGoals },
    },
    scoreTeamBlue,
    scoreTeamRed,
  };
};

export const createNewPlayer = async (playerData: { name: string }): Promise<Player> => {
  playerData.name = playerData.name.toLowerCase();
  const existingPlayer = await getPlayerByName(playerData.name);
  if (existingPlayer) {
    return existingPlayer;
  }

  if (!playerData.name.trim()) {
    throw new Error('Player is empty');
  }

  const newPlayer = {
    name: playerData.name,
  };
  const createdPlayer = await createPlayer(newPlayer);
  return createdPlayer;
};

export const getAllPlayers = async (): Promise<Player[] | undefined> => {
  const players = await listOfPlayers();
  return players;
};

export const getAllMatchesAndWinningTeams = async (): Promise<Match[]> => {
  const matches = await getAllMatches();
  const winningGoals = await getLastGoalsOfAllMatches();
  return matches.map((match) => {
    const indexOfGoal = winningGoals.findIndex((goal) => goal.matchId == match.id);
    if (match.status == 'live' || indexOfGoal == -1) {
      match.winningTeam = undefined;
    } else if (
      winningGoals[indexOfGoal].scoringPlayer == match.blueDefensive ||
      winningGoals[indexOfGoal].scoringPlayer == match.blueOffensive
    ) {
      match.winningTeam = 'blue';
    } else {
      match.winningTeam = 'red';
    }
    winningGoals.splice(indexOfGoal, 1);
    return match;
  });
};

export const getMatchByIdAndReturnWithNames = async (matchId: string): Promise<RunningMatch> => {
  const matchFromDb = await getMatchById(matchId);

  if (!matchFromDb) {
    throw new Error('Match not found');
  }

  const players = [
    matchFromDb.blueOffensive,
    matchFromDb.blueDefensive,
    matchFromDb.redOffensive,
    matchFromDb.redDefensive,
  ];

  const playerNames = await Promise.all(players.map((name) => getPlayerByName(name)));
  const playerNamesWithNames = playerNames.map((player) => ({
    name: player?.name || 'Unknown',
  }));

  const playersAndScores = await calculatePlayerScoresByMatchId(players, [matchId]);

  const blueOffensiveScore = playersAndScores.find((player) => player.scoringPlayer == players[0])?.goals;
  const blueDefensiveScore = playersAndScores.find((player) => player.scoringPlayer == players[1])?.goals;
  const redOffensiveScore = playersAndScores.find((player) => player.scoringPlayer == players[2])?.goals;
  const redDefensiveScore = playersAndScores.find((player) => player.scoringPlayer == players[3])?.goals;

  if (
    blueOffensiveScore == undefined ||
    blueDefensiveScore == undefined ||
    redOffensiveScore == undefined ||
    redDefensiveScore == undefined
  ) {
    throw new Error('Could not find the score.');
  }

  const { blueScore, redScore } = await calculateTeamScores(matchId);

  const matchesByGameIds = await findAllMatchesByGameId(matchFromDb.gameId);

  const matchOfGame = matchesByGameIds.findIndex((match) => match.id === matchFromDb.id) + 1;

  const matchWithName = {
    id: matchFromDb.id,
    gameId: matchFromDb.gameId,
    location: matchFromDb.location,
    status: matchFromDb.status,
    mode: matchFromDb.mode,
    players: {
      blueOffensive: { name: playerNamesWithNames[0].name, score: blueOffensiveScore },
      blueDefensive: { name: playerNamesWithNames[1].name, score: blueDefensiveScore },
      redOffensive: { name: playerNamesWithNames[2].name, score: redOffensiveScore },
      redDefensive: { name: playerNamesWithNames[3].name, score: redDefensiveScore },
    },
    redScore: redScore,
    blueScore: blueScore,
    matchOfGame: matchOfGame,
    totalMatches: parseInt(matchFromDb.mode.split('-')[0]),
  };

  return matchWithName;
};

export const calculateWinRates = async (
  players?: string[],
): Promise<{ playerName: string; winrate: number; rank: number }[]> => {
  let allMatches: Match[];
  let allGoals: Goal[];

  if (players && players.length > 0) {
    const allPlayerMatches = await Promise.all(players.map((playerName) => getAllMatchesByPlayerNames(playerName)));
    allMatches = allPlayerMatches.flat();

    allGoals = await getGoalsForPlayers(
      allMatches.map((match) => match.id),
      allMatches.flatMap((match) => [match.blueOffensive, match.blueDefensive, match.redOffensive, match.redDefensive]),
    );
  } else {
    allMatches = await getAllMatches();
    allGoals = await getAllGoals();
  }

  const goalsByMatchId = new Map<string, Goal[]>();
  allGoals.forEach((goal) => {
    if (!goalsByMatchId.has(goal.matchId)) {
      goalsByMatchId.set(goal.matchId, []);
    }
    goalsByMatchId.get(goal.matchId)!.push(goal);
  });

  const winRates: Map<string, { wins: number; total: number }> = new Map();

  allMatches.forEach((match) => {
    const goalsInMatch = goalsByMatchId.get(match.id) || [];

    const goalsTeamBlue = goalsInMatch.filter((goal) =>
      [match.blueDefensive, match.blueOffensive].includes(goal.scoringPlayer),
    ).length;

    const goalsTeamRed = goalsInMatch.filter((goal) =>
      [match.redDefensive, match.redOffensive].includes(goal.scoringPlayer),
    ).length;

    const winningTeam = determineWinningTeam(goalsTeamBlue, goalsTeamRed);

    const playersInTeamBlue = [match.blueDefensive, match.blueOffensive];
    const playersInTeamRed = [match.redDefensive, match.redOffensive];

    const teamBlueWon = winningTeam === 'blue';
    const teamRedWon = winningTeam === 'red';

    playersInTeamBlue.forEach((playerName) => {
      const playerStats = winRates.get(playerName) || { wins: 0, total: 0 };
      playerStats.total++;
      if (teamBlueWon) playerStats.wins++;
      winRates.set(playerName, playerStats);
    });

    playersInTeamRed.forEach((playerName) => {
      const playerStats = winRates.get(playerName) || { wins: 0, total: 0 };
      playerStats.total++;
      if (teamRedWon) playerStats.wins++;
      winRates.set(playerName, playerStats);
    });
  });

  let winRateArray: { playerName: string; winrate: number }[];

  const winRateConstant: number = 20;

  let totalWinRate: number = 0;
  let playerCount: number = 0;

  winRates.forEach((value) => {
    if (value.total > 0) {
      totalWinRate += value.wins / value.total;
      playerCount++;
    }
  });

  const averageWinRate = playerCount > 0 ? totalWinRate / playerCount : 0;

  if (players && players.length > 0) {
    winRateArray = players.map((playerName) => {
      const playerStats = winRates.get(playerName) || { wins: 0, total: 0 };
      const winrate =
        playerStats.total === 0
          ? 0
          : Math.round(
              ((playerStats.wins + winRateConstant * averageWinRate) / (playerStats.total + winRateConstant)) *
                100 *
                10,
            ) / 10;
      return { playerName, winrate };
    });
  } else {
    winRateArray = Array.from(winRates.entries()).map(([playerName, stats]) => ({
      playerName,
      winrate:
        stats.total === 0
          ? 0
          : Math.round(((stats.wins + winRateConstant * averageWinRate) / (stats.total + winRateConstant)) * 100 * 10) /
            10,
    }));
  }

  winRateArray.sort((a, b) => b.winrate - a.winrate);

  const resultWithRank = winRateArray.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));

  return resultWithRank;
};

export const getAllLiveMatchesService = async (): Promise<RunningMatch[]> => {
  const liveMatch = await allLiveMatches();
  if (liveMatch.length === 0) {
    return [];
  }

  const goals = await getGoalsForMatchIds(liveMatch.map((match) => match.id));
  const matchesByGameIds = await getMatchesByGameIdList(liveMatch.map((match) => match.gameId));

  return liveMatch.map((match) => {
    const matchGoals = goals.filter((g) => g.matchId === match.id);
    return {
      id: match.id,
      gameId: match.gameId,
      location: match.location,
      status: match.status,
      mode: match.mode,
      players: {
        blueOffensive: {
          name: match.blueOffensive,
          score: matchGoals.filter((g) => g.scoringPlayer === match.blueOffensive).length,
        },
        blueDefensive: {
          name: match.blueDefensive,
          score: matchGoals.filter((g) => g.scoringPlayer === match.blueDefensive).length,
        },
        redOffensive: {
          name: match.redOffensive,
          score: matchGoals.filter((g) => g.scoringPlayer === match.redOffensive).length,
        },
        redDefensive: {
          name: match.redDefensive,
          score: matchGoals.filter((g) => g.scoringPlayer === match.redDefensive).length,
        },
      },
      redScore: matchGoals.filter((g) => [match.redOffensive, match.redDefensive].includes(g.scoringPlayer)).length,
      blueScore: matchGoals.filter((g) => [match.blueOffensive, match.blueDefensive].includes(g.scoringPlayer)).length,
      totalMatches: parseInt(match.mode.split('-')[0]),
      matchOfGame: matchesByGameIds.filter((m) => m.gameId === match.gameId).length,
    };
  });
};

export const firstMatchPlayerLocation = async (players: string[]): Promise<string[]> => {
  const winRates = await calculateWinRates(players);

  const sortedPlayers = winRates.map((player) => player.playerName);

  const bestPlayers = sortedPlayers.slice(0, 2);
  const otherPlayers = sortedPlayers.slice(2, 4);

  // Subtracting 0.5 makes the result either negative or positive, when negative, change the players' location, when positive, keep it same
  const randomizedBestPlayers = bestPlayers.sort(() => Math.random() - 0.5);
  const firstTeam = [randomizedBestPlayers[0]];
  const secondTeam = [randomizedBestPlayers[1]];

  const randomizedOtherPlayers = otherPlayers.sort(() => Math.random() - 0.5);
  firstTeam.push(randomizedOtherPlayers[0]);
  secondTeam.push(randomizedOtherPlayers[1]);

  firstTeam.sort(() => Math.random() - 0.5);
  secondTeam.sort(() => Math.random() - 0.5);

  const rotatedPlayers: string[] = firstTeam.concat(secondTeam);

  return rotatedPlayers;
};

export const calculatePlayerScores = async (playerName: string): Promise<number> => {
  const matches = await getAllMatchesByPlayerNames(playerName);
  const goals = await getGoalsForPlayers(
    matches.map((match) => match.id),
    [playerName],
  );

  return goals.length;
};

export const calculatePlayerScoresByMatchId = async (
  playerNames: string[],
  matchIds: string[],
): Promise<{ scoringPlayer: string; goals: number }[]> => {
  const player1 = playerNames[0];
  const player2 = playerNames[1];
  const player3 = playerNames[2];
  const player4 = playerNames[3];

  const player1Score = await getGoalsForPlayers(matchIds, [player1]);
  const player2Score = await getGoalsForPlayers(matchIds, [player2]);
  const player3Score = await getGoalsForPlayers(matchIds, [player3]);
  const player4Score = await getGoalsForPlayers(matchIds, [player4]);

  const playersAndGoals = [
    { scoringPlayer: player1, goals: player1Score.length },
    { scoringPlayer: player2, goals: player2Score.length },
    { scoringPlayer: player3, goals: player3Score.length },
    { scoringPlayer: player4, goals: player4Score.length },
  ];

  return playersAndGoals;
};

export const calculateTeamScores = async (matchId: string): Promise<{ blueScore: number; redScore: number }> => {
  const match = await getMatchById(matchId);

  if (!match) {
    throw new Error('Match not found');
  }

  const goalsTeamBlue = await getGoalsForPlayers([matchId], [match.blueDefensive, match.blueOffensive]);
  const goalsTeamRed = await getGoalsForPlayers([matchId], [match.redDefensive, match.redOffensive]);

  const blueScore = goalsTeamBlue.length;
  const redScore = goalsTeamRed.length;

  return { blueScore, redScore };
};

export const findAllMatchesByGameIdService = async (gameId: string): Promise<Match[]> => {
  const matches = await findAllMatchesByGameId(gameId);

  if (!matches) {
    throw new Error('Matches not found');
  }

  return matches;
};

export const findLastMatchOfGame = async (matches: Match[]): Promise<Match | undefined> => {
  matches.sort((match1, match2) => {
    return match1.startDate.getTime() - match2.startDate.getTime();
  });

  return matches.pop();
};

export const deleteMatchService = async (matchId: string): Promise<void> => {
  await deleteMatch(matchId);
};

export const goToLastMatch = async (gameId: string): Promise<Match> => {
  const allMatchesWithLive = await findAllMatchesByGameIdService(gameId);

  const currentMatch = await findLastMatchOfGame(allMatchesWithLive);

  if (!currentMatch) {
    throw new Error('Match not found');
  }

  await deleteMatchService(currentMatch.id);

  const allMatchesWithoutLive = await findAllMatchesByGameIdService(gameId);
  const lastMatch = await findLastMatchOfGame(allMatchesWithoutLive);

  if (!lastMatch) {
    throw new Error('Match not found');
  }

  await updateMatchStatus(lastMatch.id, 'live');

  return lastMatch;
};

// Aborts a running match. A finished match is league history, which the
// ranking and the games list depend on, so it stays.
export const abortGame = async (matchId: string): Promise<'aborted' | 'finished'> => {
  if ((await findMatchStatus(matchId)) === 'done') {
    return 'finished';
  }

  await deleteAllGoalsOfMatch(matchId);
  await deleteMatch(matchId);
  return 'aborted';
};

export const getMatchesOfGame = async (gameId: string): Promise<Match[]> => {
  try {
    const matchesOfGame = await findAllMatchesByGameId(gameId);

    return await Promise.all(
      matchesOfGame.map(async (match) => {
        const winningGoal = await getLastGoalOfMatch(match.id);

        if (winningGoal.scoringPlayer === match.blueDefensive || winningGoal.scoringPlayer === match.blueOffensive) {
          match.winningTeam = 'blue';
        } else {
          match.winningTeam = 'red';
        }
        return match;
      }),
    );
  } catch (error) {
    // A match without goals has no winning goal, so the summary fails and
    // answers 404.
    logger.warn({ err: error, gameId }, 'game summary failed');
    return [];
  }
};

export const isDatabaseReachable = async (): Promise<boolean> => {
  try {
    await pingDatabase();
    return true;
  } catch (error) {
    logger.error({ err: error }, 'database unreachable');
    return false;
  }
};
