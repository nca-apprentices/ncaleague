# A 3-5 game: three matches, each to 5 goals. Players rotate between
# matches, and undo in a new match without goals returns to the last one.
POST {{base}}/api/players
{"name": "t1"}
HTTP 200

POST {{base}}/api/players
{"name": "t2"}
HTTP 200

POST {{base}}/api/players
{"name": "t3"}
HTTP 200

POST {{base}}/api/players
{"name": "t4"}
HTTP 200

POST {{base}}/api/matches
{"players": ["t1", "t2", "t3", "t4"], "location": "Zurich", "mode": "3-5"}
HTTP 201
[Captures]
m1: jsonpath "$.id"
game: jsonpath "$.gameId"
token: jsonpath "$.token"
bo: jsonpath "$.players.blueOffensive"
bd: jsonpath "$.players.blueDefensive"
ro: jsonpath "$.players.redOffensive"
rd: jsonpath "$.players.redDefensive"

GET {{base}}/api/matches/{{m1}}
HTTP 200
[Asserts]
jsonpath "$.matchOfGame" == 1
jsonpath "$.totalMatches" == 3

# A game gets its next match only after the running one ends.
POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 403

POST {{base}}/api/matches/{{m1}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 4
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

# The last goal of a match that isn't the game's last asks for a new match.
POST {{base}}/api/matches/{{m1}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.blueScore" == 5
jsonpath "$.matchStatus" == "done"
jsonpath "$.newMatch" == true
jsonpath "$.gameId" == {{game}}

POST {{base}}/api/matches
{"gameId": "{{game}}"}
HTTP 403

# After the first match, red offense moves to blue offense, and blue moves
# one position along.
POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 201
[Captures]
m2: jsonpath "$.id"
[Asserts]
jsonpath "$.gameId" == {{game}}
jsonpath "$.players.blueOffensive" == {{ro}}
jsonpath "$.players.blueDefensive" == {{bo}}
jsonpath "$.players.redOffensive" == {{bd}}
jsonpath "$.players.redDefensive" == {{rd}}
jsonpath "$.blueScore" == 0
jsonpath "$.redScore" == 0

GET {{base}}/api/matches/{{m2}}
HTTP 200
[Asserts]
jsonpath "$.status" == "live"
jsonpath "$.location" == "Zurich"
jsonpath "$.mode" == "3-5"
jsonpath "$.matchOfGame" == 2
jsonpath "$.totalMatches" == 3

GET {{base}}/api/matches/live
HTTP 200
[Asserts]
jsonpath "$[*].id" contains {{m2}}
jsonpath "$[*].id" not contains {{m1}}
jsonpath "$[?(@.id == '{{m2}}')].matchOfGame" == 2
jsonpath "$[?(@.id == '{{m2}}')].totalMatches" == 3

# Undo deletes the new match, reopens the last one, and removes its last goal.
POST {{base}}/api/matches/{{m2}}/goals/undo
X-Game-Token: {{token}}
HTTP 200
[Asserts]
jsonpath "$.id" == {{m1}}
jsonpath "$.scoreTeamBlue" == 4
jsonpath "$.scoreTeamRed" == 0
jsonpath "$.players.blueOffensive.score" == 4

GET {{base}}/api/matches/{{m2}}
HTTP 404

GET {{base}}/api/matches/{{m1}}
HTTP 200
[Asserts]
jsonpath "$.status" == "live"
jsonpath "$.blueScore" == 4

POST {{base}}/api/matches/{{m1}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "done"
jsonpath "$.newMatch" == true

POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 201
[Captures]
m2: jsonpath "$.id"
[Asserts]
jsonpath "$.players.blueOffensive" == {{ro}}
jsonpath "$.players.blueDefensive" == {{bo}}
jsonpath "$.players.redOffensive" == {{bd}}
jsonpath "$.players.redDefensive" == {{rd}}

# Only a finished match has a winner. Matches list in the order played.
GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$" count == 2
jsonpath "$[0].id" == {{m1}}
jsonpath "$[0].winningTeam" == "blue"
jsonpath "$[1].id" == {{m2}}
jsonpath "$[1].winningTeam" not exists

# Red wins the second match 5:3.
POST {{base}}/api/matches/{{m2}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 3
{"scoringPlayer": "{{ro}}"}
HTTP 201

GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$[1].winningTeam" not exists

POST {{base}}/api/matches/{{m2}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 4
{"scoringPlayer": "{{rd}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

POST {{base}}/api/matches/{{m2}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{rd}}"}
HTTP 201
[Asserts]
jsonpath "$.blueScore" == 3
jsonpath "$.redScore" == 5
jsonpath "$.players.blueOffensive.name" == {{ro}}
jsonpath "$.players.blueOffensive.score" == 3
jsonpath "$.players.redDefensive.score" == 5
jsonpath "$.matchStatus" == "done"
jsonpath "$.newMatch" == true

# After the second match, everyone moves one position along.
POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 201
[Captures]
m3: jsonpath "$.id"
[Asserts]
jsonpath "$.players.blueOffensive" == {{rd}}
jsonpath "$.players.blueDefensive" == {{ro}}
jsonpath "$.players.redOffensive" == {{bo}}
jsonpath "$.players.redDefensive" == {{bd}}

GET {{base}}/api/matches/{{m3}}
HTTP 200
[Asserts]
jsonpath "$.matchOfGame" == 3

POST {{base}}/api/matches/{{m3}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 4
{"scoringPlayer": "{{rd}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

# The last goal of the game's last match ends the game.
POST {{base}}/api/matches/{{m3}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{rd}}"}
HTTP 201
[Asserts]
jsonpath "$.blueScore" == 5
jsonpath "$.matchStatus" == "done"
jsonpath "$.newMatch" == false
jsonpath "$.gameId" == {{game}}

# A finished game gets no more matches.
POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 403

GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$" count == 3
jsonpath "$[0].id" == {{m1}}
jsonpath "$[1].id" == {{m2}}
jsonpath "$[2].id" == {{m3}}
jsonpath "$[?(@.id == '{{m1}}')].winningTeam" == "blue"
jsonpath "$[?(@.id == '{{m2}}')].winningTeam" == "red"
jsonpath "$[?(@.id == '{{m3}}')].winningTeam" == "blue"
jsonpath "$[*].status" not contains "live"

# Newest first.
GET {{base}}/api/matches
HTTP 200
[Asserts]
jsonpath "$" count == 4
jsonpath "$[0].id" == {{m3}}
jsonpath "$[1].id" == {{m2}}
jsonpath "$[2].id" == {{m1}}
jsonpath "$[0].winningTeam" == "blue"
jsonpath "$[1].winningTeam" == "red"
jsonpath "$[2].winningTeam" == "blue"

GET {{base}}/api/matches/live
HTTP 200
[Asserts]
jsonpath "$[*].gameId" not contains {{game}}
