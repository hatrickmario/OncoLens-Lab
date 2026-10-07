# FEAT-T4b — Ciclo de vida del paciente (egreso, reactivación, bajas) y administración de opt-out

> Linear: [L1D-41](https://linear.app/l1der-lab-mjbc/issue/L1D-41)

**Talla:** XL (7 historias; toca borrado irreversible de identidad y una regla de acceso en todos los endpoints de registro). **Propone división** sin cambiar IDs: **FEAT-T4b-1** egreso, reactivación y `422` (US-197, US-198, US-202 parte de egreso, US-023 · DEC-13) · **FEAT-T4b-2** bajas y opt-out administrado (US-199, US-200, US-201, US-202 parte de baja) · **Sprint:** Post-MVP · **Capacidad:** T-4 (AC-T4.1: RN-16…RN-18, FR-16; AC-T4.6: borrado del histórico por opt-out de investigación y registro por `admin`) · T-3 (AC-T3.3: el egreso bloquea) · CAP-11 (AC-11.5: `422` en la evolución, vía US-198) · **Recorrido principal:** no
**Requisitos:** FR-14 (dueña) · FR-16 (UI de administración de opt-out y efecto del opt-out de investigación) · RN-17 (dueña: US-198) · RN-18 (baja total: US-199) · V-14 (lista cerrada de endpoints de RN-17) · TBD-06 (motivos de egreso, DEC-13)
**Evidencia:** [→ PRD §5 FR-14, FR-16, FR-17], [→ PRD §6 RN-15, RN-17, RN-18, RN-26], [→ PRD §4 RU-8, RU-9], [→ PRD §11 #10], [→ PRD §13 Seguridad ("`422` en cualquier registro sobre un paciente egresado"; bajas)], [→ PRD §16 TBD-06], [→ PRD §18.4 AC-T3.3, AC-T4.1, AC-T4.6], [→ readme §3.1 `CARE_EPISODE`, `PATIENT_OPT_OUT`, `EPISODE_SNAPSHOT`, `RESEARCH_SUBJECT_MAP`], [→ readme §4.1 `…/episodes/current/close`, `…/episodes`, `…/withdrawals`, `…/opt-outs`], [→ readme §5 HU-13, HU-14], [→ backlog/01-requisitos.md §3.1 (controles diferidos), §10 V-14, §14 Q-02, Q-05], [→ backlog/02-adrs.md US-023 · DEC-13, Resoluciones P-02]
**Dependencias:** ↪ US-047 (paciente, episodio abierto, campos de retención), US-046 (identidad cifrada), US-149 (servicio de opt-out y CLI), US-148 (guardia de opt-out), US-150 (auditoría), US-203 (tratante principal, FEAT-T4e) · 🔗 Produce para: US-207 (snapshot longitudinal al egresar, FEAT-AP1), US-209 (el job de retención reutiliza la baja total, FEAT-T4f) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-15] → US-148 · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [FR-18] → US-150
**Valor:** el paciente que deja la institución no debe seguir recibiendo registros ni análisis, quien lo pide debe poder salir de OncoLens por completo, y el administrador debe registrar las decisiones del sistema externo sin depender de la línea de comandos.
**Workaround en el MVP:** no hay egreso: todo paciente del piloto está activo. Las marcas de opt-out se registran por CLI (US-149) y el `403` se aplica igual (US-148); la marca `investigacion` se registra pero no tiene efecto porque no se escribe histórico de investigación. Una baja total solicitada durante el piloto se ejecuta con el procedimiento manual documentado por el administrador (asumido).
**Stories:** US-197 … US-202, US-023 · DEC-13 (27 puntos)

## Fixtures

- **FX-T4b-a · Pacientes del ciclo de vida** (BD de test de `clinical-api`, todos `sintetico`; `doc1@test.local` es tratante principal y `doc2@test.local` miembro del equipo de P-ACT según US-203; motivos de egreso de test `fin_seguimiento`, `traslado`):
  - **P-ACT:** activo, episodio 1 abierto, con documentos, datos clínicos, un `Treatment` y 2 análisis.
  - **P-EGR:** egresado (episodio 1 cerrado con `fin_seguimiento`), sin episodio abierto.
  - **P-BAJA:** activo, con identidad, un representante legal, 2 documentos en `clinical-minio`, un `EpisodeSnapshot` y su fila en `ResearchSubjectMap`.
  - **P-INV:** egresado con `EpisodeSnapshot` y `ResearchSubjectMap`; sin opt-out.

---

## US-197 — El tratante principal o un administrador egresa al paciente con un motivo, y la reactivación abre un episodio nuevo conservando la historia

> Linear: [L1D-206](https://linear.app/l1der-lab-mjbc/issue/L1D-206)

`FEAT-T4b` · Post-MVP · Estimación **5** · HU-13 · FR-14 (egreso y reactivación, dueña), RN-17 (quién egresa) · AC-T3.3 (egreso) · ↪ US-047, US-203 · ⛔ DEC-13 (US-023) · escenario más probable (motivos) · 🔗 Produce para: US-207 (snapshot) · 🔗 Regresión [FR-18] → US-150

## Story
Como tratante principal, quiero egresar a un paciente con el motivo del egreso y
reactivarlo si vuelve, para que su estado en OncoLens refleje si sigue en atención sin
perder su historia.

## AC (Given/When/Then)
- **AC-1 (happy path · egreso)** · Dado P-ACT y `doc1@test.local` (principal), cuando
  llama a `POST /platform/patients/{id}/episodes/current/close` con `reason =
  fin_seguimiento`, entonces responde `200`, el episodio queda cerrado con motivo y fecha,
  el paciente pasa a `egresado` y se dispara la escritura del snapshot (US-207).
  `[FR-14]` `[RN-17]`
- **AC-2 (borde · no principal)** · Dado `doc2@test.local` (miembro, no principal),
  cuando intenta egresar, entonces responde `403` y el episodio sigue abierto. `[RN-17]`
- **AC-3 (borde · admin)** · Dado `admin@test.local`, cuando egresa a P-ACT, entonces
  responde `200`. `[RN-17]` `[FR-14]`
- **AC-4 (borde · motivo fuera del catálogo)** · Dado `reason = inventado`, cuando se
  egresa, entonces responde `422` con la lista de motivos válidos. `[DEC-13]` `[TBD-06]`
- **AC-5 (happy path · reactivación)** · Dado P-EGR, cuando el principal llama a
  `POST /platform/patients/{id}/episodes`, entonces responde `201`, se abre el episodio 2,
  el paciente vuelve a `activo` y sus datos, documentos y análisis del episodio 1 siguen
  visibles en el caso. `[FR-14]`
- **AC-6 (borde · doble egreso)** · Dado P-EGR, cuando se intenta egresar de nuevo,
  entonces responde `409`. (asumido)
- **AC-7 (borde · auditoría)** · Dados el egreso y la reactivación, cuando se revisa
  `AuditLog`, entonces hay `patient.discharge` y `patient.reactivate` con UUID y motivo,
  sin identidad. `[FR-18]` `[RN-10]`

## Contexto técnico
Módulo `episodes` de `clinical-api`; el permiso "egresar" combina el rol (`admin`) o el
flag `is_primary` de `CareTeamMember` (US-203). Motivos en el catálogo de configuración
fijado por DEC-13 `[RN-22]`. Tests: Supertest con FX-T4b-a (AC-1…AC-7).

## INVEST
**Small** ✓ dos transiciones de estado con su regla de permiso.
**Testable** ✓ siete tests.

---

## US-198 — Un paciente egresado no admite ningún registro hasta su reactivación: `422` en todos los endpoints de registro

> Linear: [L1D-207](https://linear.app/l1der-lab-mjbc/issue/L1D-207)

`FEAT-T4b` · Post-MVP · Estimación **5** · HU-13 · RN-17 (dueña) · AC-T3.3 (egreso), AC-02.5 (`422`), AC-11.5 (`422`), AC-T4.1 (RN-17) · ↪ US-197 · 🔗 Regresión [RN-26] → US-071

## Story
Como responsable de la regla de acceso, quiero que ningún endpoint que registra algo
sobre un paciente acepte peticiones mientras está egresado, y que las lecturas sigan
funcionando, para que el egreso signifique lo mismo en todo el producto.

## AC (Given/When/Then)
- **AC-1 (happy path · análisis)** · Dado P-EGR, cuando se envía
  `POST /platform/evidence-analyses`, entonces responde `422` con `error =
  "paciente_egresado"`, el cliente de Backend 2 registra cero llamadas y no se crea
  `AIAnalysisRecord`. `[RN-17]` `[AC-T3.3]`
- **AC-2 (invariante · lista cerrada)** · Dado P-EGR, cuando se llama a cada ruta marcada
  `registro` — `POST …/case-summary`, `POST /platform/evidence-analyses/{id}/rerun`,
  `POST …/documents`, `POST …/documents/batch`, `POST …/clinical-events`, `POST
  …/treatments`, `POST …/prior-treatments`, `POST …/clinical-attributes`, `POST
  …/biomarkers`, `POST …/diagnoses` y `PATCH …/clinical-data/{type}/{itemId}/review` —,
  entonces todas responden `422` y no cambian ninguna fila; y el test de cobertura de
  rutas falla si una ruta `registro` no aplica el guardia. `[RN-17]` `[AC-02.5]`
  `[AC-11.5]` `[PRD §13]` (asumido en las rutas ambiguas de V-14)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-2, AC-4): RN-17 dice "ningún registro" y enumera análisis, resúmenes, cargas y evolución; ¿la lista cerrada incluye también `treatments`, `prior-treatments`, `clinical-attributes`, `biomarkers`, `diagnoses`, `PATCH …/review` y `POST …/feedback` (V-14)? Escenario usado: sí todos los de datos clínicos; `feedback` no.
- **AC-3 (borde negativo en positivo · lecturas y ciclo de vida)** · Dado P-EGR, cuando se
  llama a `GET /platform/patients/{id}`, `GET …/case`, `GET …/completeness`, `GET
  …/analyses` y `POST …/episodes` (reactivación), entonces responden `200`, `200`, `200`,
  `200` y `201`. `[RN-17]` `[FR-14]`
- **AC-4 (borde · feedback)** · Dado un análisis de P-EGR previo al egreso, cuando se
  envía `POST /platform/evidence-analyses/{id}/feedback`, entonces responde `201` (no es
  un registro clínico). (asumido: escenario de V-14)
- **AC-5 (borde · orden de guardias)** · Dado P-EGR con además opt-out `analisis_ia`,
  cuando se pide un análisis, entonces responde `422` (egreso) y la auditoría registra la
  denegación con ese motivo. (asumido en la precedencia)
- **AC-6 (borde · reactivado)** · Dado P-EGR reactivado (US-197 AC-5), cuando se repite el
  AC-1, entonces responde `200`. `[RN-17]`
- **AC-7 (borde · UI)** · Dado P-EGR en Playwright, cuando se abren la ficha y el panel,
  entonces se ve la etiqueta "Egresado" y los botones de registro y "Analizar evidencia"
  están deshabilitados con "Paciente egresado: reactívelo para registrar". `[RN-17]`
  `[RN-26]`

## Contexto técnico
`DischargedPatientGuard` en `clinical-api`, aplicado de forma declarativa a las rutas con
la marca `registro`, antes del guardia de opt-out (US-148) y del *rate limit*. Las
historias que agregan rutas de registro (FEAT-11b, FEAT-11a, FEAT-01a, FEAT-02b, FEAT-02c,
FEAT-03b, FEAT-04) ya llevan `🔗 Regresión [RN-17] → US-198` y entran al test de cobertura
del AC-2. Tests: Supertest con FX-T4b-a (AC-1…AC-6), test de cobertura de rutas en Vitest
(AC-2) y Playwright (AC-7).

## INVEST
**Small** ✓ un guardia declarativo y su test de cobertura, mismo patrón que US-148.
**Testable** ✓ siete tests.

---

## US-199 — La baja total borra identidad, representantes, histórico y PDFs, seudonimiza el resto y exige confirmación explícita

> Linear: [L1D-208](https://linear.app/l1der-lab-mjbc/issue/L1D-208)

`FEAT-T4b` · Post-MVP · Estimación **5** · HU-13 · FR-14 (baja total), RN-18 (baja total) · AC-T4.1 (RN-18) · ↪ US-046, US-197 · 🔗 Produce para: US-209 (vencimiento de la retención) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [FR-18] → US-150

## Story
Como paciente que pide salir de OncoLens, representado por el administrador, quiero que
mi identidad, mis documentos y mi rastro de investigación desaparezcan de forma
irreversible, para que mi salida sea real.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-BAJA y `admin@test.local`, cuando llama a
  `POST /platform/patients/{id}/withdrawals` con `type = baja_total` y `confirmation =
  "BAJA TOTAL <uuid>"`, entonces responde `200` y, por SQL crudo, no existen sus filas de
  `identity.patient_identity` ni `identity.legal_representative`, sus 2 objetos de
  `clinical-minio`, su `EpisodeSnapshot` ni su fila de `ResearchSubjectMap`. `[FR-14]`
  `[RN-18]`
- **AC-2 (borde · seudonimización)** · Dado el AC-1, cuando se inspeccionan las tablas
  clínicas, entonces los datos restantes no tienen texto libre identificable (notas y
  descripciones vaciadas) y el paciente no aparece en el listado ni en la búsqueda.
  `[RN-18]` `[FR-14]` (asumido en el alcance de la seudonimización)
  > Pendiente de definir en refinamiento (dueño: área legal · afecta: AC-2): "seudonimiza el resto" no dice si los datos clínicos estructurados y los `AIAnalysisRecord` se conservan seudonimizados o se borran; ¿qué se conserva tras la baja total?
- **AC-3 (borde · sin confirmación)** · Dada la petición sin `confirmation` o con un
  texto distinto, cuando se envía, entonces responde `422` y no se borra nada. `[FR-14]`
- **AC-4 (borde · no admin)** · Dado `doc1@test.local`, cuando la envía, entonces responde
  `403`. `[FR-14]` (asumido: solo `admin`)
- **AC-5 (borde · atomicidad)** · Dado un fallo al borrar el segundo PDF de
  `clinical-minio`, cuando ocurre, entonces la base no queda a medias: se reintenta y el
  estado `baja_en_proceso` impide cualquier lectura de la identidad hasta completar.
  (asumido)
- **AC-6 (borde · auditoría sin identidad)** · Dada la baja, cuando se revisa `AuditLog`,
  entonces hay un evento `patient.withdrawal` con el UUID del paciente y nada de su
  identidad, y los eventos anteriores se conservan. `[FR-18]` `[RN-10]`

## Contexto técnico
`WithdrawalService` en `clinical-api`: transacción sobre `identity`, `clinical` y
`research` (el borrado en `research` usa un rol con `DELETE` acotado o una función
`SECURITY DEFINER` revisada, porque el rol de la aplicación es de solo inserción ahí) y
borrado de objetos en `clinical-minio` con reintentos idempotentes. Tests: Supertest y SQL
crudo con FX-T4b-a (AC-1…AC-4, AC-6) y un MinIO falso que falla una vez (AC-5).

## INVEST
**Small** ✓ un servicio de borrado con una transacción y reintentos.
**Testable** ✓ seis tests.

---

## US-200 — Un opt-out de investigación borra el histórico de investigación del paciente y evita el snapshot al egresar

> Linear: [L1D-209](https://linear.app/l1der-lab-mjbc/issue/L1D-209)

`FEAT-T4b` · Post-MVP · Estimación **3** · HU-13, HU-14 · FR-16 (opt-out de investigación), FR-14 · AC-T4.6 (borrado del histórico) · ↪ US-149, US-207 · 🔗 Regresión [FR-18] → US-150

## Story
Como paciente que no acepta la investigación, quiero que al registrarse mi opt-out se
borre lo que haya en el histórico de investigación y no se escriba nada nuevo, para que mi
decisión tenga efecto inmediato.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-INV con `EpisodeSnapshot` y `ResearchSubjectMap`, cuando
  el administrador registra un opt-out `investigacion`, entonces ambas filas se borran en
  la misma transacción del registro de la marca. `[AC-T4.6]` `[FR-16]`
- **AC-2 (borde · egreso posterior)** · Dado P-ACT con opt-out `investigacion` vigente,
  cuando se egresa, entonces no se escribe `EpisodeSnapshot`. `[FR-14]` `[FR-16]`
- **AC-3 (borde · revocación)** · Dada la revocación del opt-out del AC-1, cuando se
  registra, entonces no se restaura nada y el siguiente egreso sí escribe snapshot.
  `[FR-16]` (asumido)
- **AC-4 (borde · no afecta al análisis)** · Dado P-ACT con opt-out `investigacion` y sin
  opt-out `analisis_ia`, cuando se pide un análisis, entonces responde `200`. `[FR-16]`
  `[RN-15]`

## Contexto técnico
`OptOutService` (US-149) invoca `ResearchErasureService` al registrar una marca
`investigacion`; el egreso (US-197) consulta la marca vigente antes de llamar al escritor
de snapshot (US-207). Tests: Supertest y SQL crudo con FX-T4b-a (AC-1…AC-4).

## INVEST
**Small** ✓ un efecto colateral acotado de una marca existente.
**Testable** ✓ cuatro tests.

---

## US-201 — El administrador registra y revoca marcas de opt-out desde la API y una pantalla de administración

> Linear: [L1D-210](https://linear.app/l1der-lab-mjbc/issue/L1D-210)

`FEAT-T4b` · Post-MVP · Estimación **5** · HU-13, HU-14 (opt-out) · FR-16 (UI de administración) · AC-T4.6 (solo `admin`, referencia, auditada) · ↪ US-149 (servicio y validaciones), US-148 · ⛔ DEC-12 (US-022; formato y motivos) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [FR-18] → US-150

## Story
Como administrador, quiero registrar y revocar las marcas de opt-out desde una pantalla,
con la referencia al documento externo y el motivo, para reflejar las decisiones del
sistema de consentimientos sin depender de la línea de comandos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `admin@test.local`, cuando llama a
  `POST /platform/patients/{id}/opt-outs` con `type = analisis_ia`, `reference =
  EXT-TEST-0002` y `reason = solicitud_paciente`, entonces responde `201` y el siguiente
  análisis del paciente responde `403`. `[FR-16]` `[AC-T4.6]` `[RN-15]`
- **AC-2 (borde · no admin)** · Dado `doc1@test.local`, cuando llama al mismo endpoint,
  entonces responde `403` y no se crea la marca. `[AC-T4.6]`
- **AC-3 (borde · referencia o motivo inválidos)** · Dada una referencia fuera de
  `OPT_OUT_REFERENCE_PATTERN` o un motivo fuera del catálogo, cuando se envía, entonces
  responde `422`. `[DEC-12]` `[RN-10]`
- **AC-4 (borde · revocación)** · Dada la marca del AC-1, cuando el admin llama a
  `DELETE …/opt-outs` con la referencia, entonces se agrega una fila `revocado` y el
  siguiente análisis responde `200`. `[FR-16]`
- **AC-5 (borde · pantalla)** · Dado el admin en Playwright, cuando abre "Marcas de
  opt-out" de un paciente, entonces ve el historial de marcas (tipo, acción, fecha,
  motivo) y los formularios de registro y revocación; un doctor no ve esa sección.
  `[FR-16]` `[RU-9]`
- **AC-6 (borde · misma lógica que la CLI)** · Dadas una marca registrada por CLI y otra
  por API, cuando se listan, entonces ambas aparecen con el mismo formato y la vigente es
  la última de cada tipo. `[FR-16]`

## Contexto técnico
Controlador `opt-outs` sobre el mismo `OptOutService` de US-149 (sin duplicar reglas);
página de administración en `web` con Route Handlers. La CLI se mantiene como canal
alternativo. Tests: Supertest (AC-1…AC-4, AC-6) y Playwright (AC-5).

## INVEST
**Small** ✓ una API y una pantalla sobre un servicio existente.
**Testable** ✓ seis tests.

---

## US-202 — Pantallas de egreso, reactivación y baja total con confirmación explícita

> Linear: [L1D-211](https://linear.app/l1der-lab-mjbc/issue/L1D-211)

`FEAT-T4b` · Post-MVP · Estimación **3** · HU-13 · FR-14, NFR-12 · AC-T3.3 · ↪ US-197, US-199 · 🔗 Regresión [RN-23] → US-068

## Story
Como tratante principal o administrador, quiero egresar, reactivar o dar de baja a un
paciente desde su ficha, con una confirmación que me impida hacerlo por error, para
gestionar el ciclo de vida sin herramientas técnicas.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-ACT y `doc1@test.local` (principal) en Playwright,
  cuando elige "Egresar", selecciona el motivo y confirma, entonces la ficha muestra
  "Egresado" y el botón "Reactivar". `[FR-14]`
- **AC-2 (borde · no principal)** · Dado `doc2@test.local`, cuando abre la ficha,
  entonces no ve "Egresar". `[RN-17]`
- **AC-3 (borde · baja total)** · Dado el admin, cuando elige "Baja total", entonces el
  diálogo exige escribir el texto de confirmación y advierte que es irreversible; sin el
  texto exacto, el botón sigue deshabilitado. `[FR-14]`
- **AC-4 (borde · lenguaje)** · Dados los textos nuevos, cuando corre la lista de términos
  prohibidos de US-068, entonces no hay coincidencias. `[RN-23]`

## Contexto técnico
Componentes en la ficha de `web` con Route Handlers hacia `…/episodes` y `…/withdrawals`.
Tests: Playwright con FX-T4b-a (AC-1…AC-3) y la lista de US-068 (AC-4).

## INVEST
**Small** ✓ tres acciones de UI sobre endpoints ya probados.
**Testable** ✓ cuatro tests E2E.

---

## US-023 · DEC-13 — Catálogo de motivos de egreso

> Linear: [L1D-212](https://linear.app/l1der-lab-mjbc/issue/L1D-212)

`FEAT-T4b` · Post-MVP · Estimación **1** · — (decisión) · TBD-06 (motivos de egreso) · FR-14 · Dueño: oncólogo asesor · **Recorrido principal:** no · **Workaround en el MVP:** no hay egreso en el MVP; si FEAT-T4b se construye antes de la firma, lista provisional de motivos en configuración marcada `propuesta` · 🔗 Bloquea: US-197 (motivo del egreso), US-207 (motivo como dato del snapshot)

## Story
Como oncólogo asesor, quiero validar la lista de motivos de egreso, para que el egreso
quede registrado con un motivo útil para el episodio y para el snapshot de investigación.

> Escenario más probable (a refinar en sprint planning): Ingeniería propone un catálogo cerrado y corto (p. ej., fin de seguimiento, traslado a otra institución, fallecimiento, decisión del paciente) y el oncólogo lo firma (asumido: el PRD no trae propuesta).

## AC (Given/When/Then)
- **AC-1** · Dado el catálogo propuesto, cuando se firme, entonces queda versionado con
  firma y fecha, y el documento indica dónde vive (catálogo o configuración). (asumido)
- **AC-2** · Dado el catálogo firmado, cuando se registre en
  `docs/decisions/DEC-13-motivos-egreso.md`, entonces lista cada motivo con su código
  estable, sin texto libre, para que pueda entrar al snapshot sin PHI. `[TBD-06]`
  `[FR-14]` (asumido en el formato)
- **AC-3** · Dado un motivo retirado en una versión posterior del catálogo, cuando se
  registre la nueva versión, entonces el documento declara que los episodios ya cerrados
  conservan su código original. (asumido)
- **AC-4** · Dada la versión firmada, cuando se publique, entonces el documento indica la
  variable de configuración (`DISCHARGE_REASONS`) y su versión, que coinciden con
  `.env.example`. `[RN-22]` (asumido en el nombre de la variable)

## Contexto técnico
Historia de decisión (copiada de `backlog/02-adrs.md`; AC-3 y AC-4 agregados para cumplir el mínimo de cuatro). La mecánica (validar el motivo al
egresar) es de US-197.

## INVEST
**Small** ✓ una lista corta y un documento.
**Testable** ✓ los AC verifican el registro.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-14 y §14: ciclo de vida en el Sprint 4; readme §5.0 S4 KR3 (egreso, reactivación, bajas y snapshot) | Slicing adoptado (`01-requisitos.md` §15): ciclo de vida en Post-MVP | Slicing: Post-MVP; en el MVP todo paciente está activo |
| C-07 | readme §5.0 S5: "`422` para cualquier registro sobre pacientes egresados"; PRD FR-05: `422` en la carga desde el S2 | PRD FR-14 (S4) y RN-17; slicing adoptado | El `422` llega con el egreso (US-198, Post-MVP); antes no existe ningún paciente egresado |
| — | PRD FR-16: UI de administración de opt-out en el Sprint 4; readme §5.0 S4 "HU-14 parcial" | Directriz del usuario: CLI como *workaround* (US-149, S5) | UI en US-201 (Post-MVP); el control `403` no cambia |
| C-08 | PRD FR-16 y §17: UI de opt-out en HU-13 | readme §5.6: HU-14 | Q-05: trazada a ambas (US-200, US-201) |
| — | `backlog/01-requisitos.md` Q-02: designación del tratante principal adelantada al S4 dentro de FEAT-T4b | P-02: equipo tratante fuera del MVP; la designación queda sin efecto junto con el ciclo de vida | El tratante principal lo provee FEAT-T4e (US-203), también Post-MVP |
| — | PRD §18.1.1 y §18.5: AC-P.1 en el S4 dentro del alcance del MVP | Slicing adoptado: snapshot longitudinal con el egreso, Post-MVP | Snapshot en FEAT-AP1 (US-207), Post-MVP |
