# Design — l1d-329-segundo-loop-contextual

## Context

Ver `proposal.md` (Why) y `docs/architecture/adr/ADR-52-segundo-loop-contextual.md` (decisión, opciones y medición). El
primer loop de `/rag/query` recupera con la pregunta, el *reranker* la puntúa y, si nada supera `RELEVANCE_THRESHOLD`,
`RAGOrchestratorService._segundo_loop_si_corresponde` decide si hay un segundo loop (hoy solo la reescritura US-238, con
LLM y desactivada). El nodo `evidencia` del chat (`l1d-322`) reutiliza ese caso de uso, de modo que el cambio vale para el
chat y para `POST /rag/query`; `/rag/follow-up` y el seguimiento del chat quedan `no_aplica` (RN-24).

## Goals / Non-Goals

**Goals:** que una pregunta sin tema propio recupere evidencia con el caso, sin falsos positivos ni LLM; decisión
determinista, auditable y revertible con un indicador; léxico versionado y validado; contrato aditivo sin excepciones.

**Non-Goals:** activar la reescritura con LLM; HyDE; *reranking* en dos etapas; puntaje combinado; gate con LLM; tocar el
umbral (0,30); segundo loop en seguimiento.

## Decisions

1. **Dónde.** Una sola función de decisión en `_segundo_loop_si_corresponde`, con la prioridad: (a) primer loop con chunks
   sobre el umbral → sin segundo loop; (b) vacío, gate G1 verdadero, `QUERY_CONTEXT_EXPANSION_ENABLED` y **al menos un
   término admitido** → loop contextual; (c) vacío y reescritura habilitada → reescritura US-238; (d) en otro caso, sin
   segundo loop. Como máximo **uno**: el contextual cuenta como el segundo loop y la reescritura no corre tras él (AC-5),
   aunque `QUERY_REWRITE_MAX_ITERATIONS` sea mayor. Con gate verdadero, indicador activo y **0 términos admitidos** no
   hay loop contextual: cae a (c) o (d) y, con la reescritura apagada, `queryRewrite = {applied: false, reason:
   "no_disparado"}` y `contextExpansion` ausente. Alternativa descartada: encadenar ambos (rompería RN-02 y sumaría latencia).
2. **Gate G1 `pregunta_sin_tema_propio(pregunta, léxico) -> bool`** (pura, `domain/`): normaliza como el resto del dominio
   (`sin_tildes`, minúsculas, puntuación a espacio), separa palabras y quita las vacías y de marco (`marcos` y `vacias` por
   idioma del léxico); es verdadero si no queda ninguna. Una pregunta vacía tras normalizar **no** es genérica (la rechaza
   la validación previa). El idioma lo da el detector existente; si es ambiguo se evalúa la unión es ∪ en.
   Alternativa descartada: gate con LLM local (opción C de ADR-52: 3 falsos del gate, no determinista).
3. **`terminos_del_caso(contexto, catalogo, campos) -> tuple[str, ...]`** (pura): para cada campo de
   `QUERY_CONTEXT_EXPANSION_FIELDS` toma el término **canónico del catálogo**: `tipo` = etiqueta CIE-10 del tipo de
   cáncer (`codigos.json`); `estadio` = el estadio TNM del `clinicalContext` si pertenece a los valores permitidos del
   catálogo (`atributos.json`); `biomarcador_principal` = el primero con valor presente según el orden de los datos
   críticos del catálogo del tipo, **y su valor solo entra si pertenece al conjunto de valores del catálogo** (un valor
   libre o fuera del conjunto se descarta y entra solo el nombre canónico del biomarcador, o nada si tampoco es del
   catálogo); en próstata, además el grado (`Diagnosis.grade`, Gleason/ISUP, PRD B-08) si el valor está en el catálogo.
   Un valor que no esté en el catálogo se descarta sin inventar código (RN-27). Sin ningún término → no hay segundo loop.
   La función devuelve también los **campos usados** (subconjunto del conjunto cerrado `{tipo, estadio,
   biomarcador_principal}`) para `contextExpansion.fields` y el aviso; el grado de próstata se declara bajo `estadio`
   porque el conjunto cerrado de campos no tiene `grado` (se evita ampliar el enum del contrato). *Supuesto a validar en la implementación:* el criterio de «biomarcador principal» es el orden de
   `datos-criticos`; si la medición usó otro, manda la medición y se anota aquí.
4. **Consulta del *reranker*.** `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`: `"<pregunta> <términos separados por
   espacio>"`. La pregunta original va primero y se conserva en la respuesta y en `ultimaEvidencia.query` (solo lo
   puntuado cambia). Esto relaja el principio de US-238 «la pregunta original manda» **solo** para preguntas sin tema
   propio (enmienda de ADR-52). Los términos nunca salen de `rag-orchestrator` ni se registran con su valor (solo
   `contextExpansion.fields`, conteo de términos y `traceId`).
