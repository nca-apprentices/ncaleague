# Requests for a match or game that doesn't exist.
GET {{base}}/api/matches/missing
HTTP 500
[Asserts]
header "X-Request-Id" exists

GET {{base}}/api/matches/missing/goals
HTTP 200
[Asserts]
jsonpath "$" count == 0

POST {{base}}/api/matches/missing/goals
{"scoringPlayer": "alice"}
HTTP 500

POST {{base}}/api/matches/missing/goals/undo
HTTP 500

DELETE {{base}}/api/matches/missing
HTTP 204

GET {{base}}/api/games/missing/summary
HTTP 404
[Asserts]
bytes count == 0

POST {{base}}/api/matches
{"gameId": "missing"}
HTTP 500

GET {{base}}/api/missing
HTTP 404

# A new match needs four known players and a known location and mode.
POST {{base}}/api/matches
{"players": ["alice", "nobody", "noone", "none"], "location": "Zurich", "mode": "1-10"}
HTTP 500

POST {{base}}/api/players
{"name": "m1"}
HTTP 200

POST {{base}}/api/players
{"name": "m2"}
HTTP 200

POST {{base}}/api/players
{"name": "m3"}
HTTP 200

POST {{base}}/api/matches
{"players": ["alice", "m1", "m2", "m3"], "location": "Mars", "mode": "1-10"}
HTTP 500

POST {{base}}/api/matches
{"players": ["alice", "m1", "m2", "m3"], "location": "Zurich", "mode": "2-7"}
HTTP 500

GET {{base}}/api/matches
HTTP 200
[Asserts]
jsonpath "$" count == 0
