# Proposal — l1d-295-afirmaciones-atomicas-por-papel

## Trazabilidad

L1D-295 · US-245 · FEAT-T1a (citas, soporte y procedencia) · Sprint 4 · Estimación **5** · HU-03 ·
RN-01 (regresión, regla por papel), FR-10, RN-04, RN-23, RN-24, ADR-34, ADR-26 · AC-T1.2, AC-10.4 ·
US-245 AC-1…AC-8 · `[S4 resp. 2]` `[S4 resp. 11]` ·
🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-04] → US-063 · 🔗 Regresión [RN-23] → US-068 ·
🔗 Regresión [RN-24] → US-191 (Post-MVP: la memoria de análisis previos no existe aún en el pipeline) ·
Recorrido principal: sí · Fixture: FX-T1a-b (extiende FX-06a-a y FX-06a-b) · Sprint: `backlog/sprints/S4-refinamiento.md`, fila 7.

> **Origen (OUT-08):** el verificador NLI no sabe juzgar frases largas ni con alias («El fragmento C1
> reporta que…»); se pierden opciones correctas y las salvedades de la fuente pueden desaparecer.
>
> **Decidido (usuario, 2026-10-29, `[S4 resp. 2]`):** afirmaciones atómicas (≤ 20 palabras, declarativas, sin
> modales normativos ni alias); el código añade el marco de atribución («La fuente reporta que…», como
> ADR-34); la opción se conserva si su **principal** tiene soporte NLI; una **secundaria** sin soporte se
> omite y cuenta en `omittedClaims`; una **salvedad** sin soporte descarta la opción. Requiere validación
> clínica en la sesión de oncólogos del S4 (no bloquea).
>
> **Decidido (sesión principal, 2026-10-29, a confirmar por el usuario en la revisión del PR,
> `[S4 resp. 11]`):** `DiscardedOption.discardReason` gana `lenguaje_no_permitido` (cambio aditivo, ADR-26),
> que emite `rag-orchestrator` y consume US-246.

## Why

Hoy el generador escribe `rationale` completo y el NLI lo verifica por oración contra el fragmento: una
frase larga o con atribución propia del LLM («El fragmento C1…») no queda implicada y la opción se descarta
aunque la fuente la respalde; en sentido inverso, una salvedad omitida hace que una opción parezca más
fuerte que su fuente. Con afirmaciones atómicas, marco determinista y verificación según el papel de cada
afirmación, la opción se conserva por lo que la fuente sí dice y nunca se muestra más fuerte que ella.

## What Changes

- **Prompt y esquema interno de generación (AC-1):** versión nueva del prompt `rag-query` (en
  configuración); por opción, `claims[]` de 1 a 4 elementos `{text, role: principal | secundaria |
  salvedad, citations[]}`, exactamente una `principal`, cada `text` ≤ 20 palabras, declarativo, sin modales
  normativos ni alias de fragmento. Es el esquema **interno** del LLM, no el contrato público.
- **Marco determinista (AC-1):** `rationale` = «La fuente reporta que » + principal y cada secundaria y
  salvedad en `details` con el mismo marco («The source reports that…» según el idioma de la pregunta),
  compuestos en `domain/`, nunca por el LLM.
- **Regla por papel en `SupportChecker` (AC-1…AC-4):** el NLI se invoca por afirmación, con la afirmación
  **sin marco** como hipótesis y **solo** el texto de los chunks que ella cita como premisa. Principal sin
  soporte → descarta la opción (`afirmacion_sin_soporte`, `unsupportedClaims`); secundaria sin soporte →
  se omite (`omittedClaims`, su texto no sale en ningún campo); salvedad sin soporte → descarta la opción.
- **Forma de la afirmación antes del NLI (AC-5):** una afirmación con alias de fragmento o más de 20 palabras
  se trata como sin soporte con la regla de su papel (asumido); una con modal normativo fuera de la lista
  prohibida descarta la opción con `afirmacion_sin_soporte` sea cual sea su papel (**D-a**, usuario,
  2026-10-30). Su texto nunca se expone: en `unsupportedClaims` va «(texto no mostrado)» y, si es la
  principal, no aparece en ningún campo (RN-23).
