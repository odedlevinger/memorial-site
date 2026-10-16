#!/bin/sh
# Generate kong.yml from template, substituting upstream targets from environment variables.
# Defaults allow the container to start without any env config (local dev via docker-compose).
# Writes to /tmp/kong.yml — /etc/kong/ is root-owned and not writable by the kong user.
set -e

: "${UPSTREAM_AUTH_TARGET:=auth-service:3001}"
: "${UPSTREAM_PROTOCOL:=http}"

export UPSTREAM_AUTH_TARGET UPSTREAM_PROTOCOL

KONG_DECLARATIVE_CONFIG=/tmp/kong.yml
export KONG_DECLARATIVE_CONFIG

envsubst '${UPSTREAM_AUTH_TARGET} ${UPSTREAM_PROTOCOL}' \
  < /etc/kong/kong.yml.template > "$KONG_DECLARATIVE_CONFIG"

# ── Pre-start Python plugin server ───────────────────────────────────────────
# Kong's connection_check_timer has a hard 20-second timeout. On Cloud Run cold
# starts the Python server (gevent + psycopg2 imports) can take >20 s, causing
# Kong to permanently mark all Python plugins as unavailable for that instance.
#
# We pre-start the server here and wait for its socket BEFORE exec-ing Kong so
# Kong's timer finds the socket ready immediately.
#
# Socket lives in /tmp (not /usr/local/kong) because Kong's "kong prepare" phase
# removes any pre-existing sockets from its prefix directory as stale/dangling.
#
# KONG_PLUGINSERVER_PYTHON_START_CMD points to start-python-server.sh, which
# detects the socket is already bound and exec's "sleep infinity" instead of
# trying to bind again — keeping Kong's monitored process alive without conflict.
PYTHON_SOCKET=/tmp/python.socket

rm -f "$PYTHON_SOCKET"

env PYTHONPATH=/opt/kong/plugins \
  /usr/local/bin/kong-python-pluginserver \
  -d /opt/kong/plugins \
  -p /tmp \
  --socket-name python.socket \
  --no-lua-style \
  --gevent &
PYTHON_PID=$!

echo "Waiting for Python plugin server (pid $PYTHON_PID) to bind $PYTHON_SOCKET ..."
i=0
while [ ! -S "$PYTHON_SOCKET" ]; do
  if [ $i -ge 120 ]; then
    echo "ERROR: Python plugin server did not start within 60 seconds" >&2
    kill "$PYTHON_PID" 2>/dev/null
    exit 1
  fi
  sleep 0.5
  i=$((i + 1))
done
echo "Python plugin server ready after $((i * 5 / 10)).$((i * 5 % 10)) s"

exec /docker-entrypoint.sh "$@"
