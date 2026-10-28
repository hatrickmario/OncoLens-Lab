# Design — l1d-287-alias-chunks-cita

## Context

Ver `proposal.md` → Why. Estado observado en `apps/rag-orchestrator`:

- `app/prompts/rag_query.py` (`VERSION_DEL_PROMPT = "rag-query@0.2.0"`) presenta cada fragmento como
  `[chunkId: <id real>]` y pide `citedChunkIds` con esos ids.
- `app/application/generation.py` (`LlmEvidenceGenerator`) elige los fragmentos que caben en
  `LLM_FRAGMENTS_MAX_CHARS` (`_fragmentos_dentro_del_presupuesto`, ya ordenados por relevancia
  descendente y `chunkId`), llama a `LlmClient.completar_json()` y construye `OpcionGenerada` con los
  `chunk_ids_citados` tal como los devolvió el LLM.
- `app/domain/citations.py` (`validar_citas`) compara por igualdad exacta contra los `chunkId` de
  `chunks_sobre_umbral` con ficha en el catálogo (`RagOrchestratorService._chunks_citables`). Opción
  con citas pero ninguna válida → `cita_invalida`; sin citas → `sin_citas`.
- `DiscardedOption` (contrato) no expone citas; `CitedSource.chunkId` es el único identificador de chunk
  que sale del servicio.

## Goals / Non-Goals

**Goals:** que el LLM nunca tenga que copiar un `chunkId` real; que la validación de citas y el soporte
NLI sigan intactos y comparando ids reales; que el alias sea determinista y no salga de la generación.

**Non-Goals:** tolerancia difusa a ids mal copiados; alias en otros prompts (aplicabilidad textual,
resumen del caso); cambios de contrato.

## Decisions

**D1 · Función pura `alias_de_chunks` en `app/domain/alias_de_chunks.py`.** Dos operaciones:
`asignar_alias(chunks) -> TablaDeAlias` (orden por `relevance_score` desc y `chunk_id` asc, alias
`C{i}` desde 1) y `traducir_citas(tabla, citas_crudas) -> tuple[str, ...]`. La tabla se construye
sobre **los fragmentos entregados al prompt** (tras el presupuesto), no sobre todos los
`chunks_sobre_umbral`: así un alias solo existe para lo que el LLM vio (AC-6). Un chunk sobre el umbral
recortado por el presupuesto sigue siendo "citable" para `validar_citas`, pero no tiene alias, así que
el LLM no puede citarlo: es más estricto que hoy y coherente con RN-01.
Alternativas descartadas: alias numérico puro (`1`, `2`) — choca con números del texto clínico;
hash corto del id — vuelve a pedir copiar una cadena opaca.

**D2 · Traducción con marca no citable, nunca descarte silencioso.** `traducir_citas` devuelve el
`chunkId` real para cada alias de la tabla y, para cualquier otro token (alias inexistente, `chunkId`
real, texto libre), la constante de dominio `CITA_NO_TRADUCIBLE`, que por construcción no puede ser un
`chunkId` (contiene un carácter prohibido en los ids del corpus). Así `validar_citas()` no cambia y la
opción cae en `cita_invalida` (AC-3, AC-4), no en `sin_citas`. Comparación exacta tras `strip()`; sin
normalizar mayúsculas, corchetes ni distancia de edición (AC-4: no se repara nada "parecido"). Si la
evaluación (AC-7) muestra variantes triviales (`[C2]`, `c2`), se decide en el PR con su reporte, no
antes. La marca nunca llega a la respuesta: `DiscardedOption` no lleva citas y los aceptados solo
conservan ids válidos.
Alternativa descartada: quitar los tokens no traducibles — convertiría `cita_invalida` en `sin_citas` y
ocultaría el fallo en las métricas.

**D3 · El generador encapsula el alias.** `LlmEvidenceGenerator.generar()` asigna la tabla, la pasa
a `construir_prompt_rag_query()` (que recibe pares `(alias, chunk)` y escribe `[fragmento C1]`) y
traduce al parsear. El puerto `EvidenceGenerator`, `EvidenciaGenerada`, `OpcionGenerada` y el servicio
no cambian: `FakeEvidenceGenerator` (nivel de puerto) sigue entregando ids reales y las suites de
L1D-179/L1D-180 quedan como regresión sin tocar. Los tests de los AC de este change usan
`FakeLlmClient` (nivel de cliente) para ejercer el prompt y la traducción reales.

**D4 · Esquema interno de salida.** El campo `citedChunkIds` del esquema interno del LLM (no es
contrato entre servicios) se renombra a `citedFragments` con `items.pattern = ^C[1-9][0-9]*$` en el
esquema entregado a la gramática del runtime; el parseo **no** valida el patrón (un token fuera de
patrón no es `503`, es `cita_invalida`, D2). Nombrar el campo por "chunk id" invitaría al modelo a
inventar ids.

