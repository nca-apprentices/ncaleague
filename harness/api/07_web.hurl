# The proxy serves the app, and the app falls back to index.html for its
# client-side routes.
GET {{base}}/
HTTP 200
[Captures]
script: xpath "string(//script[@type='module']/@src)"
[Asserts]
header "Content-Type" contains "text/html"
xpath "string(//title)" == "ncaleague"
xpath "//div[@id='root']" exists

GET {{base}}{{script}}
HTTP 200
[Asserts]
header "Content-Type" contains "javascript"

GET {{base}}/ranking
HTTP 200
[Asserts]
xpath "//div[@id='root']" exists

GET {{base}}/games/any/summary
HTTP 200
[Asserts]
xpath "//div[@id='root']" exists

# CORS admits the Vite dev server only, in production too.
OPTIONS {{base}}/api/players
Origin: http://localhost:5173
Access-Control-Request-Method: POST
HTTP 204
[Asserts]
header "Access-Control-Allow-Origin" == "http://localhost:5173"
header "Access-Control-Allow-Credentials" == "true"
header "Access-Control-Allow-Methods" == "POST,GET,OPTIONS,DELETE"

GET {{base}}/api/players
Origin: https://elsewhere.example
HTTP 200
[Asserts]
header "Access-Control-Allow-Origin" not exists
