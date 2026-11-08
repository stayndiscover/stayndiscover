#!/usr/bin/env bash
# Recrée une base de test vierge, applique les migrations et joue les scénarios.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-sdtest}
dropdb --if-exists "$DB" && createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/10_scenarios.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/30_planificateur.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/40_sejour.sql

# Concurrence : deux voyageurs paient au même instant les mêmes dates
psql -q -d "$DB" -f tests/20_concurrence_setup.sql
psql -At -d "$DB" -f tests/20_concurrence_session1.sql > /tmp/sd_s1.log 2>&1 &
sleep 0.5
psql -At -d "$DB" -f tests/20_concurrence_session2.sql > /tmp/sd_s2.log 2>&1 || true
wait
grep -q "UNAVAILABLE" /tmp/sd_s2.log && echo "OK  concurrence : le 2e paiement simultané est refusé" || { echo "ÉCHEC concurrence"; exit 1; }
