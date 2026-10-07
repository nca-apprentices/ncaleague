# Abort deletes a running match and its goals. A finished match stays.
POST {{base}}/api/matches
{"players": ["q1", "q2", "q3", "q4"], "location": "Zurich", "mode": "3-5"}
HTTP 201
[Captures]
m1: jsonpath "$.id"
game: jsonpath "$.gameId"
token: jsonpath "$.token"
bo: jsonpath "$.players.blueOffensive"

POST {{base}}/api/matches/{{m1}}/goals
X-Game-Token: {{token}}
[Options]
repeat: 5
{"scoringPlayer": "{{bo}}"}
HTTP 201

POST {{base}}/api/matches
X-Game-Token: {{token}}
{"gameId": "{{game}}"}
HTTP 201
[Captures]
m2: jsonpath "$.id"
bo2: jsonpath "$.players.blueOffensive"

POST {{base}}/api/matches/{{m2}}/goals
X-Game-Token: {{token}}
{"scoringPlayer": "{{bo2}}"}
HTTP 201

# Aborting the running match keeps the game's finished matches.
DELETE {{base}}/api/matches/{{m2}}
X-Game-Token: {{token}}
HTTP 204

GET {{base}}/api/matches/{{m2}}
HTTP 404

GET {{base}}/api/matches/{{m2}}/goals
HTTP 200
[Asserts]
jsonpath "$" count == 0

GET {{base}}/api/matches/live
HTTP 200
[Asserts]
jsonpath "$[*].id" not contains {{m2}}

GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].id" == {{m1}}
jsonpath "$[0].status" == "done"

DELETE {{base}}/api/matches/{{m1}}
X-Game-Token: {{token}}
HTTP 403

GET {{base}}/api/matches/{{m1}}
HTTP 200
[Asserts]
jsonpath "$.status" == "done"
jsonpath "$.blueScore" == 5

GET {{base}}/api/games/{{game}}/summary
HTTP 200
[Asserts]
jsonpath "$" count == 1

GET {{base}}/api/matches
HTTP 200
[Asserts]
jsonpath "$[*].id" contains {{m1}}
