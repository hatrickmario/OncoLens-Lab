# Design — l1d-179-citas-chunk-recuperado

## Contexto

`POST /rag/query` (Backend 2) recupera chunks del corpus (L1D-106), genera opciones tras el puerto
`EvidenceGenerator` (real en L1D-275, que mergea **después**; aquí, `FakeEvidenceGenerator`) y debe validar citas (este change) y soporte (L1D-180) **sobre la respuesta completa**
antes de devolverla a `clinical-api`. El LLM es una fuente no confiable: puede citar chunks que
no recibió, inventar títulos o fuentes ("Guía NCCN 2026") o no citar nada.

## Decisiones

### D1 · Conjunto de chunks citables = los entregados al LLM en esta consulta

El conjunto de `chunkId` válidos es el de los chunks **recuperados en esta consulta que superaron
`RELEVANCE_THRESHOLD` y se incluyeron en el contexto de generación** (el mismo conjunto que
L1D-106 entrega al puerto `EvidenceGenerator`). Se pasa explícitamente al validador como
argumento; el validador no consulta Milvus para decidir validez. Un chunk existente en el corpus
pero no recuperado en esta consulta (`ch-x-999` o cualquier otro) es inválido.

(asumido) Se interpreta "recuperado" como "sobre el umbral y entregado al LLM", no como "devuelto
por la búsqueda *dense* antes del *reranker*": citar algo que el LLM no leyó no puede estar
respaldado. Se deja como pregunta para el humano; cambiarla no altera ningún AC del S1.

Consecuencia (RN-24): un análisis previo nunca está en ese conjunto, así que nunca es citable;
**Regresión [RN-24] activa desde S4**, cuando entra la memoria de análisis.

### D2 · El LLM solo aporta `chunkId`

`CitedSource` se construye por completo desde el corpus: `title`, `sourceName`, `externalId`,
`language`, `sourceType`, `licenseClass`, `studyDesign`, `trialPhase`, `primaryEndpoint`,
`sampleSize`, `publishedAt`, `lastUpdatedAt`, `guidelineVersion`, `authors`, `sourceUrl` desde
el catálogo (`corpus.documents`, vía `CorpusCatalogReader`); `chunkTextSnapshot` y `chunkId`
desde el chunk recuperado (texto original, sin traducir, `[S1 resp. 8]`). Cualquier otro campo de
la cita en el JSON del LLM se descarta en el parseo y nunca se propaga, tampoco a
`discardedOptions` (AC-4). `possiblyOutdated = false` y `newerVersionAvailable = false` en el S1
(FR-26 fuera de alcance).

### D3 · Reglas de decisión por opción (orden fijo)

1. `citedSources` vacío → `discardedOptions` con `discardReason = sin_citas`.
2. Se filtran las citas cuyo `chunkId` no está en el conjunto citable (y los duplicados).
3. Ninguna cita válida tras el filtro → `discardedOptions` con `discardReason = cita_invalida`.
4. Al menos una válida → la opción sigue con solo las citas válidas (AC-5) hacia el chequeo de
   soporte de L1D-180.

En las descartadas por cita, `unsupportedClaims = []` (asumido: el campo es obligatorio en el
contrato y estas opciones no llegaron a evaluarse con NLI) y `option` / `rationale` se conservan
del LLM para revisión; los términos prohibidos sobre esos textos los cubre L1D-180 (US-064 AC-7).

### D4 · Validación antes del soporte NLI

El validador de citas corre antes del `SupportChecker` (L1D-180): el NLI usa como premisa el
`chunkTextSnapshot` copiado aquí, nunca texto del LLM. Si una opción se descarta por citas, el NLI
no se invoca para ella.

### Alternativas

Decisión barata de revertir (regla interna sin contrato): una recomendación.
- **Elegida:** regla pura en `domain/citations.py` con el conjunto citable como argumento.
- Descartada: validar dentro del adapter del LLM (mezcla infraestructura con regla RN-01/RN-04).
- Descartada: corregir citas inválidas buscando el chunk más parecido (inventaría soporte).

## Privacidad y ownership

- Datos que cruzan: ninguno nuevo. `clinical-api → rag-orchestrator` sigue enviando el
  `RagQueryInternalRequest` desidentificado (RN-11); este change solo opera sobre la salida del LLM
  y el corpus.
