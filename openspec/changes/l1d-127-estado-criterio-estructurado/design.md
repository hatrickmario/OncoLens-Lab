# Design — l1d-127-estado-criterio-estructurado

## Context

Ver proposal.md (Why). Estado actual en `apps/rag-orchestrator`:

- `RAGOrchestratorService` (`app/application/rag_orchestrator_service.py`) recorre recuperar → pares del
  *reranker* → reranquear → umbral → (sin evidencia | generar → citas → soporte → recorte a `maxOptions`).
  `ensamblar_respuesta_con_evidencia()` (`app/application/respuesta_con_evidencia.py`) fija `applicability=[]`
  y, en cada opción, `applicabilitySummary` en ceros y `perSource=[]` (esto último es de US-125).
- `CorpusCatalogReader.fichas_por_documento()` lee del schema `corpus` (rol `rag_corpus`) las fichas para las
  citas; no expone `population_criteria` ni `metadata_source`, que sí existen en `corpus.corpus_document`
  (`jsonb`, data-model §4.6; `app/domain/corpus_seed/poblacion.py` normaliza la semilla a seis claves, cada una
  **cadena** con texto o `no_disponible`; la ingesta de L1D-117 escribe `biomarcadores` como **objeto**
  `{"her2": "positivo", "receptores_hormonales": …, "hrr_brca": …}` y `metadata_source` ∈
  `fuente_estructurada | extraido_verificado | pendiente`).
- `CatalogoClinico` (`infrastructure/catalogo_clinico/manifiesto.py`) solo expone `version()` y
  `tipos_de_cancer()`. Los criterios los entrega el puerto `CriteriosDeAplicabilidad` de US-121 (L1D-126,
  `app/domain/criterios_aplicabilidad.py`, con su adapter sobre `<tipo>/aplicabilidad.json`, ya con contenido y con
  esquema estricto del ítem); este change lo inyecta, no lo define.
- El contrato ya trae `SourceApplicability`, `ApplicabilityCriterion` y `ApplicabilitySummary`
  (`contracts/schemas/evidence.yaml`, congelados en US-033); `clinicalContext` trae `biomarkers`, `diagnosis`
  (`grade`, `stageValue`, `performanceScale`, `performanceValue`), `attributes`, `currentLine`, `priorTreatments`
  (`lineNumber`, `monthsAgo`) y `missingCriticalData`. El catálogo real 1.1.0 ya trae 6 criterios por tipo
  (L1D-126).

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
`poblacion_no_comparable()` (excluyente en `no_coincide`). El valor del paciente se clasifica con `rule.equivalences`
que declara la regla (p. ej., HER2 "3+" o "2+ con ISH positivo" → `positivo`), sin heurísticas en código. Un tipo de regla desconocido lo rechaza el validador del catálogo al arrancar (US-121, servicio no
listo), nunca en la consulta. Descartado: reglas en Python por criterio (un cambio de DEC-11 en el S4
obligaría a desplegar código, contra RN-22 y US-121 AC-5).

**D2b · Semántica de cada operador en el S3** (`Decidido (usuario, 2026-10-27)` para HER2/estadio; el resto
asumido). Comparación por **prefijo exacto** (`startsWith`, sensible a mayúsculas y espacios, como L1D-94):
- `igualdad` con `equivalences` (HER2): categoría del paciente = clave cuyo valor de la lista es **prefijo** del
  valor del paciente ("3+ (IHQ)" → `positivo`); sin prefijo, `None`. Categoría del estudio = el valor literal (se
  copia tal cual, p. ej. `positivo`). Iguales → `coincide`; paciente con categoría y estudio distinto →
  `no_coincide`; paciente sin categoría (p. ej. "2+ (IHQ)" sin ISH, "negativo") y estudio igual al literal →
  `coincide`; paciente sin categoría y estudio igual a una clave de `equivalences` → `desconocido` sin causa
  (Q3: no se adivina); en otro caso, `no_coincide` por igualdad exacta.
