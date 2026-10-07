-- migrate:up
CREATE TABLE games (
    id VARCHAR PRIMARY KEY,
    -- The SHA-256 of the game's control token. NULL for a game created
    -- before tokens existed, which anyone may change.
    token_hash VARCHAR
);

INSERT INTO games (id) SELECT DISTINCT game_id FROM matches;

-- migrate:down
DROP TABLE IF EXISTS games;
