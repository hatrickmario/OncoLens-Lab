# Proposal — l1d-129-aplicabilidad-causas-avisos

## Trazabilidad

L1D-129 · US-124 · FEAT-08b (L1D-20) · Sprint 3 · Estimación **5** · HU-22 · FR-25 (causa del desconocido,
avisos por criterio, población no comparable, conteo), FR-11 (avisos por criterio) · RN-28 (conteo, nunca
puntaje), RN-26 (los avisos no bloquean), RN-07 (procedencia) · AC-08.2, AC-08.4, AC-08.5, AC-08.6,
AC-04.3 (aplicabilidad), AC-03.2 (conflicto, sembrado), AC-T1.4 (persistencia) · US-124 AC-1…AC-7 ·
🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-26] → US-071 ·
🔗 Produce para: US-125 (agregación y comparador), US-130 (limitación "población no comparable"),
US-071 (avisos que no bloquean) · 🔗 Medido en: US-132 (M-08.2, M-08.3, M-08.4) ·
`[S3 resp. 1]` (DEC-11 en `propuesta_revisada`) · `[S3 resp. 8]` (AC-3 sobre conflicto sembrado).

> **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** el AC-3 se verifica sobre un conflicto HER2 **sembrado**
> (dos HER2 `requiere_revision` con `conflicts_with_id` cruzados y `provenance.conflict = true`), porque la
> detección real (US-099) pasó al S5. El AC original, con el conflicto detectado, vive en US-099 AC-7 (FEAT-03a, S5).
>
> **Decidido (usuario, 2026-10-23, `[S3 resp. 1]`):** el catálogo de aplicabilidad se construye sobre la
> versión `propuesta_revisada` de DEC-11 (HER2 y estado de castración excluyentes); se valida en la sesión
> de oncólogos del S4 y cualquier cambio solo toca el catálogo JSON.

## Why

US-122 y US-123 calculan el estado de cada criterio, pero un "Desconocido" sin causa, un dato del paciente
provisional presentado como firme o un criterio excluyente en "No coincide" sin consecuencia visible hacen
que el oncólogo juzgue mal la comparabilidad de una fuente (P6, JTBD 4). Esta historia completa la salida
por fuente que US-125 agrega y que la UI de US-126 (S4) muestra.

## What Changes

- `rag-orchestrator` marca cada criterio `desconocido` con su causa: `falta_en_paciente` cuando el dato está
  en `clinicalContext.missingCriticalData` o ausente del contexto (con `patientValue = null` y
  `patientDataWarning = faltante`), y `no_reportado_por_fuente` cuando la fuente no lo reporta (US-122/123).
- `patientDataWarning` por criterio desde la `provenance` del dato comparado: `en_conflicto` si
  `conflict = true`, `sin_verificar` si `reviewStatus = requiere_revision`, `null` si está verificado,
  corregido o auto-aceptado. El aviso no altera el estado calculado ni bloquea (RN-26).
- `SourceApplicability.populationNotComparable = true` cuando algún criterio con `isExclusionary = true`
  queda en `no_coincide`.
- `SourceApplicability.summary` = conteo por estado (`coincide`, `parcial`, `noCoincide`, `desconocido`),
  sin ningún puntaje ni porcentaje (RN-28).
- Regresiones verificadas: sin evidencia → `applicability = []` y cero invocaciones del LLM (RN-02);
  `clinical-api` persiste en el `AIAnalysisRecord` la misma `applicability` que responde (RN-06).
- Sin cambio de contrato: `ApplicabilityCriterion` y `SourceApplicability` ya declaran estos campos y
  enums desde el Pre-S1 (`contracts/schemas/evidence.yaml`, ADR-26).
- **Dueño del par de ejemplos con aplicabilidad** (`[S3 resp. 16]`): `contracts/examples/rag-query-aplicabilidad-a-m1.json`
  (interno, `RagQueryInternalResponse`) y su público `con-evidencia-s3-aplicabilidad.json` (`EvidenceAnalysis`),
  registrados en `contracts/examples/index.json`; `l1d-130` y `l1d-141` los reutilizan.
