# S5 · Refinamiento (fases 1 a 3)

> `/sprint-refine S5`, sesión principal, 2026-11-03. Base: `main` 90d2f662. Fuentes: [`S4-cierre.md`](S4-cierre.md), [`S5-deuda.md`](S5-deuda.md), `backlog/features/README.md` (fila S5, PRD E-17), Linear (hito «Sprint 5»), `docs/ux/`.
> **Plazo:** 3 días para ejecutar el S5 **y** hacer la Demo 5 (usuario, 2026-11-03). Meta de cierre ≥ 80 % de lo comprometido (`CLAUDE.md`, «Ritmo, presupuesto y meta de cierre»).
> **Estado:** decisiones tomadas por el usuario el 2026-11-03 (`[S5 resp. 1]`…`[S5 resp. 5]`). Siguiente paso: merge de este PR y `/sprint-start S5`.

## 1. Punto de partida

- **El S5 sumaba 121 pts** en 35 historias. Velocidad real: el S4 cerró 66 pts en ~4 días con muchas pausas por permisos.
- **Criterio de recorte** (usuario, 2026-10-29 y PRD E-17): RAG de conocimiento → búsqueda por los datos del paciente → OCR → gestión de usuarios (lo último se recorta primero). **G-Demo** (E-17) = «caso registrado y editado a mano → faltantes → análisis con debate de varias preguntas». El OCR ya salió del MVP.
- **Arrastre del S4:** L1D-299 (US-233b, entrega parcial: 1.1, 1.2, 1.11, 2.1, 3.2), L1D-125 (firma de DEC-11), mediciones reales D4-21 (US-133 AC-1) y D4-30 (US-238 AC-9).
- **Higiene pendiente:** 12 changes activos de sprints anteriores sin archivar (`l1d-202`, `l1d-72`, `l1d-194` completos; `l1d-205` 13/15, `l1d-285` 24/26, `l1d-116` 14/15, `l1d-126` 26/30, `us-231b` 16/22, `l1d-197` 22/23, `l1d-166` 24/25, `l1d-173` 13/14, `l1d-299` 13/21). Varios están en In Review con el hito del S5 (L1D-116, L1D-126, L1D-205, L1D-285).
- **Contratos ya congelados** (US-033): `GET …/case`, `POST …/biomarkers`, `POST …/diagnoses`, `POST/GET …/follow-ups` y `/rag/follow-up`. El esquema tiene `ClinicalNote`, `PriorTreatment`, `ClinicalAttribute`, `AnalysisFollowUp` y `entry_method = manual_correction`. **Faltan** en el contrato: `clinical-attributes`, `prior-treatments`, la corrección (US-253) y las notas en la ficha.

## 2. Compromiso del S5 · 85 pts `[S5 resp. 3]`

Meta ≥ 80 % = **68 pts cerrados**.