- `rango` (ECOG, ISUP): solo con valores enteros. Rango del estudio `a-b` o `a–b` (guion o raya) o entero único;
  `rule.limits` (`minimo`/`maximo`) lo **acota** (intersección). Paciente dentro → `coincide`; fuera →
  `no_coincide`; **estudio con `alcance = subgrupo`** (objeto `{"valor": "0-1", "alcance": "subgrupo"}`, Q2) y
  paciente dentro → `parcial` (condición `solo_subgrupo`). Paciente no entero (p. ej. `grade` = "Nottingham
  grado 2") o rango no parseable → `desconocido` sin causa. **`estadio`** (`stage_value`, "IIA") **no tiene escala
  ordenada en el catálogo 1.1.0**: queda `desconocido` con `unknownReason = null`, `studyPopulationValue` y
  `patientValue` copiados. Añadir la escala es un cambio de contenido del catálogo (`manifest.version` ≥ 1.2.0,
  *version-guard* D8 de L1D-126), fuera de este change.
- `rango_solapado`: el paciente aporta un valor puntual, que cae dentro o fuera de un rango; el solape parcial
  nunca ocurre en el S3. Alcance declarado: esta condición no produce `parcial` aquí (un unitario lo fija);
  `solo_subgrupo` es la única fuente de `parcial`, y solo con fixtures hasta US-118 (Q2 cerrada así).
- `pertenencia` (línea, menopausia): el valor del estudio se separa por `,` o `;` y el del paciente debe ser uno
  de los elementos (exacto) → `coincide`, si no `no_coincide`; con `alcance = subgrupo` y pertenece → `parcial`.
  Un valor del estudio con forma de rango ("1-2") → `desconocido` sin causa.
- **Criterios con lista** (`destination.match.name` con varios: RE/RP, HRR/BRCA): la comparación componente a
  componente exige otra forma del estudio (hoy una sola cadena por subclave) → `desconocido` sin causa cuando
  hay valor del paciente y del estudio; queda fuera del alcance del S3.
- Cada `desconocido` sin `unknownReason` lleva un motivo interno (`valor_fuera_de_tabla`, `sin_escala`,
  `forma_no_comparable`, `destino_no_resoluble`) que solo se cuenta en el log (campo permitido: **conteo por motivo interno**, sin valores del paciente ni del estudio), nunca se envía.

**D3 · `patientValue` por `destination`, copia literal.** Un resolvedor puro
`valor_del_paciente(contexto, destino) -> str | None` traduce cada destino del catálogo a su campo del
`clinicalContext`: los **12 destinos reales del catálogo 1.1.0** (6 de mama, 6 de próstata):
`Biomarker.value` con `match.name` (`HER2`) → `biomarkers[]` con `biomarkerName` igual (exacto) y su `value`;
`Biomarker.value` con lista (`RE`/`RP`, `HRR`/`BRCA`) → un valor **rotulado** `RE: <valor>; RP: <valor>` en el
orden de `match.name`, cada `<valor>` copiado literal y el rótulo tomado del catálogo (nunca compuesto por el
modelo), y `desconocido` + `falta_en_paciente` si **falta cualquier** componente (el seed usa «Receptor de
estrógeno/progesterona» hasta `l1d-95a-seed-codigos-catalogo`: los tests de RE/RP usan fixtures propios con los códigos
`RE`/`RP`); `Diagnosis.stage_value` → `diagnosis.stageValue`; `Diagnosis.grade` (isup) → `diagnosis.grade`;
`Diagnosis.performance_value` con `match.performance_scale = ECOG` → `diagnosis.performanceValue` (entero → su
representación decimal) **solo si** `diagnosis.performanceScale` es `ECOG`: con otra escala no se copia y el
criterio queda `falta_en_paciente`; `ClinicalAttribute.value` con `match.attribute_key` → `attributes[]` por clave
(`estado_menopausico`, `estado_castracion`); `PriorTreatment.line_number` → `priorTreatments[].lineNumber`
(entero → decimal). Un destino que el resolvedor no sabe leer (entidad, campo o `match` fuera de esta lista) →
`desconocido` con `patientValue = null`, `unknownReason = null` y motivo interno `destino_no_resoluble`; el
validador del catálogo debe impedirlo al arrancar. Con varios valores para el mismo destino (biomarcadores y tratamientos previos) se toma el de menor `monthsAgo` y, a igualdad, el
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
requisito, de este change; `l1d-182` solo le añade el escenario de US-127 AC-4).

