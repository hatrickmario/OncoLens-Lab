# Proposal — us-231b-adapter-nli-smoke-semilla

## Trazabilidad

US-231b · ADR-39 (fase A, aceptada) · FEAT-06a · Sprint 1 (oleada 6c) · Estimación **3** ·
**Sin `L1D-nn`:** Linear pendiente por el límite de issues del workspace; el nombre del change es el propuesto en
`backlog/sprints/S1-plan.md` (fila de la oleada 6c) y, cuando exista el issue, se renombra a
`l1d-<nn>-adapter-nli-smoke-semilla` (convención `l1d-<nn>-<slug>`, igual que US-231a). Los commits usan el alcance `US-231b`.
HU-03 · IA-01, NFR-01, NFR-05, RN-12, RN-22, RN-05, FR-10 (mecanismo de soporte), FR-25 (`meta.nliModel`) ·
AC-06.1 (parte S1) · `[US-059 AC-1]` · `[S1 resp. 3]` (falla cerrada del NLI) · `[S1 resp. 38]` (chunk en tokens) ·
decisiones 73, 74, 75, 82 y 83 de `S1-plan.md` ·
US-231b AC-1 … AC-9 (ex US-231 AC-3, AC-4, AC-6, AC-7, AC-8 y AC-9) · Medido en: US-072 / US-073 (fidelidad), US-224 / L1D-274 (p95)

## Why

Con US-231a en `main`, la recuperación ya corre con modelos locales reales (BGE-M3 y bge-reranker-v2-m3), pero
tres piezas siguen sobre fakes o sin cablear: (1) el soporte NLI de L1D-180 no tiene puerto ni adapter real
(`NliClassifier`); (2) el cargador de la semilla de L1D-115 sigue saliendo con código 1 en `fabricar_embedder_real` y
trocea por palabras (`TokenizadorPorPalabras`), por lo que L1D-115 no puede pasar a Done (*smoke* 1.13 / tarea 2.13b);
(3) `app/main.py` construye la app sin los bordes del corpus (Milvus y catálogo), así que con `LLM_PROVIDER=local`
`/rag/query` responde `503 RETRIEVAL_UNAVAILABLE` (etapa `composicion`) aunque los modelos estén verificados. Este
change cierra las tres y mide la latencia del NLI y la memoria conjunta de los tres modelos frente al ADR-39.
Desbloquea L1D-180 (puerto y adapter) y la medición de p95 de L1D-274.

## What Changes

- **Nuevo** `Protocol` `NliClassifier` en `app/application/ports.py` con la firma de la D7 del design de L1D-180
  (`clasificar(pares: list[ParNli]) -> list[ResultadoNli]`, `ResultadoNli(label, p_entailment)`, por lotes) y un fake
  mínimo (`tests/support/`) para la batería de contrato. L1D-180 lo consume, completa el fake (FX-06a-b) y traduce el
  error del puerto en `NLI_UNAVAILABLE` (`503`); ese mapeo **no** es de este change.
- **Nuevo** adapter `app/infrastructure/nli/mdeberta.py` (mDeBERTa-v3-base-xnli-multilingual-nli-2mil7, **fp32**,
  ONNX Runtime/CPU, `NLI_MODEL` / `NLI_MODEL_REVISION` / `NLI_QUANTIZATION` de L1D-102), con `SesionDeInferencia`
  inyectable, tokenizer local y `describir_modelo()` para `meta.nliModel` (modelo, versión y SHA-256 de la
  configuración, nunca del texto generado). Recibe solo premisa (texto del corpus) e hipótesis (RN-11).
- **Reutiliza** el mecanismo de US-231a: `ARCHIVOS_A_VERIFICAR` suma `NLI_MODEL_PATH`/`NLI_MODEL_SHA256` y
  `NLI_TOKENIZER_PATH`/`NLI_TOKENIZER_SHA256` (un SHA-256 por archivo cargado); `ModeloNoVerificadoError ... from None`;
  `MODEL_PROVIDER` `fake|local`; `HF_HUB_OFFLINE=1`/`TRANSFORMERS_OFFLINE=1`; bind mount `read_only` de `MODEL_HOST_DIR`.
- **Semilla con modelos reales (tarea 2.13b):** `fabricar_embedder_real` de `app/scripts/load_seed_corpus.py` deja de
  salir con código 1 y devuelve el adapter de `PassageEmbedder` de US-231a (ya verificado); `TokenizadorPorPalabras`
  se sustituye por el tokenizer de BGE-M3 (`CORPUS_CHUNK_SIZE` pasa de palabras a tokens, `[S1 resp. 38]`).
