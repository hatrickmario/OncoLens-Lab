# Proposal — l1d-291-poblacion-lista-contrato-migracion

## Trazabilidad

L1D-291 · US-241 · FEAT-08b (L1D-20) · Sprint 4 · Estimación **3** · técnica (PRD §17) · FR-25 (valor del estudio) ·
RN-25 · RN-22 · RN-06 · RN-05 · RN-26 · RN-14 · AC-08.9 · AC-T4.4 · SEG-06 · ADR-26 · ADR-47 (aceptado) ·
DEC-11 (US-021) · US-241 AC-1…AC-6 · `[S4 resp. 3]` `[S4 resp. 5]` `[S4 resp. 8]` `[S4 resp. 11]` `[S4 resp. 13]` ·
⛔ ADR-47 (aceptado) · ⛔ DEC-11 (US-021) · ↪ US-118 (l1d-117, `population_criteria` y sus claves) · ↪ US-122 ·
🔗 Consumida por: US-242 (escribe la forma nueva), US-243 (la lee y emite `partialReason`), US-244, US-126, US-245 ·
🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [AC-T4.4] → US-040

## Por qué

La aplicabilidad del S3 compara un único `studyPopulationValue` por criterio, elegido sin saber de qué fragmento sale.
El ADR-47 decide extraer en la ingesta hasta tres valores por criterio y fragmento, con su alcance, y calcular el estado
solo con los fragmentos que cita la opción. Antes de que US-242 (extracción), US-243 (reglas) y US-126 (UI) puedan
trabajar en paralelo, hay que fijar la forma: contrato, persistencia en el catálogo del corpus y lector.

## Qué cambia

- **Contrato (aditivo, sin versión mayor, ADR-26)**: `contracts/schemas/evidence.yaml` primero, luego `sync-contracts`.
  `ApplicabilityCriterion` añade `studyPopulationValues[]` (`{value ≤ 200, chunkId, scope: elegibilidad | subgrupo |
  mencion}`, sin `maxItems` en la respuesta) y `partialReason` (`inclusiva | mezclada | rango_solapado | solo_subgrupo |
  null`); ambos **opcionales** (fuera de `required`; `ApplicabilityCriterion` es cerrado y sus campos actuales son
  obligatorios `[S4 resp. 11]`). `unknownReason` suma `varios_valores_en_la_fuente` (reservado, sin productor en el
  S4), `valores_en_conflicto`, `respaldo_fallido` y `sin_regla_de_comparacion` (lo emite US-243). `studyPopulationValue`
  queda `deprecated: true` (se retira en el S5 `[S4 resp. 5]`); con lista lleva el primer valor de elegibilidad de los
  fragmentos citados o `null` (design D10). Versiones: `rag-orchestrator` 1.5.0 → 1.6.0, `clinical-api` 1.10.0 →
  1.11.0, `evidence.yaml` 1.0.0 → 1.1.0.
- **Ejemplos y mocks**: `contracts/examples/con-evidencia-s4-poblacion-lista.json` (`EvidenceAnalysis`) y
  `contracts/examples/rag-query-poblacion-lista.json` (`RagQueryInternalResponse`, con su petición
  `rag-query-request-poblacion-lista.json`), registrados en `index.json`; el segundo alimenta el MSW de `clinical-api`.
  `con-evidencia-s3-aplicabilidad.json` y `rag-query-aplicabilidad-a-m1.json` siguen en forma antigua y este change no los
  toca; su `estadio` pasa de `unknownReason: null` a `sin_regla_de_comparacion` en `l1d-293` (el productor). Los
  handlers MSW/`respx` se construyen desde ellos.
- **Filtro RN-23**: `studyPopulationValues[].value` entra en `camposGenerados` de
  `packages/clinical-language/origen-de-campos.json`.
- **Cliente generado** en `packages/api-contracts` y modelos Pydantic de `rag-orchestrator` regenerados; `clinical-api`
  valida ambas formas y conserva `studyPopulationValues` y `partialReason` en la respuesta y el `AIAnalysisRecord`.
- **Migración Alembic `0005`** del schema `corpus`: `population_criteria` pasa, por criterio, a lista de valores con
  `chunkId`, `scope`, `promptVersion`, `modelVersion`, `catalogVersion` y `nliResult`; filas existentes sin pérdida;
  `downgrade -1` restablece el schema. `docs/architecture/data-model.md` §4.6 documenta la forma nueva.
- **Lector del catálogo** (`CatalogoReader`): acepta la forma antigua (string o `{valor, alcance}`) y la nueva, y las
  entrega al dominio como lista de valores; acepta además la marca por criterio `{"status": "pendiente", "values": []}`
  (la escribe US-242, la lee US-244) sin tratarla como inválida; una forma inválida degrada el criterio a
  `desconocido` / `no_reportado_por_fuente` con `200` y log `poblacion_forma_invalida` (criterio, `chunkId` y
  `traceId`; nunca valor, texto del fragmento, prompt ni salida del LLM).
- Configuración: `POPULATION_MAX_VALUES_PER_CRITERION` (valor inicial 3, RN-22), por fragmento y criterio; el lector
  valida con la clave, no con un literal.
- Fixture FX-08b-c: `doc-a1` (forma antigua) y `doc-b1` (forma nueva) sembrados en el `corpus` de test.

## Fuera de alcance

Extracción que llena la lista (US-242), reglas de estado (US-243), respaldo en la consulta (US-244), UI (US-126).
Retirar `studyPopulationValue` y el lector antiguo (S5).

## Impacto

Bounded contexts: `clinical-platform` (cliente generado, validación y persistencia del análisis), `ai-services`
(migración, lector, Pydantic, mocks). Capacidades: `api-contracts`, `corpus-ingestion`, `applicability`.
