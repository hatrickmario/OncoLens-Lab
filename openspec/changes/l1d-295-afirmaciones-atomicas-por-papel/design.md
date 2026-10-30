# Design — l1d-295-afirmaciones-atomicas-por-papel

## Contexto

El prompt `rag-query@0.4.0` pide una `rationale` en prosa; `SupportChecker` (US-064) separa la justificación
en oraciones y las verifica con el NLI. El LLM suele anteponer «El fragmento C1 reporta que…» y escribir
frases largas con modales; el NLI no las juzga bien (OUT-08). Decidido `[S4 resp. 2]` y `[S4 resp. 11]`
(ver proposal): no se reabre.

## Decisiones

- **Esquema interno de salida** (versión del prompt en configuración, RN-22): por opción `claims[]`
  (`CLAIMS_MIN_PER_OPTION = 1`, `CLAIMS_MAX_PER_OPTION = 4`, `CLAIM_MAX_WORDS = 20`, todas en
  configuración), exactamente una `principal`, `citations[]` con alias (US-236). Salida que no valida el
  esquema (p. ej. dos `principal` o ninguna) → `503 LLM_OUTPUT_INVALID`, código propio, sin reintento
  silencioso ni eco del texto generado (decisión del usuario **Q1**, 2026-10-30): el modelo respondió, pero su
  salida no se pudo validar, y no se reporta como «LLM no disponible». El LLM caído o sin respuesta sigue siendo
  `503 LOCAL_LLM_UNAVAILABLE`. `clinical-api` lo propaga tal cual (nunca lo convierte en
  `LOCAL_LLM_UNAVAILABLE`); RN-06 sin cambios (no hay análisis validado que persistir).
- **Marco de atribución en `domain/`** (función pura `componer_con_marco(claims, idioma)`), según el idioma de
  la pregunta (`idioma.py`); el LLM nunca escribe la atribución. Igual que la verbalización de ADR-34.
- **Regla por papel** en una función pura con nombre propio `decidir_opcion_por_papel()` (RN-01):
  principal sin soporte → opción descartada; salvedad sin soporte → opción descartada; secundaria sin soporte →
  omitida y `omittedClaims += 1`. El NLI recibe hipótesis = afirmación **sin marco**; premisa = **solo** el
  `chunkTextSnapshot` de los chunks que esa afirmación cita (nunca otra afirmación ni el marco).
- **Forma antes del NLI** (`validar_forma_de_afirmacion()`): alias de fragmento (`C\d+` / «fragmento C») o
  > `CLAIM_MAX_WORDS` palabras ⇒ sin soporte con la regla del papel, sin invocar al NLI (asumido en AC-5).
  **Modal normativo** fuera de la lista de términos prohibidos (p. ej. «debería», «conviene») ⇒ descarta la
  opción con `afirmacion_sin_soporte` **sea cual sea su papel** (decisión del usuario **D-a**, 2026-10-30), nunca
  con `lenguaje_no_permitido`. El texto de una afirmación fuera de forma nunca se expone (RN-23): en
  `unsupportedClaims` va el literal «(texto no mostrado)» y, si es la principal, no aparece en ningún campo
  (ni `rationale` ni `details` de la descartada). La lista de modales normativos es un recurso versionado, no un
  literal en servicios.
- **Orden de validación por afirmación:** `checkProhibitedTerms` → forma → NLI. Un término de la **lista de
  términos prohibidos** (RN-23, nivel A) en cualquier afirmación de la opción la descarta con
  `lenguaje_no_permitido`, que precede a `afirmacion_sin_soporte`; como la lista ya contiene modales («se
  recomienda», «se debe»), esos casos quedan en `lenguaje_no_permitido` y solo los modales fuera de la lista
  llegan a la regla D-a. `lenguaje_no_permitido` queda reservado a la lista prohibida (como el AC-7 heredado de
  US-064). Se conserva el log `fragmento_retirado_lenguaje` con `ruleId` y versión, sin texto.
- **Alternativas** (la decisión es del usuario; contexto del fragmento para el NLI y NLI más fuerte quedan como
  nota en US-120, S5): no se reexaminan.
- **Contrato:** valor aditivo del enum, con adaptación mínima de `web` (D-b), y alternativa aditiva
  `LLM_OUTPUT_INVALID` del `503` con mensaje propio en `web` (Q1); ver `## Contratos`.

## Privacidad y ownership

- Todo ocurre en `rag-orchestrator` con el contexto ya desidentificado por `clinical-api` (RN-11); el change no
  añade campos con identidad ni cruces nuevos de frontera (web → clinical-api → rag-orchestrator).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; usa solo el schema `corpus` y Milvus.
