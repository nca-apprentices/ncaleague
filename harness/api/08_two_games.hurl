# A player plays in two running games. Undo removes the goal from its own
# match only.
POST {{base}}/api/players
{"name": "s1"}
HTTP 200

POST {{base}}/api/players
{"name": "s2"}
HTTP 200

POST {{base}}/api/players
{"name": "s3"}
HTTP 200

POST {{base}}/api/players
{"name": "s4"}
HTTP 200

POST {{base}}/api/players
{"name": "s5"}
HTTP 200

POST {{base}}/api/players
{"name": "s6"}
HTTP 200

POST {{base}}/api/players
{"name": "s7"}
HTTP 200

POST {{base}}/api/matches
{"players": ["s1", "s2", "s3", "s4"], "location": "Zurich", "mode": "1-10"}
HTTP 201
[Captures]
first: jsonpath "$.id"
first_token: jsonpath "$.token"

POST {{base}}/api/matches
{"players": ["s1", "s5", "s6", "s7"], "location": "Winterthur", "mode": "1-10"}
HTTP 201
[Captures]
second: jsonpath "$.id"
second_token: jsonpath "$.token"

POST {{base}}/api/matches/{{first}}/goals
X-Game-Token: {{first_token}}
{"scoringPlayer": "s1"}
HTTP 201

POST {{base}}/api/matches/{{second}}/goals
X-Game-Token: {{second_token}}
{"scoringPlayer": "s1"}
HTTP 201

POST {{base}}/api/matches/{{first}}/goals/undo
X-Game-Token: {{first_token}}
HTTP 200

GET {{base}}/api/matches/{{first}}/goals
HTTP 200
[Asserts]
jsonpath "$" count == 0

GET {{base}}/api/matches/{{second}}/goals
HTTP 200
[Asserts]
jsonpath "$" count == 1
