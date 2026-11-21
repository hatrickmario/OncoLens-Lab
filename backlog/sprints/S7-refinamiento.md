# S7 · Refinamiento

> Hecho el 2026-11-21 sobre `main` en `368ff9fd` (cierre del S6, PR #410), en la rama `sprint/S7-refinement`.
> Cierre anterior: [`S6-cierre.md`](S6-cierre.md) · deuda: [`S6-deuda.md`](S6-deuda.md) · revisión clínica: [`S7-revision-clinica.md`](S7-revision-clinica.md).
> **Objetivo del S7** (usuario, 2026-11-13 y 2026-11-21): solo calidad del RAG. Reúne las mejoras del feedback de la Demo 6 (US-276…US-279) y todo lo que quedó abierto en el S6 y afecta a la calidad del RAG. Lo que quedó abierto y no la afecta pasa a Post-MVP.

## 1. Alcance: movimientos del 2026-11-21

Decisión del usuario: «todos los relacionados con la calidad del RAG se mueven al S7; los que no, a Post-MVP». Aplicada en Linear (31 issues, solo el campo *milestone*; los estados no cambian) y en el Markdown (`backlog/features/`).

**Al Sprint 7 (13 historias y 8 Features):**

| Linear | Historia | Pts | Estado | Qué falta (lo que entra al S7) |
|---|---|---|---|---|
| L1D-316 | US-259 turno del chat en LangGraph | 5 | In Review | **Hora 0** (hueco B2 del cierre): subir `langgraph` a ≥ 1.2.14 o descartar la alerta #9 de Dependabot con justificación; triagear la #8. Ver §6, punto 1 |
| L1D-329 | US-271 segundo loop contextual | 4 | In Review | AC-9: test y reporte versionado en `reports/eval/` (D6-33) |
| L1D-333 | US-275 expansión por defecto y 20 pares | 2 | In Review | Reporte H-3 en `reports/eval/` (D6-60) |
| L1D-331 | US-273 composición de términos en próstata | 2 | In Progress | AC-2: ≥ 18/22 genéricas con evidencia (hoy 9/22 y 13/22, D6-57); AC-3: test |
| L1D-326 | US-269 E2E y `evaluate` del chat | 3 | In Progress | Solo `evaluate:chat` y su medición con modelos reales (AC-3, AC-7; D6-50, D6-52, D6-59) `[S7 resp. 3]` |
| L1D-119 | US-120 corpus ampliado y calibración | 5 | In Review | Ingesta real, barridos y baseline (tareas 8.1–8.7 y 7.1); decisiones H-3 y H-4 de licencias |
| L1D-116 | US-117a ingesta reanudable | 5 | In Review | Adapter real `bge_m3_sparse.py` (tarea 1.10) |
| L1D-113 | US-116 faltantes como «desconocido» | 3 | In Review | Medición real (4.3) y menores del Gate 2 (D5-25) |
| L1D-126 | US-121 criterios de aplicabilidad en el catálogo | 3 | In Review | Deudas G1.6 y G2.3–G2.6, y los cambios C-1, C-2, C-4 y C-5 de la revisión clínica |
| L1D-246 | US-140 suite de hasta 3 opciones | 5 | In Review | Medición real (3.2, 3.3), reporte versionado (H-1) y los cambios del §3 de la revisión clínica |
| L1D-299 | US-233b conjunto dorado de población | 3 | In Review | Cablear `proveedor: local` (D5-26), correr la suite (2.1) y ampliar el dorado (D-1…D-5) |
| L1D-234 | US-017 · DEC-07 metas definitivas | 1 | Backlog | Decidir las metas con el reporte de la corrida final |
| L1D-125 | US-021 · DEC-11 aplicabilidad | 1 | Backlog | Sin cambios en la regla; **sigue sin firma de oncólogo** y no pasa a Done en el S7 |

Features que acompañan a sus historias: L1D-312 (FEAT-12), L1D-16, L1D-17, L1D-18, L1D-20, L1D-25, L1D-46 y L1D-47.

**A Post-MVP (4 historias y 6 Features):**

| Linear | Historia | Motivo |
|---|---|---|
| L1D-213 | US-148 opt-out de `analisis_ia` | Falta la UI del AC-8 (hueco B1); no es calidad del RAG |
| L1D-205 | US-013 · ADR-40 detección de PII | Falta la revisión del reporte de PII; privacidad, no RAG |
| L1D-285 | US-213b higiene de tests en la CI | Plataforma |
| L1D-92 | DEC-01 catálogo de datos críticos | Decisión clínica de faltantes |

Features: L1D-40, L1D-30, L1D-14, L1D-9, L1D-10 y L1D-11.

De US-269 pasan a Post-MVP el E2E de próstata (D6-49) y las métricas de faltantes del AC-4 (D6-51).

## 2. Historias nuevas y Definition of Ready

| L1D | US | Pts | DoR | Nota |
|---|---|---|---|---|
| L1D-334 | US-276 diagnóstico por etapa | 2 | ✓ | Va primera: produce los pares de paráfrasis que usan las otras tres |
| L1D-335 | US-277 sinónimos de procedimientos | 3 | ✓ con excepción | `⛔ Validación del oncólogo` resuelta con el escenario aceptado de `[S7 resp. 1]`: lista del §2.2 de la revisión clínica, marcada `revision_provisional`. Ver §6, punto 2 (re-estimación) |
| L1D-336 | US-278 *reranker* sobre el chunk entero | 5 | ✓ | 6 AC, sin dependencias duras |
| L1D-337 | US-279 contexto del documento en cada chunk | 5 | ✓ | 6 AC; obliga a reindexar una vez por brazo |

Las cuatro tienen AC en Given/When/Then, estimación, ≤ 5 pts y ≤ 8 AC. Ninguna toca la UI. Ninguna lleva `needs-refinement`.

Las de arrastre ya pasaron la DoR en su sprint; lo que cambia es su alcance restante (§1).

**Tamaño del sprint:** 15 pts nuevos y 42 pts nominales de arrastre. El trabajo restante del arrastre se estima en ≈ 22 pts (propuesta; lo fija `/sprint-start`), así que el S7 ronda los 37 pts de trabajo real.

## 3. Respuestas del usuario (2026-11-21)

- **`[S7 resp. 1]` Revisión clínica.** No se espera al oncólogo. El asistente actúa como oncólogo experto, hace una revisión profunda y adversarial y propone soluciones; es la base del MVP y se refina después con expertos. Resultado: [`S7-revision-clinica.md`](S7-revision-clinica.md). Nada pasa a «validada»: se marca `revision_provisional: {rol: ia, fecha}` y los reportes siguen en `no_validada`.
- **`[S7 resp. 2]` Corridas reales: dos.** Una **corrida base** al inicio (ingesta del corpus ampliado, línea base y diagnóstico de US-276) y una **corrida final** con las mejoras. La base cierra el arrastre que esperaba la corrida nocturna N.
- **`[S7 resp. 3]` US-269.** Solo entra el chat con modelos reales (`evaluate:chat` y su medición). El E2E de próstata y las métricas de faltantes quedan en Post-MVP.
- **`[S7 resp. 4]` Sin recorte.** Si no cabe en 1 o 2 días, el sprint se alarga. No hay orden de recorte para el S7; se mantiene la meta de cierre del 80 %.

## 4. Decisiones del sprint

No hay ADR ni DEC nuevos que decidir antes de empezar. Las que el sprint produce se toman **sobre el reporte de la corrida final**, no antes:

| Decisión | Historia | Insumo |
|---|---|---|
| Valor por defecto de `QUERY_REWRITE_ENABLED` (D4-30) | US-277 | AC-2 y AC-5 |
| `RERANKER_MAX_PAIRS` 20 o 30 (D6-61) | US-277 AC-6 | Brazo de 30 pares |
| `RERANKER_CHUNK_WINDOWS` (`primera` o `maximo`) y enmienda de ADR-39 | US-278 | AC-4 y AC-5 |
| `CORPUS_CHUNK_CONTEXT` (`ninguno`, `determinista`, `llm`) y enmienda de ADR-39 | US-279 | AC-5 |
| Umbrales calibrados (`NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K`, `RELEVANCE_THRESHOLD`) | US-120 | Barridos de la corrida base |
| Criterio de cobertura de próstata (D6-57) | US-273 | Corrida final |
| Metas definitivas de OL-06 (DEC-07) | US-017 | Corrida final |

Regla del sprint (mejora 3 del cierre del S6, aprobada): **ninguna cifra sin reporte versionado** en `reports/eval/` producido por `run-ai-eval`. Un script del scratchpad no cuenta.

Sin historia en el S7, por decisión de alcance: la calibración del NLI (fidelidad 0,822 frente a 0,90, D6-46 y D6-58). US-276 AC-3 da el histograma de `p_entailment`; cambiar el umbral exige etiquetas humanas. También quedan fuera la búsqueda híbrida ponderada (D6-43) y las prioridades 5–8 del análisis de mejoras.

## 5. Orden propuesto (lo fija `/sprint-start`)

1. **Hora 0:** L1D-316 (dependencia).
2. **Preparar la medición:** US-276 (pares de paráfrasis), `proveedor: local` de la suite de población (L1D-299), `evaluate:chat` (L1D-326), adapter *sparse* real (L1D-116) y el test del AC-9 de L1D-329.
3. **Corrida base:** ingesta del corpus ampliado, barridos, línea base, diagnóstico por etapa y reportes de L1D-113, 119, 246, 299, 329 y 333.
4. **Mejoras:** US-277 y US-278 en paralelo con los cambios de catálogo de L1D-126 y los datasets de L1D-246 y L1D-299; después US-279 y L1D-331.
5. **Corrida final:** A/B contra la base del mismo sprint, con los brazos de US-277, US-278 y US-279.
6. **Decisiones del §4** y DEC-07.

## 6. Pendiente de confirmar por el usuario

1. **L1D-316 se queda en el S7** aunque no es calidad del RAG: el cierre del S6 lo fijó como tarea de hora 0 (hueco B2) y lleva el S6 al 80,7 %. Si prefieres aplicar la regla al pie de la letra, pasa a Post-MVP.
2. **US-277 pasa de 3 a 5 pts** (propuesta): la revisión clínica añade el campo `relacion` al esquema de `sinonimos.json` y su validador (S-1), además del vocabulario.
3. **L1D-125 (DEC-11) va al S7** con L1D-126, pero no puede cerrarse sin la firma de un oncólogo.
4. **Decisiones de licencia H-3 y H-4 de L1D-119** (etiqueta de los registros de ClinicalTrials.gov y menciones de terceros en texto CC BY): se necesitan antes de la ingesta de la corrida base.
5. **Cerrar el milestone «Sprint 6» en Linear** (lo hace el humano): quedó sin issues abiertos.

## 7. Stack técnico

Nada nuevo que instalar. Antes de la corrida base se comprueba en la máquina de referencia:
- Ollama con los modelos de ADR-39 y un solo `ollama serve` con `OLLAMA_CONTEXT_LENGTH=8192`, sin swap;
- espacio en disco para reconstruir el índice de Milvus una vez por brazo de US-279 (3 índices);
- el stack de la demo anterior apagado y limpio.

Las dependencias del repo (la subida de `langgraph`) van dentro de su change.

## 8. UI/UX

No aplica: ninguna historia del S7 crea ni cambia pantallas.
