# FEAT-01c — Registro de paciente asistido por OCR

> Linear: [L1D-8](https://linear.app/l1der-lab-mjbc/issue/L1D-8)

**Talla:** M (3 historias; reutiliza la extracción de FEAT-01b y el alta de FEAT-T4a) · **Sprint:** 6 · **Label:** `si-hay-capacidad` · **Capacidad:** CAP-01 (registro asistido) · T-3 (AC-T3.2: el sistema no crea pacientes, RN-09) · T-4 (identidad cifrada) · **Recorrido principal:** no
**Requisitos:** FR-03 (asistido, dueña) · RN-09 (dueña: US-180) · RN-10, RN-12, RN-16 (regresión)
**Evidencia:** [→ PRD §5 FR-03], [→ PRD §6 RN-09, RN-10, RN-12, RN-16], [→ PRD §17 FR-03 → HU-07, HU-08, `intake-drafts`, `IntakeDraft`], [→ PRD §18.4 AC-T3.2], [→ readme §3.1 `INTAKE_DRAFT`, `DOCUMENT.patient_id` "nullable mientras es IntakeDraft"], [→ readme §3.2 `IntakeDraft`], [→ readme §4.1 `POST /platform/intake-drafts`, `GET /platform/intake-drafts/{id}`, `POST /platform/patients`], [→ readme §4.2 `DocumentExtractResponse.identityFound`], [→ readme §5 HU-08]
**Dependencias:** ↪ US-047 (alta manual con identidad cifrada, convenio y representante), US-046 (cifrado e índice ciego), US-076, US-078 (almacenamiento y cola), US-082, US-083 (extracción local y gate de PII), US-084 (confianza determinista) · ⛔ ADR-40 (US-013; PII) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-12] → US-050 · 🔗 Regresión [RN-16] → US-047 · 🔗 Regresión [RN-13] → US-143
**Valor:** el alta de un paciente nuevo exige transcribir documento, nombres y fecha desde el PDF que ya trae. Con el borrador asistido, el oncólogo confirma en lugar de transcribir, y el sistema nunca crea un paciente por su cuenta.
**Workaround en el MVP:** alta manual con el formulario mínimo (US-047) y, una vez creado el paciente, carga del PDF con extracción automática de los datos clínicos (US-076, US-082).
**Stories:** US-180, US-181, US-182 (11 puntos)

## Fixtures

- **FX-01c-a · PDFs de alta** (sintéticos, `data/synthetic/intake/`; extracción con adapters falsos de OCR y LLM en `rag-orchestrator`):
  - `alta-cc.pdf` — historia clínica con identidad sintética `tipo = sintetico`, número `SINT-000123`, nombres "Ana Prueba Sintética", año de nacimiento 1968, sexo F; `identityFound` con confianza alta en tipo y número, media en nombres; diagnóstico "carcinoma ductal infiltrante".
  - `alta-ti.pdf` — paciente con tarjeta de identidad sintética (menor), sin representante legal en el documento.
  - `alta-existente.pdf` — identidad igual a la del paciente semilla (a).
  - `alta-error.pdf` — OCR falso que falla tres veces.

---

## US-180 — Al subir un PDF de alta, el sistema crea un borrador con los datos sugeridos y su confianza, sin crear ningún paciente

