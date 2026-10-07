# A 1-10 game: one match, which the first team to 10 goals wins.
POST {{base}}/api/players
{"name": "q1"}
HTTP 200

POST {{base}}/api/players
{"name": "q2"}
HTTP 200

POST {{base}}/api/players
{"name": "q3"}
HTTP 200

POST {{base}}/api/players
{"name": "q4"}
HTTP 200

# Names match regardless of case. Positions are random, so the tests read
# them from the response.
POST {{base}}/api/matches
{"players": ["Q1", "q2", "q3", "q4"], "location": "Winterthur", "mode": "1-10"}
HTTP 201
[Captures]
match: jsonpath "$.id"
game: jsonpath "$.gameId"
bo: jsonpath "$.players.blueOffensive"
bd: jsonpath "$.players.blueDefensive"
ro: jsonpath "$.players.redOffensive"
rd: jsonpath "$.players.redDefensive"
[Asserts]
jsonpath "$.id" isString
jsonpath "$.gameId" isString
jsonpath "$.gameId" != {{match}}
jsonpath "$.players.*" count == 4
jsonpath "$.players.*" contains "q1"
jsonpath "$.players.*" contains "q2"
jsonpath "$.players.*" contains "q3"
jsonpath "$.players.*" contains "q4"
jsonpath "$.blueScore" == 0
jsonpath "$.redScore" == 0

GET {{base}}/api/matches/{{match}}
HTTP 200
[Asserts]
jsonpath "$.id" == {{match}}
jsonpath "$.gameId" == {{game}}
jsonpath "$.location" == "Winterthur"
jsonpath "$.status" == "live"
jsonpath "$.mode" == "1-10"
jsonpath "$.players.blueOffensive.name" == {{bo}}
jsonpath "$.players.blueDefensive.name" == {{bd}}
jsonpath "$.players.redOffensive.name" == {{ro}}
jsonpath "$.players.redDefensive.name" == {{rd}}
jsonpath "$.players.*.score" count == 4
jsonpath "$.blueScore" == 0
jsonpath "$.redScore" == 0
jsonpath "$.matchOfGame" == 1
jsonpath "$.totalMatches" == 1

GET {{base}}/api/matches/live
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].id" == {{match}}
jsonpath "$[0].gameId" == {{game}}
jsonpath "$[0].status" == "live"
jsonpath "$[0].players.blueOffensive.name" == {{bo}}
jsonpath "$[0].blueScore" == 0
jsonpath "$[0].matchOfGame" == 1
jsonpath "$[0].totalMatches" == 1

GET {{base}}/api/matches
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].id" == {{match}}
jsonpath "$[0].blueOffensive" == {{bo}}
jsonpath "$[0].status" == "live"
jsonpath "$[0].winningTeam" not exists

# Undo in a game's first match without goals does nothing.
POST {{base}}/api/matches/{{match}}/goals/undo
HTTP 204

POST {{base}}/api/matches/{{match}}/goals
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.blueScore" == 1
jsonpath "$.redScore" == 0
jsonpath "$.matchStatus" == "live"
jsonpath "$.newMatch" == false
jsonpath "$.gameId" == {{game}}
jsonpath "$.players.blueOffensive.name" == {{bo}}
jsonpath "$.players.blueOffensive.score" == 1
jsonpath "$.players.redDefensive.score" == 0

POST {{base}}/api/matches/{{match}}/goals
{"scoringPlayer": "{{rd}}"}
HTTP 201
[Asserts]
jsonpath "$.blueScore" == 1
jsonpath "$.redScore" == 1
jsonpath "$.players.redDefensive.score" == 1

GET {{base}}/api/matches/{{match}}/goals
HTTP 200
[Asserts]
jsonpath "$" count == 2
jsonpath "$[*].scoringPlayer" contains {{bo}}
jsonpath "$[*].scoringPlayer" contains {{rd}}
jsonpath "$[0].matchId" == {{match}}
jsonpath "$[0].timeStamp" isIsoDate

# Undo removes the latest goal.
POST {{base}}/api/matches/{{match}}/goals/undo
HTTP 200
[Asserts]
jsonpath "$.id" == {{match}}
jsonpath "$.scoreTeamBlue" == 1
jsonpath "$.scoreTeamRed" == 0
jsonpath "$.players.blueOffensive.name" == {{bo}}
jsonpath "$.players.blueOffensive.score" == 1
jsonpath "$.players.redDefensive.score" == 0

GET {{base}}/api/matches/live
HTTP 200
[Asserts]
jsonpath "$[0].blueScore" == 1
jsonpath "$[0].redScore" == 0
jsonpath "$[0].players.blueOffensive.score" == 1

# Goals 2 to 9 by the blue defense.
POST {{base}}/api/matches/{{match}}/goals
[Options]
repeat: 8
{"scoringPlayer": "{{bd}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

POST {{base}}/api/matches/{{match}}/goals
{"scoringPlayer": "{{bd}}"}
HTTP 201
[Asserts]
jsonpath "$.blueScore" == 10
jsonpath "$.redScore" == 0
jsonpath "$.players.blueDefensive.score" == 9
jsonpath "$.matchStatus" == "done"
jsonpath "$.newMatch" == false
jsonpath "$.gameId" == {{game}}

# A finished match takes no goals and no undo.
POST {{base}}/api/matches/{{match}}/goals
{"scoringPlayer": "{{ro}}"}
HTTP 403

POST {{base}}/api/matches/{{match}}/goals/undo
HTTP 403

GET {{base}}/api/matches/{{match}}
HTTP 200
[Asserts]
jsonpath "$.status" == "done"
jsonpath "$.blueScore" == 10
jsonpath "$.redScore" == 0

GET {{base}}/api/matches/live
HTTP 200
[Asserts]
jsonpath "$" count == 0

GET {{base}}/api/matches
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].status" == "done"
jsonpath "$[0].winningTeam" == "blue"

GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].id" == {{match}}
jsonpath "$[0].location" == "Winterthur"
jsonpath "$[0].winningTeam" == "blue"

# The win rate shrinks toward the average: (wins + 20 * average) /
# (matches + 20). Each match counts once per player in it, so four times.
# The average is 0.5, so a win gives 14/24 and a loss 10/24.
GET {{base}}/api/players/ranking
HTTP 200
[Asserts]
jsonpath "$" count == 8
jsonpath "$[?(@.player.name == '{{bo}}')].winrate" == 58.3
jsonpath "$[?(@.player.name == '{{bd}}')].winrate" == 58.3
jsonpath "$[?(@.player.name == '{{ro}}')].winrate" == 41.7
jsonpath "$[?(@.player.name == '{{rd}}')].winrate" == 41.7
jsonpath "$[?(@.player.name == 'alice')].winrate" == 0
jsonpath "$[0].winrate" == 58.3
jsonpath "$[7].winrate" == 0
