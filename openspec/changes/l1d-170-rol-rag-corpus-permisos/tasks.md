# Tasks — l1d-170-rol-rag-corpus-permisos

## 1. clinical-platform

- [x] 1.1 (test después: migración; el test se escribe primero en el mismo PR y se comprueba en rojo sin la migración) Tests: "research_writer inserta en research.episode_snapshot y recibe permission denied en SELECT y UPDATE [US-040 AC-6]" · Vitest + PostgreSQL real de test.
- [x] 1.2 (test después: migración) Migración de Prisma de privilegios (design D2–D4): `REVOKE ALL` de `rag_corpus` y `rag_corpus_migrator` sobre `auth`, `identity`, `clinical`, `audit`, `research` y `public`; `ALTER DEFAULT PRIVILEGES FOR ROLE <rol de migraciones>` en esos schemas; `research_writer` solo `INSERT`; *timeouts* de `rag_corpus` desde configuración; idempotente y tolerante a roles ausentes en el arnés. Aplicada por los arneses de test de ambos backends. Citarla en `docs/architecture/data-model.md` §9. (clinical-api aplicada con prisma migrate deploy; el arnés de Pytest la aplica en 2.1, diferido a ai-services)
- [x] 1.3 (test después: Compose) Test estático "el servicio rag-orchestrator no tiene credenciales de clinical_api ni de clinical-minio [US-040 AC-5]" sobre `docker compose config --format json` (amplía `infra/docker/__tests__/compose-secrets.test.mjs` si ya lo cubre en parte), *timeout* explícito.
- [x] 1.4 (test después: infraestructura) Humo contra Compose "rechaza rag_corpus desde clinical-net o sin TLS y lo acepta desde corpus-db-net con TLS y SCRAM [US-040 AC-4]" (cliente `psql` efímero, *timeout* explícito).
- [x] 1.5 (hecho sin job nuevo: `integration` e `integration-rag` ya corren 1.1 y 2.1; `ACS_REQUERIDOS` exige US-040:1-3, ver design) Job en `.github/workflows/` que corre 1.1 y 2.1 en cada PR sobre el PostgreSQL de servicio de ARR-01 (L1D-277); si ARR-01 no está en `main`, el job se añade en este PR con su propio servicio PostgreSQL y se anota en el PR.
- [x] 1.6 Refactor (Extract · tests/integration/schema/privilegios-rag-corpus.test.ts:aplicarMigracionDePrivilegios; sin otros cambios): Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-170)`.

## 2. ai-services

- [x] 2.1 (test después: migración; en rojo antes de 1.2) Pytest en `tests/integration/permisos/`, conectado por TLS: "test_rag_corpus_dentro_de_corpus_inserta_y_lee_lo_creado_por_el_migrator" `@pytest.mark.ac("US-040", 1)` (y `CREATE` del runtime → *permission denied*), "test_rag_corpus_select_en_schema_clinico_permission_denied" parametrizado por los cinco schemas `@pytest.mark.ac("US-040", 2)`, el mismo para `rag_corpus_migrator`, y "test_rag_corpus_tabla_futura_en_clinical_permission_denied" `@pytest.mark.ac("US-040", 3)`. Sin mocks (PostgreSQL real).
- [ ] 2.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-170)`.

## 3. cierre

- [ ] 3.1 `openspec validate l1d-170-rol-rag-corpus-permisos --strict`; suites de `clinical-api` y `rag-orchestrator` en verde, job de *permission denied* en verde en la CI. Sin cambios de API (`contracts:verify-provider` no aplica); `run-ai-eval` no aplica.