5. **Un segundo loop y RN-02.** Si el loop contextual tampoco supera el umbral: `sin_evidencia`,
   `topRelevanceScore = null` (nunca `0.0`) y 0 invocaciones al LLM de generación y al agente. Un LLM de reescritura
   habilitado tampoco se invoca en la variante contextual (AC-5). `contextExpansion` se emite igual (el loop corrió).
6. **Configuración (RN-22).** Tres claves en `Settings`, leídas al arrancar y validadas (campos del conjunto
   `{tipo, estadio, biomarcador_principal}`; formato del conjunto `{plano}`; un valor desconocido aborta el arranque):
   `QUERY_CONTEXT_EXPANSION_ENABLED=false`, `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,estadio,biomarcador_principal`,
   `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`. El umbral y `QUERY_REWRITE_*` no cambian.
7. **Mensaje «recuperado sin opciones soportadas» (AC-10).** Cuando el pipeline termina con chunks sobre el umbral y 0
   opciones tras citas y NLI, la respuesta de chat lleva un único bloque `limitacion` de texto fijo («Evidencia
   recuperada sin opciones soportadas», en `Settings`/`domain/chat/mensajes.py`, RN-22), las limitaciones de `l1d-323`
   (US-266) y `notices[]` con los **dos avisos de RN-19** («Generado por IA; requiere validación clínica independiente por
   el oncólogo tratante» y «Uso académico/investigación»), como en cualquier turno con contenido de evidencia. El LLM no
   escribe ese texto. **Coordinación:** `l1d-323` (O5, ⛔322) es dueño de las limitaciones; este change solo añade el caso
   «hay chunks pero 0 opciones» y se rebasa sobre `l1d-323` si este mergea antes (orden esperado 323 → 330 → 329).
8. **Aviso de ampliación (L3).** Cuando el turno de chat usó el loop contextual, `notices[]` incluye el literal
   determinista «La búsqueda se amplió con datos del caso: » seguido de los nombres de los campos realmente usados
   (`tipo`, `estadio`, `biomarcador`, unidos con comas y «y»; con los tres: «tipo, estadio y biomarcador»). Lo arma el
   código desde `contextExpansion.fields`, nunca el LLM, y nunca incluye valores. Va en el turno de chat, no en
   `/rag/query` (que no tiene `notices[]`) ni en la Base del análisis.
9. **Léxico y versiones del catálogo.** `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json`: `{ version, es:
   {marcos[], vacias[]}, en: {marcos[], vacias[]} }`, con su esquema en `schemas/`, validado por `catalog:validate`
   (RN-29: sin duplicados, sin cadenas vacías, normalizadas, cada idioma presente). Se lee desde `CLINICAL_CATALOG_PATH`
   (solo lectura, ambos backends; un desfase → `409`). **Qué versión sube cada fichero:** `manifest.version` sube a
   **1.7.0** (gobierna `mama/sinonimos.json` y los demás de raíz y por tipo; el guardián compara el archivo entero contra
   `origin/main`); `lenguaje/terminos-prohibidos.json` tiene versión propia y **no sube** (la coherencia con el manifest es
   una convención que el guardián no exige; por eso `packages/clinical-language` no cambia); `lenguaje/marcos-de-pregunta.json`
   nace con `version` igual a la del manifest. Como `scripts/catalog/version-guard.mjs` registra explícitamente lo que
   vigila (`CON_VERSION_PROPIA = ['lenguaje/terminos-prohibidos']`), este change **añade `lenguaje/marcos-de-pregunta`** a
   esa lista, con su test (`scripts/catalog/__tests__`): contenido cambiado sin subir versión → falla; primera
   publicación → pasa. Los sinónimos antraciclinas↔anthracyclines, pertuzumab y TILs van en `mama/sinonimos.json`.
   Riesgo conocido de ADR-52: el léxico se escribió con las preguntas de la medición a la vista; se mitiga con las 69
   preguntas de `s5` (0 falsas genéricas) y con `evaluate`.
10. **Fixture compartido caso → tema.** `packages/clinical-catalogs/test/fixtures/temas-del-caso.json`: lista de casos con
    **entrada en las dos formas** (`patientSummary` = `diagnosis` + `recentBiomarkers` tal como los devuelve `GET
    /platform/patients/{id}`, que consume `l1d-324`; y `clinicalContext` desidentificado, que consume
    `terminos_del_caso`) y la **salida esperada** (campos y términos canónicos del catálogo). Cubre mama con estadio y
    biomarcador, próstata con grado, caso sin estadio ni biomarcador, valor fuera del catálogo y tipo sin etiqueta. Lo crea
    este change (va antes en O5) y `l1d-324` lo consume; un test de cada lado lo ejecuta contra su propia regla.