> Linear: [L1D-69](https://linear.app/l1der-lab-mjbc/issue/L1D-69)

`FEAT-01c` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-08 · FR-03 (asistido), RN-09 (dueña) · AC-T3.2 (no crea pacientes) · ↪ US-076, US-078, US-082, US-083, US-084 · ⛔ ADR-40 (US-013) · 🔗 Regresión [RN-12] → US-050 · 🔗 Regresión [RN-10] → US-046

## Story
Como doctor, quiero subir el PDF de un paciente nuevo y recibir sus datos sugeridos con
la confianza de cada uno, para confirmarlos en lugar de transcribirlos, sabiendo que nada
se crea sin mí.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `alta-cc.pdf`, cuando `doc1@test.local` llama a
  `POST /platform/intake-drafts`, entonces responde `202` con un `IntakeDraft` `pendiente`
  y, cuando termina la extracción, `GET /platform/intake-drafts/{id}` trae
  `suggestedFields` con tipo y número de documento (`alta`), nombres (`media`), año de
  nacimiento y sexo, cada uno con su `extractionConfidence`. `[FR-03]` `[readme §4.1]`
- **AC-2 (invariante · no crea pacientes)** · Dado el AC-1 completo, cuando se cuentan
  las filas, entonces `clinical.patient` e `identity.patient_identity` no cambiaron y el
  `Document` tiene `patient_id = null`. `[RN-09]` `[AC-T3.2]`
- **AC-3 (invariante · identidad cifrada)** · Dado el borrador del AC-1, cuando se lee
  `intake_draft.suggested_fields` con SQL crudo, entonces el número de documento y los
  nombres no aparecen en claro (cifrados con la clave de identidad). `[RN-10]` (asumido
  en el cifrado del borrador)
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-3, campo `suggested_fields`): readme §3.1 guarda `suggested_fields` como `jsonb` en el schema `clinical`; ¿la identidad sugerida se cifra dentro del JSON o se guarda aparte en el schema `identity` hasta la confirmación?
- **AC-4 (borde · extracción fallida)** · Dado `alta-error.pdf`, cuando se agotan los 3
  intentos, entonces el borrador queda `error`, no se crea ningún paciente y el doctor
  puede descartarlo. `[NFR-07]` `[RN-09]`
- **AC-5 (borde · solo modelos locales)** · Dado `dataClassification = real_identificado`
  con el gate abierto, cuando se extrae, entonces solo se invoca el adapter local y ningún
  adapter de nube registra llamadas. `[RN-12]`
- **AC-6 (borde · expiración)** · Dado un borrador `pendiente` con `expires_at` vencido
  (`INTAKE_DRAFT_TTL_HOURS`), cuando corre la limpieza, entonces queda `expirado`, su
  binario se borra de `clinical-minio` y ningún paciente se creó. `[RN-22]` (asumido)
- **AC-7 (borde · logs)** · Dadas las ejecuciones anteriores, cuando se leen los *logs*,
  entonces no contienen número de documento, nombres ni contenido del PDF, solo UUID.
  `[RN-10]` `[NFR-11]`

## Contexto técnico
`POST /platform/intake-drafts` guarda el binario en `clinical-minio` y encola el
`Document` (sin paciente) en la misma cola de US-078; el worker llama a
`/documents/extract` con el PDF en el cuerpo (en memoria, nunca persistido por Backend 2)
y `mode = intake`, y guarda `identityFound` y los campos sugeridos en el borrador. El gate
de PII de US-083 trata la identidad del titular como esperada en este modo
`[ADR-40]`. Tests: Supertest con FX-01c-a y adapters falsos (AC-1, AC-2, AC-4…AC-6),
SQL crudo (AC-3) y captura de *logs* (AC-7).

## INVEST
**Small** ✓ reutiliza cola, extracción y gate; agrega el borrador.
**Testable** ✓ siete tests de integración.

---

## US-181 — El doctor confirma el borrador y solo entonces se crea el paciente, con las mismas reglas que el alta manual

