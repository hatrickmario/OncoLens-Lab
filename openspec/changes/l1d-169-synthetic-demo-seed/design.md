# Design — l1d-169-synthetic-demo-seed

## Contexto

US-039 (OL-01, tarea 8) siembra el esquema que crea `l1d-168-initial-schema-migration` con los cinco
pacientes sintéticos de OL-01 y los usuarios de demo del *walking skeleton*. Decisiones que se aplican
sin reabrirlas:

- **DEC-05**, validada `[S1 resp. 1]`: gradación en `clinical.diagnosis_grading`; `Diagnosis.grade` es
  texto derivado con formato canónico (`"Gleason 4+3=7 · ISUP 3"`, `"Nottingham grado 2"`), nunca
  escrito a mano. El seed lo **deriva** de la gradación de referencia con la misma regla que usará
  US-110 / FEAT-01b.
- **DEC-04** (2026-10-09): CIE-10, LOINC y ATC (y CUPS) permitidos con aviso; *workaround* Q-07 sin
  efecto. Los códigos solo salen del catálogo (RN-27).
- **readme §6.1 #2**: `entry_method = seed`, solo fuera del entorno piloto.
- **Slicing v2**: sin identidad en el S1 (US-046, S2); el catálogo lo monta de solo lectura L1D-164 en
  ambos backends y el `409` por versión llega en el S2 (US-041).

Los valores clínicos de (a) y (b) se alinean con los ejemplos congelados de `contracts/examples/`
(`patient-summary-doctor.json`, `rag-query-request.json`, `diagnosis-con-gradings.json`,
`case-view.json`): (a) carcinoma ductal infiltrante, Nottingham grado 2; (b) adenocarcinoma acinar,
Gleason 4+3=7 · ISUP 3, ADT. Así los mocks de MSW construidos desde `contracts/examples/` (US-213) no
divergen de la base sembrada.

## Decisiones

1. **Estructura**: `prisma/seed.ts` es solo el punto de entrada (lee configuración, aplica la guarda,
   crea el cliente, llama a `sembrar()`). Los datos de cada paciente viven en
   `prisma/seed/pacientes/<a…e>.ts` como objetos con **términos canónicos**, sin códigos. Recomendado
   frente a un JSON único (pierde tipos) o SQL crudo (no reutiliza Prisma ni la regla de `grade`).
2. **Idempotencia por identificadores deterministas**: cada registro sembrado tiene un UUID derivado
   (UUID v5 sobre un *namespace* fijo del seed + clave natural, p. ej. `paciente-a/diagnostico-1`) y se
   escribe con `upsert`. Descartados: "borrar y volver a crear" (cambia IDs y viola `ON DELETE RESTRICT`)
   y "comprobar si existe el primero" (frágil ante seeds parciales).
3. **Toda la escritura en una transacción** (`prisma.$transaction`): un fallo a mitad no deja un seed
   parcial.
4. **Guarda de entorno antes de Prisma**: `assertSeedPermitido(config)` es una función pura que recibe la
   configuración ya leída; `seed.ts` la llama **antes** de instanciar `PrismaClient`. Entornos
   permitidos: lista en configuración (`SEED_ALLOWED_ENVS`, por defecto `local,test`); `piloto` siempre
   se rechaza aunque alguien lo añada a la lista (RN-13). `APP_ENV` ausente → rechazo.
   `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true` → rechazo, sea cual sea `APP_ENV`
   (`[S1 resp. 14b]`): un entorno con datos reales habilitados nunca recibe datos `seed`; ausentes o
   `false` → no bloquean.
5. **Reloj inyectado**: las fechas clínicas son relativas a `SEED_REFERENCE_DATE` (configuración; por
   defecto la fecha fija de los *fixtures*), nunca `Date.now()`. Los tests la congelan.
6. **Resolución de códigos**: `resolverCodigoDelCatalogo(catalogo, estandar, terminoCanonico)` pura,
   devuelve `{ codigo, nombreOficial, mappingStatus: 'mapeado' }` o
   `{ codigo: null, mappingStatus: 'no_mapeado' }`. El catálogo se lee del directorio
   `packages/clinical-catalogs` (ruta por `CLINICAL_CATALOG_PATH`, por defecto la del monorepo) con un
   lector mínimo de solo lectura; el montaje es de L1D-164 y el `409`, de US-041.
7. **Subconjunto mínimo del catálogo**: este change es el **creador único** de
   `packages/clinical-catalogs/manifest.json` (campo `version`, que leen L1D-103 y L1D-180/L1D-193).
   Se crea con la estructura de US-041 (`manifest.json`,
   `mama/codigos.json`, `prostata/codigos.json`) y solo los códigos que usa el seed (p. ej., CIE-10 de
   mama y próstata, LOINC de HER2/RE/PSA, ATC del ADT), cada entrada con `codigo`, `nombreOficial`
   (literal de la fuente de DEC-04), `etiquetaEs` (propia, en campo aparte) y `fuente`/`version`. Lo que
   no se pueda verificar en la fuente oficial **no entra** y el dato queda `no_mapeado`: es preferible a
   un nombre no literal (DEC-04). Al menos un término del seed queda deliberadamente sin entrada (p. ej.,
   un biomarcador de (c)) para ejercer el AC-4 sobre datos reales del seed.
