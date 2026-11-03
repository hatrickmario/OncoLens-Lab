# Proposal — l1d-84-normalizacion-final-manual

## Trazabilidad

L1D-84 · US-098 · FEAT-03a (L1D-12) · Sprint 5 · Estimación **3** (D-4, `[S5 resp. 4]`) · HU-17 · FR-22 (normalización
final de datos manuales) · RN-27 (dueña) · ADR-33 · AC-03.3, AC-03.5 · M-03.5 · US-098 AC-2, AC-3, AC-4, AC-5, AC-7 ·
`backlog/features/FEAT-03a-normalizacion-duplicados.md` · `backlog/sprints/S5-refinamiento.md` D-4

## Por qué

El oncólogo necesita que el mismo concepto se reconozca siempre igual, venga de un documento o lo escriba él: con su
término canónico, su código estándar y el texto original, y sin códigos inventados (RN-27). ADR-33 hace a Backend 1
dueño de la normalización final, incluidos los datos manuales. En el MVP la única ruta de entrada nueva es el registro
manual (US-110, US-094, US-253); la extracción de documentos es Post-MVP (PRD E-17). D-4 recorta la historia a esa
ruta y a la invariante del catálogo.

## Qué cambia

- `clinical-api`: módulo nuevo `src/modules/reconciliation/` con `ReconciliationService` (sin endpoint propio). Recibe
  una **propuesta de normalización** (`{ entidad, tipoDeCancer, textoOriginal, codigoPropuesto?, tipoDeEvento? }`) y
  decide de forma determinista contra el catálogo montado (`CLINICAL_CATALOG_PATH`):
  - código propuesto presente en el catálogo para su estándar → `mapeado` con ese código y su término canónico;
  - código ausente del catálogo → se descarta el código, nunca el dato: se resuelve por texto o queda `no_mapeado`
    sin código y con el texto original (RN-27, AC-2);
  - texto original que es término canónico, etiqueta o sinónimo ES/EN del catálogo → término canónico y código
    (AC-3, AC-4);
  - `ClinicalEvent` sin codificación aplicable (p. ej. `progresion`) → `n_a` (AC-5).
  La decisión devuelve además la `catalogVersion` montada (AC-4).
- `clinical-api`: puerto `CatalogoTerminologico` y su adaptador de lectura de `codigos.json` y `sinonimos.json` por tipo
  de cáncer (validado ya en el arranque por `exigirCatalogoValido`).
- `packages/clinical-catalogs`: fixture de test **FX-01b-b** `test/fixtures/test-s2-1.0.0/` (HER2 `LOINC-T-HER2` con
  sinónimos "c-erbB-2", "ERBB2", "HER-2/neu"; RE `LOINC-T-RE`; PSA `LOINC-T-PSA`; Ki-67 `LOINC-T-KI67`; CIE-10 `C50.9` y
  `C61`; leuprorelina con el código ATC real `L02AE02`; un procedimiento CUPS de test). Datos sintéticos y códigos
  ficticios salvo CIE-10 y ATC: el patrón de `atcCodes` del contrato de `rag-orchestrator` no admite `ATC-T-*` y no se
  relaja (`[S5 resp. 10]`). El catálogo real **no** cambia en este change.
- Test de arquitectura (AC-7): recorre `apps/clinical-api/openapi.yaml` y los comandos de la CLI `oncolens` y falla si
  alguno genera, exporta o envía un reporte a la Cuenta de Alto Costo (AC-03.5).
- Sin cambio de contrato: el servicio es interno; los endpoints que lo usan los añaden sus consumidores.

## Capacidades

- `terminology-reconciliation` (**nueva** en `openspec/specs/`; prevista en `openspec/config.yaml`): normalización final
  de Backend 1 e invariante del catálogo. No existe aún en `main`, por eso va como ADDED.

## Bounded contexts

- `clinical-platform` (solo `apps/clinical-api` y el fixture de `packages/clinical-catalogs`). Ni `ai-services` ni
  `frontend`.

## Dependencias

- ↪ US-041 (catálogo montado y validado en el arranque): en `main`.
- ↪ DEC-04 (decidida 2026-10-09, `[Pre-S1 resp. 6]`): los cuatro estándares pueden versionarse; el *workaround* Q-07 ya
  no aplica. El catálogo real hoy solo trae CIE-10; `l1d-90` le añade un subconjunto mínimo de LOINC (manifest 1.3.0) y
  `l1d-80` uno de ATC (manifest 1.4.0) `[S5 resp. 9]`. Lo que quede fuera de esos subconjuntos (y todo CUPS) sale
  `no_mapeado`.
- 🔗 Consumida por: `l1d-90-*` (US-110, registro manual de biomarcador y diagnóstico), `l1d-80-*` (US-094, tratamientos
  previos y atributos) y `l1d-309-*` (US-253, corrección con histórico). Este change va en la primera oleada: los tres
  lo llaman desde su service; ninguno reimplementa la normalización (una sola dueña de RN-27).
- US-086 (propuesta de Backend 2): ya no es dependencia; su ruta (extracción) es Post-MVP.

## Fuera de alcance

- **AC-1** (propuesta de Backend 2 en la extracción) y **AC-6** (`CATALOG_VERSION_MISMATCH` al procesar una extracción):
  **Post-MVP** con FEAT-01b (D-4). No son escenarios de este change; la interfaz del servicio acepta `codigoPropuesto`
  para que la extracción lo reutilice sin cambiarlo.
- Endpoints de registro manual (`/biomarkers`, `/diagnoses`, `/prior-treatments`, `/clinical-attributes`): de US-110,
  US-094 y US-253. La regresión de AC-4 «pasa por el mismo servicio» la verifican esos changes en su integración.
- Duplicados y conflictos entre documentos (US-099) y no reemplazo silencioso (US-100).
- Poblar el catálogo real: LOINC lo hace `l1d-90` y ATC `l1d-80`, cada uno con su `evaluate` (OL-06) `[S5 resp. 9]`;
  CUPS no se puebla en el S5.
- Medición M-03.4/M-03.5 en la suite: US-106.
