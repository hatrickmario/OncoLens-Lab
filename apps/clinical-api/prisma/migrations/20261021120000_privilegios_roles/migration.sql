-- US-040 (L1D-170): privilegios de los roles de base de datos. docs/architecture/data-model.md §9, readme §2.5, OL-01.
-- SQL escrito a mano (Prisma no expresa GRANT/REVOKE). Idempotente y tolerante a roles ausentes: el arnés de test de
-- algún backend puede no tener todos los roles de US-035. No contiene secretos ni nombres de bases.
--
-- Qué hace, en el orden en que lo hace:
--  1. Quita a rag_corpus, rag_corpus_migrator y research_writer los privilegios por defecto de lo que cree DESPUÉS el
--     rol que ejecuta esta migración (en Compose, clinical_api, dueño de la base): tanto los de cada schema como los
--     GLOBALES, porque un `IN SCHEMA` no elimina un default global. Cubre tablas, secuencias y funciones.
--  2. Quita a rag_corpus y rag_corpus_migrator todo privilegio sobre lo que existe hoy en los cinco schemas clínicos y public.
--  3. PUBLIC: quita su EXECUTE por defecto sobre funciones futuras (es un default global), todo lo que tenga sobre lo
--     existente en los schemas clínicos y su USAGE/CREATE sobre esos schemas y sobre public.
--  4. Base de datos: PUBLIC sin TEMPORARY (el dueño de la base conserva el suyo).
--  5. research_writer: solo USAGE en research e INSERT en research.episode_snapshot (ADR-19).
-- Los timeouts de rag_corpus NO van aquí: ALTER ROLE ... SET exige superusuario o CREATEROLE, que el rol de migraciones
-- no tiene (NOCREATEROLE); viven en infra/docker/postgres/initdb/10-roles.sh.

DO $privilegios$
DECLARE
  schemas_clinicos  CONSTANT text[] := ARRAY['auth', 'identity', 'clinical', 'audit', 'research'];
  schemas_vedados   CONSTANT text[] := schemas_clinicos || ARRAY['public'];
  roles_del_corpus  CONSTANT text[] := ARRAY['rag_corpus', 'rag_corpus_migrator'];
  roles_sin_futuro  CONSTANT text[] := roles_del_corpus || ARRAY['research_writer'];
  rol    text;
  schema text;
BEGIN
  -- 1. Defaults previos de lo que se cree después (globales y por schema).
  FOREACH rol IN ARRAY roles_sin_futuro LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM %I', rol);
    EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM %I', rol);
    EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM %I', rol);
    FOREACH schema IN ARRAY schemas_vedados LOOP
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', schema, rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', schema, rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', schema, rol);
    END LOOP;
  END LOOP;

  -- 2. Lo existente: rag_corpus y rag_corpus_migrator sin ningún privilegio.
  FOREACH rol IN ARRAY roles_del_corpus LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    FOREACH schema IN ARRAY schemas_vedados LOOP
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', schema, rol);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', schema, rol);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema, rol);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', schema, rol);
    END LOOP;
  END LOOP;

  -- 3. PUBLIC: lo que PostgreSQL consulta en cada acceso. El EXECUTE sobre funciones es un default GLOBAL.
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  FOREACH schema IN ARRAY schemas_clinicos LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', schema);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC', schema);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC', schema);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM PUBLIC', schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM PUBLIC', schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM PUBLIC', schema);
  END LOOP;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;

  -- 4. Base de datos: sin TEMPORARY para PUBLIC.
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());

  -- 5. research_writer: solo inserción en research.episode_snapshot.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'research_writer') THEN
    FOREACH schema IN ARRAY schemas_clinicos LOOP
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM research_writer', schema);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM research_writer', schema);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM research_writer', schema);
    END LOOP;
    GRANT USAGE ON SCHEMA research TO research_writer;
    GRANT INSERT ON research.episode_snapshot TO research_writer;
  END IF;
END
$privilegios$;
