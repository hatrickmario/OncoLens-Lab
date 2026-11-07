# Design — l1d-329-segundo-loop-contextual

## Context

Ver `proposal.md` (Why) y `docs/architecture/adr/ADR-52-segundo-loop-contextual.md` (decisión, opciones y medición). El
primer loop de `/rag/query` recupera con la pregunta, el *reranker* la puntúa y, si nada supera `RELEVANCE_THRESHOLD`,
`RAGOrchestratorService._segundo_loop_si_corresponde` decide si hay un segundo loop (hoy solo la reescritura US-238, con
LLM y desactivada). El nodo `evidencia` del chat (`l1d-322`) reutiliza ese caso de uso, de modo que el cambio vale para el
chat y para `POST /rag/query`; `/rag/follow-up` y el seguimiento del chat quedan `no_aplica` (RN-24).

## Goals / Non-Goals

**Goals:** que una pregunta sin tema propio recupere evidencia con el caso, sin falsos positivos ni LLM; decisión
determinista, auditable y revertible con un indicador; léxico versionado y validado.

**Non-Goals:** activar la reescritura con LLM; HyDE; *reranking* en dos etapas; puntaje combinado; gate con LLM; tocar el
umbral (0,30); segundo loop en seguimiento.

## Decisions

1. **Dónde.** Una sola función de decisión en `_segundo_loop_si_corresponde`, con la prioridad: (a) primer loop con chunks
   sobre el umbral → sin segundo loop (`no_disparado`); (b) vacío, gate G1 verdadero y `QUERY_CONTEXT_EXPANSION_ENABLED` →
   loop contextual; (c) vacío y reescritura habilitada → reescritura US-238; (d) en otro caso, sin segundo loop. Como
   máximo **uno**: el contextual cuenta como el segundo loop y la reescritura no corre tras él (AC-5), aunque
   `QUERY_REWRITE_MAX_ITERATIONS` sea mayor. Alternativa descartada: encadenar ambos (rompería RN-02 y sumaría latencia).
2. **Gate G1 `pregunta_sin_tema_propio(pregunta, léxico) -> bool`** (pura, `domain/`): normaliza como el resto del dominio
   (`sin_tildes`, minúsculas, puntuación a espacio), separa palabras y quita las vacías y de marco (`marcos` y `vacias` por
   idioma del léxico); es verdadero si no queda ninguna. Una pregunta vacía tras normalizar **no** es genérica (la rechaza
   la validación previa). El idioma lo da el detector existente; si es ambiguo se evalúa la unión es ∪ en.
   Alternativa descartada: gate con LLM local (opción C de ADR-52: 3 falsos del gate, no determinista).
3. **`terminos_del_caso(contexto, catalogo, campos) -> tuple[str, ...]`** (pura): para cada campo de
   `QUERY_CONTEXT_EXPANSION_FIELDS` toma el término **canónico del catálogo**: `tipo` = etiqueta CIE-10 del tipo de
   cáncer (`codigos.json`); `estadio` = el estadio TNM del `clinicalContext` si pertenece a los valores permitidos del
   catálogo (`atributos.json`); `biomarcador_principal` = el primero con valor presente según el orden de los datos
   críticos del catálogo del tipo; en próstata, además el grado (`Diagnosis.grade`, Gleason/ISUP, PRD B-08) si el valor
   está en el catálogo. Un valor que no esté en el catálogo se descarta sin inventar código (RN-27). Sin ningún término →
   no hay segundo loop (`sin_evidencia`). *Supuesto a validar en la implementación:* el criterio de «biomarcador
   principal» es el orden de `datos-criticos`; si la medición usó otro, manda la medición y se anota aquí.
4. **Consulta del *reranker*.** `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`: `"<pregunta> <términos separados por
   espacio>"`. La pregunta original va primero y se conserva en la respuesta y en `ultimaEvidencia.query` (solo lo
   puntuado cambia). Esto relaja el principio de US-238 «la pregunta original manda» **solo** para preguntas sin tema
   propio (enmienda de ADR-52), donde esa pregunta no aporta tema. Los términos nunca salen de `rag-orchestrator` ni se
   registran con su valor (solo `reason`, conteo de términos y `traceId`).
5. **Un segundo loop y RN-02.** Si el loop contextual tampoco supera el umbral: `sin_evidencia`,
   `topRelevanceScore = null` (nunca `0.0`) y 0 invocaciones al LLM de generación y al agente. Un LLM de reescritura
   habilitado tampoco se invoca en la variante contextual (AC-5).
6. **Configuración (RN-22).** Tres claves en `Settings`, leídas al arrancar y validadas (campos del conjunto
   `{tipo, estadio, biomarcador_principal}`; formato del conjunto `{plano}`; un valor desconocido aborta el arranque):
   `QUERY_CONTEXT_EXPANSION_ENABLED=false`, `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,estadio,biomarcador_principal`,
   `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`. El umbral y `QUERY_REWRITE_*` no cambian.
7. **Mensaje «recuperado sin opciones soportadas» (AC-10).** Cuando el pipeline termina con chunks sobre el umbral y 0
   opciones tras citas y NLI, la respuesta de chat lleva un único bloque `limitacion` de texto fijo («Evidencia
   recuperada sin opciones soportadas», en `Settings`/`domain/chat/mensajes.py`, RN-22) y las limitaciones de
   `l1d-323` (US-266); el LLM no escribe ese texto. **Coordinación:** `l1d-323` (O5, ⛔322) es dueño de las limitaciones;
   este change solo añade el caso «hay chunks pero 0 opciones» y se rebasa sobre `l1d-323` si este mergea antes.
