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

psql -v ON_ERROR_STOP=1 -v base="$base" --username postgres --dbname postgres <<'SQL'
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

-- clinical_api es dueño de la base clínica (aplica prisma migrate, L1D-168).
SELECT format('ALTER DATABASE %I OWNER TO clinical_api', :'base') \gexec
SQL

# Perfil test/CI: el rol del arnés de tests, solo con CREATEDB (nada más).
if [ "${ONCOLENS_PG_PROFILE:-}" = "test" ] && [ -f "$PG_SECRETS_DIR/pg_test_admin_password" ]; then
  psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL'
\set test_admin_pwd `cat "$PG_SECRETS_DIR/pg_test_admin_password"`
SELECT format('CREATE ROLE oncolens_test_admin LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'test_admin_pwd') \gexec
SQL
fi

# Schema del corpus y sus privilegios: USAGE + CREATE solo para el migrator; el runtime solo USAGE.
psql -v ON_ERROR_STOP=1 --username postgres --dbname "$base" <<'SQL'
CREATE SCHEMA IF NOT EXISTS corpus AUTHORIZATION clinical_api;
\i /opt/oncolens/sql/corpus-schema-grants.sql
SQL