8. **Usuarios** (decidido, usuario, 2026-10-20: el seed **adopta** el *hasher* `createPasswordHasher()` y el usuario `doc1` que L1D-197 ya creó como *fixture* local de tests): `doc1@test.local` y `admin@test.local`, Argon2id con los parámetros que fije US-211
   (si aún no existen: los por defecto de la librería `argon2`); roles `doctor` y `admin` por *upsert* en
   `auth.role` con sus permisos de `data-model.md` §8. La contraseña se re-hashea solo si el usuario no
   existe (idempotencia: no cambia `password_hash` en cada ejecución).
9. **(d) opt-out**: `recorded_by = admin@test.local`, `external_reference` sintético
   (`OPTOUT-SEED-D`), `reason_code` nulo (TBD-21).
10. **Contraseñas por archivo y proceso *one-shot*** (`[S1 resp. 14b]`): `seedConfig` resuelve cada
   contraseña con `leerSecreto(env, nombre, readFile)` — si `<NOMBRE>_FILE` está definida, lee el
   archivo (inexistente o vacío → error que nombra `<NOMBRE>_FILE`) e **ignora** la variable directa;
   si no, usa `<NOMBRE>` como respaldo local fuera de Compose; sin ninguna → error que nombra ambas. El
   valor vive solo en memoria hasta el hash. En Compose el seed corre en el servicio *one-shot*
   `clinical-seed` (imagen de `clinical-api`, `restart: "no"`, `clinical-net`; secretos de L1D-165
   D3), que solo recibe `*_FILE` y termina; `clinical-api` en runtime no monta las contraseñas del
   seed. Descartado: montarlas en `clinical-api` (quedarían legibles durante toda la vida del proceso).

## Privacidad y ownership

- **Fronteras**: el seed es un proceso de `clinical-api` que escribe solo en PostgreSQL (schemas `auth` y
  `clinical`). Nada cruza a `rag-orchestrator` ni a `clinical-minio`; `rag-orchestrator` no ve estos datos
  (RN-10) y, aunque L1D-164 le monta `packages/clinical-catalogs` de solo lectura, no lo lee en este change.
- **Solo datos sintéticos** (RN-13, RN-14): `data_origin = sintetico`, `source_dataset = seed`, convenio
  sintético (`CONV-SEED-01`), sin nombres, documentos ni teléfonos (no hay identidad en el S1). Ningún
  valor proviene de un paciente real.
- **Secretos**: las contraseñas solo existen en los archivos de `scripts/setup-secrets.sh` (US-035),
  montados únicamente en el *one-shot* `clinical-seed` (o, como respaldo local, en una variable de
  entorno fuera de Compose), y en memoria durante el hash `[S1 resp. 14b]`; nunca en el repo, en logs ni en mensajes de error (solo el nombre de la
  variable ausente).
- **Logs**: el seed registra conteos por tabla y UUID, nunca valores clínicos ni correos.
- **Datos reales (RN-13)**: la guarda rechaza cualquier `REAL_*_ENABLED=true` antes de abrir la base.
- **Desidentificación** (RN-11): no aplica; el seed no genera contexto hacia la IA.

## Contratos

Sin cambios en `apps/*/openapi.yaml` ni en `contracts/`. Proveedor: ninguno. Los ejemplos existentes de
`contracts/examples/` se usan como referencia de valores (sección Contexto), sin editarlos.

## Dependencias y colaboradores

- `prisma/seed.ts` → `config/seedConfig` (lectura y validación Zod de `APP_ENV`, `SEED_ALLOWED_ENVS`,
  `REAL_ANONYMIZED_ENABLED`, `REAL_IDENTIFIED_ENABLED`, `SEED_REFERENCE_DATE`, `SEED_*_PASSWORD_FILE`
  con respaldo `SEED_*_PASSWORD`, `CLINICAL_CATALOG_PATH`; lector de archivos inyectado) → `assertSeedPermitido()` →
  `PrismaClient` → `sembrar(prisma, catalogo, reloj, hasher)`.
- `sembrar()` recibe sus colaboradores por parámetro (sin contenedor de DI): el cliente de Prisma real,
  el catálogo leído, un reloj y un *hasher* de contraseñas.
- Reglas con nombre propio (extraídas y probadas en un solo lugar):
  - `assertSeedPermitido()` (RN-13: `APP_ENV` y `REAL_*_ENABLED`).
  - `leerSecreto()` (prioridad `*_FILE` sobre la variable directa).
  - `resolverCodigoDelCatalogo()` (RN-27).
  - `derivarTextoGrade()` (DEC-05): formato canónico de `Diagnosis.grade` desde la gradación de
    referencia; queda como función pura reutilizable por US-110 / FEAT-01b.
  - `idSembrado(claveNatural)` (determinismo, UUID v5).
- Sin dependencia de módulos de `src/modules/*` (el seed no pasa por services de dominio en el S1).

## Evaluación

El change **crea** datos del catálogo, pero en el S1 sus códigos no alimentan ningún análisis (L1D-164 lo monta y
L1D-103 solo lee la `version` de `manifest.json`) y la suite `evaluate` y su baseline llegan en el S2. Métricas OL-06 potencialmente
afectadas cuando sus códigos se consuman: mapeo terminológico (≥ 0,95). Se registra "no aplica en S1"; `run-ai-eval`
corre en el primer PR de US-041 que consuma este subconjunto.

## Riesgos

- **Nombres oficiales no literales** en el catálogo (DEC-04): mitigado por la regla "sin fuente
  verificada → no entra → `no_mapeado`".
- **Deriva con l1d-168**: si la migración cambia nombres de enums o columnas, el seed falla en los tests
  de integración (detección temprana, deseable).
- **Choque con US-211** por los parámetros de Argon2id o por quién añade `argon2`: se coordina en la
  oleada; el seed solo usa la API de hash de la librería.