8. **Léxico.** `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json`: `{ version, es: {marcos[], vacias[]},
   en: {marcos[], vacias[]} }`, con su esquema en `schemas/`, validado por `catalog:validate` (RN-29: sin duplicados, sin
   cadenas vacías, normalizadas, cada idioma presente; versión del catálogo 1.6.0 → **1.7.0**). Se lee desde
   `CLINICAL_CATALOG_PATH` (solo lectura, ambos backends; un desfase → `409`). Los sinónimos antraciclinas↔anthracyclines,
   pertuzumab y TILs van en `mama/sinonimos.json` (versión de fichero nueva) y se validan con el validador existente.
   Riesgo conocido de ADR-52: el léxico se escribió con las preguntas de la medición a la vista; se mitiga con las 69
   preguntas de `s5` (0 falsas genéricas) y con `evaluate`.

## Contratos

Proveedor: `rag-orchestrator`. Consumidor: `clinical-api` (cliente generado) y, indirectamente, `web`.

- **Qué cambia en el spec:** `RagMeta.retrievalParams.queryRewrite.reason` gana el valor `contextual` y la regla
  `if/then/else` del esquema pasa a `applied = true ⇒ reason ∈ {disparado, contextual}`; la descripción documenta que
  `contextual` es el segundo loop sin LLM (US-271). Es un cambio **aditivo** (ADR-26).
- **Decisión sobre la versión:** el valor nuevo cambia el `openapi.yaml` (enum y descripción), así que **sube la versión
  menor** de rag (ADR-26, `[S2 resp. 12]`); no basta con solo la descripción, porque el enum es parte del contrato
  verificable. Orden con el glosario S6 §1: main está en **rag 1.13.0** (`l1d-322`); `l1d-330-relative-end-day` toma la
  **1.14.0** reservada y este change la **1.15.0**. Si mergean en orden inverso, el segundo en mergear se renumera (regla
  del glosario §1: «Si una versión colisiona, se renumera el segundo en mergear»); la tarea 1.1 dice «la siguiente menor
  libre» y lo comprueba con `git fetch` antes del commit `contract(L1D-329)`. clinical-api **no** cambia (el motivo no
  llega al navegador).
- **ADR-26:** `response-property-enum-value-added` en `POST /rag/query` es ERR de oasdiff; requiere una fila nueva en
  `scripts/ci/contracts-breaking-excepciones.json` y en la tabla de ADR-26 (un valor, una excepción, como E-6…E-9).
  Queda como pendiente P-1 para confirmación del PO.
- **Ejemplo:** `contracts/examples/rag-query-contextual.json` (respuesta `con_evidencia` con
  `queryRewrite = {applied: true, reason: "contextual"}`) y su petición registrada en `index.json`; un segundo ejemplo
  `rag-query-contextual-sin-evidencia.json` con `topRelevanceScore: null`.
- Pydantic y TS se generan del spec; nunca a mano.
- **Catálogo:** versión 1.7.0 del `manifest.json` y de las referencias (configuración, Compose, tests, ejemplos con
  `catalogVersion`); no es contrato OpenAPI pero un desfase entre backends da `409`.

## Privacidad y ownership

- `clinical-api → rag-orchestrator` ya envía `clinicalContext` desidentificado y la pregunta enmascarada; este change no
  añade campos ni cruces nuevos. `rag-orchestrator` solo lee el catálogo montado de solo lectura, el schema `corpus` y
  Milvus; no toca datos clínicos ni `clinical-minio`; no persiste nada.
- **Los términos añadidos a la consulta son etiquetas del catálogo**, nunca texto libre del expediente, ni
  `pseudoPatientId`, ni identidad, ni fechas (RN-10, RN-11, RN-27). Un test captura la consulta que recibe el *reranker* y
  los *logs* y comprueba que no hay nada fuera del catálogo y la pregunta (AC-6).
- Logs: `reason`, número de términos, campos usados, `traceId`; nunca los términos con valor, la pregunta ni el texto.
- Solo modelos locales; el loop contextual no invoca ningún LLM (RN-12 trivialmente).

## Evaluación

Cambia umbral (uso de la consulta enriquecida) y catálogo: suite `evaluate` obligatoria (OL-06) con `ai-eval-runner` real
sobre `apps/rag-orchestrator/eval/configs/s5.yaml` y las 60 preguntas de la medición: 18/22 genéricas con evidencia,
0/24 falsos positivos (melanoma, tiroides, cruzadas mama/próstata, glioblastoma, CRISPR, diabetes, CAR-T, vejiga), controles
con tema propio idénticos, recall@10 y MRR sin regresión (referencia: 1,0 y 0,858) y p95 de recuperación (referencia 2,37
s). El indicador solo pasa a `true` en `.env.example` y Compose tras ese PASS (tarea humana H-2).

## Risks / Trade-offs

- [El léxico sobreajusta a las preguntas de la medición] → 69 preguntas de `s5` como control y revisión en `evaluate`.
- [+0,9 s de recuperación; p95 de turno 14,8 s frente al límite de 15 s] → el indicador es revertible; la latencia se
  publica en el reporte.
- [El corpus no está balanceado entre tipos] → la medición no garantiza el mismo recall en otros tipos; se informa.
- [Choque de versión de contrato con `l1d-330`] → regla del glosario (se renumera el segundo).
- [`/platform/evidence-analyses` también pasa por `/rag/query`] → el gate aplica igual; el formulario de pregunta única
  sale de la UI con `l1d-324`, pero el endpoint sigue vigente y queda cubierto por los mismos tests.
