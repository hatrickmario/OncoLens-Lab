# Design — l1d-244-eval-aplicabilidad-metadatos

## Context

- El runner `python -m app.evaluation.evaluate --config <ruta> --suite <familia>` (US-072, ADR-41) ya existe en
  `apps/rag-orchestrator/app/evaluation/`: familias `retrieval | generation | pii | all` (`config_suite.SUITES`),
  códigos de salida 0 (correcto), 1 (se negó a correr) y 2 (uso o configuración inválidos), resultados en
  `eval/results/<fecha>-<hashConfig>[-<suite>].json`, guardas de dataset sintético (`guardas.py`) y metas de solo
  lectura en `eval/configs/metas-iniciales.yaml`.
- `ApplicabilityService.evaluar(documentos, contexto, tipo)` llega con `l1d-127-estado-criterio-estructurado` (regla
  pura en `app/domain/applicability_rules.py`, `CriterioEvaluado`, `patientValue` copiado por `destination`, D6 sobre
  `citedSources`), la rama textual con LLM y NLI con `l1d-128-aplicabilidad-textual-citada` y las causas y avisos con
  `l1d-129-aplicabilidad-causas-avisos`.
- La muestra humana `data/evaluation/corpus-metadatos/<release>.yaml` (cabecera + `campos: [{campo, valor, revision,
  nota}]`) la escribe `l1d-117-metadatos-poblacion-verificados` (D5); su revisión es tarea `[HUMANO]` del usuario
  `[S3 resp. 13]`.
- `CORPUS_CUTOFF_DATE` existe en la configuración del orquestador (`.env.example`) y el cargador publica con ella la
  `CorpusRelease` (`corpus-ingestion`). US-119 sigue `si-hay-capacidad`, de ahí la versión por configuración
  `[S3 resp. 8]`.

- **Decisión del usuario `[S3 resp. 16]` (2026-10-24, hallazgos del Gate 1 del S3):** M-08.2 se nombra como en el
  PRD §18 («Criterios en "Coincide" sin cita»); el dataset depende del `studyKey` de `l1d-126` para las claves de
  `population_criteria`; P1 aceptado: "con metadatos" = al menos una clave distinta de `no_disponible`.

## Goals / Non-Goals

**Goals:** una familia `aplicabilidad` determinista que mida M-08.2, M-08.3, M-08.4, M-08.6 y la concordancia de
estados, que bloquee en M-08.2/M-08.6 > 0 y que reutilice las guardas, el reloj inyectado y el formato del reporte
existentes.

**Non-Goals:** medir con LLM y NLI reales (US-233, S4), cambiar metas existentes, medir por opción u orden (US-140,
US-142), concordancia del oncólogo (M-08.1), usar la `CorpusRelease` como versión (US-119 AC-5).

## Decisions

**D1 · Familia nueva en el runner existente.** `SUITES` gana `aplicabilidad` (y `all` la incluye). La composición
(`composicion_suite.py`) arma `ApplicabilityService` con los mismos puertos que producción: `CatalogoClinico` desde el
catálogo de test, `CorpusCatalogReader` (en memoria a partir del dataset en la configuración falsa; adapter real del
schema `corpus` en integración) y el LLM y el NLI de aplicabilidad falsos de FX-08b-a (bordes). No se instancia
`RAGOrchestratorService`: la aplicabilidad se evalúa por par paciente-fuente sin recuperación, que ya mide la familia
`retrieval`. Descartado: medirla a través de `/rag/query` completo (acopla la métrica al recuperador y al umbral y
vuelve opaco qué criterio falló).

