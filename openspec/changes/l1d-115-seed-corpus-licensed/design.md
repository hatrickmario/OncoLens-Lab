# Design — l1d-115-seed-corpus-licensed

## Context

US-059 carga el corpus semilla del S1 sobre el esquema que crea el change de L1D-114 (US-058):
`corpus.corpus_document`, `corpus.corpus_release`, `corpus.corpus_release_document` y la colección
Milvus `corpus_chunks` (`docs/architecture/data-model.md` §4.6 y §4.7). Es un **cargador manual**
(readme §6 OL-02, tarea 7; readme §1.4 paso 7), no el `IngestionPipelineService` reanudable del S4
(US-117). Las decisiones de fuentes y licencias ya están tomadas en ADR-36 (composición A: NCI PDQ
EN/ES solo texto + PMC OA con CC0, CC BY o CC BY-SA, licencia por documento; NCCN y ESMO solo en
`excluded_sources`) y no se reabren. Los supuestos "(asumido)" de los AC se aceptaron
(`[S1 resp. 3]`, usuario, 2026-10-13).

## Goals / Non-Goals

**Goals:**
- Un comando repetible que deja la semilla `embebido` y vigente, con `CorpusRelease` (AC-1).
- Rechazo por licencia o por fuente excluida, sin chunks, sin detener la carga (AC-2, AC-3).
- Criterios de población copiados de la fuente estructurada o `no_disponible` (AC-4, RN-25).
- Recarga idempotente por `checksum` (AC-5) y versionado sin borrado (AC-6, RN-05).
- El manifiesto real `data/raw/seed/manifest.yaml`, (el mini-dataset de ADR-39 ya no depende de él, `[S1 resp. 38]`).

**Non-Goals:**
- Ingesta reanudable, *sparse*, `CORPUS_ALLOWED_SOURCES`, ≥ 20 documentos por tipo (US-117, US-120).
- `extraido_verificado` y curación de población (US-118). Originales en `corpus-raw` (US-117).
- Recuperación (US-055). Traducción de citas (V-10).

## Decisions

**D1 · Cargador como caso de uso con puertos, script como raíz de composición.**
`app/scripts/load_seed_corpus.py` solo lee la configuración, construye los adapters y llama a
`SeedCorpusLoader.cargar(manifiesto)` (`app/application/seed_corpus/`). El service recibe por
constructor `CorpusCatalog` (PostgreSQL `corpus`), `ChunkStore` (Milvus), `PassageEmbedder`,
`SourceFetcher` (texto por URL), `Clock` e `IdGenerator`. Descartadas: un script monolítico
(no testeable sin E/S) y reutilizar ya el `IngestionPipelineService` (es del S4).

**D2 · Admisibilidad: exclusión de fuente antes que licencia.** `evaluar_admisibilidad(doc, aceptadas,
excluidas)` es pura y devuelve `admitido` o `rechazado(motivo)` con `motivo ∈ {fuente_excluida,
sin_licencia, licencia_no_aceptada}`. Se comprueba primero `source_name` contra
`CORPUS_EXCLUDED_SOURCES` (comparación normalizada: `casefold` + `strip`), para que NCCN se rechace
aunque declare licencia (AC-3, D-09); después la licencia: ausente → `sin_licencia`; texto de
licencia que no mapea a una `license_class` de `CORPUS_ACCEPTED_LICENSES` → `licencia_no_aceptada`.
El mapeo texto → `license_class` es una tabla en configuración (CC0 → `dominio_publico`, ADR-36
decisión 2); ND no tiene clase y cae en `licencia_no_aceptada`.

**D3 · Persistencia del rechazo sin cambiar el esquema.** Todo rechazo deja la fila con
`status = rechazado_licencia` (único estado de rechazo del enum de `data-model`), sin chunks, sin
texto almacenado y fuera del `CorpusRelease`. El **motivo** va en el reporte de la carga (JSON por
stdout y `reports/corpus/seed-<fecha>.json`, solo identificadores de documento, motivos y
recuentos), no en una columna: añadir `rejection_reason` cambiaría `data-model` y el esquema de
L1D-114. Ver Open Questions (P1). Para `fuente_excluida` la fila guarda solo metadatos del
manifiesto (`source_name`, `external_id`, `title`), nunca contenido.

**D4 · Población (RN-25).** `resolver_criterios_poblacion(doc)` devuelve el `jsonb` con las seis
claves de `population_criteria` (subtipo, estadio, línea, biomarcadores, edad, ECOG): las que el
manifiesto trae en `population_criteria` estructurado se copian; el resto, `no_disponible`. Si al
menos una viene de la fuente, `metadata_source = fuente_estructurada`; si ninguna, `metadata_source`
queda nulo (no hay metadato que atribuir). No se lee ni se infiere nada del texto.

