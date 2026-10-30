# S4 · Refinamiento (fases 1 a 3)

> `/sprint-refine S4`, sesión principal, 2026-10-29.
> Entradas:
> - [`S3-cierre.md`](S3-cierre.md) §9: decisiones del usuario tras la Demo 3.
> - [`S3-demo-outcomes.md`](../../docs/evidence/S3-demo3/S3-demo-outcomes.md): OUT-01 a OUT-09.
> - [`S3-demo-cierre.md`](../../docs/evidence/S3-demo3/S3-demo-cierre.md) §4: respuestas clínicas F-20 a F-24.
> - [`S4-insumo-extraccion-poblacion.md`](../../docs/evidence/S3-demo3/S4-insumo-extraccion-poblacion.md).
> - [`S3-deuda.md`](S3-deuda.md).
>
> **Markdown = fuente.** Linear se actualiza después, con confirmación (§7). Las respuestas se citan en las historias como `[S4 resp. n]`.

## 1. Alcance comprometido: 61 pts, 18 tarjetas

Según el orden de prioridad del usuario (RAG de conocimiento → búsqueda por los datos del paciente → OCR → gestión de usuarios), el S4 compromete el núcleo del RAG de conocimiento, la etapa 2 de la población del estudio y los faltantes. **Riesgo aceptado por el usuario** `[S4 resp. 1]`: 61 pts en 1–2 días frente a la meta de cierre ≥ 80 %. Si no alcanza, se recorta de menor a mayor prioridad. El primer recorte serían los faltantes (US-003, US-005), seguidos de US-238.

