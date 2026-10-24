# Design — l1d-275-generacion-opcion-max-options

## Context

Ver `proposal.md` (Why). Punto de partida: el change de L1D-106 entrega `RAGOrchestratorService` con la
rama `sin_evidencia` y delega la rama con evidencia en el puerto `EvidenceGenerator`, conectado a un
adapter que responde `503 LOCAL_LLM_UNAVAILABLE`. El pipeline objetivo del S1 (FEAT-06a Contexto técnico
de US-225, readme §6 OL-02): prompt → LLM con salida JSON restringida → validación de citas (US-063) y de
soporte (US-064) → recorte a `maxOptions` (dominio) → respuesta final. Respuesta en el idioma de la
pregunta (`meta.queryLanguage`).

## Goals / Non-Goals

**Goals:**
- Rama `con_evidencia` completa y válida contra `RagQueryInternalResponse` (ADR-26), verificable con el
  LLM y el NLI falsos (FX-06a-b).
- El recorte a `maxOptions` y el desempate por relevancia viven en **un** método de dominio con nombre
  propio (RN-28), sustituible por la selección por aplicabilidad en el S5 sin tocar el service.
- Ninguna opción llega a `evidenceOptions` sin pasar por la etapa de validación (RN-01, *fail-closed*).

**Non-Goals:**
- Recuperación y "sin evidencia" (L1D-106); reglas de citas (L1D-179) y de soporte (L1D-180).
- Síntesis con contenido, aplicabilidad, agente, 3 opciones (S3–S5); separación instrucciones/datos
  (US-057, S4); semáforo y *deadline* (US-056, S4).

## Decisions

1. **Salida del LLM con esquema interno de generación, no con `RagQueryInternalResponse`.** El adapter
   pide al LLM un JSON restringido por `GenerationOutput` (interno de `application/`, no publicado):
   `options[{option, rationale, citedChunkIds[]}]` y `synthesis{agreements[], discrepancies[]}`.
   **Sin `limitations`** `[S1 resp. 11]`: el LLM no genera limitaciones en el S1; las limitaciones solo
   salen de reglas (`estructural`). El tipo de dominio que devuelve el puerto `EvidenceGenerator`
   conserva un campo `limitaciones_propuestas` que `LlmEvidenceGenerator` deja siempre vacío en el S1;
   así la regla de L1D-180 sobre limitaciones propuestas se prueba con un generador falso sin cambiar
   el puerto. La respuesta pública se **ensambla** después: `citedSources` se completa desde
   el corpus con `construir_cita()` y `CorpusCatalogReader` de L1D-179 (RN-04), reutilizados, `relevanceScore` desde el *reranker* (RN-03) y `meta` desde configuración.
   Matiz frente al texto de la historia ("salida restringida por el esquema de
   `RagQueryInternalResponse`"): pedir al LLM el esquema público le daría campos (títulos, puntajes,
   aplicabilidad) que nunca debe aportar. El JSON final sí valida contra `RagQueryInternalResponse`
   (AC-1). Alternativa descartada: esquema público completo al LLM (invita a inventar metadatos).
2. **Etapa de validación como secuencia explícita en el service.** `RAGOrchestratorService` aplica, en
   este orden: `validar_citas()` (L1D-179) → `verificar_soporte()` (L1D-180) → `recortar_a_max_opciones()`
   (este change) → ensamblado. El recorte va **después** de la validación: se recortan opciones ya
   validadas, nunca candidatas (si se recortara antes, una opción válida podría perderse por una
   inválida más relevante).
3. **`recortar_a_max_opciones(opciones, max_options, applicability)` en `domain/option_selection.py`.**
   Con `applicability = []` (S1–S2) ordena por `relevanceScore` descendente y, a igualdad, por
   `chunkId` de la cita principal (D4) ascendente —orden total y determinista, independiente del orden
   en que el LLM emite las opciones— y conserva las `max_options` primeras. El excedente se **omite**:
   no entra en `discardedOptions` ni suma `omittedClaims` (`[S1 resp. 3]`). El número de opciones
   recortadas se registra en el log (conteo, sin texto); no se añade a `retrievalStats` porque el
   contrato lo declara cerrado (`additionalProperties: false`) y añadirlo sería un cambio de contrato
   (P4 del auditor del Gate 1). En el S5,
   US-125 sustituye el criterio por el orden de RN-28 (Regresión [RN-28] → US-125 AC-5).
