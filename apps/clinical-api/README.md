# clinical-api

Backend 1 de OncoLens (Express 5 + TypeScript). Dueño de PostgreSQL y `clinical-minio`.

## Seed sintético de demo (US-039)

Carga los usuarios de demo (`doc1@test.local` con rol `doctor`, `admin@test.local` con rol `admin`) y los cinco
pacientes sintéticos (a)–(e) de OL-01. Es idempotente (identificadores UUID v5 deterministas y `upsert`; el hash de una
contraseña se calcula solo si el usuario no existe) y escribe en una sola transacción. Todos los datos son sintéticos
(`data_origin = sintetico`, `entry_method = seed`); no escribe `identity.patient_identity` (llega con US-046). Los
códigos CIE-10/LOINC/ATC salen solo de `packages/clinical-catalogs`; un término sin entrada queda `no_mapeado`.

### Variables

| Variable | Uso |
|---|---|
| `APP_ENV` | Obligatoria. El seed corre solo si está en `SEED_ALLOWED_ENVS` (por defecto `local,test`); **nunca en `piloto`**. |
| `REAL_ANONYMIZED_ENABLED`, `REAL_IDENTIFIED_ENABLED` | Con `true` el seed se niega, sea cual sea `APP_ENV` (RN-13). |
| `SEED_DOCTOR_PASSWORD_FILE`, `SEED_ADMIN_PASSWORD_FILE` | Archivos con las contraseñas (prioritarios; los genera `scripts/setup-secrets.sh`). |
| `SEED_DOCTOR_PASSWORD`, `SEED_ADMIN_PASSWORD` | Respaldo **solo local**, fuera de Compose. Sin archivo ni variable el seed falla nombrando `SEED_*_PASSWORD_FILE`. |
| `SEED_REFERENCE_DATE` | Fecha (AAAA-MM-DD) a la que son relativas las fechas clínicas; reloj congelado, sin `Date.now()`. |
| `CLINICAL_CATALOG_PATH` | Catálogo clínico de solo lectura (por defecto `packages/clinical-catalogs`). |
| `CLINICAL_DATABASE_URL` (sin credenciales), `PG_CLINICAL_API_PASSWORD_FILE`, `CLINICAL_DATABASE_CA_FILE` | Conexión como `clinical_api` con TLS verificado. |
| `ARGON2_MEMORY_COST_KIB`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM` | Parámetros de Argon2id (los mismos del login). |

### Cómo ejecutarlo

- Compose (recomendado): `docker compose -f infra/docker/docker-compose.yml --profile seed run --rm clinical-seed`. El
  servicio *one-shot* `clinical-seed` (perfil `seed`: no arranca con `up`) es el único que monta las contraseñas del
  seed y ejecuta el seed compilado. Necesita el esquema clínico ya migrado.
- Local: `npx prisma db seed` (ejecuta `tsx prisma/seed.ts`, registrado en `prisma.config.ts`).

El seed no escribe en `piloto` ni con `REAL_*_ENABLED=true`: aborta con código distinto de 0 antes de abrir la base.
