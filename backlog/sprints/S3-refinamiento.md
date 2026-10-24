# S3 · Refinamiento: DoR, decisiones, stack y diseño

> `/sprint-refine S3` · 2026-10-23/24 · sesión principal. Fuente del alcance: reordenamiento del 2026-10-23 (`backlog/features/README.md`, nota homónima; PRD §14 E-13). Respuestas del usuario: §4 (`[S3 resp. n]`), registradas también en cada historia.
> Lo siguiente es `/sprint-start S3`, que exige este archivo en `main`.

## 1. Alcance cruzado (Linear ↔ Markdown)

Milestone **Sprint 3** de `OncoLens-1` = historias con `Sprint 3` en `backlog/features/FEAT-*.md`. Tras el refinamiento: **74 pts de historias + 8 de arrastre (ARR-09) = 82 pts**, dentro de DEC-03 (80–90).

| Cambio | Markdown | Linear |
|---|---|---|
| US-098 → S4 (`[S3 resp. 3]`) | FEAT-03a, README | L1D-84 → milestone Sprint 4 ✓ |
| US-117 partida en US-117a (5) y US-117b (3), ambas S3 (`[S3 resp. 2]`) | FEAT-06c, FEAT-06b, README | L1D-116 renombrado a US-117a, 5 pts, con comentario ✓ · US-117b **sin issue** (workspace en el límite) |
| ARR-09 nueva, 8 pts (`[S3 resp. 7]`) | `S2-arrastre.md` | **sin issue** (límite) |
| US-062 3 → 4 pts (AC-7, `[S3 resp. 9]`) | FEAT-10a, README | pendiente: estimación de L1D-141 la ajusta `/sprint-start` |

La descripción de L1D-116 en Linear todavía es la de US-117 entera; el Markdown es la fuente y `/sprint-start` la sincroniza.

## 2. Definition of Ready

| L1D | Historia | Pts | DoR | Cómo se cumplió |
|---|---|---|---|---|
| L1D-125 | US-021 · DEC-11 | 1 | ✓ escenario aceptado | `propuesta_revisada` (FR-25; HER2 y castración excluyentes); cierre en la sesión de oncólogos del S4 `[S3 resp. 1]` |
| L1D-126 | US-121 | 3 | ✓ | — |
| L1D-127 | US-122 | 5 | ✓ | — |
| L1D-128 | US-123 | 5 | ✓ | NLI fijado en ADR-39 fase A |
| L1D-129 | US-124 | 5 | ✓ | AC-3 con conflicto sembrado; original → US-099 AC-7 (S5) `[S3 resp. 8]` |
| L1D-130 | US-125 | 5 | ✓ | — |
| L1D-92 | DEC-01 | 1 | ✓ escenario aceptado | Q1 verificado+corregido, Q4 faltante; cierre en el S4 `[S3 resp. 1]` |
| L1D-93 | US-001 | 5 | ✓ | AC-6 servicio no listo; AC-7 HER2 por `Exam.exam_type` `[S3 resp. 5]` |
| L1D-94 | US-002 | 5 | ✓ | `whenConditionUnknown = faltante`; cuenta el más reciente; `no_mapeado` crítico → US-131; ausencia confirmada al S4 `[S3 resp. 5]` |
| L1D-98 | US-006 | 3 | ✓ | AC-8: error `[S3 resp. 5]` |
| L1D-116 | US-117a | 5 | ✓ | Partida `[S3 resp. 2]`; PDFs reales necesitan US-082 (S5): en el S3 fixture de texto |
| — | US-117b | 3 | ✓ (sin Linear) | Partida `[S3 resp. 2]` |
| L1D-117 | US-118 | 5 | ✓ con supuesto | AC con adaptadores falsos; medición con LLM real en US-233 (S4); revisor de la muestra del AC-5: el usuario, con plantilla `[S3 resp. 13]` |
| L1D-181 | US-065 | 3 | ✓ | AC-4 con conflicto sembrado; original → US-099 AC-8 (S5) `[S3 resp. 8]` |
| L1D-182 | US-127 | 3 | ✓ | UI en `pantallas-s1.md` y `sistema-de-diseno.md` |
| L1D-287 | US-236 | 3 | ✓ | Confirmada en el S3; AC-7 sobre el dataset actual `[S3 resp. 8]` |
| L1D-141 | US-062 | 4 | ✓ | AC-2 texto canónico `[S3 resp. 6]`; AC-7 criterio visible `[S3 resp. 9]`; diseño `docs/ux/S3/` |
| L1D-288 | US-237 | 2 | ✓ | Confirmada; diseño `docs/ux/S3/` S3-03 `[S3 resp. 8]` |
| L1D-244 | US-132 | 5 | ✓ | AC-3 con versión del corpus por configuración; original → US-119 AC-5 (`si-hay-capacidad`) `[S3 resp. 8]` |
| L1D-285 | US-213b | 3 | ✓ | Incluye Q-1 (`pattern` de `fullNameMasked`) y AC-13 (descarga de imágenes en la CI) `[S3 resp. 14]` |
| — | ARR-09 | 8 | ✓ (sin Linear) | Lote de *visual-check* y E2E heredados, aviso de hidratación y conciliación `[S3 resp. 7]` |