- **Composición del corpus en `app/main.py`:** con `MODEL_PROVIDER=local` y `LLM_PROVIDER=local`, `main.py` construye
  los bordes reales del corpus (`PuertosDelCorpus`: Milvus y lectores del schema `corpus` con el rol `rag_corpus`) para
  que `/rag/query` deje de responder `503` por composición. Sin esto no hay *smoke* de punta a punta.
- **Decisión 82:** `RETRIEVAL_TOP_K=30` (ya en `.env.example`) y corte previo a `RERANKER_MAX_PAIRS=12` por puntaje de
  recuperación, ambos en configuración. Hoy el arranque se niega si `RETRIEVAL_TOP_K > RERANKER_MAX_PAIRS`
  (`CandidatosSuperanLosParesDelReranker`, Gate 2 de US-231a) y el servicio no recorta: el PR #70 no entregó el corte.
  Este change lo entrega en el servicio de recuperación (etapa nueva «cortar a pares del reranker») y sustituye la
  negativa de arranque por la validación `RERANKER_MAX_PAIRS ≥ 1`. **Ver Pendientes: no tiene AC propio.**
- **Endurecimiento del Gate 1 (privacy):** el mapeo de clases del NLI sale de configuración versionada y validada, no de un `config.json`
  sin verificar; los datos externos del ONNX son un requisito verificado (la sesión se crea desde los **bytes ya hasheados**); `**/*.onnx.data`
  entra a `.gitignore`, `.dockerignore` raíz y `Dockerfile.dockerignore` (RN-14); una sonda al arrancar (`SELECT 1` con `rag_corpus`,
  `has_collection`) hace fail-closed el corpus sin eco de URI/host/DSN; el cargador de la semilla verifica **todos** los archivos que carga.
- **Mediciones** (`@pytest.mark.models`, VM de Docker ≥ 10 GB): latencia de la etapa NLI (≤ 1500 ms, mediana de 3) y
  RSS conjunto de los tres modelos (≤ 4489 MiB); un exceso se reporta, no se oculta.
- **Sin cambio de contrato HTTP** (`openapi.yaml` no cambia): `meta.nliModel` ya es `string`. No hay `## contratos`.

## Capabilities

### New Capabilities

- `evidence-analysis`: requisitos de **adapter NLI real**, procedencia `meta.nliModel`, *smoke* de la semilla con
  modelos reales, *chunking* en tokens y composición real del corpus. Se suma a los de L1D-106 y US-231a en la misma
  capacidad (nombres de requisito específicos para evitar choques en el archivado).

### Modified Capabilities

