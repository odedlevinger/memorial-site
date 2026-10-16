#!/bin/sh
# Kong PLUGINSERVER_PYTHON_START_CMD wrapper.
#
# docker-init.sh pre-starts the Python plugin server before Kong and waits
# for the socket to appear. When Kong later runs this START_CMD, the socket
# already exists. Attempting to bind it again would fail with EADDRINUSE and
# cause an endless restart loop.
#
# Fix: if the socket is already present, exec sleep infinity so Kong has a
# long-lived "monitored process" to watch without conflicting with the
# pre-started server. If the socket is absent (first start on a fresh container
# where pre-start hasn't run, or after a crash), start the real server so Kong
# manages lifecycle normally.
SOCKET=/tmp/python.socket

if [ -S "$SOCKET" ]; then
  exec sleep infinity
fi

exec env PYTHONPATH=/opt/kong/plugins \
  /usr/local/bin/kong-python-pluginserver \
  -d /opt/kong/plugins \
  -p /tmp \
  --socket-name python.socket \
  --no-lua-style \
  --gevent
