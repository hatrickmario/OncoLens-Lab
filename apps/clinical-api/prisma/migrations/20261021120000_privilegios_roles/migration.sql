-- US-040 (L1D-170): privilegios de los roles de base de datos. docs/architecture/data-model.md §9, readme §2.5, OL-01.
-- SQL escrito a mano (Prisma no expresa GRANT/REVOKE). Idempotente y tolerante a roles ausentes: el arnés de test de
-- algún backend puede no tener todos los roles de US-035. No contiene secretos ni nombres de bases.
--
-- Qué hace:
--  1. rag_corpus y rag_corpus_migrator no tienen NINGÚN privilegio sobre auth, identity, clinical, audit, research ni
--     public (REVOKE ALL sobre lo que existe hoy).
--  2. Privilegios por defecto: lo que cree DESPUÉS el rol que ejecuta esta migración (en Compose, clinical_api, dueño
--     de la base) en esos schemas nace sin acceso para esos dos roles ni para PUBLIC (cubre tablas futuras).
--  3. PUBLIC no hereda nada en el schema public (data-model §9, medida 4).
--  4. research_writer: solo USAGE en research e INSERT en research.episode_snapshot (ADR-19); nada en los demás schemas.
-- Los timeouts de rag_corpus NO van aquí: ALTER ROLE ... SET exige superusuario o CREATEROLE, que el rol de migraciones
-- no tiene (NOCREATEROLE); viven en infra/docker/postgres/initdb/10-roles.sh.

DO $privilegios$
DECLARE
  esquemas_clinicos CONSTANT text[] := ARRAY['auth', 'identity', 'clinical', 'audit', 'research'];
  esquemas_vedados  CONSTANT text[] := ARRAY['auth', 'identity', 'clinical', 'audit', 'research', 'public'];
  roles_del_corpus  CONSTANT text[] := ARRAY['rag_corpus', 'rag_corpus_migrator'];
  rol     text;
  esquema text;
BEGIN
  -- 1 y 2. rag_corpus y rag_corpus_migrator: sin acceso a lo existente ni a lo que se cree después.
  FOREACH rol IN ARRAY roles_del_corpus LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    FOREACH esquema IN ARRAY esquemas_vedados LOOP
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', esquema, rol);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', esquema, rol);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', esquema, rol);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', esquema, rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', esquema, rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', esquema, rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', esquema, rol);
    END LOOP;
  END LOOP;

  -- 2. Lo mismo para PUBLIC, que PostgreSQL consulta en cada acceso.
  FOREACH esquema IN ARRAY esquemas_clinicos LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM PUBLIC', esquema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM PUBLIC', esquema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM PUBLIC', esquema);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', esquema);
  END LOOP;

  -- 4. research_writer: solo inserción en research.episode_snapshot.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'research_writer') THEN
    FOREACH esquema IN ARRAY esquemas_clinicos LOOP
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM research_writer', esquema);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM research_writer', esquema);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM research_writer', esquema);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM research_writer', esquema);
    END LOOP;
    GRANT USAGE ON SCHEMA research TO research_writer;
    GRANT INSERT ON research.episode_snapshot TO research_writer;
  END IF;
END
$privilegios$;

-- 3. Nada heredado por PUBLIC en el schema public.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