> Linear: [L1D-70](https://linear.app/l1der-lab-mjbc/issue/L1D-70)

`FEAT-01c` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-08, HU-07 · FR-03 (asistido), RN-09, RN-16 · AC-T3.2 · ↪ US-180, US-047 · 🔗 Regresión [RN-16] → US-047 · 🔗 Regresión [RN-13] → US-143

## Story
Como doctor, quiero revisar, corregir y confirmar los datos sugeridos para que el
paciente se cree con lo que yo validé, y que el PDF quede asociado a él como su primer
documento.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el borrador de `alta-cc.pdf`, cuando el doctor llama a
  `POST /platform/patients` con `intakeDraftId`, los campos (con los nombres corregidos),
  `dataOrigin = sintetico` y `agreementReference`, entonces responde `201`, el paciente
  tiene identidad cifrada e índice ciego, el borrador queda `confirmado` y el `Document`
  pasa a ese `patient_id` y entra a la extracción clínica normal. `[FR-03]` `[RN-09]`
- **AC-2 (borde · identificación existente)** · Dado `alta-existente.pdf`, cuando se
  confirma, entonces responde `409` con la opción de abrir el paciente existente y el
  borrador sigue `pendiente`. `[FR-03]`
- **AC-3 (borde · menor sin representante)** · Dado `alta-ti.pdf`, cuando se confirma sin
  representante legal, entonces responde `422` y no se crea el paciente. `[RN-16]`
  `[FR-03]`
- **AC-4 (borde · real sin convenio)** · Dado `dataOrigin = real_identificado` sin
  `agreementReference`, cuando se confirma, entonces responde `422`. `[FR-03]` `[RN-15]`
- **AC-5 (borde · descartar)** · Dado un borrador, cuando el doctor llama a
  `DELETE /platform/intake-drafts/{id}`, entonces queda `descartado`, el binario se borra
  y no se crea ningún paciente. `[RN-09]` (asumido en el *endpoint*)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-5): readme §4.1 no define cómo se descarta un borrador (`IntakeDraft.status = descartado` existe en §3.1); ¿se agrega `DELETE /platform/intake-drafts/{id}` o basta con dejarlo expirar?

## Contexto técnico
El alta reutiliza `PatientService.create` de US-047 (mismas validaciones Zod, cifrado e
índice ciego) con el origen del borrador; la confirmación y el cambio de estado van en una
sola transacción. El `DELETE` no figura en readme §4.1 (ver AC-5). Tests: Supertest con
FX-01c-a (AC-1…AC-5).

## INVEST
**Small** ✓ una ruta de confirmación sobre el alta existente.
**Testable** ✓ cinco tests.

---

## US-182 — La pantalla "Nuevo paciente desde PDF" muestra lo sugerido, resalta lo de confianza media o baja y exige confirmar

> Linear: [L1D-71](https://linear.app/l1der-lab-mjbc/issue/L1D-71)

`FEAT-01c` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-08 · FR-03 (asistido), NFR-12 · AC-T3.2 · ↪ US-180, US-181 · 🔗 Regresión [RN-23] → US-068

## Story
Como doctor, quiero ver en un formulario los datos sugeridos con los dudosos resaltados,
corregirlos y confirmar, para registrar al paciente rápido sin aceptar a ciegas lo que
leyó el OCR.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `alta-cc.pdf` en Playwright contra Compose, cuando el
  doctor sube el PDF desde "Nuevo paciente desde PDF", entonces ve el formulario prellenado
  con "Nombres" resaltado y el texto "Confianza media: verifique", y tras confirmar llega a
  la ficha del paciente nuevo. `[FR-03]` `[NFR-12]`
- **AC-2 (borde · procesando)** · Dado un borrador `pendiente`, cuando se muestra,
  entonces el formulario indica "Leyendo el documento…" y el botón "Confirmar" está
  deshabilitado. (asumido)
- **AC-3 (borde · error)** · Dado `alta-error.pdf`, cuando termina, entonces se muestra
  "No se pudo leer el documento; registre el paciente manualmente" con enlace al alta
  manual. `[FR-03]`
- **AC-4 (borde · sin confirmación)** · Dado el formulario prellenado, cuando el doctor
  sale sin confirmar, entonces el listado de pacientes no cambió. `[RN-09]` `[AC-T3.2]`
- **AC-5 (borde · lenguaje)** · Dados los textos nuevos, cuando corre la lista de
  términos prohibidos de US-068, entonces no hay coincidencias. `[RN-23]`

## Contexto técnico
Página `app/patients/new-from-pdf` en `web` con Route Handlers hacia
`/platform/intake-drafts`; *polling* del estado del borrador. Tests: Playwright con
FX-01c-a sembrado (AC-1…AC-4) y la lista de US-068 (AC-5).

## INVEST
**Small** ✓ un formulario sobre dos endpoints ya probados.
**Testable** ✓ cinco tests E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-03 y §14: registro asistido en el Sprint 2; readme §5.0 S2 (HU-08) | Slicing adoptado (`01-requisitos.md` §15): S6 si hay capacidad | Slicing: S6 `si-hay-capacidad`; alta manual + carga como *workaround* |
