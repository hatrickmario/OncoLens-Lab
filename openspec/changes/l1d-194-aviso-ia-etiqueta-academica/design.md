# Design — l1d-194-aviso-ia-etiqueta-academica

## Contexto

US-069 (RN-19, AC-T3.1) pide dos textos distintos: el **aviso de IA**, que acompaña a toda salida generada y
viaja en `EvidenceAnalysis.disclaimer`, y la **etiqueta** "Uso académico/investigación", permanente en
toda página autenticada. El Pre-S1 congeló el contrato con un `disclaimer` que juntaba las dos frases con
raya (`[Pre-S1 resp. 25]`); `[S1 resp. 9]` (2026-10-13) lo corrigió: literal de B-06 con dos puntos, solo
esa frase en el campo, etiqueta aparte. La validación clínica de los oncólogos asesores `[S1 resp. 32]`
(2026-10-14, `backlog/sprints/S1-plan.md` §7) fija el literal definitivo y supersede el de B-06 (PRD E-11),
con "Uso académico/investigación" visible y permanente; la decisión 58 del plan fija la versión 1.4.1. Pantalla de referencia: `docs/ux/S1/pantallas-s1.md` S1-08/09
(cabecera, posición 2 "Aviso IA", posición 7 "Pie" y tabla de estados) y `docs/ux/sistema-de-diseno.md`
(`AiDisclaimer`, `AppHeader`). Sin desviaciones.

## Decisiones

- **D1 · Literal (decidido, `[S1 resp. 32]`, supersede `[S1 resp. 9]`):** `AI_DISCLAIMER_TEXT` = "Generado
  por IA; requiere validación clínica independiente por el oncólogo tratante." (con el punto final, que
  forma parte del literal). Barato de revertir (configuración y texto): una sola opción, sin alternativas.
  Descartados: el literal de B-06 con dos puntos (`[S1 resp. 9]`, superado por E-11) y la raya de
  readme/RN-19 v1.2 (C-14). El literal da cero coincidencias en los niveles A y B de la lista 1.2.0 de
  L1D-193 (verificado allí como caso de conformidad).
- **D2 · Fuente única (decidido, `[S1 resp. 3]`, US-069 AC-2):** el literal vive solo en la configuración de
  `clinical-api`; `web` lo pinta desde la respuesta. Descartado: constante en `web` (dos fuentes que
  divergen) y mensaje i18n del aviso en `apps/web/messages/es.json` (lo mismo).
- **D3 · Etiqueta en el *layout*:** "Uso académico/investigación" es un mensaje de UI de `web`
  (`apps/web/messages/es.json`, clave `app.academicUseLabel`). **La clave la crea L1D-197** (dueño de
  `es.json`), que la muestra y la prueba también en `/login` (Gate 1, 2ª vuelta: el login sí lleva la
  etiqueta); este change solo la **consume**, sin crearla ni cambiar su valor. La renderiza `AppHeader` en
  `app/(dashboard)/layout.tsx`, de modo que toda página autenticada futura la hereda (AC-3). No es
  configuración de `clinical-api`: no es salida generada ni valor "a calibrar". El pie del panel
  (posición 7) reutiliza la misma clave.
- **D4 · Falla cerrado (asumido):** `AI_DISCLAIMER_TEXT` vacía o ausente impide arrancar `clinical-api`
  (validación Zod de la configuración que crea L1D-104). Evita un `disclaimer` vacío, que el contrato
  prohíbe (`minLength: 1`).
- **D5 · Regla de `contracts:check`:** `assertDisclaimerRequired` pasa de "tres subcadenas" a **igualdad
  exacta** con el literal de `[S1 resp. 32]` en los ejemplos (el literal de B-06 pasa a ser hallazgo); la descripción del schema debe mencionar `AI_DISCLAIMER_TEXT` y el
  literal. El literal esperado vive como una constante de la regla (es el ejemplo no normativo del
  contrato; el runtime manda por configuración).

## Privacidad y ownership

- **Fronteras:** el aviso viaja `clinical-api` → BFF (`app/api/evidence-analyses/route.ts`) → navegador como
  un campo de texto fijo. No contiene identidad, PHI ni datos del paciente; no cruza hacia
  `rag-orchestrator` (Backend 2 no lo genera ni lo recibe, y su spec no declara `disclaimer`).
- **Desidentificación (RN-11):** no aplica; el campo no deriva del contexto clínico.
- **rag-orchestrator:** sin cambios; no toca datos clínicos ni `clinical-minio`.
- **Datos:** solo seed sintético y un valor sintético de `AI_DISCLAIMER_TEXT` en el test de AC-2
  (RN-13, RN-14). Los *logs* no registran el texto del análisis.