| Oleada propuesta | L1D | US | Pts | Contexto | DoR |
|---|---|---|---|---|---|
| O1 | — | **ARR-10** conciliar y archivar los 12 changes activos + D5-02 (CI de `contracts/examples/**` contra `main`) | 2 | todos | ✓ (tarjeta de arrastre sin issue, como ARR-09) |
| O1 | L1D-306 | US-250 NFC de la pregunta | 2 | clinical-platform · ai-services · frontend | ✓ (D-6) |
| O1 | L1D-305 | US-249 RN-23 voz propia y nivel B | 3 | ai-services | ✓ |
| O1 | L1D-119 | US-120 corpus ≥ 20 docs por tipo + barridos | 5 | ai-services | ✓ (ADR-36 decidido; AC-5/AC-6 en la corrida nocturna, §5) |
| O1 | L1D-84 | US-098 normalización final de datos manuales | **3** | clinical-platform | ✓ (D-4) |
| O1 | L1D-74 | US-088 `GET …/case` | 5 | clinical-platform | ✓ (D-8) |
| O1 | L1D-268 | US-218 seguimiento (backend) | 5 | contratos · clinical-platform · ai-services | ✓ (8 AC, en el límite) |
| O2 | L1D-90 | US-110 registro manual biomarcador y diagnóstico | 5 | clinical-platform | ✓ (DEC-05 decidido; usa US-098) |
| O2 | L1D-80 | US-094 tratamientos previos y atributos | 5 | contratos · clinical-platform · frontend | ✓ (contrato aditivo en `## contratos`) |
| O2 | L1D-309 | US-253 corregir con histórico | 5 | contratos · clinical-platform · frontend | ✓ (D-2 → ADR-50; AC-5 reducido, D-10) |
| O2 | L1D-76 | US-090 vista de caso | 5 | frontend | ✓ (D-8) |
| O2 | L1D-269 | US-219 hilo de seguimiento (UI) | 3 | frontend | ✓ (S5-04) |
| O2 | L1D-113 | US-116 faltantes como «desconocido» en el prompt | 3 | ai-services | ✓ |
| O2 | L1D-79 | US-093 tendencias y eventos en el contexto | 3 | clinical-platform | ✓ (datos del seed y manuales; `biomarkerTrends` vacío sin US-091) |
| O3 | L1D-91 | US-111 formularios de registro | 3 | frontend | ✓ (S5-03) |
| O3 | L1D-96 | US-004 datos críticos con acción en la vista de caso | 3 | frontend | ✓ (D-7) |
| O3 | L1D-310 | US-254 pacientes sintéticos en distintos momentos | 5 | clinical-platform | ✓ (D-6) |
| O3 | L1D-195 | US-070 el análisis no escribe datos clínicos | 2 | clinical-platform | ✓ (quitar `needs-refinement` en Linear) |
| O3 | L1D-196 | US-071 los avisos clínicos no bloquean | 3 | clinical-platform · frontend | ✓ (D-9) |
| O3 | L1D-246 | US-140 suite de hasta 3 opciones | 5 | ai-services | ✓ (DEC-07: metas iniciales de `CLAUDE.md` como escenario) |
| O3 | L1D-299 | US-233b (arrastre) | 3 | ai-services | Cerrar 1.1, 1.2, 1.11, 2.1, 3.2 o darles ID destino |
| O4 | L1D-248 | US-142 G-Demo | 5 | todos | ✓ (D-5) |
| humano | L1D-92 | DEC-01 catálogo de datos críticos | 1 | — | Escenario `propuesta_revisada` aceptado `[S3 resp. 1]`; no bloquea |
| humano | L1D-125 | DEC-11 firma (arrastre) | 1 | — | No bloquea |
| | | **Total** | **85** | | |

Cuenta: 79 de historias del S5 (con US-098 en 3) + 4 de arrastre (L1D-299 3, L1D-125 1) + 2 de ARR-10 = 85. Las oleadas son orientativas: `/sprint-start` las fija con el grafo de dependencias.

**Orden de recorte dentro del S5** si a mitad del día 2 el ritmo no da (lo último se recorta primero, `[S5 resp. 3]`): (1) US-071 → (2) US-093 → (3) US-070 → (4) US-254 de 7 a 4 pacientes → (5) US-094 solo atributos → (6) US-253 sin exámenes → (7) US-140. **Nunca:** US-249, US-250, US-218, US-219, US-120, US-110, US-111, US-088/US-090 (G-Demo).

## 3. Decisiones del sprint

### D-1 · Dónde viven los faltantes con acción y el registro manual · caro de revertir · **Decidido (usuario, 2026-11-03): B, vista de caso mínima** `[S5 resp. 1]`

| | A · En la ficha *(recomendada por la sesión)* | **B · Vista de caso mínima (US-088 + US-090)** | C · FEAT-02b completa |
|---|---|---|---|
| Qué es | La columna «Datos críticos» de la pantalla 07 y el «Ingresar a mano» se montan en la ficha | `GET …/case` y una página de vista de caso con timeline, tratamientos, atributos, serie en tabla y la columna «Datos críticos» | 088, 089, 090, 092, 093 (21 pts) |
| Coste | 0 pts extra | +10 pts | +21 pts |

