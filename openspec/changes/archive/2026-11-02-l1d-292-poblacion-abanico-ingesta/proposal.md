# Proposal — l1d-292-poblacion-abanico-ingesta

## Trazabilidad

L1D-292 · US-242 · FEAT-06c · Sprint 4 · Estimación **5** · FR-19 (metadatos `extraido_verificado`) · RN-01 · RN-04 ·
RN-21 · RN-22 · RN-25 · RN-27 · TBD-20 (CAL) · OL-02 · ADR-47 (aceptado, etapa A / opción A) · ADR-39 (LLM y NLI reales
fuera de los AC; los AC usan adapters falsos) · US-242 AC-1…AC-8 · `[S4 resp. 3]` ·
⛔ ADR-47, ADR-39 · ↪ `l1d-117-metadatos-poblacion-verificados` (US-118, base de `application/corpus_metadata/`), `l1d-291-poblacion-lista-contrato-migracion`
(US-241: forma de lista de `population_criteria`, marca `pendiente`, migración 0005), US-240 (valores por defecto de la
configuración) · 🔗 Consumida por: US-243, US-244 (misma tarea corta), US-247 · 🔗 Medido en: US-233b (precisión y
cobertura por criterio, duplicados, `finish_reason=length` = 0) · 🔗 Regresión [RN-21] → US-059 · 🔗 Regresión [RN-25] → US-127

## Por qué

El extractor de US-118 pide al LLM todos los metadatos de un documento en una sola llamada y guarda un único valor por
criterio. Una fuente que describe varios grupos (pre y posmenopáusicas, subgrupo triple negativo) rompe esa comparación
con la paciente. ADR-47 decide extraer en abanico: una tarea corta por (documento, criterio), con lista acotada
`{value, chunkId, scope}` verificada con NLI, para que la aplicabilidad se calcule luego con los fragmentos que cita la
opción (DEC-11).

## Qué cambia

- **`PopulationFanoutExtractor`** (orquestador determinista, `asyncio.gather` + semáforo, sin agente) en
  `apps/rag-orchestrator/app/application/corpus_metadata/`: por cada criterio del catálogo de aplicabilidad vigente
  construye una tarea con los k fragmentos del documento (`POPULATION_EXTRACTION_TOP_K`; búsqueda existente con la
  etiqueta del criterio, limitada al documento, más secciones Métodos/Elegibilidad/Población). Nunca dos documentos en
  una llamada; la fuente la fija el código.
- **Esquema de salida cerrado** `{"values":[{"value","chunkId","scope"}]}` (`maxItems` =
  `POPULATION_MAX_VALUES_PER_CRITERION`, `value` ≤ 200 caracteres, tope de tokens propio).
- **Reglas de dominio puras** en `app/domain/corpus_metadata/`: rechazo de relleno y de `chunkId` ajeno o inexistente,
  verificación NLI por valor (subcadena normalizada + `soporta()`), deduplicación por valor normalizado con los
  sinónimos del catálogo, tope **por fragmento y criterio** (`POPULATION_MAX_VALUES_PER_CRITERION`, ADR-47) con orden
  determinista (elegibilidad, subgrupo, mención; a igual alcance, orden de la salida), reintento único con otra semilla
  ante `finish_reason=length`, y la marca `{"status": "pendiente", "values": []}` en el criterio si el reintento también
  se corta (forma de US-241).
- **Escritura** de la forma nueva de `population_criteria` (lista con `chunkId`, `scope`, `promptVersion`,
  `modelVersion`, `catalogVersion`, `nliResult`) y `metadata_source = extraido_verificado`.
- **Caché** por documento + criterio + versión (`POPULATION_PROMPT_VERSION`, modelo, catálogo): reingerir con las mismas
  versiones = 0 llamadas.
- **Resumen de ingesta** con contadores: `valoresRechazados` (por motivo `relleno`/`chunk_ajeno`), `valoresSinSoporte`,
  `valoresFueraDelTope`, `truncado`, `finishReasonLength`.
- **Configuración (RN-22):** `POPULATION_EXTRACTION_TOP_K`, `POPULATION_MAX_VALUES_PER_CRITERION`,
  `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`, `POPULATION_EXTRACTION_CONCURRENCY`, `POPULATION_EXTRACTION_RETRIES` (1),
  `POPULATION_PROMPT_VERSION`; valores iniciales de US-240.
- Solo documentos con licencia aceptada (RN-21); prompt sin datos de pacientes.
- *Logs*: criterio, `chunkId`, contadores, longitudes y `finish_reason`; nunca valor, texto de fragmentos, prompt ni
  salida del LLM (regla común l1d-291…294, RN-14).

## Fuera de alcance

Extracción doble con comparación y calibración de confianza (S6 / si hay capacidad); herramienta de revisión humana a
escala (S5); respaldo en la consulta (US-244); el contrato y la migración 0005 de la forma de lista (US-241); el
cálculo de estados con los fragmentos citados (US-243).

## Capacidades afectadas

`corpus-ingestion` (ADDED). Bounded context: `ai-services`.
