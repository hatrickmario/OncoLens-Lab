# FEAT-10b — Avisos de datos no verificados, en conflicto y faltantes en las opciones

> Linear: [L1D-24](https://linear.app/l1der-lab-mjbc/issue/L1D-24)

**Talla:** M (Feature completa: 2 historias, 10 puntos) · **Sprint:** 4 (avisos de datos sin verificar) · 5 (conflicto y faltantes) · **Capacidad:** CAP-10 (AC-10.2: avisos en la tarjeta) · T-3 (AC-T3.3: los avisos no bloquean) · **Recorrido principal:** sí
**Requisitos:** FR-11 (dueña; S2: datos pendientes de revisión · S3/S4: en conflicto y faltantes) · RN-26 (regresión → US-071)
**Evidencia:** [→ PRD §5 FR-11], [→ PRD §6 RN-07, RN-26], [→ PRD §18.3.10 AC-10.2], [→ PRD §18.4 AC-T3.3], [→ readme §5 HU-05 (escenario 3)], [→ readme §4.1 `EvidenceOption.warnings`], [→ readme §6 OL-04 (alcance complementario: avisos por tarjeta)], [→ docs/AS-IS.md P12]
**Dependencias:** ↪ US-053 (persistencia), US-061 (tarjeta), US-065 (procedencia en el contexto), US-087 (datos extraídos con revisión) · S5 (US-136): ↪ US-099 (conflictos), US-124 (avisos por criterio), FEAT-04 US-006 (`missingCriticalData`) · 🔗 Relacionada: US-109 (resolución, `si-hay-capacidad`) · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-06] → US-053
**Valor:** el oncólogo necesita saber, en la misma tarjeta de la opción, si lo que ve depende de un dato que nadie ha verificado todavía, que está en conflicto o que falta (P12), sin que eso le impida leer el análisis.
**Stories:** US-101 (S4, 5 puntos) · US-136 (S5, 5 puntos)

---

## Parte S2

## US-101 — La tarjeta de la opción avisa cuando el análisis depende de datos sin verificar, sin bloquear nada

> Linear: [L1D-142](https://linear.app/l1der-lab-mjbc/issue/L1D-142)

`FEAT-10b` · Sprint 4 · Estimación **5** · HU-05 (escenario 3) · FR-11 (S2, dueña), RN-26 · AC-10.2 (avisos), AC-T3.3 (parte) · ↪ US-053, US-061, US-065, US-087 · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-23] → US-068 (texto nuevo) · 🔗 Produce para: US-136 (conflicto y faltantes, S5)

## Story
Como oncólogo, quiero que cada opción me avise si el análisis se apoyó en datos de mi
paciente que todavía no están verificados, para pesar esa opción sabiendo qué parte
del caso es provisional.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-T1a-a (Ki-67 `requiere_revision`), FX-06a-a y
  `LLM-OK`, cuando se ejecuta `Q-HER2`, entonces la opción trae
  `warnings = ["datos_sin_verificar"]`, y la tarjeta muestra "Depende de datos sin
  verificar: Ki-67" junto a la opción. `[FR-11]` `[HU-05]` `[AC-10.2]`
- **AC-2 (borde · todo verificado)** · Dado el paciente semilla (a) con todos sus datos
  `verificado`, cuando se ejecuta el mismo análisis, entonces `warnings = []` y la tarjeta
  no muestra el aviso. `[FR-11]`
- **AC-3 (borde · determinista, sin LLM)** · Dado un LLM falso que devuelve
  `warnings = ["datos_en_conflicto"]` en la opción, cuando `clinical-api` arma la
  respuesta, entonces `warnings` se recalcula desde el contexto y queda
  `["datos_sin_verificar"]`; y dos ejecuciones con el mismo contexto dan el mismo
  resultado. `[FR-11]`
- **AC-4 (borde · no bloquea)** · Dado el análisis del AC-1, cuando se completa,
  entonces responde `200` con la opción visible y ningún diálogo impide leerla.
  `[RN-26]` `[AC-T3.3]`
- **AC-5 (borde · persistido)** · Dado el análisis del AC-1, cuando se lee
  `evidence_options` del `AIAnalysisRecord`, entonces trae el mismo `warnings`.
  `[RN-06]` `[AC-T1.4]`
- **AC-6 (borde · `auto_aceptado`)** · Dado un dato `auto_aceptado` como único dato no
  `verificado` del contexto, cuando se ejecuta el análisis, entonces `warnings = []`.
  (asumido: HU-05 escenario 3 solo marca como pendiente la confianza baja o el semáforo
  inferido, que quedan en `requiere_revision`)