El usuario eligió **B** y, con D-3, sube el compromiso para que quepa. *Descartadas:* A (deja G-Demo sin el caso reconstruido en una pantalla) y C (US-089 y US-092 no caben; US-092 muestra datos extraídos, que sin OCR no existen). **Consecuencias:** US-089 → S6 `si-hay-capacidad`; US-092 → Post-MVP con el OCR. La corrección con histórico (US-253) vive en la **ficha**, donde están las tablas de diagnóstico y biomarcadores.

### D-2 · Cómo se guarda una corrección con su histórico (US-253) · caro de revertir · **Decidido (usuario, 2026-11-03): A** `[S5 resp. 2]` → [ADR-50](../../docs/architecture/adr/ADR-50-correccion-con-historico-supersedes.md)

| | **A · Fila nueva + anterior `reemplazado` + `supersedes_id`** | B · `UPDATE` en el sitio + tabla de versiones | C · `UPDATE` en el sitio + `AuditLog` |
|---|---|---|---|
| Esquema | 1 columna nullable `supersedes_id` en `biomarker`, `exam` y `clinical_note` (migración aditiva) | Tabla nueva con instantánea JSON | Ninguno |
| Coherencia | El mismo patrón que US-110 AC-2 para `Diagnosis`; RN-05/RN-08: nada se sobrescribe | Dos modelos de histórico | Histórico en un log |
| Análisis previos | No se alteran; la huella del contexto cambia sola | La fila que leyó un análisis cambia de valor | Igual que B |

*Descartadas:* B duplica el concepto de histórico y rompe la trazabilidad de los análisis guardados; C pondría PHI en un log (prohibido) y la auditoría llega en el S6 (US-150).

### D-3 · Alcance y compromiso · caro de revertir · **Decidido (usuario, 2026-11-03): 85 pts** `[S5 resp. 3]`

La sesión recomendó 59 pts (riesgo de quedar bajo el 80 % con más). El usuario eligió comprometer **todo**: los 59 base + la vista de caso mínima (10) + US-140, US-116, US-070, US-093 y US-071 (16). Riesgo aceptado: con el ritmo del S4 (~16 pts/día) 85 pts en 3 días exige ~28 pts/día; el orden de recorte de §2 protege G-Demo.

**Movimientos:**

| Destino | Historias | Pts |
|---|---|---|
| S6 | DEC-06 (US-016), DEC-07 (US-017), DEC-08 (US-018), DEC-09 (US-019), DEC-14 (US-024) y ARR-05, en una sesión con oncólogos (DEC-07 se decide con el baseline real de la corrida nocturna, §5) | 5 (+3 de ARR-05, que no cuenta en los 121) |
| S6 | Feedback T5c: US-137, US-138, US-139 (VM-4/VM-5 se miden en el piloto) · US-131 · US-220 (filtro de antigüedad) · US-101 | 11 + 3 + 3 + 5 |
| S6 `si-hay-capacidad` | US-089 (agrupación por línea, fuentes adicionales, PSA siempre serie) | 5 |
| Post-MVP (con el OCR) | US-092 (datos extraídos en la ficha), US-136 (conflictos entre documentos) | 3 + 5 |

Cuenta: 121 = 81 que se quedan (US-098 en 5) + 40 que salen; con US-098 en 3, 79. El S6 compromete 146 + 27 = **173** (más US-089 como `si-hay-capacidad`) y queda sobrecargado: se recorta en su refinamiento con la regla de E-17 (memoria y conversaciones ganan a partes de G-Piloto). **Ninguna historia del camino crítico de G-Piloto se mueve.**

### D-4 · US-098 recortada a datos manuales (5 → 3) · barato · **Decidido (usuario, 2026-11-03)** `[S5 resp. 4]`