**D5 · Versión del prompt** `rag-query@0.3.0`; el texto sigue redactado en positivo y sin términos
RN-23 (requisito existente "Plantilla del prompt sin lenguaje prescriptivo" como regresión). Este change
va primero `[S3 resp. 15]`: `l1d-181-procedencia-contexto-ia` hace *rebase* sobre esta firma de
`construir_prompt_rag_query()` (pares `(alias, chunk)`), añade su bloque de datos del paciente y sube a
`rag-query@0.4.0`.

**D6 · Configuración de la medición.** El número de corridas de la pregunta del origen vive en la
configuración de la evaluación (`EVAL_ORIGIN_RUNS`, inicial 10, RN-22) dentro de un config nuevo
`apps/rag-orchestrator/eval/configs/us236-alias.yaml`; las metas siguen en `metas-iniciales.yaml`.

## Dependencias y colaboradores

- Nuevo: `app/domain/alias_de_chunks.py` (puro, sin E/S; depende solo de `ChunkPuntuado`).
- Modificados: `app/prompts/rag_query.py` (recibe la tabla), `app/application/generation.py` (asigna y
  traduce; depende del puerto `LlmClient`, sin clientes concretos).
- Sin cambios: `domain/citations.py`, `rag_orchestrator_service.py`, puertos.
- Reglas extraídas con nombre propio: `asignar_alias()` y `traducir_citas()` (RN-04).

## Privacidad y ownership

- Fronteras: sin cambio. `web → clinical-api → rag-orchestrator` transporta lo mismo; el contexto
  clínico sigue desidentificado (RN-11) y el prompt no recibe `pseudoPatientId`.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; el alias es un rótulo de chunks del
  corpus público, no un dato del paciente.
- Logs: el generador registra solo conteos (opciones, citas traducidas / no traducibles); nunca alias,
  `chunkId` ni texto del chunk (AC-5, RN-14).
- `clinical-api` persiste el `AIAnalysisRecord` con los `chunkId` reales que le llegan (RN-06); no hay
  código nuevo, solo un test de regresión.

## Contratos

Sin diff en `apps/rag-orchestrator/openapi.yaml` ni en `contracts/schemas/evidence.yaml`; sin ejemplos
nuevos en `contracts/examples/`. Proveedor: `rag-orchestrator`; consumidor: `clinical-api`. Compatible
con ADR-26. El esquema `GenerationOutput` es interno (LLM ↔ generador) y no se publica.

## Evaluación

Cambia el prompt → `run-ai-eval` obligatorio (OL-06). Métricas afectadas: precisión de citas (M-07.2,
meta 0,90), recuento de `cita_invalida`, fidelidad (regresión), salidas prescriptivas = 0 (regresión),
"sin evidencia" (regresión). Dos corridas: (a) CI con `LLM_PROVIDER=fake` (job `eval-required`, se
dispara por `app/prompts/`), y (b) `ai-eval-runner` con el LLM real local sobre `data/evaluation/` y la
pregunta del origen × `EVAL_ORIGIN_RUNS` (AC-7, `[S3 resp. 8]`). Solo datos sintéticos.

## Risks / Trade-offs

- [El modelo escribe `[C2]` o `c2`] → D2 lo rechaza; AC-7 lo mide y el PR decide con datos si se admite
  una normalización mínima (cambio de spec, no reparación difusa).
- [Tests existentes que afirman `[chunkId:` en el prompt (`tests/unit/test_prompt_rag_query.py:48`,
  `tests/integration/test_rag_query_detalle.py:82,88`, `tests/evaluation/test_adr39_runtime_llm.py:75`)]
  → su AC cambió con US-236 AC-1: se actualizan a `[fragmento C…]` en un commit con el *trailer*
  `Test-Removal: US-236 AC-1 sustituye el chunkId real por el alias en el prompt`, revisado en el Gate 2.
- [Conflicto de merge con `l1d-128-aplicabilidad-textual-citada` en torno a `citations.py`] → este
  change no edita `citations.py`; el riesgo queda en `generation.py`/prompts, que L1D-128 no toca.
- [Mismo prompt y generador que `l1d-181-procedencia-contexto-ia`] → orden fijado `[S3 resp. 15]`: este
  change mergea primero (`0.3.0`) y l1d-181 rebasa (`0.4.0`). Mismo
  `_validar_citas_y_ensamblar` que `l1d-288-motivos-solo-descartadas`, que también va después y rebasa.
- [Ventaja perdida: un chunk recortado por presupuesto deja de ser citable vía alias] → aceptado (D1).

## Migration Plan

Sin migración de datos. Rollback: revertir el PR restaura `rag-query@0.2.0`.
