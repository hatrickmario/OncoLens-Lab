## Context

US-247 reúne datos de demo e instalación (OUT-02/03/04/05/07) tras US-242 (extractor) y US-243 (estados con listas). Es
trabajo de datos, seed, guía y *scripts*; no añade código de producto ni cambia ningún `openapi.yaml` (solo ejemplos en
`contracts/examples/`).

## Goals / Non-Goals

**Goals:** metadatos verificados en la demo; pacientes que dan Coincide/Parcial/No coincide; guía con conteos; prueba de
aceptación reproducible; `levantar.sh` que verifica y no borra sin avisar.
**Non-Goals:** OUT-09 (US-222), US-120, revisión humana a escala, cambios de contrato o esquema.

## Decisions

**D1 · Metadatos como dato versionado, no inventado.** Se generan con US-242 sobre el corpus de la demo y se guardan como
datos del corpus público que `levantar.sh` carga; cada valor con `chunkId` y `nliResult` (RN-25). Descartado: escribirlos a
mano en el seed (rompe RN-25).

**D2 · Pacientes en el seed de `clinical-api` (US-039)**, diseñados contra los metadatos y DEC-11 (inclusiva o mezclada →
Parcial; No coincide solo con restricción explícita). Solo sintéticos; el seed se niega a correr en `piloto` (RN-13).

**D3 · Prueba de aceptación con `LLM_PROVIDER=fake`** y respuestas de `contracts/examples/` que citan los fragmentos de la
guía; los conteos esperados salen de la guía (una sola fuente). Descartado: LLM real (no determinista).

**D4 · `levantar.sh` verifica con conteos que publica el seed**, no números fijos en el script; reconstruye la imagen del
perfil `seed` antes de sembrar; con estado previo avisa y pide confirmación (F-07); sin confirmación sale ≠ 0 con la orden
`apagar.sh --borrar-datos`.

**D4b · La verificación del seed nunca usa superusuario ni muestra credenciales (decidido, Gate 1, privacy P2).** Cada
conteo se ejecuta **dentro del contenedor del servicio dueño de su schema y con su propio rol**, que ya tiene la cadena de
conexión en su entorno: `clinical.patient`, `identity.patient_identity` y `auth."user"` con el rol de `clinical-api`
(`docker compose exec clinical-api …`, un script de solo conteo del seed con `count()`); los documentos del corpus con
el rol `rag_corpus` dentro de `rag-orchestrator`. Solo `SELECT count(*)`: nunca filas, columnas ni identidad. Nunca el
rol `postgres` ni otro superusuario. `levantar.sh` no lee, no exporta y no imprime la variable de conexión ni la cadena
de conexión (`set +x` en ese tramo); solo imprime el nombre de cada conteo, el esperado y el obtenido. Descartado: un rol
nuevo de solo lectura (más secretos y `pg_hba` que generar en `scripts/` para el mismo resultado).

**D5 · Tests de scripts (test después):** humo con imagen del seed obsoleta (AC-6) y con volúmenes previos (AC-7), en CI o
como *fixture* de PR.

**D6 · Reglas de población como catálogo versionado (D4-03; Decidido (usuario, 2026-10-31)).** L1D-297 absorbe la deuda 1.1
de L1D-293 con +2 puntos (5 → 7): `poblacion-reglas.json` en `packages/clinical-catalogs` con `catalogHash` y entrada en
`manifest.json`, copia de `test-apl-1.2.0`, esquema y validador, y versión 1.2.0 real en ambos backends (misma versión: si no,
`409`). **Efecto:** sin ese archivo el estado «mezclada» no aparece en producción, de modo que la guía y la prueba de aceptación
de la demo no pueden mostrarlo; por eso el seed y la guía dependen de esta decisión. Disciplina TDD proporcional: catálogo,
esquema y migración de versión = test después; las reglas (estados derivados del archivo) = test primero. Commits
`test(L1D-297)` del AC en rojo antes del `feat(L1D-297)` para las reglas.

**D7 · Verificaciones propuestas sin puntos adicionales (a confirmar).** D4-02: el límite de RSS se refiere al RSS en régimen
estable (tras `gc`, proceso fresco, ≥ 3 repeticiones) medido en el MacBook de 32 GB con el stack completo; los 4489 MiB
(suma de tres RSS medidos por separado en ADR-39) no se usan como `mem_limit` (criterio Decidido (usuario, 2026-10-31)).
D4-08: smoke de la semilla `us-231b` 1.12, muestra de `l1d-117` 2.2 y partición de ADR-45, que necesitan PostgreSQL y Milvus
reales. Ambas se proponen como tareas de verificación de L1D-297 (levanta y verifica el stack), pendientes de confirmación.