- Reglas nuevas solo `causa_de_desconocido()` y `aviso_dato_paciente()`; `contar_estados()` y
  `poblacion_no_comparable()` son de `l1d-127` y aquí solo se verifican sus AC (US-124 AC-4, AC-5).

## Capabilities

### New Capabilities
- `applicability`: aplicabilidad paciente ↔ evidencia por fuente, criterio a criterio (capacidad listada en
  `openspec/config.yaml`; la crean en el S3 los changes de US-122, US-123 y este). Este change aporta la causa
  del desconocido, los avisos del dato del paciente, la población no comparable y el conteo por estado.

### Modified Capabilities
- `evidence-analysis-gateway`: se añade el requisito de que la `applicability` persistida en el
  `AIAnalysisRecord` sea igual a la de la respuesta (ADDED; no cambia requisitos existentes).

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): marcas, avisos, no comparable y conteo (AC-1…AC-6).
- **clinical-platform** (`apps/clinical-api`): test de integración de persistencia (AC-7); sin código
  nuevo previsto, el registro ya copia `applicability` de la respuesta.

## Dependencias

- ↪ **`l1d-127-estado-criterio-estructurado` (US-122)** — cálculo estructurado del estado,
  `ApplicabilityService`, FX-08b-a y las funciones `contar_estados()` y `poblacion_no_comparable()`
  (`[S3 resp. 16]`).
- ↪ **l1d-128-aplicabilidad-textual-citada (US-123)** — valor textual citado y validado con NLI; el AC-4
  (`doc-a2` + `APL-OK` → HER2 `no_coincide`) lo necesita.
- ↪ change de **L1D-98 (US-006)** — `missingCriticalData` poblado en el contexto (en los tests de B2 basta
  el contexto de FX-08b-a; la integración de punta a punta depende de US-006).
- ↪ change de **L1D-181 (US-065)** — `provenance.conflict = true` en el contexto a partir de un conflicto
  sembrado (la mitad B1 del AC-3).
- ↪ archivados: `l1d-275-generacion-opcion-max-options`, `l1d-106-retrieval-threshold-sin-evidencia`,
  `l1d-104-persistencia-analisis-fallos`.
- 🔗 US-099 (S5): detección real del conflicto (US-099 AC-7). 🔗 US-125: consume `summary` y
  `populationNotComparable`.
- 📦 **Orden de archivo de `applicability`** (`[S3 resp. 16]`): 127 → 128 → **129** → 130 → 182.

## Fuera de alcance

- Detección de conflictos al extraer (US-099, S5): aquí el conflicto se siembra.
- Herencia por opción, comparador y selección de la opción única (US-125).
- Tabla de aplicabilidad y textos en la UI (US-126, S4; rótulo y conteos del S3 en US-062 AC-7).
- Limitación "población no comparable" en `limitations` (US-130).
- Sembrar el conflicto en el paciente de la demo (a): rompería US-065 AC-1 (`conflict = false` en el seed);
  el conflicto vive en el fixture del test.

## Impact

- `apps/rag-orchestrator/app/domain/applicability_rules.py` (reglas puras de causa y aviso; no comparable y
  conteo ya son de `l1d-127`) y `app/application/` (`ApplicabilityService` de US-122).
- `contracts/examples/`: par `rag-query-aplicabilidad-a-m1.json` + `con-evidencia-s3-aplicabilidad.json` e
  `index.json`.
- Tests Pytest con FX-08b-a (+ variante con HER2 en conflicto) y Supertest de persistencia en `clinical-api`.
- Sin cambios en `openapi.yaml`, `contracts/schemas/` ni en lo generado (solo ejemplos). Sin cambio de modelo, prompt, umbral,
  catálogo ni corpus (no exige `evaluate`).
