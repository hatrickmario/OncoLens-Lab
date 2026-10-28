# Proposal — l1d-130-herencia-aplicabilidad-recorte

## Trazabilidad

L1D-130 · US-125 · FEAT-08b (L1D-20) · Sprint 3 · Estimación **5** · HU-22 · FR-25 (aplicabilidad de una
opción), FR-09 (S3: 1 opción), FR-10 (descartadas) · RN-28 (dueña de la agregación por opción, del comparador
y de la selección por aplicabilidad antes del recorte), RN-03, RN-22 · RN-01 (regresión → US-064) ·
AC-08.8, AC-10.1 (opción única del S3) · ADR-27, ADR-31 · US-125 AC-1…AC-7 · Fixtures FX-08b-a, FX-08b-b ·
🔗 Produce para: US-134 (orden de hasta 3 opciones con el mismo comparador, S4), US-101
(`poblacion_no_comparable` en la tarjeta), US-062 AC-7 (criterio de elección y línea de conteos en la UI,
`[S3 resp. 9]`) · Reordenamiento del 2026-10-23 (S5 → S3).

## Why

Con la aplicabilidad por fuente calculada (US-122…US-124), la opción del análisis todavía sale con
`applicabilitySummary` en cero, `perSource = []` y el recorte a `maxOptions` elige por `relevanceScore`
(regla provisional del S1, US-225 AC-3). El oncólogo vería así la opción de mayor puntaje de búsqueda, aunque
su población no sea comparable con la del paciente, lo que contradice RN-28 y RN-03. Esta historia hace que
la opción herede la aplicabilidad de su fuente más comparable y que la opción única del S3 sea la más
aplicable, no la más relevante.

## What Changes

- **Agregación por opción** en `rag-orchestrator`: a partir de las `SourceApplicability` de las fuentes que
  cita cada opción validada, `applicabilitySummary` es el de la fuente más aplicable, `perSource` trae todas
  sus fuentes con su resumen, `populationNotComparable = true` solo si todas sus fuentes lo son y, en ese
  caso, `warnings` incluye `poblacion_no_comparable` (ADR-31).
- **Comparador puro de RN-28** (excluyentes en No coincide ascendente → Coincide descendente → relevancia
  descendente → desempate determinista), sin ningún puntaje combinado; se usa para elegir la fuente más
  aplicable de cada opción y para ordenar las opciones.
- **Recorte por aplicabilidad**: el requisito existente "Recorte de opciones validadas a maxOptions" pasa de
  "por relevancia" a "por aplicabilidad cuando hay aplicabilidad calculada"; el orden se aplica después de la
  validación de citas y soporte y antes del recorte, de modo que una opción descartada nunca ocupa la
  posición. Sin aplicabilidad calculada se conserva la regla del S1 (relevancia, luego `chunkId`).
- Sin cambio de `openapi.yaml`: todos los campos ya existen en `contracts/schemas/evidence.yaml`
  (congelado en el Pre-S1, ADR-26). **No crea ejemplo propio** (`[S3 resp. 16]`): reutiliza el par de
  `l1d-129` (`rag-query-aplicabilidad-a-m1.json` y su público `con-evidencia-s3-aplicabilidad.json`) y, si hace
  falta, actualiza en ese mismo par los campos de la opción (`applicabilitySummary`, `perSource`,
  `populationNotComparable`) que esta historia empieza a poblar.
- **No** incluye UI: el rótulo del criterio de elección, la línea de conteos y el aviso de población no
  comparable en el panel son de US-062 AC-7 (`[S3 resp. 9]`).

## Capabilities

### New Capabilities
- `applicability`: aplicabilidad paciente ↔ evidencia (capacidad prevista en `openspec/config.yaml`, aún sin
  spec en `openspec/specs/`). Este change aporta la agregación por opción y el comparador de RN-28; los
  changes de US-122, US-123 y US-124 aportan el cálculo por criterio y por fuente.

### Modified Capabilities
- `evidence-analysis`: el requisito "Recorte de opciones validadas a maxOptions" ordena por aplicabilidad
  antes de recortar cuando la aplicabilidad está calculada (US-125 AC-5…AC-7), y activa la regresión
  [RN-28] que el S1 había dejado anotada para el S5.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): dominio (comparador, agregación), aplicación (paso de orden en
  `RAGOrchestratorService`), ensamblado de la respuesta y tests.
- **contratos**: reutiliza (y, si hace falta, actualiza) el par de ejemplos de `l1d-129`; sin ejemplo propio
  ni diff del spec (`[S3 resp. 16]`).
- `clinical-platform` y `frontend`: no se tocan (persistencia sin cambios, RN-06; UI en US-062).

## Dependencias

- ↪ `l1d-129-aplicabilidad-causas-avisos` (US-124): `summary` y `populationNotComparable` por fuente; sobre
  `l1d-127-estado-criterio-estructurado` (US-122, un `SourceApplicability` por documento sobre el umbral) y
  `l1d-128-aplicabilidad-textual-citada` (US-123), y `l1d-126-criterios-aplicabilidad-catalogo` (US-121,
  criterios con `isExclusionary`).
- ↪ **US-055** (`l1d-106-retrieval-threshold-sin-evidencia`, archivado), **US-063**
  (`l1d-179-citas-chunk-recuperado`, archivado), **US-064** (`l1d-180-soporte-nli-descartadas`, archivado),
  **US-225** (`l1d-275-generacion-opcion-max-options`, archivado): pipeline, citas, soporte NLI y recorte.
- 🔗 Consumido por **US-062 AC-7** (L1D-141, UI del criterio y conteos) y **US-134** (S4).
- 📦 **Orden de archivo de `applicability`** (`[S3 resp. 16]`): 127 → 128 → 129 → **130** → 182.

## Fuera de alcance

- Orden visible de hasta 3 opciones (`maxOptions = 3`): US-134, S4.
- Tabla de aplicabilidad y texto en la UI: US-126 (S4) y US-062 AC-7.
- Cálculo por criterio, causas y avisos del dato del paciente: US-122…US-124.
- `warnings` de datos del paciente en `EvidenceOption` (`datos_sin_verificar`, `datos_en_conflicto`,
  `datos_faltantes`): **no se emiten en el S3** → US-126 (S4) (`[S3 resp. 16]`). En el S3 `warnings` solo
  puede traer `poblacion_no_comparable`.
- Puntaje de evidencia clínica (`clinical_evidence_score`, TBD-09).

## Impact

- `apps/rag-orchestrator/app/domain/` (comparador y agregación nuevos; `option_selection.py` deja de rechazar
  aplicabilidad no vacía), `app/application/rag_orchestrator_service.py` y `respuesta_con_evidencia.py`.
- Tests Pytest unitarios y de `/rag/query` con adapters falsos de FX-08b-b.
- `contracts/examples/`: sin ejemplo propio; como mucho, actualización del par de `l1d-129`, validada por
  `contracts:check`.
