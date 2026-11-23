# Design — l1d-119-corpus-ampliado-calibracion

## Contexto

US-120 junta dos trabajos que comparten la máquina de referencia y el corpus: (1) curar e ingerir un corpus de ≥ 20 documentos por tipo de cáncer, y (2) medir y calibrar sobre él con los modelos locales. Por decisión del refinamiento (`S5-refinamiento.md` §5), todo lo que necesita los modelos reales (ingesta con *embeddings* reales, extracción de población con el LLM local, barridos, baseline y las mediciones D4-21 y D4-30) se ejecuta en **una sola corrida nocturna al cierre del día 2**, junto con US-249 AC-4 y US-140, para no ocupar el MacBook en horario de trabajo ni recargar modelos. Lo que corre en la CI usa adaptadores falsos.

## Decisiones

### D1 · Fuentes del manifiesto: las de ADR-36, por nombre exacto, en configuración

- `source_name` ∈ `CORPUS_ALLOWED_SOURCES` = `NCI`, `PMC Open Access`, `ClinicalTrials.gov` (valor por defecto en `Settings`; ADR-36, Decisión 7 y Enmienda 1). `NCI` y no `NCI PDQ` (`[S1 resp. 38]`).
- Tres `source_name` por tipo es exactamente la lista admitida: cada tipo necesita al menos un documento de cada fuente. ClinicalTrials.gov entra como `source_type` de registro de ensayo y aporta población nativa (`sex`, `minimumAge`, `maximumAge`, `stdAges`); el análisis y la UI no lo presentan como resultado de un estudio (Enmienda 1, cond. 1; lo revisa `clinical-language-auditor` en las historias que muestran la fuente).
- PMC: licencia exacta por documento (CC0 → `dominio_publico`, `cc_by`, `cc_by_sa`) leída del registro de Europe PMC o del `<license-p>` del JATS, nunca de la revista ni del grupo del subconjunto. Antes de la ingesta real se cierran los «Pendiente de verificar» de ADR-36 y el texto literal de atribución de ClinicalTrials.gov (Enmienda 1, cond. 2).
- NCCN y ESMO solo en `excluded_sources` (piso `PISO_DE_FUENTES_EXCLUIDAS` + configuración); ni texto ni ejemplos.
- *Descartadas* (barato de revertir, una línea): validar contra una lista literal en el test (duplica la regla, viola RN-22); añadir una cuarta fuente (ninguna otra pasa ADR-36).

### D2 · El manifiesto del S5 es un superconjunto de la semilla

`data/raw/s3/manifest.yaml` incluye los 10 documentos de `data/raw/seed/` con la misma `document_key` y `checksum` (la ingesta es idempotente por checksum, US-117a), más ≥ 15 nuevos por tipo. Los textos van en `data/raw/s3/docs/` solo si su licencia permite redistribuirlos (NCI, CC0, CC BY, CC BY-SA, ClinicalTrials.gov); si no, el manifiesto lleva la URL y el `checksum` y el texto se descarga en la ingesta (AC-3). Sin `object_key_*` (decisión Q8/Q9 de la semilla). Ruta literal del AC-1: no se renombra a `s5`.

Cobertura mínima de idiomas (AC-7): mama con ≥ 1 documento en español y ≥ 1 en inglés cuyo fragmento de elegibilidad exprese HER2 y receptores hormonales. NCI en español aporta el lado `es`; PMC OA en español es escaso (riesgo, ver Pendientes).

### D3 · Barridos de AC-5: generalizar el de US-073, elección en funciones puras

- `evaluate --sweep {relevance_threshold|nli_entailment_threshold|retrieval_top_k}`; `corrida_barrido.py` recibe el parámetro y su grilla de `config_suite` (`barrido.nli_entailment_threshold_grid`, `barrido.retrieval_top_k_grid`); `NLI_ENTAILMENT_THRESHOLD_GRID` y `RETRIEVAL_TOP_K_GRID` en configuración (RN-22).
- Reglas de elección (propuestas; las confirma el humano en `/sprint-start`):
  - `elegir_umbral_entailment()`: el valor con mayor fidelidad entre los que cumplen precisión de citas ≥ meta y «sin evidencia» ≥ meta; empate → el umbral más alto (más conservador, RN-01). Si ninguno cumple, se conserva el provisional y el reporte lo marca «sin valor elegible».
  - `elegir_top_k()`: el menor `k` cuyo recall@10 queda dentro de `RETRIEVAL_TOP_K_RECALL_TOLERANCE` del mejor de la grilla y cuyo p95 de recuperación no supera su meta.
  - `elegir_umbral()` (US-073) se reutiliza tal cual para `RELEVANCE_THRESHOLD`.
