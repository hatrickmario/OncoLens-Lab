#!/bin/sh
# Roles y schema corpus (US-035, data-model §9, [S1 resp. 14b]). Sin secretos en el repositorio:
# las contraseñas se leen de PG_SECRETS_DIR (por defecto /run/secrets) con la orden `cat` que ejecuta psql, de modo
# que no aparecen en los argumentos de ningún proceso ni en el log. Corre una sola vez, al inicializar el volumen,
# como el usuario `postgres` por el socket local (regla `local peer`).
set -eu

export PG_SECRETS_DIR="${PG_SECRETS_DIR:-/run/secrets}"
export PG_RAG_CORPUS_CONNECTION_LIMIT="${PG_RAG_CORPUS_CONNECTION_LIMIT:?falta PG_RAG_CORPUS_CONNECTION_LIMIT}"
export PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT="${PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT:?falta PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT}"
base="${POSTGRES_DB:?falta POSTGRES_DB}"

# Se validan en el shell, antes de que ninguna contraseña llegue a una sentencia (un valor no numérico fallaría
# dentro de la misma sentencia que lleva la contraseña).
exigir_numero() {
  case "$2" in
    '' | *[!0-9]*) echo "10-roles.sh: $1 debe ser un entero positivo" >&2; exit 1 ;;
  esac
}
export PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS="${PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS:?falta PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS}"
export PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS="${PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS:?falta PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS}"
exigir_numero PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS "$PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS"
exigir_numero PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS "$PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS"
exigir_numero PG_RAG_CORPUS_CONNECTION_LIMIT "$PG_RAG_CORPUS_CONNECTION_LIMIT"
exigir_numero PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT "$PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT"

psql -v ON_ERROR_STOP=1 -v base="$base" --username postgres --dbname postgres <<'SQL'
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
\set clinical_api_pwd `cat "$PG_SECRETS_DIR/pg_clinical_api_password"`
\set research_writer_pwd `cat "$PG_SECRETS_DIR/pg_research_writer_password"`
\set rag_corpus_pwd `cat "$PG_SECRETS_DIR/pg_rag_corpus_password"`
\set rag_corpus_migrator_pwd `cat "$PG_SECRETS_DIR/pg_rag_corpus_migrator_password"`
\set rag_corpus_limit `echo "$PG_RAG_CORPUS_CONNECTION_LIMIT"`
\set rag_corpus_migrator_limit `echo "$PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT"`

SELECT format('CREATE ROLE clinical_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'clinical_api_pwd') \gexec
SELECT format('CREATE ROLE research_writer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'research_writer_pwd') \gexec
SELECT format('CREATE ROLE rag_corpus LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT %s PASSWORD %L', (:'rag_corpus_limit')::int, :'rag_corpus_pwd') \gexec
SELECT format('CREATE ROLE rag_corpus_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT %s PASSWORD %L', (:'rag_corpus_migrator_limit')::int, :'rag_corpus_migrator_pwd') \gexec

-- Timeouts de sesión de rag_corpus (US-040, data-model §9): ALTER ROLE ... SET exige superusuario, por eso viven aquí y
-- no en la migración de Prisma (el rol de migraciones es NOCREATEROLE). Valores en milisegundos, de configuración (RN-22).
\set rag_corpus_statement_timeout `echo "$PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS"`
\set rag_corpus_idle_tx_timeout `echo "$PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS"`
SELECT format('ALTER ROLE rag_corpus SET statement_timeout = %s', (:'rag_corpus_statement_timeout')::int) \gexec
SELECT format('ALTER ROLE rag_corpus SET idle_in_transaction_session_timeout = %s', (:'rag_corpus_idle_tx_timeout')::int) \gexec

-- clinical_api es dueño de la base clínica (aplica prisma migrate, L1D-168).
SELECT format('ALTER DATABASE %I OWNER TO clinical_api', :'base') \gexec
SQL

# Perfil test/CI: el rol del arnés de tests, solo con CREATEDB (nada más).
if [ "${ONCOLENS_PG_PROFILE:-}" = "test" ] && [ -f "$PG_SECRETS_DIR/pg_test_admin_password" ]; then
  psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL'
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
\set test_admin_pwd `cat "$PG_SECRETS_DIR/pg_test_admin_password"`
SELECT format('CREATE ROLE oncolens_test_admin LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'test_admin_pwd') \gexec
SQL
fi

# Schema del corpus y sus privilegios: USAGE + CREATE solo para el migrator; el runtime solo USAGE.
psql -v ON_ERROR_STOP=1 --username postgres --dbname "$base" <<'SQL'
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
CREATE SCHEMA IF NOT EXISTS corpus AUTHORIZATION clinical_api;
\i /opt/oncolens/sql/corpus-schema-grants.sql
SQL
