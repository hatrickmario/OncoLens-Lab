# Design — l1d-127-estado-criterio-estructurado

## Context

Ver proposal.md (Why). Estado actual en `apps/rag-orchestrator`:

- `RAGOrchestratorService` (`app/application/rag_orchestrator_service.py`) recorre recuperar → pares del
  *reranker* → reranquear → umbral → (sin evidencia | generar → citas → soporte → recorte a `maxOptions`).
  `ensamblar_respuesta_con_evidencia()` (`app/application/respuesta_con_evidencia.py`) fija `applicability=[]`
  y, en cada opción, `applicabilitySummary` en ceros y `perSource=[]` (esto último es de US-125).
- `CorpusCatalogReader.fichas_por_documento()` lee del schema `corpus` (rol `rag_corpus`) las fichas para las
  citas; no expone `population_criteria` ni `metadata_source`, que sí existen en `corpus.corpus_document`
  (`jsonb`, data-model §4.6; `app/domain/corpus_seed/poblacion.py` normaliza la semilla a seis claves o
  `no_disponible`).
- `CatalogoClinico` (`infrastructure/catalogo_clinico/manifiesto.py`) solo expone `version()` y
  `tipos_de_cancer()`. `packages/clinical-catalogs/<tipo>/aplicabilidad.json` hoy es `{"version","items":[]}` y su
  esquema no fija la forma del ítem: ambas cosas son de US-121 (L1D-126).
- El contrato ya trae `SourceApplicability`, `ApplicabilityCriterion` y `ApplicabilitySummary`
  (`contracts/schemas/evidence.yaml`, congelados en US-033); `clinicalContext` trae `biomarkers`, `diagnosis`
  (`stageValue`, `performanceValue`), `attributes`, `currentLine`, `priorTreatments` y `missingCriticalData`.

## Goals / Non-Goals

**Goals:** un intérprete puro y declarativo de las reglas del catálogo; `patientValue` y
`studyPopulationValue` copiados, nunca generados; `applicability[]` poblada en `con_evidencia` con un resultado
determinista y sin LLM.

**Non-Goals:** ver proposal.md, «Fuera de alcance» (camino textual US-123, avisos y causa desde
`missingCriticalData` US-124, agregación y selección US-125, UI US-126). No se reordena ni se recorta nada.

## Decisions

**D1 · Etapa de aplicabilidad tras el umbral, independiente de la generación.** El servicio de aplicabilidad
recibe los documentos con chunks sobre el umbral, el `clinicalContext` y la versión del catálogo; se ejecuta en
la rama `con_evidencia` y nunca en `sin_evidencia` (RN-02, sin coste). No depende de las opciones generadas,
así que US-125 podrá consumir su salida para agregar por opción y ordenar antes del recorte. Descartado:
calcularla solo para las fuentes citadas por opciones válidas (perdería las fuentes que el oncólogo debe ver
aunque ninguna opción las cite, y ataría el resultado al LLM, contra AC-6).

**D2 · Regla pura en `app/domain/applicability_rules.py`.** Funciones con nombre propio:
`evaluar_criterio(criterio, valor_paciente, valor_estudio) -> CriterioEvaluado` y, dentro, una función por tipo
de regla (`igualdad`, `pertenencia`, `rango`) más la condición de "Parcial"; `contar_estados()` y
`poblacion_no_comparable()` (excluyente en `no_coincide`). El valor del paciente se clasifica con la tabla de
categorías que declara la regla (p. ej., HER2 "3+" o "2+ con ISH positivo" → `positivo`), sin heurísticas en
código. Un tipo de regla desconocido lo rechaza el validador del catálogo al arrancar (US-121, servicio no
listo), nunca en la consulta. Descartado: reglas en Python por criterio (un cambio de DEC-11 en el S4
obligaría a desplegar código, contra RN-22 y US-121 AC-5).

