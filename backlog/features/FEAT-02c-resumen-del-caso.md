# FEAT-02c — Resumen del caso verificable

> Linear: [L1D-11](https://linear.app/l1der-lab-mjbc/issue/L1D-11)

**Talla:** L · **Sprint:** `si-hay-capacidad` (primer candidato) · **Capacidad:** CAP-02 (AC-02.5) · T-1 (AC-T1.2 para afirmaciones sobre datos del paciente) · T-3 (AC-T3.1 en el resumen) · T-4 (AC-T4.3: no-fuga en el resumen) · **Recorrido principal:** no (primer candidato si hay capacidad)
**Requisitos:** FR-21 (resumen del caso, dueña vía HU-16) · ADR-34 (verbalización determinista + NLI) · RN-01 (regresión → US-064) · RN-06 (regresión → US-053) · RN-19 (regresión → US-069) · RN-30 (regresión → US-056) · RN-11 (regresión → US-049)
**Evidencia:** [→ PRD §5 FR-21], [→ PRD §6 RN-01, RN-06, RN-11, RN-12, RN-19, RN-23, RN-30], [→ PRD §10 (`POST …/case-summary`, interna `POST /case/summary`)], [→ PRD §18.3.2 AC-02.5, M-02.3], [→ PRD §18.4 AC-T1.2, AC-T3.1, AC-T4.3], [→ readme §5.6 HU-16], [→ readme §4.2 `/case/summary`, `CaseSummaryInternalResponse`], [→ readme §3.3 #34], [→ docs/AS-IS.md P1, JTBD 1]
**Dependencias:** ↪ US-088, US-089 (caso armado), US-049 (desidentificación), US-054 (JWT), US-064 (validador de soporte) · ⛔ ADR-39 (LLM y NLI reales; los AC usan adapters falsos) · 🔗 Medido en: US-105 (M-02.3) · 🔗 Regresión [RN-15] → US-148 (activa desde S6: el resumen es generación con IA) · 🔗 Regresión [RN-17] → US-198 (Post-MVP)
**Valor:** el oncólogo que recibe un caso complejo necesita una síntesis en prosa del caso (JTBD 1), pero no puede aceptar una frase que no pueda comprobar. Con esta Feature pide el resumen a demanda y cada afirmación enlaza al dato, evento o documento que la respalda; lo que no se puede respaldar no se muestra.
**Workaround en el MVP:** el timeline y la vista de caso (US-088, US-090) reconstruyen el caso sin resumen generado.
**Stories:** US-095, US-096, US-097 (13 puntos, `si-hay-capacidad`)

## Fixtures

- Usa **FX-02b-a** (paciente P-CASO).
- **FX-02c-a · LLM y NLI falsos del resumen** (`rag-orchestrator`, cuentan invocaciones). El `clinicalContext` llega con referencias opacas `r1…r9` (asignadas por `clinical-api`). `RES-OK` devuelve:
  - `c1` "El PSA aumentó en tres mediciones consecutivas" → `[r1, r2, r3]` (los tres PSA); NLI `entailment`.
  - `c2` "Recibe leuprorelina como primera línea, en curso" → `[r4]`; NLI `entailment`.
  - `c3` "Presentó progresión hace 2 meses" → `[r5]`; NLI `entailment`.
  - `c4` "Tiene metástasis hepáticas" → `[r6]` (sitios metastásicos = óseo); NLI `contradiction`.
  - `c5` "Mantiene buen estado general" → `[]`.
  - `c6` "Sus datos están en r99" → `[r99]` (referencia inexistente).
- **Plantillas de verbalización** de test (deterministas): biomarcador → "PSA: 9,5 ng/mL, hace 3 meses, sin verificar"; tratamiento previo → "Leuprorelina, línea 1, en curso desde hace 11 meses"; evento → "Progresión, hace 2 meses"; atributo → "Sitios metastásicos: óseo".

---

## US-095 — Backend 2 genera el resumen y solo devuelve afirmaciones respaldadas por los datos que referencian

> Linear: [L1D-81](https://linear.app/l1der-lab-mjbc/issue/L1D-81)

`FEAT-02c` · Sprint si-hay-capacidad · Estimación **5** · HU-16 · FR-21 (resumen), RN-01 (datos del paciente), RN-12 · AC-02.5, AC-T1.2 (resumen) · ⛔ ADR-39 · ↪ US-054, US-064 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-12] → US-050 · 🔗 Regresión [RN-23] → US-064 (regla en ejecución; dueña de RN-23: US-068) · 🔗 Medido en: US-105 (M-02.3) · **Recorrido principal:** no · **Workaround en el MVP:** **primer candidato si hay capacidad**; el timeline y la vista de caso (US-088, US-090) reconstruyen el caso

## Story
Como oncólogo, quiero que cada frase del resumen de mi paciente se compruebe contra los
datos que dice resumir, para no leer en el resumen algo que el caso no dice.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados P-CASO y `RES-OK`, cuando `clinical-api` llama a
  `POST /case/summary`, entonces responde `200` con `claims` = `c1`, `c2` y `c3`, cada una
  con `supportingDataRefs` incluidas en las referencias recibidas, y `omittedClaims = 3`.
  `[AC-02.5]` `[readme §4.2]`
- **AC-2 (invariante · verbalización determinista)** · Dada `c1`, cuando se verifica,
  entonces el NLI se invoca con premisa = verbalización por plantilla de `r1`, `r2` y
  `r3`, e hipótesis = el texto de `c1`; y dos verbalizaciones del mismo dato son idénticas.
  `[ADR-34]` `[RN-01]`
- **AC-3 (borde · sin enlace o enlace inválido)** · Dadas `c5` (sin referencias) y `c6`
  (referencia inexistente), cuando se validan, entonces no aparecen en `claims` y suman a
  `omittedClaims`. `[AC-02.5]` `[RN-01]`
- **AC-4 (borde · contradicción)** · Dada `c4`, cuando se valida, entonces no aparece en
  `claims`, su texto no está en ningún campo de la respuesta y suma a `omittedClaims`.
  `[AC-02.5]` `[FR-10]`
- **AC-5 (borde · datos reales sin nube)** · Dado `dataClassification =
  real_identificado` y el LLM local caído, cuando se pide el resumen, entonces responde
  `503` y el adapter de nube registra cero llamadas. `[RN-12]`
- **AC-6 (borde · cola de inferencia llena)** · Dado el semáforo de inferencia ocupado,
  cuando llega la petición, entonces responde `429` con `Retry-After`. `[readme §4.2]` `[RN-30]`
- **AC-7 (borde · lenguaje)** · Dado un LLM falso que devuelve una afirmación con "debe
  recibir", cuando se valida, entonces se omite y suma a `omittedClaims`. `[RN-23]`
  `[§15 resp. 2]`

## Contexto técnico
`CaseSummaryService` en `rag-orchestrator/application/`, con `Verbalizer` (plantillas
deterministas en `domain/`, versionadas) y el `SupportChecker` de US-064 ampliado para
premisas verbalizadas `[ADR-34]`. Recibe solo el `ClinicalContext` desidentificado con
referencias opacas; no accede a datos clínicos `[SEG-06]`. Tests: Pytest + TestClient con
FX-02c-a.

## INVEST
**Small** ✓ un servicio que reutiliza el validador existente con otra premisa.
**Testable** ✓ siete tests con LLM y NLI falsos.

---

## US-096 — `clinical-api` pide el resumen con referencias opacas, lo persiste antes de responder y lo enlaza a los datos

> Linear: [L1D-82](https://linear.app/l1der-lab-mjbc/issue/L1D-82)

`FEAT-02c` · Sprint si-hay-capacidad · Estimación **5** · HU-16 · FR-21 (resumen, persistencia), RN-06, RN-11, RN-30 · AC-02.5, AC-T4.3 (resumen), AC-11.4 (resumen como evento derivado) · ↪ US-095, US-088, US-049, US-053 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-30] → US-056 · 🔗 Regresión [RN-15] → US-148 (activa desde S6) · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · **Recorrido principal:** no · **Workaround en el MVP:** **primer candidato si hay capacidad**; el timeline y la vista de caso (US-088, US-090) reconstruyen el caso

## Story
Como oncólogo, quiero pedir el resumen de mi paciente y recibir cada afirmación con el
enlace al dato que la respalda, registrado como cualquier otro análisis, para poder
verificarlo y saber después con qué datos se hizo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados P-CASO y `RES-OK`, cuando `doc1@test.local` envía
  `POST /platform/patients/{id}/case-summary`, entonces responde `200` con tres
  afirmaciones, cada una con enlaces resolubles (`dataType` y `dataId` de un
  `Biomarker`, `PriorTreatment` o `ClinicalEvent`, y `sourceDocumentId` cuando aplica),
  `omittedClaims = 3`, `dataAsOf` y `disclaimer`; y existe un `AIAnalysisRecord` con
  `analysis_type = resumen_caso`, `case_summary`, `omitted_claims = 3`,
  `clinical_context_snapshot` y modelos. `[AC-02.5]` `[FR-21]` `[readme §4.1]`
- **AC-2 (invariante · referencias opacas y desidentificación)** · Dado el request
  capturado hacia `/case/summary`, cuando se inspecciona, entonces las referencias son
  `r1…r9` (sin UUID de base de datos), no hay `patientId`, nombre ni documento, la
  descripción de la toxicidad llega enmascarada y la tabla de correspondencia `rN → id`
  solo existe en memoria de `clinical-api` durante la petición. `[readme §4.2]` `[RN-11]` `[RN-10]`
- **AC-3 (invariante · persistir antes de responder)** · Dado un fallo forzado al
  guardar el `AIAnalysisRecord`, cuando se pide el resumen, entonces responde `500` sin
  ninguna afirmación en el cuerpo. `[RN-06]` `[NFR-08]`
- **AC-4 (borde · límite de consultas)** · Dadas 6 peticiones de resumen del mismo
  usuario en el último minuto, cuando llega la séptima, entonces responde `429` y el
  cliente de `rag-orchestrator` no recibe la séptima. `[RN-30]`
- **AC-5 (borde · Backend 2 caído o lento)** · Dado `rag-orchestrator` que no responde
  dentro del *deadline*, o que responde `503`, cuando se pide el resumen, entonces
  responde `504` o `503` respectivamente y no se persiste ningún registro. `[OL-03]` `[RN-06]`
- **AC-6 (borde · excluidos)** · Dado P-CASO, cuando se captura el contexto enviado,
  entonces la cirugía `rechazado` no está. `[AC-02.6]` `[RN-07]`
- **AC-7 (borde · sin datos)** · Dado un paciente sin datos estructurados, cuando se pide
  el resumen, entonces responde `422` con `{ error: "SIN_DATOS", message }` y el cliente
  de `rag-orchestrator` registra cero llamadas. (asumido)

## Contexto técnico
`case-summary` dentro del módulo `evidence-analysis` de `clinical-api` (mismo gateway,
JWT, *rate limit* y persistencia del análisis) `[readme §2.3]`. Contrato de respuesta
propuesto (readme §4.1 solo nombra el endpoint): `CaseSummary { id, claims: [{ text,
links: [{ dataType, dataId, sourceDocumentId? }] }], omittedClaims, dataAsOf, disclaimer,
createdAt }`; se agrega al spec y se regenera `packages/api-contracts`. `dataAsOf` = la
fecha más reciente entre los datos usados `[R-22]`. El resumen aparece en el timeline como
evento derivado (US-088 AC-5). Tests: Vitest + Supertest con `rag-orchestrator` simulado.

## INVEST
**Small** ✓ reutiliza el gateway del análisis con otro endpoint interno.
**Testable** ✓ siete tests de integración sobre respuesta, payload y BD.

---

## US-097 — Veo el resumen del caso con sus enlaces, los avisos y cuántas afirmaciones se omitieron

> Linear: [L1D-83](https://linear.app/l1der-lab-mjbc/issue/L1D-83)

`FEAT-02c` · Sprint si-hay-capacidad · Estimación **3** · HU-16 · FR-21 (UI), RN-19, NFR-12 · AC-02.5, AC-T3.1 (resumen) · ↪ US-096, US-090 · 🔗 Regresión [RN-19] → US-069 · 🔗 Regresión [RN-23] → US-068 · **Recorrido principal:** no · **Workaround en el MVP:** **primer candidato si hay capacidad**; el timeline y la vista de caso (US-088, US-090) reconstruyen el caso

## Story
Como oncólogo, quiero leer el resumen del caso con un enlace en cada afirmación y los
avisos visibles, para verificarlo contra las fuentes antes de usarlo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el oncólogo en la vista de caso de P-CASO, cuando elige
  "Generar resumen del caso", entonces ve las tres afirmaciones de `RES-OK`, cada una con
  su enlace que lleva al dato en la vista de caso o abre el documento de origen, y encima
  los textos "Análisis generado por IA: requiere validación clínica del oncólogo
  tratante", "Uso académico/investigación", "Verifique contra las fuentes" y "Datos al
  ‹dataAsOf›". `[AC-02.5]` `[RN-19]` `[AC-T3.1]`
- **AC-2 (borde · omitidas)** · Dado el resumen del AC-1, cuando se muestra, entonces
  se lee "3 afirmaciones omitidas por falta de soporte" y no aparece el texto de ninguna.
  `[AC-02.5]` `[FR-10]`
- **AC-3 (borde · errores)** · Dados `429`, `503` y `504`, cuando ocurren, entonces se
  muestra un mensaje genérico sin detalles internos y el botón vuelve a estar disponible
  (tras `Retry-After` en el `429`). `[readme §4.1]`
- **AC-4 (borde · lenguaje)** · Dados los textos nuevos de esta pantalla, cuando se pasa
  la lista de términos prohibidos de US-068, entonces ninguno aparece. `[RN-23]`
- **AC-5 (borde · accesibilidad)** · Dado el resumen generado, cuando aparece, entonces
  se anuncia en una región `aria-live` y cada enlace es operable con teclado. `[NFR-12]`

## Contexto técnico
Organismo `CaseSummaryPanel` en la vista de caso (US-090), vía Route Handler
`app/api/patients/[patientId]/case-summary/route.ts`. Los avisos salen del campo
`disclaimer` y de literales en configuración (US-069). Tests: Playwright contra Compose
en perfil de test con `rag-orchestrator` en modo falso (FX-02c-a).

## INVEST
**Small** ✓ un organismo de presentación.
**Testable** ✓ cinco tests E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-13 | readme §5.6 HU-16: el resumen se rotula "Generado por IA" | PRD RN-19 y FR-21 (R-22): aviso completo + "Verifique contra las fuentes" + fecha de los datos | PRD (US-097 AC-1) |
| C-14 | PRD RN-19: aviso con raya | PRD AC-T3.1: aviso con dos puntos ("texto actualizado") | AC-T3.1, como en US-069 |
| — | PRD AC-02.5: `403` por opt-out y `422` por egresado | Slicing adoptado: `403` desde el S5 (FEAT-T4c), egreso Post-MVP | Regresiones hacia US-148 (S5) y US-198 (Post-MVP) |
| Slicing v2 | PRD FR-21 y §14 S2: resumen del caso en el S2; AC-02.5 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): resumen del caso `si-hay-capacidad` (primer candidato) | AC-02.5 queda en historias `si-hay-capacidad`; US-105 AC-3, US-148 AC-2 y US-150 lo verifican solo si la Feature se construye |