## Contratos

Proveedor: `rag-orchestrator`. Consumidor: `clinical-api` (cliente generado) y, indirectamente, `web`.

**Decisión (usuario, 2026-11-06): sin excepciones ADR-26.** Añadir `contextual` al enum de `queryRewrite.reason` daba 12 ERR
de oasdiff (4 hallazgos × `POST /rag/query`, `/rag/follow-up` y `/chat/turn`: `response-property-enum-value-added` para
`contextual` en `…/queryRewrite/reason` y en `…/queryRewrite/then/reason`, el mismo para `disparado` en `then/reason` y
`response-property-const-removed`). Se descarta y se usa una **propiedad nueva y opcional**; `queryRewrite` no se toca.

Simulación con oasdiff 1.33.0 sobre los specs empaquetados de `origin/main` (base) contra la forma elegida (head):

| Forma | `POST /rag/query` | `POST /rag/follow-up` | `POST /chat/turn` | clinical-api |
|---|---|---|---|---|
| A. enum `contextual` + `then: enum` (descartada) | 3 ERR | 3 ERR | 3 ERR (+1 `const-removed`, 12 en total) | 0 |
| **B. `retrievalParams.contextExpansion {applied, fields}` opcional (elegida)** | **0 ERR, 0 WARN** (info: `response-optional-property-added`) | **0 ERR, 0 WARN** | **0 ERR, 0 WARN** | **sin cambios** |

Fragmento YAML en `RagMeta.retrievalParams` (`apps/rag-orchestrator/openapi.yaml`), fuera de `required`:

```yaml
contextExpansion:
  type: object
  additionalProperties: false
  required: [applied, fields]
  description: >-
    Segundo loop contextual sin LLM (US-271, ADR-52, RN-02 enmendada). Opcional: ausente equivale a que no corrió.
    `fields` nombra los campos del caso usados (nunca valores). No sustituye a `queryRewrite`, que describe solo la
    reescritura con LLM.
  properties:
    applied:
      type: boolean
      const: true
    fields:
      type: array
      minItems: 1
      uniqueItems: true
      items:
        type: string
        enum: [tipo, estadio, biomarcador_principal]
```

- **Semántica:** se emite solo cuando corrió el loop contextual (`applied = true`, `fields` no vacío); en cualquier otro
  caso la propiedad **no aparece**, de modo que las respuestas sin loop contextual son idénticas byte a byte a las de
  antes (AC-4). `queryRewrite` conserva su `if/then/else` y su descripción: con el loop contextual vale
  `{applied: false, reason: "no_disparado"}`; la descripción de `no_disparado` añade «o el segundo loop fue el contextual sin
  LLM (ver `contextExpansion`)» (sin cambio de valores). Simulado de nuevo con esas dos restricciones y la descripción: 0 ERR y 0 WARN.
- **Versión:** el spec cambia, así que **sube la versión menor** de rag (ADR-26, `[S2 resp. 12]`). Orden esperado del
  glosario S6 §1: `l1d-323` (1.14.0) → `l1d-330` (1.15.0) → este change (1.16.0); la tarea 1.1 dice «la siguiente menor
  libre respecto de `main`» y la comprueba tras `git fetch` antes del commit `contract(L1D-329)`; si el orden cambia,
  el segundo en mergear se renumera. `clinical-api` **no cambia de contrato**; cambia solo código (`analysis-basis.ts`).
- **Ejemplos** (uno por caso, glosario §3): `contracts/examples/rag-query-contextual.json` (`con_evidencia`, con
  `contextExpansion`) y `rag-query-contextual-sin-evidencia.json` (`topRelevanceScore: null`), con sus peticiones en
  `index.json`; para el chat, `chat-turn-evidencia-contextual.json` (turno con el loop contextual y su aviso en
  `notices[]`) y `chat-turn-evidencia-sin-opciones.json` (turno «recuperado sin opciones soportadas» con los dos avisos),
  con sus peticiones `chat-turn-request-evidencia-contextual.json` y `chat-turn-request-evidencia-sin-opciones.json`.
