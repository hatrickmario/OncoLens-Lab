# ADR-52 — Las preguntas sin tema propio recuperan con un segundo loop contextual determinista, sin LLM

> Linear: [L1D-329](https://linear.app/l1der-lab-mjbc/issue/L1D-329) · Historia: US-271 · Feature: FEAT-12
> Plantilla: MADR 4 (variante mínima, en español).

- **Estado:** aceptado
- **Fecha:** 2026-11-06
- **Decisores:** usuario (PO), alta dentro del Sprint 6 `[S6 resp. 23]`
- **Consultados / informados:** sesión principal; medición sobre 60 preguntas con el corpus `s5-corpus-ampliado` (53 documentos)
- **Requisitos:** RN-02, RN-04, RN-10, RN-11, RN-22, RN-27, RN-29; ADR-26, ADR-51; PRD E-14, US-238

## Contexto y problema

En el chat, una pregunta general («¿qué evidencia hay para este caso?») devuelve `sin_evidencia`: el *reranker* puntúa solo la pregunta y esta no nombra ningún tema, así que ningún fragmento supera el umbral (0,30). Con 22 preguntas genéricas, hoy solo 1 de 22 recupera evidencia. El segundo loop vigente (US-238, `QUERY_REWRITE_ENABLED`, LLM local) está desactivado y, medido, no cambia ese resultado (1/22).

## Factores de decisión

- RN-02: «sin evidencia» sin invocar al LLM de generación; cero falsos positivos sobre preguntas fuera del corpus.
- RN-27 y RN-10/RN-11: términos solo del catálogo; nada de identidad ni texto libre.
- Auditable, revertible y con la latencia de turno (p95 14,8 s) al límite de 15 s.
- Plazo: un sprint de 3 días.

## Opciones consideradas

| Opción | Genéricas con evidencia | Falsos positivos | Coste |
|---|---|---|---|
| **A.** Seguir igual y ofrecer preguntas guiadas en el panel | 1/22 | 0/24 | cero en backend; depende de que el usuario use los atajos |
| **B.** Gate determinista G1 («pregunta sin tema propio», léxico versionado) + un segundo loop contextual **sin LLM** con términos del caso del catálogo | **18/22** (recall@10 1,0, MRR 0,858) | **0/24** | +0,9 s de recuperación (p95 2,37 s frente a 1,50 s); auditable; revertible con `QUERY_CONTEXT_EXPANSION_ENABLED=false` |
| **C.** Gate con LLM local + loop contextual | 19/22 | 3 del gate | no determinista; un prompt más que evaluar |

Enriquecer **siempre** la consulta (sin gate) dio 7/24 falsos positivos.

## Decisión

Opción elegida: **B** (usuario, 2026-11-06).

1. **Gate G1** (`pregunta_sin_tema_propio`, regla pura): verdadero si, tras quitar palabras vacías y de marco, no queda ninguna palabra de contenido. Léxico es/en en `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json` (versión de catálogo nueva y validador).
2. **Segundo loop contextual:** con el primer loop vacío y G1 verdadero, una única nueva recuperación añade términos del catálogo (`terminos_del_caso`: etiqueta CIE-10 del tipo, estadio TNM, biomarcador principal; en próstata, el grado), sin LLM. Si tampoco supera el umbral: `sin_evidencia`, `topRelevanceScore = null`, sin LLM de generación.
3. **Como máximo un segundo loop:** si G1 no aplica, queda la reescritura de US-238 cuando está habilitada; nunca ambos.
4. **Configuración (RN-22):** `QUERY_CONTEXT_EXPANSION_ENABLED=false` por defecto (`true` en `.env.example` y Compose solo tras PASS de `evaluate`), `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,estadio,biomarcador_principal`, `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`. El motivo se anota como `meta.retrievalParams.queryRewrite.reason = "contextual"` (aditivo, ADR-26).
5. **Complemento:** las preguntas guiadas del panel (US-267) no sustituyen al gate.

### Consecuencias

- **Positivas:** las preguntas genéricas recuperan evidencia con el caso; decisión determinista y auditable; se revierte con un indicador.
- **Negativas:** +0,9 s en recuperación; un léxico más que mantener y evaluar.
- **Enmiendas:** RN-02 / PRD E-14 (un único segundo loop, ahora con dos variantes) y el principio de US-238 «la pregunta original manda en el *reranker*», que **solo** se relaja para preguntas sin tema propio, donde esa pregunta no aporta tema.

## Descartados

- **HyDE** (+4–8 s por turno).
- **Reranking en dos etapas** y **puntaje combinado** (cambian la semántica de `relevance_score`, RN-03).
- **Activar `QUERY_REWRITE_ENABLED`** tal cual: 1/22.

## Riesgos

- El léxico se escribió con las preguntas de la medición a la vista; se mitiga con las 69 preguntas de `s5` (0 falsas genéricas) y con `evaluate`.
- El p95 de turno (14,8 s) queda al límite de 15 s.
- El corpus no está balanceado entre tipos de cáncer; la medición no garantiza el mismo recall en otros.

### Confirmación

Pytest con adapters falsos (gate, prioridad, un solo loop, 0 llamadas al LLM, términos solo del catálogo), unitarios del léxico con las 60 y las 69 preguntas, y `evaluate` real (`ai-eval-runner`) antes de activar el indicador. Historia: US-271 (L1D-329).