| Orden | ID (Linear) | Título corto | Feature | Pts | AC | Prioridad |
|---|---|---|---|---|---|---|
| 0 | US-117b (L1D-302) | Archivo del change (hecho en el PR #218) | FEAT-06c | 0 | 2 | — |
| 1 | US-021 · DEC-11 (L1D-125) | Semántica de la lista de población; firma en la sesión de oncólogos | FEAT-08b | 1 | 6 | 1 |
| 2 | US-240 (L1D-290) | *Spike* de capacidad y paralelismo (no se mergea) | FEAT-06c | 2 | 6 | 1 |
| 3 | US-241 (L1D-291) | Contrato aditivo + migración Alembic 0005 | FEAT-08b | 3 | 6 | 1 |
| 4 | US-242 (L1D-292) | Extractor en abanico en la ingesta | FEAT-06c | 5 | 8 | 1 |
| 5 | US-243 (L1D-293) | Dominio de estados con listas (TDD estricto) | FEAT-08b | 5 | 8 | 1 |
| 6 | US-244 (L1D-294) | Respaldo corto en la consulta, sin 503 (OUT-06) | FEAT-08b | 3 | 7 | 1 |
| 7 | US-245 (L1D-295) | Afirmaciones atómicas + `lenguaje_no_permitido` (OUT-08) | FEAT-T1a | 5 | 8 | 1 |
| 8 | US-246 (L1D-296) | La UI separa los motivos de descarte (OUT-08) | FEAT-10a | 2 | 5 | 1 |
| 9 | US-134 (L1D-144) | Hasta 3 opciones; excedente en `analysisBasis.optionsNotShown` | FEAT-10c | 5 | 8 | 1 |
| 10 | US-126 (L1D-131) | Tabla de aplicabilidad con varios valores | FEAT-08b | 5 | 10 ⚠ | 1 |
| 11 | US-135 (L1D-145) | Panel con hasta 3 tarjetas | FEAT-10c | 3 | 7 | 1 |
| 12 | US-238 (L1D-300) | Segundo loop de reescritura (RN-02 enmendado) | FEAT-06b | 5 | 9 ⚠ | 1 |
| 13 | US-233a (L1D-298) | Suite `evaluate` local + RSS/latencia del NLI + arrastres | FEAT-T5a | 3 | 7 | 1 |
| 14 | US-233b (L1D-299) | Conjunto dorado de población + suite por criterio | FEAT-T5a | 3 | 8 | 1 |
| 15 | US-247 (L1D-297) | Datos de demo (Coincide, Parcial y No coincide) + `levantar.sh` | FEAT-06c | 5 | 8 | 1 |
| 16 | US-003 (L1D-95) | `/completeness` recortado | FEAT-04 | 3 | 5 | 2 |
| 17 | US-005 (L1D-97) | Aviso de faltantes en el panel, con enlace a la ficha | FEAT-04 | 3 | 7 | 2 |

⚠ = excepción aceptada a la DoR (más de 8 AC), justificada en la historia `[S4 resp. 12]` `[S4 resp. 13]`. El «orden» es una sugerencia de dependencias para `/sprint-start`, no el plan de oleadas.

**Dependencias clave:**
- US-240 → valores por defecto de US-242.
- US-241 → US-242, US-243, US-244 y US-126.
- US-243 → US-126, US-134 y US-247.
- US-245 → US-246.
- US-134 → US-135.
- US-242 → US-247 y US-233b.

## 2. Definition of Ready

| L1D | US | Criterio que fallaba | Resolución |
|---|---|---|---|
| L1D-144 | US-134 | Decisiones: `Pendiente de definir` del AC-3 | El excedente se declara en la Base `[S4 resp. 7]`. El Contexto técnico ya no dice que el contrato no cambia |
| L1D-145 | US-135 | Dependencias: US-126 no estaba en el sprint · Diseño: sin `docs/ux/S4/` | US-126 entra `[S4 resp. 6a]` · `docs/ux/S4/pantallas-s4.md` (§6) |
| L1D-131 | US-126 | Tamaño: 10 AC | Excepción justificada `[S4 resp. 13]` |
| — | US-238 | Tamaño: 9 AC · Dependencias: enmienda a RN-02 sin aplicar | Excepción `[S4 resp. 12]` · enmienda aplicada en el PRD (RN-02, E-14) |
| — | US-233 | Tamaño: 9 AC y unas 12 tareas arrastradas para 3 pts | Partida en US-233a y US-233b `[S4 resp. 6b]`. AC-3 y AC-8 → US-120 (S5). US-233 queda como lápida |
| — | US-117b | Ninguno (hecha) | 0 pts, solo conciliar y archivar `[S4 resp. 10]` |
| L1D-95 | US-003 | Decisiones: AC-6 pendiente · Dependencias ocultas: AC-2 (`/case`) y AC-7 (auditoría) | AC-6 = `200` con `items = []` y `cancerTypeEnabled = false` · AC-2 (parte `/case`) → US-088 (S5) · AC-7 → US-102 (S6) `[S4 resp. 6c]` |
| L1D-97 | US-005 | Dependencias ocultas: el AC-3 va a la vista de caso (S5) | Enlace a la sección existente de la ficha `[S4 resp. 6d]` `[S4 resp. 14]` |
| — | US-240…US-247 | Nuevas | Escritas con AC Given/When/Then y su tipo de test según la matriz TDD de `CLAUDE.md` |

**Resultado:** las 18 tarjetas cumplen la DoR, con dos excepciones de tamaño aceptadas. Quedan supuestos marcados `(asumido)` que se validan en la sesión de oncólogos sin bloquear (§5).

## 3. Decisiones y ADRs

| Decisión | Registro | Estado |
|---|---|---|
| **ADR-47.** La población del estudio se extrae en la ingesta, en abanico por documento y criterio, como lista acotada por fragmento citado; consulta determinista con respaldo que degrada; contrato aditivo. 3 propuestas: A elegida; B (un valor por documento) y C (abanico en la consulta) descartadas | [`docs/architecture/adr/ADR-47-extraccion-poblacion-en-abanico.md`](../../docs/architecture/adr/ADR-47-extraccion-poblacion-en-abanico.md) | aceptado `[S4 resp. 3]` `[S4 resp. 5]` |
| **DEC-11.** F-20…F-24 como escenario aceptado: inclusiva o mezclada → Parcial; No coincide solo con restricción explícita; conflicto → Desconocido con `valores_en_conflicto` | [`docs/decisions/DEC-11-aplicabilidad-lista-de-poblacion.md`](../../docs/decisions/DEC-11-aplicabilidad-lista-de-poblacion.md) | decidida; firma pendiente `[S4 resp. 8]` `[S4 resp. 9]` |
| **Enmienda a RN-02** (segundo loop de reescritura, decidida el 2026-10-23) | `docs/PRD.md` RN-02 y §0 E-14 | aplicada `[S4 resp. 12]` |
| **Refinamiento del S4 en el PRD** | `docs/PRD.md` §0 E-15 y nota de §14 | aplicada |
| Regla de OUT-08 (afirmaciones atómicas, roles, omitir secundarias) | US-245 | decidida; validación clínica pendiente `[S4 resp. 2]` |

## 4. Respuestas del usuario (2026-10-29)

1. **Alcance:** núcleo con faltantes más la etapa 2 completa, unos 50 pts de partida (61 al final), aceptando el riesgo frente al ≥ 80 %. Recorte de menor a mayor prioridad. «Búsqueda basada en la información médica del paciente» = faltantes y aplicabilidad dirigida por los datos del caso, no búsqueda de pacientes.
2. **OUT-08:** afirmaciones atómicas. El LLM escribe oraciones declarativas y el código añade el marco de atribución. La opción se conserva si su afirmación principal tiene soporte; una secundaria sin soporte se omite y cuenta en `omittedClaims`; una salvedad sin soporte descarta la opción.
3. **Población:** etapa 2 completa en el S4 (ADR-47, opción A).
4. **Linear:** liberar cupo y crear los issues (§7).
5. **Contrato aditivo** (ADR-26): `studyPopulationValues[]` y nuevos `unknownReason`; `studyPopulationValue` deprecado un sprint.
6. **Ajustes de DoR:**
   - (a) entra US-126;
   - (b) US-233 se parte en 233a y 233b;
   - (c) US-003 recortada;
   - (d) US-005 enlaza a la ficha.
7. **US-134 AC-3:** el excedente sobre el tope de 3 se declara en la Base, sin su contenido.
8. **DEC-11:** F-20…F-24 como escenario aceptado; firma en la sesión de oncólogos del S4.
9. **Conflicto (F-23):** Desconocido con `valores_en_conflicto` y ambos valores visibles; se respetan los 4 estados de RN-28.
10. **US-117b:** hecha; 0 pts, solo archivar.
11. **Campos aditivos que pide el diseño** (`partialReason`, `discardReason = lenguaje_no_permitido`, `analysisBasis.optionsNotShown`): decisión de diseño de la sesión principal. **A confirmar por el usuario en la revisión del PR.**
12. **US-238** se compromete en el S4 (con su excepción a la DoR).
13. **US-126** se queda en 5 pts y 10 AC como excepción justificada. «Ver más» revela el resto de valores sin pedir nada nuevo al backend.
14. **El enlace del faltante** va a la sección ya existente de la ficha (`#diagnostico` o `#biomarcadores`, con foco). Si el dato no tiene sección, va al encabezado principal.
15. **Diseño S4-01:** variante A, tarjetas apiladas (§6).
16. **Cobertura de la Demo 3:** los huecos que encontró la auditoría se cierran en documentos formales (§9). Los tres documentos temporales se conservan como evidencia en `docs/evidence/S3-demo3/`. En las historias se cita como `[S4 resp. 15]`.

## 5. Cambios de slicing aprobados

Aplicados en `backlog/features/` (cada Feature con su fila en `## Conflictos de fuentes`), en `backlog/features/README.md` y en el PRD (E-15):

- **Del S4 al S5:**
  - US-088, US-089, US-090, US-092 y US-093 (vista de caso);
  - US-098;
  - US-107, US-108, US-110 y US-111 (revisión y registro manual);
  - US-004, US-101, US-070, US-131, US-140, US-218, US-219 y US-120;
  - DEC-01 (L1D-92), DEC-06, DEC-07, DEC-08 y DEC-09.
- **Del S4 al S6:** US-056, US-057, US-239 y US-047.
- **Totales:**

  | Alcance | Pts |
  |---|---|
  | S4 | **61** |
  | S5 | **168** |
  | S6 | **102** |
  | MVP comprometido | 602 |

  El S5 queda **sobrecargado**: su refinamiento debe recortar según la prioridad (gestión de usuarios → OCR → …) y llevar lo que sobre a `V2-Post-MVP.md`.
- **G-Piloto (S6):** no se sacó del camino crítico ninguna historia suya. US-047 (alta manual de pacientes) pasa al S6, el mismo sprint del gate.
- **Fuera de `features/`:** ARR-05 (L1D-281, baseline VM-1/VM-2 con los oncólogos) vive en `S2-arrastre.md` y su milestone de Linear es Sprint 4. Propuesta: pasarlo al Sprint 5 en Linear (§7).

**Pendientes de la sesión de oncólogos del S4** (no bloquean; quedan como `(asumido)` en las historias):
- firma de DEC-11;
- la regla de OUT-08 (qué es «lo esencial»);
- cómo se reconoce una «restricción explícita»;
- «conflicto en la misma cohorte» frente a «cohortes distintas»;
- `solo_subgrupo`, que choca con US-122 AC-4 y se mantiene en la forma antigua hasta el S5.
- F-19: validar la redacción de los textos de «Desconocido».
- F-23: si consta en el fragmento, mostrar con los valores en conflicto la fecha y el tamaño de muestra (`(asumido)` en US-126 AC-9).

## 6. UI/UX (fase 3)

- **Diseño:** [`docs/ux/S4/pantallas-s4.md`](../../docs/ux/S4/pantallas-s4.md).
  - **S4-01**, hasta 3 opciones con su tabla de aplicabilidad. Tiene riesgo de UX nuevo, así que se diseñaron 3 variantes: **A tarjetas apiladas (elegida por el usuario)**, B matriz comparativa y C pestañas.
  - **S4-02** (motivo del descarte) y **S4-03** (faltantes antes de analizar): un solo diseño, porque extienden patrones existentes.
- **`clinical-language-auditor` (modo Diseño):** FAIL condicionado, con 0 violaciones literales de RN-23 y 8 Mayores, todos aplicados. A es compatible; B se lee como ranking y C da primacía a la Opción 1. El H-01 corrigió también el ADR-47: solo se citan fragmentos recuperados en la consulta.
- **Accesibilidad WCAG 2.1 AA:** A aprueba con correcciones (reflow por *container query* a 320 px, ⚑ con texto oculto, citas [n] con nombre accesible, desplegables con contexto), todas aplicadas. B y C no recomendadas.
- **Contrato:** cinco campos que pide el diseño no existen hoy. Se añaden de forma aditiva en US-241, US-134 y US-245 `[S4 resp. 11]`. El endpoint `/completeness` no está en el OpenAPI de `clinical-api`; lo añade US-003.
- **Desfases que alinean las historias de UI** (no se editaron aquí):
  - `sistema-de-diseno.md` l. 95 y `S1/pantallas-s1.md` l. 19 todavía sitúan el criterio de aplicabilidad en el «S5».
  - El diálogo «Cargar información / Continuar con aviso» de `flujo-e2e.md` lo sustituye el bloque de S4-03.

## 7. Stack (fase 2) y Linear

**Máquina:** no hay que instalar nada.
- Ollama, con `gemma4:26b-a4b-it-q4_K_M` (17 GB) y `bge-m3`, Docker 29.9.2, `gh` y `openspec`.
- Ollama está parado: se levanta con `ollama serve`. US-240 lo levanta con `OLLAMA_NUM_PARALLEL=1/2/4 ollama serve`, que hoy no está fijado.
- Las dependencias del repo van dentro de cada change.

**Linear (pendiente, con confirmación antes de cada escritura)** `[S4 resp. 4]`:
1. ✅ **Cupo:** no hizo falta liberar. Los 12 issues se crearon sin llegar al límite, así que no se archivó nada (la MCP de Linear tampoco permite archivar).
2. ✅ **Hecho (2026-10-29):** 12 issues creados en `OncoLens-1`, milestone Sprint 4: L1D-290…L1D-300 (US-240…US-247, US-233a, US-233b, US-238) y L1D-302 (US-117b, In Review y sin estimar, porque el equipo no admite estimación 0). Cada `L1D-nn` está anotado en su `> Linear:`.
3. ✅ **Milestones conciliados (2026-10-29):**
   - **→ Sprint 5:**
     - OCR: L1D-6, 7, 58, 59, 62–68.
     - Vista de caso: L1D-10, 74, 75, 76, 78, 79.
     - Normalización: L1D-12, 84.
     - Revisión y registro manual: L1D-13, 87, 88, 90, 91.
     - Sueltas: L1D-96, 24, 142, 195, 243, 246, 268, 269, 119.
     - Decisiones: L1D-92 (DEC-01), 233 (DEC-06), 234 (DEC-07), 174 (DEC-08), 73 (DEC-09).
     - ARR-05: L1D-281.
   - **→ Sprint 6:** L1D-107, 108, 289, 201.
   - **→ Sprint 4:** L1D-25 (FEAT-10c).
   - **Sin cambio:** L1D-286 sigue en Sprint 4.
4. ✅ **Comprometidas actualizadas:** L1D-95, 97, 125, 131, 144 y 145 llevan al final un bloque «Refinamiento del S4» con sus decisiones. Se quitaron las etiquetas `needs-refinement` (L1D-95, 144, 145) y `refinar-en-planning` (L1D-125).

## 8. Cambios aplicados en este PR (aprobados)

- **`CLAUDE.md`:** el texto de RN-02 recoge el segundo loop (E-14) y el párrafo del Roadmap refleja el refinamiento del S4 (E-15). Como los subagentes leen `CLAUDE.md` del disco, `/sprint-start S4` debe correr en una **sesión nueva** tras el merge.
- **Cierre de la Demo 3:** la rama temporal `docs/s3-demo3-cierre` no lleva PR propio. Sus dos commits van en este PR. Los tres documentos temporales se movieron a [`docs/evidence/S3-demo3/`](../../docs/evidence/S3-demo3/), donde se conservan como **evidencia** de solo lectura: las mediciones, los datos brutos de OUT-01…OUT-09 y las respuestas F-01…F-24. Lo accionable de esos documentos tiene ya destino formal (§9).
- **`CLAUDE.md` y `docs/process/definition-of-done.md`:** recogen el ritmo y el presupuesto de S4–S6 y la definición de «cerrado» para la meta ≥ 80 % (S3-cierre §9.1 y §9.3).

## 9. Cobertura de los documentos de la Demo 3 (auditoría, 2026-10-29) `[S4 resp. 15]`

Se auditó todo lo accionable de `S3-demo-outcomes.md`, `S3-demo-cierre.md`, `S4-insumo-extraccion-poblacion.md`, `S3-cierre.md` §9 y `guia-demo-S3.md` §8. Este es su destino formal:

| Origen | Destino formal |
|---|---|
| OUT-02, OUT-03, OUT-04, OUT-05 (incluidos Attu y las notas del runbook), OUT-07 | US-247 (L1D-297) |
| OUT-06 | US-244 (L1D-294), US-242 (L1D-292), ADR-47 (decisión, riesgos y evidencia), US-240 (L1D-290) y US-233a (L1D-298) para la memoria. Nota sobre el tope por llamada del agente en FEAT-08c (Post-MVP) |
| OUT-08 | US-245 (L1D-295) y US-246 (L1D-296). Las soluciones 3 y 4 (contexto del fragmento para el NLI, NLI más fuerte) quedan como nota en US-120 (L1D-119, S5) |
| OUT-01 y OUT-09 (admin y aviso de `403`) | AC nuevos en US-222 (L1D-272, S6), que además cierra la deuda `WEB_HOME_PATH` de US-211 |
| F-20…F-24 | DEC-11, US-243 (L1D-293) y US-126 (L1D-131). F-19 y F-23 (fecha y muestra) van a la sesión de oncólogos (§5) |
| F-06 | Descartado por el usuario (sin outcome) |
| F-15 (p95) | US-141 (si hay capacidad) y la recalibración del NFR en el S5 |
| Insumo: §2–§8, §10 y R1…R18 | ADR-47 (riesgos ADR47-R1…R18 copiados) y US-240…US-244 y US-233b. La etapa 1 «puente» y el contrato con versión mayor quedan descartados (resp. 3 y 5) |
| Insumo: candidatas del S5 y S6 | US-126 (varios valores en la UI), US-242 AC-7 (reindexación por versión), US-247 (`levantar.sh`). En `V2-Post-MVP.md`: herramienta de revisión humana a escala, métricas de deriva y runbook de reindexación, extracción doble |
| S3-cierre §9.1 (≥ 80 %, definición de «cerrado») | PRD E-15, `CLAUDE.md` (Dinámica por sprint) y `docs/process/definition-of-done.md` |
| S3-cierre §9.2 (prioridad, demos sintéticas) | PRD E-15, `CLAUDE.md` (Roadmap), `backlog/features/README.md` |
| S3-cierre §9.3 (1–2 días por sprint, Max 100 USD) | `CLAUDE.md` (Dinámica por sprint) |
| S3-cierre §9.4.3 y §9.4.4 (no abrir historias a mitad de sprint, un solo orquestador a la vez, medir el consumo por sprint) | **Propuestas sin aprobar**: siguen en `S3-cierre.md` §9.4 hasta que el usuario las apruebe |
| Pregunta de privacidad (iniciales y 2 dígitos del documento en el listado) | `S3-deuda.md`: decisión del usuario antes del piloto (G-Piloto, S6) |
