# Proposal — l1d-188-base-faltantes-declarados

## Trazabilidad

L1D-188 · US-128 · FEAT-T2b (L1D-37) · Sprint 3 (adelantada del S4, `[S3 resp. 18]`) · Estimación **3** · HU-20 ·
FR-27 inciso (b) (dueña), FR-23 · RN-02, RN-06, RN-10, RN-11, RN-26 · AC-T2.1 (inciso b y resumen visible), AC-T2.2 (b),
AC-T2.4, AC-04.3 (Base) · US-128 AC-1…AC-4 · ↪ US-006 (L1D-98), US-066 (L1D-186, archivado), US-067 (L1D-187) ·
🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-06] → US-053 · Pantalla de referencia **S2-09**
(`docs/ux/S2/pantallas-s2.md`) · Refinamiento `backlog/sprints/S3-refinamiento.md`.

> **Decidido (usuario, 2026-10-24, `[S3 resp. 18]`, Gate 1 del S3):** se adelanta al S3 porque l1d-98 (US-006) ya
> calcula y persiste los faltantes con el análisis; sin US-128 la Base diría "Los faltantes críticos aún no se
> calculan en esta versión", que sería falso. S3 +3 pts, S4 −3.
>
> **Límite del S3 (US-005, S4):** el panel previo con «Continuar con aviso» no existe todavía. En el S3
> `continueWithWarning` vale lo que envíe el request (por defecto `false`) y la UI siempre envía `false`; la Base
> refleja el valor recibido. Este change **no** crea UI para elegir continuar.

## Why

Desde l1d-98 el gateway calcula en el servidor los datos críticos faltantes, los envía a `rag-orchestrator` y los
persiste en `missing_critical_data` y `continued_with_warning`, pero `AnalysisBasisBuilder` (US-066) sigue fijando
`analysisBasis.missingCriticalData = []` y antepone el supuesto declarado "Los faltantes críticos aún no se calculan
en esta versión". En el S3 eso ya es falso. El oncólogo necesita leer en la Base, sin expandirla, cuántos datos
críticos faltaban y si continuó con aviso, y al expandirla, cuáles (P12, JTBD 8; hipótesis 2: el análisis declara lo
que no sabe).

## What Changes

- **Builder (clinical-api):** `analysisBasis.missingCriticalData` copia `clinicalContext.missingCriticalData` del
  request interno (la misma lista que l1d-98 persiste), en el orden del catálogo, en `con_evidencia` y en
  `sin_evidencia`; nunca la toma de la respuesta de Backend 2 (AC-T2.2). `continuedWithWarning` sigue saliendo del
  request del cliente.
- **Se retira el supuesto declarado** "Los faltantes críticos aún no se calculan en esta versión": `assumptions`
  solo trae los verificados de la respuesta interna (vacía en el S3; reglas de supuestos → US-129).
- **Etiquetas del catálogo:** la Base trae, junto a las claves, su etiqueta en español del catálogo cargado
  (`label.es` de `datos-criticos.json`), resuelta por `clinical-api` con la `catalog_version` del análisis.
  Campo **aditivo requerido** `missingCriticalDataLabels` en `AnalysisBasis` (design D3, opción A **aprobada por
  contract-keeper en el Gate 1 del S3**, `[S3 resp. 18]`; `oasdiff`: 0 incompatibles, solo
  `response-required-property-added` informativo; sin excepción E-n). `missingCriticalData` sigue siendo las claves.
  `info.version` de `clinical-api` sube la **minor** (design Contratos).
