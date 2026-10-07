# A 4-5 game: four matches, each to 5 goals. Covers the rotation after the
# third match, where blue defense stays.
POST {{base}}/api/players
{"name": "f1"}
HTTP 200

POST {{base}}/api/players
{"name": "f2"}
HTTP 200

POST {{base}}/api/players
{"name": "f3"}
HTTP 200

POST {{base}}/api/players
{"name": "f4"}
HTTP 200

POST {{base}}/api/matches
{"players": ["f1", "f2", "f3", "f4"], "location": "Zurich", "mode": "4-5"}
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
jsonpath "$.totalMatches" == 4

POST {{base}}/api/matches/{{m1}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 4
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

POST {{base}}/api/matches/{{m1}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
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
jsonpath "$.newMatch" == true

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

POST {{base}}/api/matches/{{m3}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 4
{"scoringPlayer": "{{bd}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

POST {{base}}/api/matches/{{m3}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{bd}}"}
HTTP 201
[Asserts]
jsonpath "$.redScore" == 5
jsonpath "$.newMatch" == true

# After the third match, blue defense stays, red defense moves to blue
# offense, and the others move one position along.
POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 201
[Captures]
m4: jsonpath "$.id"
[Asserts]
jsonpath "$.players.blueOffensive" == {{bd}}
jsonpath "$.players.blueDefensive" == {{ro}}
jsonpath "$.players.redOffensive" == {{rd}}
jsonpath "$.players.redDefensive" == {{bo}}

GET {{base}}/api/matches/{{m4}}
HTTP 200
[Asserts]
jsonpath "$.matchOfGame" == 4
jsonpath "$.totalMatches" == 4

POST {{base}}/api/matches/{{m4}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 4
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.matchStatus" == "live"

POST {{base}}/api/matches/{{m4}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{bo}}"}
HTTP 201
[Asserts]
jsonpath "$.redScore" == 5
jsonpath "$.matchStatus" == "done"
jsonpath "$.newMatch" == false

GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$" count == 4
jsonpath "$[?(@.id == '{{m1}}')].winningTeam" == "blue"
jsonpath "$[?(@.id == '{{m2}}')].winningTeam" == "red"
jsonpath "$[?(@.id == '{{m3}}')].winningTeam" == "red"
jsonpath "$[?(@.id == '{{m4}}')].winningTeam" == "red"
