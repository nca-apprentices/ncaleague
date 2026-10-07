// The browser that starts a game keeps the game's token. The API accepts
// goals, undo, abort, and the next match only with it.
const storageKey = (gameId: string): string => `game-token:${gameId}`;

export const saveGameToken = (gameId: string, token: string): void => {
  localStorage.setItem(storageKey(gameId), token);
};

export const hasGameToken = (gameId: string): boolean => localStorage.getItem(storageKey(gameId)) !== null;

export const gameTokenHeaders = (gameId: string): Record<string, string> => {
  const token = localStorage.getItem(storageKey(gameId));
  return token === null ? {} : { 'X-Game-Token': token };
};