- **Lenguaje no permitido (AC-6):** `checkProhibitedTerms` corre primero (antes de la forma y del NLI) sobre
  cada afirmación; si alguna tiene un término de la lista prohibida la opción va a `discardedOptions` con
  `discardReason = lenguaje_no_permitido` (antes `afirmacion_sin_soporte`, US-064 AC-7) y el texto nunca se
  devuelve. `lenguaje_no_permitido` queda reservado a la lista prohibida.
- **Contrato aditivo (AC-7):** `lenguaje_no_permitido` se añade al final del enum de
  `DiscardedOption.discardReason` en `contracts/schemas/evidence.yaml` (aditivo, sin cambio incompatible;
  versiones 1.2.0 del schema, 1.8.0 de `rag-orchestrator` y 1.13.0 de `clinical-api`), con los ejemplos
  `con-evidencia-solo-descartadas-lenguaje.json`, `con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json`
  (que consume US-246) y `rag-query-solo-descartadas-lenguaje.json` (+ su request); mocks MSW/`respx` desde
  ellos; `clinical-api` lo valida con su cliente generado y lo persiste sin pérdida (RN-06).
- **Adaptación mínima de `web` (D-b, usuario, 2026-10-30):** el valor nuevo rompe el `Record` exhaustivo de
  `apps/web/lib/evidence/resumir-motivos.ts`; este PR añade la clave al final de `INDICE_DE_MOTIVO` y una
  etiqueta provisional en `apps/web/messages/es.json`. La UI completa es de US-246.
- **Salida del LLM no validada (AC-1, decisión Q1 del usuario, 2026-10-30):** un JSON no parseable o fuera del
  esquema interno (p. ej. dos `principal` o ninguna) responde `503 LLM_OUTPUT_INVALID`, alternativa aditiva del
  `oneOf` del `503` en los contratos de `rag-orchestrator` y `clinical-api` (mismas versiones 1.8.0 / 1.13.0,
  mismo commit `contract(L1D-295)`), con ejemplos de error en `contracts/examples`. El LLM caído sigue siendo
  `LOCAL_LLM_UNAVAILABLE`. `clinical-api` lo propaga sin convertirlo (RN-06 sin cambios) y `web` muestra «El
  modelo local devolvió una respuesta que no se pudo validar. Reintenta el análisis.». Logs: solo el tipo de error.
- **NLI no disponible (AC-8):** regresión de US-064 AC-6 sobre el nuevo camino: `503 NLI_UNAVAILABLE`, ninguna
  opción sin validar.
- **Evaluación obligatoria (OL-06):** el PR adjunta el reporte de `ai-eval-runner` (retención de opciones,
  fidelidad, precisión de citas, salidas prescriptivas = 0 y la pregunta insignia de la guía §2.1).

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis`: se **modifican** «Soporte NLI por afirmación contra los chunks citados», «Opción con
  una afirmación sin soporte va a descartadas», «Términos prescriptivos generados nunca se devuelven» y «NLI
  no disponible falla cerrado»; se **añaden** el esquema interno de afirmaciones atómicas, el marco
  determinista y la forma de la afirmación; se **renombra y modifica** «Salida del LLM inválida responde 503
  LOCAL_LLM_UNAVAILABLE» → «… LLM_OUTPUT_INVALID» (Q1).
- `evidence-analysis-gateway`: se **modifica** «Una sola tabla de mapeo de fallos de rag-orchestrator»
  (`LLM_OUTPUT_INVALID` conserva su código, Q1).
- `evidence-panel`: se **modifica** «Errores de transporte sin resultado parcial» (mensaje propio de
  `LLM_OUTPUT_INVALID`, Q1).
- `api-contracts`: se **añaden** el requisito del motivo `lenguaje_no_permitido` en `DiscardedOption` y el del
  error `LLM_OUTPUT_INVALID` en el `503` de ambos backends (Q1).

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`: `app/prompts/rag_query.py`, `app/domain/` —`support.py`, `claims.py`,
  `lenguaje.py`, `citations.py`—, `app/application/verificacion_de_soporte.py`, `respuesta_con_evidencia.py`,
  `rag_orchestrator_service.py`, `app/application/generation.py`).
