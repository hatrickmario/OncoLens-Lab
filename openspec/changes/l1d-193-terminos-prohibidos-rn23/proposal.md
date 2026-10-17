# Proposal — l1d-193-terminos-prohibidos-rn23

## Trazabilidad

L1D-193 · US-068 · FEAT-T3 (L1D-39) · Sprint 1 · Estimación **3** · HU-03 · RN-23 (dueña) ·
AC-10.3, AC-T3.4 · M-10.2 (= 0; medido en US-072) · G-14 · readme §6.0 DoD · `[S1 resp. 33]` (validación clínica) ·
US-068 AC-1, AC-2, AC-3, AC-4, AC-5 · 🔗 Regresión [RN-23] (salidas generadas en ejecución) → US-064
AC-7, AC-8 (L1D-180, mismo sprint) · 🔗 Medido en: US-072 (S2) ·
DoR del S1: ✓ (`backlog/sprints/S1-refinamiento.md` §1, diseño en `docs/ux/S1/`).

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se
> aceptan. En esta historia, el del AC-2: el verificador **normaliza mayúsculas, tildes y puntuación**
> antes de comparar ("RECOMENDADO PARA ESTE PACIENTE", "Recomendado para este paciente." y "debe
> recibir" sin tildes coinciden).
>
> **Regla en ejecución (respuesta 2 del usuario, 2026-10-07, `backlog/01-requisitos.md` §15):** un
> término de la lista generado por el LLM nunca se muestra; lo aplica el validador de soporte de
> L1D-180 (US-064 AC-7, AC-8) con la lista y el verificador de este change. Sin cambio de contrato.
>
> Contexto del sprint que aplica: `[S1 resp. 4]` (rutas en español: `/login` y
> `/pacientes/[id]/analisis`, que recorre el AC-3).
>
> **Decidido en el Gate 1 (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2):**
> - `[S1 resp. 15]` **RN-23 en dos niveles**, lista `terminos-prohibidos.json` **1.1.0** (hoy 1.2.0 por `[S1 resp. 33]`). **Nivel A**
>   (salida generada y UI): los 8 términos del AC-1 más "deben recibir", "debería recibir", "se sugiere
>   iniciar", "tratamiento indicado", "mejor opción", "usted debe", "you should", "the patient should",
>   "indicated for this patient", "probabilidad de éxito" y "chance of success", con una normalización
>   que cubre **plural y género** ("deben recibir", "recomendada para esta paciente", "debe recibirlo").
>   **Nivel B** (solo textos propios de la UI y prompts, vía `lint:lenguaje`): raíz `recomend*` /
>   `recommend*`. Supersede la Open Question 2 de la versión anterior (ampliar la lista).
> - `[S1 resp. 16]` los literales de retirada "[afirmación retirada: formulación no permitida]" y
>   "[claim removed: disallowed wording]" (L1D-180) entran en los casos de conformidad con **cero**
>   coincidencias.
> - `[S1 resp. 18]` dueños únicos: `apps/web/messages/es.json` lo crea **L1D-197**; este change solo lo
>   lee (no lo crea ni vacío).
> - Corrección del Gate 1: la marca `data-origen="corpus"` deja de ser un escape abierto (solo en hojas
>   de una allowlist definida **una vez** en `packages/clinical-language`, ver design D5–D6), y
>   `assertNoPrescriptiveLanguage()` de `scripts/contracts` pasa a leer el catálogo: se borran la lista
>   provisional y el test duplicado sobre `contracts/examples/`.

> **Validación clínica de los oncólogos asesores (2026-10-14, `backlog/sprints/S1-plan.md` §7):**
> - `[S1 resp. 33]` **RN-23 ampliada por forma.** `terminos-prohibidos.json` pasa a **1.2.0**: añade al
>   **Nivel A** (salida generada, UI, prompts y contratos) inicie, administre, prescriba, suspenda,
>   cambie a, elija, escoja, ofrezca, se debe, debe iniciar(se), debe suspender, se debe administrar, no
>   debe recibir, no se debe administrar, es necesario, es imprescindible, se recomienda, se recomienda
>   iniciar, se indica, está indicado, está contraindicado, la mejor opción es, manejo de elección; en
>   inglés, we recommend, is recommended, should be started, must receive, should not receive, is
>   indicated, is contraindicated, preferred treatment, treatment of choice. Al **Nivel B** (solo textos
>   propios de la UI y prompts): iniciar, administrar, prescribir, suspender, ofrecer, elegir, start,
>   initiate, administer, prescribe, discontinue, offer, choose, switch to, standard of care. Con variantes
>   de género, número, conjugación y negación (clave flexiva; `formas` explícitas para la conjugación
>   dirigida, design D2–D3) y casos de conformidad positivos y negativos ("los ensayos evaluaron
>   administrar trastuzumab" = 0 de Nivel A; "administre trastuzumab" = 1; "no debe recibir" = 1; "la guía
>   recomienda X para pacientes con HER2 positivo" = 0 de Nivel A).
> - `[S1 resp. 34]` (contexto, no de este change): `false_positive_language_filter_rate` lo mide `evaluate`
>   y la atribución "la guía recomienda X para pacientes con [condición] en [escenario]" la exigen el
>   prompt (L1D-275) y la mide `evaluate` (L1D-180); no hay regla determinista en la lista.
> - Los literales nuevos de L1D-140 (`[S1 resp. 28]`, `[S1 resp. 29]`, `[S1 resp. 31]`, `[S1 resp. 35]`,
>   `[S1 resp. 36]`) y de L1D-194 (`[S1 resp. 32]`) dan **0** coincidencias en los dos niveles (casos de
>   conformidad); la única frase permitida nueva es "iniciar sesión" (botón del login de L1D-197).

## Why

El oncólogo pidió que la herramienta no le diga qué hacer (PP-1, AS-IS P12). RN-23 exige que ningún
texto de la UI ni salida generada use formulaciones prescriptivas dirigidas al paciente, y el PRD
(AC-10.3) pide verificarlo con una lista de términos prohibidos en los tests de UI y de salida. Hoy esa
lista no existe: sin ella, L1D-180 no puede retirar lo prescriptivo que genere el LLM, la CI no puede
rechazar un mensaje de UI prescriptivo y la suite de evaluación (US-072) no puede medir M-10.2. Este
change crea la lista como **dato versionado compartido** y un verificador con **una sola regla de
normalización** que se usa igual desde Node (UI, CI) y desde Python (`rag-orchestrator`, suite).

## What Changes

- **Lista versionada** `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` **1.3.0** (datos, no
  código; `version` semver propia) en **dos niveles** `[S1 resp. 15]` `[S1 resp. 33]`: `nivelA.terminos`
  (56 términos, 1.3.0 añade "indicado para este/esta paciente" en el Gate 2: los 22 de 1.1.0, con los 3 conservados de la lista provisional, más los 32 de
  `[S1 resp. 33]`, en español e inglés, cada uno con `id` estable e `idioma`, y `formas` o `excepciones`
  cuando hace falta), `nivelB.prefijos` (`recomend`, `recomiend`, `recommend`) y `nivelB.terminos` (15 de
  `[S1 resp. 33]`), más `frasesPermitidas` (frases negativas normativas y "iniciar sesión", solo para
  textos propios). Montada de solo
  lectura en los backends vía `CLINICAL_CATALOG_PATH`; cambiarla es un cambio de catálogo y dispara la
  suite (US-074).
- **Regla de normalización única** declarada en la propia lista (`normalizacion`) y fijada por un
  archivo de **casos de conformidad** compartido: minúsculas, sin diacríticos, puntuación → espacio,
  espacios colapsados, **clave flexiva por palabra** (plural, género y enclíticos `-lo/-la/-los/-las/
  -le/-les/-se`), **formas verbales dirigidas** explícitas, **excepciones** descriptivas, coincidencia
  de la secuencia completa de palabras y **tramo más largo** entre coincidencias solapadas ("no debe
  recibir" cuenta una vez) `[S1 resp. 33]`.
- **Nuevo paquete** `packages/clinical-language` (npm workspace, TypeScript, compilado a `dist/` con
  `tsc`): `checkProhibitedTerms(texto, lista, { niveles })` puro (por defecto solo Nivel A),
  `loadProhibitedTerms(ruta)` que falla cerrado, y **la única definición** del origen de los campos del
  contrato (`origen-de-campos.json`): campos copiados del corpus (`chunkTextSnapshot`, `title`,
  `sourceName`, `externalId`, `authors`) y campos generados (`option`, `rationale`,
  `unsupportedClaims`, `limitations[].text`, `synthesis`), que usan L1D-180 y el recorrido de UI.
- **Gemelo Python** `check_prohibited_terms()` en `apps/rag-orchestrator/app/domain/lenguaje.py` (puro,
  sin E/S, mismos niveles), verificado contra los **mismos** casos de conformidad. El adapter que lo
  carga desde `CLINICAL_CATALOG_PATH` y lo conecta al validador de soporte es de L1D-180
  (`app/infrastructure/lenguaje/`).
- **`contracts:check`:** `assertNoPrescriptiveLanguage()` (`scripts/contracts/rules/`) lee la lista de
  `packages/clinical-catalogs/lenguaje/` con `@oncolens/clinical-language` (Nivel A + Nivel B +
  `frasesPermitidas`); se **borra** `scripts/contracts/terminos-prohibidos-rn23.json` (provisional,
  dueña US-068) y no se añade un test propio sobre `contracts/examples/` (duplicaría la regla).
- **`lint:lenguaje`**: script raíz que aplica Nivel A + Nivel B a cada valor del archivo de mensajes de
  UI de `web` (`apps/web/messages/<idioma>.json`, creado por L1D-197) y falla nombrando la **clave**, el
  nivel y el término; nuevo job `lint:lenguaje` en `.github/workflows/ci.yml` (AC-5).
- **Recorrido Playwright** (Nivel A) sobre el texto visible, los `aria-label` y los `aria-describedby`
  de las páginas del S1 (login y panel en sus estados) con cero coincidencias (AC-3), con la exclusión
  del corpus acotada a las hojas de la allowlist, y comprobación de los literales "Opciones descritas
  en la evidencia" y "Analizar evidencia" (AC-4).

## Capabilities

### New Capabilities

- `human-control` (prevista en `openspec/config.yaml`): control humano y lenguaje no prescriptivo
  (RN-19, RN-23, RN-26). Este change añade los requisitos de RN-23 (lista, verificador, UI y CI).
  L1D-194 (US-069, aviso de IA) también escribe en esta capacidad en paralelo: requisitos con nombres
  distintos, sin `## Purpose` en el delta (lo fija el archivado).

### Modified Capabilities

- `api-contracts`: MODIFIED "Lenguaje no prescriptivo en specs y ejemplos" — la regla lee ya el catálogo
  de US-068 (Nivel A + Nivel B + `frasesPermitidas`) y la lista provisional desaparece; los términos del
  Nivel A se comparan con la normalización común. Sin cambio de `openapi.yaml`. No escribe en
  `evidence-analysis` (la regla en ejecución es de L1D-180, que la declara en su propio delta) ni en
  `data-model`.

## Bounded contexts

- **contratos:** `scripts/contracts/rules/assertNoPrescriptiveLanguage.mjs` y `lib/paths.mjs` pasan a
  leer el catálogo; se borra la lista provisional.
- **clinical-platform:** lista en `packages/clinical-catalogs/lenguaje/`, paquete
  `packages/clinical-language` (verificador y origen de campos), script `lint:lenguaje` y job de CI.
- **ai-services:** `check_prohibited_terms()` en el dominio de `apps/rag-orchestrator` y su test de
  conformidad.
- **frontend:** convención del archivo de mensajes; el recorrido Playwright de AC-3 y AC-4 sobre
  `apps/web` lo implementa la rama de L1D-140 (tareas importadas), con los tags `[US-068 AC-n]`.

## Dependencias

- ↪ **Depende de** **L1D-164** (US-034): `package.json` raíz con `workspaces`, esqueleto de
  `apps/rag-orchestrator` y perfil Compose de test con `LLM_PROVIDER=fake` para el Playwright.
- ↪ **Depende de** **L1D-166** (US-036): `.github/workflows/ci.yml` donde se añade el job
  `lint:lenguaje` y el patrón de fixtures de PR.
- ↪ **Depende de** **L1D-197** (US-211, login): crea `apps/web/messages/es.json` `[S1 resp. 18]`, que
  `lint:lenguaje` y su job de CI leen (tarea 2.7), y la página `/login` del AC-3.
- 🔗 **Consumidor (no dependencia):** **L1D-140** (US-061, panel) importa `CAMPOS_COPIADOS_DEL_CORPUS` y
  marca con `data-origen="corpus"` las hojas de esa allowlist; **este change se mergea antes que
  L1D-140**. El recorrido Playwright de AC-3 y AC-4 (antes `## frontend` de este change) se implementa en
  la rama de L1D-140 (tasks 3.1–3.3 de ese change), conservando los tags `[US-068 AC-n]`, sin `.skip`.
- ↪ **Depende de** **L1D-169** (US-039): crea `packages/clinical-catalogs/` (`manifest.json` 1.0.0). Si
  este change se implementa antes, crea solo la subcarpeta `lenguaje/` sin tocar el manifiesto.
- 🔗 **Relacionado (consumidor):** **L1D-180** (US-064) usa la lista (solo Nivel A), el gemelo Python y
  la allowlist de campos generados para RN-23 en ejecución (con la 1.3.0, `[S1 resp. 33]`), y sus literales de retirada `[S1 resp. 16]`
  están en los casos de conformidad; **L1D-194** (US-069) comparte la capacidad `human-control`; **L1D-265** (US-215) deja
  `lint:lenguaje` fuera de su ESLint (Non-goal de US-215); **L1D-275** (US-225) genera las salidas que
  luego filtra L1D-180 y es dueño del prompt `app/prompts/rag_query.py`, al que aplica Nivel A + B con
  el gemelo Python (ver design, Open Questions).

## Fuera de alcance

- Retirar en ejecución los términos generados por el LLM (opción → `discardedOptions`, afirmación →
  `omittedClaims`): L1D-180 (US-064 AC-7, AC-8).
- Medir M-10.2 sobre el set de evaluación: US-072 (S2); el disparo de la suite al cambiar la lista:
  US-074.
- Instrucciones del prompt para redactar "opciones descritas en la evidencia": US-057 (S4).
- Recorrido de listado y ficha (S2), espera, sin evidencia completo y error completo (S3) y alta (S4):
  se suman al AC-3 cuando existan esas páginas (ver design, Regresiones).
- Crear `apps/web/messages/es.json` (L1D-197, `[S1 resp. 18]`) o escribir textos de otras historias.
- El test del prompt de generación con Nivel A + B (L1D-275, dueño del prompt): este change solo le da
  el verificador con `niveles`.
- Una regla ESLint de literales en JSX: el recorrido Playwright cubre lo renderizado.

## Impact

- Datos: `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` (nuevo, 1.3.0).
- Código: `packages/clinical-language/` (nuevo workspace, con `origen-de-campos.json`),
  `apps/rag-orchestrator/app/domain/lenguaje.py` y sus tests, script `lint:lenguaje` en `package.json`
  raíz, job en `.github/workflows/ci.yml`, fixtures en `ci/tests/lenguaje/`, specs Playwright en
  `apps/web/e2e/`, `scripts/contracts/rules/assertNoPrescriptiveLanguage.mjs` y `lib/paths.mjs`.
- Borrado: `scripts/contracts/terminos-prohibidos-rn23.json` (lista provisional del Pre-S1).
- Contratos: `openapi.yaml` sin cambios; `contracts:check` sigue cubriendo `contracts/examples/` (de ahí
  salen los mocks de la UI), ahora con la lista del catálogo.
- Evaluación: la lista es catálogo → OL-06 obligatoria; mientras no exista la suite (US-072, S2),
  comprobación manual de `ai-eval-runner` (M-10.2 = 0 sobre la salida del paciente semilla).
- Datos reales: ninguno; solo textos sintéticos y los literales de la lista (RN-13, RN-14).
