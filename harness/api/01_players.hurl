# Players on a fresh database. The API stores names in lowercase.
GET {{base}}/api/players
HTTP 200
[Asserts]
jsonpath "$" count == 0

# Created answers 200 with the number 204 as its body.
POST {{base}}/api/players
{"name": "Alice"}
HTTP 200
[Asserts]
jsonpath "$" == 204

POST {{base}}/api/players
{"name": "ALICE"}
HTTP 200
[Asserts]
jsonpath "$" == 204

GET {{base}}/api/players
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].name" == "alice"

# A name is a non-blank string of up to 50 characters.
POST {{base}}/api/players
{"name": "  "}
HTTP 400

POST {{base}}/api/players
{"name": 5}
HTTP 400

POST {{base}}/api/players
{}
HTTP 400

POST {{base}}/api/players
{"name": "abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijk"}
HTTP 400

POST {{base}}/api/players
Content-Type: application/json
```
not json
```
HTTP 400

GET {{base}}/api/players
HTTP 200
[Asserts]
jsonpath "$" count == 1

# Alice has no matches, so her win rate is 0.
GET {{base}}/api/players/ranking
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].player.name" == "alice"
jsonpath "$[0].winrate" == 0