### Seguridad web

- **Validación:** la respuesta del BFF se valida con el schema Zod compartido generado
  (`packages/api-contracts/src/zod/`), que exige `disclaimer` `string` `min(1)`; sin cambios en Zod (solo
  cambia la descripción, que no se genera como validación).
- **Variables `NEXT_PUBLIC_`:** ninguna nueva. El literal **no** se expone como variable de entorno del
  cliente.
- **Módulos `server-only`:** ninguno nuevo; `AiDisclaimer` y `AppHeader` son RSC.
- **Render:** `disclaimer` y la etiqueta se renderizan como texto de React (escapado), nunca con
  `dangerouslySetInnerHTML`.
- **CSP y cabeceras:** sin impacto. **Dependencias nuevas:** ninguna.

## Componentes y patrones

- `components/molecules/AiDisclaimer.tsx` (nuevo, RSC, < 30 líneas): recibe `text: string` (el
  `disclaimer`) y lo pinta en una banda navy con `role="note"`. Un concepto. Consumidores: el resultado del
  panel (posiciones 2 y 7) en el S1; resumen del caso (S2) y seguimiento (S5) después.
- `components/organisms/AppHeader.tsx` (nuevo, RSC; **dueño único** `[S1 resp. 18]`): marca, etiqueta
  permanente y el *slot* del paciente. Sin estado.
- `app/(dashboard)/layout.tsx` (nuevo; dueño único): monta `AppHeader`. Sin `'use client'` ni *provider*.
- **Patrones:** ninguno (sin hooks ni providers: no hay ≥2 consumidores con estado ni *prop drilling*).
- **Coordinación con L1D-140 (resuelta, `[S1 resp. 18]`):** este change crea `AiDisclaimer`, `AppHeader`,
  y el *layout* (la clave `app.academicUseLabel` es de L1D-197, D3); L1D-140 solo los compone y depende de
  este change, que se mergea antes. Para
  no depender del panel, los AC se prueban aquí con **tests de componente aislados** (Testing Library +
  MSW desde `contracts/examples/`: `AiDisclaimer` con el `disclaimer` de `con-evidencia-s1.json` y de
  `sin-evidencia.json`; `AppHeader` y el *layout* con la etiqueta fuera del `role="note"`). Los E2E de
  AC-1…AC-4 sobre `/pacientes/[id]/analisis` se importan a L1D-140 (tasks 3.4) y se implementan en su rama,
  sin `.skip`.
- `apps/web/messages/es.json` y `app.academicUseLabel` los crea L1D-197; este change no modifica `es.json`.

## Dependencias y colaboradores

| Módulo | Acción | Depende de | Regla extraída |
|---|---|---|---|
| `apps/clinical-api/openapi.yaml` | mod. (descripción) | — | — |
| `contracts/examples/*.json` (todo ejemplo con `disclaimer`) | mod. (`disclaimer`) | spec | — |
| `scripts/contracts/rules/assertDisclaimerRequired.mjs` | mod. | `lib/findings`, `lib/examples`, `lib/specs` | `esAvisoLiteral()` (RN-19) |
| `apps/clinical-api/src/config.ts` | (de L1D-104) valor por defecto y no vacío | Zod | — |
| `infra/docker/.env.example` | mod. | — | — |
| `apps/web/components/molecules/AiDisclaimer.tsx` | nuevo | props | — |
| `apps/web/components/organisms/AppHeader.tsx` | nuevo (dueño) | `messages/es.json` (de L1D-197) | — |
| `apps/web/app/(dashboard)/layout.tsx` | nuevo (dueño) | `AppHeader` | — |
| `readme.md` | regenerado (solo extracto §4, si incluye la descripción) | `contracts:readme-extract` | — |

El service del gateway (L1D-104) recibe la configuración por parámetro de su *factory*; nunca lee
`process.env` directo. Ningún service ni dominio depende de un cliente concreto.

## Contratos

**Proveedor:** `clinical-api` (`apps/clinical-api/openapi.yaml`). **Consumidores:** `web` (BFF y panel, vía
Zod/tipos generados) y los mocks MSW construidos desde `contracts/examples/` (US-213). Compatible
(`oasdiff`: sin *breaking*; solo descripciones y ejemplos), conforme a ADR-26.

