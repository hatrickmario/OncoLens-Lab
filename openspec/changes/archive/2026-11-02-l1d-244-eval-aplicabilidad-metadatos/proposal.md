# Proposal — l1d-244-eval-aplicabilidad-metadatos

## Trazabilidad

L1D-244 · US-132 · FEAT-T5b (L1D-47) · Sprint 3 · Estimación **5** · FR-20 (ampliación de datasets y métricas, OL-06)
· AC-T5.1 (aplicabilidad con verdad conocida) · M-08.2 («Criterios en "Coincide" sin cita» = 0, nombre del PRD §18) ·
M-08.3 (fuentes con metadatos de población ≥ 0,90, propuesta) · M-08.4 (exactitud de `extraido_verificado` ≥ 0,95, propuesta) · M-08.6
(valores del paciente no copiados del contexto = 0) · RN-22 · RN-25 · RN-14 · TBD-20 · ADR-41 · ADR-34 · US-132
AC-1…AC-5 · `[S3 resp. 8]` (AC-3 con la versión del corpus por configuración `CORPUS_CUTOFF_DATE`; el AC original
sobre la `CorpusRelease` vigente → US-119 AC-5, `si-hay-capacidad`) · `[S3 resp. 13]` (AC-4 consume la revisión humana
de la muestra de US-118 hecha por el usuario) · DEC-11 (US-021) sobre `propuesta_revisada` `[S3 resp. 1]` · ⛔ ADR-39
(NLI y LLM reales solo para la medición final; los AC usan adaptadores falsos) · 🔗 Mide a: FEAT-08b, FEAT-06c ·
Reordenamiento del 2026-10-23 (S5 → S3) · `[S3 resp. 16]` (2026-10-24, Gate 1: nombre de M-08.2 alineado con el
PRD, dependencia con `studyKey` de L1D-126, P1 "con metadatos" aceptado).

## Por qué

La hipótesis de aplicabilidad del S3 (US-122…US-125) solo se sostiene si se demuestra con números que la aplicabilidad
nunca afirma una coincidencia sin cita ni inventa un valor del paciente, y que el corpus trae metadatos de población
suficientes y correctos para comparar. Hoy la suite `evaluate` (US-072) mide recuperación, generación y privacidad,
pero no tiene dataset ni métricas de aplicabilidad ni de metadatos del corpus; sin ellas un cambio de catálogo, prompt
de aplicabilidad o corpus podría introducir coincidencias sin soporte sin que la CI lo detecte.

## Qué cambia

- **Dataset sintético `data/evaluation/aplicabilidad/`** (manifiesto `clase: sintetico`): pares paciente-fuente con el
  estado esperado por criterio, derivados de FX-08b-a (paciente A-M1 × `doc-a1`…`doc-a5`, catálogo `test-apl-1.0.0`) y
  ampliados con un paciente de próstata y los guiones del LLM falso de aplicabilidad (`APL-OK`, `APL-SIN-SOPORTE`,
  `APL-VALOR-PACIENTE`, `APL-CITA-AJENA`).
- **Familia nueva `aplicabilidad` del runner** (`evaluate --suite aplicabilidad`): invoca el servicio de aplicabilidad
  en proceso con contextos desidentificados del dataset y reporta: porcentaje de criterios con el estado esperado,
  M-08.2 («Criterios en "Coincide" sin cita», clave `criterios_coincide_sin_cita`) y M-08.6 (valores del paciente que no coinciden con el contexto enviado).
- **Bloqueo por invariante**: M-08.2 > 0 o M-08.6 > 0 → la suite termina con un código de salida distinto de 0 que
  nombra la métrica.
- **Métrica de cobertura de población (M-08.3)**: con la versión del corpus fijada en configuración
  (`CORPUS_CUTOFF_DATE`), porcentaje de documentos vigentes del catálogo del corpus con al menos una clave de
  `population_criteria` distinta de `no_disponible` (definición aceptada `[S3 resp. 16]`), frente a una meta en configuración (0,90, propuesta).
- **Métrica de exactitud de `extraido_verificado` (M-08.4)**: lee el archivo de revisión humana de la muestra que
  produce US-118 (`data/evaluation/corpus-metadatos/<release>.yaml`) y reporta exactitud y tamaño de la muestra frente a
  una meta en configuración (0,95, propuesta).
- **Reproducibilidad**: con la configuración falsa, dos corridas dan métricas deterministas idénticas.
- **Configuración propia** `eval/configs/test-aplicabilidad.yaml` (dataset, catálogos, metas y fecha de corte): la huella de
  `test-fake.yaml` y `data/evaluation/baseline.json` no cambian y `--suite all` no incluye la familia nueva (no se regenera
  el baseline; la familia no entra en la comparación de `eval-required`, cuyo cableado a la CI es de `scripts/ci`).
