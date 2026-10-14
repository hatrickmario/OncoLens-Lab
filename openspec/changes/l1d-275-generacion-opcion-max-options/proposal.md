# Proposal — l1d-275-generacion-opcion-max-options

## Trazabilidad

L1D-275 · US-225 · FEAT-06a (L1D-16) · Sprint 1 · Estimación **3** · HU-03 · FR-09 (S1: dense, 1 opción,
contrato final), FR-25 (contrato) · RN-01 (consume), RN-03, RN-04 (consume), RN-06 (contrato que persiste
`clinical-api`), RN-12, RN-22, RN-23, RN-28 (desempate por relevancia mientras no hay aplicabilidad) ·
AC-05.3 (parte S1), AC-10.1 (1 opción) · OL-02 · ADR-8, ADR-26 · US-225 AC-1, AC-2, AC-3 ·
Medido en: US-072 (fidelidad M-07.2, precisión de citas, M-10.1), US-073 (M-06.1, M-06.2) ·
🔗 Regresión [RN-28] → US-125 AC-5 (activa desde S5) ·
`[S1 resp. 11]` (el LLM no genera limitaciones en el S1) · `[S1 resp. 12]` (salida inválida → `503 LOCAL_LLM_UNAVAILABLE`) ·
`[S1 resp. 15]` (RN-23 en dos niveles) · `[S1 resp. 17]` (nombres canónicos y orden de merge) · `[S1 resp. 18]` (`topRelevanceScore`).

> **Decidido (usuario, 2026-10-13, `[S1 resp. 6]`, retro del Pre-S1 P-5):** US-055 (8) se parte por
> superficie en recuperación (US-055, 5; change de L1D-106) y generación y recorte (**US-225**, 3; este
> change). Los AC de US-225 son los antiguos AC de US-055: **AC-1 = ex US-055 AC-1**, **AC-2 = ex US-055
> AC-7** y **AC-3 = ex US-055 AC-8**; los números de US-055 no se reutilizan
> (`backlog/features/FEAT-06a-analisis-walking-skeleton.md`, `backlog/sprints/S1-refinamiento.md` §resp. 6).
>
> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos "(asumido)" se aceptan; en esta
> historia, el del AC-3: el excedente sobre `maxOptions` **no** es una opción descartada.

## Why

El change de L1D-106 deja `POST /rag/query` recuperando, puntuando y respondiendo "sin evidencia" sin
LLM; con evidencia sobre el umbral responde `503 LOCAL_LLM_UNAVAILABLE` a través de un adapter
provisional del puerto `EvidenceGenerator`. Sin el tramo de generación, el walking skeleton del S1 no
puede mostrar al oncólogo un análisis completo: una opción **descrita en la evidencia**, con su cita, en
la forma final de `RagQueryInternalResponse` que `clinical-api` persiste (RN-06) y que no cambia entre
sprints (ADR-26).

## What Changes

- **Implementación real del puerto `EvidenceGenerator`** (declarado por L1D-106) en
  `apps/rag-orchestrator`: construcción del prompt del S1 (versión `rag-query@0.1.0`, en configuración)
  con la pregunta enmascarada, el contexto clínico desidentificado y los chunks sobre el umbral; llamada
  al puerto `LlmClient` con salida JSON restringida por un esquema interno de generación (opciones,
  justificación, `chunkId` citados, síntesis); **sin `limitations`**: el LLM no genera limitaciones en el
  S1 `[S1 resp. 11]`. El LLM solo aporta `chunkId`, nunca metadatos de la fuente (RN-04). Las
  instrucciones del prompt se redactan en positivo y la plantilla no contiene términos de nivel A ni la
  raíz de nivel B de RN-23 (lista de L1D-193, `[S1 resp. 15]`).
- **Salida del LLM inválida o fuera de esquema → `503 LOCAL_LLM_UNAVAILABLE`** (`[S1 resp. 12]`), sin
  reintento silencioso ni respuesta parcial.
- **Rama `con_evidencia` del pipeline** en `RAGOrchestratorService`: generación → etapa de validación
  (citas, L1D-179; soporte NLI, L1D-180) → recorte a `maxOptions` → ensamblado de la respuesta final.
  Sustituye, en la composición, el adapter `503` provisional de L1D-106 para el caso con evidencia.
- **Contrato final ya en el S1** (FR-25): `status = con_evidencia`, `synthesis` con `agreements = []` y
  `discrepancies = []`, `applicability = []`, `agentSteps = []`, `topRelevanceScore` = máximo de los
  chunks sobre el umbral (`top_relevance_score()` de L1D-106, `[S1 resp. 18]`), `meta.corpusCutoffDate`
  del `CorpusRelease` vigente y `meta` completo (`llmModel`, `promptVersion`,
  `responseLanguage = queryLanguage`). `limitations` solo trae limitaciones de regla o verificadas por
  L1D-180; con el *fixture* `LLM-OK` sale `[]` y `omittedClaims = 0` (es la salida de ese *fixture*, no
  un invariante).
- **Pregunta no terapéutica** (AC-05.3): si el LLM no propone opciones, `con_evidencia` con
  `evidenceOptions = []` (no es "sin evidencia": hubo evidencia y el LLM se invocó una vez).
- **Regla de dominio `recortar_a_max_opciones()`** (FR-09, RN-28): con `applicability = []` (S1–S2) se
  conservan las `maxOptions` de mayor `relevanceScore`, con desempate por `chunkId` de la cita
  principal ascendente; el excedente se omite y **no** va a `discardedOptions` (`[S1 resp. 3]`). El
  número de opciones recortadas solo se registra en el log (`retrievalStats` es cerrado en el contrato).
  El `relevanceScore` de una opción es el de su cita válida más relevante (la cita principal): es un
  metadato de esa cita, no una medida de la opción (RN-03).
