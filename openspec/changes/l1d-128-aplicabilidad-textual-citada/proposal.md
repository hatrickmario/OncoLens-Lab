# Proposal — l1d-128-aplicabilidad-textual-citada

## Trazabilidad

L1D-128 · US-123 · FEAT-08b (L1D-20) · Sprint 3 · Estimación **5** · HU-22 · FR-25 (valor textual
de la población del estudio) · RN-01 (afirmaciones de aplicabilidad citadas y con soporte NLI) ·
RN-04 (citas copiadas del corpus, regresión) · RN-25 · ADR-34 · AC-08.3, AC-T1.2 (aplicabilidad) ·
US-123 AC-1, AC-2, AC-3, AC-4, AC-5 · ⛔ ADR-39 (NLI: fase A aceptada, mDeBERTa; los AC usan adapters
falsos) · DoR del S3: ✓ "NLI fijado en ADR-39 fase A" (`backlog/sprints/S3-refinamiento.md` §2) ·
Contexto del sprint: `[S3 resp. 1]` (DEC-11 se implementa sobre el catálogo `propuesta_revisada`;
un cambio de la sesión de oncólogos del S4 solo toca el catálogo JSON) · Reordenamiento del
2026-10-23 (S5 → S3) · `[S3 resp. 16]` (2026-10-24, Gate 1: `studyPopulationValue` en `camposGenerados`, versión del
prompt de aplicabilidad registrada, OQ-1 decidida) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-04] → US-063.

> **Decidido (usuario, 2026-10-24, `[S3 resp. 16]`):** (1) `studyPopulationValue` pasa a `camposGenerados`
> (RN-23) en `@oncolens/clinical-language` y en su par Python (`CampoGenerado` de `app/domain/support.py`), con su
> test de coherencia (el de L1D-180); (2) la versión del prompt de aplicabilidad (D6) se registra en el log del análisis
> y en el `AIAnalysisRecord` junto a la del generador, sin cambio de contrato; (3) OQ-1: un valor textual aceptado que
> no encaja en la regla del catálogo queda `desconocido` y el LLM **no** asigna estado; (4) la llamada de aplicabilidad
> devuelve `chunkId` reales: los alias como en `l1d-287-alias-chunks-cita` quedan como seguimiento, fuera de este change.

> **Supuesto "(asumido)" del AC-5:** falla cerrada si el NLI no está disponible durante la
> aplicabilidad, igual que US-064 AC-6 (aceptado en el S1, `[S1 resp. 3]`): `503 NLI_UNAVAILABLE`
> y ninguna aplicabilidad sin validar.

## Why

Muchas guías y estudios no publican su población de forma estructurada: el dato está en el texto
("This guidance applies to patients with HER2-negative disease"). US-122 compara criterio a criterio
cuando hay `population_criteria`; sin ellos, toda la fuente quedaría `desconocido` aunque el texto lo
diga, o —peor— el modelo afirmaría una característica del estudio que nadie verificó y el oncólogo
la tomaría por cierta (P6, JTBD 4). Esta historia abre un camino más del servicio de aplicabilidad:
el LLM **solo propone** el valor del estudio con una cita, y el valor se acepta únicamente si la cita
es un chunk recuperado de esa fuente en esta consulta y el NLI confirma el soporte; si no, el
criterio queda `desconocido` con `no_reportado_por_fuente` y la afirmación se omite y se cuenta.

## What Changes

- **Camino textual de la aplicabilidad** en `rag-orchestrator`: para cada fuente recuperada y cada
  criterio del catálogo sin valor estructurado en `population_criteria`, se pide al LLM una propuesta
  `(criterio, valor del estudio, chunkId)`. Nunca para criterios con valor estructurado (US-122 AC-6)
  ni con `sin_evidencia` (RN-02).
- **Validación de la propuesta** reutilizando lo existente: la cita pasa `validar_citas()` (US-063,
  solo chunks recuperados en esta consulta y de esa fuente; campos copiados del corpus, RN-04) y la
  afirmación pasa el NLI estricto (`SupportChecker` / `VerificadorDeSoporte` de US-064, umbral
  `NLI_ENTAILMENT_THRESHOLD`) con el texto del chunk citado como premisa, y el filtro de términos
  prohibidos (RN-23) antes del NLI.
- **Valor aceptado** → `studyPopulationValue` = valor propuesto, `citedSources` con el chunk copiado del
  corpus, y el **estado lo asigna la regla del catálogo** (la de US-122) sobre ese valor; el
  `patientValue` sigue copiado del `clinicalContext` (ADR-34).
- **Valor no aceptado** (sin soporte, cita ajena o término prohibido) → criterio `desconocido`,
  `unknownReason = no_reportado_por_fuente`, `studyPopulationValue = null`, `citedSources = []`; la
  afirmación no aparece en la respuesta y `omittedClaims` suma 1. Un criterio sobre el que el LLM no
  dice nada → `desconocido` (`no_reportado_por_fuente`) sin contar como omitido.
- **`studyPopulationValue` es campo generado** (RN-23, `[S3 resp. 16]`): se añade a `camposGenerados` de
  `packages/clinical-language/origen-de-campos.json` y a `CampoGenerado` / `CAMPOS_GENERADOS` de
  `app/domain/support.py`; el test de coherencia JSON ↔ Python de L1D-180 lo cubre. El filtro de términos prohibidos
  del paso de validación lo revisa como campo generado.
