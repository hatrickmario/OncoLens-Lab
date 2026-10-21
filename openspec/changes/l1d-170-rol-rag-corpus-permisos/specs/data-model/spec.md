## ADDED Requirements

### Requirement: El rol rag_corpus opera solo dentro del schema corpus
`rag_corpus` MUST poder hacer `INSERT` y `SELECT` sobre las tablas de `corpus` creadas por `rag_corpus_migrator`, y MUST recibir *permission denied* en `SELECT` sobre cualquier tabla de `auth`, `identity`, `clinical`, `audit` y `research`; la CI SHALL ejecutar esta batería en cada PR conectada como `rag_corpus` por TLS.

#### Scenario: Dentro de corpus crear, insertar y leer funciona con el reparto del S1 [US-040 AC-1] [readme §2.5] [ADR-17] (asumido: AC-1 adaptado a S1 resp. 14b)
- **GIVEN** la base de test con las migraciones aplicadas y conexiones TLS como `rag_corpus_migrator` y como `rag_corpus`
- **WHEN** `rag_corpus_migrator` ejecuta `CREATE TABLE corpus.permisos_t(id int)` y `rag_corpus` ejecuta `INSERT` y `SELECT` sobre ella
- **THEN** las tres operaciones funcionan
- **AND** `CREATE TABLE corpus.otra_t(id int)` ejecutado por `rag_corpus` falla con *permission denied*

#### Scenario: rag_corpus no puede leer ningún schema clínico [US-040 AC-2] [AC-T4.4] [OL-01] [RN-10]
- **GIVEN** la misma base de test y una conexión TLS como `rag_corpus`
- **WHEN** ejecuta `SELECT` sobre una tabla de cada schema `auth`, `identity`, `clinical`, `audit` y `research` (un caso de test por schema)
- **THEN** cada consulta falla con *permission denied* (`InsufficientPrivilege`) y no devuelve filas

#### Scenario: rag_corpus_migrator tampoco puede leer los schemas clínicos [US-040 AC-2] [S1 resp. 14b]
- **GIVEN** una conexión TLS como `rag_corpus_migrator`
- **WHEN** ejecuta `SELECT` sobre una tabla de cada uno de esos cinco schemas
- **THEN** cada consulta falla con *permission denied*

### Requirement: Las tablas futuras de los schemas clínicos nacen sin acceso para rag_corpus
La migración de privilegios MUST fijar `ALTER DEFAULT PRIVILEGES` para el rol que ejecuta las migraciones de `clinical-api` en `auth`, `identity`, `clinical`, `audit` y `research`, de modo que una tabla creada después no sea accesible a `rag_corpus`.

#### Scenario: Una tabla nueva en clinical no es legible por rag_corpus [US-040 AC-3] [readme §2.5]
- **GIVEN** la migración de privilegios aplicada
- **WHEN** el rol de migraciones de `clinical-api` crea `clinical.tabla_futura_t(id int)` y `rag_corpus` hace `SELECT` sobre ella
- **THEN** la consulta falla con *permission denied*

### Requirement: rag_corpus solo se conecta desde corpus-db-net con TLS y sin credenciales ajenas
`pg_hba` MUST rechazar a `rag_corpus` desde `clinical-net` o sin TLS y aceptarlo desde `corpus-db-net` con TLS y SCRAM; la definición resuelta del servicio `rag-orchestrator` MUST NOT contener credenciales del rol de `clinical-api` ni de `clinical-minio`.

#### Scenario: Desde clinical-net o sin TLS la conexión se rechaza y desde corpus-db-net con TLS se acepta [US-040 AC-4] [readme §2.4] [SEG-06]
- **GIVEN** el stack de Compose levantado con los secretos de `scripts/setup-secrets.sh`
- **WHEN** un cliente `psql` efímero con la contraseña de `rag_corpus` intenta conectarse desde `clinical-net` con TLS, desde `corpus-db-net` con `sslmode=disable`, y desde `corpus-db-net` con `sslmode=require`
- **THEN** las dos primeras son rechazadas por `pg_hba` y la tercera se acepta con autenticación SCRAM

#### Scenario: El servicio rag-orchestrator no tiene credenciales de clinical-api ni de clinical-minio [US-040 AC-5] [OL-01]
- **GIVEN** el Compose resuelto con `docker compose config --format json` y secretos ficticios
- **WHEN** el test estático lista `environment` y `secrets` del servicio `rag-orchestrator`
- **THEN** no hay ninguna variable ni secreto con la contraseña o la URL del rol `clinical_api`, ni credenciales de `clinical-minio`

### Requirement: research_writer solo inserta en research
`research_writer` MUST poder `INSERT` en `research.episode_snapshot` y MUST recibir *permission denied* en `SELECT` y `UPDATE` (ADR-19).

#### Scenario: research_writer inserta pero no lee ni modifica [US-040 AC-6] [OL-01] [ADR-19]
- **GIVEN** la base de test con la migración de privilegios y una conexión TLS como `research_writer`
- **WHEN** ejecuta `INSERT` de una fila sintética en `research.episode_snapshot`, y después `SELECT` y `UPDATE` sobre esa tabla
- **THEN** el `INSERT` funciona y el `SELECT` y el `UPDATE` fallan con *permission denied*

Regresión [ADR-43, base separada para el corpus] activa desde S6.
