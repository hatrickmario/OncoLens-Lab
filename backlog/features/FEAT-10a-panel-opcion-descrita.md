# FEAT-10a — Panel de análisis y opción descrita en la evidencia

> Linear: [L1D-23](https://linear.app/l1der-lab-mjbc/issue/L1D-23)

**Talla:** M · **Sprint:** 1 (US-060, US-061) · 3 (US-062) · **Capacidad:** CAP-10 (S1), CAP-05 (AC-05.1 y AC-05.3 en la UI) · consume T-2 y T-3 · **Recorrido principal:** sí
**Requisitos:** FR-09 (UI del S1, vía HU-03) · FR-10 (sección de descartadas en la UI) · RN-03 (dueña) · RN-28 (texto del criterio de orden visible desde el S1: neutro en el S1–S2; el de aplicabilidad es de US-126 desde el S3; la selección por aplicabilidad es de US-125 y el orden de hasta 3, de US-134) · NFR-12 (panel) · SEG-01 (Route Handler)
**Evidencia:** [→ PRD §5 FR-09, FR-10], [→ PRD §6 RN-03, RN-28], [→ PRD §7 NFR (accesibilidad)], [→ PRD §18.3.10 AC-10.1, AC-10.2, AC-10.4], [→ PRD §18.3.5 AC-05.3], [→ readme §5 HU-03], [→ readme §6 OL-04], [→ readme §2.1 Route Handler, no Server Action], [→ readme §3.3 #8], [→ readme §6.1 #4, #8, #15], [→ CLAUDE.md "El navegador solo habla con `web`"]
**Dependencias:** ↪ US-053 (respuesta del gateway), US-211 (sesión mínima, S1), US-051 (`PatientContextCard`) · 🔗 Consume: US-064 (descartadas), US-067 (Base del análisis en la UI), US-069 (avisos de IA), US-068 (lista de términos prohibidos) · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069 · 🔗 Medido en: US-072 (M-10.1, M-10.2 sobre salidas)
**Valor:** es lo que el oncólogo ve y usa: una pregunta y un análisis legible en el que la opción descrita viene con sus fuentes verificables, la relevancia no se confunde con eficacia y lo que no se pudo respaldar queda aparte, solo para revisión (P5, P6, P12). Sin esta Feature el walking skeleton no es demostrable.
**Stories:** US-060, US-061 (8 puntos, S1) · US-062 (3 puntos, S3)

---

## US-060 — El navegador pide el análisis solo a `web` mediante un Route Handler

> Linear: [L1D-139](https://linear.app/l1der-lab-mjbc/issue/L1D-139)

`FEAT-10a` · Sprint 1 · Estimación **3** · HU-03 · FR-09, SEG-01, SEG-09 · ↪ US-211, US-053 · Ticket: OL-04

> La cookie que reenvía el Route Handler es la de la sesión mínima del S1 (US-211: login, cookie opaca y guard); la expiración y el cierre de sesión llegan con US-044 en el S2.

## Story
Como responsable de seguridad, quiero que el navegador solo hable con `web` y que el
análisis pase por un Route Handler que reenvía la sesión a `clinical-api`, para que los
backends nunca queden expuestos al navegador ni a otro origen.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un doctor autenticado, cuando el navegador hace
  `POST /api/evidence-analyses`, entonces el Route Handler reenvía el body y la cookie
  `oncolens_session` a `clinical-api` por su URL interna y devuelve el mismo status y el
  mismo cuerpo JSON que respondió `clinical-api`. `[OL-04]` `[readme §2.1]`
- **AC-2 (borde · otro origen)** · Dado un `POST /api/evidence-analyses` con cabecera
  `Origin` distinta del origen configurado, cuando llega a `web`, entonces responde
  `403` y `clinical-api` registra cero requests. `[SEG-01]` `[PRD §10]`
- **AC-3 (borde · red del navegador)** · Dado un análisis completo en Playwright contra
  Compose, cuando se registran las requests del navegador, entonces todas van al origen
  de `web` y ninguna a `clinical-api` ni a `rag-orchestrator`. `[OL-04]` `[CLAUDE.md]`
- **AC-4 (borde · errores sin reinterpretar)** · Dado `clinical-api` respondiendo `429`
  con `Retry-After: 30`, o `504`, cuando el Route Handler los recibe, entonces devuelve
  el mismo status, el mismo cuerpo y la cabecera `Retry-After`. `[OL-04]`
- **AC-5 (borde · URL interna fuera del cliente)** · Dada la build de producción de
  `web`, cuando se busca el valor de `CLINICAL_API_URL` en los archivos estáticos del
  cliente (`.next/static`), entonces no aparece. `[OL-04]`

## Contexto técnico
`apps/web/app/api/evidence-analyses/route.ts` (Route Handler, no Server Action);
`CLINICAL_API_URL` solo como variable de servidor. Respuesta JSON completa, sin
streaming (6.1 #8). Tests: test unitario del Route Handler con `fetch` simulado (AC-1,
AC-2, AC-4), Playwright contra Compose (AC-3) y test de build (AC-5).

## INVEST
**Small** ✓ un Route Handler de reenvío y su verificación de `Origin`.
**Testable** ✓ cinco tests automatizados.

---

## US-061 — El panel muestra la opción descrita con sus citas, la relevancia como metadato secundario y las descartadas aparte

> Linear: [L1D-140](https://linear.app/l1der-lab-mjbc/issue/L1D-140)

`FEAT-10a` · Sprint 1 · Estimación **5** · HU-03 · FR-09 (UI S1), FR-10 (UI), RN-03 (dueña), RN-28 (texto del criterio), NFR-12 · AC-10.1 (S1), AC-10.2 (S1), AC-10.4, AC-05.3 (UI) · ↪ US-060, US-211, US-051 · 🔗 Consume: US-064, US-067, US-069 · 🔗 Regresión [RN-28] (selección y texto por aplicabilidad) → US-125, US-126 AC-7 (activa desde S5) · Ticket: OL-04

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** la ficha (US-051) y el resumen de la Base del análisis (US-067) llegan en el S2. En el S1 el panel se abre por ruta directa (`/patients/{id}/evidence`) sobre el paciente semilla, con la sesión de US-211; `AnalysisBasisPanel` se monta con US-067.

## Story
Como oncólogo, quiero ver la opción que describe la evidencia con sus fuentes citadas y
verificables, la relevancia como un dato secundario y lo descartado en una sección
aparte, para entender qué dice la evidencia sin confundir relevancia con eficacia ni
tomar por válido algo que no se pudo respaldar.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local` en el panel del paciente semilla (a),
  con el stack en perfil de test (adapters falsos `LLM-OK` y FX-06a-a), cuando escribe
  `Q-HER2` y presiona "Analizar evidencia", entonces ve bajo el encabezado "Opciones
  descritas en la evidencia" una tarjeta con la opción, su justificación y al menos un
  chip de cita con `sourceName` "NCI PDQ" y `externalId` "CDR-TEST-001" en su idioma
  original. `[HU-03]` `[OL-04]` `[AC-10.2]`
- **AC-2 (borde · relevancia secundaria)** · Dada la tarjeta del AC-1, cuando se
  inspecciona, entonces la relevancia aparece con el rótulo exacto "Relevancia de la
  evidencia" y el valor `0,87`, después de las citas y con estilo secundario, y no
  aparece ningún rótulo "Evidencia" a secas ni "eficacia". `[RN-03]` `[AC-10.2]` `[ADR-8]`
- **AC-3 (borde · criterio de selección visible, S1–S2)** · Dada la respuesta del AC-1
  (1 opción, `applicability = []`), cuando se renderiza, entonces encima de la opción se
  lee "Seleccionada por relevancia de la búsqueda, no por eficacia; la comparación con la
  población estudiada llega en una versión posterior" y no aparece "Ordenadas por
  coincidencia con la población estudiada, no por eficacia". `[RN-28]` `[AC-10.1]`
  `[RN-23]` `[§15 resp. 7]`
- **AC-4 (borde · descartadas)** · Dada una respuesta con `LLM-SIN-SOPORTE`
  (`evidenceOptions = []`, una descartada), cuando se renderiza, entonces no hay tarjeta
  de opción, existe la sección colapsada "Descartadas por falta de soporte — solo para
  revisión", y al expandirla muestra la opción, el motivo y la afirmación sin soporte
  resaltada, sin ningún control para vincularla a un tratamiento.
  `[FR-10]` `[HU-03]` `[AC-10.4]`
- **AC-5 (borde · pregunta no terapéutica)** · Dada una respuesta
  `status = con_evidencia` con `evidenceOptions = []` y sin descartadas (`Q-TOX`),
  cuando se renderiza, entonces no aparece la sección "Opciones descritas en la
  evidencia" ni la de descartadas. `[AC-05.3]` (la Base del análisis visible en ese caso
  la verifica US-067, S2)
- **AC-6 (borde · accesibilidad)** · Dado el panel, cuando se navega solo con teclado,
  entonces el `textarea` tiene `label` asociado, el botón se alcanza con Tab y se activa
  con Enter, y el resultado se anuncia en una región `aria-live="polite"`.
  `[NFR-12]` `[OL-04]`

## Contexto técnico
Atomic Design sobre shadcn/ui (OL-04 tarea 2): `CitationChip`, `RelevanceMeta`,
`EvidenceOptionCard`, `DiscardedOptions`, `AnalysisBasisPanel` (US-067),
`AnalysisResult`, `EvidencePanelTemplate`; página
`app/(dashboard)/patients/[patientId]/evidence/page.tsx`. Tipos importados de
`packages/api-contracts`. El componente ya itera `evidenceOptions[]` y reserva los
bloques de síntesis y aplicabilidad (S3–S4). El texto del criterio es un literal del
catálogo i18n de `web` (`evidence.orderCriterion.relevance`), no código, y pasa la lista
de términos prohibidos de US-068; el componente lo elige por la respuesta
(`applicability = []` → neutro), de modo que en el S3 cambia solo al llegar la
aplicabilidad (US-126 AC-7). Mientras no haya filtros reales (S3), el
panel envía `sourcesSelected` con las tres fuentes en `true` y no muestra selectores.
El perfil de test de Compose (`RAG_ADAPTERS=fake`) carga FX-06a-a y FX-06a-b para que
los E2E sean deterministas. Tests: Playwright contra Compose (AC-1 a AC-6) y tests de
componente (Vitest + Testing Library) para AC-2 a AC-5.

## Non-goals
Avisos por tarjeta (`warnings`: FR-11; sin verificar en el S2, US-101; conflicto y faltantes en el S4, US-136). Selección de la opción única
por aplicabilidad y su texto de criterio (S3, US-125 y US-126 AC-7). Hasta 3 opciones
(S4, US-134). Síntesis y aplicabilidad (S3–S4). Selectores de
fuentes y filtros (S3).
> Pendiente de definir en refinamiento (dueño: usuario · afecta: nada en el S1): la "traducción opcional etiquetada" de las citas (PRD §12 Idioma, readme OL-04) no tiene FR, AC ni sprint (V-10); ¿entra en el MVP y en qué sprint?

## INVEST
**Small** ✓ componentes de presentación sobre un contrato congelado.
**Testable** ✓ seis escenarios E2E y de componente con respuestas fijas.

---

## US-062 — El panel resuelve los estados de espera, sin evidencia y error sin mostrar detalles internos

> Linear: [L1D-141](https://linear.app/l1der-lab-mjbc/issue/L1D-141)

`FEAT-10a` · Sprint 3 · Estimación **3** · HU-03 · FR-09 (bordes en la UI), RN-30 (UI del `429`), RN-20 (UI de `tipo_no_habilitado`) · AC-10.4 ("sin evidencia"), AC-06.1 (códigos en la UI) · ↪ US-060, US-061

## Story
Como oncólogo, quiero que el panel me diga con claridad si el análisis está en curso,
si no hubo evidencia suficiente o si algo falló, para no confundir una falla o una
ausencia de evidencia con una respuesta.

## AC (Given/When/Then)
- **AC-1 (happy path · espera)** · Dado un análisis en curso, cuando el doctor hace
  doble clic en "Analizar evidencia", entonces se muestra un *skeleton*, el botón queda
  deshabilitado y `clinical-api` recibe una sola request (un solo `AIAnalysisRecord`).
  `[OL-04]`
- **AC-2 (borde · sin evidencia)** · Dada una respuesta `status = sin_evidencia`
  (`Q-SIN`), cuando se renderiza, entonces se lee "No se encontró evidencia suficiente en
  las fuentes consultadas", no aparece ninguna tarjeta ni texto con forma de opción, y se
  muestra la Base del análisis. `[HU-03]` `[AC-10.4]` `[OL-04]`
- **AC-3 (borde · sesión expirada)** · Dada una sesión expirada, cuando el doctor envía
  la pregunta, entonces es redirigido al login sin que se muestre ningún dato del
  paciente. `[OL-04]` `[FR-01]`
- **AC-4 (borde · validación)** · Dada una pregunta de 2001 caracteres, cuando se envía,
  entonces el mensaje de error aparece junto al campo y el contador indica el máximo de
  2000. `[AC-05.1]` `[OL-04]`
- **AC-5 (borde · límite y fallos)** · Dada una respuesta `429` con `Retry-After: 30`,
  cuando se renderiza, entonces el mensaje indica que puede reintentar en 30 segundos; y
  dada una `502`, `503`, `504` o un fallo de red, el mensaje es genérico con un botón
  "Reintentar" y no contiene nombres de servicios, trazas ni el `traceId` completo.
  `[OL-04]` `[RN-30]` `[PRD §10]`
- **AC-6 (borde · tipo no habilitado)** · Dada una respuesta
  `status = tipo_no_habilitado`, cuando se renderiza, entonces se lee "Tipo de cáncer
  fuera del alcance del piloto" y no aparece ninguna tarjeta de opción. `[RN-20]` `[OL-04]`

## Contexto técnico
Estados de `AnalysisResult` (OL-04 tarea 4). Textos en un archivo de mensajes de UI
(fuente única que también recorre la lista de términos prohibidos, US-068). Tests:
componente (Vitest + Testing Library) con respuestas simuladas para cada estado, y
Playwright contra Compose para AC-1 a AC-3.

## Non-goals
Pasos de progreso visibles (ADR-42, S4; workaround: indicador indeterminado).

## INVEST
**Small** ✓ estados de un componente existente.
**Testable** ✓ seis tests de componente y E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | readme OL-04 alcance complementario: avisos por tarjeta según `warnings` en el S1 | PRD FR-11: avisos de datos pendientes en el S2 y de conflicto y faltantes en el S3 | PRD: sin avisos por tarjeta en el S1 (US-101, S2) |
| — | readme OL-04 alcance complementario: citas con traducción automática opcional | PRD §12: "traducción opcional etiquetada" sin FR ni sprint (V-10) | Fuera del S1; queda como nota pendiente en US-061 |
| C-14 | PRD RN-19 y readme OL-04: "Análisis generado por IA — requiere validación…" (raya) | PRD AC-T3.1: "Análisis generado por IA: requiere validación…" ("texto actualizado") | Lo resuelve la dueña de RN-19 (US-069, FEAT-T3); este panel muestra el literal que fija esa historia |
| Slicing v2 | readme OL-04 (S1): estados de espera, sin evidencia y error del panel en el S1 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-062 en el S3 | El S1 muestra la opción y las descartadas (US-061); los estados del panel llegan en el S3 |