**D5 · Versionado e idempotencia (RN-05).** `decidir_version(entrante, existentes_del_grupo)` es pura:
mismo `checksum` en el grupo → `omitir` (AC-5, sin *embedding*); grupo sin versión vigente →
`insertar`; vigente con `checksum` distinto → `reemplazar(anterior)`. `reemplazar` inserta la fila
nueva, marca la anterior `is_current = false` + `superseded_at = clock.now()` en la misma
transacción del catálogo, y actualiza `is_current = false` de los chunks anteriores con *upsert* de
Milvus por `chunk_id` (mismo PK, no hay borrado lógico ni físico de la entidad desde el cargador).
Orden: primero se insertan los chunks nuevos, después se apagan los anteriores, y por último se
confirma el catálogo; un fallo intermedio deja la versión anterior vigente (ver Risks).
El `checksum` es SHA-256 del texto normalizado.

**D6 · Chunking y *embeddings*.** `fragmentar(texto, CORPUS_CHUNK_SIZE, CORPUS_CHUNK_OVERLAP)` es pura
(por caracteres con corte en límite de párrafo cuando existe; al fijarse US-012 AC-10, tamaño y solapamiento pasan a tokens del *tokenizer* del modelo elegido, `[S1 resp. 38]`). Normalización mínima: Unicode NFC,
espacios y saltos de línea. El puerto `PassageEmbedder` (pasajes, no preguntas) se declara en
`app/application/seed_corpus/ports.py` para no chocar con `QueryEmbedder` de L1D-106; el adapter real
lo implementa el mismo módulo `infrastructure/embeddings/` con el modelo de ADR-39 (prefijo de pasaje
si el modelo lo requiere). La inserción en Milvus extiende `MilvusRepository` de L1D-106/L1D-114
con `insertar_chunks()` y `marcar_no_vigentes()`; quien mergee segundo hace el *rebase*.

**D7 · Fallos de dependencias.** Si el *embedding* o Milvus fallan para un documento, ese documento
queda `status = error`, sin chunks a medio insertar visibles como vigentes, y el cargador sigue;
termina con código ≠ 0 si hubo algún `error`, y con código 0 si solo hubo rechazos de licencia
(son resultado esperado). PostgreSQL caído → aborta antes de procesar. No es AC de US-059: se
documenta y se prueba como test después, no como escenario.

**D8 · `CorpusRelease`.** Se publica una release al final de cada ejecución **solo si cambió el
conjunto de documentos vigentes** (AC-5: la recarga idéntica no crea otra). `release_id` del
`IdGenerator`; `cutoff_date` de `CORPUS_CUTOFF_DATE` (workaround de US-119, RN-22);
`excluded_sources` de `CORPUS_EXCLUDED_SOURCES`; `document_count` y una fila de
`corpus_release_document` por documento vigente.

**D9 · Manifiesto y textos (RN-14, RN-21).** `data/raw/seed/manifest.yaml` declara por documento:
`document_key`, `version_group_id`, `source_type`, `source_name`, `external_id`, `title`, `language`,
`cancer_type_tags`, `license` (texto literal), `license_url`, `license_verified_at` y su evidencia
(JSON de metadatos de PMC o `<dc:rights>` de OAI-PMH; para PDQ, la política de cancer.gov),
`published_at`, `study_design`, `population`, opcional `population_criteria`, y **`text_path`**
(texto en `data/raw/seed/docs/`, permitido porque las tres clases aceptadas permiten redistribuir
con atribución) **o** `source_url` (lo descarga `SourceFetcher`). PDQ solo texto, sin imágenes, y
nunca titulado "resumen PDQ" (ADR-36). Composición objetivo: ~5 de mama y ~5 de próstata, con al
menos uno en español. `data/raw/seed/ATTRIBUTION.md` lista autoría y licencia de cada texto
(CC BY/BY-SA lo exigen).

## Decisiones del usuario del 2026-10-20 y desviaciones de la implementación

Las cuatro decisiones siguen **vigentes** y corrigen o precisan lo anterior donde discrepan.

