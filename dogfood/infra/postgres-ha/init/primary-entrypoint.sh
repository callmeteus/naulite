#!/bin/sh
set -eu

if [ -d /docker-entrypoint-initdb.d ]; then
    for script in /docker-entrypoint-initdb.d/*.sh; do
        if [ -f "${script}" ]; then
            chmod +x "${script}" 2>/dev/null || true
        fi
    done
fi

exec /usr/local/bin/docker-entrypoint.sh postgres \
    -c wal_level=replica \
    -c hot_standby=on \
    -c max_wal_senders=10 \
    -c max_replication_slots=10 \
    -c hot_standby_feedback=on