Ninguna historia supera 5 pts ni 8 AC.

## 3. Decisiones y ADRs del sprint

- **DEC-01 y DEC-11** (clínicas, baratas de revertir porque viven en el catálogo JSON versionado): se implementan sobre `propuesta_revisada` y se validan en la sesión con oncólogos del S4, junto a DEC-06/08/09 y ARR-05. Marcadas en `backlog/02-adrs.md`.
- **ADR-39:** fase A aceptada (BGE-M3 *dense* + *sparse*, *reranker*, NLI mDeBERTa). Ninguna historia del S3 necesita el LLM real para sus AC; las mediciones van a US-233 (S4). Pendiente menor: el índice `docs/architecture/adr/README.md` aún dice «fase B pendiente», aunque L1D-274 está archivado. Lo concilia `/sprint-close S3`.
- **ADR-40:** su medición sale del S3 y pasa al S5 como prerrequisito de US-083, su único consumidor `[S3 resp. 7]`.
- Ningún ADR nuevo: el S3 no cambia el stack.

## 4. Respuestas del usuario

| # | Pregunta | Decisión |
|---|---|---|
| 1 | DEC-01 y DEC-11 sin oncólogo en el S3 | Construir sobre `propuesta_revisada`; validar en el S4 |
| 2 | US-117 de 8 pts | Partir en US-117a (5) y US-117b (3), ambas en el S3 |
| 3 | US-098 con AC rotos | Al S4 |
| 4 | Alcance de Superpowers | Uso selectivo: `systematic-debugging`, `verification-before-completion` y `receiving-code-review`; el flujo del proyecto manda (`CLAUDE.md`, agentes `*-dev` y `sprint-orchestrator`) |
| 5 | Pendientes técnicos de FEAT-04 | Paquete aceptado (ver la DoR) |
| 6 | Texto de «sin evidencia» | El de `docs/ux/S1` |
| 7 | Arrastre | ARR-09 en el S3 (8 pts); ADR-40 al S5; usuario de servicio de MinIO → AC nuevo de US-078 (S5) |
| 8 | AC rotos por el reordenamiento | Reescritos, con los originales trasladados |
| 9 | Criterio de elección en la UI con US-125 | Rótulo nuevo + línea de conteos de `applicabilitySummary` + aviso de población no comparable (US-062 AC-7, +1 pt) |
| 10 | Linear | Editar los issues existentes; US-117b y ARR-09 solo en el Markdown |
| 11 | Stacks Docker huérfanos | Borrados (`ol173`, `ol198`, `ol202` y `oncolens-ci-rag-ai`, con sus volúmenes); `adr39-*` se conserva |
| 12 | Estado de L1D-202, L1D-72 y L1D-187 | Feedback positivo de los oncólogos y del equipo técnico; quedan **In Review** (ya lo estaban en Linear) y se revisan de nuevo en la **Demo 3**, al cerrar el S3. Sus E2E y *visual-check* pendientes van en ARR-09 |
| 13 | Revisor de la muestra de US-118 AC-5 (consumida por US-132 AC-4) | El usuario, con una plantilla preparada por el agente (tarea `[HUMANO]`) |
| 14 | Fallo de `integration-rag` en el PR #189 (`quay.io` respondió `503` en etcd) | Nueva tarea en US-213b (AC-13): etcd desde `gcr.io`, `compose pull` con hasta 3 intentos y un mensaje de fallo de descarga distinto del de salud; sin cambio de puntos |
| 15 | Orden del prompt entre l1d-287 y l1d-181 (Gate 1 de `/sprint-start`) | 287 primero (`rag-query@0.3.0`), luego 181 (`0.4.0`) |
| 16 | Paquete técnico de los guardianes (Gate 1) | Aceptado entero: `studyKey`, destinos solo clínicos, exención AC-17 solo «P. S. n.», `validation` única, precedencia `falta_en_paciente`, `metadata_source = pendiente`, versión del prompt de aplicabilidad en log y `AIAnalysisRecord`, `ANALYSIS_MAX_OPTIONS`, avisos de datos del paciente al S4 |
| 17 | AiDisclaimer en «tipo no habilitado» | Se muestra (spec de l1d-194); S3-01 corregido |
| 18 | Texto de la Base sobre faltantes | Se adelanta **US-128 (L1D-188)** al S3: +3 pts, S3 = 85, S4 = 118 |
| 19 | ClinicalTrials.gov en US-117a frente a ADR-36 | Se admite: **ADR-36 Enmienda 1** (dominio público; un registro de ensayo no es evidencia de eficacia; atribución NLM por verificar antes de US-120) |
| 20 | Aprobación del plan del S3 | Oleadas aprobadas: 4 en paralelo en O1 y 3 después; merges por oleada; L1D-233 y L1D-234 → Sprint 4 en Linear |