1. **Esquema, opción A, sin cambiar el catálogo** — *lectura revisada de Q9/D4 (decidido por el usuario, 2026-10-20)*.
   `object_key_raw = ''` y `object_key_normalized = ''` (la semilla no persiste originales en MinIO; la copia de referencia
   es `data/raw/seed/` o la URL del manifiesto, con `checksum`; Q8/Q9 se difieren a US-117, S4).
   `original_format` es el formato real declarado **por documento** en el manifiesto (`html` para NCI, `jats_xml` para PMC;
   siempre dentro del `CHECK IN ('jats_xml','xml','pdf','html')`). `metadata_source = 'fuente_estructurada'` **siempre**
   (D4 queda así: la rama "nulo si ninguna criterio viene de la fuente" desaparece, la columna es `NOT NULL`): para `t-ok-1`
   los criterios salen del manifiesto estructurado, que no declara ninguno, y valen `no_disponible`; nunca `extraido_verificado`.
2. **Dependencia de L1D-106 aceptada.** No existe en `main` el adapter real de *embeddings*. El puerto `PassageEmbedder`
   se prueba con un fake determinista (`EMBEDDING_DIM = 8`) con contador de invocaciones; la fábrica real del script
   (`fabricar_embedder_real`) falla con un mensaje claro y código 1 hasta que L1D-106 aporte el adapter. El **smoke 1.13
   (AC-1 con el manifiesto real y *embeddings* reales) pasa a tarea explícita de L1D-106** (tarea 2.13b de su `tasks.md`);
   **L1D-115 no pasa a Done hasta que ese smoke corra.**
3. **`fragmentar()` puro sobre un puerto `Tokenizador`** con un tokenizador por palabras provisional (ADR-39 propuesto:
   `CORPUS_CHUNK_SIZE = 1024`, solapamiento 0, `tamano_fijo`); reutiliza `modelos.entero_positivo` y exige solape < tamaño.
   **Regla de licencias del cargador:** `CORPUS_LICENSE_CLASS_MAP` + `CORPUS_ACCEPTED_LICENSES`; ND siempre rechazada
   (aunque el mapa la contuviera); CC BY-NC solo con las tres condiciones (`cc_by_nc` en `CORPUS_ACCEPTED_LICENSES`,
   `ALLOW_CC_BY_NC=true` por `Settings` y `nc_solo_academico: true` por documento). `app/evaluation` queda fuera de la imagen
   de producción, así que **no se importa `dataset_loader`**: la regla de licencias de la semilla duplica su *forma*
   (`CLASE_LICENCIA_ACEPTADA`, `CONTIENE_ND`, las tres condiciones de NC). **Deuda anotada:** unificar con `dataset_loader`
   (ID por asignar). `pyyaml==6.0.3` en `requirements.txt`; `load_seed_corpus.py` entra a la lista blanca de
   `Dockerfile.dockerignore` con su test.
4. **`CORPUS_CUTOFF_DATE`.** El usuario fijó `2026-10-15` (descarga del mini-dataset de ADR-39). Los 10 documentos de la
   semilla real se descargaron el **2026-10-16** (`downloaded_at` por documento): el usuario decide si el valor de corte de
   la semilla es `2026-10-16` (propuesta de esta rama) o se mantiene `2026-10-15`. Registros de ClinicalTrials.gov: no hay
   ninguno en la semilla real; el fixture `t-ok-2` es sintético (etiqueta `ClinicalTrials.gov / NCTxxxxxxxx`, URL, fecha de
   consulta y atribución visible a NLM, sin sugerir aval, si algún día se carga uno real). Sin NCCN ni ESMO ni datos reales.

### Desviaciones del diseño original

- **D2/D3 · clase de licencia de un rechazado.** `corpus_document.license_class` es `NOT NULL` con `CHECK` sobre cuatro
  valores y el catálogo no cambia, así que una fila `rechazado_licencia` necesita uno. Se usa `cc_by_nc` (la más
  restrictiva); la verdad de la licencia del rechazado es `license` (texto literal, `''` si falta) y `status`; nunca es
  vigente ni tiene chunks ni entra a una release. **Pregunta abierta P4** (humano): ¿se prefiere permitir `NULL`/otro valor
  en una migración propia? No cambia ningún AC.
- **D3 · reporte.** Solo salida estándar (JSON con identificadores, resultado, motivo y recuentos). No se escribe
  `reports/corpus/seed-<fecha>.json`: `reports/` no viaja en la imagen y el contenedor es de solo lectura.
- **D5 · identificadores.** `document_id = <document_key>@<checksum[:12]>` (mismo contenido, mismo id: los reintentos son
  *upserts*; contenido nuevo, id nuevo, sin colisión de PK) y `chunk_id = <document_id>#<índice de 4 dígitos>`. Un rechazado
  usa `<key>@rechazado` y un error previo al checksum `<key>@error`. Un reintento no reinserta los chunks que ya estén en
  Milvus (`ids_de_chunks_del_documento`) y `marcar_no_vigentes` relee cada entidad con sus vectores y la reescribe con
  `upsert` por `chunk_id`. El checksum es el del texto normalizado (NFC, `\n`, espacios colapsados).
