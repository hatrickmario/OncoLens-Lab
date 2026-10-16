#!/usr/bin/env bash
# Regla canónica del prefijo de las bases de test (US-035, PG_TEST_DB_PREFIX).
# La usa scripts/setup-secrets.sh y la revalidan los arneses de L1D-168 (Vitest) y L1D-114 (Pytest) con la
# MISMA regex y los mismos nombres reservados; un cambio aquí obliga a actualizar ambos arneses en el mismo PR.
#
# pg_hba.test.conf admite `/^<prefijo>` como base de datos: un prefijo que case con una base que no es de test
# (la base clínica, `postgres`, `template0`, `template1`) daría acceso del arnés a esa base.

PATRON_PREFIJO_TEST_DB='^[a-z][a-z0-9_]{2,}$'

# validar_prefijo_test_db <prefijo> <base-clinica>
# Devuelve 0 si el prefijo es válido; si no, escribe en stderr la variable y el motivo y devuelve 1.
validar_prefijo_test_db() {
  local prefijo="$1" base_clinica="$2" reservada

  if [[ ! "$prefijo" =~ $PATRON_PREFIJO_TEST_DB ]]; then
    echo "PG_TEST_DB_PREFIX no es válido: debe cumplir $PATRON_PREFIJO_TEST_DB" >&2
    return 1
  fi

  for reservada in "$base_clinica" postgres template0 template1; do
    if [[ "$reservada" == "$prefijo"* ]]; then
      echo "PG_TEST_DB_PREFIX=$prefijo casa con la base que no es de test: $reservada" >&2
      return 1
    fi
  done

  if [[ "$prefijo" == postgres* || "$prefijo" == template* ]]; then
    echo "PG_TEST_DB_PREFIX=$prefijo no puede empezar por postgres ni template (bases reservadas)" >&2
    return 1
  fi
}