**D3 · `patientValue` por `destination`, copia literal.** Un resolvedor puro
`valor_del_paciente(contexto, destino) -> str | None` traduce cada destino del catálogo a su campo del
`clinicalContext`: `Biomarker` (por nombre) → `biomarkers[].value`; `Diagnosis.stage_value` →
`diagnosis.stageValue`; `Diagnosis.performance_value` → `diagnosis.performanceValue` (entero → su representación
decimal, sin formato adicional); `ClinicalAttribute` (por clave) → `attributes[].value`; `PriorTreatment` →
`currentLine`. Con varios valores para el mismo destino se toma el de menor `monthsAgo` y, a igualdad, el
primero en el orden de la petición (asumido; el conflicto lo marca US-124). La cadena se copia tal cual llega
(ya enmascarada por `clinical-api`). El servicio de aplicabilidad **no recibe ningún puerto de LLM**: es la
garantía estructural de ADR-34 (b) y de US-122 AC-2/AC-6.

**D4 · `studyPopulationValue` desde `population_criteria`.** Se amplía `CorpusCatalogReader` con
`poblacion_por_documento(document_ids) -> dict[str, PoblacionDelEstudio]` (lectura de `population_criteria` y
`metadata_source` con el rol `rag_corpus`). Cada criterio del catálogo declara en **`studyKey`** qué clave (o
subclave, p. ej. `biomarcadores.her2`) de `population_criteria` lee; el campo lo añade
`l1d-126-criterios-aplicabilidad-catalogo` (US-121), con las claves válidas en `packages/clinical-catalogs/poblacion.json`
(las de data-model más `estado_menopausico`, `estado_castracion` y `grado`, supuestas), y este change lo usa sin
inventar claves (decisión del usuario, 2026-10-24,
`[S3 resp. 16]`; cierra la antigua Q1). El valor se copia carácter a carácter, sin normalizar (RN-25; único
requisito, de este change; `l1d-182` solo le añade el escenario de US-127 AC-4). Valor ausente o
`no_disponible` → `null` y `desconocido` + `no_reportado_por_fuente` (salvo D5). `metadata_source` `fuente_estructurada` y
`extraido_verificado` cuentan como estructurados (el segundo ya pasó NLI en la ingesta, US-118). Fallo del
lector → `RecuperacionNoDisponibleError("poblacion")` → `503 RETRIEVAL_UNAVAILABLE`, por el mismo
`_en_hilo` que ya usan las fichas.

**D5 · Precedencia de `unknownReason`: gana `falta_en_paciente`.** Decisión del usuario, 2026-10-24,
`[S3 resp. 16]`: sin valor del paciente → `falta_en_paciente`, **aunque la fuente tampoco lo reporte** (misma
regla que l1d-129 D2: la causa accionable es completar al paciente); con valor del paciente y sin valor del
estudio → `no_reportado_por_fuente`. Por eso US-122 AC-5 (`doc-a3`, sin población) exceptúa
`estado_menopausico`, que falta en A-M1 y trae `falta_en_paciente` (US-124). `patientDataWarning` siempre
`null` en este change. Descartado: que prevalezca `no_reportado_por_fuente` (contradecía l1d-129 D2).

**D6 · `citedSources` del criterio.** Con valor estructurado del estudio (`coincide`, `parcial`,
`no_coincide`), una `CitedSource` del documento construida con `construir_cita()` (RN-04) sobre su chunk sobre
el umbral de mayor puntaje del *reranker*; `desconocido` por la fuente → `[]`. `contracts/examples/con-evidencia-s4.json`
trae `[]` en criterios estructurados: es válido contra el schema y no se toca (ver Open Questions).

**D7 · Orden de `applicability[]`.** Por documento, de mayor a menor puntaje del *reranker* de su mejor chunk y,
a igualdad, `externalId` ascendente (asumido): determinista y sin significado clínico; el orden por
aplicabilidad de las opciones es de US-125.

**D8 · `summary` y `populationNotComparable` calculados aquí; este change es dueño de sus funciones.** El
schema los exige en `SourceApplicability`; un relleno en ceros sería un centinela que miente. Se calculan con
`contar_estados()` y `poblacion_no_comparable()` de `applicability_rules.py`, que **pertenecen a este change**
(`[S3 resp. 16]`); `l1d-129` solo añade `causa_de_desconocido()` y `aviso_dato_paciente()` y escribe los AC
de US-124 (AC-4, AC-5) contra estas funciones, sin reimplementarlas.