4. **`relevanceScore` de la opción = el de su cita válida más relevante** (la **cita principal**; RN-28
   "la opción hereda su fuente más aplicable", y sin aplicabilidad la más relevante). Es el puntaje del
   *reranker* de ese chunk, **no una medida de la opción** ni de su solidez clínica (RN-03). Regla pura
   `relevancia_de_opcion()` en `domain/relevance.py` (archivo de L1D-106; se añade un método, no se
   modifica ninguno existente), que devuelve también la cita principal para el desempate de D3.
   **Presentación** `[S1 resp. 28]` (validación clínica, 2026-10-14): la UI (L1D-140) presenta este valor como
   "Orden basado en la cita recuperada más relevante asociada a cada opción", con la ayuda de que no resume la
   aplicabilidad, la eficacia ni la calidad global de la opción, bajo el rótulo "Relevancia de recuperación de
   evidencia". El contrato no cambia y `rag-orchestrator` no emite ese texto; se documenta aquí porque fija la
   semántica del campo que este change calcula.
   `topRelevanceScore` no se recalcula aquí: es `top_relevance_score()` de L1D-106, el máximo de los
   chunks sobre el umbral `[S1 resp. 18]`.
5. **Pregunta no terapéutica** (AC-2): `GenerationOutput.options = []` ⇒ `status = con_evidencia`,
   `evidenceOptions = []`, `topRelevanceScore` numérico (hubo chunks sobre el umbral, RN-02 no aplica).
6. **`meta` completo.** `llmModel` y `llmProvider = local` desde el adapter; `promptVersion` desde
   `PROMPT_VERSION`; `corpusRelease`, `corpusCutoffDate` y `excludedSources` desde
   `CorpusReleaseReader.release_vigente()` (L1D-106, ya en `main`; no `CorpusCatalogReader`, que solo
   entrega fichas de fuente); `responseLanguage = queryLanguage`; `latencyMs` con el reloj
   inyectado.
7. **Composición.** En la raíz de composición (`app/bootstrap.py`, L1D-164) `EvidenceGenerator` pasa del
   adapter `503` de L1D-106 a `LlmEvidenceGenerator` con `LlmClient` local (`LLM_PROVIDER=local`); con
   `LLM_PROVIDER=fake` sigue mandando `FakeEvidenceQuery` de L1D-164. Error de conexión del LLM →
   `503 LOCAL_LLM_UNAVAILABLE` (ya declarado), sin *fallback* (RN-12).
8. **Salida del LLM inválida o fuera de esquema → `503 LOCAL_LLM_UNAVAILABLE`** `[S1 resp. 12]`: JSON
   no parseable o que no valida contra `GenerationOutput` se traduce en el mismo error del adapter que
   la caída del LLM (alternativa `ErrorLlmLocalNoDisponible` del `oneOf` del `503` que crea L1D-106);
   sin reintento silencioso, sin respuesta parcial, `message` genérico sin eco del texto generado.
9. **Orden de merge y ventana *fail-closed*** (`[S1 resp. 17]`, reordenado por el coordinador tras el
   Gate 1): L1D-164 → L1D-105 → L1D-106 → **L1D-179** → **L1D-275** → L1D-180. L1D-179 llega antes y
   deja la rama con evidencia mínima (`EvidenceGenerator` → `validar_citas()` → `construir_cita()` →
   respuesta), probada con `FakeEvidenceGenerator`. Este change la amplía: `LlmEvidenceGenerator`,
   recorte, `meta` completo y el **orden final de etapas** (D2), con el punto de `verificar_soporte()`
   que rellena L1D-180. Mientras L1D-180 no esté en `main`, la composición de **producción**
   (`app/bootstrap.py`, `LLM_PROVIDER=local`) mantiene el adapter `503` de L1D-106 y solo la de test
   enlaza `LlmEvidenceGenerator`; el enlace de producción se activa en el PR de L1D-180. Ninguna opción
   sin validar sale de `rag-orchestrator`.
