-- migrate:up
-- Every match loads its goals in order and its place in its game, and the
-- lists run by start date. These indexes keep each lookup off a full scan.
CREATE INDEX IF NOT EXISTS goals_match_time ON goals (match_id, time_stamp);
CREATE INDEX IF NOT EXISTS matches_game_start ON matches (game_id, start_date);
CREATE INDEX IF NOT EXISTS matches_start ON matches (start_date);

-- migrate:down
DROP INDEX IF EXISTS matches_start;
DROP INDEX IF EXISTS matches_game_start;
DROP INDEX IF EXISTS goals_match_time;