- **Versión del prompt de aplicabilidad registrada** (`[S3 resp. 16]`): cuando el camino textual invoca al LLM,
  `meta.promptVersion` lleva la del generador y la de aplicabilidad (`<generador>+aplicabilidad-texto@0.1.0`), que
  `clinical-api` persiste tal cual en `AIAnalysisRecord.promptVersion`; el log del análisis la registra aparte. Sin
  cambio de contrato (`promptVersion` es `string`).
- **Falla cerrada**: un error del NLI durante la aplicabilidad → `503 NLI_UNAVAILABLE` (código ya
  existente); un error del LLM de aplicabilidad → `503 LOCAL_LLM_UNAVAILABLE` (ya existente).
- **Fixture FX-08b-a** completo para el camino textual: LLM falso de aplicabilidad (`APL-OK`,
  `APL-SIN-SOPORTE`, `APL-CITA-AJENA`, variante silenciosa para AC-4) y NLI falso.
- **Sin cambio de contrato**: `ApplicabilityCriterion` (`studyPopulationValue` nullable, `unknownReason`,
  `citedSources`) y `omittedClaims` ya están congelados (US-033).

## Capabilities

### New Capabilities

- `applicability`: aplicabilidad paciente ↔ evidencia criterio a criterio (nombre de la lista de
  capacidades de `openspec/config.yaml`). La crea en paralelo `l1d-127-estado-criterio-estructurado` (US-122, camino
  estructurado); este change **añade** (ADDED) los requisitos del camino textual. Si L1D-127 archiva
  primero, el `## Purpose` de este delta se ignora; no hay requisitos duplicados entre ambos.

### Modified Capabilities

- Ninguna. `evidence-analysis` no cambia: los requisitos de soporte NLI, umbral y `503 NLI_UNAVAILABLE`
  (L1D-180) se reutilizan sin modificarse; `omittedClaims` ya cuenta "toda afirmación generada omitida".

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator` (`application/`, `domain/`, `infrastructure/llm/`, `tests/`) y el dato
  `packages/clinical-language/origen-de-campos.json` (una entrada en `camposGenerados`, sin código nuevo en el paquete).
- No toca `clinical-platform` (el gateway ya persiste y reenvía `applicability` y `omittedClaims` tal
  como llegan, y `promptVersion` es un `string` que persiste sin cambios de código) ni `frontend` (la tabla de aplicabilidad es US-126, S4).

## Dependencias

- ↪ **Depende de** `l1d-127-estado-criterio-estructurado` (L1D-127, US-122): `ApplicabilityService`, regla pura
  `domain/applicability_rules.py`, copia del `patientValue` y el camino estructurado; este change
  añade una rama a ese servicio. Orden de merge: L1D-126 → L1D-127 → **L1D-128**.
- ↪ **Depende de** `l1d-126-criterios-aplicabilidad-catalogo` (L1D-126, US-121): catálogo `aplicabilidad.json` con `destination`,
  `isExclusionary` y `rule`; los tests usan `test-apl-1.0.0` (FX-08b-a).
- ↪ **Depende de** el change de **L1D-117** (US-118): `population_criteria` (claves por `studyKey` de L1D-126) y
  `metadata_source` en el catálogo del corpus, que deciden si un criterio va por el camino estructurado o el textual;
  un documento `metadata_source = pendiente` tiene todo `no_disponible` y va por el textual `[S3 resp. 16]`.
- 🔗 **Seguimiento** `l1d-287-alias-chunks-cita` (US-236): sus alias efímeros no se aplican a la llamada de
  aplicabilidad en este change (devuelve `chunkId` reales); extenderlos es un seguimiento `[S3 resp. 16]`.
- ↪ **Depende de** `l1d-179-citas-chunk-recuperado` (US-063, archivado) y
  `l1d-180-soporte-nli-descartadas` (US-064, archivado): `validar_citas()`, `SupportChecker`,
  `NLI_ENTAILMENT_THRESHOLD`, `ErrorNliNoDisponible`.
- ↪ **Depende de** `us-231b-adapter-nli-smoke-semilla` (US-231b, en curso): adapter real NLI mDeBERTa
  (ADR-39 fase A); solo para correr con modelos reales, los AC no lo necesitan.
- ⛔ ADR-39 (`l1d-102-adr39-embeddings-reranker-nli`, archivado): fase A aceptada.
- 🔗 Produce para: US-124 (`l1d-129-aplicabilidad-causas-avisos`, causa del desconocido y no comparable), US-125 (`l1d-130-herencia-aplicabilidad-recorte`, herencia
  y selección por aplicabilidad), US-132 (L1D-244, mediciones M-08.x), US-233 (S4, medición con el
  LLM real).

## Fuera de alcance

- Camino estructurado, determinismo sin LLM y `no_coincide`/`parcial` con metadatos: US-122 (L1D-127).
- `falta_en_paciente`, `patientDataWarning`, `populationNotComparable` y conteo del resumen: US-124.
- Herencia por opción y selección antes del recorte a `maxOptions`: US-125.
- Tabla de aplicabilidad en la UI: US-126 (S4).
- Asignación del estado por el LLM cuando el valor textual no encaja en la regla del catálogo: **descartada en el S3**
  `[S3 resp. 16]` (OQ-1); el criterio queda `desconocido`.
- Alias efímeros de chunks en la llamada de aplicabilidad (como `l1d-287`): seguimiento `[S3 resp. 16]`.
- Medición de calidad con el LLM real (prompt de aplicabilidad): US-233 (S4).
