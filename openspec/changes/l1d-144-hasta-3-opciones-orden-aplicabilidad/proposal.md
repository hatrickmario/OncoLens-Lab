# Proposal — l1d-144-hasta-3-opciones-orden-aplicabilidad

## Trazabilidad

L1D-144 · US-134 · FEAT-10c (hasta 3 opciones descritas en la evidencia, ordenadas por aplicabilidad) · Sprint 4 · Estimación **5** · HU-10 ·
FR-09 (hasta 3 desde el S4 y orden por aplicabilidad), RN-28 (dueña del orden visible), RN-03 (regresión: la relevancia solo desempata), RN-22 (`ANALYSIS_MAX_OPTIONS`), RN-01 y RN-06 (regresión), RN-26 (el aviso no bloquea) ·
AC-10.1, AC-08.8 (consumo) · AC-T1.4 · US-134 AC-1…AC-8 · `[S4 resp. 7]` `[S4 resp. 11]` ·
ADR-26 (contrato aditivo), ADR-27 (determinismo) ·
🔗 Consume: US-125 (`applicability_order`, archivado `l1d-130-herencia-aplicabilidad-recorte`) ·
🔗 Medido en: US-140 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-15] → US-148 (activa desde S6) ·
Recorrido principal: sí · Fixture: FX-10c-a (extiende FX-08b-a) · Sprint: `backlog/sprints/S4-refinamiento.md`, fila 9.

> **Decidido (usuario, 2026-10-29, `[S4 resp. 7]`):** las opciones con soporte que quedan fuera del tope de 3 se declaran en la Base
> («La evidencia describe N opción(es) más, no mostradas»), sin contenido y no como descartadas. El campo
> `analysisBasis.optionsNotShown` (entero >= 0, aditivo) es decisión de diseño de la sesión principal, a confirmar por el usuario en la
> revisión del PR `[S4 resp. 11]`.

## Why

Desde el S3 el análisis devuelve una sola opción (la más aplicable). El oncólogo compara (P6, JTBD 4): con este change ve hasta tres opciones
ordenadas por cuánto se parece la población estudiada a su paciente, nunca por relevancia ni por el orden en que las redactó la IA, y se le
declara, sin contenido, cuántas opciones con soporte quedaron fuera del tope.

## What Changes

- **Orden y recorte (AC-1, AC-2, AC-6, AC-7):** con `maxOptions = 3`, `evidenceOptions` sale del comparador puro `applicability_order` de US-125 sobre
  el `applicabilitySummary` de la fuente más aplicable de cada opción, después de la validación y antes del recorte; el orden del arreglo **es** el
  orden (sin campo `rank`); independiente del orden de salida del LLM (24 permutaciones).
- **Excedente declarado (AC-3):** `rag-orchestrator` devuelve **siempre** el número de opciones válidas fuera del tope en un campo nuevo y
  requerido de `RagQueryInternalResponse` (`optionsNotShown`, entero >= 0; `0` si no hubo recorte); `clinical-api` lo copia a
  `analysisBasis.optionsNotShown` y a lo persistido (allí es opcional solo para los registros históricos anteriores al S4). Sin
  contenido de la opción excluida (título, justificación, citas) en ningún campo ni log; no entra a `discardedOptions`.
- **No comparable visible (AC-4):** la opción con `populationNotComparable = true` queda última pero visible, con el aviso `poblacion_no_comparable` (RN-26).
- **Sin soporte no cuenta (AC-5):** una opción sin soporte NLI va a `discardedOptions` (`afirmacion_sin_soporte`) y no ocupa posición (regresión RN-01).
- **Persistencia (AC-8):** `evidence_options` del `AIAnalysisRecord` conserva orden y contenido de la respuesta; `clinical-api` no reordena (RN-06).
- **Configuración (RN-22):** `ANALYSIS_MAX_OPTIONS` = 3 por defecto desde el S4 (hoy 1); con 1 se aplica el mismo comparador antes del recorte; la validación
  de arranque rechaza valores fuera de 1–3.
