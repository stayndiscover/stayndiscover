#!/usr/bin/env bash
# Recrée la base locale de test « stayndiscover » (PostgreSQL 15+), comme un projet Supabase neuf.
# Ne sert qu'aux tests sur ordinateur ; en production, les migrations se collent dans Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-stayndiscover}
dropdb --if-exists "$DB" && createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
echo "Base $DB prête."
