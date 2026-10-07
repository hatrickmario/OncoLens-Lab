# FEAT-T3 — Control humano: lenguaje no prescriptivo, avisos de IA y avisos que no bloquean

> Linear: [L1D-39](https://linear.app/l1der-lab-mjbc/issue/L1D-39)

**Talla:** L · **Sprint:** 1 (US-068, US-069) · 4 (US-070) · 5 (US-071, cuando existen todos los avisos clínicos; verificación completa en G-Piloto, S6) · **Capacidad:** T-3 (AC-T3.1, AC-T3.2, AC-T3.3, AC-T3.4) · CAP-10 (AC-10.3) · **Recorrido principal:** sí
**Requisitos:** RN-23 (dueña) · RN-19 (dueña) · RN-26 (dueña) · AC-T3.2 (dueña; regresión en FEAT-01c, FEAT-03a/b) · M-10.2 (medido en T-5)
**Evidencia:** [→ PRD §6 RN-19, RN-23, RN-26], [→ PRD §18.4 T-3, AC-T3.1–AC-T3.4], [→ PRD §18.3.10 AC-10.3, M-10.2], [→ PRD §2.1 G-14], [→ PRD §13 Lenguaje], [→ PRD §1.3 PP-1, PP-6], [→ readme §5 HU-03 escenarios 1 y 4], [→ readme §6 OL-04 (aviso fijo, etiqueta permanente)], [→ readme §2.6 Lenguaje], [→ readme §6.0 DoD], [→ docs/AS-IS.md P12]
**Dependencias:** ↪ US-061, US-062 (textos del panel), US-053 (campo `disclaimer`) · US-071: ↪ US-101 (avisos de no verificados, S4), FEAT-04 US-005 (aviso previo de faltantes, S4), US-124 (población no comparable y avisos por criterio, S5), US-136 (avisos de conflicto y faltantes en la tarjeta, S5) · 🔗 Medido en: US-072 (M-10.2 y G-14 sobre las salidas del set de evaluación) · 🔗 Regresión [RN-15] → US-148 (activa desde S6)
**Valor:** el oncólogo pidió explícitamente que la herramienta no le diga qué hacer (PP-1, "no me digas qué hacer"; P12: control humano). Esta Feature garantiza que ninguna pantalla ni salida use lenguaje prescriptivo, que toda salida generada se identifique como IA que requiere validación, que el sistema nunca ejecute una acción clínica por su cuenta y que ningún aviso clínico le impida continuar.
**Stories:** US-068, US-069 (5 puntos, S1) · US-070 (2 puntos, S4) · US-071 (3 puntos, S5) — total 10 puntos

---

## US-068 — Ningún texto de la UI ni salida generada usa términos prescriptivos de la lista prohibida

> Linear: [L1D-193](https://linear.app/l1der-lab-mjbc/issue/L1D-193)

`FEAT-T3` · Sprint 1 · Estimación **3** · HU-03 · RN-23 (dueña) · AC-10.3, AC-T3.4 · ↪ US-061, US-062 (S3: sus estados se suman al recorrido del AC-3 al existir) · 🔗 Regresión [RN-23] (salidas generadas en ejecución) → US-064 (AC-7, AC-8) · 🔗 Medido en: US-072 (M-10.2 = 0 sobre las salidas del set de evaluación)

## Story
Como oncólogo, quiero que la herramienta describa lo que dice la evidencia sin decirme
qué tratamiento darle a mi paciente, para conservar el control de la decisión clínica.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la lista versionada `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`,
  cuando se carga, entonces incluye al menos "recomendado para este paciente", "debe
  recibir", "el mejor tratamiento" e "indicado para usted", y sus equivalentes en inglés
  ("recommended for this patient", "should receive", "the best treatment", "indicated
  for you"). `[RN-23]` `[AC-10.3]`
- **AC-2 (borde · variantes)** · Dado el verificador `checkProhibitedTerms`, cuando
  recibe "RECOMENDADO PARA ESTE PACIENTE", "Recomendado para este paciente." y "debe
  recibir" sin tildes ni mayúsculas, entonces devuelve una coincidencia por cada uno; y
  con "Opciones descritas en la evidencia", ninguna. `[RN-23]` (asumido en la
  normalización de mayúsculas, tildes y puntuación)
- **AC-3 (borde · textos de UI)** · Dado el recorrido Playwright por todas las páginas
  existentes al cierre del sprint (en el S1: el panel del paciente semilla en sus estados
  de opción y descartadas y la página de login (US-211); listado y ficha desde el S2, estados de espera, sin
  evidencia y error desde el S3, alta desde el S4), cuando se aplica el verificador al
  texto visible y a los `aria-label`, entonces hay cero coincidencias. `[AC-T3.4]` `[M-10.2]` `[RN-23]`
- **AC-4 (borde · encabezado y botón)** · Dado el panel con una opción, cuando se
  renderiza, entonces el encabezado es exactamente "Opciones descritas en la evidencia"
  y el botón, "Analizar evidencia". `[AC-10.3]` `[HU-03]`
- **AC-5 (borde · archivo de mensajes)** · Dado un PR que agrega "el mejor tratamiento"
  al archivo de mensajes de UI de `web`, cuando corre la CI, entonces el job
  `lint:lenguaje` falla y nombra la clave del mensaje. `[RN-23]` `[readme §6.0 DoD]`

> **Regla en ejecución (respuesta 2 del usuario, 2026-10-07, `01-requisitos.md` §15):** un término de la lista generado por el LLM nunca se muestra. Si está en una afirmación suelta, la afirmación se omite y cuenta en `omittedClaims`; si está en la justificación de una opción, la opción va a `discardedOptions` con `afirmacion_sin_soporte`. Sin cambio de contrato. La verifica el validador de soporte: `🔗 Regresión [RN-23] → US-064` (AC-7, AC-8); la suite (US-072) sigue midiendo M-10.2.

## Contexto técnico
La lista vive como dato versionado (cambiarla dispara la suite, US-074); el verificador
está en un paquete compartido usable desde Node (UI, CI) y desde Python (suite de
evaluación sobre salidas, US-072). Los textos de UI se centralizan en un archivo de
mensajes por idioma para que AC-5 sea posible. El prompt del LLM pide redactar
"opciones descritas en la evidencia" (US-057, S4) y el validador de US-064 aplica la
misma lista a lo generado. Tests: Vitest del verificador (AC-1,
AC-2), Playwright contra Compose en perfil de test (AC-3, AC-4) y PR de prueba en la CI
(AC-5).

## INVEST
**Small** ✓ una lista, un verificador y dos chequeos (UI y CI).
**Testable** ✓ cinco tests automatizados.

---

## US-069 — Toda salida generada muestra el aviso de IA y la etiqueta "Uso académico/investigación"

> Linear: [L1D-194](https://linear.app/l1der-lab-mjbc/issue/L1D-194)

`FEAT-T3` · Sprint 1 · Estimación **2** · HU-03 · RN-19 (dueña) · AC-T3.1 · ↪ US-053, US-061 · 🔗 Produce para: FEAT-02c (el resumen del caso agrega "Verifique contra las fuentes", S2)

## Story
Como oncólogo, quiero que todo lo que genera la IA lleve un aviso visible de que
requiere mi validación clínica y de que es de uso académico, para no confundir un
análisis automático con un criterio clínico validado.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un análisis `con_evidencia` en el panel, cuando se
  renderiza, entonces se lee "Análisis generado por IA: requiere validación clínica del
  oncólogo tratante" junto al resultado, y el campo `disclaimer` de la respuesta tiene
  exactamente ese texto. `[AC-T3.1]` `[RN-19]`
- **AC-2 (borde · fuente única del literal)** · Dado `AI_DISCLAIMER_TEXT` en la
  configuración de `clinical-api`, cuando un test cambia su valor, entonces el campo
  `disclaimer` y el texto del panel muestran el nuevo valor sin cambiar código de `web`.
  `[RN-19]` `[RN-22]` (asumido en el mecanismo)
- **AC-3 (borde · etiqueta permanente)** · Dadas todas las páginas autenticadas del S1,
  cuando se renderizan, entonces cada una muestra la etiqueta "Uso académico/investigación".
  `[RN-19]` `[OL-04]`
- **AC-4 (borde · sin evidencia)** · Dado un análisis `sin_evidencia`, cuando se
  renderiza, entonces también muestra el aviso del AC-1. `[RN-19]` (asumido: el aviso
  acompaña a todo resultado del análisis, aunque no haya texto generado por el LLM)

## Contexto técnico
El literal sigue AC-T3.1 ("con el texto actualizado"), ver C-14. `clinical-api` lo
devuelve en `EvidenceAnalysis.disclaimer` y `web` lo muestra desde la respuesta, no
desde una constante propia, para que los dos coincidan siempre. La etiqueta "Uso
académico/investigación" vive en el *layout* de `(dashboard)`. Las salidas que lleguen
después (resumen del caso S2, historial) llevan `🔗 Regresión [RN-19] → US-069`.
Tests: Supertest (campo `disclaimer`), Playwright (AC-1, AC-3, AC-4) y test de
configuración (AC-2).

## INVEST
**Small** ✓ un campo de respuesta y dos textos de UI.
**Testable** ✓ cuatro tests automatizados.

---

## US-070 — El análisis nunca ejecuta acciones clínicas por su cuenta

> Linear: [L1D-195](https://linear.app/l1der-lab-mjbc/issue/L1D-195)

`FEAT-T3` · Sprint 4 · Estimación **2** · HU-03 · AC-T3.2 (dueña), RN-06 · ↪ US-053, US-061 · 🔗 Relacionada: RN-08 (FEAT-03a, S2), RN-09 (FEAT-01c), que llevan `🔗 Regresión [AC-T3.2] → US-070`

## Story
Como oncólogo, quiero tener la certeza de que pedir un análisis nunca cambia los datos
de mi paciente ni registra una decisión por mí, para seguir siendo quien decide y quien
documenta.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el paciente semilla (a), cuando se ejecuta un análisis
  `con_evidencia`, entonces el número de filas de `patient`, `diagnosis`, `biomarker`,
  `treatment`, `clinical_event`, `prior_treatment` y `clinical_attribute` no cambia, y
  ningún `review_status` cambia. `[AC-T3.2]`
- **AC-2 (borde · única escritura)** · Dado el mismo análisis, cuando se compara el
  estado de todas las tablas de `clinical` antes y después, entonces la única diferencia
  es una fila nueva en `ai_analysis_record`. `[AC-T3.2]` `[RN-06]`
- **AC-3 (borde · sin acciones en la UI)** · Dada la tarjeta de opción del panel, cuando
  se inspeccionan sus controles, entonces no existe ningún botón ni enlace que registre
  un tratamiento, aplique la opción o modifique datos del paciente. `[AC-T3.2]` `[FR-10]`
- **AC-4 (borde · respuesta con campos inesperados)** · Dada una respuesta de
  `rag-orchestrator` con un campo adicional `actions: [{"type":"registrar_tratamiento"}]`,
  cuando `clinical-api` la valida, entonces el campo no se persiste ni se devuelve y
  ninguna tabla clínica cambia. (asumido: Zod descarta campos desconocidos)

## Contexto técnico
Test de "diff" de tablas con un *snapshot* de conteos y *hashes* por tabla antes y
después del análisis (Vitest + Supertest con `rag-orchestrator` simulado). La
vinculación opcional de una decisión a un análisis (FR-13) llega con FEAT-11b
(Post-MVP por el slicing adoptado) y siempre la ejecuta el oncólogo.

## INVEST
**Small** ✓ tres tests de integración y uno de componente.
**Testable** ✓ aserciones sobre conteos y *hashes* de tablas.

---

## US-071 — Los avisos clínicos nunca bloquean; solo bloquean las reglas legales y de acceso

> Linear: [L1D-196](https://linear.app/l1der-lab-mjbc/issue/L1D-196)

`FEAT-T3` · Sprint 5 · Estimación **3** · — (transversal, PRD §17) · RN-26 (dueña) · AC-T3.3 (parte de avisos; verificación completa en G-Piloto con el `403` por opt-out) · ↪ US-101 (S4), FEAT-04 US-005 (S4), US-124 (S5), US-136 (S5) · 🔗 Regresión [RN-15] → US-148 (activa desde S6)

## Story
Como oncólogo, quiero que los avisos sobre datos sin verificar, en conflicto, faltantes
o sobre una población no comparable me informen sin impedirme continuar, para decidir
yo si el análisis me sirve con esas limitaciones.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el fixture FX-T3-a (paciente con un dato
  `requiere_revision`, un dato en conflicto, un dato crítico faltante y una fuente con
  criterio excluyente en "No coincide") y `continueWithWarning = true`, cuando se
  solicita el análisis, entonces la respuesta es `200` con la opción y sus avisos
  (`datos_sin_verificar`, `datos_en_conflicto`, `datos_faltantes`,
  `poblacion_no_comparable`). `[RN-26]` `[AC-T3.3]`
- **AC-2 (borde · aviso previo de faltantes)** · Dado FX-T3-a en el panel, cuando el
  doctor elige "Continuar con aviso", entonces el análisis se ejecuta y se muestra el
  resultado. `[RN-26]` `[AC-04.2]`
- **AC-3 (borde · población no comparable)** · Dado FX-T3-a, cuando se renderiza el
  análisis, entonces la opción cuya fuente es "Población no comparable" se muestra con
  esa etiqueta y no se oculta. `[RN-26]` `[AC-08.6]`
- **AC-4 (borde · lecturas)** · Dado FX-T3-a, cuando se consultan la ficha, la vista de
  caso y `GET …/completeness`, entonces las tres responden `200` con sus avisos.
  `[RN-26]` `[FR-11]`
- **AC-5 (borde · recorrido sin bloqueos)** · Dado FX-T3-a, cuando se recorre en
  Playwright login → ficha → vista de caso → faltantes → análisis, entonces el doctor
  llega al resultado sin ningún diálogo obligatorio distinto de "Cargar información" /
  "Continuar con aviso". `[AC-T3.3]` `[PP-6]`

## Contexto técnico
**FX-T3-a:** paciente sintético de mama con HER2 `3+` `verificado`, Ki-67 `20 %`
`requiere_revision`, dos receptores de estrógeno en conflicto (`conflicts_with_id`),
sin estado menopáusico (faltante según el catálogo de datos críticos `test-1.0.0` de
FEAT-04) y una fuente de corpus de test cuyo criterio excluyente de HER2 queda en "No
coincide". Esta historia es la dueña de RN-26: verifica todos los avisos clínicos que
existen al cierre del S5; "desactualizado" (FEAT-11a, S6 si hay capacidad) llevará
`🔗 Regresión [RN-26] → US-071`. Los bloqueos legales y de acceso (opt-out, S6) se
verifican en US-148. Tests: Supertest (AC-1, AC-4) y Playwright contra Compose en
perfil de test (AC-2, AC-3, AC-5).

## INVEST
**Small** ✓ un fixture compuesto y un recorrido de verificación sobre funciones ya construidas.
**Testable** ✓ cinco tests de integración y E2E.
*(Independent ⚠ depende de tres Features de S2–S3; por eso vive en el S4.)*

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-14 | PRD RN-19, readme HU-03, readme OL-04 y readme §4.1 (`disclaimer`): "Análisis generado por IA — requiere validación clínica del oncólogo tratante" (raya) | PRD AC-T3.1: "Análisis generado por IA: requiere validación clínica del oncólogo tratante" ("con el texto actualizado") | PRD AC-T3.1 (declara ser el texto actualizado); el literal vive en configuración (US-069 AC-2) para corregirlo sin código si el usuario decide lo contrario |
| — | PRD AC-T3.3: se verifica en G-Piloto (S5) junto con los bloqueos | Mapa de lotes: FEAT-T3 en el S1 | La parte de avisos (US-071) va al S4, cuando existen todos los avisos; la de bloqueos, al S5 con US-148 |
| P-02 | PRD RN-26 y AC-T3.3: bloquean opt-out, egreso y equipo tratante | P-02 (equipo tratante fuera del MVP) y slicing adoptado (egreso Post-MVP) | En el MVP solo bloquea el opt-out de `analisis_ia` (S5); los otros dos llegan con FEAT-T4b y FEAT-T4e (Post-MVP) |
| Slicing v2 | PRD §14 y lote 1: US-070 en el S1 y US-071 en el S4 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-070 en el S4 y US-071 en el S5 | Se siguió el slicing v2; el panel no ofrece acciones clínicas en ningún sprint |