**D2 · Dataset `data/evaluation/aplicabilidad/`.** `manifest.json` (`clase: sintetico`, `catalogVersion:
test-apl-1.0.0`, `version`), `contextos/*.json` (contexto desidentificado con la forma de `clinicalContext`: A-M1 y un
paciente de próstata P-A1), `fuentes/*.json` (documento, `population_criteria`, `metadata_source`, chunks) y
`pares.yaml` (paciente, fuente, guion del LLM y estado esperado por criterio con su causa). Las claves de
`population_criteria` en `fuentes/*.json` son las que nombra el `studyKey` de cada criterio en `test-apl-1.0.0`
(`l1d-126`; p. ej. `biomarcadores.her2`), las mismas que escribe la ingesta de `l1d-117` (D7) `[S3 resp. 16]`; la
carga del dataset falla con código 2 si un `studyKey` del catálogo no resuelve en ninguna fuente que declare
criterios. Verdad conocida = el
resultado esperado de FX-08b-a más los criterios de próstata del catálogo de test de `l1d-126`. DEC-11 en
`propuesta_revisada`: si la sesión del S4 cambia el catálogo, solo se regeneran los esperados.

**D3 · Métricas puras con nombre propio** en `app/evaluation/metricas/aplicabilidad.py`:
`concordancia_de_estados(esperados, obtenidos)`, `coincide_sin_cita(criterios)` (M-08.2, «Criterios en "Coincide" sin
cita» del PRD §18; clave del reporte `criterios_coincide_sin_cita`) (un criterio en `coincide` cuenta si
`citedSources` está vacío; la cita debe pertenecer a un chunk de la fuente del par, igual que en RN-01) y
`valores_no_copiados(criterios, contexto)` (compara `patientValue` con el valor que el resolvedor de destino lee del
contexto **enviado**; `null` en ambos = copiado). Las métricas nulas se reportan `null`, nunca `0.0`.

**D4 · Bloqueo con código propio.** `veredicto_de_invariantes(metricas) -> list[str]` devuelve las métricas violadas;
el runner escribe el reporte y sale con **código 3** ("invariante violada"), distinto de 1 y 2, para que la CI
distinga una violación de un dataset mal formado. Los ceros son invariantes del PRD: no van a `regression.yaml` ni a
las metas.

**D5 · Cobertura M-08.3 por puerto.** Puerto `LectorDeCoberturaDePoblacion.cobertura() -> CoberturaDePoblacion
(vigentes, con_criterios)` en `app/application/ports.py`; adapter SQL en `app/infrastructure/catalog/` con el rol
`rag_corpus` (`SELECT count(*) … FROM corpus.corpus_document WHERE is_current`, con criterios = al menos una clave de
`population_criteria` distinta de `no_disponible`, P1 aceptado `[S3 resp. 16]`; un documento `metadata_source =
pendiente` de `l1d-117` tiene todo `no_disponible` y cuenta en el denominador, no en el numerador); adapter en memoria para la configuración falsa. La versión se lee
de `CORPUS_CUTOFF_DATE` (ajustes del orquestador) y se reporta como `corpusVersion`. Meta en
`eval/configs/metas-iniciales.yaml` (`cobertura_poblacion: {minimo: 0.90}`) y la de exactitud
(`exactitud_extraido_verificado: {minimo: 0.95}`); son metas nuevas, no se modifica ninguna existente.

**D6 · Exactitud M-08.4 desde la muestra.** Lector en `app/evaluation/revision_muestra.py` con ruta en la
configuración de la suite (`corpus_metadatos.revision`); en test apunta a una muestra sintética de `tests/fixtures/`.
Exactitud = `correcto / (correcto + incorrecto)`; `pendiente` se cuenta aparte; archivo ausente o todo pendiente →
`null` + causa, sin fallar (la revisión puede no estar hecha en el S3 o no haber documentos `extraido_verificado`,
P1 de `l1d-117`). Valor desconocido de `revision` → código 2. El reporte nunca copia `valor` ni `nota`.

## Privacidad y ownership

- Todo corre dentro de `rag-orchestrator` sobre datos sintéticos; no cruza ninguna frontera web → clinical-api →
  rag-orchestrator. Los contextos del dataset tienen ya la forma desidentificada (sin identidad, `pseudoPatientId` por
  par, fechas relativas, RN-11).
- M-08.3 lee solo el schema `corpus` con el rol `rag_corpus`; ningún acceso a datos clínicos ni a `clinical-minio`.
- El reporte y los mensajes solo llevan agregados, nombres de métricas e IDs de documento del corpus público (RN-14);
  ni `patientValue`, ni valores de metadatos, ni textos de chunks. La guarda `clase: sintetico` se aplica también al
  manifiesto del dataset de aplicabilidad.