`ReconciliationService` para datos manuales y la invariante del catálogo (AC-2, AC-3, AC-4, AC-5, AC-7). AC-1 (propuesta de Backend 2 en la extracción) y AC-6 (`CATALOG_VERSION_MISMATCH` en una extracción) pasan a **Post-MVP** con FEAT-01b. *Descartadas:* mantener 5 pts (construye una ruta de extracción que no existe en el MVP) y meter la normalización dentro de US-110 sin historia propia (dos dueños de RN-27).

### D-5 · G-Demo (US-142) · barato · **Decidido (usuario, 2026-11-03), ajustado a D-1** `[S5 resp. 4]` `[S5 resp. 5]`

AC-1 recorre: login → listado → ficha (con una **corrección** de biomarcador) → **vista de caso** con timeline y datos críticos → **registro a mano** de un faltante → análisis con hasta 3 opciones → **2 preguntas de seguimiento** con citas; sin feedback (T5c → S6). AC-2: metas iniciales de `CLAUDE.md` como escenario de DEC-07, con US-140 como suite de opciones; las métricas no medidas se declaran. AC-5: el reporte de feedback (US-139) y DEC-14 figuran como «se miden en el piloto». *Descartadas:* exigir el feedback (11 pts más) y aplazar G-Demo al S6 (gate del PRD §14).

### D-6 · Estimaciones «propuestas» · barato · **Decidido** `[S5 resp. 4]`

US-250 = 2, US-253 = 5, US-254 = 5. *Descartado:* US-253 = 8 (con D-2 A son tres entidades con el mismo patrón).

### D-7 · US-004 sin «Cargar documento» · barato · **Decidido** `[S5 resp. 4]`

Con el OCR en Post-MVP, toda fila «Faltante» de la vista de caso ofrece solo la acción manual según `destination.entity` (`Biomarker` y `Diagnosis` → US-111; `ClinicalAttribute` y `PriorTreatment` → US-094). Resuelve el `Pendiente de definir` de AC-2. AC-4 muestra «Registro manual», «Corrección manual» o «Carga inicial», sin enlace a PDF. *Descartada:* el botón deshabilitado con «Disponible más adelante».

### D-8 · Vista de caso mínima sin US-089 ni US-212 · barato (consecuencia de D-1)

US-088 llena `priorTreatments`, `attributes` y `biomarkerSeries` del `CaseView` (campos obligatorios del contrato congelado) con lecturas simples ordenadas por línea y fecha, sin las reglas de US-089 (fuentes adicionales de US-099, PSA siempre serie). US-090 los muestra; la serie va en **tabla** (el gráfico llega con US-089), y AC-2 muestra «Documento» como origen sin enlace de descarga (US-212 es Post-MVP). *Descartadas:* traer US-089 (5 pts más, depende de US-099, que es OCR) y dejar esos campos vacíos (la vista no reconstruiría el caso).

### D-9 · US-071 verifica los avisos que existen al cierre del S5 · barato

Con US-101 y US-136 fuera del S5, US-071 verifica `datos_faltantes` y `poblacion_no_comparable` (y `datos_sin_verificar` solo si el fixture FX-T3-a lo produce con el código actual); `datos_en_conflicto` y `datos_sin_verificar` en la tarjeta llevan `🔗 Regresión [RN-26] → US-071` cuando lleguen. Es lo que ya dice su contexto técnico («verifica todos los avisos clínicos que existen al cierre del S5»). *Descartada:* traer US-101 (5 pts).

### D-10 · US-253 AC-5 sin US-251 · barato

AC-5 se verifica como «la huella del contexto clínico del paciente cambia tras la corrección y el aviso del análisis previo no bloquea»; la reutilización de un análisis guardado es de US-251 (S6). *Descartada:* adelantar US-251.

### Lo que no se reabre