- **Panel (web):** el resumen sin expandir dice "1 dato crítico faltante" (n = 1) o "{n} datos críticos faltantes"
  (n ≠ 1, incluido 0) y, solo si `continuedWithWarning = true`, "{texto} · continuó con aviso"; en
  `tipo_no_habilitado` no muestra contador ("No se consultó el corpus: tipo fuera de alcance · Datos críticos
  faltantes: no evaluados en este estado"). El detalle lista las etiquetas en el orden recibido bajo "Datos críticos
  faltantes" con la nota "Solo informa; no bloquea el análisis" (RN-26). Deja de mostrarse el texto del supuesto
  declarado (textos de clinical-language-auditor, Gate 1 del S3, `[S3 resp. 18]`).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `analysis-basis`: MODIFIED "Todo análisis trae la Base con los incisos del S1" (el inciso (b) deja de ir vacío) y
  "Resumen de la Base visible sin expandir" (de l1d-187: nuevo literal de faltantes y continuación con aviso);
  REMOVED "Supuesto declarado mientras los faltantes no se calculan"; ADDED el inciso (b) declarado y la lista de
  faltantes con su etiqueta en el detalle.

El cálculo y la persistencia de los faltantes (`evidence-analysis-gateway`) son de l1d-98 y el checklist
(`completeness`) de l1d-94: este change solo los consume, no duplica sus requisitos.

## Bounded contexts

- **clinical-platform** (`apps/clinical-api`, módulo `evidence-analysis`): builder, resolución de etiquetas y
  contrato.
- **frontend** (`apps/web`): resumen y detalle del panel de la Base.
- **ai-services**: sin cambios.

## Dependencias

- ↪ **`l1d-98-faltantes-al-analisis`** (US-006): `clinicalContext.missingCriticalData` calculado y persistido. Este
  change se rebasa sobre él; va en una oleada posterior del S3.
- ↪ **`l1d-94-checklist-determinista`** (US-002) y **`l1d-93-catalogo-datos-criticos-validado`** (US-001): catálogo
  `test-1.0.0` (FX-04-a) con `label` por ítem, pacientes FX-04-b (F-M2) y el cargador del catálogo.
- ↪ **US-066** (archivado, `2026-10-22-l1d-186-base-analisis-builder`): `AnalysisBasisBuilder`.
- ↪ **`l1d-187-panel-base-analisis`** (US-067, activo con tareas de visual-check y E2E): su requisito "Resumen de la
  Base visible sin expandir" se modifica aquí; **l1d-187 debe archivarse antes que este change**.
- 🔗 US-005 (S4): panel previo con «Continuar con aviso», que hará que la UI envíe `continueWithWarning = true`.

## Fuera de alcance

- Elegir «Continuar con aviso» desde la UI y el aviso previo al análisis → US-005 / US-003 (S4).
- Supuestos (c) por reglas o verificados → US-129; limitaciones (g) → US-130 (`si-hay-capacidad`).
- Uso de los faltantes en el prompt → US-116 (S5). Aviso `datos_faltantes` en las tarjetas → US-136.
- `tipo_no_habilitado` (US-043): sigue sin checklist y con `missingCriticalData = []` (el panel no muestra contador, Q2).
- Historial de análisis (AC-T2.4 en historial) → US-174.

## Impact

- `apps/clinical-api/openapi.yaml`: `AnalysisBasis.missingCriticalDataLabels`, aditivo requerido; `info.version`
  minor (`1.9.1` → `1.10.0` tras `l1d-285`, design Contratos); **todo** ejemplo de `contracts/examples/` con
  `analysisBasis`, incluido `con-evidencia-s3-aplicabilidad.json` de `l1d-129` sea cual sea el orden de merge.
- `apps/clinical-api/src/modules/evidence-analysis/{analysis-basis.ts, ports.ts, evidence-analysis.module.ts}`.
- `apps/web/lib/evidence/resumen-base.ts`, `apps/web/components/molecules/{basis-summary,basis-detail}.tsx`,
  `apps/web/lib/mensajes.ts`; tests en `tests/ui/` y `e2e/`.
- Evaluación: no cambia modelo, prompt, umbral, catálogo real ni corpus → sin `evaluate`. Texto visible nuevo →
  `clinical-language-auditor` en el Gate 2.