- `api-contracts`, `data-model`: sin delta.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator` (`app/application/ports.py`, `app/infrastructure/{nli,models}`, `app/scripts/load_seed_corpus.py`,
  `app/main.py`/`bootstrap.py`, `app/config`, `tests/`).
- **infra**: variables del servicio `rag-orchestrator` en `infra/docker/docker-compose.yml` (`NLI_MODEL_PATH`, `NLI_MODEL_SHA256`,
  `NLI_TOKENIZER_*`, índices de clase del NLI, `CORPUS_DATABASE_URL`, `MILVUS_URI`, `RETRIEVAL_TOP_K` por defecto 30) y su test de
  configuración; `.gitignore`, `.dockerignore` y `apps/rag-orchestrator/Dockerfile.dockerignore` (`**/*.onnx.data`) con su caso en
  `dockerignore.test.mjs`; `.env.example` lo aplica el humano (el agente solo reporta las claves).
- No toca `clinical-platform`, `frontend` ni `contratos`.

## Dependencias

- ↪ **US-231a** (`us-231a-adapters-reales-recuperacion`, en `main`, PR #70): `verificar_modelo`, `SesionOnnx`,
  `TokenizadorDeArchivo`, `ModelosDeRecuperacion`, `PassageEmbedder` real, bind mount y variables de Compose.
- ↪ **L1D-102** (US-012, en `main`): `NLI_MODEL`, `NLI_MODEL_REVISION`, `NLI_QUANTIZATION`, presupuesto de 4489 MiB.
- ↪ **L1D-115** (US-059, en `main`): cargador de la semilla, manifiesto `data/raw/seed/manifest.yaml`, puerto `PassageEmbedder`.
- ↪ **L1D-164** (US-034, en `main`): Compose y `LLM_PROVIDER=fake`. ↪ **L1D-106 / L1D-114 / L1D-179** (en `main`): servicio de recuperación, Milvus y catálogo.
- 🔗 **Bloquea:** **L1D-180** (puerto y adapter; tareas 2.11 parte `NliClassifier` y 2.14 pasan a consumirlos), el cierre de **L1D-115**
  (*smoke* 1.13 / 2.13b) y la medición de p95 de **L1D-274**. No bloquea los AC de US-064, que siguen con fake.

## Fuera de alcance

*Embeddings*, *reranker* e idioma (US-231a). La etapa de soporte del pipeline, `NLI_ENTAILMENT_THRESHOLD`, `discardedOptions`,
`omittedClaims` y `503 NLI_UNAVAILABLE` (US-064 / L1D-180). LLM y OCR (US-224 / L1D-274). Cambiar la elección del ADR-39
(otra combinación exige medición y ADR nuevos). Recuperación híbrida y *sparse* (S3, US-112).

## Pendientes de refinamiento (para /sprint-start)

1. **Decisión 82 y composición sin AC propio (AC-10 `(asumido)`, a decidir por el usuario):** el corte previo a 12 pares y la composición del
   corpus en `main.py` son prerrequisitos del *smoke* pero ningún AC de US-231b los nombra. Se verifican como escenarios del AC-9.
   Propuesta: añadir un AC-10 `(asumido)` en el Markdown de la historia; requiere aprobación (los AC son inmutables).
2. **Origen y formato del ONNX fp32 del NLI (a confirmar por el usuario):** opción por defecto, **reexportar en un solo archivo**
   (sin datos externos) más `tokenizer.json`; alternativa, aceptar `*.onnx.data` con su par `NLI_MODEL_DATA_PATH` / `NLI_MODEL_DATA_SHA256`.
   Un modelo con datos externos sin su par verificado hace fallar el arranque (requisito del spec). Tarea previa: inspeccionar
   `MODEL_HOST_DIR` (`ls`) y comprobar si los modelos cuantizados de US-231a (embeddings y reranker) trajeron un `model.onnx.data` sin verificar
   (deuda probable de US-231a si se exportaron con `use_external_data_format=True`).
3. **Memoria conjunta:** el ADR midió 964 + 2642 + 883 MiB por separado; el RSS de un solo proceso puede diferir, y el pico de la
   **carga** (bytes leídos para el hash más la sesión) puede superar el RSS en régimen. El AC-7 mide el proceso real y documenta ambos
   picos (carga y régimen); un exceso se reporta.
4. **Mapeo de clases del NLI (a confirmar por el usuario):** por defecto, índices de `entailment`/`neutral`/`contradiction` en configuración
   versionada (RN-22) y validados al arrancar; alternativa, verificar `config.json` con `NLI_CONFIG_PATH` / `NLI_CONFIG_SHA256` en
   `ARCHIVOS_A_VERIFICAR`. Nunca se lee un `config.json` sin verificar (un mapeo alterado invertiría el soporte, RN-01).
5. **Matriz del *smoke* de `/rag/query` (a decidir por el usuario).** Hoy `bootstrap.py` (`_registrar_consulta_de_evidencia`) solo usa la
   recuperación real con `LLM_PROVIDER=local`; con `fake` responde del fake. Opciones: **(a)** `LLM=local` + `MODEL=local` aceptando `200
   sin_evidencia` o `503` con aserciones sobre el espía del *reranker* y los logs (≤ 12 pares); **(b)** componer también con `LLM=fake` +
   `MODEL=local` cambiando `bootstrap.py` (el LLM falso responde y se ve la recuperación real de punta a punta); **(c)** probar la recuperación
   por debajo del endpoint (servicio de recuperación con los bordes reales). **Recomendación: (b)** para el AC-9 (no depende del LLM local de
   L1D-274, ejercita el cableado real y el 200 validable contra el spec); **(c)** como respaldo si no se quiere tocar `bootstrap.py`. Mientras no se
   decida, el escenario del AC-9 queda redactado para (b) y marcado.
6. **Origen de los pesos del tokenizer:** `TokenizadorDeArchivo` exige el token de relleno `<pad>` y mDeBERTa usa `[PAD]`: se lee el
   `pad_token` del propio `tokenizer.json` (ya verificado por SHA-256) en lugar de un literal.

## Impact

- Código: `apps/rag-orchestrator/app/{application/ports.py,infrastructure/{nli,models,tokenizer},scripts/load_seed_corpus.py,main.py,bootstrap.py,config}`
  y `apps/rag-orchestrator/tests/`. **Sin dependencias nuevas de runtime** (ONNX Runtime y `tokenizers` ya fijados en US-231a);
  `transformers` y `huggingface_hub` siguen sin importarse en runtime.
- Los pesos del NLI no entran al repo ni a la imagen: viven en `MODEL_HOST_DIR` fuera del repo, montado `read_only`.
- Evaluación: el change **no** cambia modelo, umbral, prompt, catálogo ni corpus (ejecuta lo decidido en ADR-39); el *smoke* carga la
  semilla ya existente. No se lanza `ai-eval-runner`; se adjuntan las mediciones de latencia y memoria.
