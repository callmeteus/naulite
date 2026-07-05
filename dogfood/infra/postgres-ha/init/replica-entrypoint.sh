#!/bin/sh
set -eu

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PRIMARY_HOST="${POSTGRES_PRIMARY_HOST:-postgres-primary}"
REPL_USER="${POSTGRES_REPLICATION_USER:-replicator}"
REPL_PASSWORD="${POSTGRES_REPLICATION_PASSWORD:-replicator}"

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
    echo "Bootstrapping replica from ${PRIMARY_HOST}..."
    rm -rf "${PGDATA:?}"/*
    until pg_isready -h "${PRIMARY_HOST}" -U "${POSTGRES_USER:-naulite}"; do
        sleep 2
    done
    export PGPASSWORD="${REPL_PASSWORD}"
    pg_basebackup \
        -h "${PRIMARY_HOST}" \
        -D "${PGDATA}" \
        -U "${REPL_USER}" \
        -Fp -Xs -P -R
    chown -R postgres:postgres "${PGDATA}"
fi

exec /usr/local/bin/docker-entrypoint.sh postgres -c hot_standby=on