> Pendiente de definir en refinamiento (dueño: usuario + oncólogo · afecta: AC-1, AC-2): en el S2 todavía no hay aplicabilidad por criterio, así que no hay forma determinista de saber de qué datos "depende" una opción. Propuesta del S2: la opción depende de todo dato del contexto enviado (`analysisBasis.patientDataUsed`); desde el S3, de los datos de los criterios de aplicabilidad de su fuente más aplicable (US-124). ¿Se acepta esa regla provisional?

## Contexto técnico
`OptionWarningsBuilder` en el módulo `evidence-analysis` de `clinical-api`, después de
recibir la respuesta de Backend 2 y antes de persistir `[FR-11]`: deriva `warnings` del
contexto etiquetado (US-065), nunca de lo que diga el LLM. En el S2 solo emite
`datos_sin_verificar`; `datos_en_conflicto` y `datos_faltantes` llegan con US-136, y
`poblacion_no_comparable` con US-125. La tarjeta es la de US-061 (organismo
`EvidenceOptionCard`). Tests: Vitest + Supertest con `rag-orchestrator` simulado (AC-1 a
AC-3, AC-5, AC-6) y Playwright (AC-1, AC-4).

## INVEST
**Small** ✓ un constructor determinista y un aviso en una tarjeta existente.
**Testable** ✓ seis tests de integración y E2E.

---

## Parte S4

## Fixtures (parte S4)

- **FX-10b-a · Paciente con conflicto, faltante y dato fuera de criterios** (extiende FX-08b-a; perfil de test, catálogo `test-apl-1.0.0` y catálogo de datos críticos `test-1.0.0` de FEAT-04 en ambos backends):
  - **A-M2** (mama, sintético): dos HER2 del mismo día en conflicto (`3+ (IHQ)` de `D1` y `1+ (IHQ)` de `D2`, ambos `requiere_revision`, enlazados por `conflicts_with_id`, US-099); `TNM_8` "IIA" `verificado`; ECOG 1 `verificado`; dos Ki-67 del mismo día en conflicto (`20 %` y `30 %`); sin estado menopáusico (llega en `missingCriticalData`); sin tratamientos previos.
  - Ki-67 **no** es destino de ningún criterio de `test-apl-1.0.0`; HER2 y estado menopáusico sí (`estado_her2`, `estado_menopausico`).
  - LLM falso `LLM-OK-A1`: 1 opción "Opción B (test)" que cita `ch-a1-1` (`doc-a1`), NLI `entailment`; aplicabilidad real de FX-08b-a (no `APL-FIJA`).
  - **A-M2r:** A-M2 después de resolver el conflicto de HER2 con US-109 (queda `3+` `verificado`; `1+` `reemplazado`).

## US-136 — La tarjeta avisa cuando la opción depende de datos en conflicto o de datos críticos faltantes, calculado por criterio y sin bloquear

> Linear: [L1D-143](https://linear.app/l1der-lab-mjbc/issue/L1D-143)

`FEAT-10b` · Sprint 5 · Estimación **5** · HU-05 (escenario 3), HU-10, HU-22 · FR-11 (S3/S4: conflicto y faltantes, dueña), RN-26 · AC-10.2 (avisos de conflicto), AC-03.2 (aviso en dependientes), AC-08.4 (consumo), AC-04.3 (consumo), AC-T3.3 (parte) · ↪ US-101, US-124, US-099, FEAT-04 US-006 · 🔗 Relacionada: US-109 (resolución de conflictos, `si-hay-capacidad`) · 🔗 Consume: US-124 (`patientDataWarning` por criterio), US-125 (fuente más aplicable) · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-23] → US-068 (texto nuevo)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** US-109 (resolución de conflictos) es `si-hay-capacidad`. El conflicto lo detecta US-099 (S3) y queda `requiere_revision`; en el MVP se resuelve rechazando uno de los valores en la revisión (US-107, S4), y A-M2r del AC-3 representa ese estado.

## Story
Como oncólogo, quiero que cada opción me avise si su aplicabilidad se apoya en un dato
de mi paciente que está en conflicto o que falta, para saber qué debo resolver o
completar antes de fiarme de esa comparación, sin que el aviso me impida leerla.

## AC (Given/When/Then)
- **AC-1 (happy path · conflicto)** · Dado A-M2 con `LLM-OK-A1`, cuando `doc1@test.local`
  ejecuta `Q-HER2` con `continueWithWarning = true`, entonces la opción trae
  `warnings` con `datos_en_conflicto` y la tarjeta muestra "Depende de datos en
  conflicto: HER2". `[FR-11]` `[AC-10.2]` `[AC-03.2]`
- **AC-2 (borde · faltante)** · Dado el análisis del AC-1, cuando se arma la opción,
  entonces `warnings` incluye `datos_faltantes` y la tarjeta muestra "Depende de datos
  críticos faltantes: estado menopáusico" con un enlace a la sección "Datos críticos"
  de la vista de caso. `[FR-11]` `[AC-04.3]` · 🔗 Consume: FEAT-04 US-004
