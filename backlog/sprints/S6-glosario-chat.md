# S6 · Glosario canónico del contrato del chat (Gate 1, vuelta 1)

> Fuente única del vocabulario de FEAT-12, fijada por la sesión principal el 2026-11-06 a partir de los hallazgos del Gate 1. Fuentes: `privacy-guardian`, `contract-keeper` y `clinical-language-auditor`. Todos los changes del S6 se alinean con este documento. Si un change discrepa, manda el glosario.
> Los puntos marcados **(humano)** se confirman en la aprobación del plan (`S6-plan.md`).

## 1. Dueños y orden de versiones

| Contrato | Versión | Change dueño | Contenido |
|---|---|---|---|
| rag-orchestrator | **1.12.0** | `l1d-316-chat-turn-langgraph` | `POST /chat/turn` completo. Incluye `dataClassification` y `llmProvider` (L1D-204 se pliega aquí y ya no toca el spec), el vocabulario cerrado de §2, los errores de §4 y `ChatCompletenessItem` |
| rag-orchestrator | 1.13.0 | `l1d-322-chat-evidencia-seguimiento` | `activeAnalysisId?` en la petición. `subintent?` (`enum [seguimiento_evidencia]`) y `evidenceAnalysis?` ya vienen en la 1.12.0 y aquí solo se consumen |
| rag-orchestrator | 1.14.0 | `l1d-320-faltantes-tipo-vacio` | Solo si queda algo propio. `gapType` ya está en `ChatCompletenessItem` de la 1.12.0 |
| clinical-api | **1.24.0** | `l1d-315-conversacion-paciente` | Endpoints de conversación y turno, `ConversationTurn`, `ConversationDataLink`, errores de §4 y `403 PermisoDenegadoOOptOut` desde el inicio |
| clinical-api | 1.25.0 | `l1d-320` | `gapType` en `CompletenessItem` de `GET …/completeness` |
| clinical-api | 1.26.0 | `l1d-322` | `ConversationTurn.evidenceAnalysis?` |
| clinical-api | 1.27.0 | `l1d-213-opt-out-generacion-ia` | `x-genera-ia` en las **otras** operaciones de generación. La de turnos ya la declara L1D-315 |