**D8b · Test de US-121 AC-5 diferido desde `l1d-126`** (`[S3 resp. 16]`). La regla vive en el catálogo montado;
el cálculo es de este change, así que aquí se escribe el test de aceptación `[US-121 AC-5]`: misma build,
`CLINICAL_CATALOG_PATH` a `test-apl-1.0.0` y a `test-apl-1.0.1` (`ecog.rule.limits.max = 0`); `ecog` de `doc-a1`
para A-M1 pasa de `coincide` a `no_coincide` y el resto no cambia. Verifica el escenario de `l1d-126` (delta
`clinical-catalogs`); este change no duplica ese requisito. La regla `rango` respeta `rule.limits`.

**D9 · Ejemplos de contrato.** Este change no publica ejemplo: el par con aplicabilidad
(`rag-query-aplicabilidad-a-m1.json` interno y su público) es de `l1d-129` (`[S3 resp. 16]`).

**D10 · Orden de archivo de `applicability`** (`[S3 resp. 16]`): 127 → 128 → 129 → 130 → 182. Este change
crea la capacidad y se archiva el primero.

## Privacidad y ownership

- Cruza la frontera `clinical-api → rag-orchestrator` solo lo que ya cruza: el `clinicalContext` desidentificado
  (RN-10, RN-11; seudónimo por consulta, fechas relativas, texto enmascarado). No se añade ningún campo.
- `rag-orchestrator` lee solo el schema `corpus` (`population_criteria`, `metadata_source`) con `rag_corpus` y
  el catálogo clínico de solo lectura (`CLINICAL_CATALOG_PATH`); no toca datos clínicos ni `clinical-minio`.
  `AC-T4.4` / `SEG-06`: el servicio trabaja solo con el contexto desidentificado.
- `patientValue` viaja de vuelta a `clinical-api` en la respuesta; es el mismo valor enmascarado que llegó. Los
  logs de la etapa solo registran `traceId`, número de documentos y de criterios por estado y latencia; nunca
  `patientValue`, `studyPopulationValue`, texto de chunks ni `pseudoPatientId`.
- Datos: solo sintéticos (FX-08b-a). Sin modelos en la nube (RN-12): la etapa no usa ningún modelo.

## Contratos

- Proveedor: `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`); consumidor: `clinical-api` (cliente
  generado de `packages/api-contracts`).
- **Diff propuesto del `openapi.yaml`: ninguno.** `SourceApplicability`, `ApplicabilityCriterion` y
  `ApplicabilitySummary` ya están en `contracts/schemas/evidence.yaml`; `applicability` ya es `required`. Pasa de
  `[]` a poblado: cambio de datos, no de forma; oasdiff sin diferencias; compatible con ADR-26.
- Ejemplos: sin cambios en `contracts/examples/`. Los modelos Pydantic (`app/schemas/generated`) ya existen,
  generados del spec; no se editan.
- Verificación del proveedor: los tests de integración validan la respuesta `200` y el `503` contra el spec con
  el *helper* de L1D-164.

## Evaluación

No cambia modelo, prompt, umbral ni corpus: `run-ai-eval` no es obligatoria. Los catálogos de test
`test-apl-1.0.0` y `test-apl-1.0.1` son los de `l1d-126` (`packages/clinical-catalogs/__fixtures__/`), no el
catálogo real. Las métricas de aplicabilidad
M-08.2 (concordancia de estados) y M-08.6 (`patientValue` copiado) se miden en US-132 con el catálogo real de
US-121.

## Dependencias y colaboradores

| Módulo | Acción | Depende de |
|---|---|---|
| `app/domain/applicability_rules.py` | nuevo: `evaluar_criterio()`, reglas por tipo, `valor_del_paciente()`, `contar_estados()`, `poblacion_no_comparable()` | solo tipos de dominio (puro, sin E/S) |
| `app/domain/` (tipos) | nuevos `CriterioDeAplicabilidad`, `PoblacionDelEstudio`, `CriterioEvaluado` | — |
| `app/application/aplicabilidad.py` | nuevo `ApplicabilityService.evaluar(documentos, contexto, tipo)` | puertos `CatalogoClinico` (criterios) y `CorpusCatalogReader` (población); **sin** LLM |
| `app/application/ports.py` | `CatalogoClinico.criterios_de_aplicabilidad(tipo)`; `CorpusCatalogReader.poblacion_por_documento(ids)` | — |
| `app/application/rag_orchestrator_service.py` | nueva etapa `_evaluar_aplicabilidad()` en la rama `con_evidencia` | `ApplicabilityService` |
| `app/application/respuesta_con_evidencia.py` | recibe la aplicabilidad y la mapea a `SourceApplicability` | modelos generados |
| `infrastructure/catalogo_clinico/` | carga `aplicabilidad.json` del tipo (forma de US-121) | archivo montado |
| `infrastructure/catalog/catalogo_reader.py` | lectura de `population_criteria` y `metadata_source` | schema `corpus`, rol `rag_corpus` |
| `app/bootstrap.py` | cablea el servicio | — |

