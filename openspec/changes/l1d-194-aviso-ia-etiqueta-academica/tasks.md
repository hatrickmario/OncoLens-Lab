# Tasks — l1d-194-aviso-ia-etiqueta-academica

> Matriz TDD (CLAUDE.md): contrato y regla de `contracts:check` → **test después** (fixture de parche en
> el mismo PR); valor de `AI_DISCLAIMER_TEXT` y arranque → **test después: configuración**; campo
> `disclaimer` del endpoint → **TDD estricto** (test de aceptación de integración en rojo antes del
> `feat`); UI (`AiDisclaimer`, `AppHeader`) → **test del AC primero**. Sin `evaluate`: no cambia modelo,
> prompt, umbral, catálogo ni corpus. Mocks solo en los bordes (MSW hacia `rag-orchestrator` desde
> `contracts/examples/`, `LLM_PROVIDER=fake` en Playwright); nunca `vi.mock` de módulos propios ni Prisma.
> Nunca `.skip`, `.only`, `it.todo`. Solo datos sintéticos (RN-13, RN-14).
> Secuencia de commits: `contract` → `test` → `feat` → `refactor`.

## 1. contratos

- [x] 1.1 (test después) Skill `sync-contracts`, paso 1: en `apps/clinical-api/openapi.yaml`, nueva descripción de `disclaimer` en `EvidenceAnalysis` y `FollowUpTurn` (design `## Contratos`) e `info.version` 1.4.0 → **1.4.1** (patch, decisión 58 del plan; quien mergea segundo rebasa). **Patch** de la descripción: el literal validado "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." `[S1 resp. 32]` (PRD E-11) y la etiqueta "Uso académico/investigación" fuera del campo. En **todo ejemplo** de `contracts/examples/` con `disclaimer` (incluidos los que añadan otros changes del sprint, p. ej. L1D-140), ese literal exacto `[S1 resp. 32]`. Verificación: diff del spec y de los ejemplos en el PR.
- [x] 1.2 (test después) Actualizar `scripts/contracts/rules/assertDisclaimerRequired.mjs`: extraer `esAvisoLiteral()` (RN-19, igualdad exacta con el literal) aplicado a todo ejemplo con `disclaimer` (sin lista fija), y exigir que la descripción mencione `AI_DISCLAIMER_TEXT` y el literal; cambiar los parches de `ac-17-lenguaje-anclaje.json` (design `## Contratos`: etiqueta dentro del aviso → hallazgo; raya → hallazgo; literal anterior de B-06 → hallazgo; sin "independiente" o sin punto final → hallazgo; literal exacto de `[S1 resp. 32]` → sin hallazgos). El literal esperado es una constante de la regla. Commit con trailer `Test-Removal: [S1 resp. 32] supersede el literal de S1 resp. 9 y la tolerancia de Pre-S1 resp. 25`. Verificación: `node --test scripts/contracts/__tests__` en verde.
- [x] 1.3 `npm run contracts:generate` (y `contracts:readme-extract`, que regenera solo el extracto §4 de `readme.md` si incluye la descripción) y `contracts:generate:check` en verde — **antes** de `contracts:check` `[S1 resp. 17]`.
- [x] 1.4 `npm run contracts:check` en verde; `contracts:breaking` (oasdiff contra `origin/main`) sin incompatibilidades, o a mano si el script aún no existe (pendiente de US-036): solo descripciones y ejemplos. Commit `contract(L1D-194): aviso de IA con el literal de B-06 solo en disclaimer`.

## 2. clinical-platform

> Requiere el gateway y la clave `AI_DISCLAIMER_TEXT` de L1D-104 (tarea 2.6 de ese change).