- L1D-317, 318, 319, 321 y 323 **no suben versión**: solo rellenan campos ya definidos.
- Si una versión colisiona, se renumera el segundo en mergear.
- L1D-108 va **antes** que todo el chat: los prompts del chat usan `PromptBuilder` y `PromptBuilder.memoria()`, nunca los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`.

## 2. Esquemas

- **ChatTurnRequest** (rag): `threadId`, `pseudoPatientId`, `traceId`, `question` (enmascarada), `dataClassification`, `catalogVersion`, `clinicalContext`, `caseFacts[]`, `completeness[]` (`ChatCompletenessItem`), `activeAnalysisId?` (1.13.0) y `rehydration?`.
- **Rehydration**: `{ turns: [{ question, intent, blocksText[], factRefs[] }], structuredState }`.
  - Solo esos campos. Nunca `resourceId`, UUID, fechas absolutas, `analysisId` ni `dataLinks`.
  - Lo construye `construirRehidratacion()` en clinical-api.
  - Lleva un escenario que siembra UUID y fechas en el turno persistido y comprueba que no viajan.
- **CaseFact**: `factRef` (`^f[0-9]+$`), `kind`, `verbalization`, `relativeDay` (entero o `null`), `reviewStatus`, `seriesKey?`, `conflictWith?` (factRef) y `corrected?`.
- **ChatCompletenessItem** (rag): `item`, `label`, `status` (`presente_verificado` · `presente_sin_verificar` · `faltante` · `no_aplica`), `gapType` (`no_encontrado` · `incompleto` · `por_conciliar` · `no_buscado`, o `null` si está presente) y `destination`. **Sin `provenance`**.
- **ChatTurnResponse** (rag): `intent`, `subintent?` (`enum [seguimiento_evidencia]`, declarado en la 1.12.0), `blocks[]`, `omittedClaims`, `evidenceAnalysis?`, `structuredState` (**requerido**), `llmProvider` y `notices[]`.
- **ChatBlock**:
  - `kind` es un enum **cerrado de 8 valores**: `documentado`, `interpretacion`, `catalogo`, `evidencia`, `conflicto`, `faltante`, `limitacion` y `fuente`.
  - Campos: `text`, `factRefs?` y `citations?` (`ChatCitation[]`).
  - Ningún otro change redefine `kind`.
- **ChatCitation**:
  - `{ chunkId, documentId, sourceTitle, chunkOrdinal, chunkCount, chunkTextSnapshot }`.
  - Los metadatos se copian del catálogo del corpus; si falta uno, se muestra «No disponible» (RN-25).
  - El bloque `fuente` describe un documento y lleva solo los metadatos del catálogo, sin `chunkId`.
- **StructuredState**:
  - `{ intentsVistos[], preguntasPrevias[], opcionesMostradas[], citasMostradas[] (chunkId), faltantesSenalados[], ultimaEvidencia? }`.
  - `ultimaEvidencia` = `{ query, chunkIds[], topRelevanceScore|null }`, **sin `analysisId`**: Backend 2 nunca lo conoce. Lo rellena L1D-322.
- **ConversationTurn** (clinical-api):
  - `id`, `turnNumber`, `createdAt`, `question` (enmascarada), `intent`, `aboutTurnId?`, `status`, `topRelevanceScore|null`, `blocks[]` (`ChatBlock`), `dataLinks[]` (`ConversationDataLink`), `omittedClaims`, `analysisId?`, `evidenceAnalysis?` (1.26.0), `notices[]`, `dataUsed[]` y `dataMissing[]`.
  - `status` y `topRelevanceScore` los deriva Backend 1 de `evidenceAnalysis`.
  - `dataUsed[]` (etiquetas de los hechos enviados) y `dataMissing[]` (los faltantes de `completeness`) también los deriva Backend 1.
  - **`memoryUsed` se retira.**
  - Sin `citationIds`: las citas van solo dentro de cada bloque.
- **ConversationDataLink** (clinical-api, solo hacia el navegador):
  - `{ factRef, resourceType, resourceId, origin, relativeDay|null, recordedDate|null }`.
  - **Sin `historyPath`**: L1D-325 deriva la ruta con `rutaDeHistorico(resourceType, resourceId)` sobre `/api/*`.
  - El `dataRef`/`PatientDataLink` congelado del análisis no se toca.

## 3. Reglas transversales

- **Cita o enlace obligatorio (RN-01):**
  - `documentado`, `interpretacion` y `conflicto` llevan ≥ 1 `factRef`.
  - `evidencia` lleva ≥ 1 cita y pasa NLI.
  - `faltante`, `catalogo`, `limitacion` y `fuente` son deterministas (catálogo, configuración o metadatos) y **están exentos**. El E2E de L1D-326 lo afirma solo sobre los cuatro primeros.
  - La explicación de «por qué importa» generada por el LLM (L1D-321) va como `evidencia`, con cita y NLI; sin soporte, se omite.
- **Interpretación (RN-19, RN-01):** `kind=interpretacion` se pinta con su propio rótulo, «Interpretación generada por IA», distinto de «◆ Información clínica del paciente». Lo exige L1D-324. L1D-318 solo emite el `kind`.
- **Avisos (RN-19):**
  - Backend 2 siempre rellena `notices[]` en todo turno con contenido generado.
  - La UI solo los pinta y nunca los toma de la configuración del frontend.
  - Los mensajes del sistema («no generado por IA») quedan fuera.
  - El literal se escribe sin punto final, igual que en la configuración.
- **Faltantes (L1D-320):**
  - Prioridad: `por_conciliar` > `incompleto` > `no_buscado` > `no_encontrado`.
  - «Incompleto» = `presente_sin_verificar` **sin conflicto vigente** o con menos valores que `minValues` `[S6 resp. 17]`.
  - Las plantillas dicen «no se halló en los documentos procesados», nunca «ausente en el paciente».
- **Respuestas fijas «sin datos»:** van como un único bloque `kind=limitacion`, de texto fijo, determinista y exento de cita (L1D-318). Los turnos `fuera_de_alcance` y `no_clasificada` son mensajes del sistema y llevan `notices = []`.
- **Intención `fuera_de_alcance`:**
  - Aplica a una pregunta sobre otro paciente, sobre un tipo de cáncer no habilitado o con un marcador de PII que no se pudo enmascarar, siguiendo la regla de `contexto_del_seguimiento.py`.
  - Respuesta determinista, sin LLM.
  - Una pregunta prescriptiva **no** es `fuera_de_alcance`: va a `evidencia` y se responde sin lenguaje prescriptivo (L1D-322 AC-5).
- **Markdown (XSS):** sin `rehype-raw`, **con `rehype-sanitize`**, `urlTransform` restringido mediante `esUrlHttpSegura()` (definida en L1D-266 y reutilizada por L1D-325) y un escenario con `<img onerror>`. Aplica a L1D-314, 324 y 325.
- **Seed `P-CHAT`:** lo crea **L1D-315**. L1D-317, 320 y 326 lo consumen.
- **Ejemplos de `contracts/examples/`:** uno por caso.
  - Cada caso de turno tiene su fichero `chat-turn-caso-<caso>.json`: `chat-turn-caso-ok.json` es de L1D-316; L1D-317 añade `chat-turn-caso-situacion.json`; L1D-318, `chat-turn-caso-adt.json`, `chat-turn-caso-sin-datos.json` y `chat-turn-caso-periodo.json`; L1D-319, `chat-turn-caso-conflicto.json` y `chat-turn-caso-sin-contradicciones.json`. Ningún change amplía el fichero de otro.
  - Las salidas del LLM previas al filtro (`CHAT-CASO-INVENTA`, `CHAT-CASO-SIN-ENLACE`, `CHAT-CONFLICTO-RESUELVE`) **no** son ejemplos del contrato: son fixtures del LLM falso en `apps/rag-orchestrator/tests/fixtures/llm/`.
  - El `409` y el `503 LLM_OUTPUT_INVALID` de `/chat/turn` los implementa y prueba L1D-316, y L1D-315, L1D-316 y L1D-320 reutilizan los ejemplos existentes `rag-catalog-version-mismatch.json` y `rag-salida-llm-invalida.json`, sin duplicarlos.
  - El `503` del LLM caído es `chat-turn-llm-local-no-disponible.json`, de L1D-316; L1D-204 y L1D-322 lo reutilizan.
- **Seguimiento de evidencia (L1D-322):** escenarios de «sin chunks sobre el umbral» (cero llamadas al LLM, `topRelevanceScore = null`, RN-02) y de una afirmación con NLI `neutral` que se omite.

- **Tras la rehidratación (L1D-323):** `ultimaEvidencia` no conserva los criterios desconocidos ni el número de opciones descartadas. Si el hilo se rehidrata, esa parte del bloque `limitacion` cae a la frase genérica de FR-10. Es un comportamiento degradado aceptado en el MVP.
- **Seguimiento con `subintent` sin análisis activo (L1D-322):** la petición del oncólogo es válida y el fallo es una respuesta 200 incoherente de rag-orchestrator, así que clinical-api responde `502 ErrorServicioIa` (`RESPUESTA_INTERNA_INVALIDA`), no 422.

## 4. Errores

| Status | rag `/chat/turn` | clinical-api turno |
|---|---|---|
| 401 | `ErrorTokenServicioInvalido` | sesión, sin cambios |
| 403 | — | `PermisoDenegadoOOptOut` |
| 404 | **`ErrorHiloDesconocido {error: HILO_DESCONOCIDO, message, traceId}`** (esquema nuevo). Backend 1 lo atrapa y rehidrata | — |
| 409 | `ErrorCatalogVersionMismatch` | `ErrorCatalogVersionMismatch` (no se guarda el turno) |
| 422 | `ErrorValidacion` | `ErrorValidacion` |
| 502 | — | `ErrorServicioIa` (fallo de red con rag, como hoy) |
| 503 | `LOCAL_LLM_UNAVAILABLE` / `LLM_OUTPUT_INVALID` (esquemas existentes) | `oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida]`, sin persistir |
| 500 | `ErrorInterno` (sin cambios; su `const` no se toca, ADR-26) | — |

## 5. Decisiones del humano (2026-11-06)

Aprobado en `S6-plan.md` §6:
- `[S6 resp. 19]`: `style-src-attr 'unsafe-inline'` aceptado y días relativos aceptados.
- `[S6 resp. 21]`: orden de versiones de §1.
