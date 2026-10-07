# Abort deletes a match and its goals. It answers 204 for any match,
# including a finished one.
POST {{base}}/api/matches
{"players": ["q1", "q2", "q3", "q4"], "location": "Zurich", "mode": "3-5"}
HTTP 201
[Captures]
m1: jsonpath "$.id"
game: jsonpath "$.gameId"
bo: jsonpath "$.players.blueOffensive"

POST {{base}}/api/matches/{{m1}}/goals
[Options]
repeat: 5
{"scoringPlayer": "{{bo}}"}
HTTP 201

POST {{base}}/api/matches
{"gameId": "{{game}}"}
HTTP 201
[Captures]
m2: jsonpath "$.id"
bo2: jsonpath "$.players.blueOffensive"

POST {{base}}/api/matches/{{m2}}/goals
{"scoringPlayer": "{{bo2}}"}
HTTP 201

# Aborting the running match keeps the game's finished matches.
DELETE {{base}}/api/matches/{{m2}}
HTTP 204

GET {{base}}/api/matches/{{m2}}
HTTP 500

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

# A finished match goes too.
DELETE {{base}}/api/matches/{{m1}}
HTTP 204

GET {{base}}/api/games/{{game}}/summary
HTTP 404

GET {{base}}/api/matches
HTTP 200
[Asserts]
jsonpath "$[*].id" not contains {{m1}}