- [x] 2.1 (TDD estricto) Test de aceptación en rojo: "devuelve disclaimer igual a AI_DISCLAIMER_TEXT con el literal validado cuando el análisis es con_evidencia [US-069 AC-1]" (por defecto, "Generado por IA; requiere validación clínica independiente por el oncólogo tratante.", `[S1 resp. 32]`) y "devuelve el mismo disclaimer cuando el análisis es sin_evidencia [US-069 AC-4]" · Supertest + PostgreSQL de test + MSW hacia `rag-orchestrator` desde `contracts/examples/`, con verificación del proveedor (respuesta validada contra el spec con el *helper* de L1D-164, `[S1 resp. 17]`, hasta US-214). Commit `test(L1D-194)`.
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "devuelve el nuevo valor en disclaimer cuando la configuración cambia AI_DISCLAIMER_TEXT [US-069 AC-2]" · Supertest con la *factory* de la app y una configuración sintética. Commit `test(L1D-194)`.
- [x] 2.3 Fijar el valor por defecto de `AI_DISCLAIMER_TEXT` (literal de `[S1 resp. 32]`: "Generado por IA; requiere validación clínica independiente por el oncólogo tratante."; sustituye al de B-06 que L1D-104 tomaba de `[S1 resp. 9]`) en `src/config.ts` y en `infra/docker/.env.example`, con validación Zod no vacía (D4), y cualquier ajuste mínimo del gateway para que 2.1 y 2.2 pasen. Commit `feat(L1D-194)`.
- [x] 2.4 (test después: configuración) Test "termina con código distinto de 0 y nombra AI_DISCLAIMER_TEXT cuando la clave está vacía o ausente [US-069 AC-2]" sobre la carga de configuración. Verificación: verde.
- [x] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-194)`.

## 3. frontend (componentes, sin depender del panel)

> Dueño único de `AiDisclaimer`, `AppHeader` y `app/(dashboard)/layout.tsx` `[S1 resp. 18]`. Requiere `apps/web/messages/es.json` **con la clave `app.academicUseLabel`** de L1D-197 en `main` (Gate 1, 2ª vuelta; este change la consume y no modifica `es.json`). **No** requiere L1D-140: se mergea **antes** que él. Pantalla de referencia: `docs/ux/S1/pantallas-s1.md` S1-08/09.

- [x] 3.1 (test del AC primero) Tests de componente en rojo (Vitest + Testing Library + MSW desde `contracts/examples/`): "muestra el disclaimer recibido en una región note cuando el análisis es con_evidencia [US-069 AC-1]" (con `con-evidencia-s1.json`), "muestra el aviso cuando el análisis es sin_evidencia [US-069 AC-4]" (con `sin-evidencia.json`), "muestra un valor sintético de disclaimer tal cual llega, sin texto propio [US-069 AC-2]" y "muestra Uso académico/investigación en la cabecera del layout fuera de la región note [US-069 AC-3]" sobre `AiDisclaimer`, `AppHeader` y `app/(dashboard)/layout.tsx`; más el chequeo de que ningún archivo de `apps/web` contiene "requiere validación clínica independiente por el oncólogo tratante" ni el literal anterior "requiere validación clínica del oncólogo tratante" [US-069 AC-2] `[S1 resp. 32]`. Esqueletos con `throw new Error('no implementado')`. Commit `test(L1D-194)`.
- [x] 3.2 Implementar `AiDisclaimer` (molécula RSC, `role="note"`), `AppHeader` con la etiqueta (lee la clave `app.academicUseLabel` de L1D-197 con `mensajes()` de `lib/mensajes.ts`, sin literal propio) y `app/(dashboard)/layout.tsx`. Verificación: 3.1 en verde y `lint:lenguaje` de L1D-193 sin hallazgos. Commit `feat(L1D-194)`.
- [ ] 3.3 Loop visual (visual-check) del *layout* con la cabecera: consola sin errores ni violaciones de CSP, accesibilidad y teclado, capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo. **Diferida a L1D-278 (ARR-02, E2E/visual-check) (cierre S1, 2026-10-18).**
- [x] 3.4 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-194)`.

## 4. frontend E2E (importado por L1D-140)

> **Movido a la rama de L1D-140** (Gate 1, 2ª vuelta): este change se mergea **antes** que L1D-140, que
> compone `AiDisclaimer`, `AppHeader` y el *layout*. Los Playwright de `apps/web/e2e/aviso-ia.spec.ts`
> (antes 4.1: US-069 AC-1, AC-2, AC-3 y AC-4) se implementan en `l1d-140-panel-opcion-citas`, tasks 3.4,
> conservando los nombres de test con `[US-069 AC-n]`, sin `.skip`. Aquí no queda ninguna tarea E2E.

## 5. cierre

- [x] 5.1 `openspec validate l1d-194-aviso-ia-etiqueta-academica --strict`, tests de `clinical-api`, `web` (componentes) y `scripts/contracts` en verde, y `contracts:verify-provider` (o su equivalente pendiente de US-214) sobre `POST /platform/evidence-analyses`. Los E2E de US-069 cierran en la rama de L1D-140 (tasks 3.4 de ese change).
- [ ] 5.2 Nota para `/sprint-close`: la prosa de `readme.md` (§1, HU-03, OL-04), `CLAUDE.md` y `openspec/config.yaml` conserva el literal anterior; la sesión principal la corrige junto con la fila E-11 del PRD, RN-19 y US-069 `[S1 resp. 32]`. El literal validado manda. **Diferida a L1D-282 (ARR-06, conciliación) (cierre S1, 2026-10-18).**


> Cierre S1 (2026-10-18): tareas marcadas `[x]` tras `/opsx:verify` sobre `main` con evidencia de commits `test`/`feat` y suites en verde; las diferidas llevan su tarjeta de arrastre (`backlog/sprints/S2-arrastre.md`).