#!/bin/sh
set -eu

# Render supplies PORT at runtime.  Its health checks and public traffic reach
# Nginx; game servers stay private on fixed loopback ports.
: "${PORT:=10000}"
export PORT
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/http.d/default.conf

RUN_STANDALONE_SERVER=true PORT=3001 node apps/server/dist/server.js &
RUN_STANDALONE_SERVER=true PORT=3002 node avalon/apps/server/dist/server.js &
RUN_STANDALONE_SERVER=true PORT=3003 node bloodbound/apps/server/dist/server.js &
RUN_STANDALONE_SERVER=true PORT=3004 node skullking/apps/server/dist/server.js &
PORT=3005 node spacecrew/server.mjs &
PORT=3006 node rummikub/apps/server/dist/server.js &

trap 'kill $(jobs -p) 2>/dev/null || true; exit 0' INT TERM
nginx -g 'daemon off;' &
nginx_pid=$!
wait "$nginx_pid"