## Contratos

Sin cambio de `apps/rag-orchestrator/openapi.yaml` ni de `apps/clinical-api/openapi.yaml`, ni de
`contracts/examples/`. El reporte de `evaluate` amplía `esquema_suite.py` (esquema interno del resultado, no contrato
HTTP) con la sección `aplicabilidad`; oasdiff no aplica; compatible con ADR-26.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `app/evaluation/config_suite.py` | familia `aplicabilidad`; sección `corpus_metadatos` | — |
| `app/evaluation/composicion_suite.py` | `componer_aplicabilidad()` | puertos `CatalogoClinico`, `CorpusCatalogReader`, LLM y NLI de aplicabilidad, `LectorDeCoberturaDePoblacion` |
| `app/evaluation/metricas/aplicabilidad.py` | nuevo: D3 y `veredicto_de_invariantes()` | tipos de dominio (`CriterioEvaluado`) |
| `app/evaluation/revision_muestra.py` | nuevo: D6 | — |
| `app/evaluation/evaluate.py`, `armado_reporte.py`, `esquema_suite.py` | rama de la familia, código 3, sección del reporte | lo anterior |
| `app/application/ports.py` + `app/infrastructure/catalog/` | puerto y adapter SQL de cobertura (D5) | rol `rag_corpus` |
| `app/evaluation/adaptadores_falsos.py` | cobertura en memoria; LLM/NLI de aplicabilidad si `l1d-128` no los deja en `tests/support/` | — |

Reglas con nombre propio: `coincide_sin_cita()` (RN-01, M-08.2), `valores_no_copiados()` (ADR-34, M-08.6),
`veredicto_de_invariantes()`.

## Evaluación

Añade una familia y dos metas nuevas; no cambia modelo, prompt, umbral, catálogo real ni corpus. Métricas OL-06
afectadas: M-08.2, M-08.3, M-08.4, M-08.6 (nuevas) y concordancia de estados (AC-T5.1). `run-ai-eval` se ejecuta en el
PR para confirmar que las familias existentes dan las mismas métricas (huella de configuración aparte). La medición
con modelos reales es de US-233 (S4).

## Risks / Trade-offs

- [El dataset depende de la forma de `CriterioEvaluado` de tres changes en curso] → se implementa después de
  `l1d-127`, `l1d-128` y `l1d-129`; el dataset se regenera desde FX-08b-a si cambian.
- [Con fakes, M-08.2 y M-08.6 siempre valen 0] → es la regresión buscada; el bloqueo se prueba con resultados
  construidos (tipos de dominio, no mocks) y la medición real llega con US-233.
- [La muestra humana puede no existir en el S3] → M-08.4 `null` con causa, sin bloquear; se mide cuando el usuario
  complete la revisión.
- [Criterio de "con metadatos" para M-08.3] → "al menos una clave distinta de `no_disponible`", aceptado
  `[S3 resp. 16]`.
- [`studyKey` de `l1d-126` cambia] → el dataset se regenera (dato, no lógica) y la carga lo detecta (D2).

## Pendientes de definir

- ~~P1 · Definición de documento "con metadatos de población" en M-08.3~~ → **aceptado** `[S3 resp. 16]`: al menos
  una clave de `population_criteria` distinta de `no_disponible` (D5).
- **P2 · Cita de un criterio estructurado en `coincide`** (dueño: `l1d-127` Q4; afecta: AC-1/AC-2). M-08.2 asume que
  todo `coincide` estructurado trae la `CitedSource` del documento (D6 de `l1d-127`); si Q4 se resuelve con `[]`,
  M-08.2 tendría que contar el enlace al dato estructurado como cita.
- ~~P3 · Grafía de M-08.2~~ → **decidido** `[S3 resp. 16]`: «Criterios en "Coincide" sin cita» (PRD §18) en todo
  este change; la "concordancia de estados" es la métrica de AC-T5.1, sin ID M-08.x.
