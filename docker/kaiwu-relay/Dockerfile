# Copyright (c) 2026 Qianyuan Wuji Group (WUJILabs)
#
# Kaiwu production relay image, assembled from OUR server runtime artifact
# (scripts/pipeline/release/build-server-binaries.mjs --targets linux-x64), not from the upstream
# happierdev/relay-server image. Same filesystem layout and runtime user (uid 1000) as the upstream
# image, so the existing /data volume is used unchanged.
#
# Build context: a directory containing
#   server/         the extracted happier-server-light linux-x64 artifact
#   run-server.sh   apps/server/scripts/run-server.sh
#
#   docker build -t wuji-labs/kaiwu-relay:<version> <context>

FROM debian:12-slim
WORKDIR /opt/happier/server
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl sqlite3 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 -s /bin/bash happier \
    && mkdir -p /data /opt/happier/server \
    && chown -R happier:happier /data /opt/happier
COPY --chown=happier:happier server/ /opt/happier/server/
COPY run-server.sh /usr/local/bin/run-server
RUN chmod +x /usr/local/bin/run-server \
    && rm -rf /opt/happier/server/generated/mysql-client /opt/happier/server/prisma/mysql \
    && find /opt/happier/server/generated/sqlite-client -name '*.node' ! -name 'libquery_engine-debian-openssl-3.0.x.so.node' -delete \
    && rm -rf /opt/happier/server/node_modules/@img/sharp-libvips-linuxmusl-x64 /opt/happier/server/node_modules/@img/sharp-linuxmusl-x64
ARG KAIWU_RELEASE=""
ENV SENTRY_RELEASE=$KAIWU_RELEASE
ENV HAPPIER_RELEASE_SOURCE_SHA=$KAIWU_RELEASE
# No central error reporting: Kaiwu does not ship diagnostics to any third party.
ENV HAPPIER_SENTRY_USE_CENTRAL_DSN=0
ENV NODE_ENV=production
ENV PORT=3005
ENV HAPPIER_SERVER_FLAVOR=light
ENV HAPPY_SERVER_FLAVOR=light
ENV HAPPIER_DB_PROVIDER=sqlite
ENV HAPPY_DB_PROVIDER=sqlite
ENV HAPPIER_SERVER_LIGHT_DATA_DIR=/data
ENV HAPPY_SERVER_LIGHT_DATA_DIR=/data
ENV HAPPIER_SERVER_UI_DIR=/opt/happier/server/ui-web/current
ENV HAPPIER_SERVER_UI_PREFIX=/
ENV HAPPIER_SERVER_UI_REQUIRED=1
ENV HAPPIER_SQLITE_AUTO_MIGRATE=1
ENV HAPPIER_SQLITE_MIGRATIONS_DIR=/opt/happier/server/prisma/sqlite/migrations
ENV HAPPY_SQLITE_MIGRATIONS_DIR=/opt/happier/server/prisma/sqlite/migrations
USER happier
EXPOSE 3005
VOLUME ["/data"]
CMD ["run-server", "/opt/happier/server/happier-server"]
