# Proposal — l1d-127-estado-criterio-estructurado

## Trazabilidad

L1D-127 · US-122 · FEAT-08b (L1D-20) · Sprint 3 · Estimación **5** · HU-22 · FR-25 (estado determinista por
criterio) · ADR-34 (b) (valor del paciente copiado, nunca generado) · RN-25 (valor del estudio copiado de
`population_criteria`; ausente → `null`) · RN-28 (estados sin puntaje) · RN-22, RN-29 (consume) ·
AC-08.1, AC-08.3 (parte estructurada), AC-08.9, AC-T4.4 · US-122 AC-1…AC-6 · ⛔ DEC-11 (US-021, L1D-125):
escenario `propuesta_revisada` aceptado para el S3, cierre en la sesión de oncólogos del S4 `[S3 resp. 1]` ·
🔗 Regresión [RN-25] → US-127 · 🔗 Medido en: US-132 (M-08.2, M-08.6).

> **Decidido (usuario, 2026-10-23, `[S3 resp. 1]`):** no se espera a los oncólogos. Las reglas por criterio
> son las de la versión `propuesta_revisada` de DEC-11 (criterios de FR-25; HER2 en mama y estado de
> castración en próstata como excluyentes; "Parcial" según los ejemplos de FR-25), publicadas en el catálogo
> versionado por US-121. Un cambio que salga de la sesión del S4 solo toca el catálogo JSON, no este código.

## Why

`POST /rag/query` devuelve hoy `applicability = []` (S1–S2) y el oncólogo no ve si la población de cada estudio
se parece a su paciente (P6, JTBD 4). Cuando la fuente publica su población de forma estructurada, la
comparación criterio a criterio puede hacerse con una regla fija del catálogo y con los datos reales del
contexto clínico, sin que el modelo interprete nada: es reproducible, auditable y la base sobre la que US-123
(valor textual), US-124 (causas y avisos) y US-125 (herencia y selección) construyen la aplicabilidad del S3.

## What Changes

- **Cálculo determinista del estado por criterio** en `rag-orchestrator`: por cada documento con chunks sobre
  el umbral en la consulta, y por cada criterio de aplicabilidad del catálogo del tipo de cáncer, se obtiene el
  valor del paciente del `clinicalContext` (por el `destination` del criterio), el valor del estudio de
  `population_criteria` del documento (cuando `metadata_source` lo da como estructurado) y se aplica la regla
  declarativa del criterio (igualdad, pertenencia a lista, rango, con su regla de "Parcial") para obtener
  `coincide | parcial | no_coincide | desconocido`.
- **`patientValue` copiado literal** del `clinicalContext` enviado (ADR-34 b); ninguna salida del LLM lo alimenta.
- **`studyPopulationValue` copiado** carácter a carácter de `population_criteria`, por la clave `studyKey` del
  criterio (RN-25); ausente o `no_disponible` → `null` y `desconocido` con `unknownReason =
  no_reportado_por_fuente` (salvo que el dato también falte en el paciente: `falta_en_paciente`), sin inferir
  nada. Este change es dueño del único requisito de este valor; US-127 (`l1d-182`) solo le añade su escenario.
- **`isExclusionary` y `citedSources`** del criterio: la marca viene del catálogo; la cita es la del documento
  fuente, construida desde el catálogo del corpus (RN-04), nunca del texto generado.
- **`applicability[]` de la respuesta `con_evidencia`** poblada con un `SourceApplicability` por documento
  evaluado (`externalId`, `criteria`, `summary` en conteos y `populationNotComparable`, calculados por regla). La
  aplicabilidad de las opciones (`applicabilitySummary`, `perSource`) no cambia: es de US-125.
- **Sin LLM para criterios estructurados**: el servicio de aplicabilidad no tiene dependencia de LLM en este
  change; calcular dos veces da el mismo resultado.
- Sin cambio de `openapi.yaml` ni de `contracts/examples/`: los schemas `SourceApplicability` y
  `ApplicabilityCriterion` ya están congelados (US-033).

## Capabilities

### New Capabilities

- `applicability`: aplicabilidad paciente ↔ evidencia criterio a criterio (FR-25, RN-28). Capacidad prevista
  en `openspec/config.yaml` y sin spec aún; este change crea sus primeros requisitos (cálculo estructurado) y
  US-123, US-124 y US-125 la amplían.

### Modified Capabilities

- `evidence-analysis`: el requisito "Con evidencia sobre el umbral, respuesta con_evidencia en el contrato
  final" deja de exigir `applicability = []` cuando el catálogo del tipo de cáncer declara criterios de
  aplicabilidad.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): único contexto con código. `clinical-platform` ya envía el
  `clinicalContext` y persiste la respuesta tal cual (la persistencia de `applicability` la verifica US-124
  AC-7); `frontend` no cambia (la tabla es de US-126, S4).

## Dependencias

- ⛔ **US-021 · DEC-11 (L1D-125)**: escenario `propuesta_revisada` aceptado `[S3 resp. 1]`; no bloquea el
  código porque las reglas viven en el catálogo.