- **D8 · `excluded_sources`** se guarda como arreglo JSON en la columna `text` (`["NCCN", "ESMO"]`), el mismo formato del
  contrato; la release se publica solo si el conjunto de documentos vigentes cambia respecto de la última.
- **D9 · integridad.** El manifiesto admite `checksum` (SHA-256 del texto normalizado) por documento; si el texto leído da
  otro, el documento queda `error` (etapa `integridad`) y no se indexa. `HttpSourceFetcher` solo acepta `text/plain`:
  parsear HTML o JATS en producción no es parte de este change (el texto de la semilla real ya está extraído en
  `data/raw/seed/docs/`). El manifiesto acepta además `text` (inline, solo fixtures) y `text_path` relativo al manifiesto.
- **Fuera de la regla de fuente excluida**: la comparación es exacta tras `casefold` y espacios (spec); una variante como
  "NCCN Guidelines" no coincide. El manifiesto lo escribimos nosotros y la regla de la ingesta del S4 será `CORPUS_ALLOWED_SOURCES`.
- **Observación para L1D-106 (no se cambia aquí).** `MilvusRepository.search_dense` no fija nivel de consistencia: con el
  predeterminado de la colección, una búsqueda inmediatamente posterior a `marcar_no_vigentes` puede ver el estado anterior.
  El cargador y sus tests leen con `consistency_level="Strong"`.

## Privacidad y ownership

- Todo ocurre dentro de `rag-orchestrator` (ai-services): lee archivos de `data/raw/seed/` o URLs
  públicas y escribe solo en el schema `corpus` (rol `rag_corpus`) y en Milvus. No hay frontera
  `web → clinical-api → rag-orchestrator` involucrada: no hay petición de usuario ni contexto
  clínico, por lo que la desidentificación (RN-11) no aplica.
- `rag-orchestrator` **no toca datos clínicos ni `clinical-minio`**: el cargador no tiene
  credenciales ni red hacia ellos (red `corpus-db-net` y `ai-net` del change de L1D-164).
- Sin PHI ni identificadores de paciente en `data/` ni en fixtures (RN-13, RN-14): solo textos
  públicos con licencia aceptada y textos sintéticos breves en FX-06c-a. NCCN y ESMO no aportan
  contenido al repo: `t-nccn` es texto sintético que solo lleva su nombre como fuente.
- *Logs* y reporte: identificadores del documento, motivos y recuentos; nunca el contenido ni la
  URL completa de los documentos (CLAUDE.md, *logs*).
- `SourceFetcher` solo descarga de hosts en `CORPUS_FETCH_ALLOWED_HOSTS` (cancer.gov,
  pmc.ncbi.nlm.nih.gov, el bucket `pmc-oa-opendata`) por HTTPS; ningún otro egreso.

## Contratos

Sin cambios en `apps/rag-orchestrator/openapi.yaml` ni en `contracts/examples/`: el cargador es un
comando interno, no un endpoint. Proveedor y consumidor no cambian; oasdiff sin diferencias; ADR-26
no se ve afectado. `meta.corpusRelease`, `meta.corpusCutoffDate` y `excludedSources` del contrato
(ya congelados en US-033) se alimentan de la release que publica este cargador; su lectura es de
US-055 / US-061.

## Evaluación

Toca **corpus**, así que aplica OL-06: el PR corre `run-ai-eval` si la suite existe; mientras no
exista (US-072, S2), `ai-eval-runner` revisa a mano la recuperación del caso semilla de mama y
próstata sobre esta semilla (walking skeleton). Métricas afectadas: recall@10 (≥ 0,80; ≥ 0,70
es → en), MRR (≥ 0,60), precisión de citas y "sin evidencia" (≥ 0,90). M-08.3 (población) y M-08.4
se miden en el S5 (US-132) sobre el corpus del S4; esta semilla no los persigue.

## Dependencias y colaboradores

