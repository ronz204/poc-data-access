#!/usr/bin/env bash
set -euo pipefail

# BASH_SOURCE en vez de $0: el entrypoint hace `source` de los .sh sin bit de ejecución
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bootstrap_sql="$script_dir/sql/00.bootstrap.sql"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v sampler_password="$SAMPLER_PASSWORD" \
  -v runner_password="$RUNNER_PASSWORD" \
  --file "$bootstrap_sql"