## Dependencias y colaboradores

- Depende de `l1d-292` (extractor), `l1d-293` (estados), `l1d-291` (contrato/migración) y US-117b (`--reindex-sparse`).
- Modifica: `scripts/demo/levantar.sh`, `scripts/demo/apagar.sh`, `docs/demo/runbook-demo-S1.md`, seed de `clinical-api`,
  `data/raw/seed/` (metadatos). Crea: `docs/demo/guia-demo-S4.md`, prueba de aceptación y humos de los scripts.
- Colisión probable con `l1d-131`/`l1d-144` si tocan el seed (fixtures de pacientes): coordinar.

## Privacidad y ownership

- Solo pacientes sintéticos del seed y corpus público con licencia aceptada (RN-13, RN-14, RN-21); el escaneo de PII y
  secretos de la CI cubre los datos nuevos. Ningún secreto impreso por `levantar.sh`.
- `rag-orchestrator` sigue sin acceso a datos clínicos: los metadatos se cargan por su CLI al schema `corpus`; el seed clínico
  corre solo contra `clinical-api`. La verificación del seed (D4b) cuenta filas con el rol de cada servicio dentro de su
  contenedor, nunca con superusuario, sin leer identidad y sin imprimir la variable ni la cadena de conexión.
- Logs del script: conteos y nombres de verificación, nunca contenido ni identidad.

## Contratos

Sin cambios en ningún `openapi.yaml` (oasdiff sin diferencias). **Sí hacen falta ejemplos nuevos** en `contracts/examples/`:
los existentes (`rag-query-aplicabilidad-a-m1.json`, `con-evidencia-s4.json`) citan chunks que no son los del corpus de la
demo, y el `LLM_PROVIDER=fake` necesita respuestas fijas que citen los fragmentos de la guía. Por cada par de la guía, un
par `rag-query-request-demo-s4-<par>.json` → `rag-query-demo-s4-<par>.json` (target `RagQueryInternalRequest` /
`RagQueryInternalResponse` del spec de `rag-orchestrator`, mismo patrón que `aplicabilidad-a-m1`), registrados en
`index.json`, en la sección `## contratos` de `tasks.md` con commit `contract(L1D-297)` y `contracts:check` en verde. Esa tarea
va **la primera**: fija los pares antes de cualquier `test`/`feat` (la guía, el seed y la prueba de aceptación los toman de ahí).
Cada respuesta lleva todos los campos obligatorios del spec de `rag-orchestrator` vigente al rebasar; los que añaden después
`l1d-144` (`optionsNotShown`) y `l1d-300` (`queryRewrite`) los pone cada uno al rebasar. Cada `query` de request es distinta de
la pregunta insignia de `rag-query-request.json` y de las demás (`assertFixtureQueriesDistinct()`).
Solo chunks y valores sintéticos/públicos; sin pacientes reales.

## Evaluación

Cambia el contenido del corpus de la demo (metadatos). `run-ai-eval` en el PR para confirmar que recuperación y fidelidad
no regresan; la exactitud de la extracción la mide US-233b/US-118 (muestra humana).

## Risks / Trade-offs

- [Los metadatos reales no producen Parcial/No coincide] → diseñar pacientes contra los metadatos obtenidos; si no alcanza,
  documentos adicionales con licencia aceptada (RN-21).
- [Prueba del AC-2 compleja] → separar la instalación en historia hermana (con aprobación).
- [Borrado accidental] → confirmación obligatoria (F-07).
- **Deuda conocida (privacy, Gate 1, M4):** el paso «Esquema clínico» de `levantar.sh` (`prisma migrate deploy`, ~:101) pasa
  `DATABASE_URL` con la contraseña de `clinical_api` en los argumentos de `docker run -e`, visible en `ps` del host mientras corre.
  Fuera del alcance de este change salvo que se toque esa línea; si se toca, pasar la URL por `--env-file` temporal con permisos
  0600 o leer el secreto dentro del contenedor. Se registra como deuda en el cierre del sprint.

## Pendientes de definir

- **P1 · Ruta/formato de los metadatos versionados** (dueño: implementador; afecta: AC-1, AC-5): propuesta, dentro de
  `data/raw/seed/` junto al manifiesto, formato que consuma `load_seed_corpus`/US-242.
- **P2 · Playwright vs Supertest para el AC-2** (afecta: AC-2): propuesta, Supertest sobre `/platform/evidence-analyses` contra Compose.
