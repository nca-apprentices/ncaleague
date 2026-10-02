-- migrate:up
CREATE TABLE goals (
    scoring_player VARCHAR REFERENCES players(name),
    match_id VARCHAR NOT NULL REFERENCES matches(id),
    time_stamp TIMESTAMP NOT NULL
);

-- migrate:down
DROP TABLE IF EXISTS goals;