```diff
 info:
-  version: 1.4.0            # vigente tras L1D-164 (1.1.0), L1D-197 (1.2.0), L1D-103 (1.3.0) y L1D-104 (1.4.0), decisión 58 del plan
+  version: 1.4.1            # patch: solo texto
 ...
 EvidenceAnalysis:
   properties:
     disclaimer:
       type: string
       minLength: 1
       description: >-
-        Un solo texto configurable (AI_DISCLAIMER_TEXT, que manda sobre la redacción) con las
-        dos frases de RN-19: "Análisis generado por IA — requiere validación clínica del
-        oncólogo tratante" y "Uso académico/investigación".
+        Un solo texto configurable (AI_DISCLAIMER_TEXT, que manda sobre la redacción) con la
+        frase de RN-19 en el literal validado (PRD E-11): "Generado por IA; requiere validación
+        clínica independiente por el oncólogo tratante.". "Uso académico/investigación" es una
+        etiqueta permanente de la UI y no forma parte de este campo.
 FollowUpTurn:
   properties:
     disclaimer:
       description: >-
-        Un solo texto configurable (AI_DISCLAIMER_TEXT) con las dos frases de RN-19:
-        "Análisis generado por IA — requiere validación clínica del oncólogo tratante" y
-        "Uso académico/investigación".
+        (misma descripción que EvidenceAnalysis.disclaimer)
```

Ejemplos (`contracts/examples/`): **todo ejemplo con `disclaimer`** `[S1 resp. 17]` (hoy
`con-evidencia-s1.json`, `con-evidencia-s4.json`, `sin-evidencia.json`, `tipo-no-habilitado.json`,
`follow-up-turn.json` y `follow-up-fuera-de-contexto.json`; la regla los recorre todos, no una lista fija):

```diff
-  "disclaimer": "Análisis generado por IA — requiere validación clínica del oncólogo tratante · Uso académico/investigación",
+  "disclaimer": "Generado por IA; requiere validación clínica independiente por el oncólogo tratante.",
```

Sin rutas, códigos de estado ni errores nuevos. `rag-orchestrator/openapi.yaml`: sin cambios (no declara
`disclaimer`). Generado: `packages/api-contracts/src/types/clinical-api/types.gen.ts` (comentario JSDoc);
`zod.gen.ts` no cambia. Orden: `contracts:generate` **antes** de `contracts:check` `[S1 resp. 17]`. Si el
extracto de readme §4 incluye la descripción, `contracts:readme-extract` regenera `readme.md` (solo el
extracto).

**Fixtures de la regla** (`scripts/contracts/__fixtures__/parches/ac-17-lenguaje-anclaje.json`), porque su
AC cambió en la spec (`[S1 resp. 9]`, `[S1 resp. 32]`): "quita 'Uso académico/investigación'… → hallazgo"
pasa a "agrega ' · Uso académico/investigación' → hallazgo"; "dos puntos en lugar de raya → sin hallazgos"
pasa a "literal anterior de B-06 (dos puntos) → hallazgo" y "raya → hallazgo"; se añaden "sin
'independiente' o sin punto final → hallazgo" y "ejemplo con el literal exacto de `[S1 resp. 32]` → sin
hallazgos". El commit lleva `Test-Removal: [S1 resp. 32] supersede el literal de S1 resp. 9 y la tolerancia
de Pre-S1 resp. 25`.

**`info.version` (decisión 58 del plan, sustituye al registro de `[S1 resp. 37]`)**: `clinical-api` 1.1.0
(L1D-164) → 1.2.0 (L1D-197) → 1.3.0 (L1D-103, `422 TIPO_CANCER_NO_REGISTRADO`) → 1.4.0 (L1D-104) → **1.4.1** (este change) →
1.5.0 (L1D-203). Quien mergea segundo rebasa.

## Riesgos

- **Orden de merge con L1D-104:** si L1D-104 mergea antes, sus tests de integración con los ejemplos viejos
  (raya) siguen verdes hasta que este change los cambie; si mergea después, debe leer el literal nuevo.
  Mitigación: el valor por defecto de `AI_DISCLAIMER_TEXT` y los ejemplos cambian en el mismo commit
  `contract(L1D-194)`, y los tests comparan contra la configuración, no contra una cadena copiada.
- **Prosa con el literal anterior** en `readme.md`, `CLAUDE.md` y `openspec/config.yaml`, y fila E-11 del
  PRD con RN-19 y US-069: fuera de alcance de este change; las corrige la sesión principal `[S1 resp. 32]`.
- **Ejemplos de otros changes con `disclaimer`** (p. ej. los de L1D-140): llevan el literal de
  `[S1 resp. 32]`; si alguno se mergea antes que este change con el literal anterior, la regla de este
  change lo marca y se corrige aquí, en el mismo commit `contract(L1D-194)`.
- **E2E en la rama de L1D-140:** los Playwright de AC-1…AC-4 necesitan el panel; se implementan allí (importados);
  mientras tanto la evidencia del Gate 2 de este change son los tests de componente aislados y los de
  integración de `clinical-api`.
