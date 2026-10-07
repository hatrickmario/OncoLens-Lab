# FEAT-T5c — Feedback al cerrar cada análisis: la validación clínica del MVP

> Linear: [L1D-48](https://linear.app/l1der-lab-mjbc/issue/L1D-48)

**Talla:** L (3 historias de desarrollo + 1 DEC; atraviesa `web` y `clinical-api`) · **Sprint:** 5 (→ G-Demo, datos sintéticos; sigue activo en el piloto) · **Capacidad:** T-5 (valor clínico: VM-3, VM-4, VM-5) · **Recorrido principal:** sí (es la validación clínica del sistema según P-03: reemplaza la firma formal de los catálogos de datos críticos y de aplicabilidad)
**Requisitos:** FR-20 (medición de VM-4 y VM-5; dueña de `AnalysisFeedback` vía HU-25) · M-08.1 (VM-3, mixto, vía DEC-14) · validación de DEC-01 y DEC-11 por feedback agregado (P-03) · RN-22 (umbrales y tamaño mínimo de muestra en configuración)
**Evidencia:** [→ PRD §2.2 VM-3, VM-4, VM-5], [→ PRD §5 FR-20], [→ PRD §14 S4 ("feedback VM-4")], [→ PRD §18.3.8 M-08.1], [→ PRD §18.4 AC-T5.3], [→ readme §5 HU-25 ("Escala 1–5; si el aviso de faltantes fue correcto y si fue útil (dos campos); opcional; sin texto libre")], [→ readme §3.1 `ANALYSIS_FEEDBACK`], [→ readme §3.2 `AnalysisFeedback` ("Sin texto libre, para no capturar PHI")], [→ readme §4.1 `POST /platform/evidence-analyses/{id}/feedback`], [→ backlog/01-requisitos.md §15 P-03], [→ backlog/02-adrs.md US-024 · DEC-14, Resoluciones P-03], [→ backlog/features/FEAT-00 US-008 · DEC-02 (AC-4, AC-5)]
**Dependencias:** ↪ US-053 (análisis persistido), US-061 (panel), FEAT-04 US-005 (aviso previo de faltantes), FEAT-04 US-006 (`missing_critical_data` persistido), US-045 (permisos RBAC) · ⛔ DEC-02 (US-008) · escenario más probable (umbrales de VM-4/VM-5 y muestra mínima) · 🔗 Produce para: US-154 (VM-4 y VM-5 en el piloto, FEAT-T5d), DEC-01 y US-021 · DEC-11 (validación por feedback agregado), US-142 (verificación de G-Demo) · 🔗 Regresión [RN-23] → US-068 (textos nuevos) · 🔗 Regresión [RN-10] → US-046 (sin identidad en el feedback)
**Valor:** la hipótesis no se valida solo con métricas técnicas: el oncólogo tiene que decir, análisis a análisis, si le sirvió y si el aviso de faltantes acertó. Con un clic al cerrar cada análisis, el producto acumula la validación clínica de los catálogos y el número que exige G-Éxito, sin capturar texto libre que pueda contener datos del paciente.
**Stories:** US-137, US-138, US-139, US-024 · DEC-14 (12 puntos, S5)

## Fixtures

- **FX-T5c-a · Análisis calificados** (sembrados en la BD de test de `clinical-api`; todos `data_origin = sintetico`, catálogo de datos críticos `test-1.0.0` y de aplicabilidad `test-apl-1.0.0`):
  - 10 `AIAnalysisRecord` de tipo análisis de evidencia (`AN-01`…`AN-10`) de `doc1@test.local` y `doc2@test.local` sobre los pacientes semilla (a) y (b); `AN-01`…`AN-06` con `missing_critical_data` no vacío; `AN-07`…`AN-10` con `missing_critical_data = []`.
  - 8 `AnalysisFeedback` (`AN-01`…`AN-08`): `usefulness_rating` = 5, 4, 4, 3, 5, 2, 4, 4.
  - Checkboxes de VM-5 en `AN-01`…`AN-05` (correcto / útil): (sí/sí), (sí/no), (sí/sí), (no/no), (sí/sí); `AN-06` calificado sin checkboxes (`null`/`null`); `AN-07`, `AN-08` sin aviso de faltantes (`null`/`null`).
  - **Resultados esperados:** tasa de respuesta 8/10 = 80 % · VM-4 = 6/8 = 75 % con calificación ≥ 4 · VM-5 (denominador: 5 análisis con aviso y checkboxes respondidos) correcto 4/5 = 80 %, útil 3/5 = 60 %, correcto **y** útil 3/5 = 60 %.
  - Configuración de test: `VM4_TARGET = 0.70`, `VM5_TARGET = 0.80`, `FEEDBACK_MIN_RATED = 5` (valores del escenario de DEC-02; viven en configuración, RN-22).

---

## US-137 — `POST /platform/evidence-analyses/{id}/feedback` guarda la calificación 1–5 y los dos checkboxes de faltantes, sin texto libre

> Linear: [L1D-249](https://linear.app/l1der-lab-mjbc/issue/L1D-249)

`FEAT-T5c` · Sprint 5 · Estimación **5** · HU-25 · FR-20 (VM-4, VM-5), FR-01 (RBAC) · AC-T5.3 (parte: medición separada por cohorte) · ↪ US-053, FEAT-04 US-006, US-045 · ⛔ DEC-02 (US-008) · escenario más probable · 🔗 Produce para: US-139, FEAT-T5d · 🔗 Regresión [RN-10] → US-046

## Story
Como oncólogo, quiero calificar en un clic la utilidad de cada análisis y decir si el
aviso de datos faltantes fue correcto y útil, para que mi juicio clínico quede registrado
como validación del sistema sin tener que escribir nada.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local` y su análisis `AN-09` persistido con
  `missing_critical_data` no vacío, cuando envía
  `POST /platform/evidence-analyses/{AN-09}/feedback` con `usefulnessRating = 4`,
  `missingDataWarningCorrect = true` y `missingDataWarningUseful = false`, entonces
  responde `201` y existe una fila en `analysis_feedback` con `analysis_id`, `user_id`
  de `doc1`, esos tres valores y `created_at`. `[HU-25]` `[VM-4]` `[VM-5]` `[readme §4.1]`
- **AC-2 (borde · fuera de escala)** · Dado el mismo análisis, cuando
  `usefulnessRating` es `0`, `6` o `3.5`, entonces responde `422` y no se crea ninguna
  fila. `[HU-25]` `[VM-4]`
- **AC-3 (invariante · sin texto libre)** · Dado un cuerpo válido con un campo extra
  `comment = "paciente Lucía con dolor"`, cuando se envía, entonces responde `422` (esquema
  Zod estricto), no se crea ninguna fila y el texto no aparece en *logs*.
  `[readme §3.2]` `[HU-25]` `[RN-10]`
- **AC-4 (borde · sin sesión)** · Dada una petición sin cookie de sesión válida, cuando se
  envía, entonces responde `401` y no se crea ninguna fila. `[FR-01]`
- **AC-5 (borde · checkboxes sin aviso)** · Dado `AN-10` con
  `missing_critical_data = []`, cuando se envía `usefulnessRating = 5` con
  `missingDataWarningCorrect = true`, entonces responde `422`; y con solo
  `usefulnessRating = 5` responde `201` con ambos campos `null`. (asumido: VM-5 solo
  tiene sentido cuando hubo aviso de faltantes)
- **AC-6 (borde · análisis inexistente)** · Dado un `id` que no existe o que es un
  resumen del caso (`analysis_type = resumen_caso`), cuando se envía, entonces responde
  `404` y no se crea ninguna fila. (asumido)
- **AC-7 (borde · segunda calificación)** · Dado que `doc1` ya calificó `AN-09`, cuando
  envía otra calificación, entonces responde `409` y la fila original no cambia.
  (asumido)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-7): ¿el oncólogo puede corregir su calificación (la última reemplaza a la anterior) o la primera es definitiva? ¿Cuentan las calificaciones de otros miembros del equipo sobre el mismo análisis como respuestas independientes de VM-4?

## Contexto técnico
Módulo `feedback` de `clinical-api` (readme §2.3): `FeedbackController → FeedbackService
→ FeedbackRepository`, esquema Zod `.strict()` con `usefulnessRating` entero 1–5
(obligatorio) y los dos booleanos opcionales. La tabla `analysis_feedback` ya existe
desde la migración inicial (US-038). Permiso RBAC `ai_analysis:feedback` solo para el rol
`doctor` (US-045). Sin auditoría propia: FR-18 no lista el feedback. **No** aplica el
`403` por opt-out de `analisis_ia` (no genera texto con IA; lo verifica US-148) ni el
*rate limit* de RN-30 (no es una generación). Tests: Supertest con SQL crudo sobre
`clinical.analysis_feedback` (AC-1…AC-7) y búsqueda del texto sembrado en los *logs*
capturados (AC-3).

## INVEST
**Small** ✓ un endpoint con validación estricta sobre una tabla existente.
**Testable** ✓ siete tests de integración.

---

## US-138 — Al cerrar cada análisis el panel ofrece la calificación 1–5 y, si hubo aviso de faltantes, los dos checkboxes, sin bloquear nada

> Linear: [L1D-250](https://linear.app/l1der-lab-mjbc/issue/L1D-250)

`FEAT-T5c` · Sprint 5 · Estimación **3** · HU-25 · FR-20 (VM-4, VM-5), NFR-12 · ↪ US-137, US-061, FEAT-04 US-005 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-26] → US-071

## Story
Como oncólogo, quiero calificar el análisis con un clic al terminar de leerlo y marcar
si el aviso de faltantes acertó, para dejar mi valoración sin interrumpir mi trabajo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un análisis completo en Playwright contra Compose (perfil
  de test, paciente con faltantes de FEAT-04), cuando el doctor pulsa "4" en "¿Qué tan
  útil fue este análisis?", entonces se envía un único `POST …/feedback` con
  `usefulnessRating = 4`, el control muestra "Calificación guardada" y queda
  deshabilitado. `[HU-25]` `[VM-4]`
- **AC-2 (borde · checkboxes condicionales)** · Dado un análisis que mostró el aviso de
  faltantes, cuando se renderiza el bloque de feedback, entonces aparecen "El aviso de
  datos faltantes fue correcto" y "El aviso de datos faltantes fue útil"; y dado un
  análisis sin faltantes, no aparecen. `[VM-5]` `[HU-25]`
- **AC-3 (invariante · sin texto libre)** · Dado el bloque de feedback, cuando se
  inspecciona el DOM, entonces no contiene ningún `textarea` ni `input` de texto.
  `[readme §3.2]` `[HU-25]`
- **AC-4 (borde · opcional, no bloquea)** · Dado un análisis sin calificar, cuando el
  doctor lanza otro análisis o sale del panel, entonces la navegación ocurre sin diálogo
  obligatorio y no se envía ningún feedback. `[VM-4]` `[HU-25]`
- **AC-5 (borde · fallo al guardar)** · Dado `clinical-api` respondiendo `500` al
  feedback, cuando el doctor califica, entonces ve "No se pudo guardar la calificación"
  con opción de reintentar y el análisis sigue visible. (asumido)
- **AC-6 (borde · accesibilidad)** · Dado el bloque de feedback, cuando se navega con
  teclado, entonces la escala es un grupo de radio con `label` por valor y se puede
  elegir con flechas y Enter. `[NFR-12]`

## Contexto técnico
Organismo `AnalysisFeedback` en el panel de análisis (`web`), debajo de la Base del
análisis; la condición de los checkboxes es `missingCriticalData.length > 0` en la
respuesta. La llamada pasa por un Route Handler de `web` (`app/api/evidence-analyses/[id]/feedback/route.ts`)
con verificación de `Origin`. "Al cerrar cada análisis" (P-03) se implementa como
invitación visible y opcional, no como paso obligatorio (VM-4: "opcional y en un clic").
Tests: Playwright contra Compose en perfil de test (AC-1, AC-2, AC-4, AC-6) y Vitest +
Testing Library (AC-3, AC-5).

## INVEST
**Small** ✓ un organismo de UI y un Route Handler.
**Testable** ✓ seis tests E2E y de componente.

---

## US-139 — El reporte de feedback agrega VM-4 y VM-5 por cohorte y por versión de catálogo y dice si el catálogo queda validado

> Linear: [L1D-251](https://linear.app/l1der-lab-mjbc/issue/L1D-251)

`FEAT-T5c` · Sprint 5 · Estimación **3** · — (técnica, PRD §17; HU-25) · FR-20, RN-22 · AC-T5.3 · VM-4, VM-5 · validación de DEC-01 y DEC-11 (P-03) · ↪ US-137 · ⛔ DEC-02 (US-008) · escenario más probable (muestra mínima; metas y regla por catálogo fijadas por §15 resp. 5) · 🔗 Produce para: US-142 (G-Demo), FEAT-T5d (piloto), DEC-01, US-021 · DEC-11

## Story
Como product owner, quiero un reporte que agregue las calificaciones por cohorte y por
versión de catálogo y diga si se alcanzó el umbral acordado, para saber con datos si el
catálogo de datos críticos y el de aplicabilidad están validados por los oncólogos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-T5c-a con `VM4_TARGET = 0,70` y `VM5_TARGET = 0,80`,
  y la regla de validación por catálogo (aplicabilidad ← VM-4: proporción de análisis
  con calificación ≥ 4; datos críticos ← VM-5: proporción "correcto y útil"), cuando se
  ejecuta `oncolens feedback report --from 2026-01-01 --to 2026-12-31`, entonces el
  reporte JSON trae, para la cohorte `sintetico`: tasa de respuesta 0,80; VM-4 0,75
  ("en meta"); VM-5 correcto 0,80, útil 0,60, correcto y útil 0,60 ("fuera de meta"); y
  por catálogo: `test-1.0.0` (datos críticos) "no validado" y `test-apl-1.0.0`
  (aplicabilidad) "validado". `[VM-4]` `[VM-5]` `[P-03]` `[§15 resp. 5]`
- **AC-2 (borde · muestra insuficiente)** · Dado `FEEDBACK_MIN_RATED = 9`, cuando se
  genera el reporte sobre FX-T5c-a, entonces ambos catálogos quedan
  "muestra_insuficiente" y ninguno "validado". `[RN-22]` `[DEC-02]`
- **AC-3 (borde · cohortes separadas)** · Dados (en test unitario del agregador) 4
  calificaciones `sintetico` y 4 `real_anonimizado`, cuando se agrega, entonces el
  reporte trae dos bloques separados y ninguna métrica mezcla ambas cohortes.
  `[AC-T5.3]` `[DEC-02]`
- **AC-4 (borde · denominador de VM-5)** · Dado FX-T5c-a, cuando se calcula VM-5,
  entonces el denominador es 5: excluye los análisis sin aviso de faltantes (`AN-07`,
  `AN-08`) y el calificado sin checkboxes (`AN-06`). `[VM-5]` (asumido en la exclusión de
  `AN-06`)
- **AC-5 (invariante · sin identificadores)** · Dado el reporte del AC-1, cuando se
  inspecciona, entonces no contiene `patient_id`, identidad, correos de usuarios ni
  identificadores de análisis, solo conteos y proporciones. `[RN-10]` (asumido en
  correos e identificadores de análisis)
- **AC-6 (borde · versión nueva de catálogo)** · Dadas calificaciones sobre
  `test-1.0.0` y una versión `test-1.1.0` sin calificaciones, cuando se genera el
  reporte, entonces `test-1.1.0` aparece "muestra_insuficiente" y no hereda el estado de
  la versión anterior. (asumido)

## Contexto técnico
Comando `oncolens feedback report` en `clinical-api` (mismo binario de CLI que US-045),
de solo lectura: une `analysis_feedback` con `ai_analysis_record` (`catalog_version`,
`missing_critical_data`, `data_classification`). Umbrales y muestra mínima de
configuración `[RN-22]`: `VM4_TARGET = 0,70` y `VM5_TARGET = 0,80` (respuesta 5 del
usuario, `01-requisitos.md` §15) y `FEEDBACK_MIN_RATED` con el valor de DEC-02. El
catálogo de aplicabilidad se valida solo con VM-4 y el de datos críticos solo con VM-5
"correcto y útil"; por debajo de la muestra mínima, `muestra_insuficiente`. El reporte se adjunta a la verificación de G-Demo (US-142) y lo
consume FEAT-T5d en el piloto. Tests: Vitest del agregador (AC-3, AC-4, AC-6) y test de
integración del comando contra la BD de test sembrada con FX-T5c-a (AC-1, AC-2, AC-5).

## INVEST
**Small** ✓ una consulta de agregación y un formateador.
**Testable** ✓ seis tests con resultados exactos del fixture.

---

## US-024 · DEC-14 — Revisión clínica de la muestra de aplicabilidad (VM-3)

> Linear: [L1D-252](https://linear.app/l1der-lab-mjbc/issue/L1D-252)

`FEAT-T5c` · Sprint 5 · Estimación **1** · — (decisión) · M-08.1 (mixto) · VM-3 · Dueño: oncólogo asesor · ⛔ Bloqueada por: DEC-02 (US-008, tamaño de muestra y número de revisores), US-126 (tablas de aplicabilidad generadas) · 🔗 Bloquea: US-142 (G-Demo, VM-3 registrada), FEAT-T5d

## Story
Como oncólogo asesor, quiero revisar una muestra de tablas de aplicabilidad, para que la
concordancia de VM-3 se mida con un criterio clínico y quede registrada para G-Demo.

> Escenario más probable (a refinar en sprint planning): un oncólogo revisa la muestra fijada en DEC-02 sobre análisis de casos sintéticos del S4, con meta ≥ 85 % de criterios concordantes, porque es la propuesta de M-08.1 y VM-3; "Parcial" cuenta como concordante solo si el oncólogo también lo considera parcial. La revisión se repite con casos reales en el piloto (FEAT-T5d).

## AC (Given/When/Then)
- **AC-1** · Dada la muestra, cuando se revise, entonces
  `docs/decisions/DEC-14-revision-aplicabilidad.md` registra criterios revisados,
  concordancia obtenida, tratamiento de "Parcial", revisor y fecha. `[M-08.1]` (asumido)
- **AC-2** · Dada la revisión, cuando se registre, entonces declara la cohorte
  (sintética) y la versión del catálogo de aplicabilidad revisada. `[DEC-02]` (asumido)

## Contexto técnico
Historia de decisión: el entregable es el registro con dueño y fecha. La selección de la
muestra y el cálculo los hace el responsable técnico con las tablas persistidas (US-124);
la medición en el piloto es de US-154 (FEAT-T5d).

## INVEST
**Small** ✓ una sesión de revisión y un documento.
**Testable** ✓ los AC verifican el contenido del registro.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-17 | PRD §17: FR-20 "sin historia propia" | readme §5.6: HU-25 (feedback VM-4/VM-5) mapeada a T-5 | Ambas: la suite no tiene HU (Q-08); HU-25 se conserva para el feedback (US-137, US-138) |
| — | PRD M-04.3, RN-29 y RN-20: catálogos de datos críticos y de aplicabilidad **firmados** por el oncólogo; PRD §14 G-Piloto exige catálogos firmados | Resolución del usuario P-03 (`01-requisitos.md` §15): el feedback agregado por análisis es la validación clínica y reemplaza la firma formal de DEC-01 y DEC-11 | P-03 (decisión vinculante del usuario): US-139 dice si cada versión de catálogo queda "validado"; se registra para enmendar el PRD |
| — | PRD §2.2 VM-5: "En el piloto" | P-03 y slicing adoptado: feedback desde el S4 con casos sintéticos | Ambos: se captura desde el S4 (cohorte sintética) y se mide por separado en el piloto (cohorte real, FEAT-T5d) |
| — | P-03: "al cerrar cada análisis el oncólogo **registra**" la puntuación | PRD §2.2 VM-4 y readme HU-25: "opcional y en un clic" | PRD: el feedback es opcional (US-138 AC-4); la tasa mínima de respuesta la fija DEC-02 |
| — | `backlog/02-adrs.md` US-024 · DEC-14: Feature FEAT-T5d | Mapa de lotes: FEAT-T5d en el S6; DEC-14 en el S4 | DEC-14 se ubica en FEAT-T5c (S4, validación clínica con casos sintéticos); FEAT-T5d repite la medición con casos reales |
| Slicing v2 | Slicing "por hipótesis" (2026-10-06): feedback en el S4; readme §5 HU-25 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): feedback en el S5, junto con G-Demo | Se siguió el slicing v2; los umbrales de validación de catálogos los fija la respuesta 5 del usuario (§15) |