- ↪ **US-121 (L1D-126)**, change `l1d-126-criterios-aplicabilidad-catalogo`: forma y contenido de
  `packages/clinical-catalogs/<tipo>/aplicabilidad.json` (`destination`, `isExclusionary`, `rule`) y su
  validador. Este change lo consume; los tests reutilizan sus fixtures `test-apl-1.0.0` y `test-apl-1.0.1`
  (FX-08b-a) y su `poblacion.json` (claves válidas de `studyKey`). **Recibe por escrito el test de aceptación
  de US-121 AC-5** (la regla se lee del catálogo montado: `ecog.rule.limits.max = 0` en `test-apl-1.0.1` pasa
  `ecog` de `coincide` a `no_coincide` sin desplegar código), diferido desde `l1d-126` (`[S3 resp. 16]`;
  tarea 1.7b).
- ↪ **US-118 (L1D-117)**, change del S3 de L1D-117 (aún sin crear): `population_criteria` y `metadata_source`
  poblados por la ingesta. Los tests siembran `population_criteria` en el catálogo del corpus de test.
- ↪ **US-055 / US-225** (archivados: `l1d-106-retrieval-threshold-sin-evidencia`,
  `l1d-275-generacion-opcion-max-options`), **US-063 / US-064** (archivados: `l1d-179-citas-chunk-recuperado`,
  `l1d-180-soporte-nli-descartadas`): pipeline `con_evidencia` sobre el que se inserta la etapa.
- 🔗 Produce para: **US-123 (L1D-128, `l1d-128-aplicabilidad-textual-citada`)** (camino textual con cita y NLI), **US-124 (L1D-129, `l1d-129-aplicabilidad-causas-avisos`)** (causa
  `falta_en_paciente` desde `missingCriticalData`, `patientDataWarning`, AC de conteo y no comparable),
  **US-125 (L1D-130, `l1d-130-herencia-aplicabilidad-recorte`)** (agregación por opción y selección por aplicabilidad).
- ↪ **`studyKey`** (`[S3 resp. 16]`): cada criterio de `aplicabilidad.json` declara en `studyKey` la clave (o
  subclave) de `population_criteria` que lee; lo añade `l1d-126-criterios-aplicabilidad-catalogo`, con las
  claves válidas en `packages/clinical-catalogs/poblacion.json` (incluidas las supuestas `estado_menopausico`,
  `estado_castracion` y `grado`), y este change lo usa para resolver `studyPopulationValue` sin inventar claves.
- 📦 **Orden de archivo de `applicability`** (`[S3 resp. 16]`): **127** → 128 → 129 → 130 → 182. Este change
  crea la capacidad y debe archivarse primero.

## Fuera de alcance

- Valor del estudio extraído del texto con LLM + cita + NLI → US-123.
- `patientDataWarning` (`sin_verificar`, `en_conflicto`, `faltante`) y la conciliación de
  `unknownReason = falta_en_paciente` con `missingCriticalData` → US-124. Aquí `patientDataWarning` siempre es
  `null` y, si el destino del criterio no tiene valor en el `clinicalContext`, el criterio queda `desconocido`
  con `patientValue = null` y `unknownReason = falta_en_paciente` (base que US-124 completa), **aunque la
  fuente tampoco lo reporte**: `falta_en_paciente` prevalece (`[S3 resp. 16]`, regla de l1d-129 D2).
- Conteos y `populationNotComparable` como AC propios (US-124 AC-4, AC-5): este change es **dueño** de
  `contar_estados()` y `poblacion_no_comparable()` en `applicability_rules.py` (`[S3 resp. 16]`), que calcula
  porque el schema los exige; US-124 escribe sus AC sobre estas mismas funciones, sin reimplementarlas.
- `applicabilitySummary`, `perSource` y `populationNotComparable` de cada `EvidenceOption`, y la selección
  antes del recorte a `maxOptions` → US-125.
- Persistencia de `applicability` en el `AIAnalysisRecord` (ya persiste la respuesta entera) → verificada en
  US-124 AC-7.
- Contenido real de los criterios de mama y próstata → US-121. UI → US-126 (S4).

## Impact

- `apps/rag-orchestrator/app/domain/applicability_rules.py` (nuevo, reglas puras), `app/application/`
  (servicio de aplicabilidad nuevo y etapa en `RAGOrchestratorService`), `app/application/ports.py` (lectura de
  criterios del catálogo clínico y de `population_criteria` del catálogo del corpus),
  `app/application/respuesta_con_evidencia.py` (deja de fijar `applicability = []`), adapters de
  `infrastructure/catalogo_clinico/` e `infrastructure/catalog/`, fixtures FX-08b-a en `tests/`.
- API: sin cambio de forma; `applicability` deja de ir vacío en `con_evidencia`. `clinical-api` no cambia.
- Evaluación: no cambia modelo, prompt, umbral ni corpus; M-08.2 y M-08.6 se miden en US-132.