- **AC-3 (borde · conflicto resuelto)** · Dado A-M2r, cuando se ejecuta de nuevo el
  mismo análisis, entonces `warnings` no contiene `datos_en_conflicto` y
  `estado_her2.patientDataWarning` es `null`. `[FR-11]` `[AC-03.2]`
- **AC-4 (borde · dato fuera de los criterios)** · Dado el conflicto de Ki-67 de A-M2,
  cuando se arma la opción, entonces ese conflicto no genera aviso en la tarjeta, y sí
  aparece en `analysisBasis.patientDataUsed` con su estado de conflicto.
  `[FR-11]` `[FR-27]` (asumido: la dependencia es la de los criterios de la fuente más
  aplicable, regla propuesta en el pendiente de US-101)
- **AC-5 (invariante · determinista, sin LLM)** · Dado un LLM falso que devuelve
  `warnings = []` en la opción, cuando `clinical-api` arma la respuesta, entonces
  `warnings` se recalcula desde el contexto y la aplicabilidad y vuelve a incluir
  `datos_en_conflicto` y `datos_faltantes`; dos ejecuciones con el mismo contexto dan
  el mismo arreglo. `[FR-11]`
- **AC-6 (borde · no bloquea)** · Dado el análisis del AC-1, cuando se completa,
  entonces responde `200` con la opción visible y sus avisos, sin ningún diálogo
  obligatorio. `[RN-26]` `[AC-T3.3]`
- **AC-7 (borde · persistido)** · Dado el análisis del AC-1, cuando se lee
  `evidence_options` del `AIAnalysisRecord`, entonces trae los mismos `warnings` en el
  mismo orden (`datos_sin_verificar`, `datos_en_conflicto`, `datos_faltantes`,
  `poblacion_no_comparable`). `[RN-06]` `[AC-T1.4]`

> Pendiente de definir en refinamiento (dueño: usuario + oncólogo · afecta: AC-4): un conflicto o un faltante del paciente que no es destino de ningún criterio de aplicabilidad (p. ej., Ki-67 en `test-apl-1.0.0`), ¿debe avisarse en todas las tarjetas (regla del S2: todo el contexto) o solo en la Base del análisis y en el aviso previo de faltantes (regla por criterio)?

## Contexto técnico
Extiende `OptionWarningsBuilder` de US-101 en el módulo `evidence-analysis` de
`clinical-api`: para cada opción toma los criterios de su fuente más aplicable (US-125)
y lee su `patientDataWarning` (US-124): `en_conflicto` → `datos_en_conflicto`,
`faltante` → `datos_faltantes`, `sin_verificar` → `datos_sin_verificar`; si la opción
no tiene criterios (catálogo sin aplicabilidad para ese tipo), se aplica la regla del
S2 sobre todo el contexto. `poblacion_no_comparable` sigue saliendo de US-125. Orden de
`warnings` fijo (enum de readme §4.1). Textos de UI en `EvidenceOptionCard` (US-061).
Tests: Vitest + Supertest con `rag-orchestrator` en perfil de test y FX-10b-a (AC-1…AC-5,
AC-7); Playwright contra Compose (AC-1, AC-2, AC-6). Misma versión de
`packages/clinical-catalogs` en ambos backends.

## Non-goals
Aviso "desactualizado" (FEAT-11a, S6 si hay capacidad). Resolver el conflicto desde la
tarjeta (en el MVP se rechaza un valor en la revisión, US-107; US-109 es `si-hay-capacidad`).

## INVEST
**Small** ✓ amplía un constructor determinista existente con dos tipos de aviso que ya calcula US-124.
**Testable** ✓ siete tests de integración y E2E con un fixture propio.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD FR-11: conflicto y faltantes en el S3 | Slicing adoptado (`01-requisitos.md` §15 y mapa de F3): FEAT-10b parte S3/S4 en el S4 | Slicing: la parte de conflicto y faltantes en las tarjetas va al S4 (US-136); en el S3 el aviso por criterio ya existe en la aplicabilidad (US-124) |
| — | readme OL-04 (alcance complementario): avisos por tarjeta desde el S1 | PRD FR-11: avisos de pendientes desde el S2 | PRD (US-101, S2) |
| — | readme §5.0 S4: HU-10 trae los avisos en la tarjeta junto con HU-22 en el S4 | PRD FR-11: conflicto y faltantes en el S3 | Slicing adoptado: US-136 en el S4, cuando la aplicabilidad (S3) ya calcula `patientDataWarning` por criterio |
| Slicing v2 | PRD FR-11: avisos en el S2 (sin verificar) y el S3 (conflicto y faltantes) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-101 en el S4 y US-136 en el S5 | Se siguió el slicing v2 |
