# Build context: repo root  →  docker build -f apps/kong-gateway/Dockerfile .
# Kong 3.4 + Python 3.11 plugins (session-identity, dynamic-router)

FROM kong:3.4 AS runtime

USER root

# Install Python 3, pip, tini, and the Python PDK + DB driver.
# tini becomes PID 1 so docker-init.sh runs as PID 2; this prevents the
# kong-pdk watchdog (kills Python server when os.getppid()==1) from firing
# during the pre-start phase in docker-init.sh.
#
# kong-pdk pulls in gevent, which compiles its bundled libev from source — so a
# C toolchain (gcc/make + headers) must be present at install time. The build
# deps are purged immediately after pip install to keep the runtime image lean.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-dev \
      libpq5 \
      gettext-base \
      tini \
      gcc \
      make \
      libffi-dev \
 && pip3 install --no-cache-dir \
      kong-pdk==0.36 \
      psycopg2-binary==2.9.9 \
 && apt-get purge -y --auto-remove python3-dev gcc make libffi-dev \
 && rm -rf /var/lib/apt/lists/*

# Create directories with correct ownership
RUN mkdir -p /var/log/kong /opt/kong/plugins && chown -R kong:kong /var/log/kong /opt/kong/plugins

USER kong

# Copy Python plugin code (flat files + shared lib only — omit __init__.py and package dirs)
COPY apps/kong-gateway/src/plugins/session_identity.py /opt/kong/plugins/session_identity.py
COPY apps/kong-gateway/src/plugins/dynamic_router.py   /opt/kong/plugins/dynamic_router.py
COPY apps/kong-gateway/src/plugins/shared/             /opt/kong/plugins/shared/
COPY apps/kong-gateway/migrations/  /opt/kong/migrations/

# Copy declarative configuration template (envsubst substitutes upstream targets at startup)
COPY apps/kong-gateway/config/kong.yml.template /etc/kong/kong.yml.template

# Startup scripts
USER root
COPY apps/kong-gateway/docker-init.sh           /usr/local/bin/docker-init.sh
COPY apps/kong-gateway/start-python-server.sh   /usr/local/bin/start-python-server.sh
RUN chmod +x /usr/local/bin/docker-init.sh /usr/local/bin/start-python-server.sh
USER kong

# Kong environment
ENV MIGRATIONS_DIR=/opt/kong/migrations
ENV KONG_DATABASE=off
ENV KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yml
ENV KONG_PLUGINS=bundled,session_identity,dynamic_router
ENV KONG_LOG_LEVEL=info

# Python PDK plugin server configuration.
# Socket lives in /tmp so Kong's "kong prepare" phase (which removes stale
# sockets from the prefix dir /usr/local/kong) does not delete the pre-started
# server's socket. KONG_PLUGINSERVER_PYTHON_SOCKET tells Kong where to connect;
# -p /tmp tells the Python server where to bind — both must agree on /tmp.
# start-python-server.sh sleeps if the socket already exists, preventing a
# double-bind conflict with the pre-started server.
ENV KONG_PLUGINSERVER_NAMES=python
ENV KONG_PLUGINSERVER_PYTHON_SOCKET=/tmp/python.socket
ENV KONG_PLUGINSERVER_PYTHON_QUERY_CMD="/usr/local/bin/kong-python-pluginserver -d /opt/kong/plugins -p /tmp --dump-all-plugins"
ENV KONG_PLUGINSERVER_PYTHON_START_CMD="/usr/local/bin/start-python-server.sh"
ENV PYTHONPATH=/opt/kong/plugins

# tini as PID 1 ensures docker-init.sh and the pre-started Python plugin server
# run as PID 2+ so the kong-pdk watchdog (os.getppid()==1 check) does not fire.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-init.sh"]
CMD ["kong", "docker-start"]

EXPOSE 8000 8001
