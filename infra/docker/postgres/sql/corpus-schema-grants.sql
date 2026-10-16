-- Privilegios sobre el schema corpus (US-035, [S1 resp. 14b]). Idempotente.
-- Lo aplica 10-roles.sh al inicializar el volumen y, como dueño de cada base de test, los arneses de L1D-168 y L1D-114.
-- El DDL del corpus lo hace rag_corpus_migrator (Alembic, servicio one-shot); el runtime rag_corpus solo recibe USAGE
-- y su DML llega con la migración de L1D-114 (ALTER DEFAULT PRIVILEGES ejecutado por el migrator sobre sus objetos).
GRANT USAGE, CREATE ON SCHEMA corpus TO rag_corpus_migrator;
GRANT USAGE ON SCHEMA corpus TO rag_corpus;