**Lectura de `population_criteria`** (`Decidido (usuario, 2026-10-27)`): la clave o subclave `a.b` se resuelve así:
(a) clave ausente o cadena `no_disponible` → `null` (→ `desconocido` + `no_reportado_por_fuente`, salvo D5);
(b) **cadena con texto** (forma de la semilla `corpus_seed/poblacion.py` y de las claves planas de la ingesta) →
ese texto, copiado; (c) **objeto**: `biomarcadores` raíz con subclave (`biomarcadores.her2` →
`population_criteria["biomarcadores"]["her2"]`, forma real de L1D-117: `{"her2": "positivo"}` → valor copiado
literal `positivo`) o un objeto `{"valor": <cadena>, "alcance": "subgrupo"}` (Q2) cuyo `valor` es el copiado;
(d) cualquier otra forma, incluida una subclave pedida sobre una cadena (la semilla guarda `biomarcadores` como
cadena: no se trocea) o un objeto sin `valor` → `null` y `no_reportado_por_fuente`, sin inferir.
`metadata_source` ∈ `fuente_estructurada | extraido_verificado` cuentan como estructurados (el segundo ya pasó NLI
en la ingesta, US-118). **`pendiente` NO es estructurado** (`Decidido (usuario, 2026-10-27)`): la ingesta no pudo
extraer los metadatos (todos `no_disponible`), y decir `no_reportado_por_fuente` atribuiría a la fuente un "no lo
reporta" que nadie verificó (RN-25); el documento se **omite** de `applicability[]` (ningún `SourceApplicability`,
para no emitir un resumen en ceros que miente). El tipo `PoblacionDelEstudio` y el lector admiten `pendiente`. Fallo del
lector → `RecuperacionNoDisponibleError("poblacion")` → `503 RETRIEVAL_UNAVAILABLE`, por el mismo
`_en_hilo` que ya usan las fichas.

**D5 · Precedencia de `unknownReason`: gana `falta_en_paciente`.** Decisión del usuario, 2026-10-24,
`[S3 resp. 16]`: sin valor del paciente → `falta_en_paciente`, **aunque la fuente tampoco lo reporte** (misma
regla que l1d-129 D2: la causa accionable es completar al paciente); con valor del paciente y sin valor del
estudio → `no_reportado_por_fuente`. Por eso US-122 AC-5 (`doc-a3`, sin población) exceptúa
`estado_menopausico`, que falta en A-M1 y trae `falta_en_paciente` (US-124). `patientDataWarning` siempre
`null` en este change. Descartado: que prevalezca `no_reportado_por_fuente` (contradecía l1d-129 D2).

**D6 · `citedSources` del criterio.** Todo criterio con `studyPopulationValue` no nulo (`coincide`, `parcial`,
`no_coincide` y también `desconocido` con el valor del estudio mostrado, p. ej. `estadio` sin escala o
`falta_en_paciente`) lleva una `CitedSource` del documento construida con `construir_cita()` (RN-04) sobre su chunk
sobre el umbral de mayor puntaje del *reranker* (RN-25: no se muestra un valor del estudio sin cita; corrección del
Gate 2, decidida por el orquestador); con `studyPopulationValue = null` → `[]`. `contracts/examples/con-evidencia-s4.json`
trae `[]` en criterios estructurados: es válido contra el schema y no se toca (ver Open Questions).

**D7 · Orden de `applicability[]`.** Por documento, de mayor a menor puntaje del *reranker* de su mejor chunk y,
a igualdad, `externalId` ascendente (asumido): determinista y **sin significado clínico**: se ordena por
relevancia, no por aplicabilidad; la UI (US-126) debe rotularlo así. El orden por aplicabilidad de las opciones es
de US-125. Los documentos `pendiente` no figuran.

**D8 · `summary` y `populationNotComparable` calculados aquí; este change es dueño de sus funciones.** El
schema los exige en `SourceApplicability`; un relleno en ceros sería un centinela que miente. Se calculan con
`contar_estados()` y `poblacion_no_comparable()` de `applicability_rules.py`, que **pertenecen a este change**
(`[S3 resp. 16]`); `l1d-129` solo añade `causa_de_desconocido()` y `aviso_dato_paciente()` y escribe los AC
de US-124 (AC-4, AC-5) contra estas funciones, sin reimplementarlas.

