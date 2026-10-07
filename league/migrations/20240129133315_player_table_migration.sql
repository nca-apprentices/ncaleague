-- migrate:up
CREATE TABLE players (
    name VARCHAR NOT NULL UNIQUE PRIMARY KEY
);

-- migrate:down

DROP TABLE IF EXISTS players