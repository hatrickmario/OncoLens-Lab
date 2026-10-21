# Design — l1d-277-ci-integracion-servicios-reales

## Context

`scripts/ci/integracion-clinical-api.sh` ya levanta el PostgreSQL de test con secretos ficticios y
corre `scripts/test-integration.sh`. Milvus vive en `docker-compose.yml` (`milvus-etcd`,
`milvus-minio`, `milvus-standalone` v2.6.25). Los tests `servicios_reales` esperan PostgreSQL y Milvus
alcanzables **dentro** de `corpus-db-net` (no hay puertos publicados al host).

## Decisions

### D1. Ejecutar Pytest en un contenedor dentro de las redes del Compose
- **Recomendada:** el script levanta solo `postgres`, `milvus-etcd`, `milvus-minio` y
  `milvus-standalone` con el proyecto `oncolens-ci-rag` y ejecuta `docker compose run --rm` de la
  imagen de `rag-orchestrator` (target de test con `requirements-dev.txt`) con `pytest -m
  servicios_reales --junitxml`, unido a `corpus-db-net` y `ai-net`. Así se respeta "solo `web` publica
  puerto" y el rol `rag_corpus` real.
- Descartadas: publicar puertos de PostgreSQL/Milvus al *runner* (rompe la invariante y difiere de
  local); servicios de GitHub Actions (`services:`) (no reproducen las redes, `pg_hba` ni los roles).

### D1b. Credenciales del contenedor de Pytest: solo `rag_corpus`
El contenedor de Pytest recibe **solo** los secretos de `rag_corpus` (usuario y contraseña por
`*_FILE`, `CORPUS_DATABASE_URL`), los de Milvus de test y la clave **pública** del JWT de servicio
fingida que necesiten los tests; **nada** de `clinical`: ni credenciales de `clinical_app` ni del
superusuario de PostgreSQL, ni claves de cifrado/HMAC de identidad, ni la privada del JWT, ni
`clinical-minio`. Los secretos se montan por archivo solo en ese servicio (`secrets:` del Compose de
test), no como variables del job ni en `env:` del *workflow*. La creación de roles y esquemas la hace
el *init* de `postgres` (con su propio secreto) antes de `run`, fuera del contenedor de Pytest. El
script verifica que el contenedor no tiene montado ningún secreto fuera de esa lista.

### D2. Job aparte y en `ci-ok`
`integration-rag` separado de `integration` (paralelos; ~10 min con Milvus). `timeout-minutes: 30`.
Sin `retries` (CLAUDE.md: sin reintentos en integración).

### D3. Evidencia por AC
El script imprime, desde el JUnit, los tests con marca `ac` y su resultado; el reporte de ARR-01 cita
esa salida para los 7 AC (AC-3).

## Privacidad y ownership

Solo datos sintéticos y corpus semilla con licencia (RN-14, RN-21); secretos ficticios generados en
el *runner*, nunca versionados. El contenedor de Pytest recibe solo credenciales de `rag_corpus` (y
las de test necesarias, D1b), nada de clinical. `rag-orchestrator` sigue con el rol `rag_corpus`
limitado a `corpus` y sin ruta a `clinical-minio` (no se levanta en este job). Sin modelos ni nube: `MODEL_PROVIDER=fake`.

## Contratos

Sin cambios de contrato.

## Dependencias y colaboradores

`integracion-rag-orchestrator.sh` reutiliza las funciones de `scripts/ci/lib/` y
`scripts/setup-secrets.sh`; no duplica la lista de servicios (la lee de un perfil del Compose de test).

## Risks / Trade-offs

- Memoria y tiempo de Milvus en el *runner* (ubuntu-24.04, 16 GB): aceptable; si el arranque es
  inestable se arregla el *healthcheck*, no se reintenta.
- Un test `servicios_reales` que solo pasaba en local por un puerto publicado se corrige en su
  configuración, sin tocar aserciones.

## Open Questions

Ninguna. (El AC-4 queda condicionado al archivo de L1D-140 en ARR-06.)
