#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER lccm_app WITH PASSWORD '${LCCM_APP_PASSWORD}' NOINHERIT;

  ALTER DATABASE lccm SET app.settings.jwt_secret = '${JWT_SECRET}';
EOSQL