## 5. Stack técnico (fase 2)

| Elemento | Estado |
|---|---|
| Docker 29.8 · Node 26.7 · Python 3.13 · OpenSpec 1.14.1 | ✓ |
| Ollama 0.40.6 con los candidatos de ADR-39 (`gemma4:26b-a4b`, `qwen3.6:27b`, `bge-m3`, `qwen3-embedding:8b`, `medgemma1.5:4b`) | ✓ (solo para la demo y US-233; el S3 corre con `LLM_PROVIDER=fake`) |
| Plugin Superpowers (scope usuario) | ✓ instalado, uso selectivo |
| Stacks y redes huérfanos del S2 (causa del «Pool overlaps» de los *visual-check*) | ✓ limpiados el 2026-10-24 |
| Dependencias nuevas del repo | Ninguna prevista; si aparece una, va como tarea de su change |

## 6. Diseño (fase 3)

- **`docs/ux/S3/pantallas-s3.md`**, un solo diseño: el S3 extiende el panel del S1 sin riesgo de UX nuevo. Contiene S3-01 (estados de US-062), S3-02 (criterio de elección y conteos, US-062 AC-7 + US-125), S3-03 (resumen por motivo de US-237) y el aviso de hidratación de ARR-09. Las pantallas de 3 variantes (tabla de aplicabilidad y hasta 3 opciones, vista de caso, faltantes) pasan al refinamiento del S4.
- **Contrato:** todos los datos que muestra el diseño ya existen (`ApplicabilitySummary`, `populationNotComparable`, `discardReason`, `topRelevanceScore`, Base del análisis). Sin cambio de `openapi.yaml`.
- **Revisión `clinical-language-auditor` (modo Diseño, 2026-10-24):** FAIL con 0 bloqueantes, 3 mayores y 3 menores. **Todos aplicados** en `pantallas-s3.md` y en US-062: el criterio ya no dice «elegida» y conserva el descargo «criterio de orden, no una valoración clínica»; el aviso de población lleva «según los datos registrados»; `evidence.relevance.basis` se alinea con el orden por aplicabilidad (tarea de US-062); la línea de conteos lleva prefijo; «sin evidencia» aclara su alcance; AC-5 muestra el código de traza (`[S1 resp. 31]`). `AiDisclaimer` explícito por estado.
- **Accesibilidad:** reglas añadidas en el diseño (texto además del color, `role=status`/`alert`, foco en «Reintentar»); la verificación WCAG la hace `visual-check` en la implementación.

## 7. Notas para `/sprint-start S3`

- Hay 8 changes archivables ya (l1d-115, 180, 193, 238, 275, 277, 278 y us-231a), después de re-anotar sus destinos L1D-280 → US-233. Hacerlo antes de crear los changes del S3.
- El índice de historias de `backlog/features/README.md` (columnas Sprint/Est.) tiene valores anteriores al reordenamiento en las filas de FEAT-04 y FEAT-08b. La tabla de puntos por sprint es la correcta. Se regenera en `/sprint-close`.
- Métrica de Superpowers en el S3: vueltas de Gate 2 por historia, reanudaciones del orquestador y tareas `[x]` reabiertas en el cierre.