**D8b · Test de US-121 AC-5 diferido desde `l1d-126`** (`[S3 resp. 16]`). La regla vive en el catálogo montado;
el cálculo es de este change, así que aquí se escribe el test de aceptación `[US-121 AC-5]`: misma build,
`CLINICAL_CATALOG_PATH` a `test-apl-1.0.0` y a `test-apl-1.0.1` (`ecog.rule.limits.max = 0`); `ecog` de `doc-a1`
para A-M1 pasa de `coincide` a `no_coincide` y el resto no cambia. Verifica el escenario de `l1d-126` (delta
`clinical-catalogs`); este change no duplica ese requisito. La regla `rango` respeta `rule.limits` (lo acota, D2b).

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
  logs de la etapa solo registran `traceId`, número de documentos, de criterios por estado, de `desconocido` por motivo interno y latencia; nunca
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
`test-apl-1.0.0` y `test-apl-1.0.1` son los de `l1d-126` (`packages/clinical-catalogs/test/fixtures/test-apl-1.0.0` y `-1.0.1`, con copias con sha256 en
`apps/rag-orchestrator/tests/fixtures/catalogo/`; no se modifican), no el catálogo real 1.1.0. Las métricas de aplicabilidad
M-08.2 (concordancia de estados) y M-08.6 (`patientValue` copiado) se miden en US-132 con el catálogo real de
US-121.

## Dependencias y colaboradores

| Módulo | Acción | Depende de |
|---|---|---|
| `app/domain/applicability_rules.py` | nuevo: `evaluar_criterio()`, reglas por tipo, `valor_del_paciente()`, `contar_estados()`, `poblacion_no_comparable()` | solo tipos de dominio (puro, sin E/S) |
| `app/domain/` (tipos) | nuevos `PoblacionDelEstudio`, `CriterioEvaluado`; **reutiliza** `CriterioDeAplicabilidad` de L1D-126 (su campo `estado_de_revision` = propuesta/pendiente/revisado es distinto del estado calculado Coincide/Parcial/No coincide/Desconocido de este change) | — |
| `app/application/aplicabilidad.py` | nuevo `ApplicabilityService.evaluar(documentos, contexto, tipo)` | puerto `CriteriosDeAplicabilidad` (L1D-126, inyectado) y `CorpusCatalogReader` (población); **sin** LLM |
| `app/application/ports.py` | `CorpusCatalogReader.poblacion_por_documento(ids)` | — |
| `app/application/rag_orchestrator_service.py` | nueva etapa `_evaluar_aplicabilidad()` en la rama `con_evidencia` | `ApplicabilityService` |
| `app/application/respuesta_con_evidencia.py` | recibe la aplicabilidad y la mapea a `SourceApplicability` | modelos generados |
| `infrastructure/catalog/catalogo_reader.py` | lectura de `population_criteria` y `metadata_source` | schema `corpus`, rol `rag_corpus` |
| `app/bootstrap.py` | cablea el servicio | — |

Reglas extraídas con nombre propio: `evaluar_criterio()` (FR-25), `valor_del_paciente()` (ADR-34 b),
`valor_del_estudio()` (RN-25), `poblacion_no_comparable()` (excluyente, base de RN-28).

## Risks / Trade-offs

- [La forma del ítem de `aplicabilidad.json` la fija US-121] → ya está en `main` (L1D-126, puerto
  `CriteriosDeAplicabilidad`); este change programa contra ella y contra FX-08b-a.
- [Las claves de `population_criteria` (data-model: `subtipo`, `estadio`, `linea`, `biomarcadores`, `edad`,
  `ecog`) no coinciden 1:1 con los criterios (`estado_her2`, `estado_menopausico`…)] → cada criterio declara su
  `studyKey` (D4, `[S3 resp. 16]`); sin clave declarada, el validador del catálogo de `l1d-126` falla.
- [Valores no normalizados entre paciente y estudio ("3+ (IHQ)" vs "positivo")] → `rule.equivalences` de la
  regla los clasifica; un valor presente pero fuera de la tabla no se adivina: el criterio queda `desconocido`
  sin causa (D2b, Q3).