- `rag-orchestrator` lee únicamente el schema `corpus` (rol `rag_corpus`) y Milvus; **no** toca
  datos clínicos ni `clinical-minio`.
- Los logs del validador registran conteos (`citas_invalidas`, `opciones_descartadas`) y
  `chunkId`, nunca texto de chunks, de la pregunta ni del contexto, ni `pseudoPatientId`.
- Solo datos sintéticos (FX-06a-a, FX-06a-b); ningún identificador de paciente (RN-13, RN-14).
- NCCN aparece únicamente como metadato falso del LLM en el fixture `LLM-TITULO-FALSO` para
  probar que nunca se propaga, y como fuente no incluida en `excluded_sources`; nunca su contenido.

## Contratos

- Proveedor: `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`); consumidor: `clinical-api`.
- **Diff propuesto del `openapi.yaml`: ninguno.** Ya existen `CitedSource` (todos los campos
  requeridos, descritos como copiados del catálogo), `EvidenceOption.citedSources` con
  `minItems: 1` y `DiscardedOption.discardReason` con `cita_invalida` y `sin_citas`
  (`contracts/schemas/evidence.yaml`).
- `contracts/examples/`: sin cambios. Los tests construyen respuestas del LLM falso desde
  FX-06a-b, no desde los ejemplos públicos.
- oasdiff: sin diferencias; compatible con ADR-26. Los modelos Pydantic de
  `app/schemas/generated/` se usan sin editar.
- **Validación de respuestas:** las de los tests de integración se validan contra el spec con el
  *helper* de L1D-164 (Pytest) `[S1 resp. 17]`; `contracts:verify-provider` no existe hasta US-214.

## Dependencias y colaboradores

- **Nuevo** `app/domain/citations.py`: `validar_citas(opciones_crudas, chunks_citables) ->
  ResultadoCitas` (RN-01, citas) y `construir_cita(chunk, ficha_catalogo) -> CitedSource` (RN-04).
  Puras: sin E/S, sin reloj.
- **Nuevo puerto** `CorpusCatalogReader` en `app/application/ports.py` (archivo creado por L1D-164
  y ampliado por L1D-106; aquí se añade un Protocol)
  (`fichas_por_documento(ids) -> dict`), con adapter SQL en `app/infrastructure/` sobre el schema
  `corpus` (tablas de L1D-114) y un fake para tests que cumple el mismo contrato (campo ausente →
  `None`, nunca cadena vacía).
- **Modifica** `RAGOrchestratorService` (L1D-106; implementa `EvidenceQueryPort`, que el router
  `app/api/rag_query.py` de L1D-164 invoca): abre la rama con evidencia mínima —`EvidenceGenerator` →
  `validar_citas()` → `construir_cita()` → respuesta `con_evidencia` válida contra el spec—; L1D-275 la
  amplía (generador real, recorte, `meta` completo, dueño del orden final de etapas) y L1D-180 inserta
  el soporte tras las citas. Depende solo de puertos.
- **Nuevo** `FakeEvidenceGenerator` (FX-06a-b, `tests/`): implementa `EvidenceGenerator` con salidas
  fijas por *fixture*; lo reutilizan L1D-275 y L1D-180.
- **Dueño** de `construir_cita()` y `CorpusCatalogReader`; L1D-275 los reutiliza.
- **Modifica** `app/bootstrap.py` (L1D-164): enlaza el adapter SQL de `CorpusCatalogReader`.
- **Orden de merge** `[S1 resp. 17]`: L1D-164 → L1D-105 → L1D-106 → **L1D-179** → L1D-275 → L1D-180;
  la composición de producción de la rama con evidencia sigue en el `503` provisional de L1D-106
  hasta L1D-180 (L1D-275 D9); solo la composición de test enlaza `FakeEvidenceGenerator`.
- Reglas con nombre propio: `validar_citas()`, `construir_cita()`.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: no requiere `run-ai-eval`. Métricas OL-06
relacionadas que lo medirán en US-072 (S2): precisión de citas ≥ 0,90 y M-10.1 (100 % de opciones
mostradas con cita a un chunk recuperado).

## Riesgos

- Si L1D-275 cambia la forma interna de la salida del generador, el parseo de citas se ajusta en
  el mismo punto; mitigación: el validador recibe un tipo de dominio propio, no el JSON crudo.
