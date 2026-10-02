# ncaleague api

## Get all players for hints on /new page

```
GET /players
{}
{
    players: ['alice', 'bob', 'carol'],
}
```

## Create player

```
POST /players
{
    players: ['alice'],
}
204
```

## Create match

```
POST /matches
{
    players: ['alice', 'bob', 'carol', 'dave'],
    location: 'zurich',
    mode: '4-5'
} | { game_id: '23432434', }
{
    id: '1',
    game_id: '1223',
    players: {
        red_offensive: 'alice',
        red_defensive: 'bob',
        blue_offensive: 'dave',
        blue_defensive: 'carol',
    },
    red_score: 0,
    blue_score: 0,
}
```

## Get match details

```
GET /matches/:id
{}
{
    id: '1',
    game_id: '1223',
    players: {
        red_offensive: { name: 'alice', score: 0 },
        red_defensive: { name: 'bob', score: 2 },
        blue_offensive: { name: 'dave', score: 1 },
        blue_defensive: { name: 'carol', score: 1 },
    },
    red_score: 2,
    blue_score: 4,
}
```

## Register goal

```
POST /matches/:id/goals
{
    player: 'alice',
}
{
    players: {
        red_offensive: { name: 'alice', score: 0 },
        red_defensive: { name: 'bob', score: 2 },
        blue_offensive: { name: 'dave', score: 1 },
        blue_defensive: { name: 'carol', score: 1 },
    },
    red_score: 2,
    blue_score: 5,
    match_status: 'done',
    new_match: false,
}
```

## Undo goal

```
POST /matches/:id/goals/undo
{}
{
    players: {
        red_offensive: { name: 'alice', score: 0 },
        red_defensive: { name: 'bob', score: 2 },
        blue_offensive: { name: 'dave', score: 1 },
        blue_defensive: { name: 'carol', score: 1 },
    },
    red_score: 2,
    blue_score: 4,
}
```

## Get ranking

```
GET /players/ranking?days=30
{}
{
    players: [
        {
            name: 'bob',
            winrate: 0.6,
            rank: 1,
        },
        {
            name: 'alice',
            winrate: 0.5,
            rank: 2,
        },
        {
            name: 'dave',
            winrate: 0.5,
            rank: 3,
        },
    ]
}
```

## Get playingMatches

```
GET /matches/live
{}
{
    runningMatches[
        {   location: Zurich,
            mode: 4-5,
            players: {
                red_offensive: { name: 'alice', score: 0 },
                red_defensive: { name: 'bob', score: 2 },
                blue_offensive: { name: 'dave', score: 1 },
                blue_defensive: { name: 'carol', score: 1 },
            },
            red_score: 2,
            blue_score: 4,
            matchOfGame: 3,
        },
        {   location: Winterthur
            mode: 3-5,
            players: {
                red_offensive: { name: 'alice', score: 0 },
                red_defensive: { name: 'bob', score: 2 },
                blue_offensive: { name: 'dave', score: 1 },
                blue_defensive: { name: 'carol', score: 1 },
            },
            red_score: 2,
            blue_score: 4,
            matchOfGame: 2,
        }
    ]
}
```
