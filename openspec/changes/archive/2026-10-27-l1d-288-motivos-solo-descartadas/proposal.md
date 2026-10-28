# Proposal — l1d-288-motivos-solo-descartadas

## Trazabilidad

L1D-288 · US-237 · FEAT-10a (L1D-23) · Sprint 3 · Estimación **2** · HU-03 · FR-10 (descartadas en la UI) ·
RN-01 (regresión), RN-14 (logs sin contenido), RN-19, RN-23, RN-24 · AC-10.4 · ADR-26 (contrato estable) ·
US-237 AC-1…AC-6 · `[S3 resp. 8]` (US-237 confirmada en el S3, UI en `docs/ux/S3/pantallas-s3.md` S3-03) ·
🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069 · Recorrido principal: sí ·
DoR del S3: ✓ (`backlog/sprints/S3-refinamiento.md`, fila L1D-288). Linear: `Backlog`, 2 pts, sin relaciones
(coincide con el Markdown).

> **Origen (demo del 2026-10-23):** cuando las opciones se descartan por citas mal copiadas (US-236), el
> titular dice «No hay opciones descritas con soporte verificable en la evidencia recuperada.» sin distinguir
> ese caso de una falta real de soporte. La UI ya muestra el motivo de cada opción dentro de «Descartadas»
> (`evidence.discardReason.*`, US-061); falta resumirlo bajo el titular y contarlo en el log, que hoy solo
> registra `opcionesDescartadas=N`.
>
> **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** US-237 queda confirmada en el S3 (2 pts). La UI de
> referencia está en `docs/ux/S3/pantallas-s3.md`.
>
> **Decidido (usuario, 2026-10-24, `[S3 resp. 15]`):** orden de merge del grupo del prompt `rag-query`:
> `l1d-287-alias-chunks-cita` primero, `l1d-181-procedencia-contexto-ia` después. Este change va **después de
> l1d-287** (comparten `_validar_citas_y_ensamblar`) y **después de L1D-141** (`l1d-141-estados-panel-criterio`,
> mismos archivos de `web`); en ambos casos hace *rebase*.
>
> **Decidido (diseño, `docs/ux/S3/pantallas-s3.md` S3-03):** con un solo motivo distinto se muestra solo la
> etiqueta, sin "1 ×" ni recuento.

## Why

Cuando el análisis descarta todo lo que generó, el oncólogo no sabe si no hay evidencia que respalde la
pregunta o si falló un paso mecánico (cita mal copiada), y repite la consulta a ciegas. El operador tampoco
puede distinguirlo en el log. Un resumen en una línea por motivo bajo el titular, y un recuento por motivo en
`event=rag_query_citas`, resuelven ambas cosas sin cambiar el contrato: el motivo ya viaja en
`discardedOptions[].discardReason`.

## What Changes

- **Resumen por motivo (AC-1…AC-3):** en el estado "Solo descartadas" (`evidenceOptions = []`,
  `discardedOptions ≥ 1`), bajo el titular existente `evidence.resultado.soloDescartadas`, aparece
  "Motivos:" y una línea por motivo distinto, "{n} × {etiqueta}", en el orden del enum `discardReason` del
  contrato (`cita_invalida`, `afirmacion_sin_soporte`, `sin_citas`, `solo_soportada_por_analisis_previo`);
  con un solo motivo distinto, la línea va sin "1 ×" ni recuento. Las etiquetas son las existentes de
  `evidence.discardReason.*` (fuente única); sin identificadores de chunk. La sección «Descartadas» plegada
  no cambia.
- **Lenguaje y aviso (AC-4):** la única clave nueva, `evidence.discarded.motivos` = "Motivos:", pasa
  `lint:lenguaje` (US-068); el `AiDisclaimer` sigue visible en el estado.
- **Log por motivo (AC-5):** `event=rag_query_citas` añade `sinCitas=<n> citaInvalida=<n>` a los recuentos
  actuales, calculados de `ResultadoCitas.descartadas[].motivo`, sin `chunkId`, texto de opción ni de
  pregunta. `afirmacion_sin_soporte` ya se cuenta en `rag_query_soporte` y no se duplica. El test de AC-5
  comprueba además que el registro sale como **JSON** (`FormateadorJson`) con su `traceId` (hallazgo menor de
  `privacy-guardian`).
