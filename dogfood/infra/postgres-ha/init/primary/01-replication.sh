#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
    CREATE USER ${POSTGRES_REPLICATION_USER} WITH REPLICATION ENCRYPTED PASSWORD '${POSTGRES_REPLICATION_PASSWORD}';
EOSQL

echo "host replication ${POSTGRES_REPLICATION_USER} all scram-sha-256" >> "${PGDATA}/pg_hba.conf"
echo "host replication ${POSTGRES_REPLICATION_USER} all md5" >> "${PGDATA}/pg_hba.conf"