- Regla común de logs del pipeline: los logs registran conteos, `ruleId`, `traceId`, papel y `chunkId`
  (permitido); **nunca** el texto de una afirmación (retirada, omitida o aceptada), de un fragmento, del prompt
  ni de la salida del LLM, ni los alias de fragmento (RN-14, RN-23). Ante `LLM_OUTPUT_INVALID`, el log
  registra solo el tipo de error de validación (p. ej. `principal_duplicada`, `principal_ausente`), nunca el
  texto de la salida.
- Modelos locales, sin *fallback* a la nube (RN-12). Los alias nunca salen de la generación (RN-06).
- La sesión del doctor no llega a Backend 2; sin cambios en autenticación de servicio.

## Contratos

- **Proveedor:** `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`, vía `contracts/schemas/evidence.yaml`);
  **consumidor:** `clinical-api` (cliente TS generado en `packages/api-contracts`), que lo valida y persiste en
  el `AIAnalysisRecord` (RN-06) y lo reexpone a `web`.
- **Diff propuesto** en `contracts/schemas/evidence.yaml`:
  `DiscardedOption.discardReason.enum: [cita_invalida, afirmacion_sin_soporte, sin_citas,
  solo_soportada_por_analisis_previo, lenguaje_no_permitido]` (el valor nuevo, **al final**). Sin rutas ni
  códigos de estado nuevos; `503 NLI_UNAVAILABLE` sin cambios.
- **Error `LLM_OUTPUT_INVALID` (Q1, aditivo):** schema nuevo `ErrorSalidaLlmInvalida`
  (`error: const LLM_OUTPUT_INVALID`, `message`, `traceId`; sin detalles internos) como alternativa nueva del
  `oneOf` del `503` de `POST /rag/query` en `apps/rag-orchestrator/openapi.yaml` y de la respuesta
  `GeneracionNoDisponible` (`503` de `POST /platform/evidence-analyses`) en `apps/clinical-api/openapi.yaml`; se
  corrige la descripción del `503` de `/rag/query`, que hoy atribuye la salida inválida a
  `LOCAL_LLM_UNAVAILABLE`. Mismas versiones (1.8.0 / 1.13.0) y mismo commit `contract(L1D-295)`.
- **Versiones** (asignadas por el orden real de oleadas; cadenas rag-orchestrator 291 → 109 → 295 → 144 → 300 y clinical-api 291 → 95 → 295 → 144 → 300;
  rebasa sobre `l1d-109` (rag-orchestrator 1.7.0) y `l1d-95` (clinical-api 1.12.0), ambos sobre `l1d-291`, que deja
  `evidence.yaml` en 1.1.0; `l1d-144` rebasa sobre este): `apps/rag-orchestrator/openapi.yaml` → **1.8.0**, `apps/clinical-api/openapi.yaml` →
  **1.13.0**, `contracts/schemas/evidence.yaml` → **1.2.0** (minor: aditivo). Si el orden de merge cambia, se
  rebasa y se toma la siguiente minor libre.
- **Ejemplos nuevos** (+ `index.json`), con el `disclaimer` literal, sin términos prohibidos en los campos
  generados (las afirmaciones retiradas como literal de retiro o «(texto no mostrado)») y NCCN/ESMO solo en
  `sourcesNotIncluded`; los mocks MSW/`respx` se construyen desde ellos:
  - `con-evidencia-solo-descartadas-lenguaje.json` (`clinical-api`, `#/components/schemas/EvidenceAnalysis`):
    todas `lenguaje_no_permitido`.
  - `con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json` (`clinical-api`, `EvidenceAnalysis`): una
    descartada `afirmacion_sin_soporte` y una `lenguaje_no_permitido`; lo consume `l1d-296` (US-246 AC-3).
  - `rag-query-solo-descartadas-lenguaje.json` (`rag-orchestrator`,
    `#/components/schemas/RagQueryInternalResponse`) con su request
    `rag-query-request-solo-descartadas-lenguaje.json` (`RagQueryInternalRequest`) y una pregunta distinta de
    las de los ejemplos existentes; es la fuente del MSW de `clinical-api` en la tarea 3.1.
  - `rag-salida-llm-invalida.json` (`rag-orchestrator`, `#/paths/~1rag~1query/post/responses/503`) y
    `error-salida-llm-invalida.json` (`clinical-api`, `#/paths/~1platform~1evidence-analyses/post/responses/503`):
    `LLM_OUTPUT_INVALID`, sin texto generado; fuente del MSW de `clinical-api` (tarea 3.2) y de `web` (tarea 4.2).
- **Compatibilidad:** aditivo, `oasdiff` sin cambios incompatibles (ADR-26). Pero rompe la compilación de `web`:
  `apps/web/lib/evidence/resumir-motivos.ts` declara `INDICE_DE_MOTIVO: Record<Motivo, number>` exhaustivo sobre
  el tipo generado (Bloqueante B1, decisión del usuario **D-b**, 2026-10-30). Por eso este change adapta `web`
  **lo mínimo** en su PR (sección `## frontend` de `tasks.md`): la clave `lenguaje_no_permitido: 4` al final de
  `INDICE_DE_MOTIVO` y una etiqueta provisional `evidence.discardReason.lenguaje_no_permitido` en
  `apps/web/messages/es.json` que pasa `lint:lenguaje`. La UI completa (sección, rótulos, filtro RN-23) la hace
  después `l1d-296` (US-246) sobre eso. `web` valida con el Zod generado estricto: un motivo fuera del enum es
  respuesta no válida.
