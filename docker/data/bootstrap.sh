#!/usr/bin/env bash

bootstrap() (
  set -euo pipefail

  : "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"
  : "${SAMPLER_PASSWORD:?}" "${RUNNER_PASSWORD:?}" "${READER_PASSWORD:?}" "${RELAYER_PASSWORD:?}"

  local dir file
  dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/scripts"

  psql() {
    command psql --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction \
      --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
  }

  local -a cluster=() stores=()
  for file in "$dir"/cluster/*.sql; do cluster+=(--file "$file"); done
  for file in "$dir"/stores/*.sql; do stores+=(--file "$file"); done

  psql \
    -v sampler_password="$SAMPLER_PASSWORD" \
    -v runner_password="$RUNNER_PASSWORD" \
    -v reader_password="$READER_PASSWORD" \
    -v relayer_password="$RELAYER_PASSWORD" \
    "${cluster[@]}"

  psql "${stores[@]}"
)

bootstrap
