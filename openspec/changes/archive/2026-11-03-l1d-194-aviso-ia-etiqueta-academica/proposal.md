# Proposal — l1d-194-aviso-ia-etiqueta-academica

## Trazabilidad

L1D-194 · US-069 · FEAT-T3 (L1D-39) · Sprint 1 · Estimación **2** · HU-03 · RN-19 (dueña) · RN-22 ·
AC-T3.1 · OL-04 (aviso fijo, etiqueta permanente) · PRD E-11 (supersede B-06, que supersedía C-14) ·
US-069 AC-1, AC-2, AC-3, AC-4 · 🔗 Produce para: FEAT-02c (el resumen del caso agrega "Verifique contra
las fuentes", S2) · 🔗 Regresión [RN-19] → US-069 en toda salida generada posterior (resumen del caso S2,
seguimiento S5, historial) · DoR del S1: ✓ (`backlog/sprints/S1-refinamiento.md` §1, diseño en
`docs/ux/S1/pantallas-s1.md` S1-08/09).

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se
> aceptan. En esta historia: el **mecanismo** del AC-2 (el literal vive en `AI_DISCLAIMER_TEXT` de
> `clinical-api` y `web` lo muestra desde la respuesta) y el del AC-4 (el aviso acompaña a todo resultado
> del análisis, también `sin_evidencia`, aunque no haya texto generado por el LLM).
>
> **Validación clínica (oncólogos asesores, 2026-10-14, `backlog/sprints/S1-plan.md` §7):**
> - `[S1 resp. 32]` el literal pasa a **"Generado por IA; requiere validación clínica independiente por el
>   oncólogo tratante."** (punto y coma y punto final), con "Uso académico/investigación" **visible y
>   permanente** como etiqueta aparte. Supersede el literal de `[S1 resp. 9]` y PRD B-06 (fila nueva E-11
>   del registro de cambios del PRD, RN-19 y US-069 corregidas: lo hace la sesión principal, no este
>   change). Cambia el valor por defecto de `AI_DISCLAIMER_TEXT`, la descripción de `disclaimer`, todos los
>   ejemplos con `disclaimer` y la regla `assertDisclaimerRequired`.
> - Decisión 58 del plan (sustituye a `[S1 resp. 37]` y a `[S1 resp. 17]`): `info.version` de `clinical-api` → **1.4.1**.
>
> **Decidido (usuario, 2026-10-13, `[S1 resp. 9]`; su literal lo supersede `[S1 resp. 32]`):** el literal
> era el de PRD B-06 y AC-T3.1 ("Análisis generado por IA: requiere validación clínica del oncólogo
> tratante"), y `disclaimer` lleva **solo** esa frase ("Uso académico/investigación" es una etiqueta aparte). Este change
> incluye una tarea de **contratos** (skill `sync-contracts`, cambio compatible, solo texto): corregir la
> descripción de `disclaimer` en `apps/clinical-api/openapi.yaml` (en `EvidenceAnalysis` y `FollowUpTurn`;
> `apps/rag-orchestrator/openapi.yaml` no tiene par: verificado, no declara `disclaimer`) y el campo en los
> ejemplos de `contracts/examples/` que usan la raya. **Supersede la fila C-14** (`backlog/01-requisitos.md`)
> y la tolerancia "con raya o dos puntos indistintamente" de `[Pre-S1 resp. 25]` en `api-contracts`.
>
> **Decidido en el Gate 1 (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2):**
> - `[S1 resp. 18]` **dueño único** de `AiDisclaimer`, `AppHeader`, `app/(dashboard)/layout.tsx` y la clave
>   consumidor de la clave `app.academicUseLabel`, con tests de componente aislados (Testing Library + MSW).
>   Se rompe el ciclo con L1D-140: este change **no depende de L1D-140 y se mergea antes**; los E2E de
>   AC-1…AC-4 que necesitan la página del panel se **importan** a L1D-140 (tasks 3.4 de ese change) y se
>   implementan en su rama con los tags `[US-069 AC-n]`, nunca con `.skip`.
> - **Gate 1, 2ª vuelta:** `/login` también lleva la etiqueta. `apps/web/messages/es.json` **y la clave
>   `app.academicUseLabel`** los crea L1D-197 (dueño del archivo), que la prueba en el login; este change
>   la **consume** en `AppHeader`, sin crearla ni cambiar su valor.
> - `[S1 resp. 17]` (versión sustituida por la decisión 58 del plan: **1.4.1**, patch tras L1D-104 → 1.4.0); el cambio cubre **todo ejemplo con `disclaimer`** (no una lista cerrada de seis);
>   `contracts:generate` corre **antes** de `contracts:check`; `readme.md` figura en el impacto (extracto
>   §4 generado).
> - Pendiente para el **cierre del sprint** (no lo hace este change): la raya del aviso en la prosa de
>   `readme.md` (§1, HU-03, OL-04) y de `CLAUDE.md`.

## Why

El oncólogo necesita distinguir un análisis automático de un criterio clínico validado (PP-1, AS-IS P12).
RN-19 exige que toda salida generada muestre el aviso de IA y la etiqueta "Uso académico/investigación", con
el literal en configuración (E-11, `[S1 resp. 32]`). Hoy el contrato congelado en el Pre-S1 describe `disclaimer` como "las
dos frases de RN-19" con raya, y todos los ejemplos de `contracts/examples/` con `disclaimer` repiten esa forma; el AC-1 de
esta historia exige exactamente el literal validado por los oncólogos (`[S1 resp. 32]`). Si no se corrige primero el contrato, el gateway
(L1D-104), el panel (L1D-140) y sus mocks (MSW desde `contracts/examples/`) divergirían del AC.

## What Changes

- **Contrato (compatible, solo texto):** la descripción de `disclaimer` en `EvidenceAnalysis` y
  `FollowUpTurn` pasa a "un solo texto configurable (`AI_DISCLAIMER_TEXT`) con la frase de RN-19 / E-11:
  'Generado por IA; requiere validación clínica independiente por el oncólogo tratante.'; 'Uso
  académico/investigación' es una etiqueta permanente de la UI, no forma parte del campo" `[S1 resp. 32]`. **Todo
  ejemplo con `disclaimer`** (hoy `con-evidencia-s1`, `con-evidencia-s4`, `sin-evidencia`,
  `tipo-no-habilitado`, `follow-up-turn`, `follow-up-fuera-de-contexto`, y los que añadan otros changes)
  lleva exactamente el literal. `info.version` sube la **patch** a **1.4.1** (decisión 58 del plan). Se regeneran
  los tipos (`contracts:generate`, antes de `contracts:check`).
- **Regla `assertDisclaimerRequired` de `contracts:check`:** los ejemplos exigen el literal **exacto** de
  `[S1 resp. 32]` (antes: tres subcadenas, con raya o dos puntos); un ejemplo con raya, con el literal
  anterior de B-06 o con "Uso académico/investigación" dentro de `disclaimer` es hallazgo. Sus parches de prueba cambian con el AC
  (commit con `Test-Removal:`, ver tasks).
- **clinical-api:** test de integración de que `POST /platform/evidence-analyses` devuelve
  `disclaimer` igual a `AI_DISCLAIMER_TEXT` en `con_evidencia` y en `sin_evidencia`, y test de configuración
  de que cambiar la clave cambia el campo sin tocar código; valor por defecto de la clave = literal de
  `[S1 resp. 32]` en `src/config.ts` y en `infra/docker/.env.example`; la clave vacía o ausente impide arrancar (falla cerrado, asumido).
  La clave y su lectura las crea L1D-104 (tarea 2.6); este change fija su **valor** y lo verifica.
- **web (dueño único, `[S1 resp. 18]`):** molécula `AiDisclaimer` (`role="note"`, banda navy, muestra
  `disclaimer` tal cual llega, sin constante propia), organismo `AppHeader` con la etiqueta permanente "Uso
  académico/investigación" y el *layout* `app/(dashboard)/layout.tsx`; lee la clave `app.academicUseLabel` de
  `apps/web/messages/es.json` (archivo y clave de L1D-197). Tests de componente aislados con MSW en este
  change; los Playwright de AC-1…AC-4 sobre el panel se implementan en la rama de L1D-140 (importados).

## Capabilities

### New Capabilities
- `human-control`: la abre en paralelo L1D-193 (términos prohibidos, RN-23). Este change le **añade** los
  requisitos de RN-19 (aviso de IA y etiqueta), sin solaparse con los de L1D-193.

### Modified Capabilities
- `api-contracts`: MODIFIED "Aviso de IA obligatorio" (literal exacto de `[S1 resp. 32]`, solo esa frase;
  deja de admitir raya, el literal anterior de B-06 y la etiqueta dentro del campo).

## Impact

- **Bounded contexts:** `contratos` (spec, ejemplos, regla de `contracts:check`), `clinical-platform`
  (configuración y tests de `clinical-api`), `frontend` (`apps/web`: `AiDisclaimer`, `AppHeader`, mensajes,
  Playwright).
- **Archivos:** `apps/clinical-api/openapi.yaml`, `contracts/examples/*.json` (todo ejemplo con `disclaimer`),
  `scripts/contracts/rules/assertDisclaimerRequired.mjs`,
  `scripts/contracts/__fixtures__/parches/ac-17-lenguaje-anclaje.json`, `packages/api-contracts/src/**`
  (generado), `infra/docker/.env.example`, `apps/clinical-api/test/**`, `apps/web/components/**`,
  `apps/web/app/(dashboard)/layout.tsx`, `apps/web/tests/**`, `readme.md` (solo el extracto §4 que
  regenera `contracts:readme-extract`, si incluye la descripción; la prosa no se toca).
- **Sin cambios** de esquema de datos, de `rag-orchestrator`, de prompts, umbrales, catálogo ni corpus
  (no aplica la suite `evaluate`).

## Dependencias

- ↪ **Depende de** el change de **L1D-104** (`l1d-104-persistencia-analisis-fallos`, US-053): crea
  `AI_DISCLAIMER_TEXT` en `src/config.ts` y la escribe en `disclaimer` (este change le entrega el literal;
  L1D-104 lo espera de aquí). Los tests de clinical-platform de este change corren sobre su gateway.
- 🔗 **Consumidor (no dependencia):** **L1D-140** (US-061, panel) compone `AiDisclaimer` en el resultado y
  en el pie (pantalla S1-08/09, posiciones 2 y 7) y hereda el *layout*; ↪ depende de **este** change
  `[S1 resp. 18]`; **este change se mergea antes que L1D-140**. Los E2E de AC-1…AC-4 (antes grupo 4 de
  tasks) se importan a L1D-140 (tasks 3.4) y se implementan en su rama, con los tags `[US-069 AC-n]`.
- ↪ **Depende de** **L1D-197** (`l1d-197-sesion-login-guard`, US-211): crea `apps/web/messages/es.json` y la clave `app.academicUseLabel` (Gate 1, 2ª vuelta)
  `[S1 resp. 18]`, la sesión y el *guard* del *dashboard* para que AC-3 recorra páginas autenticadas; la
  etiqueta de `/login` es de L1D-197 (no autenticada).
- ↪ **Depende de** **L1D-164** (`l1d-164-compose-stack`, US-034): Compose en perfil de test y
  `LLM_PROVIDER=fake` para el Playwright.
- 🔗 **Vecinos:** **L1D-193** (`l1d-193-terminos-prohibidos-rn23`): misma capacidad `human-control` y mismo
  archivo `apps/web/messages/es.json`; el literal del aviso y la etiqueta deben pasar su `lint:lenguaje`.
  **L1D-103** (US-052): gateway del contexto clínico, sin solape.
- **`info.version` (decisión 58 del plan, sustituye al de `[S1 resp. 37]`):** `clinical-api`
  L1D-164 → 1.1.0, L1D-197 → 1.2.0, L1D-103 → 1.3.0, L1D-104 → 1.4.0, **L1D-194 → 1.4.1** (patch, solo texto), L1D-203 →
  1.5.0. Quien mergea segundo rebasa; el
  `contracts:check` de la CI exige semver.

## Fuera de alcance

- La redacción en prosa de `readme.md` (§1, HU-03, OL-04), de `CLAUDE.md` y de `openspec/config.yaml`, que
  conservan el literal anterior, y la fila E-11 del PRD con RN-19 y US-069: las corrige la sesión principal
  (`[S1 resp. 32]`); el literal validado manda; **nota para el cierre del sprint** (pendiente 2 del Gate 1). Si `contracts:readme-extract` incluye la descripción
  de `disclaimer`, se regenera el extracto (es generado).
- El aviso del resumen del caso y "Verifique contra las fuentes" (FEAT-02c, US-096/US-097, S2), el del
  seguimiento (S5) y el del historial: llevan `🔗 Regresión [RN-19] → US-069`.
- La etiqueta de `/login` (L1D-197) y la lista de términos prohibidos (L1D-193).
- Estados `tipo_no_habilitado` (S2), `403` por opt-out (S6) y `422` por egresado: sin camino en el S1.