- Los schemas Zod/Pydantic y los tipos se **regeneran** del spec (skill `sync-contracts`), nunca se editan a mano.
- El esquema `claims[]` es interno del LLM y **no** aparece en el OpenAPI.

## Dependencias y colaboradores

- `app/domain/claims.py` (modelo `Afirmacion{texto, papel, citas}`; **verificar con el código** si ya existe un
  tipo homónimo), `app/domain/support.py` (`decidir_opcion_por_papel()`, RN-01),
  `app/domain/lenguaje.py` (`checkProhibitedTerms`, ya existente), nuevo
  `app/domain/atribucion.py` (`componer_con_marco()`, `validar_forma_de_afirmacion()`).
- `app/application/verificacion_de_soporte.py` depende del puerto NLI (`ports.py`) y de las funciones puras; no
  de clientes concretos. `respuesta_con_evidencia.py` ensambla `rationale`/`details` con el marco.
- `app/prompts/rag_query.py`: función pura, sin E/S; versión nueva del prompt.
- Reglas con nombre propio: `componer_con_marco()`, `validar_forma_de_afirmacion()`,
  `decidir_opcion_por_papel()` (RN-01, con la excepción D-a del modal normativo), `motivo_de_descarte()`
  (precedencia `lenguaje_no_permitido`).
- `web` (D-b, mínimo): `apps/web/lib/evidence/resumir-motivos.ts` (clave en `INDICE_DE_MOTIVO`) y
  `apps/web/messages/es.json` (etiqueta provisional); sin cambios de componentes.
- `web` (Q1): `apps/web/lib/evidence/clasificar-fallo.ts` clasifica `LLM_OUTPUT_INVALID` aparte de
  `LOCAL_LLM_UNAVAILABLE`, con la clave `evidence.error.salidaNoValidada` de `apps/web/messages/es.json`:
  «El modelo local devolvió una respuesta que no se pudo validar. Reintenta el análisis.» (no prescriptivo, sin
  detalles internos, pasa `lint:lenguaje`).
- `clinical-api` (Q1): el gateway de `evidence-analysis` mapea el `503 LLM_OUTPUT_INVALID` del cliente generado
  a su propio `503 LLM_OUTPUT_INVALID`, sin persistir `AIAnalysisRecord` de contenido (RN-06 sin cambios).

## Evaluación

Obligatoria (OL-06) por cambiar prompt y regla de soporte: el PR adjunta el reporte de `ai-eval-runner` con
**retención de opciones** frente al baseline, **fidelidad** (≥ 0,90), **precisión de citas** (≥ 0,90), **salidas
prescriptivas = 0**, el JSON válido (≥ 99 %) del nuevo esquema `claims[]` y la pregunta insignia de la guía §2.1.
La medición con modelos locales completos va en US-233a. Sin TDD para prompt y umbrales (matriz de CLAUDE.md).
Los AC con adapters falsos son TDD estricto.

## Riesgos / abiertos

- Validación clínica de la regla por papel en la sesión de oncólogos del S4 (no bloquea).
- Orden de merge con los demás changes que tocan `rag_orchestrator_service.py` en el S4.
- Fuente y versión de la lista de modales normativos (ver Preguntas).
- Código de error de un esquema interno inválido: **resuelto** (Q1, `LLM_OUTPUT_INVALID`; ver Preguntas).
- Orden de merge por las versiones de los specs (1.8.0 / 1.13.0 / 1.2.0): rebasa sobre `l1d-109` y `l1d-95` (y por ellos sobre `l1d-291`); `l1d-144` va después.

## Preguntas

- **(Decidida, Q1, usuario, 2026-10-30.)** Un esquema interno inválido del LLM (p. ej. dos afirmaciones
  `principal` o ninguna, US-245 AC-1) responde `503 LLM_OUTPUT_INVALID`, alternativa aditiva del `oneOf` del
  `503` en los contratos de `rag-orchestrator` y `clinical-api` (versiones 1.8.0 / 1.13.0, mismo commit
  `contract(L1D-295)`), con mensaje propio en `web`. El LLM caído sigue siendo `LOCAL_LLM_UNAVAILABLE`. Ver
  `## Decisiones` y `## Contratos`.
- ¿Dónde vive la lista de «modales normativos» de AC-5: `terminos-prohibidos.json` (nivel nuevo) o recurso propio
  en `packages/clinical-language`? Propuesta de este change: recurso versionado propio, junto a la política de
  lenguaje, sin reabrir `terminos-prohibidos.json`.
