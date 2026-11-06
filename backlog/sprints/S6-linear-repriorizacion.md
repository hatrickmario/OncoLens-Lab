# S6 · Repriorización de Linear: solo RAG y chatbot MVP

> **Origen:** decisión del usuario del 2026-11-06 tras la Demo 5 (ver [`S5-cierre.md`](S5-cierre.md) §9 y [`S6-prompt-chatbot.md`](S6-prompt-chatbot.md)). El S6 es el último sprint del MVP y se enfoca solo en (1) RAG (mejoras de recall previo al reranker y más textos científicos) y (2) el chatbot MVP. Lo demás pasa a Post-MVP.
> **Estado:** propuesta preparada por lectura de Linear (2026-11-06). Los **82 issues de la categoría POST-MVP** se mueven al hito `Post-MVP` (creado por el usuario en OncoLens-1) **sin cambiar su estado**; el archivado real lo hace el usuario desde la interfaz de Linear, porque el MCP no expone archivar ni borrar. Los **14 `REVISAR`** y los **25 `KEEP-*`** no se tocan hasta que el usuario decida. Los IDs (L1D, US, ADR, DEC) son inmutables.
> **Cómo revertir un movimiento:** la columna «Hito actual» de cada fila es el hito de origen; devolver el issue a ese hito (o dejarlo sin hito cuando figura `-`) restablece el estado previo.
> **Calidad de la clasificación:** se hizo por título de Linear y por los documentos del sprint; no se abrió cada `FEAT-*.md` ni los AC de cada historia. Las asignaciones `REVISAR` son sugerencias.

---

> 2026-11-06. Fuentes: Linear (list_issues, list_milestones, list_issue_labels, list_issue_statuses; solo lectura), `CLAUDE.md`, `backlog/sprints/S5-cierre.md` (§1, §2, §9), `S5-deuda.md` (D5-08, D5-09, D5-53…57), `S6-prompt-chatbot.md`. Decisión del usuario del 2026-11-06: S6 = RAG (R1–R4, más corpus) + chatbot MVP (A, B, C; 1 ADR + 1 spike assistant-ui); lo demás, Post-MVP. Los IDs L1D/US/ADR/DEC no se renumeran ni se borran.

## 1. Inventario