D-01 (análisis de evidencia, no recomendaciones), RN-23, RN-24 (los hallazgos del análisis son memoria no citable en el seguimiento), ADR-47 / DEC-11, ADR-40 (PII: patrones e identidad exacta; nombres en notas con el aviso de US-253 AC-6).

## 4. Respuestas del usuario

- `[S5 resp. 1]` (2026-11-03) D-1: **vista de caso mínima** (US-088 + US-090).
- `[S5 resp. 2]` (2026-11-03) D-2: **fila nueva + `supersedes_id`** → ADR-50.
- `[S5 resp. 3]` (2026-11-03) D-3: comprometer **85 pts** (59 base + vista de caso mínima + US-140, US-116, US-070, US-093, US-071).
- `[S5 resp. 4]` (2026-11-03) D-4…D-7 aprobadas y variante **A** de S5-01 (corrección en línea con histórico desplegable).
- `[S5 resp. 5]` (2026-11-03, derivada de 1 y 3, aplicada por la sesión principal): G-Demo incluye la vista de caso mínima; D-8, D-9 y D-10 son consecuencias baratas de esas respuestas.

## 5. Stack técnico (fase 2)

| Necesidad | Estado (2026-11-03) |
|---|---|
| Docker | 29.9.2 ✓ |
| Ollama nativo (Metal) | ✓ con `gemma4:26b-a4b-it-qat`, `gemma4:26b-a4b-it-q4_K_M`, `qwen3.6:27b`, `bge-m3`, `qwen3-embedding:8b` (ADR-39 fase B) |
| Suite `evaluate` con modelos locales (US-120 AC-5/AC-6, US-249 AC-4, US-140, D4-21, D4-30) | Sin instalación nueva. **Una sola corrida nocturna** al cierre del día 2, con los barridos y las mediciones pendientes, para no ocupar la máquina en horario de trabajo ni recargar modelos |
| Dependencias de repo | Ninguna nueva prevista. Si US-253/US-094/US-111 piden el `Dialog` de shadcn/ui, se añade dentro de su change |
| Permisos | D5-03 hecho (escritura de `reports/eval/**`). `.env.example` (p. ej., `ANALYSIS_FOLLOWUP_MAX`) sigue siendo tarea humana `H-n` en un PR `chore` al inicio de la oleada (retro S4, M1) |

Nada que instalar en la máquina.

## 6. UI/UX (fase 3)

Diseño: [`docs/ux/S5/pantallas-s5.md`](../../docs/ux/S5/pantallas-s5.md).

- **S5-01 · Corregir un dato con su histórico** (riesgo de UX nuevo, 3 variantes): **A elegida** `[S5 resp. 4]`, corrección en línea en la ficha con histórico desplegable bajo la fila. B (panel lateral) descartada por componente y foco nuevos sin información adicional; C (página de historial) por ruta nueva y salir de la ficha.
- **S5-02 · Datos críticos con acción en la vista de caso**, **S5-03 · formularios de registro**, **S5-04 · hilo de seguimiento**, **S5-05 · vista de caso mínima**: un diseño cada uno; extienden las pantallas 06, 07 y 09 del Pre-S1.
- **Revisiones:** `clinical-language-auditor` (modo Diseño): **PASS**, 0 bloqueantes; aplicados 2 Mayores (citas solo del corpus y metadatos del catálogo en cada respuesta de seguimiento; «Completar diagnóstico a mano», AC-T3.2) y 5 Menores. Accesibilidad: criterios del sistema de diseño §4; el único patrón nuevo de foco son los diálogos. Contrato: cada dato tiene su campo o una tarea `## contratos` declarada (tabla al final del diseño).

## 7. Aplicado en este PR

- Decisiones en cada historia afectada (`Decidido (usuario, 2026-11-03)`), ADR-50 y su fila en el índice de ADR, filas S5/S6/Post-MVP del índice de Features y su nota.
- Linear: hitos y estimaciones de los movimientos de D-3 y D-4 (ARR-10 sin issue).