- **Sin cambios de contrato:** `apps/rag-orchestrator/openapi.yaml` (congelado en US-033) ya declara todo
  lo que se emite.

## Capabilities

### New Capabilities

- Ninguna. `evidence-analysis` la crea el change de L1D-106 (con su `## Purpose`).

### Modified Capabilities

- `evidence-analysis`: este change **añade** (ADDED) los requisitos de generación con evidencia,
  pregunta no terapéutica y recorte a `maxOptions`. No modifica ningún requisito de L1D-106: el `503`
  provisional es una decisión de diseño de ese change (design D4, tarea 2.10), no un requisito de su spec.
  No redefine el `## Purpose`.

## Bounded contexts

- **ai-services** (único): `apps/rag-orchestrator`.
- No toca `clinical-platform` (el consumidor ya usa el cliente generado) ni `frontend`.

## Dependencias

- **Orden de merge** `[S1 resp. 17]`: L1D-164 → L1D-105 → L1D-106 → L1D-179 → **L1D-275** → L1D-180.
- ↪ **Depende de** el change de **L1D-106** (US-055): `RAGOrchestratorService` (implementa
  `EvidenceQueryPort` de L1D-164), puertos (incluido `EvidenceGenerator`), umbral, filtros,
  `top_relevance_score()` y `relevanceScore`. **Secuencial:** este change reemplaza en la
  raíz de composición el adapter `503 LOCAL_LLM_UNAVAILABLE` de L1D-106 (su tarea 2.10) y amplía su
  service; debe implementarse sobre L1D-106 mergeado.
- ⛔ **Bloqueado por** el change de **L1D-274** (US-224 · ADR-39 fase B): solo el adapter real del LLM
  (runtime, modelo, `num_ctx`, restricción por JSON Schema). Todos los AC se verifican con el LLM falso
  (FX-06a-b), así que el desarrollo arranca sin esperar. A su vez L1D-274 usa el prompt del S1 de este
  change para sus 200 llamadas por candidato (↪ en sentido inverso).
- ↪ **Depende de** el change de **L1D-179** (US-063, mergea **antes**): rama con evidencia mínima en el
  service, `validar_citas()`, `construir_cita()`, el puerto `CorpusCatalogReader` (dueño: L1D-179) y
  `FakeEvidenceGenerator`. Este change los **reutiliza**; no crea otro repositorio del catálogo.
- 🔗 **Ampliado por** el change de **L1D-180** (US-064, soporte NLI), que mergea **después** e inserta
  `verificar_soporte()` en el orden de etapas que fija este change; ventana *fail-closed* en design D9.
- ↪ **Depende de** el change de **L1D-114** (US-058): `CorpusRelease` (`cutoff_date`,
  `excluded_sources`) en el schema `corpus`, leído vía `CorpusCatalogReader` (L1D-179) para
  `meta.corpusCutoffDate` y `meta.excludedSources`.
- ↪ **Depende de** el change de **L1D-164** (US-034): esqueleto, `app/api/rag_query.py`,
  `EvidenceQueryPort`, `Settings` (`app/config/settings.py`), raíz de composición (`app/bootstrap.py`,
  modo `LLM_PROVIDER=fake`) y el *helper* de validación de respuestas contra el spec `[S1 resp. 17]`.
- ↪ **Depende de** el change de **L1D-193** (US-068): lista `terminos-prohibidos.json` 1.1.0 (niveles A
  y B, `[S1 resp. 15]`) para el test de la plantilla del prompt.
- 🔗 **Relacionado** con el change de
  **L1D-203** (US-049, desidentificación en `clinical-api`, que produce el contexto que llega aquí).

## Fuera de alcance

- Recuperación, umbral, "sin evidencia", filtros y `relevanceScore`: L1D-106 (US-055).
- Validación de citas y copia de metadatos desde el corpus (L1D-179, US-063); NLI, descartadas y
  `omittedClaims` > 0 (L1D-180, US-064).
- Síntesis con contenido, aplicabilidad, agente, selección por aplicabilidad y hasta 3 opciones: S3–S5
  (US-125, US-134, FEAT-08b).
- Separación de instrucciones y datos frente a *prompt injection* (US-057, S4); semáforo, *deadline*,
  `429`/`504` (US-056, S4).
- Elección del runtime y del modelo (L1D-274) y suite `evaluate` (US-072, S2).

## Impact

- Código: `apps/rag-orchestrator/app/{application,domain,infrastructure/llm,prompts}/` y tests en
  `apps/rag-orchestrator/tests/`, sobre los módulos que crea L1D-106.
- Configuración: `PROMPT_VERSION` y claves del adapter del LLM (`LLM_BASE_URL`, `LLM_MODEL` de
  L1D-164/L1D-274); `maxOptions` llega en el request (1 en S1–S3).
- Contratos: ninguno; `200 con_evidencia` y `503` validados con el *helper* de L1D-164 (la verificación
  del proveedor completa llega con US-214).
- Evaluación: cambia el **prompt** → OL-06 obligatoria; mientras no exista la suite (US-072, S2),
  evaluación manual de `ai-eval-runner` sobre el paciente semilla, que registra M-10.2 (salidas
  prescriptivas = 0).
- Datos: solo FX-06a-a y FX-06a-b (sintéticos); ningún dato real ni identificador de paciente
  (RN-13, RN-14).