- [Asimetría con `poblacion.json`, `Decidido (usuario, 2026-10-27)`] → `rag-orchestrator` no lo lee hasta
  US-122/US-118: `estado_castracion` e `isup` salen siempre `desconocido` y `populationNotComparable` nunca sale
  en próstata en el S3 (proposal, «Efecto de la asimetría»); `grado`, `estado_menopausico` y `estado_castracion` son
  «Desconocido explícito» (L1D-117 decisión 4), no «supuestas».
- [Coste por consulta] → reglas O(documentos × criterios), sin E/S salvo una lectura por lote de
  `population_criteria`.

## Migration Plan

Sin migración de esquema: `population_criteria` y `metadata_source` existen desde US-058 (la migración
`0003_metadata_source_pendiente` de L1D-117 ya está en `main`). El catálogo real 1.1.0 **ya trae 6 criterios por
tipo** (L1D-126): la activación es **inmediata**, producción devuelve `applicability` poblado en cuanto se
despliega. *Rollback* por **revert del PR**. El test `[US-225 AC-1]` (`applicability == []`) pasa a un catálogo de
test sin criterios (`items: []`): es un **cambio de spec declarado** (delta `evidence-analysis`), no una
relajación de test. Las copias de fixtures con sha256 en `apps/rag-orchestrator/tests/fixtures/catalogo/` no se
modifican.

## Open Questions

- **Decidido (usuario, 2026-10-27) · Documentos `pendiente` omitidos.** No tienen `SourceApplicability`.
  `l1d-128` (US-123, camino textual) los re-incorpora en su Gate 1 del S4 y debe reconciliarse con esa omisión;
  `l1d-127` no cambia (los omite).
- **Decidido (usuario, 2026-10-27) · Casos límite de `igualdad` en HER2** (se mantienen, con unitario que los
  fija): paciente "negativo" vs estudio "positivo" → `desconocido`; paciente "2+ (IHQ)" vs estudio "negativo" →
  `no_coincide`; `igualdad` con `partial.when = solo_subgrupo` no produce `parcial` (solo `rango` y `pertenencia`).
  Se mantienen hasta que un catálogo ≥ 1.2.0 añada `negativo` a `rule.equivalences`.
- **Nota para US-126 (UI)** (`Decidido (usuario, 2026-10-27)`): si una opción tiene como única fuente un documento `pendiente` (sin
  `SourceApplicability`), mostrar «Sin datos de aplicabilidad de esta fuente: metadatos del estudio no disponibles».

Pendientes de definir (los verá el humano en `/sprint-start`):

- ~~**Q1 · Clave del estudio por criterio**~~ — **cerrada** (usuario, 2026-10-24, `[S3 resp. 16]`): campo
  `studyKey` de cada ítem de `aplicabilidad.json`, añadido por `l1d-126`, que liga con la clave (o subclave) de
  `population_criteria` (D4).
- ~~**Q2 · Representación de "solo para un subgrupo"**~~ — **cerrada** (usuario, 2026-10-27):
  `{ "valor": "0-1", "alcance": "subgrupo" }`, leído por la condición `solo_subgrupo`; la ingesta de L1D-117 no lo
  produce hasta US-118, así que `parcial` solo aparece con fixtures.
- **Q3 · Valor del paciente presente pero fuera de `rule.equivalences`** (dueño: DEC-11 / US-124). **Decidido
  (usuario, 2026-10-27):** `desconocido` con `unknownReason = null` (el contrato admite `null`) y motivo interno
  solo en el log; no se usa `falta_en_paciente` porque el dato sí está. US-124 puede añadir causa.
- **Q4 · `citedSources` en criterios estructurados**: el ejemplo `con-evidencia-s4.json` trae `[]`; AC-1 exige la
  fuente. Se sigue el AC (D6); actualizar el ejemplo es opcional y no rompe el contrato.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-28] conteos sin puntaje y `populationNotComparable` → US-124 AC-4, AC-5 (S3).
- Regresión [RN-26] `patientDataWarning` → US-124 AC-1…AC-3 (S3).
- Regresión [RN-01] valor textual con cita y NLI → US-123 (S3).
- Regresión [RN-02] `applicability = []` sin evidencia y cero invocaciones del LLM → US-124 AC-6 (S3).
- Regresión [RN-25] valor del estudio copiado → US-127 (S3).
- Regresión de permiso denegado (JWT de servicio inválido → `401`) → `service-auth` (L1D-105), sin cambio.