- Sin cambio de contrato HTTP, de esquema del catálogo del corpus ni de Milvus.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `ai-evaluation` (ADDED: familia `aplicabilidad` con dataset de verdad conocida; bloqueo por M-08.2 y M-08.6; cobertura
  de metadatos de población con la versión del corpus por configuración; exactitud de `extraido_verificado` desde la
  muestra revisada; reproducibilidad de la familia). Los requisitos existentes del runner (reporte, solo sintéticos,
  métricas deterministas, metas sin modificar) no cambian y se aplican a la familia nueva como regresión.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator/app/evaluation/` (familia, métricas, lector de cobertura y de revisión,
  configuración), `apps/rag-orchestrator/eval/configs/` (metas y configuración falsa), `data/evaluation/aplicabilidad/`
  y tests Pytest.
- **clinical-platform**: no se toca.
- **frontend**: no se toca.

## Dependencias

- ↪ `l1d-127-estado-criterio-estructurado` (US-122, mergeado en #214): `ApplicabilityService`, `CriterioEvaluado`, `patientValue`
  copiado, lectura de `population_criteria`. La familia lo invoca; va **después**.
- ↪ `l1d-128-aplicabilidad-textual-citada` (US-123, en la pila bajo L1D-130; PR #217/#220): rama textual con cita y NLI, puerto del LLM de aplicabilidad y los
  guiones del LLM falso de FX-08b-a.
- ↪ `l1d-129-aplicabilidad-causas-avisos` (US-124): causas del desconocido y avisos por criterio que el dataset espera.
- ↪ `l1d-126-criterios-aplicabilidad-catalogo` (US-121): catálogo `test-apl-1.0.0`, su validación y el `studyKey` de
  cada criterio; las claves de `population_criteria` de `fuentes/*.json` del dataset son las que nombra `studyKey`
  `[S3 resp. 16]`.
- ↪ `l1d-117-metadatos-poblacion-verificados` (US-118, mergeado en #209): archivo de la muestra con `revision: correcto|incorrecto`,
  plantilla y tarea `[HUMANO]` del usuario `[S3 resp. 13]`; `metadata_source = extraido_verificado`; claves de
  `population_criteria` por `studyKey` y valor `metadata_source = pendiente` (todo `no_disponible`, no cuenta en
  M-08.3) `[S3 resp. 16]`. **Reconciliado con lo mergeado (2026-10-27):** la muestra se construye solo desde la release y solo
  con campos de `corpus_document.extracted_fields` (decisión del usuario 2026-10-24); el archivo es
  `release` + `documentos[].{document_id, campos[].{campo, valor, revision, nota}}`; la ingesta no produce `grado`,
  `estado_menopausico` ni `estado_castracion`, así que sobre el corpus real esos criterios salen `Desconocido` y el
  dataset no los siembra como si la ingesta los produjera.
- ↪ `l1d-116-ingesta-reanudable-licencia`: publicación del corpus con `CORPUS_CUTOFF_DATE` (la misma versión que reporta
  `meta.corpusRelease`).
- 🔗 `l1d-130-herencia-aplicabilidad-recorte` (US-125): sin solape; esta suite mide por criterio y fuente, no la
  agregación por opción ni el orden (M-10.x, US-140/US-142).
- ↪ US-072 (runner `evaluate`, archivado) y US-074 (suite en la DoD).
- ⛔ ADR-39: la medición con NLI y LLM reales es de US-233 (S4); los AC corren con adaptadores falsos.

## Fuera de alcance

- Medición sobre la `CorpusRelease` vigente: US-119 AC-5 (`si-hay-capacidad`) `[S3 resp. 8]`.
- Concordancia del oncólogo (M-08.1, VM-3): FEAT-T5d con US-024 · DEC-14 (S5).
- Medición con modelos reales y recalibración de las metas: US-233 (S4) y DEC-07.
- Orden de opciones y hasta 3 opciones (M-10.1, M-10.2, RN-28 por opción): US-140, US-142.
- La revisión humana de la muestra en sí: tarea `[HUMANO]` de `l1d-117-metadatos-poblacion-verificados`.

## Impact

- Código nuevo solo en `apps/rag-orchestrator/app/evaluation/` y su configuración; sin dependencias nuevas.
- CI: el job de evaluación puede invocar la familia `aplicabilidad`; un M-08.2 o M-08.6 > 0 rompe el job.