- Issues activos (no archivados) listados con paginación (limit 250, 1 página): **234**. Archivados (includeArchived): **71** más (archivados el 2026-10-18 y el 2026-10-23, además de L1D-303 el 2026-10-30); total con archivados ≈ **305** (cifra de archivados contada a mano sobre dos páginas; la verificación exacta no es posible con los campos pedidos). Los archivados no entran en la tabla.
- Por estado (234): Done 113 · Backlog 101 · In Progress 11 · In Review 9 · Todo 0 · Canceled 0 · Duplicate 0. No terminados: **121**.
- Por hito (234): Sprint 6 56 · Sprint 5 49 · sin hito 34 · Sprint 1 24 · Sprint 2 23 · Sprint 4 23 · Sprint 3 18 · Pre-S1 7. No terminados por hito: {'-': 34, 'Sprint 5': 31, 'Sprint 6': 56}.
- Hitos existentes: Pre-S1, Sprint 1…Sprint 6 (Sprint 5 al 46,94 %, Sprint 6 al 0 %). Etiquetas existentes: AC-P.1, T-1…T-5, CAP-01…CAP-11, recorrido-principal, si-hay-capacidad, estimate/?, needs-refinement, refinar-en-planning, Decisión, ADR, size/*, Improvement, Feature, Bug. **No hay hito ni etiqueta `Post-MVP`.** Estados del equipo L1D: Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate.
- Observación: muchas historias OCR/auditoría ya estaban archivadas (2026-10-23, p. ej. L1D-57…L1D-190 en parte, L1D-185 US-185) y no aparecen en la lista activa.

## 2. Resumen por categoría (121 no terminados)

| Categoría | Issues | Puntos (suma de estimaciones; los contenedores Feature no tienen) |
|---|---|---|
| KEEP-RAG | 12 | 24 |
| KEEP-CHATBOT | 13 | 18 |
| REVISAR | 14 | 39 |
| POST-MVP | 82 | 228 |
| SIN-CAMBIO (Done) | 113 | n/a |

Nota: 11 de los KEEP son contenedores (Features) sin puntos; los KEEP con puntos son, en su mayoría, trabajo ya empezado en el S5 (In Review) que se arrastra. La capacidad real del S6 la consumen los **elementos nuevos** (sección 5).

## 3. Tabla por issue

Las columnas «Hito actual» y «Pts» vienen de Linear (`-` = sin hito / sin estimación). Para los KEEP-*, «Hito actual» indica si ya estaba en el Sprint 6 o en otro.

### KEEP-RAG
| ID | Título corto | Estado | Hito actual | Pts | Categoría | Razón |
|---|---|---|---|---|---|---|
| L1D-16 | FEAT-06a — Análisis de evidencia: walking skeleton | In Progress | Sprint 5 | - | KEEP-RAG | FEAT-06a: walking skeleton del análisis; contenedor del RAG de Backend 2 (reutilizado por el chat) |
| L1D-17 | FEAT-06b — Recuperación híbrida, expansión bilingüe, filtros reales y faltantes en la consulta | Backlog | Sprint 5 | - | KEEP-RAG | FEAT-06b: contenedor de la recuperación híbrida (R3) y filtros |
| L1D-18 | FEAT-06c — Corpus científico: semilla con licencias (S1) e ingesta con metadatos (S3) | In Progress | Sprint 5 | - | KEEP-RAG | FEAT-06c: contenedor del corpus científico (US-120 y ampliación) |
| L1D-46 | FEAT-T5a — Baseline de evaluación técnica, baseline manual de VM-1/VM-2 y suite en la DoD | In Progress | Sprint 5 | - | KEEP-RAG | FEAT-T5a: suite evaluate en la DoD; contenedor de la evaluación obligatoria (OL-06) de R1–R4 |
| L1D-47 | FEAT-T5b — Ampliación de la evaluación: ingesta, caso, reconciliación, faltantes, aplicabilidad y recuper | In Progress | Sprint 5 | - | KEEP-RAG | FEAT-T5b: ampliación de evaluate; contenedor (métricas de recuperación y de A/B/C) |
| L1D-113 | US-116 — Los datos críticos faltantes viajan como "desconocido" al prompt y enriquecen la consulta | In Review | Sprint 5 | 3 | KEEP-RAG | US-116: faltantes críticos viajan al prompt y enriquecen la consulta (In Review, nocturna D5-24); mejora la recuperación y une B con C |
| L1D-116 | US-117a — La ingesta del corpus es reanudable y rechaza lo que no tiene licencia | In Review | Sprint 5 | 5 | KEEP-RAG | US-117a: ingesta reanudable que rechaza sin licencia (In Review); necesaria para reingestar con R1 y para US-120 |
| L1D-119 | US-120 — El corpus del S3 alcanza al menos 20 documentos por tipo de cáncer de al menos 3 fuentes abierta | In Review | Sprint 5 | 5 | KEEP-RAG | US-120: ≥20 docs por tipo de ≥3 fuentes (D5-08, D5-09); prioridad explícita del usuario |
| L1D-234 | US-017 · DEC-07 — Metas definitivas de evaluación técnica tras el baseline | Backlog | Sprint 6 | 1 | KEEP-RAG | US-017/DEC-07: metas definitivas tras el baseline; hace falta recalibrar recall/NFR para R2 |
| L1D-246 | US-140 — La suite mide que hasta 3 opciones siguen citadas, con soporte, no prescriptivas y en el orden d | In Review | Sprint 5 | 5 | KEEP-RAG | US-140: evaluate de las 3 opciones citadas y en orden (In Review); mide la calidad de C y la salida del RAG |
| L1D-299 | US-233b — Un conjunto dorado revisado a mano mide la extracción de la población por criterio y la concord | In Review | Sprint 5 | 3 | KEEP-RAG | US-233b: dorado de población por criterio (ADR-47) (In Review); evalúa la extracción de población que alimenta C y el corpus ampliado |
| L1D-304 | US-248 · ADR-48 — Cuando una rama de la recuperación híbrida no devuelve candidatos, la fusión conserva l | Backlog | - | 2 | KEEP-RAG | US-248/ADR-48: fusión híbrida cuando una rama no devuelve candidatos; insumo directo de R3 (evaluar RETRIEVAL_MODE=hibrida) |

### KEEP-CHATBOT
| ID | Título corto | Estado | Hito actual | Pts | Categoría | Razón |
|---|---|---|---|---|---|---|
| L1D-9 | FEAT-02a — Ficha mínima del paciente | In Progress | Sprint 5 | - | KEEP-CHATBOT | FEAT-02a: ficha mínima = contexto clínico del chat (A); su único hijo pendiente (US-019) sale |
| L1D-10 | FEAT-02b — Vista de caso: timeline, tratamientos previos, series, tendencia y contexto ampliado | Backlog | Sprint 5 | - | KEEP-CHATBOT | FEAT-02b: contenedor de la vista de caso (fuente de datos de A); sus hijos pendientes salen |
| L1D-11 | FEAT-02c — Resumen del caso verificable | Backlog | - | - | KEEP-CHATBOT | FEAT-02c: resumen del caso verificable = AC01 (situación clínica, resumen y evolución); sus historias originales están archivadas, se reescriben como historias del chat |
| L1D-14 | FEAT-04 — Información faltante: checklist determinista de datos críticos | In Progress | Sprint 5 | - | KEEP-CHATBOT | FEAT-04: faltantes = capacidad B; contenedor (checklist ya implementado) |
| L1D-20 | FEAT-08b — Aplicabilidad paciente ↔ evidencia | In Progress | Sprint 5 | - | KEEP-CHATBOT | FEAT-08b: aplicabilidad paciente-evidencia = comparación evidencia-paciente de C; contenedor |
| L1D-25 | FEAT-10c — Hasta 3 opciones descritas en la evidencia, ordenadas por aplicabilidad | In Progress | Sprint 5 | - | KEEP-CHATBOT | FEAT-10c: hasta 3 opciones por aplicabilidad = núcleo de C; contenedor |
| L1D-40 | FEAT-T4a — Acceso, identidad cifrada, registro de pacientes y desidentificación | In Progress | Sprint 5 | - | KEEP-CHATBOT | FEAT-T4a: acceso e identidad; contenedor con RN-10/RN-11 vigentes para la ruta nueva del chat |
| L1D-92 | DEC-01 — Catálogo de datos críticos de mama y próstata revisado por el oncólogo | Backlog | Sprint 5 | 1 | KEEP-CHATBOT | DEC-01: firma del oncólogo del catálogo de datos críticos; sin ella B (AC03/AC04) no tiene base clínica validada |
| L1D-125 | US-021 · DEC-11 — Criterios de aplicabilidad, excluyentes y definición de "Parcial" | Backlog | Sprint 5 | 1 | KEEP-CHATBOT | DEC-11: firma de criterios excluyentes y de «Parcial»; define las coincidencias/diferencias de C (AC05) |
| L1D-126 | US-121 — Los criterios de aplicabilidad de mama y próstata viven en el catálogo con destino, excluyentes  | In Review | Sprint 5 | 3 | KEEP-CHATBOT | US-121: criterios de aplicabilidad en el catálogo (In Review); base de «coincidencias, diferencias y desconocidos» de C |
| L1D-205 | US-013 · ADR-40 — Detección y enmascaramiento de PII en texto libre y documentos | In Review | Sprint 5 | 5 | KEEP-CHATBOT | US-013/ADR-40: PII en texto libre (In Review); el chat envía texto libre al LLM (RN-11) |
| L1D-243 | US-131 — La suite mide la sensibilidad y la especificidad del checklist de faltantes con faltantes sembra | Backlog | Sprint 6 | 3 | KEEP-CHATBOT | US-131: sensibilidad/especificidad del checklist de faltantes; mide AC03 |
| L1D-268 | US-218 — El oncólogo hace hasta 10 preguntas de seguimiento sobre un análisis y cada respuesta llega cita | In Review | Sprint 5 | 5 | KEEP-CHATBOT | US-218: hasta 10 preguntas de seguimiento citadas (In Review) = continuidad conversacional del chat |

### REVISAR (borderline; la sugerencia va entre paréntesis en la razón)
| ID | Título corto | Estado | Hito actual | Pts | Categoría | Razón |
|---|---|---|---|---|---|---|
| L1D-30 | FEAT-PL1 — Plataforma base: monorepo, Compose, secretos, CI y configuración | In Progress | Sprint 5 | - | REVISAR | FEAT-PL1: plataforma base ya casi terminada; cerrar cuando se resuelvan 266/285 (sugerencia: cerrar, no reasignar) |
| L1D-32 | FEAT-PL3 — Catálogos clínicos versionados v1 | In Progress | Sprint 5 | - | REVISAR | FEAT-PL3: catálogos v1 ya entregados; hijos pendientes salen (sugerencia: cerrar el contenedor) |
| L1D-75 | US-089 — La vista de caso agrupa los tratamientos previos por línea y muestra series de biomarcadores y a | Backlog | Sprint 6 | 5 | REVISAR | US-089: agrupa tratamientos por línea y series de biomarcadores; sirve a «evolución» (A) pero el chat puede leer el JSON de caso (sugerencia: POST-MVP) |
| L1D-78 | US-092 — La ficha muestra los datos extraídos con su origen, confianza, revisión y semáforo | Backlog | - | 3 | REVISAR | US-092: ficha con origen/confianza de extracción; sirve a «referenciar datos» (A) solo en lectura (sugerencia: POST-MVP; el chat cita por id de dato) |
| L1D-108 | US-057 — Las instrucciones del prompt quedan separadas de los datos para resistir *prompt injection* | Backlog | Sprint 6 | 3 | REVISAR | US-057: separación instrucciones/datos contra prompt injection; el chat introduce texto libre del oncólogo y de documentos (sugerencia: KEEP-CHATBOT, 3 pts) |
| L1D-118 | US-119 — Cada ingesta publica una `CorpusRelease` con su fecha de corte y la Base del análisis la usa | Backlog | Sprint 5 | 3 | REVISAR | US-119: CorpusRelease con fecha de corte para la Base del análisis; sirve a «fuentes y limitaciones» (C/AC06) (sugerencia: POST-MVP salvo que la fecha de corte se pida en la respuesta) |
| L1D-143 | US-136 — La tarjeta avisa cuando la opción depende de datos en conflicto o de datos críticos faltantes, c | Backlog | - | 5 | REVISAR | US-136: aviso de conflicto/faltantes en la opción; roza «contradicciones» y «datos desconocidos» (sugerencia: POST-MVP, el chat los verbaliza por B/C) |
| L1D-204 | US-050 — Los datos reales solo se procesan con modelos locales, sin respaldo en la nube | Backlog | Sprint 6 | 3 | REVISAR | US-050: RN-12 datos reales solo con modelos locales; la ruta LLM nueva sobre datos del paciente debe cumplirla por código (sugerencia: KEEP-CHATBOT, 3 pts) |
| L1D-213 | US-148 — Toda generación con IA sobre un paciente con opt-out de `analisis_ia` responde `403` sin llamar  | Backlog | Sprint 6 | 5 | REVISAR | US-148: 403 por opt-out en toda generación con IA; el chat es generación nueva (sugerencia: POST-MVP solo si se mantiene la guarda de entorno sintético; si no, KEEP-CHATBOT, 5 pts) |
| L1D-233 | US-016 · DEC-06 — Revisión clínica de la muestra del dataset de evaluación y del diccionario de significa | Backlog | Sprint 6 | 1 | REVISAR | US-016/DEC-06: revisión clínica de muestra del dataset de evaluación (sugerencia: POST-MVP; se solapa con la validación de AC por oncólogos) |
| L1D-241 | US-105 — La suite mide la fidelidad del caso reconstruido, el origen de cada dato, el soporte del resumen | Backlog | - | 5 | REVISAR | US-105: fidelidad del caso reconstruido y soporte del resumen; mide AC01 (sugerencia: KEEP-CHATBOT) |
| L1D-266 | US-216 — `web` envía cabeceras de seguridad, impide el clickjacking y no expone secretos ni HTML sin sani | Backlog | Sprint 6 | 3 | REVISAR | US-216: cabeceras de seguridad/CSP en web; assistant-ui añade superficie XSS (sugerencia: KEEP-CHATBOT, 3 pts, como condición de la UI nueva) |
| L1D-285 | US-213b — La CI aplica la higiene de tests: sin tests desactivados, AC con test de aceptación, mocks solo | In Review | Sprint 5 | 3 | REVISAR | US-213b: higiene de tests en CI (In Review, casi hecho) (sugerencia: terminar y cerrar, sin reasignar) |
| L1D-286 | Decidir antes del 2026-11-20 qué hacer con la excepción de braces (L1D-267) | Backlog | Sprint 5 | - | REVISAR | Decisión de braces (L1D-267) antes del 2026-11-20: tarea de proceso (sugerencia: decidir en el refinamiento, sin puntos) |

### POST-MVP
| ID | Título corto | Estado | Hito actual | Pts | Categoría | Razón |
|---|---|---|---|---|---|---|
| L1D-6 | FEAT-01a — Carga de documentos, cola de extracción y visor del documento de origen | Backlog | - | - | POST-MVP | FEAT-01a: carga de documentos/cola de extracción (OCR) fuera del MVP; la decisión del usuario lo envía a Post-MVP |
| L1D-7 | FEAT-01b — Extracción local: OCR, gate de PII, confianza determinista y propuesta de códigos | Backlog | - | - | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-8 | FEAT-01c — Registro de paciente asistido por OCR | Backlog | - | - | POST-MVP | FEAT-01c: registro asistido por OCR; depende de la extracción |
| L1D-12 | FEAT-03a — Normalización terminológica final, duplicados y no reemplazo silencioso | Backlog | Sprint 5 | - | POST-MVP | FEAT-03a / US-099/US-100: normalización y duplicados entre documentos, nacen de la ingesta OCR |
| L1D-13 | FEAT-03b — Revisión de datos, resolución de conflictos y registro manual de biomarcadores y diagnóstico | Backlog | Sprint 5 | - | POST-MVP | FEAT-03b / US-107/US-108: revisión y verificación de datos extraídos; el chat es solo lectura («no modificar la historia clínica») |
| L1D-15 | FEAT-05 — Plantillas de preguntas clínicas por tipo de cáncer y escenario | Backlog | - | - | POST-MVP | FEAT-05: plantillas de preguntas; el chat usa lenguaje natural |
| L1D-19 | FEAT-07 — Síntesis de evidencia: acuerdos y discrepancias explicadas | Backlog | - | - | POST-MVP | FEAT-07: síntesis de evidencia (acuerdos/discrepancias), «si hay capacidad» |
| L1D-22 | FEAT-09 — Vigencia visible de la evidencia | Backlog | - | - | POST-MVP | FEAT-09: vigencia visible; no es parte de A/B/C |
| L1D-24 | FEAT-10b — Avisos de datos no verificados, en conflicto y faltantes en las opciones | Backlog | Sprint 5 | - | POST-MVP | FEAT-10b: avisos en la tarjeta de opción; la UI de tarjetas se sustituye por el chat |
| L1D-26 | FEAT-11a — Historial de análisis, marcas de desactualizado, re-ejecución y comparación | Backlog | - | - | POST-MVP | FEAT-11a / US-174/US-179/US-251: historial, re-ejecución y comparación; «historial persistente» está Out of Scope |
| L1D-28 | FEAT-11c — Memoria de análisis previos: contexto rotulado, nunca evidencia | Backlog | - | - | POST-MVP | FEAT-11c / US-189…US-192/US-255: memoria de análisis previos e historial de conversaciones; Out of Scope. Ver riesgo RN-24 si el chat reutiliza análisis |
| L1D-33 | FEAT-PL5 — Hardening mínimo y observabilidad operable | Backlog | - | - | POST-MVP | FEAT-PL5: hardening y observabilidad; Post-MVP |
| L1D-35 | FEAT-T1b — Auditoría de accesos y auditoría completa (S6) | Backlog | Sprint 6 | - | POST-MVP | FEAT-T1b / US-102/US-150: auditoría de accesos completa (S6); riesgo para datos reales |
| L1D-38 | FEAT-T2c — Base del análisis: análisis previos usados y búsqueda complementaria (incisos h, i) | Backlog | - | - | POST-MVP | FEAT-T2c / US-205/US-206: Base del análisis con análisis previos y búsqueda complementaria (agente) |
| L1D-42 | FEAT-T4c — Bloqueo por opt-out de `analisis_ia` en toda generación con IA (reducida) | Backlog | Sprint 6 | - | POST-MVP | FEAT-T4c: opt-out reducido; ver riesgo M-1 |
| L1D-43 | FEAT-T4d — Gate G-Piloto: `preflight real-data`, VPN con HTTPS, backups, mayoría de edad y decisiones leg | Backlog | Sprint 6 | - | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-48 | FEAT-T5c — Feedback al cerrar cada análisis: la validación clínica del MVP | Backlog | Sprint 5 | - | POST-MVP | FEAT-T5c / US-137…US-139/DEC-14: feedback 1–5 y VM-4/VM-5 (medición de valor) |
| L1D-49 | FEAT-T5d — Medición del valor clínico en el piloto mixto (VM-1…VM-6) y evaluación de las capacidades dife | Backlog | Sprint 6 | - | POST-MVP | FEAT-T5d: medición VM-1…VM-6 y G-Éxito en piloto mixto |
| L1D-58 | US-078 — La cola de extracción procesa cada documento una sola vez, reintenta y nunca deja documentos col | Backlog | - | 5 | POST-MVP | FEAT-01a: carga de documentos/cola de extracción (OCR) fuera del MVP; la decisión del usuario lo envía a Post-MVP |
| L1D-59 | US-079 — Desde la ficha y la vista de caso subo documentos y veo el estado de cada uno | Backlog | - | 3 | POST-MVP | FEAT-01a: carga de documentos/cola de extracción (OCR) fuera del MVP; la decisión del usuario lo envía a Post-MVP |
| L1D-62 | US-212 — Descargo el PDF de origen de un dato desde la ficha o la vista de caso | Backlog | - | 2 | POST-MVP | FEAT-01a: carga de documentos/cola de extracción (OCR) fuera del MVP; la decisión del usuario lo envía a Post-MVP |
| L1D-63 | US-082 — `/documents/extract` lee el PDF en memoria, aplica OCR solo donde hace falta y estructura los da | Backlog | - | 8 | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-64 | US-083 — Un documento con datos personales inesperados queda en cuarentena sin persistir nada | Backlog | - | 5 | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-65 | US-084 — La confianza de cada dato extraído se calcula con señales deterministas, nunca con la que declar | Backlog | - | 5 | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-66 | US-085 — La extracción incluye eventos fechados, tratamientos previos y atributos clínicos con su procede | Backlog | - | 5 | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-67 | US-086 — Backend 2 propone códigos del catálogo con su confianza, o `no_mapeado`, y nunca inventa uno | Backlog | - | 3 | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-68 | US-087 — Lo extraído se persiste en una sola transacción, sin datos parciales y sin duplicar al reprocesa | Backlog | - | 5 | POST-MVP | FEAT-01b: extracción OCR, gate de PII de documentos y persistencia de lo extraído; el caso viene de pacientes sintéticos |
| L1D-73 | US-019 · DEC-09 — Reglas del semáforo de biomarcadores y de vigencia de diagnósticos | Backlog | Sprint 6 | 1 | POST-MVP | US-019/DEC-09: reglas de semáforo y vigencia de diagnóstico; UI de ficha, no chat |
| L1D-85 | US-099 — El mismo dato en dos documentos queda como un solo dato con dos fuentes, y dos valores distintos | Backlog | - | 5 | POST-MVP | FEAT-03a / US-099/US-100: normalización y duplicados entre documentos, nacen de la ingesta OCR |
| L1D-86 | US-100 — Un dato extraído nunca reemplaza en silencio a uno verificado; en diagnósticos decide la fecha | Backlog | - | 5 | POST-MVP | FEAT-03a / US-099/US-100: normalización y duplicados entre documentos, nacen de la ingesta OCR |
| L1D-87 | US-107 — El oncólogo verifica, corrige o rechaza un dato extraído y confirma o descarta un diagnóstico en | Backlog | - | 5 | POST-MVP | FEAT-03b / US-107/US-108: revisión y verificación de datos extraídos; el chat es solo lectura («no modificar la historia clínica») |
| L1D-88 | US-108 — En la vista de caso tengo una lista de pendientes de revisión con sus acciones | Backlog | - | 3 | POST-MVP | FEAT-03b / US-107/US-108: revisión y verificación de datos extraídos; el chat es solo lectura («no modificar la historia clínica») |
| L1D-107 | US-056 — El límite de consultas, el semáforo de inferencia y el tiempo máximo protegen el LLM local | Backlog | Sprint 6 | 3 | POST-MVP | US-056: semáforo de inferencia y límites (RN-30); un solo piloto sintético, ver riesgo M-2 |
| L1D-142 | US-101 — La tarjeta de la opción avisa cuando el análisis depende de datos sin verificar, sin bloquear na | Backlog | Sprint 6 | 5 | POST-MVP | US-101: aviso de datos sin verificar en la tarjeta; el chat reporta faltantes por B |
| L1D-147 | US-174 — El historial lista y muestra cada análisis previo desde su snapshot, con su contexto, sus modelo | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-11a / US-174/US-179/US-251: historial, re-ejecución y comparación; «historial persistente» está Out of Scope |
| L1D-152 | US-179 — Veo el historial con sus marcas, abro un análisis previo, lo re-ejecuto y comparo el resultado | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-11a / US-174/US-179/US-251: historial, re-ejecución y comparación; «historial persistente» está Out of Scope |
| L1D-157 | US-189 — El análisis nuevo recibe como memoria los últimos N análisis de evidencia del paciente y la evol | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-11c / US-189…US-192/US-255: memoria de análisis previos e historial de conversaciones; Out of Scope. Ver riesgo RN-24 si el chat reutiliza análisis |
| L1D-158 | US-190 — La memoria viaja desidentificada, rotulada "análisis previo de IA" y delimitada como datos | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-11c / US-189…US-192/US-255: memoria de análisis previos e historial de conversaciones; Out of Scope. Ver riesgo RN-24 si el chat reutiliza análisis |
| L1D-159 | US-191 — Un análisis previo nunca es citable ni cuenta como soporte, y una afirmación que solo él respald | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-11c / US-189…US-192/US-255: memoria de análisis previos e historial de conversaciones; Out of Scope. Ver riesgo RN-24 si el chat reutiliza análisis |
| L1D-160 | US-192 — Si un análisis usado como memoria queda desactualizado, el que lo usó también queda desactualiza | Backlog | - | 3 | POST-MVP | FEAT-11c / US-189…US-192/US-255: memoria de análisis previos e historial de conversaciones; Out of Scope. Ver riesgo RN-24 si el chat reutiliza análisis |
| L1D-172 | US-042 — El validador mínimo impide publicar un catálogo con ítems sin destino o con estándares no permit | Backlog | Sprint 6 | 3 | POST-MVP | US-042: validador de catálogo con ítems sin destino; sin cambios de catálogo masivos en el sprint |
| L1D-174 | US-018 · DEC-08 — Umbrales de tendencia por biomarcador | Backlog | Sprint 6 | 1 | POST-MVP | US-018/DEC-08: umbrales de tendencia por biomarcador; sin UI de tendencias |
| L1D-183 | US-102 — Cada lectura de la ficha, de la vista de caso y de un documento queda auditada sin datos persona | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T1b / US-102/US-150: auditoría de accesos completa (S6); riesgo para datos reales |
| L1D-184 | US-150 — Cada acción sobre un paciente queda auditada sin datos personales: análisis, resumen, carga, rev | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-T1b / US-102/US-150: auditoría de accesos completa (S6); riesgo para datos reales |
| L1D-191 | US-205 — La Base del análisis lista los análisis previos usados como contexto, con la marca "contexto, no | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T2c / US-205/US-206: Base del análisis con análisis previos y búsqueda complementaria (agente) |
| L1D-192 | US-206 — La Base del análisis lista cada sub-consulta de la búsqueda complementaria, su objetivo y si enc | Backlog | - | 3 | POST-MVP | FEAT-T2c / US-205/US-206: Base del análisis con análisis previos y búsqueda complementaria (agente) |
| L1D-201 | US-047 — Registro manual de un paciente con identidad cifrada, convenio y retención | Backlog | Sprint 6 | 5 | POST-MVP | US-047: alta manual de pacientes; los pacientes son sintéticos sembrados |
| L1D-214 | US-149 — El administrador registra y revoca marcas de opt-out por CLI, con referencia externa y motivo de | Backlog | Sprint 6 | 3 | POST-MVP | US-149/DEC-12/DEC-16: CLI de opt-out, canal y alcance; solo cobran sentido con datos reales |
| L1D-215 | US-022 · DEC-12 — Canal de opt-out: referencia externa, catálogo de motivos y SLA | Backlog | Sprint 6 | 1 | POST-MVP | US-149/DEC-12/DEC-16: CLI de opt-out, canal y alcance; solo cobran sentido con datos reales |
| L1D-216 | US-026 · DEC-16 — Alcance de "generación con IA" bajo el opt-out de `analisis_ia` | Backlog | Sprint 6 | 1 | POST-MVP | US-149/DEC-12/DEC-16: CLI de opt-out, canal y alcance; solo cobran sentido con datos reales |
| L1D-217 | US-143 — `oncolens preflight real-data` verifica los prerrequisitos del gate y `clinical-api` no arranca  | Backlog | Sprint 6 | 8 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-218 | US-144 — `web` solo se publica en la interfaz de la VPN y con HTTPS firmado por la CA interna | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-219 | US-145 — Los backups de PostgreSQL y `clinical-minio` salen cifrados del equipo y su restauración se prue | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-221 | US-147 — La revisión de seguridad del piloto queda registrada y ningún hallazgo crítico o alto queda abie | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-222 | US-027 · ADR-43 — Catálogo del corpus en una base de datos separada de la misma instancia | Backlog | Sprint 6 | 2 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-223 | US-020 · DEC-10 — Plantillas de preguntas clínicas validadas por tipo de cáncer | Backlog | Sprint 6 | 1 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-224 | US-025 · DEC-15 — Validación legal de diferir el job de retención | Backlog | Sprint 6 | 1 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-225 | US-029 · DEC-17 — Mapeos terminológicos firmados | Backlog | Sprint 6 | 1 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-226 | US-030 · DEC-18 — Edad de mayoría configurada | Backlog | Sprint 6 | 1 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-227 | US-031 · DEC-19 — Criterio de "listo" por tipo de cáncer firmado | Backlog | Sprint 6 | 1 | POST-MVP | FEAT-T4d: G-Piloto (preflight, VPN, backups, revisión de seguridad, DEC legales); sin piloto en el MVP. Ver riesgo RN-13 |
| L1D-239 | US-103 — La suite mide la exactitud de la extracción, su p95, la calidad de `auto_aceptado` y el gate de  | Backlog | - | 5 | POST-MVP | US-103: exactitud de extracción OCR |
| L1D-249 | US-137 — `POST /platform/evidence-analyses/{id}/feedback` guarda la calificación 1–5 y los dos checkboxes | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-T5c / US-137…US-139/DEC-14: feedback 1–5 y VM-4/VM-5 (medición de valor) |
| L1D-250 | US-138 — Al cerrar cada análisis el panel ofrece la calificación 1–5 y, si hubo aviso de faltantes, los d | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T5c / US-137…US-139/DEC-14: feedback 1–5 y VM-4/VM-5 (medición de valor) |
| L1D-251 | US-139 — El reporte de feedback agrega VM-4 y VM-5 por cohorte y por versión de catálogo y dice si el cat | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T5c / US-137…US-139/DEC-14: feedback 1–5 y VM-4/VM-5 (medición de valor) |
| L1D-252 | US-024 · DEC-14 — Revisión clínica de la muestra de aplicabilidad (VM-3) | Backlog | Sprint 6 | 1 | POST-MVP | FEAT-T5c / US-137…US-139/DEC-14: feedback 1–5 y VM-4/VM-5 (medición de valor) |
| L1D-253 | US-152 — VM-1 y VM-2 se miden con OncoLens en ambas cohortes y se comparan con el baseline manual | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-T5d: medición VM-1…VM-6 y G-Éxito en piloto mixto |
| L1D-254 | US-153 — VM-3 se mide en la cohorte real con una muestra de tablas de aplicabilidad revisada por el oncól | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T5d: medición VM-1…VM-6 y G-Éxito en piloto mixto |
| L1D-255 | US-154 — VM-4 y VM-5 del piloto se reportan por cohorte con su tasa de respuesta y las metas congeladas | Backlog | Sprint 6 | 2 | POST-MVP | FEAT-T5d: medición VM-1…VM-6 y G-Éxito en piloto mixto |
| L1D-256 | US-155 — La encuesta de VM-6 se aplica al final del piloto y mide verificabilidad y no prescripción perci | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T5d: medición VM-1…VM-6 y G-Éxito en piloto mixto |
| L1D-257 | US-156 — El informe de G-Éxito consolida VM-1…VM-6 contra las metas congeladas y los incidentes críticos, | Backlog | Sprint 6 | 3 | POST-MVP | FEAT-T5d: medición VM-1…VM-6 y G-Éxito en piloto mixto |
| L1D-258 | US-157 — La suite mide que la síntesis reporta las discrepancias sembradas y copia las etiquetas factuale | Backlog | - | 3 | POST-MVP | US-157/US-158/US-160/US-161: evaluación de síntesis, fechas en citas, memoria y agente; todas atadas a capacidades Post-MVP |
| L1D-259 | US-158 — La suite verifica que el 100 % de las citas muestra su fecha y el de las guías su versión | Backlog | - | 2 | POST-MVP | US-157/US-158/US-160/US-161: evaluación de síntesis, fechas en citas, memoria y agente; todas atadas a capacidades Post-MVP |
| L1D-261 | US-160 — La suite verifica que la memoria de análisis nunca es soporte y nunca lleva datos personales | Backlog | Sprint 6 | 3 | POST-MVP | US-157/US-158/US-160/US-161: evaluación de síntesis, fechas en citas, memoria y agente; todas atadas a capacidades Post-MVP |
| L1D-262 | US-161 — La suite mide cuántos criterios resuelve la búsqueda complementaria y recalibra el p95 con el ag | Backlog | - | 3 | POST-MVP | US-157/US-158/US-160/US-161: evaluación de síntesis, fechas en citas, memoria y agente; todas atadas a capacidades Post-MVP |
| L1D-270 | US-220 — El oncólogo filtra la evidencia por antigüedad y el filtro queda registrado en la Base del análi | Backlog | Sprint 6 | 3 | POST-MVP | US-220: filtro de antigüedad de evidencia; no es recall previo al reranker |
| L1D-271 | US-221 — Una persona solicita una cuenta y el administrador la aprueba o la rechaza | Backlog | Sprint 6 | 3 | POST-MVP | US-221/US-222: cuentas y consola de administración |
| L1D-272 | US-222 — El administrador gestiona usuarios y altas de pacientes desde una consola, sin acceso a datos cl | Backlog | Sprint 6 | 5 | POST-MVP | US-221/US-222: cuentas y consola de administración |
| L1D-281 | ARR-05 — Baseline manual VM-1/VM-2 con los oncólogos | Backlog | Sprint 5 | 3 | POST-MVP | ARR-05: baseline manual VM-1/VM-2 con oncólogos; medición de valor |
| L1D-289 | US-239 — Cuatro oncólogos pueden analizar a la vez sin que `rag-orchestrator` se caiga: las etapas pesada | Backlog | Sprint 6 | 5 | POST-MVP | US-239: concurrencia de 4 oncólogos; demo con un usuario |
| L1D-307 | US-251 — La misma entrada devuelve el análisis ya guardado, rotulado como reutilizado, y «Re-ejecutar» ge | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-11a / US-174/US-179/US-251: historial, re-ejecución y comparación; «historial persistente» está Out of Scope |
| L1D-308 | US-252 — La suite evaluate mide la reproducibilidad y la estabilidad del análisis ante variantes que no c | Backlog | Sprint 6 | 5 | POST-MVP | US-252: reproducibilidad del análisis; no es R1–R4 |
| L1D-311 | US-255 — Las conversaciones de seguimiento quedan como historial, las 3 últimas se ven al abrir el anális | Backlog | Sprint 6 | 5 | POST-MVP | FEAT-11c / US-189…US-192/US-255: memoria de análisis previos e historial de conversaciones; Out of Scope. Ver riesgo RN-24 si el chat reutiliza análisis |

### SIN-CAMBIO
Los 113 issues en Done no se tocan (entre ellos L1D-248 que S5-cierre §8 pide revisar a mano: figura Done en Linear sin estar cerrada).

## 4. Riesgos de mover a Post-MVP

1. **Opt-out RN-15 / M-1 (S5-cierre §2).** L1D-42 (FEAT-T4c), L1D-213 (US-148), L1D-214, L1D-215, L1D-216 salen. Mitigación obligatoria: mantener la guarda de entorno sintético y no retirarla; el chatbot es una generación con IA nueva sobre un paciente, por eso L1D-213 queda en REVISAR (si se retira la guarda o entra un dato real, el 403 pasa a bloqueante).
2. **RN-13 / G-Piloto.** L1D-43 (FEAT-T4d) y sus 11 hijos (preflight, VPN+HTTPS, backups, revisión de seguridad L1D-221, DEC legales L1D-224…227) salen. Consecuencia: ningún dato real ni anonimizado puede entrar a la aplicación; la demo es solo sintética (ya aceptado por el usuario). No se puede declarar G-Piloto ni G-Éxito (L1D-49 y sus hijos).
3. **Auditoría (L1D-35, 183, 184).** Sin auditoría de accesos/acciones la trazabilidad de uso del chat se limita a `AIAnalysisRecord` (RN-06). Aceptable con datos sintéticos; bloqueante antes de datos reales.
4. **Límite de tasa / semáforo / concurrencia (L1D-107, L1D-289; M-2 RN-30).** Un chat conversacional multiplica las llamadas al LLM local; sin límite, un usuario puede saturar el stack (S5 ya tuvo swap, D5-59). Riesgo operativo en demo, no de seguridad con datos sintéticos.
5. **Prompt injection (L1D-108, REVISAR).** El chat acepta texto libre; si se mueve a Post-MVP, la defensa queda solo en validación de citas/NLI. Sugerencia: mantener.
6. **RN-24 y memoria (L1D-28, 157…160, 311, 191).** Si el chatbot reutiliza análisis previos o conversaciones como contexto sin las reglas de US-190/US-191, se rompe «un análisis previo nunca es soporte». Mitigación: el chat no usa memoria de análisis (Out of Scope) y se prueba por test.
7. **Evaluación y validación clínica.** Se pierde la medición de valor (L1D-48/49/281 ARR-05, baseline VM-1/VM-2) y la revisión clínica del dataset (L1D-233). AC05 del prompt exige «casos sintéticos revisados por oncólogos»: hace falta una revisión mínima fuera de Linear.
8. **IDOR en seguimiento (M-3).** Sigue aceptado hasta CareTeamMember (L1D-?? fuera de lista, FEAT-T4e archivada); el chat hereda el riesgo.
9. **Cabeceras de seguridad (L1D-266, REVISAR)** y **RN-12 en la ruta nueva (L1D-204, REVISAR)**: introducir assistant-ui y una ruta LLM sobre datos del paciente sin ellas amplía la superficie XSS y arriesga RN-11/RN-12.
10. **Ficha con confianza de extracción / revisión (L1D-78, 87, 88).** Al ser Post-MVP, «diferenciar información documentada de interpretaciones» (A) debe resolverse con etiquetas del dato, no con el flujo de revisión.
11. **Contenedores en Sprint 5 sin cerrar.** Varias Features quedan «In Progress» con hijos Post-MVP; hay que cerrarlas parcialmente (o moverlas) para que el tablero no mienta (L1D-9, 10, 14, 16, 17, 18, 20, 25, 30, 32, 40, 46, 47).

## 5. Elementos nuevos que habría que crear (NO existen en Linear; nada creado)

Chatbot (puntos sugeridos; se ajustan en `/sprint-refine S6`):

| Propuesta | Pts | Cubre |
|---|---|---|
| ADR-<n> — Interfaz conversacional (assistant-ui) y enrutado de turnos (caso / faltantes / evidencia); decide si se adopta LangGraph | 2 | prompt §6; corrige el supuesto «Backend 2 con LangChain/LangGraph» (no existe) |
| SPIKE — PoC assistant-ui contra `POST /platform/evidence-analyses` y follow-ups (solo APIs estables, sin streaming de tokens) | 3 | prompt §6; el código no se mergea |
| Historia — Endpoint de turno de chat en Backend 1 (BFF Route Handler + clinical-api): contexto del paciente desidentificado, enrutado, `AIAnalysisRecord` antes de responder, 403 opt-out, solo lectura | 8 | A/B/C; RN-06, RN-10/11/12 |
| Historia AC01/AC02 — Preguntas sobre el caso (situación, examen, tratamiento, evolución, periodos) con referencias a datos y fechas, verbalización determinista + NLI (ADR-34) | 8 | A |
| Historia — Contradicciones entre documentos/datos y separación «documentado vs. interpretación» | 5 | A |
| Historia AC03 — «¿Qué falta?»: no encontrado / incompleto / por reconciliar / no buscado, desde `completeness` | 5 | B |
| Historia AC04 — «¿Por qué importa?» desde el catálogo de datos críticos, sin inventar requisitos (Should Have) | 3 | B |
| Historia AC05 — Evidencia científica contextualizada: hallazgos, coincidencias/diferencias/desconocidos (aplicabilidad), reutilizando el pipeline RAG | 5 | C |
| Historia AC06 — Fuentes y limitaciones: referencias verificables, límites de la evidencia y de la recuperación, «sin evidencia» (RN-02) | 3 | C |
| Historia — UI del panel conversacional (mensajes estructurados, citas, avisos RN-19/RN-23) con visual-check | 8 | §3 del prompt |
| Historia — E2E y `evaluate` del chatbot (AC01–AC06 con casos sintéticos de mama y próstata) | 5 | §5 del prompt |

RAG (R1–R4 de S5-cierre §9 ítem 3 no tienen issue en Linear; FEAT-T5e/US-226…US-230 es un borrador local de 23 pts, no publicado):

| Propuesta | Pts | Nota |
|---|---|---|
| R1 — Excluir listas de referencias en la ingesta y reingestar | 3 | requiere `evaluate` |
| R2 — `RERANKER_MAX_PAIRS` 12→16 con recalibración del NFR de p95 (DEC-03) | 2 | p95 estimado 15,9 s |
| R3 — Medir `RETRIEVAL_MODE=hibrida` sobre el caso y el corpus ampliado (une L1D-304 / US-248 y D5-08) | 3 | |
| R4 — Registrar ids de chunk cortados y orden en `rag_query_corte` (sin texto, RN-10) | 1 | |
| Métrica «recall previo al reranker» en `evaluate` por tipo e idioma | 2 | |
| «G-Demo real verificable» (D5-53, D5-55, D5-57, D5-54; bloqueante B2 de S5-cierre §3) | 3 | si la demo final vuelve a usar el gate |

Ítems de la Demo 5 sin L1D (d5fb-01…d5fb-05, S5-cierre §9.2): solo con aprobación; (a) «0 opciones descritas» sin explicación y (b) no proponer un fármaco ya recibido son hallazgos RAG/prompt que cabrían en el chatbot (pedir al usuario).

## 6. Cómo marcar «Post-MVP» sin crear proyectos ni equipos

Hechos leídos: el proyecto tiene hitos Pre-S1…Sprint 6 y no hay hito ni etiqueta `Post-MVP`; los estados son los 7 de arriba (sin un estado Post-MVP); en el MCP de Linear (`mcp__plugin_design_linear__*`) existen `save_issue` (cambia estado, hito, etiquetas con addLabels/removeLabels, proyecto), `save_milestone`, `save_issue_label` / `create_issue_label`, `retire_issue_label`, `save_comment`. **No hay herramienta de archivar ni de borrar issues** (no existe `archive_issue` ni `delete_issue`); archivar solo es posible desde la interfaz de Linear (o cancelando con `save_issue` state=Canceled, que no archiva). Los archivados anteriores se hicieron fuera del MCP.

Opciones, de menor a mayor impacto:

1. **(Recomendada) Etiqueta `post-mvp` + hito `Post-MVP` dentro de OncoLens-1 + estado Backlog.** Menos invasiva que cancelar: no pierde historia, no crea proyecto ni equipo, es reversible, y el tablero muestra Sprint 6 limpio. Herramientas de escritura: `save_issue_label` (crear `post-mvp` una vez), `save_milestone` (crear `Post-MVP` en OncoLens-1, sortOrder > 6135) y `save_issue` por cada issue (projectMilestone = Post-MVP, addLabels = [post-mvp], state = Backlog). ~82 llamadas más contenedores; se puede hacer en tandas. El README de `backlog/features` y la columna «Sprint» se actualizan primero (Markdown es la fuente).
2. Solo etiqueta `post-mvp` (sin hito): mínimo esfuerzo, pero las historias quedan con hito «Sprint 6» y el tablero del sprint sigue sucio; solo si no se quiere tocar hitos.
3. Solo hito `Post-MVP`: sirve para filtrar por hito, pero sin etiqueta no se ve en listas; combinar con la 1.
4. Cancelar (`state=Canceled`) o archivar en la UI: pierde el estado de backlog vivo y choca con «IDs inmutables» en espíritu; desaconsejado salvo para duplicados.

Nota: no se probó ninguna de estas herramientas.

## 7. Pendientes y límites de esta lectura

- Cifra de archivados aproximada (71); no se leyeron los títulos de los archivados.
- Los contenedores Feature (FEAT-*) no tienen estimación; las sumas de puntos son solo de historias.
- Las clasificaciones se basan en los títulos de Linear y en el índice/documentos del repo; no se abrió cada FEAT-*.md ni los AC de cada historia. Las asignaciones REVISAR son opinión mía y requieren decisión del usuario.
- Referencia de L1D-?? en el riesgo 8 se refiere a FEAT-T4e (equipo tratante), que está archivada y no aparece en la lista activa.

## 8. Decisiones del usuario sobre los 14 `REVISAR` (2026-11-06) y su ejecución

> El usuario aprobó la tabla propuesta. Lo ejecutado en Linear es **solo** el cambio de hito de los cinco que pasan a Post-MVP y el cierre de `L1D-32`; cada movimiento se verificó con una lectura posterior. El hito `Post-MVP` queda con **87** issues (82 + 5), todos en `Backlog`, listos para que el usuario los archive desde la interfaz.

| ID | Decisión | Estado tras ejecutar |
|---|---|---|
| L1D-108 (US-057, prompt injection) | **Se queda en el S6** (KEEP-CHATBOT): el chat recibe texto libre | Sin cambios (Sprint 6) |
| L1D-204 (US-050, RN-12) | **Se queda**: la ruta nueva del LLM sobre datos del paciente debe cumplirla por código | Sin cambios (Sprint 6) |
| L1D-266 (US-216, cabeceras de seguridad) | **Se queda**: `assistant-ui` amplía la superficie XSS | Sin cambios (Sprint 6) |
| L1D-241 (US-105, fidelidad del caso reconstruido) | **Se queda**: mide AC01 | Sin cambios |
| L1D-213 (US-148, `403` por opt-out) | **Se queda** (5 pts). Hoy el `403` **no está implementado** en `clinical-api` (el paciente (d) tiene la marca sembrada y genera análisis igual); el chat es una generación nueva | Sin cambios (Sprint 6) |
| L1D-75 (US-089), L1D-78 (US-092), L1D-118 (US-119), L1D-143 (US-136), L1D-233 (DEC-06) | **A Post-MVP** (el chat lee el JSON del caso; la revisión clínica se hace fuera de Linear) | **Movidos al hito `Post-MVP`**; hito de origen: Sprint 6, sin hito, Sprint 5, sin hito y Sprint 6, respectivamente; estado `Backlog` sin cambios |
| L1D-32 (FEAT-PL3) | **Cerrar**: todos sus hijos están `Done` salvo L1D-172 y L1D-174, ya en Post-MVP | **`Done`** |
| L1D-30 (FEAT-PL1) | **Cerrar cuando termine L1D-266**, que es hijo suyo y se mantiene en el S6 | Sin cambios (`In Progress`, Sprint 5) |
| L1D-285 (US-213b) | **Cerrar**, pero su código ya está mergeado (#199, #204, #211) y quedan dos tareas de deuda sin destino en su change (5.1 menores del `design-principles-reviewer`; 5.3 `fullName`, ya trasladada a US-222): darles destino y cerrar | Sin cambios (`In Review`, Sprint 5) |
| L1D-286 (braces, 2026-11-20) | **Decidir en el refinamiento**, sin puntos | Sin cambios |

### Resueltas después por el usuario (2026-11-06)

- **L1D-268 (US-218, las 10 preguntas de seguimiento):** cerrada (**`Done`**), por decisión del usuario, al quedar sustituida por el chatbot. Sus tareas humanas (H-1, H-2, H-5) y la corrida nocturna D5-13 **no se ejecutaron**. Aviso: su AC-6 (`403` por opt-out) **nunca se implementó**; ese hueco lo cubre L1D-213, que se mantiene en el S6.
- **Carryover al Sprint 6 de lo alineado con RAG y chatbot** (los no alineados ya estaban en Post-MVP). Se movieron 26 issues cambiando **solo** el hito; el estado no cambió. Para revertir: los 23 con origen Sprint 5 vuelven a `Sprint 5` y L1D-11, 241 y 304 a «sin hito» (puede exigir pasar un hito nulo; no se ha probado).

| Hito de origen · estado | Issues |
|---|---|
| Sprint 5 · In Progress | L1D-9, 14, 16, 18, 20, 25, 30, 40, 46, 47 |
| Sprint 5 · In Review | L1D-113, 116, 119, 126, 205, 246, 285, 299 |
| Sprint 5 · Backlog | L1D-10, 17, 92, 125, 286 |
| Sin hito · Backlog | L1D-11, 241, 304 |

**Estado de Linear tras estos cambios** (verificado con una lectura posterior): 119 issues no terminados = **32 en Sprint 6** + **87 en Post-MVP**; 0 en Sprint 5 y 0 sin hito. (121 abiertos − L1D-32 − L1D-268.)

### Pendiente de decisión del usuario

- La **descripción del hito Sprint 6** en Linear aún dice «G-Piloto … piloto mixto … G-Éxito» y debe reescribirse al definir el sprint (`/sprint-refine S6`). No se ha tocado.
- **Archivar** los 87 issues del hito Post-MVP: lo hace el usuario desde la interfaz de Linear (el MCP no archiva).