- El reporte de cada barrido trae la tabla por valor, el elegido y su justificación; los valores elegidos se escriben en la configuración (valor por defecto de `Settings` y de Compose), y los provisionales 0,7 y 30 se sustituyen. Si el barrido confirma el provisional, se anota como confirmado.

### D4 · Baseline AC-6 por tipo de cáncer e idioma

Reutiliza la suite con `proveedor: local` de US-233a y el informe del barrido de US-073; agrega la desagregación por `cancer_type` × idioma (`es`, `en`, `es→en`). El p95 de `/platform/evidence-analyses` se mide de punta a punta contra el Compose (seed sintético) y se reporta la **mediana de 3 corridas**; un p95 fuera de meta se anota como insumo de ADR-42 sin cambiar la meta. Si US-245 queda fuera de meta en fidelidad, el reporte añade la valoración de OUT-08 (soluciones 3 y 4) como texto, sin implementarla (`[S4 resp. 15]`).

### D5 · Mediciones arrastradas (sin AC propio)

- **D4-21 → US-133 AC-1:** `evaluate --config eval/configs/s4-hibrida.yaml` sobre el corpus ampliado con *dense* y *sparse* (A0, A2, A2b en la misma corrida); el resultado se anota en la fila D4-21 de `S4-deuda.md` y en el reporte. Requiere el *sparse* real (l1d-116, tarea 1.10).
- **D4-30 → US-238 AC-9:** runner de variantes, brazo «reescritura» con el LLM local; el valor por defecto de `QUERY_REWRITE_ENABLED` se fija con la regla ya especificada (IC pareado que excluye 0, «sin evidencia» sin bajar, latencia añadida p95 ≤ su límite) y se anota en la fila D4-30.

## Privacidad y ownership

- Solo textos públicos con licencia aceptada y datos sintéticos de evaluación; ningún dato clínico ni real (RN-13, RN-14). El escaneo de PII (US-036) y de secretos corre sobre `data/raw/s3/`.
- Todo ocurre en `rag-orchestrator` con el rol `rag_corpus` (schema `corpus`) y Milvus; no toca `clinical-api`, PostgreSQL clínico ni `clinical-minio`. La medición de p95 de punta a punta usa el Compose con seed sintético; el reporte solo contiene agregados (sin preguntas, fragmentos ni salidas).
- Modelos solo locales (RN-12): `proveedor: local` con las guardas de `es_proveedor_local()`; un alias de nube aborta. La descarga de textos usa solo las URL del manifiesto, sin enviar contenido a terceros.

## Contratos

Sin cambios de API: no hay diff de `openapi.yaml` ni de `contracts/examples/`. Las claves nuevas del reporte de `evaluate` son aditivas y no forman parte de los contratos de los backends.

## Dependencias y colaboradores