- **Sin cambio de contrato (AC-6):** ni `apps/clinical-api/openapi.yaml` ni `apps/rag-orchestrator/openapi.yaml`
  cambian; solo se añaden ejemplos de `EvidenceAnalysis` en `contracts/examples/` (con su entrada en
  `index.json`) para los handlers MSW de AC-1…AC-3.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-panel`: capacidad introducida por `l1d-140-panel-opcion-citas` (US-061), aún sin archivar. Se
  **añaden** dos requisitos (resumen por motivo en solo descartadas; titular nuevo sin términos prohibidos y
  con aviso). No se modifica "Estados mínimos del resultado en el S1", que ya modifica `L1D-141 (US-062)`,
  para no solapar deltas del mismo requisito.
- `evidence-analysis`: se **añade** el requisito del recuento por motivo en el log de citas.

## Bounded contexts

- **frontend** (`apps/web`: `analysis-result.tsx`, molécula nueva del resumen, regla pura en `lib/evidence/`,
  `messages/es.json`, tests de componente).
- **ai-services** (`apps/rag-orchestrator`: log de `RAGOrchestratorService._validar_citas_y_ensamblar` y su
  test de integración).
- **contratos**: solo ejemplos (sin diff de `openapi.yaml`).
- `clinical-platform`: no se toca.

## Dependencias

- ↪ `l1d-140-panel-opcion-citas` (US-061): estado "Solo descartadas", `DiscardedOptions` y
  `evidence.discardReason.*`; **debe archivarse antes** para que `evidence-panel` exista en `openspec/specs/`.
- ↪ `L1D-141 (US-062)` · `l1d-141-estados-panel-criterio`: **mismo panel y mismo `apps/web/messages/es.json`**
  (y `analysis-result.tsx`, donde L1D-141 añade alcance y "Qué se buscó" a `sin_evidencia`). Sin solape de
  requisitos (este change solo añade). **Orden `[S3 resp. 15]`:** L1D-141 se mergea primero y este change
  hace *rebase* sobre él, resolviendo `es.json` (claves distintas bajo `evidence.*`) y `analysis-result.tsx`
  conservando ambos cambios.
- ↪ `l1d-287-alias-chunks-cita` (US-236) `[S3 resp. 15]`: se mergea antes; toca
  `_validar_citas_y_ensamblar` (traducción de alias antes de validar). Este change hace *rebase* sobre él; su
  log va después de `validar_citas` y no depende del alias. (`l1d-181-procedencia-contexto-ia` también va
  después de l1d-287, pero no comparte archivos con este change.)
- ↪ `l1d-193-terminos-prohibidos-rn23` (US-068, archivado) y `l1d-194-aviso-ia-etiqueta-academica` (US-069):
  `lint:lenguaje` y `AiDisclaimer` (AC-4).
- 🔗 Origen: la demo del 2026-10-23 (`cita_invalida` por citas mal copiadas, que corrige US-236).

## Fuera de alcance

- Cambiar el titular `evidence.resultado.soloDescartadas` o las etiquetas `evidence.discardReason.*`.
- Recuentos por motivo del soporte NLI (`afirmacion_sin_soporte`): ya en `event=rag_query_soporte`.
- Resumen por motivo cuando hay opciones aceptadas y también descartadas (la historia solo cubre "todas
  descartadas").
- Estados de espera, sin evidencia, error y criterio de orden: `L1D-141 (US-062)`.
- Persistir el recuento en `AIAnalysisRecord` o exponerlo en `/metrics`.

## Impact

- `apps/web/components/organisms/analysis-result.tsx`, molécula nueva `apps/web/components/molecules/
  discard-reasons-summary.tsx`, regla pura nueva `apps/web/lib/evidence/resumir-motivos.ts`,
  `apps/web/messages/es.json` (una clave).
- `apps/rag-orchestrator/app/application/rag_orchestrator_service.py` (formato del log) y, si hace falta, una
  función pura `contar_por_motivo()` en `app/domain/citations.py`.
- `contracts/examples/` (tres ejemplos nuevos + `index.json`).
- Tests: `apps/web/tests/ui/`, `apps/web/tests/lib/`, `apps/rag-orchestrator/tests/integration/
  test_rag_query_citas_bordes.py` (o un archivo hermano) y unitario de dominio.
- Sin dependencias nuevas, sin cambio de API, de CSP ni de prompt/umbral/modelo (sin `evaluate`).