10. **Prompt `rag-query@0.1.0`** (`[S1 resp. 15]`): instrucciones redactadas **en positivo** ("describe
    lo que reporta la evidencia citada", "cita el `chunkId` de cada afirmación"), sin enumerar frases
    prohibidas. Un test comprueba que la plantilla (texto fijo, sin datos) no contiene términos de nivel
    A ni la raíz de nivel B (`recomend*`/`recommend*`) de `terminos-prohibidos.json` 1.1.0 (L1D-193),
    con el gemelo Python `check_prohibited_terms()`.
    **Atribución de las guías** `[S1 resp. 34]` (validación clínica, 2026-10-14): la plantilla incluye una
    instrucción, también en positivo y sin la raíz `recomend*`, del tipo "cuando describas lo que establece una
    guía, indica la población y el escenario a los que se refiere (…para pacientes con [condición] en
    [escenario]), atribúyelo a la fuente citada y no lo dirijas al paciente". Sin regla determinista: la mide
    `ai-eval-runner` (Evaluación). La instrucción se versiona con el prompt (`rag-query@0.1.0`).

## Privacidad y ownership

- **Fronteras:** `web` → `clinical-api` → `rag-orchestrator` → LLM nativo (fuera de Docker, vía
  `host.docker.internal`). Este change solo envía al LLM la `query` ya enmascarada, el `clinicalContext`
  desidentificado (seudónimo por consulta, fechas relativas, `dataRef` opacos, hecho por `clinical-api`,
  change de L1D-203, RN-10, RN-11) y el texto de los chunks del corpus.
- **`pseudoPatientId` nunca entra en el prompt** (RN-11): el constructor del prompt
  (`construir_prompt_rag_query()`) toma solo campos clínicos; un test lo verifica con PII sintética
  sembrada (FX-T4a-a).
- **`rag-orchestrator` no toca datos clínicos:** lee solo Milvus y el schema `corpus` (rol `rag_corpus`);
  sin credenciales ni ruta a `clinical-minio` ni a otros schemas.
- **Solo modelos locales** (RN-12): el adapter del LLM es local; no existe adapter de nube en el S1.
- **Logs:** `traceId`, contadores (opciones generadas, recortadas), latencias por etapa y versiones;
  **nunca** el prompt, la `query`, el contexto, el texto generado ni el texto de chunks.
- **Datos:** FX-06a-a / FX-06a-b sintéticos; ningún dato real ni identificador de paciente (RN-13, RN-14).
- **Lenguaje** (RN-23, `[S1 resp. 15]`): el prompt pide en positivo describir lo que reporta la
  evidencia, y su plantilla pasa el test de niveles A y B (D10); la última defensa en ejecución es
  `checkProhibitedTerms` sobre los campos generados en el validador de soporte (L1D-180, lista de
  L1D-193). El aviso de IA
  (RN-19) lo muestra `web`, no este backend.

## Contratos

- **Proveedor:** `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`). **Consumidor:** `clinical-api`
  (cliente generado en `packages/api-contracts`).
- **Diff propuesto del `openapi.yaml`: ninguno.** `RagQueryInternalResponse` (con `status`,
  `synthesis`, `applicability`, `evidenceOptions` `maxItems: 3`, `discardedOptions`, `limitations`,
  `omittedClaims`, `agentSteps`, `topRelevanceScore` numérico fuera de `sin_evidencia`) y `RagMeta`
  (`corpusCutoffDate`, `promptVersion`, `llmModel`) ya están congelados (US-033); `maxOptions` (1–3) ya
  está en `RagQueryInternalRequest`; `503 ErrorLlmLocalNoDisponible` ya está declarado (desde L1D-106,
  como alternativa del `oneOf` del `503`, `[S1 resp. 12]`).
- **Ejemplos:** sin cambios. `contracts/examples/rag-query-con-evidencia.json` sigue siendo válido (forma
  S4); los valores del S1 (AC-1) se fijan en los tests con FX-06a-a, no en un ejemplo nuevo.
- **Esquema interno `GenerationOutput`:** no es contrato entre servicios; vive en `application/` y no se
  publica.
- **Compatibilidad:** sin cambio → `oasdiff` sin diferencias; ADR-26 respetado.
- **Modelos Pydantic:** los generados (`app/schemas/generated/models.py`), sin editar.
- **Validación de respuestas:** `200 con_evidencia` (AC-1, AC-2, AC-3) y `503 LOCAL_LLM_UNAVAILABLE`
  (caída y salida inválida) se validan contra el spec con el *helper* de L1D-164 `[S1 resp. 17]`;
  `contracts:verify-provider` no existe hasta US-214.

## Evaluación