- **Contrato aditivo (ADR-26), editado en cada `openapi.yaml` proveedor:** `RagQueryInternalResponse.optionsNotShown` (requerido en la respuesta,
  siempre emitido) en `apps/rag-orchestrator/openapi.yaml` (versión 1.9.0) y `AnalysisBasis.optionsNotShown`/`maxOptions` (opcionales, por los
  análisis antiguos) en `apps/clinical-api/openapi.yaml` (versión 1.14.0). `contracts/schemas/evidence.yaml` (solo schemas compartidos) **no** se
  toca y ningún `openapi.yaml` se genera: se editan a mano primero y después se generan desde ellos los tipos TS, Zod y Pydantic. Ejemplos nuevos
  `rag-query-tres-opciones.json` (con su request propio) y `con-evidencia-s4-tres-opciones.json` (`LLM-CUATRO`), y
  `con-evidencia-s4-tres-opciones-no-comparable.json` con su par interno `rag-query-tres-opciones-no-comparable.json` (+ request propio)
  (`LLM-TRES`, O-A no comparable tercera, `optionsNotShown = 0`; los consume `l1d-145`); mocks MSW/`respx` desde ellos en el mismo PR. Todo
  ejemplo `RagQueryInternalResponse` de `index.json` al rebasar gana `optionsNotShown = 0`.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis`: se **modifica** «Recorte de opciones validadas a maxOptions» (hasta 3, excedente contado) y se **añaden** el orden visible de hasta 3 y su determinismo.
- `analysis-basis`: se **añaden** `optionsNotShown` y `maxOptions` en la Base.
- `evidence-analysis-gateway`: se **añade** la persistencia del orden y de `optionsNotShown` sin reordenar, y el tope de `ANALYSIS_MAX_OPTIONS`.
- `api-contracts`: se **añade** el requisito de los campos aditivos.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`: `app/domain/option_selection.py`, `app/application/rag_orchestrator_service.py`, `respuesta_con_evidencia.py`, `verificacion_de_soporte.py`).
- **contratos** (`apps/rag-orchestrator/openapi.yaml` y `apps/clinical-api/openapi.yaml`, editados a mano como fuente; `contracts/examples/` + `index.json`; `packages/api-contracts`, modelos Pydantic y Zod **generados** desde ellos). `contracts/schemas/evidence.yaml` no cambia.
- **clinical-platform** (`apps/clinical-api`: `src/config/secciones.ts`, `evidence-analysis.service.ts`, `analysis-basis.ts`, `analysis-record.ts`, `evidence-analysis.mapper.ts`).
- **frontend**: no se toca (US-135 consume).

## Dependencias

- ⛔ DEC-11 (US-021): escenario más probable (excluyentes y «Parcial» que alimentan los conteos); los AC usan el adapter falso `APL-FIJA`.
- ⛔ ADR-39 (LLM y NLI reales): solo para la medición real; los AC usan adapters falsos.
- ↪ US-055 (pipeline), US-064 (soporte; `l1d-180-soporte-nli-descartadas`), US-125 (comparador, agregación y recorte; `l1d-130-herencia-aplicabilidad-recorte`), US-225 (`l1d-275-generacion-opcion-max-options`).
- ↪ Cambios del S4 que tocan el mismo pipeline (orden de merge a fijar en `/sprint-start`): `l1d-295-afirmaciones-atomicas-por-papel` (US-245), `l1d-293-estado-criterio-lista-poblacion` (US-243: los estados alimentan el orden; US-243 → US-134), `l1d-294-respaldo-poblacion-consulta`, US-238 (L1D-300): comparten `rag_orchestrator_service.py` / `respuesta_con_evidencia.py`; y la cadena de contratos (rag-orchestrator 291 → 109 → 295 → 144 → 300; clinical-api 291 → 95 → 295 → 144 → 300):
  este change rebasa sobre `l1d-295-afirmaciones-atomicas-por-papel` (US-245) y fija rag-orchestrator 1.9.0 y clinical-api 1.14.0;
  `l1d-300` rebasa sobre él. El motivo `unknownReason = sin_regla_de_comparacion` de su escenario de US-125 AC-5 lo declara `l1d-291` en el
  enum y lo **produce** `l1d-293` (US-243, productor), que también actualiza los dos ejemplos de A-M1: ese escenario depende de `l1d-293`.
- 🔗 Produce para: US-135 (tarjetas en el orden recibido y texto del excedente, AC-7) — este change debe fusionarse antes.
- 🔗 Medido en: US-140 (M-10.1) y US-141 (G-5 / M-06.2).

## Fuera de alcance

- Síntesis (FEAT-07), búsqueda complementaria del agente (FEAT-08c), comparación entre análisis (FEAT-11a).
- Puntaje combinado o «nivel de evidencia» (RN-28, AC-07.5).
- El texto visible del excedente y la UI (US-135).
- Regresión [RN-15] (opt-out → 403): activa desde S6 (US-148), no es escenario aquí.

## Impact

- `apps/rag-orchestrator/app/domain/option_selection.py`, servicio de orquestación, ensamblado de la respuesta; `apps/clinical-api` (config, builder de la Base, persistencia).
- `apps/rag-orchestrator/openapi.yaml` (1.9.0) + `apps/clinical-api/openapi.yaml` (1.14.0) + `contracts/examples/` (4 respuestas + 2 requests) + generados. Sin cambio en `contracts/schemas/evidence.yaml`.
- Tests: Pytest con FX-10c-a (AC-2, AC-3, AC-5…AC-7), Supertest con `rag-orchestrator` simulado (AC-1, AC-4, AC-8); `contracts:check`, `oasdiff`. Sin dependencias nuevas.