- **contratos** (`contracts/schemas/evidence.yaml`, `contracts/examples/`, `packages/api-contracts` y modelos
  Pydantic generados).
- **clinical-platform**: verificación de que el cliente generado valida y persiste el motivo nuevo (test de
  integración) y fila de `LLM_OUTPUT_INVALID` en `mapearFalloRag()` (Q1, TDD estricto).
- **frontend** (mínimo, D-b): `apps/web/lib/evidence/resumir-motivos.ts` (clave en `INDICE_DE_MOTIVO`) y
  `apps/web/messages/es.json` (etiqueta provisional) para que el build de `web` no se rompa; la UI completa es
  de US-246; y `apps/web/lib/evidence/clasificar-fallo.ts` + `evidence.error.salidaNoValidada` (Q1).

## Dependencias

- ⛔ ADR-39 (LLM y NLI reales): los AC usan adapters falsos; la medición real va en `evaluate`.
- ↪ US-064 (`SupportChecker`, archivado `l1d-180-soporte-nli-descartadas`), US-063 (citas copiadas del corpus),
  US-236 (alias de chunks, archivado `l1d-287-alias-chunks-cita`), US-225 (generación, archivado
  `l1d-275-generacion-opcion-max-options`), US-068 (`checkProhibitedTerms`, `l1d-193-terminos-prohibidos-rn23`).
- 🔗 Produce para: US-246 (`l1d-296…`, `discardReason = lenguaje_no_permitido`) — este change debe fusionarse antes.
- 🔗 Medido en: US-233a (fidelidad, precisión de citas y lenguaje con modelos locales).
- ↪ Cambios del S4 que tocan el mismo pipeline (orden de merge a fijar en `/sprint-start`):
  `l1d-293-estado-criterio-lista-poblacion` (US-243), US-244 (L1D-294), US-134 (L1D-144, recorte a 3 opciones),
  US-238 (L1D-300): comparten `rag_orchestrator_service.py` / `respuesta_con_evidencia.py` / prompt.

## Fuera de alcance

- Calibrar el umbral o cambiar el modelo NLI (US-233a, US-120).
- Solapamiento o corte por oraciones de los fragmentos (requiere reindexar; ADR).
- Texto de la UI y etiqueta definitiva del motivo nuevo (US-246); aquí solo la clave y la etiqueta provisional (D-b).
- Análisis previos como memoria (US-191, Post-MVP): RN-24 solo como regresión.
- Cambios al esquema público de `EvidenceOption` (`rationale`/`details` conservan su forma).

## Impact

- `apps/rag-orchestrator/app/prompts/rag_query.py` (versión nueva del prompt), esquema interno de salida del
  LLM, dominio de marco/roles/forma, `SupportChecker`, ensamblado de la respuesta y log.
- `contracts/schemas/evidence.yaml` (1.2.0) y los `openapi.yaml` de `rag-orchestrator` (1.8.0) y
  `clinical-api` (1.13.0) + `contracts/examples/` (6 archivos nuevos + `index.json`) + generados.
- `apps/web/lib/evidence/resumir-motivos.ts` y `apps/web/messages/es.json` (adaptación mínima, D-b);
  `apps/web/lib/evidence/clasificar-fallo.ts` y mensaje `evidence.error.salidaNoValidada` (Q1).
- `apps/clinical-api` (gateway de `evidence-analysis`, `mapearFalloRag()`): fila `LLM_OUTPUT_INVALID` (Q1).
- `contracts/examples/`: además, `rag-salida-llm-invalida.json` y `error-salida-llm-invalida.json` (Q1).
- Tests: Pytest unitarios de dominio y de integración de `/rag/query` con FX-T1a-b; `contracts:check` en la CI;
  `evaluate` obligatoria. Sin dependencias nuevas.
