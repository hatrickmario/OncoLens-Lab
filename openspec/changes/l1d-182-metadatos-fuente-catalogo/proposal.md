# Proposal — l1d-182-metadatos-fuente-catalogo

## Trazabilidad

L1D-182 · US-127 · FEAT-T1a (L1D-34) · Sprint 3 · Estimación **3** · HU-22, HU-20 · RN-25 (dueña) · RN-04
(regresión) · AC-T1.3 (metadatos), AC-08.9 (valor del estudio) · US-127 AC-1, AC-2, AC-3, AC-4 · ↪ US-063
(L1D-179, archivado: `construir_cita`), US-118 (L1D-117, metadatos de población en el catálogo), US-122
(L1D-127, `studyPopulationValue` estructurado) · 🔗 Consumida por: FEAT-07 (etiquetas factuales) y FEAT-09
(vigencia), ambas S6 si hay capacidad, con `🔗 Regresión [RN-25] → US-127` · 🔗 Medido en: US-132 (L1D-244,
metadatos del corpus) · DoR del S3: ✓ (`backlog/sprints/S3-refinamiento.md` §2; UI en
`docs/ux/S1/pantallas-s1.md` y `docs/ux/sistema-de-diseno.md`, `CitationItem`).

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3 (`backlog/features/README.md`, «Reordenamiento del
> 2026-10-23»).

## Why

Desde el S1 (US-063) `construir_cita` copia del catálogo `title`, `sourceName` y los demás metadatos, pero
nada fija como contrato verificable que **todos** los metadatos factuales de la fuente (diseño, fase,
endpoint, tamaño de muestra, fechas, versión de la guía y población del estudio) salgan de
`corpus.corpus_document` y nunca del texto generado, ni que un metadato ausente viaje `null` y se muestre
"No disponible" (RN-25). Además, el panel de la cita aún no muestra fase, endpoint, tamaño de muestra ni
versión de la guía. Con la aplicabilidad y los metadatos de población entrando en el S3 (US-118, US-122), el
oncólogo va a comparar fuentes por esos datos: tienen que ser los del catálogo, completos y sin rellenos.

## What Changes

- **`rag-orchestrator`**: queda especificado y probado que los siete metadatos factuales de `CitedSource`
  (`studyDesign`, `trialPhase`, `primaryEndpoint`, `sampleSize`, `publishedAt`, `lastUpdatedAt`,
  `guidelineVersion`) son copia de las columnas de `corpus_document`; que cualquier valor que el LLM incluya
  para ellos se ignora; y que una columna vacía o nula viaja `null` (nunca `""`, `0` ni un centinela de texto).
- **`rag-orchestrator`**: escenario de US-127 AC-4 (`studyPopulationValue` literal de `population_criteria`,
  sin reformular, traducir ni normalizar) sobre el **único requisito** de ese valor, que es de `l1d-127`; sin
  requisito duplicado (`[S3 resp. 16]`).
- **`clinical-api`**: regresión de que el gateway persiste (`AIAnalysisRecord`) y devuelve esos campos tal
  cual, incluidos los `null`.
- **`web`**: `CitationDetails` muestra también fase, endpoint principal, tamaño de muestra y versión de la guía,
  con "No disponible" para lo ausente (RN-25), siguiendo `CitationItem` del sistema de diseño.
- Sin cambio de contrato: `CitedSourceFields` y `ApplicabilityCriterion` ya declaran estos campos como
  nullables desde el congelamiento del Pre-S1 (US-033); solo se añade un ejemplo con nulos si falta.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis`: los requisitos de copia de la cita desde el corpus (RN-04) se amplían a los metadatos
  factuales de RN-25, con su escenario de ausencia (`null`) y de valores inventados por el LLM.
- `applicability` (la crea `l1d-127-estado-criterio-estructurado`): MODIFIED del requisito de l1d-127 "Valor
  del estudio copiado de la fuente o desconocido sin inferencia", solo para añadir el escenario de AC-4
  (`[S3 resp. 16]`).
- `evidence-panel` (la crea `l1d-140-panel-opcion-citas`): la cita muestra los metadatos factuales y "No
  disponible" para fase, endpoint, tamaño de muestra y versión ausentes (AC-3, UI).

## Bounded contexts

`ai-services` (principal) · `clinical-platform` (regresión de persistencia y respuesta) · `frontend`
(`CitationDetails`).

## Dependencias

- ↪ **US-063** (`l1d-179-citas-chunk-recuperado`, archivado): amplía `construir_cita` y su suite.
- ↪ **`l1d-127-estado-criterio-estructurado`** (US-122): AC-4 se verifica sobre su cálculo de
  `studyPopulationValue`; este change se rebasa sobre él.
- 📦 **Orden de archivo de `applicability`** (`[S3 resp. 16]`): 127 → 128 → 129 → 130 → **182** (el MODIFIED
  exige el requisito de l1d-127 ya archivado).
- ↪ **US-118** (L1D-117): pobla `population_criteria` y los metadatos de diseño y endpoint en el catálogo
  real; aquí los AC usan el catálogo de test sembrado (FX-06a-a, FX-08b-a), así que no bloquea.
- ↪ **`l1d-140-panel-opcion-citas`** (US-061, In Review): dueño de `CitationDetails` y de la capacidad
  `evidence-panel`; debe archivarse antes que este change.

## Fuera de alcance

- Autoría (`authors`): el catálogo aún no la registra (`catalogo_reader.py` la deja `null`); sigue mostrándose
  "No disponible" sin nueva columna.
- Vigencia (`possiblyOutdated`, `newerVersionAvailable`, FEAT-09) y etiquetas factuales de la síntesis
  (FEAT-07): consumidoras de RN-25, fuera del S3.
- Mostrar `studyPopulationValue` en la tabla de aplicabilidad: lo hace US-062 / la tabla del S4.
- Extracción y verificación de los metadatos en la ingesta: US-118.
- Medición de la calidad de los metadatos del corpus: US-132.

## Impact

- `apps/rag-orchestrator/app/domain/citations.py`, `app/infrastructure/catalog/catalogo_reader.py`, adapters
  falsos de generación (FX-06a-b) y tests de `/rag/query`.
- `apps/clinical-api/src/modules/evidence-analysis/` (solo tests de regresión).
- `apps/web/components/molecules/citation-details.tsx`, `apps/web/messages/es.json`, E2E del panel.
- Contratos: sin diff de `openapi.yaml`; posible ejemplo nuevo en `contracts/examples/`.