Introduce el **prompt** del S1 (`rag-query@0.1.0`) → OL-06 obligatoria. Métricas afectadas: fidelidad
(≥ 0,90, M-07.2), precisión de citas (≥ 0,90), salidas prescriptivas (= 0) y JSON válido (≥ 99 %, medido
en L1D-274 AC-2). La suite `evaluate` llega con US-072 (S2): en el S1 `ai-eval-runner` evalúa a mano el
análisis del paciente semilla con el LLM real (walking skeleton, `CLAUDE.md` Roadmap) y **registra
M-10.2** (salidas prescriptivas = 0) en su reporte, junto con la **tasa de menciones de guía sin población ni
escenario** `[S1 resp. 34]` (menciones de lo que establece una guía sin "…para pacientes con [condición] en
[escenario]" o dirigidas al paciente / total de menciones de guía), informativa y sin meta en el S1; la suite
`evaluate` (US-072) la registra en cada ejecución. Los AC se
verifican con el LLM falso; ningún umbral cambia en este change.

## Dependencias y colaboradores

| Módulo | Nuevo/modifica | Depende de |
|---|---|---|
| `app/application/rag_orchestrator_service.py` | modifica (L1D-106) | rama con evidencia: `EvidenceGenerator`, validadores de L1D-179/L1D-180, `recortar_a_max_opciones()`, `construir_cita()` y `CorpusCatalogReader` (puerto de L1D-179), `Clock` |
| `app/application/generation.py` | nuevo | `GenerationOutput` (Pydantic interno); `LlmEvidenceGenerator` implementa `EvidenceGenerator` sobre el puerto `LlmClient` |
| `app/application/ports.py` | modifica (L1D-106) | añade `LlmClient` (Protocol) si L1D-274 no lo crea |
| `app/prompts/rag_query.py` | nuevo | `construir_prompt_rag_query()` (puro; sin `pseudoPatientId`, RN-11); plantilla en positivo (D10) |
| `app/domain/option_selection.py` | nuevo | — (puro): `recortar_a_max_opciones()` (FR-09, RN-28) |
| `app/domain/relevance.py` | modifica (L1D-106) | añade `relevancia_de_opcion()` (RN-03, RN-28) |
| `app/infrastructure/llm/` | nuevo | adapter OpenAI-compatible local (`httpx`) y adapter falso de test (FX-06a-b, contador de invocaciones) |
| `app/bootstrap.py` | modifica (L1D-164) | enlace de `LlmEvidenceGenerator` en la composición de test; en producción, tras L1D-180 (D9) |
| `app/config/settings.py` | modifica (L1D-164) | `PROMPT_VERSION` |

El service no importa `httpx` ni clientes concretos; recibe puertos por constructor.

## Risks / Trade-offs

- [Orden de merge con L1D-179 / L1D-180] → D9; la regla *fail-closed* evita emitir una opción sin
  validar entre merges.
- [Choque en `rag_orchestrator_service.py` con L1D-106, L1D-179 y L1D-180] → cada change toca solo su
  etapa; este change es dueño del orden de etapas y del ensamblado final.
- [El LLM real devuelve JSON fuera de esquema] → `503 LOCAL_LLM_UNAVAILABLE` (D8); la cifra real la mide
  L1D-274 AC-2.
- [`relevanceScore` de opción leído como medida de la opción] → D4 lo documenta como metadato de la cita
  principal; regla aislada en un método, barata de cambiar.

## Migration Plan

No hay datos ni esquema. Rollback: revertir el PR; la rama con evidencia vuelve al `503` de L1D-106.

## Open Questions

- **Resuelta `[S1 resp. 17]` · orden de merge y ventana *fail-closed*:** D9.
- **Resuelta `[S1 resp. 12]` · JSON del LLM inválido o fuera de esquema:** `503 LOCAL_LLM_UNAVAILABLE` (D8).
- **Resuelta (Gate 1) · desempate y `relevanceScore` de opción:** `relevanceScore` desc. y `chunkId` de la
  cita principal asc. (D3); `relevanceScore` de opción = el de su cita más relevante (D4).

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-28] selección por aplicabilidad activa desde S5 (US-125 AC-5).
- Regresión [RN-01] citas y soporte en la rama con evidencia: escenarios en L1D-179 y L1D-180 (S1).
- Regresión [RN-15] `403` por opt-out activa desde S6 (US-148), en `clinical-api`.
- Regresión [SEG-13] separación instrucciones/datos activa desde S4 (US-057).
