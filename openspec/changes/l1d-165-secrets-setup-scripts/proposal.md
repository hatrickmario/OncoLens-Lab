# Proposal — l1d-165-secrets-setup-scripts

## Trazabilidad

L1D-165 · US-035 · FEAT-PL1 (L1D-30) · Sprint 1 · Estimación **3** · — (técnica, PRD §17) ·
SEG-07 (claves), SEG-08 (TLS hacia PostgreSQL), RN-14 (dueña: FEAT-PL1), RN-10 (AC-5), RN-22 ·
ADR-6 (reparto de claves) · OL-01 (`sslmode=require`) · readme §1.4 paso 2, §2.4, §2.5 ·
`docs/architecture/data-model.md` §9 (roles y `pg_hba`) · CLAUDE.md ("Arquitectura: la regla de
ownership", "Comandos", "Datos y repositorio público") · `[S1 resp. 3]` · `[S1 resp. 14b]` · US-035 AC-1…AC-5

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC
> se aceptan (AC-3 idempotencia sin `--rotate`; AC-5 clave ausente → `/health` ≠ `200` con el
> nombre de la variable en el log). Fuente: `backlog/features/FEAT-PL1-plataforma-base.md` y
> `backlog/sprints/S1-refinamiento.md` §1.
>
> **Decidido (usuario, 2026-10-14, Gate 1, `[S1 resp. 14b]`, `backlog/sprints/S1-plan.md` §2):**
> Alembic del corpus corre como un rol nuevo **`rag_corpus_migrator`** (`USAGE, CREATE` solo sobre
> `corpus`, sin acceso a `auth`/`identity`/`clinical`/`audit`/`research`) en un servicio *one-shot*;
> el runtime `rag_corpus` queda con `USAGE` + DML y **desaparece el `GRANT CREATE`** a `rag_corpus`.
> Tampoco hay regla de `pg_hba` para el superusuario por red: la administración es por `local peer`
> (`docker compose exec`). El arnés de tests usa un rol solo con `CREATEDB` en un `pg_hba` del perfil
> test/CI. Sustituye al supuesto D5 anterior (`GRANT USAGE, CREATE … TO rag_corpus`).

## Why

El repositorio es público (RN-14): ningún secreto, clave ni certificado puede versionarse, y cada
entorno necesita los suyos. Sin un generador reproducible no hay stack que levante (US-034 lo
consume), ni JWT de servicio (US-054), ni cifrado de identidad (US-046), ni TLS hacia PostgreSQL
(SEG-08, OL-01). Además, el reparto de secretos por servicio es la primera capa del límite de
seguridad: `rag-orchestrator` nunca debe recibir la clave privada del JWT ni las claves de
identidad (SEG-07, ADR-6).

## What Changes

- **`scripts/setup-secrets.sh`** (bash + `openssl`, sin dependencias de nube): genera en
  `${ONCOLENS_SECRETS_DIR:-infra/docker/secrets}` (ignorado por git) el par ES256 del JWT de
  servicio, la clave AES-256 de identidad, la clave HMAC-SHA256 del índice ciego, las contraseñas de
  `postgres` (superusuario, solo para el *entrypoint* de la imagen), `clinical_api`,
  `research_writer`, `rag_corpus` y `rag_corpus_migrator` `[S1 resp. 14b]`, la CA y el certificado
  TLS del servidor PostgreSQL, el `pg_hba.conf` renderizado desde una plantilla versionada, las
  contraseñas raíz de `clinical-minio` y `milvus-minio` y las de las cuentas sintéticas del seed
  (`seed_doctor_password`, `seed_admin_password`, que `l1d-169-synthetic-demo-seed` lee por
  `SEED_DOCTOR_PASSWORD_FILE` y `SEED_ADMIN_PASSWORD_FILE`). Con `--profile test` genera además
  `pg_test_admin_password` y `pg_hba.test.conf` (perfil test/CI). Valida `PG_TEST_DB_PREFIX` contra
  `^[a-z][a-z0-9_]{2,}$` y rechaza un prefijo que case con `POSTGRES_DB`, `postgres` o `template*`;
  aborta sin escribir nada si no cumple (los arneses de L1D-168 y L1D-114 revalidan con la misma regla). Idempotente: sin
  `--rotate <nombre>` no sobrescribe nada y lo informa. Nunca imprime un valor.
- **PostgreSQL:** plantillas versionadas `infra/docker/postgres/pg_hba.conf.template` (TLS
  obligatorio; `rag_corpus` y `rag_corpus_migrator` solo desde `corpus-db-net`; **sin regla de red
  para `postgres`**, administración solo por `local peer`) y `pg_hba.test.conf.template` (perfil
  test: añade el rol del arnés `oncolens_test_admin` y las reglas con el prefijo
  `PG_TEST_DB_PREFIX`), *entrypoint* que instala la clave TLS con los permisos que exige PostgreSQL, y
  script de inicialización versionado (sin secretos: lee `/run/secrets`) que crea los roles
  `clinical_api`, `research_writer`, `rag_corpus` y `rag_corpus_migrator` con sus atributos (data-model
  §9 y D2), en el perfil test también `oncolens_test_admin` (`LOGIN CREATEDB`, nada más), y el schema
  `corpus` con `GRANT USAGE, CREATE ON SCHEMA corpus TO rag_corpus_migrator` y
  `GRANT USAGE ON SCHEMA corpus TO rag_corpus` (sin `CREATE` para `rag_corpus`) `[S1 resp. 14b]`.
- **Compose (`infra/docker/docker-compose.yml` de L1D-164):** reparto de `secrets:` por servicio
  (D3 de design.md), subredes fijas desde configuración para `clinical-net` y `corpus-db-net`
  (las referencia `pg_hba.conf`), arranque de `postgres` con `ssl=on` y `hba_file` montado, y un
  *override* `infra/docker/docker-compose.test.yml` (perfil test/CI) que monta `pg_hba.test.conf` y
  `pg_test_admin_password`. Los servicios *one-shot* `corpus-migrate` (Alembic, lo define L1D-114) y
  `clinical-seed` (seed, lo define L1D-169) reciben sus secretos según D3; ni `rag-orchestrator` ni
  `clinical-api` en runtime reciben la contraseña del *migrator* ni las del seed.
- **`clinical-api`:** carga de secretos por `*_FILE` con fallo de arranque que nombra la variable
  ausente o vacía y nunca su valor (AC-5).
- **Tests:** test de shell de AC-1…AC-3 en contenedor efímero (incluido el rechazo de un
  `PG_TEST_DB_PREFIX` inválido), test estático de AC-2 sobre `docker compose config`, smoke de AC-4 y
  AC-5 añadido al de US-034, e integración de AC-5 en `clinical-api`.
- **Docs:** `docs/operations/claves.md` (respaldo y rotación; perder la clave de identidad es perder
  la identidad, riesgo de OL-01; administración por `docker compose exec -u postgres postgres psql`), readme §1.4
  paso 2 con el comando y el rol `rag_corpus_migrator` en `data-model.md` §9 `[S1 resp. 14b]`.

## Capabilities

### New Capabilities

Ninguna. `platform-stack` y `platform-observability` las crea el change `l1d-164-compose-stack`
(aún sin archivar); este change les **añade** requisitos, como prevé su proposal ("las historias
de plataforma del S1 que tocan el Compose (US-035 secretos, US-036 CI) pueden ampliar esta
capacidad"). Si se archivara antes que L1D-164, los deltas `ADDED` crean el spec igualmente.

- `platform-stack` (ADDED): generación idempotente de secretos fuera del repositorio (con validación
  de `PG_TEST_DB_PREFIX` y perfil test), reparto de secretos por servicio, TLS obligatorio hacia
  PostgreSQL y administración del superusuario solo por `local peer`.
- `platform-observability` (ADDED): `clinical-api` no queda listo sin sus claves de identidad.

### Modified Capabilities

Ninguna. `[S1 resp. 14b]` deja **intacto** el requisito "Aislamiento del rol rag_corpus" de
`data-model` (`USAGE` solo sobre `corpus` + DML, sin `CREATE`), por lo que el delta anterior
(`MODIFIED`, asumido) se sustituye por uno `ADDED`:

- `data-model` (ADDED): "Rol de migraciones del corpus `rag_corpus_migrator`" — `USAGE, CREATE` solo
  sobre `corpus`, sin acceso a los schemas clínicos, solo desde `corpus-db-net`, usado únicamente por
  el servicio *one-shot* de Alembic; `rag_corpus` sin `CREATE` en ningún schema.

## Bounded contexts

- **clinical-platform:** `scripts/setup-secrets.sh` y sus tests, `infra/docker/postgres/`,
  montajes y redes del Compose, carga de secretos de `clinical-api`, `.gitignore`, docs.
- **ai-services:** sin código. `rag-orchestrator` solo recibe los montajes
  `jwt_service_public.pem` y `pg_rag_corpus_password`; los leen L1D-105 (JWT) y L1D-114 (conexión
  como `rag_corpus`). `pg_rag_corpus_migrator_password` solo lo recibe el servicio *one-shot*
  `corpus-migrate` de L1D-114.
- **frontend:** no se toca. `web` no recibe ningún secreto.

## Dependencias

- ↪ **`l1d-164-compose-stack`** (US-034): crea `infra/docker/docker-compose.yml`, el servicio
  `postgres`, `scripts/smoke/compose-smoke.sh` y fija en su D4 los nombres de secretos y
  `ONCOLENS_SECRETS_DIR`, que se usan **tal cual**; aquí solo se añaden `pg_ca.crt`, `pg_ca.key`,
  `pg_server.crt`, `pg_server.key` y `pg_hba.conf` (AC-1 los exige). Se implementa en la misma
  oleada o justo después: este change edita el Compose de L1D-164.
- 🔗 Consumido por: **`l1d-168-initial-schema-migration`** (US-038: roles, TLS y `pg_hba.conf`
  para `sslmode=require`), **`l1d-114-corpus-catalog-milvus`** (US-058: rol `rag_corpus_migrator` para Alembic y
  `rag_corpus` con `USAGE` + DML en runtime, `[S1 resp. 14b]`), **`l1d-105-service-jwt-auth`** (US-054: par ES256), US-040 (S2:
  `GRANT`/`REVOKE` y *permission denied*), US-046 (S2: AES y HMAC), L1D-166 (US-036: la CI corre el
  test de shell), L1D-203 (US-049: solo vía el stack levantado), **`l1d-169-synthetic-demo-seed`** (US-039:
  contraseñas del seed por `*_FILE`, montadas solo en el *one-shot* `clinical-seed`).
- Sin bloqueos (⛔): la historia cumple la DoR `[S1-refinamiento §1]`.

## Fuera de alcance

- `GRANT`/`REVOKE` sobre los schemas clínicos, `ALTER DEFAULT PRIVILEGES`, `REVOKE ALL ON SCHEMA
  public FROM PUBLIC`, permisos de `research_writer` y los tests de *permission denied* (US-040,
  S2). Regresión [SEG-06] activa desde S2 (US-040 AC-4): `rag_corpus` desde `clinical-net` o sin
  TLS → rechazado.
- Las tablas del catálogo y los `ALTER DEFAULT PRIVILEGES` que dan DML a `rag_corpus` sobre ellas
  (los emite la migración Alembic de L1D-114, como `rag_corpus_migrator`), y la definición de los
  servicios *one-shot* `corpus-migrate` (L1D-114) y `clinical-seed` (L1D-169).
- Uso de las claves: firma y validación del JWT (US-054), cifrado e índice ciego (US-046); aquí
  solo se generan, se montan y se exige su presencia.
- Certificado HTTPS de `web` con CA interna y VPN (readme §1.4 paso 2; FEAT-T4d, S6).
- Rotación con re-cifrado de la identidad (Post-MVP); aquí se documenta y se bloquea.
- Gestor de secretos externo (Vault, KMS): fuera del MVP académico.
- Workflow de la CI que ejecuta los tests (L1D-166, US-036).
