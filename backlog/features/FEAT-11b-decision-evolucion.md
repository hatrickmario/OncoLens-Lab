# FEAT-11b — Registro de la decisión de tratamiento y de la evolución del paciente

> Linear: [L1D-27](https://linear.app/l1der-lab-mjbc/issue/L1D-27)

**Talla:** L (4 historias; `clinical-api` y `web`; el conflicto C-05 obliga a cuidar el modelo del timeline) · **Sprint:** Post-MVP · **Capacidad:** CAP-11 (AC-11.1 decisión, AC-11.4 decisión, AC-11.5) · CAP-02 (AC-02.3: decisiones distintas de tratamientos previos) · T-3 (AC-T3.2: el sistema nunca registra decisiones solo) · **Recorrido principal:** no
**Requisitos:** FR-13 (dueña) · FR-29 (a: decisión como evento derivado; b: evolución, dueña) · RN-27 (regresión: ATC; dueña US-098) · RN-17 (regresión; dueña US-198) · RN-11 (regresión; dueña US-049) · RN-23 (regresión)
**Evidencia:** [→ PRD §5 FR-13, FR-21 (R-03), FR-29], [→ PRD §6 RN-11, RN-17, RN-27], [→ PRD §18.2 "Evento derivado", "Tratamiento previo"], [→ PRD §18.3.2 AC-02.3], [→ PRD §18.3.11 AC-11.1, AC-11.4, AC-11.5], [→ PRD §18.4 AC-T3.2], [→ readme §3.1 `TREATMENT`, `CLINICAL_EVENT`], [→ readme §3.3 #32], [→ readme §4.1 `POST/GET …/treatments`, `POST/GET …/clinical-events`], [→ readme §5 HU-12, HU-23], [→ backlog/01-requisitos.md §11 C-05]
**Dependencias:** ↪ US-088 (timeline con eventos derivados), US-098 (normalización final ATC), US-053 (análisis persistido), US-175 (detector de desactualizados, FEAT-11a) · 🔗 Produce para: US-189 (decisiones y evolución en la memoria, FEAT-11c), US-207 (snapshot longitudinal, FEAT-AP1) · 🔗 Regresión [RN-17] → US-198 · 🔗 Regresión [RN-27] → US-098 · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [FR-18] → US-150
**Valor:** el ciclo de investigación se cierra cuando el oncólogo deja registrado qué decidió y qué pasó después. Esa decisión y esa evolución entran a la historia del paciente dentro de OncoLens y a los análisis siguientes, siempre escritas por el oncólogo y nunca por la IA.
**Workaround en el MVP:** la decisión se registra fuera de OncoLens (historia clínica institucional); la evolución entra como documento nuevo (carga y extracción de eventos de US-085) o como tratamiento previo manual (US-094), que ya aparecen en la vista de caso y en el contexto.
**Stories:** US-193 … US-196 (16 puntos)

## Fixtures

- **FX-11b-a · Paciente con análisis y decisión** (BD de test de `clinical-api`; catálogo `test-s2-1.0.0` con subconjunto ATC de test `ATC-T-TRAS` "trastuzumab", `ATC-T-PACL` "paclitaxel"):
  - Paciente **P-DEC** (mama, `sintetico`, activo) con `AN-D1` (`con_evidencia`, opción `opt-1` "Quimioterapia combinada con terapia anti-HER2", descartada `disc-1` "Terapia anti-HER2 sola"); `AN-D1` usó en su contexto el tratamiento previo `PT-1`.
  - Paciente **P-OTRO** (mama, `sintetico`) con `AN-O1`.
  - Paciente **P-EGR** (`sintetico`, egresado, FX-T4b-a).

---

## US-193 — El oncólogo registra el tratamiento decidido con fármacos normalizados y un vínculo opcional al análisis, nunca a una opción descartada

> Linear: [L1D-153](https://linear.app/l1der-lab-mjbc/issue/L1D-153)

`FEAT-11b` · Post-MVP · Estimación **5** · HU-12 · FR-13 (dueña) · AC-11.1 (decisión), AC-T3.2 · ↪ US-098, US-053 · 🔗 Regresión [RN-27] → US-098 · 🔗 Regresión [RN-17] → US-198 · 🔗 Regresión [FR-18] → US-150

## Story
Como oncólogo, quiero registrar el tratamiento que decidí, con sus fármacos y, si quiero,
el análisis que consulté, para que la decisión quede en la historia del paciente con su
contexto.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-DEC, cuando `doc1@test.local` llama a
  `POST /platform/patients/{id}/treatments` con fármacos "trastuzumab" y "paclitaxel",
  fecha de inicio y `analysisId = AN-D1`, `optionRef = opt-1`, entonces responde `201`, el
  `Treatment` guarda `atc_codes = [ATC-T-TRAS, ATC-T-PACL]` decididos por Backend 1 con la
  versión del catálogo, `decided_by` del doctor y el vínculo. `[FR-13]` `[AC-11.1]`
  `[RN-27]`
- **AC-2 (borde · opción descartada)** · Dado `optionRef = disc-1`, cuando se registra,
  entonces responde `422` con `error = "vinculo_a_opcion_descartada"` y no se crea nada.
  `[FR-13]` `[AC-11.1]`
- **AC-3 (borde · análisis de otro paciente)** · Dado `analysisId = AN-O1` en P-DEC,
  cuando se registra, entonces responde `422`. (asumido)
- **AC-4 (borde · fármaco sin mapeo)** · Dado un fármaco fuera del subconjunto ATC,
  cuando se registra, entonces se guarda con `mapping_status = no_mapeado`, sin código
  inventado, y aparece en los pendientes de mapeo. `[RN-27]`
- **AC-5 (invariante · nunca automático)** · Dado un análisis completado con opciones,
  cuando termina, entonces no se crea ningún `Treatment`; el único camino de creación es
  este *endpoint* con sesión de un doctor. `[AC-T3.2]`
- **AC-6 (borde · sin vínculo)** · Dado un registro sin `analysisId`, cuando se registra,
  entonces responde `201` con `analysis_id = null`. `[FR-13]`
- **AC-7 (borde · auditoría)** · Dado el AC-1, cuando se revisa `AuditLog`, entonces hay
  un evento `treatment.create` con UUID, sin nombres de fármacos libres ni identidad.
  `[FR-18]` (asumido en el detalle del evento)

## Contexto técnico
Módulo `treatments` de `clinical-api` (Controller → Service → Repository, Zod); la
normalización ATC usa `NormalizationService` de US-098 (Backend 1 dueño, ADR-33). El
`optionRef` se valida contra `evidence_options` y `discarded_options` persistidos del
análisis. Tests: Supertest con FX-11b-a (AC-1…AC-4, AC-6, AC-7) y test de rutas que crean
`Treatment` (AC-5).

## INVEST
**Small** ✓ un CRUD con dos validaciones de vínculo y la normalización existente.
**Testable** ✓ siete tests.

---

## US-194 — La decisión aparece en el timeline como evento derivado "Decisión registrada en OncoLens", distinta de los tratamientos previos

> Linear: [L1D-154](https://linear.app/l1der-lab-mjbc/issue/L1D-154)

`FEAT-11b` · Post-MVP · Estimación **3** · HU-12, HU-15 · FR-13, FR-29 (a), FR-21 · AC-11.4 (decisión), AC-02.3 (distinción) · ↪ US-193, US-088, US-090

## Story
Como oncólogo, quiero ver mis decisiones en el timeline del paciente, separadas de los
tratamientos que recibió antes o fuera de OncoLens, para reconstruir el caso sin
confundir lo que decidí con lo que ya venía hecho.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el `Treatment` del AC-1 de US-193, cuando se llama a
  `GET …/case`, entonces el timeline incluye un evento `decision_oncolens` con el texto
  "Decisión registrada en OncoLens", la fecha de inicio y el enlace al análisis `AN-D1`.
  `[AC-11.4]` `[FR-13]`
- **AC-2 (invariante · derivado)** · Dado el mismo registro, cuando se cuenta
  `clinical_event`, entonces no se creó ninguna fila: el evento se deriva de `treatment`
  al armar el timeline. `[AC-11.4]` `[readme §3.3 #32]`
- **AC-3 (borde · distinción visual)** · Dada la vista de caso en Playwright, cuando se
  muestran el tratamiento previo `PT-1` y la decisión, entonces la decisión aparece con el
  rótulo de texto "Decisión registrada en OncoLens" y fuera del grupo "Tratamientos
  previos". `[AC-02.3]` `[NFR-12]`
- **AC-4 (borde · sin duplicados)** · Dados dos `GET …/case` seguidos, cuando se comparan,
  entonces la decisión aparece una sola vez. `[AC-02.1]`

## Contexto técnico
Amplía el `CaseTimelineService` de US-088 con la fuente `treatment` → evento derivado.
Tests: Supertest (AC-1, AC-2, AC-4) y Playwright (AC-3).

## INVEST
**Small** ✓ una fuente más en un ensamblador existente.
**Testable** ✓ cuatro tests.

---

## US-195 — El oncólogo registra la evolución, que entra al timeline y al contexto y marca desactualizados los análisis afectados

> Linear: [L1D-155](https://linear.app/l1der-lab-mjbc/issue/L1D-155)

`FEAT-11b` · Post-MVP · Estimación **5** · HU-23 · FR-29 (b, dueña) · AC-11.5 · ↪ US-193, US-175, US-088 · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-17] → US-198 · 🔗 Regresión [FR-18] → US-150

## Story
Como oncólogo, quiero registrar la respuesta, la toxicidad, la progresión o el cambio de
tratamiento de mi paciente, para que la historia del caso y los próximos análisis reflejen
lo que pasó después de decidir.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el `Treatment` `T-1` de P-DEC, cuando el doctor llama a
  `POST /platform/patients/{id}/clinical-events` con `event_type = toxicidad`, `grade =
  3`, fecha y `treatmentId = T-1`, `analysisId = AN-D1`, entonces responde `201` con un
  `ClinicalEvent` `entry_method = manual`, `review_status = verificado`, vinculado a `T-1`
  y `AN-D1`, y aparece en `GET …/case`. `[AC-11.5]` `[FR-29]`
- **AC-2 (borde · desactualiza)** · Dado `AN-D1`, que usó el tratamiento previo `PT-1`, y
  un evento de `progresion` vinculado a `PT-1`, cuando se registra, entonces `AN-D1` trae
  `staleness.patientData = true` con "Progresión: agregada". `[AC-11.5]` `[AC-11.2]`
- **AC-3 (borde · egresado)** · Dado P-EGR, cuando se registra una evolución, entonces
  responde `422` con `error = "paciente_egresado"` y no se crea el evento. `[AC-11.5]`
  `[RN-17]`
- **AC-4 (borde · toxicidad sin grado)** · Dado `event_type = toxicidad` sin `grade`,
  cuando se registra, entonces responde `422`. `[FR-29]` (asumido en la obligatoriedad)
- **AC-5 (borde · tipo con tabla propia)** · Dado `event_type = diagnostico`, cuando se
  registra, entonces responde `422`: solo se aceptan los tipos sin tabla propia
  (respuesta, toxicidad, progresión, recaída, cambio y suspensión de tratamiento).
  `[readme §3.1]` `[FR-21]`
- **AC-6 (invariante · texto libre)** · Dada una evolución con descripción "Toxicidad en
  Juan Pérez CC 7654321", cuando entra al contexto de un análisis nuevo, entonces llega
  enmascarada. `[RN-11]` `[AC-T4.3]`

## Contexto técnico
Ruta `POST/GET …/clinical-events` (readme §4.1) en el módulo de eventos; el enum de
`event_type` es el de readme §3.1 (solo tipos sin tabla propia). La marca de
desactualizado la calcula US-175 al leer: el evento se agrega a la huella de los datos
vinculados (`treatment_id` / `prior_treatment_id`). Tests: Supertest con FX-11b-a y
FX-T4b-a (AC-1…AC-5) y el test de no-fuga de US-049 ampliado (AC-6).

## INVEST
**Small** ✓ un *endpoint* sobre una tabla existente y dos integraciones ya construidas.
**Testable** ✓ seis tests.

---

## US-196 — Desde la vista de caso y desde un análisis registro la decisión y la evolución

> Linear: [L1D-156](https://linear.app/l1der-lab-mjbc/issue/L1D-156)

`FEAT-11b` · Post-MVP · Estimación **3** · HU-12, HU-23 · FR-13, FR-29 (b), NFR-12 · AC-11.4, AC-11.5 · ↪ US-193, US-195, US-090 · 🔗 Regresión [RN-23] → US-068

## Story
Como oncólogo, quiero registrar lo que decidí desde el análisis que estaba mirando y la
evolución desde la vista de caso, para no salir del flujo de trabajo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `AN-D1` abierto en Playwright contra Compose, cuando el
  doctor pulsa "Registrar decisión", elige `opt-1` y guarda, entonces el timeline muestra
  "Decisión registrada en OncoLens". `[AC-11.4]` `[FR-13]`
- **AC-2 (borde · descartadas no vinculables)** · Dado el mismo formulario, cuando se
  despliega la lista de opciones, entonces `disc-1` no aparece. `[FR-13]` `[FR-10]`
- **AC-3 (borde · egresado)** · Dado P-EGR, cuando se abre la vista de caso, entonces los
  botones "Registrar decisión" y "Registrar evolución" están deshabilitados con "Paciente
  egresado: reactívelo para registrar". `[RN-17]` `[AC-11.5]`
- **AC-4 (borde · lenguaje)** · Dados los textos nuevos, cuando corre la lista de términos
  prohibidos de US-068, entonces no hay coincidencias (la UI no sugiere ninguna opción como
  "recomendada"). `[RN-23]` `[AC-T3.4]`

## Contexto técnico
Formularios en `web` con Route Handlers hacia `…/treatments` y `…/clinical-events`.
Tests: Playwright con FX-11b-a y FX-T4b-a sembrados (AC-1…AC-3) y la lista de US-068
(AC-4).

## INVEST
**Small** ✓ dos formularios sobre endpoints ya probados.
**Testable** ✓ cuatro tests E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-05 | readme §3.2 `Treatment` y §5.6 HU-12: "crea un `ClinicalEvent` de tipo `decision_oncolens`" | PRD FR-13, FR-21 (R-03), AC-11.4 y readme §3.3 #32: evento **derivado**, sin escribir `ClinicalEvent`; el enum de `event_type` no tiene `decision_oncolens` | PRD: US-194 AC-2 verifica que no se escribe ninguna fila |
| — | PRD §5 FR-13, FR-29, §14 y §18.1.1 CAP-11: Sprint 4 | Slicing adoptado (`01-requisitos.md` §15): decisión y evolución en Post-MVP | Slicing: Post-MVP; carga de documentos y tratamientos previos manuales como *workaround* |