| Módulo | Nuevo/modifica | Depende de |
|---|---|---|
| `app/scripts/load_seed_corpus.py` | nuevo | configuración, adapters concretos (raíz de composición) |
| `app/application/seed_corpus/seed_corpus_loader.py` | nuevo | puertos `CorpusCatalog`, `ChunkStore`, `PassageEmbedder`, `SourceFetcher`, `Clock`, `IdGenerator`; reglas de `domain/corpus_seed/` |
| `app/application/seed_corpus/ports.py` | nuevo | — (Protocol) |
| `app/domain/corpus_seed/admisibilidad.py` | nuevo | — (puro): `evaluar_admisibilidad()` (RN-21, D-09), `clase_de_licencia()` |
| `app/domain/corpus_seed/poblacion.py` | nuevo | — (puro): `resolver_criterios_poblacion()` (RN-25) |
| `app/domain/corpus_seed/versionado.py` | nuevo | — (puro): `decidir_version()` (RN-05), `calcular_checksum()` |
| `app/domain/corpus_seed/chunking.py` | nuevo | — (puro): `normalizar_texto()`, `fragmentar()` |
| `app/infrastructure/catalog/corpus_document_repository.py` | nuevo | SQLAlchemy/psycopg sobre las tablas de L1D-114; implementa `CorpusCatalog` |
| `app/infrastructure/milvus/milvus_repository.py` | modifica (L1D-106/L1D-114) | `pymilvus`; añade `insertar_chunks()`, `marcar_no_vigentes()`; implementa `ChunkStore` |
| `app/infrastructure/embeddings/` | modifica (L1D-106) | adapter falso determinista (tests) y real de ADR-39; implementa `PassageEmbedder` |
| `app/infrastructure/fetch/http_source_fetcher.py` | nuevo | `httpx`; lista de hosts permitidos |
| `app/config/settings.py` | modifica | `pydantic-settings` (claves de What Changes) |

El service nunca importa `pymilvus`, `httpx` ni SQLAlchemy. Reglas extraídas con nombre propio:
`evaluar_admisibilidad()` (RN-21), `resolver_criterios_poblacion()` (RN-25), `decidir_version()`
(RN-05).

## Risks / Trade-offs

- [L1D-114 no mergeado al empezar] → dominio y service se prueban con fakes de los puertos; los tests
  de integración (PostgreSQL `corpus` y Milvus de test) entran cuando exista el esquema.
- [Choque en `milvus_repository.py` / `embeddings/` con L1D-106] → métodos nuevos, no se cambian los
  existentes; puerto propio `PassageEmbedder`.
- [Fallo entre insertar chunks nuevos y apagar los viejos] → durante la ventana puede haber dos
  versiones con chunks vigentes; el catálogo es la verdad (`is_current` del documento) y una
  re-ejecución lo repara (idempotente). Aceptable en un cargador manual del S1; US-117 lo resuelve
  con la ingesta reanudable.
- [Licencia PMC mal leída] → `license_verified_at` y la evidencia por documento en el manifiesto;
  revisión humana del manifiesto en el PR (ADR-36, "Pendiente de verificar").
- [PDQ desactualizado (ADR-36, sin verificar)] → no bloquea la semilla; se anota en el manifiesto.

## Migration Plan

Sin migración de esquema (es de L1D-114). Despliegue: `python -m app.scripts.load_seed_corpus`
tras `alembic upgrade head` e `ensure_collection()`. Rollback: los documentos nunca se borran; para
deshacer una carga de desarrollo se recrean los volúmenes de test/Compose (solo datos públicos).

## Open Questions

- **P1 · Resuelta por la implementación (a confirmar en la revisión del PR):** el rechazo por `fuente_excluida` se
  persiste como fila `status = rechazado_licencia` (propuesta D3, sin cambio de esquema); el motivo va al reporte.
- **P2 · Resuelta por la decisión 1 del usuario (2026-10-20):** `metadata_source = fuente_estructurada` siempre. El valor
  `curado` de ADR-36 decisión 5 sigue pendiente para US-118 (S4).
- **P4 · Pendiente de definir (humano):** `license_class` de una fila `rechazado_licencia` (ver *Desviaciones*).
- **P3 · Nota (no bloquea):** FX-06c-a usa `ClinicalTrials.gov` en `t-ok-2`, fuente fuera del MVP
  según ADR-36. Es un fixture sintético para probar la copia de criterios estructurados y el S1 no
  aplica `CORPUS_ALLOWED_SOURCES` (US-117); el manifiesto real no la incluye.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-10] *permission denied* del rol `rag_corpus` fuera de `corpus` activa desde S2
  (US-040).
- Regresión [RN-21] rechazo por fuente no admitida (`CORPUS_ALLOWED_SOURCES`) y regla de PubMed
  activa desde S4 (US-117).
- Regresión [RN-05] recuperación solo de chunks vigentes: la verifica US-055 AC-3 (change de L1D-106).
