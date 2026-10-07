import { createHash, randomBytes } from 'node:crypto';
import { createGame, findGameIdOfMatch, findGameTokenHash, findLastActivity } from 'src/repository/GameRepository';

// Only the holder of a game's token, the browser that started it, may
// change the game. After this long without a goal or a new match, anyone
// may abort it, so a lost browser can't keep it live.
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

// Stores a new game and returns its token. Only the token's hash is stored.
export const startGame = async (gameId: string): Promise<string> => {
  const token = randomBytes(32).toString('base64url');
  await createGame(gameId, hash(token));
  return token;
};

export const isAbandoned = (lastActivity: Date, now: Date): boolean =>
  now.getTime() - lastActivity.getTime() >= ABANDONED_AFTER_MS;

// A game that doesn't exist has nothing to protect, so the request goes on
// to its usual answer.
export const mayChangeGame = async (gameId: string, token: string | undefined): Promise<boolean> => {
  const tokenHash = await findGameTokenHash(gameId);
  if (tokenHash === undefined || tokenHash === null) {
    return true;
  }
  // Comparing hashes, so the comparison's timing reveals nothing about the
  // token.
  return token !== undefined && hash(token) === tokenHash;
};

export const mayChangeMatch = async (matchId: string, token: string | undefined): Promise<boolean> => {
  const gameId = await findGameIdOfMatch(matchId);
  return gameId === undefined || mayChangeGame(gameId, token);
};

export const mayAbortMatch = async (matchId: string, token: string | undefined): Promise<boolean> => {
  if (await mayChangeMatch(matchId, token)) {
    return true;
  }

  const gameId = await findGameIdOfMatch(matchId);
  const lastActivity = gameId === undefined ? undefined : await findLastActivity(gameId);
  return lastActivity !== undefined && isAbandoned(lastActivity, new Date());
};
