-- migrate:up

CREATE TYPE match_mode AS ENUM ('4-5', '3-5');
CREATE TYPE match_status AS ENUM ('live', 'done');
CREATE TYPE match_location AS ENUM ('Zurich', 'Winterthur');

CREATE TABLE matches (
    location match_location NOT NULL,
    status match_status NOT NULL,
    mode match_mode NOT NULL,

    id VARCHAR PRIMARY KEY,
    game_id VARCHAR NOT NULL,
    start_date TIMESTAMP NOT NULL,

    blue_offensive VARCHAR REFERENCES players(name),
    blue_defensive VARCHAR REFERENCES players(name),
    red_offensive VARCHAR REFERENCES players(name),
    red_defensive VARCHAR REFERENCES players(name)
);

-- migrate:down

DROP TABLE IF EXISTS matches;
DROP TYPE IF EXISTS match_mode;
DROP TYPE IF EXISTS match_status;
DROP TYPE IF EXISTS match_location;
DROP TYPE IF EXISTS winning_team;