- **Referencias a la versión del catálogo:** al subir el manifest a 1.7.0 se hace el barrido `git grep -n '1\.6\.0'` sobre
  `apps`, `packages`, `scripts`, `data` y `contracts` y se actualiza **en el mismo commit `contract(L1D-329)`** todo lo que
  fije la versión. Como mínimo: los ejemplos `chat-turn-evidencia.json`, `chat-turn-request-faltantes*.json`,
  `completeness-gap-type-p-chat.json` y el texto de `chat-turn-faltantes-ninguno.json`; en `clinical-api`: seed-catalogo-real,
  tipo-de-vacio, faltantes-tipo-de-vacio (incluido el test del `409`), atributos, etapa-de-servicios, atc-minimo y
  loinc-minimo; en `rag-orchestrator`: `test_catalogo_clinico.py`, `test_chat_faltantes.py`, test_catalogo_real_poblacion_reglas,
  test_chat_turn_faltantes y test_rag_query_voz_propia (`languagePolicyVersion`); en `scripts/catalog/__tests__`: atributos,
  escalas, fuentes-documentales y poblacion-reglas. `terminos-prohibidos.json` no sube, así que `packages/clinical-language`
  (`casos.json` `listaVersion`, `load-prohibited-terms.test.ts`, `parse-prohibited-terms.test.ts`) no cambia.
- Pydantic y TS se generan del spec; nunca a mano; en un rebase sobre `l1d-330` o `l1d-323` se regenera `packages/api-contracts/`
  (nunca se resuelve un generado a mano).
- **Catálogo:** versión 1.7.0 del `manifest.json` y de las referencias; no es contrato OpenAPI, pero un desfase entre
  backends da `409`.

## Privacidad y ownership

- `clinical-api → rag-orchestrator` ya envía `clinicalContext` desidentificado y la pregunta enmascarada; este change no
  añade campos ni cruces nuevos. `rag-orchestrator` solo lee el catálogo montado de solo lectura, el schema `corpus` y
  Milvus; no toca datos clínicos ni `clinical-minio`; no persiste nada.
- **Los términos añadidos a la consulta son etiquetas del catálogo**, nunca texto libre del expediente, ni
  `pseudoPatientId`, ni identidad, ni fechas (RN-10, RN-11, RN-27); el valor del biomarcador solo entra si pertenece al
  conjunto del catálogo. Un test captura la consulta que recibe el *reranker* y los *logs* y comprueba que no hay nada
  fuera del catálogo y la pregunta (AC-6). `contextExpansion.fields` y el aviso nombran campos, nunca valores.
- Logs: `contextExpansion.fields`, número de términos, `traceId`; nunca los términos con valor, la pregunta ni el texto.
- Solo modelos locales; el loop contextual no invoca ningún LLM (RN-12 trivialmente).
- `/rag/query` y `/platform/evidence-analyses` conservan su comportamiento actual salvo el gate G1, el loop contextual y el
  campo opcional `contextExpansion`.

## Evaluación

Cambia umbral (uso de la consulta enriquecida) y catálogo: suite `evaluate` obligatoria (OL-06) con `ai-eval-runner` real
sobre `apps/rag-orchestrator/eval/configs/s5.yaml` y las 60 preguntas de la medición: 18/22 genéricas con evidencia,
0/24 falsos positivos (melanoma, tiroides, cruzadas mama/próstata, glioblastoma, CRISPR, diabetes, CAR-T, vejiga), controles
con tema propio idénticos, recall@10 y MRR sin regresión (referencia: 1,0 y 0,858) y p95 de recuperación (referencia 2,37
s). El reporte va a `reports/eval/` (carpeta protegida: lo escribe el humano o el `ai-eval-runner`, tarea H-3). El indicador
solo pasa a `true` en `.env.example` y Compose tras ese PASS (tarea humana H-2).

## Risks / Trade-offs

- [El léxico sobreajusta a las preguntas de la medición] → 69 preguntas de `s5` como control y revisión en `evaluate`.
- [+0,9 s de recuperación; p95 de turno 14,8 s frente al límite de 15 s] → el indicador es revertible; la latencia se
  publica en el reporte.
- [El corpus no está balanceado entre tipos] → la medición no garantiza el mismo recall en otros tipos; se informa.
- [Choque de versión de contrato con `l1d-330` y `l1d-323`] → regla del glosario (se renumera el segundo en mergear).
- [`contextExpansion` y `queryRewrite` pueden leerse como redundantes] → `queryRewrite` describe solo la reescritura con
  LLM; `contextExpansion` solo el loop sin LLM; la descripción de cada uno lo dice.
- [El grado de próstata se declara bajo `estadio`] → evita ampliar el enum de campos; si la medición pide distinguirlo, un
  valor nuevo de `fields` es aditivo en una propiedad nueva y se simula de nuevo con oasdiff.
- [`/platform/evidence-analyses` también pasa por `/rag/query`] → el gate aplica igual; el formulario de pregunta única
  sale de la UI con `l1d-324`, pero el endpoint sigue vigente y queda cubierto por los mismos tests.