- **Se crean:** `data/raw/s3/manifest.yaml`, `data/raw/s3/ATTRIBUTION.md`, `data/raw/s3/docs/*`; `app/evaluation/barrido.py` gana `elegir_umbral_entailment()` y `elegir_top_k()` (puras); `app/evaluation/resumen_poblacion.py` con `resumir_poblacion_por_tipo_e_idioma()` (pura, sobre filas del catálogo); `eval/configs/s5-calibracion.yaml`.
- **Se modifican:** `app/config/settings.py` (claves nuevas, RN-22: `CORPUS_ALLOWED_SOURCES`, `CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE` = 20, `CORPUS_MIN_SOURCES_PER_CANCER_TYPE` = 3, `NLI_ENTAILMENT_THRESHOLD_GRID`, `RETRIEVAL_TOP_K_GRID`, `RETRIEVAL_TOP_K_RECALL_TOLERANCE`, `EVAL_P95_RUNS` = 3), `app/evaluation/config_suite.py` (grillas), `app/evaluation/corrida_barrido.py` (parámetro del barrido, desagregación por tipo e idioma), `app/scripts/ingest.py` (lee `CORPUS_ALLOWED_SOURCES` vía la política de admisibilidad, no literal), `app/domain/corpus_seed/admisibilidad.py` (regla `fuente_admitida()` con nombre propio), `infra/docker/docker-compose.yml` (valores por defecto calibrados) y su test.
- Dependen de puertos, no de clientes concretos: el barrido usa los puertos de la suite (`composicion_suite`), la ingesta el `IngestionPipelineService`; el resumen de población lee el catálogo por el puerto del repositorio de `rag_corpus`.
- **Una regla, un dueño:** la admisibilidad de fuentes vive en `admisibilidad.py` (piso excluido + `CORPUS_ALLOWED_SOURCES`); los tests de datos la importan, no la copian. Los valores calibrados viven en `Settings` y Compose, nunca como constantes locales.
- **Fakes:** *embeddings* falsos deterministas (`EMBEDDING_DIM = 8`), Milvus fingido en su puerto y LLM/NLI falsos de FX-06c-c; pasan el mismo test de contrato que su adapter real (`tests/support/`, contrato de puertos de US-213).

## Evaluación

- Métricas OL-06 afectadas: recall@10 (≥ 0,80; es→en ≥ 0,70), MRR (≥ 0,60), fidelidad (≥ 0,90), precisión de citas (≥ 0,90), «sin evidencia» (≥ 0,90), p95 de `/platform/evidence-analyses` (≤ 15 s), M-08.3 (cobertura de población ≥ 0,90) y salidas prescriptivas = 0. Metas iniciales, no se modifican (TBD-02).
- Cambia corpus y umbrales: el PR dispara `eval-required` (`data/raw/**/manifest.{yaml,json}` está en `eval-trigger-paths.yaml`); en la CI corre con adaptadores falsos. La corrida con modelos locales es la nocturna del día 2, por `ai-eval-runner` (skill `run-ai-eval`), con reportes en `reports/eval/l1d-119-*`.

## Riesgos y pendientes

- **Español en mama con HER2/receptores en elegibilidad (AC-7):** PMC OA en español es escaso; si NCI ES no expresa la elegibilidad HER2 en un fragmento verificable, el AC-7 puede no cumplirse con fuentes de ADR-36. No se relaja la regla de licencias (ADR-36, SUP-3): se reporta y se lleva al humano.
- **Tiempo de la corrida nocturna:** ingesta real de ~40–50 documentos + extracción de población + barridos (3 grillas) + baseline (3 corridas de p95) + D4-21 + D4-30 + US-249/US-140. Orden de prioridad si no cabe: AC-1/AC-7 → AC-6 → AC-5 → D4-30 → D4-21.
- Reglas de elección de D3: propuestas, a confirmar en `/sprint-start`.

## Sprint 7 · Corrida base y decisiones de licencia (movido-S7, 2026-11-22)

Fuente: `backlog/sprints/S7-refinamiento.md` (§1, §4, §5, §6, §7; `[S7 resp. 2]`, `[S7 resp. 7]`, `[S7 resp. 8]`) y las
decisiones del usuario del 2026-11-22 (`[S7 resp. 10]`, `[S7 resp. 11]`). D1…D5 siguen vigentes salvo lo que aquí se
indica; en particular, el último punto de D3 («los valores elegidos se escriben en la configuración…») queda sustituido
por S7-D5.

### S7-D1 · La «corrida nocturna del día 2» es ahora la corrida base del S7

Todo lo que en `tasks.md` dice «corrida nocturna» o «DIFERIDA -> D5-08» se ejecuta en la corrida base: una sola carga
de modelos (`ollama ps`, sin swap, `OLLAMA_CONTEXT_LENGTH=8192`), `proveedor: local`, máquina de referencia, stack de la
demo anterior apagado (`S7-refinamiento.md` §7). La comparten `l1d-334` (diagnóstico por etapa), `l1d-329`, `l1d-333`,
`l1d-246`, `l1d-299` y `l1d-113`. Orden de prioridad si no cabe (sin cambio): 8.1–8.2 → 8.4 → 8.3 → 8.6 → 8.5. El
reporte de esta corrida es la referencia del A/B de la corrida final; la colección de Milvus de la base no se
sobrescribe (los brazos de `l1d-337` reindexan en colecciones aparte). Compartir la corrida no es compartir el corpus:
qué corpus usa cada familia lo fija S7-D6.

