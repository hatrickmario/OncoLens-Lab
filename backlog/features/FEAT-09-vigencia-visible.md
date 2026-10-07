# FEAT-09 — Vigencia visible de la evidencia

> Linear: [L1D-22](https://linear.app/l1der-lab-mjbc/issue/L1D-22)

**Talla:** M (4 historias acotadas; extiende contratos existentes) · **Sprint:** 6 · **Label:** `si-hay-capacidad` · **Capacidad:** CAP-09 (AC-09.1…AC-09.4) · CAP-10 (AC-10.2: vigencia en la tarjeta) · T-1 · **Recorrido principal:** no
**Requisitos:** FR-26 (dueña) · RN-25 (regresión; dueña US-127) · TBD-15 (`EVIDENCE_STALE_YEARS`, CAL) · NFR-12 (texto, no solo color)
**Evidencia:** [→ PRD §5 FR-26], [→ PRD §6 RN-04, RN-22, RN-25], [→ PRD §16 TBD-15], [→ PRD §18.3.9 AC-09.1…AC-09.4, M-09.1, M-09.2], [→ PRD §18.3.10 AC-10.2], [→ readme §4.1 `CitedSource` (`possiblyOutdated`, `newerVersionAvailable`, `guidelineVersion`, `lastUpdatedAt`)], [→ readme §5 HU-20], [→ backlog/02-adrs.md §4.1 (TBD-15 como CAL)]
**Dependencias:** ↪ US-063, US-127 (metadatos copiados del catálogo), US-119 (`CorpusRelease` y fecha de corte), US-061 (tarjeta de la opción), US-066 (Base del análisis, inciso f) · US-165 ↪ US-174 (historial, FEAT-11a) · ⛔ ADR-36 (US-007; fuentes con versión de guía) · 🔗 Medido en: US-158 (M-09.1, M-09.2) · 🔗 Regresión [RN-25] → US-127 · 🔗 Regresión [RN-23] → US-068 (textos nuevos)
**Valor:** el oncólogo descarta hoy evidencia vieja a ojo (Discovery P8). Con la vigencia en cada cita y la fecha de corte del corpus, sabe si lo que lee está al día y si una guía tiene una versión más nueva, sin salir del panel.
**Workaround en el MVP:** la fecha de corte del corpus ya se muestra en la Base del análisis (inciso f, US-066) y los metadatos de la fuente (incluidas fechas y versión cuando existen) se copian del catálogo desde el S3 (US-127); falta solo la etiqueta "Posiblemente desactualizada", el encabezado visible y la marca de versión más reciente en el historial. El oncólogo juzga la antigüedad con la fecha que ya ve.
**Stories:** US-162 … US-165 (12 puntos)

## Fixtures

- **FX-09-a · Corpus con vigencias** (schema `corpus` de test, Milvus de test; reloj de test **2026-10-01**; `EVIDENCE_STALE_YEARS = 5` en la configuración de test):
  - `doc-v1` — guía, `source_name = "NCI PDQ"`, `language = en`, `published_at = 2019-03-01`, `last_updated_at = 2026-05-01`, `guideline_version = "2026-05"`, `version_group_id = vg-1`, `is_current = true`.
  - `doc-v2` — ECA, `language = en`, `published_at = 2018-06-15`, `last_updated_at = null` (antigüedad 8 años → "Posiblemente desactualizada").
  - `doc-v3` — publicación, `language = es`, sin `published_at` ni `last_updated_at`.
  - `doc-v1-old` — versión anterior de `vg-1`, `guideline_version = "2024-02"`, `is_current = false` (citada por el análisis histórico `AN-V-OLD`, `corpus_release = rel-test-1`).
  - `CorpusRelease` `rel-test-2` con `cutoff_date = 2026-09-30` (vigente).

---

## US-162 — `/rag/query` entrega en cada cita la fecha, la versión, el tipo de fuente y el idioma copiados del catálogo, y la marca de antigüedad

> Linear: [L1D-135](https://linear.app/l1der-lab-mjbc/issue/L1D-135)

`FEAT-09` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-20 · FR-26 (dueña) · AC-09.1, AC-09.3 · ↪ US-063, US-127 · 🔗 Regresión [RN-25] → US-127 · 🔗 Medido en: US-158

## Story
Como oncólogo, quiero que cada cita llegue con su fecha de publicación o actualización,
su versión si es una guía, su tipo de fuente y su idioma, y marcada si es antigua, para
juzgar su vigencia sin abrir la fuente.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una opción que cita `doc-v1`, cuando responde
  `/rag/query`, entonces su `CitedSource` trae `lastUpdatedAt = 2026-05-01`,
  `guidelineVersion = "2026-05"`, `sourceType = guideline`, `language = en` y
  `possiblyOutdated = false`, iguales al catálogo. `[AC-09.1]` `[FR-26]` `[RN-25]`
- **AC-2 (borde · antigüedad)** · Dada una cita de `doc-v2` (sin `last_updated_at`,
  publicada hace 8 años), cuando se responde, entonces `possiblyOutdated = true`
  calculado con `published_at` y `EVIDENCE_STALE_YEARS = 5`. `[AC-09.3]` `[RN-22]`
- **AC-3 (borde · sin fechas)** · Dada una cita de `doc-v3`, cuando se responde,
  entonces `publishedAt` y `lastUpdatedAt` son `null` y `possiblyOutdated = false` (no se
  infiere antigüedad sin fecha). `[RN-25]` (asumido en `possiblyOutdated`)
- **AC-4 (invariante · nunca del texto generado)** · Dado un LLM falso que escribe en la
  cita `guidelineVersion = "2030"`, cuando se valida, entonces la cita conserva
  `"2026-05"`. `[RN-04]` `[RN-25]`
- **AC-5 (borde · configuración)** · Dado `EVIDENCE_STALE_YEARS = 10`, cuando se repite
  el AC-2, entonces `possiblyOutdated = false`, sin cambiar código. `[RN-22]` `[TBD-15]`

## Contexto técnico
Regla pura en `domain/freshness.py` de Backend 2 (`possibly_outdated(published_at,
last_updated_at, now, stale_years)`), aplicada después de la copia de metadatos de
US-127. El valor viene de `EVIDENCE_STALE_YEARS` (propuesta 5, TBD-15); el AC del
oncólogo que lo confirma es el AC-5 de US-163. Tests: Pytest unitario de la regla y de
integración de `/rag/query` con FX-09-a y adapters falsos.

## INVEST
**Small** ✓ una regla pura y la copia de cuatro campos que ya existen en el catálogo.
**Testable** ✓ cinco tests deterministas.

---

## US-163 — El umbral de antigüedad vive en configuración, lo confirma el oncólogo y aplica igual en análisis y en el historial

> Linear: [L1D-136](https://linear.app/l1der-lab-mjbc/issue/L1D-136)

`FEAT-09` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-20 · FR-26, RN-22 · AC-09.3 · TBD-15 (CAL) · ↪ US-162, US-037

## Story
Como oncólogo asesor, quiero confirmar cuántos años hacen que una fuente se considere
posiblemente desactualizada y que el valor se aplique igual en todo el producto, para que
la etiqueta signifique lo mismo en cada pantalla.

## AC (Given/When/Then)
- **AC-1 (happy path · arranque)** · Dado `EVIDENCE_STALE_YEARS = 5`, cuando arrancan
  `clinical-api` y `rag-orchestrator`, entonces ambos exponen el valor en su `/health`
  (bloque de configuración) y es el mismo. `[RN-22]` `[TBD-15]`
- **AC-2 (borde · valor inválido)** · Dado `EVIDENCE_STALE_YEARS = 0` o no numérico,
  cuando arranca `rag-orchestrator`, entonces no queda listo y el log nombra la variable.
  `[RN-22]`
- **AC-3 (borde · historial)** · Dado el análisis histórico `AN-V-OLD`, cuando se abre en
  el historial con el reloj de test, entonces `possiblyOutdated` se recalcula con el valor
  vigente y la fecha copiada en el snapshot, no con la del día en que se ejecutó.
  `[AC-09.3]` (asumido)
- **AC-4 (borde · valores distintos)** · Dado `EVIDENCE_STALE_YEARS` distinto entre los
  dos backends, cuando `clinical-api` arranca, entonces registra una advertencia y usa el
  valor que trae cada cita desde Backend 2 (no lo recalcula). (asumido)
- **AC-5 (registro de la calibración)** · Dado el valor confirmado por el oncólogo
  asesor, cuando se registra, entonces `docs/decisions/CAL-TBD-15.md` lo contiene con
  fecha y revisor, y coincide con el `.env.example`. `[TBD-15]` (asumido)

## Contexto técnico
Variable validada al arranque con el módulo de configuración de US-037 (Zod / Pydantic
Settings). El historial (US-174) recalcula la marca con la regla compartida
(`packages/api-contracts` expone solo el booleano). Tests: arranque con configuraciones
inválidas (AC-2), Supertest de `/health` (AC-1, AC-4) y del historial con FX-09-a (AC-3).

## INVEST
**Small** ✓ una variable, su validación y su lectura en dos lugares.
**Testable** ✓ cinco tests.

---

## US-164 — La tarjeta y las citas muestran la vigencia, y el análisis muestra "Evidencia actualizada al ‹fecha de corte›"

> Linear: [L1D-137](https://linear.app/l1der-lab-mjbc/issue/L1D-137)

`FEAT-09` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-20 · FR-26, NFR-12 · AC-09.1, AC-09.2, AC-09.3, AC-10.2 (vigencia) · ↪ US-162, US-061, US-119 · 🔗 Regresión [RN-23] → US-068 · 🔗 Medido en: US-158

## Story
Como oncólogo, quiero ver en cada cita su fecha, su versión y su idioma, y arriba del
análisis la fecha de corte del corpus, para saber de un vistazo cuán actual es la
evidencia que estoy leyendo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un análisis que cita `doc-v1` (Playwright contra Compose
  con FX-09-a), cuando se abre el panel, entonces la cita muestra "Actualizada:
  2026-05-01 · Versión 2026-05 · Guía · EN" y el encabezado del análisis muestra
  "Evidencia actualizada al 2026-09-30". `[AC-09.1]` `[AC-09.2]` `[AC-10.2]`
- **AC-2 (borde · antigua)** · Dada una cita de `doc-v2`, cuando se muestra, entonces
  aparece la etiqueta de texto "Posiblemente desactualizada" (no solo un color), sin
  bloquear la lectura ni ocultar la opción. `[AC-09.3]` `[RN-26]` `[NFR-12]`
- **AC-3 (borde · sin fecha)** · Dada una cita de `doc-v3`, cuando se muestra, entonces
  el campo de fecha dice "No disponible". `[RN-25]`
- **AC-4 (borde · sin evidencia)** · Dado un análisis `sin_evidencia`, cuando se abre,
  entonces el encabezado igual muestra "Evidencia actualizada al 2026-09-30". `[AC-09.2]`
  `[AC-T2.3]`
- **AC-5 (borde · lenguaje)** · Dados los textos nuevos, cuando corre la lista de
  términos prohibidos de US-068 sobre la UI, entonces no hay coincidencias. `[RN-23]`

## Contexto técnico
Componentes `CitationFreshness` y `CorpusCutoffBanner` en `apps/web` (Atomic Design de
OL-04), alimentados por `CitedSource` y `analysisBasis.corpusCutoffDate`. Tests:
Playwright contra Compose con FX-09-a sembrado (AC-1…AC-4) y la lista de US-068 (AC-5).

## INVEST
**Small** ✓ dos componentes de presentación sobre datos que ya llegan.
**Testable** ✓ cinco tests E2E.

---

## US-165 — En el historial la cita conserva su versión original y avisa "Existe una versión más reciente"

> Linear: [L1D-138](https://linear.app/l1der-lab-mjbc/issue/L1D-138)

`FEAT-09` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-20, HU-11 · FR-26, FR-12 · AC-09.4 · ↪ US-174 (historial, FEAT-11a), US-162 · 🔗 Medido en: US-159 (M-11.2, citas resolubles)

## Story
Como oncólogo, quiero que al abrir un análisis antiguo la cita siga mostrando la versión
que se usó y me avise si hoy hay una más nueva, para no confundir lo que vi entonces con
lo que dice la guía actual.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `AN-V-OLD` que citó `doc-v1-old` (`"2024-02"`), cuando se
  abre con `GET …/analyses/{AN-V-OLD}`, entonces la cita trae `guidelineVersion =
  "2024-02"` desde el snapshot y `newerVersionAvailable = true` porque `doc-v1` (`vg-1`)
  es la vigente. `[AC-09.4]` `[FR-26]`
- **AC-2 (borde · sin versión nueva)** · Dado un análisis que citó `doc-v1` (vigente),
  cuando se abre, entonces `newerVersionAvailable = false`. `[AC-09.4]`
- **AC-3 (invariante · snapshot)** · Dado `AN-V-OLD`, cuando se abre, entonces el texto
  de la cita es `chunkTextSnapshot` guardado al ejecutar, aunque `doc-v1-old` tenga
  `is_current = false`. `[RN-05]` `[FR-12]`
- **AC-4 (borde · UI)** · Dado `AN-V-OLD` en Playwright, cuando se abre el historial,
  entonces la cita muestra "Versión 2024-02 · Existe una versión más reciente" en texto.
  `[AC-09.4]` `[NFR-12]`
- **AC-5 (borde · análisis nuevo)** · Dado un análisis recién ejecutado, cuando se
  responde, entonces `newerVersionAvailable` no viene (solo en el historial).
  `[readme §4.1]`

## Contexto técnico
`clinical-api` consulta a Backend 2 por `version_group_id` de los documentos citados
(`GET /corpus/versions?groupIds=` interno, solo metadatos del corpus, nunca datos
clínicos) al servir el historial, y marca `newerVersionAvailable`. Tests: Supertest con
el cliente de Backend 2 falso y FX-09-a (AC-1…AC-3, AC-5), Playwright (AC-4).
> Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: campo `newerVersionAvailable`): el contrato interno de Backend 2 (readme §4.2) no tiene un endpoint de versiones del corpus; ¿se agrega uno o se guarda `version_group_id` en el snapshot y se compara contra la última `CorpusRelease` publicada por US-119?

## INVEST
**Small** ✓ un booleano calculado al leer el historial.
**Testable** ✓ cinco tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-26, §14 y §18.1.1 CAP-09: Sprint 3 | Slicing adoptado (`01-requisitos.md` §15): vigencia en el S6 si hay capacidad | Slicing: S6 `si-hay-capacidad`; fecha de corte (inciso f) y metadatos copiados ya existen desde el S1/S3 como *workaround* |
| — | `backlog/02-adrs.md` §4.1: TBD-15 se calibra en "FEAT-09 · historia de vigencia (S3)" | Slicing adoptado | Calibración en US-163 (S6) |
