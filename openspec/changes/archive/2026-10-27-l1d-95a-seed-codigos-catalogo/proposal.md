# Proposal — l1d-95a-seed-codigos-catalogo

## Trazabilidad

L1D-95 (parte del seed, adelantada) · US-003 · FEAT-04 (L1D-12) · Sprint 3 (oleada 3; el resto de US-003 sigue en el S4) ·
FR-23 · RN-27 · RN-13 · RN-14 · OL-01 (pacientes semilla) · US-039 AC-1/AC-4 (seed y códigos del catálogo) ·
decisión 3 del usuario (2026-10-24) y decisión del usuario del 2026-10-27 en `backlog/sprints/S3-deuda.md` ·
tarea 1.12b de `l1d-94-checklist-determinista` (trasladada a L1D-95)

## Por qué

El catálogo real `1.1.0` (L1D-93) identifica los datos críticos de biomarcador por `destination.match.name`
(`RE`, `RP`, `HER2`, `Ki-67`, `BRCA`, `HRR`), pero el seed de `clinical-api` y los fixtures que lo espejan
siembran `Receptor de estrógeno` y `Receptor de progesterona`. Con el catálogo real, el checklist del paciente
semilla marcaría `re` y `rp` como `faltante` aunque el dato exista. La decisión 3 del usuario (2026-10-24) fue que
el seed adopte los nombres del catálogo; el 2026-10-27 el usuario decidió adelantar esa parte al S3 para que
L1D-98 (faltantes al análisis) y L1D-181 (procedencia del contexto) se prueben sobre datos coherentes con el catálogo.

## Qué cambia

- `clinical-api` (seed): `prisma/seed/pacientes/{a,c,e}.ts` siembran `RE` y `RP` en lugar de
  `Receptor de estrógeno` / `Receptor de progesterona`. `HER2` ya coincide y no cambia.
- Tests y fixtures que espejan el seed: `tests/support/filas-sinteticas.ts` (FX-T1a-a: el receptor del seed que
  localiza, el `90 %` en conflicto y las dos progesteronas rechazada/reemplazada),
  `tests/integration/seed/contenido.test.ts`, `tests/integration/seed/codigos-del-catalogo.test.ts` y
  `tests/integration/pacientes/ficha.test.ts`.
- Nuevo test de integración: el checklist calculado con el **catálogo real `1.1.0`** sobre los pacientes semilla
  deja `re`, `rp` y `brca_germinal` presentes (ver design D3).
- Sin cambio de API ni de esquema: no hay `contract(L1D-95a)`.

## Capacidades

- `data-model` (delta: se AÑADE el requisito de nombres de biomarcador del seed alineados con el catálogo).

## Bounded contexts

clinical-platform (solo `apps/clinical-api`: seed y tests). `ai-services` no interviene.

## Dependencias

- ↪ `l1d-93-catalogo-datos-criticos-validado` (catálogo `1.1.0`, mergeado) y `l1d-94-checklist-determinista`
  (`CompletenessService`).
- ⛔ Va **antes** de `l1d-98-faltantes-al-analisis` y de `l1d-181-procedencia-contexto-ia` (O3): ambos pasarán a
  emparejar por `dataRef`/`id` y no por el nombre antiguo; si L1D-181 ya fijó `Receptor de progesterona` en un
  escenario, se alinea al rebasar.
- 🔗 El router `/completeness`, el cableado a la vista de caso y a la ficha y `missingCriticalCount` siguen en
  **L1D-95 (S4)**.

## Fuera de alcance

- Router `GET /platform/patients/{id}/completeness`, `CaseView.completeness`, `missingCriticalCount` (resto de US-003, S4).
- Los catálogos de test `test-1.0.0`/`test-1.1.0` de `tests/fixtures/completeness/` y los helpers `sembrarFM1…FM3`
  de `tests/support/completitud.ts`: son los fixtures FX-04-a/b de L1D-94, con la tabla de US-002 y sus propios nombres.
- `contracts/examples/*.json` (`biomarkerName: "Receptor de estrógeno"` en ejemplos de `rag-orchestrator`): son
  ejemplos compartidos con `ai-services`; se reporta, no se edita aquí.
- Añadir al seed filas de BRCA o HRR: OL-01 no las contiene; no se inventa contenido clínico.
- Mapeo LOINC de RE/RP: el catálogo no tiene entrada, siguen `no_mapeado` (RN-27).