Reglas extraídas con nombre propio: `evaluar_criterio()` (FR-25), `valor_del_paciente()` (ADR-34 b),
`valor_del_estudio()` (RN-25), `poblacion_no_comparable()` (excluyente, base de RN-28).

## Risks / Trade-offs

- [La forma del ítem de `aplicabilidad.json` la fija US-121 en paralelo] → este change programa contra la forma
  de FX-08b-a y se rebasa sobre la de L1D-126; si difieren, se ajusta el adaptador de carga, no el dominio.
- [Las claves de `population_criteria` (data-model: `subtipo`, `estadio`, `linea`, `biomarcadores`, `edad`,
  `ecog`) no coinciden 1:1 con los criterios (`estado_her2`, `estado_menopausico`…)] → cada criterio declara su
  `studyKey` (D4, `[S3 resp. 16]`); sin clave declarada, el validador del catálogo de `l1d-126` falla.
- [Valores no normalizados entre paciente y estudio ("3+ (IHQ)" vs "positivo")] → la tabla de categorías de la
  regla los clasifica; un valor presente pero fuera de la tabla no se adivina: el criterio queda `desconocido`
  con la causa que fije Q3.
- [Coste por consulta] → reglas O(documentos × criterios), sin E/S salvo una lectura por lote de
  `population_criteria`.

## Migration Plan

Sin migración de esquema: `population_criteria` y `metadata_source` existen desde US-058. Con el catálogo real
de `packages/clinical-catalogs` aún con `items: []`, producción sigue devolviendo `applicability = []` hasta que
US-121 publique los criterios; el *rollback* es revertir el PR o publicar `items: []`.

## Open Questions

Pendientes de definir (los verá el humano en `/sprint-start`):

- ~~**Q1 · Clave del estudio por criterio**~~ — **cerrada** (usuario, 2026-10-24, `[S3 resp. 16]`): campo
  `studyKey` de cada ítem de `aplicabilidad.json`, añadido por `l1d-126`, que liga con la clave (o subclave) de
  `population_criteria` (D4).
- **Q2 · Representación de "solo para un subgrupo"** en `population_criteria` (dueño: US-118; afecta: US-122 AC-4).
  Se propone `{ "valor": "0-1", "alcance": "subgrupo" }` y que la condición de "Parcial" del criterio lo lea.
- **Q3 · Valor del paciente presente pero fuera de la tabla de categorías** (dueño: DEC-11 / US-124). Se propone
  `desconocido` con `unknownReason = falta_en_paciente` hasta que US-124 decida si hace falta otra causa (el enum
  del contrato solo tiene dos).
- **Q4 · `citedSources` en criterios estructurados**: el ejemplo `con-evidencia-s4.json` trae `[]`; AC-1 exige la
  fuente. Se sigue el AC (D6); actualizar el ejemplo es opcional y no rompe el contrato.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-28] conteos sin puntaje y `populationNotComparable` → US-124 AC-4, AC-5 (S3).
- Regresión [RN-26] `patientDataWarning` → US-124 AC-1…AC-3 (S3).
- Regresión [RN-01] valor textual con cita y NLI → US-123 (S3).
- Regresión [RN-02] `applicability = []` sin evidencia y cero invocaciones del LLM → US-124 AC-6 (S3).
- Regresión [RN-25] valor del estudio copiado → US-127 (S3).
- Regresión de permiso denegado (JWT de servicio inválido → `401`) → `service-auth` (L1D-105), sin cambio.
