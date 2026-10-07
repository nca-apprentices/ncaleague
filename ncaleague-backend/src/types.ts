import { Generated, Insertable, Selectable } from 'kysely';

export interface Database {
  matches: MatchTable;
  players: PlayersTable;
  goals: GoalsTable;
  games: GamesTable;
}

export interface PlayerConstellation {
  blue_offensive: string;
  blue_defensive: string;
  red_offensive: string;
  red_defensive: string;
}

export interface MatchTable {
  location: string;
  status: 'live' | 'done';
  mode: string;

  id: Generated<string>;
  game_id: Generated<string>;
  start_date: Date;

  blue_offensive: string;
  blue_defensive: string;
  red_offensive: string;
  red_defensive: string;
  winningTeam?: 'blue' | 'red';
}

export interface PlayersTable {
  name: string;
}

export interface GamesTable {
  id: string;
  token_hash: string | null;
}

export interface GoalsTable {
  scoring_player: string;
  match_id: string;
  time_stamp: Date;
}

export interface RunningMatch {
  id: string;
  gameId: string;
  location: string;
  status: 'live' | 'done';
  mode: string;
  players: {
    blueOffensive: { name: string; score: number };
    blueDefensive: { name: string; score: number };
    redOffensive: { name: string; score: number };
    redDefensive: { name: string; score: number };
  };
  redScore: number;
  blueScore: number;
  totalMatches: number;
  matchOfGame: number;
}

export type Match = Selectable<MatchTable>;
export type NewMatch = Insertable<MatchTable>;
export type Players = Selectable<PlayersTable>;
export type NewPlayers = Insertable<PlayersTable>;
export type Goals = Selectable<GoalsTable>;
export type NewGoal = Insertable<GoalsTable>;
