# Health checks the database. Every response carries a request ID, which
# the backend's log lines carry too.
GET {{base}}/api/health
HTTP 200
[Asserts]
jsonpath "$.status" == "ok"
header "X-Request-Id" matches /^[0-9a-f-]{36}$/