### S7-D2 · Licencia de ClinicalTrials.gov (`[S7 resp. 7]`, H-3)

Estado observado en `main`: H-3 y H-4 figuran como abiertas en `tasks.md`, pero el 2026-11-04 se aplicó una primera
decisión (ADR-36, versión 1.1b): el manifiesto, `ATTRIBUTION.md` y `MAPA_DE_LICENCIAS_POR_DEFECTO` llevan
«Obra del gobierno de EE. UU.; atribución Courtesy of the U.S. National Library of Medicine». `[S7 resp. 7]`, posterior,
fija otro texto: «Datos de ClinicalTrials.gov (obra del gobierno de EE. UU.; condiciones de uso)». Manda la más
reciente (además, la tarea 1.1 verificó que los términos de uso de ClinicalTrials.gov no contienen la frase de
atribución con «U.S.»). Cambios: `license` de los 10 registros en `data/raw/s3/manifest.yaml`, la línea de
`data/raw/s3/ATTRIBUTION.md`, la entrada de `MAPA_DE_LICENCIAS_POR_DEFECTO` (`app/config/settings.py`) y la nota de ADR-36
(copia estática). La clase sigue `dominio_publico`; el `checksum` de los textos no cambia, así que la ingesta no
reindexa por esto. Cambia `data/raw/**/manifest.yaml`: el PR dispara `eval-required` (adaptadores falsos).

### S7-D3 · Menciones de terceros en texto CC BY (`[S7 resp. 8]`, H-4)

Se admiten. No hay cambio de datos: ningún documento se recorta. NCCN y ESMO siguen en `excluded_sources` y sin entradas
de manifiesto; sus nombres en un artículo CC BY de otra fuente son citas del propio artículo. El test de datos del
manifiesto sigue comprobando que ningún `source_name` es de una fuente excluida. ADR-36 ya lo recoge en su versión
1.1b; se le añade la confirmación del 2026-11-21.

### S7-D4 · Lo que ya no se decide aquí

- `QUERY_REWRITE_ENABLED` (D4-30): la tarea 8.6 mide; la decisión es de `l1d-335` (H-2), sobre la corrida final. La
  tarea 7.1 y el bloque H-1 dejan de escribir ese valor.
- Metas definitivas: DEC-07 (L1D-234), sobre la corrida final.
- Híbrida ponderada (D6-43) y calibración del NLI con etiquetas humanas (D6-46, D6-58): fuera del S7. La tarea 8.5
  (D4-21) solo mide A0, A2 y A2b; `RETRIEVAL_MODE` no cambia.

### S7-D5 · Valores calibrados (7.1) y comparabilidad

**Decidido (usuario, 2026-11-22), `[S7 resp. 11]`.** Los barridos de la corrida base **proponen**
`NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K` y `RELEVANCE_THRESHOLD`; no fijan nada.

- La corrida base y la corrida final corren con los umbrales **actuales** (los valores por defecto vigentes de
  `Settings` y Compose). **Ningún valor por defecto cambia entre la base y la final**, así que los brazos de la final
  (`l1d-335`, `l1d-336`, `l1d-337`) se comparan con la base con los mismos umbrales.
- Los valores calibrados que salgan de los barridos entran en la corrida final como **un brazo más** («umbrales
  calibrados»): la misma configuración y el mismo corpus que el baseline de la base (8.4), con los tres umbrales
  elegidos pasados por configuración de la corrida (entorno o configuración de la suite), sin tocar `Settings` ni
  Compose. Su reporte declara los umbrales de ese brazo y los actuales.
- **Adoptarlos o no** se decide en las decisiones de cierre del sprint, junto a DEC-07 (L1D-234), sobre los reportes de
  la corrida final. Solo si se adoptan se ejecuta la tarea 7.1 (valores por defecto en `Settings` y Compose, su test y
  el bloque H-1 de `.env.example`); si no, 7.1 se cierra como «no adoptado» con la ruta del reporte y los valores
  actuales quedan anotados como confirmados.
- Si un barrido no encuentra valor elegible o confirma el actual, el brazo de la final no se corre para ese parámetro
  y el reporte lo dice.

### S7-D6 · Corpus por familia de evaluación (`[S7 resp. 10]`)

Cada familia usa un corpus fijo, el mismo en la corrida base y en la final, y cada reporte lo registra.

| Corpus | Familias y changes |
|---|---|
| Dataset `s5-corpus-ampliado` en memoria (`data/eval/s5-corpus-ampliado`) | `contextual` (`l1d-329`, `l1d-331`) y `diagnostico` (`l1d-334`) |
| Ingesta real de este change (8.1) | chat (`l1d-326`), faltantes (`l1d-113`), opciones (`l1d-246`), población (`l1d-299`) y los brazos de US-278 (`l1d-336`) y US-279 (`l1d-337`) |

Las mediciones propias de este change no cambian de corpus: los barridos y el baseline usan
`eval/configs/s5-calibracion.yaml` (tarea 1.4) y el p95 de punta a punta, el Compose con la ingesta de 8.1; cada reporte
`reports/eval/l1d-119-*` registra el suyo. El brazo «umbrales calibrados» de la final usa el mismo que el baseline.

**Ficheros que toca el S7.** `data/raw/s3/manifest.yaml` y `data/raw/s3/ATTRIBUTION.md` (texto de licencia);
`apps/rag-orchestrator/app/config/settings.py` (mapa de licencias; los valores calibrados, solo si se adoptan en el
cierre, tras la corrida final); `infra/docker/docker-compose.yml` y su test (ídem); `apps/rag-orchestrator/eval/configs/s5-calibracion.yaml` solo si la
comprobación de D6-37 lo exige; `docs/architecture/adr/ADR-36-fuentes-y-licencias.md` (anotación, sesión principal);
`backlog/sprints/S4-deuda.md` (filas D4-21 y D4-30, sesión principal). No toca `packages/clinical-catalogs/` ni
`data/evaluation/`.


### S7-D7 · Decisiones de implementación de S7.1–S7.6 (2026-11-22)

- **Clave antigua del mapa de licencias (S7.1).** Alternativas: (a) conservar la clave antigua además de la nueva;
  (b) sustituirla. Se sustituye: ningún manifiesto la usa, conservarla admitiría en silencio un texto que citaba como
  condición una frase ausente de los términos de uso, y un manifiesto con el texto viejo debe fallar con
  `licencia_no_aceptada` (falla cerrado, RN-21).
- **Prueba de la regla de fuentes excluidas (S7.2).** La regla (`es_fuente_excluida`) mira nombre, alias, host y DOI del
  documento, no su texto; por eso las menciones en referencias ya se admitían. Alternativas: (a) añadir una exclusión por
  texto (descartada: contradice `[S7 resp. 8]` y daría falsos positivos en artículos CC BY legítimos); (b) fijar el
  comportamiento con pruebas. Se elige (b): control del corpus real con la función de dominio (no un `==` sobre el nombre),
  control negativo que prueba que falla ante un documento de NCCN/ESMO por nombre, alias, DOI o host, y caso de ingesta
  con documento sintético. Son pruebas de caracterización: no hay rojo previo.
- **Comprobación de S7.5.** Alternativas: (a) fijar `RERANKER_MAX_PAIRS` en `s5-calibracion.yaml` (descartada: es un
  parámetro de ADR-39 en `modelos.env`; la suite con `proveedor: fake` no lo lee y con `local` lo toma del entorno);
  (b) prueba de humo con la configuración versionada y solo los adaptadores sustituidos. Se elige (b). Consecuencia a
  tener en cuenta en la corrida base: con el tope de 20 pares (decisión 82) el reranker nunca recibe más de 20 candidatos,
  de modo que los valores 30 y 50 de `retrieval_top_k` solo pueden diferir de 20 en lo que se mide antes del reranker; el
  informe del barrido debe leerse con esa salvedad (no se cambia la grilla aquí: es decisión de la corrida).
