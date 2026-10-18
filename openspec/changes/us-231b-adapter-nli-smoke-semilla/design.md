# Design — us-231b-adapter-nli-smoke-semilla

## Context

Ver `proposal.md` (Why). Estado de partida (`main`, tras US-231a/PR #70): `app/infrastructure/models/` tiene
`verificacion.py` (`verificar_modelo`, `ModeloNoVerificadoError`), `sesion.py` (`SesionDeInferencia`, `Tokenizador`),
`onnx.py` (`SesionOnnx`, `TokenizadorDeArchivo`) y `local.py` (`cargar_modelos_locales`, `ARCHIVOS_A_VERIFICAR`,
`ModelosDeRecuperacion`); `bootstrap.crear_app` recibe `corpus: PuertosDelCorpus` pero `app/main.py` hace
`crear_app(Settings())` sin él. `app/scripts/load_seed_corpus.py` conserva `fabricar_embedder_real` (sale con código 1) y
`TokenizadorPorPalabras`. No existe puerto `NliClassifier` ni `app/infrastructure/nli/`. Este change reutiliza el patrón de
US-231a (cuyo Gate 1 corrigió cuatro Mayores) sin reabrirlo.

## Goals / Non-Goals

**Goals:** NLI real intercambiable con su fake (LSP); verificación de pesos reutilizada; cero red; semilla indexada con
*embeddings* reales y chunks en tokens; `main.py` compone el corpus real; latencia NLI y memoria conjunta medidas.
**Non-Goals:** ver `proposal.md` (etapa de soporte, umbral, `NLI_UNAVAILABLE`, LLM/OCR, cambio de modelos).

## Decisions

1. **Puerto en `application/`, adapter en `infrastructure/nli/`.** `NliClassifier` (`Protocol`) y los valores `ParNli(premisa,
   hipotesis)` / `ResultadoNli(label, p_entailment)` viven en `app/application/ports.py` con la firma de la D7 de L1D-180
   (por lotes). `label` ∈ {`entailment`, `neutral`, `contradiction`}; `p_entailment` ∈ [0,1]. El adapter
   `ClasificadorNliMdeberta` recibe una `SesionDeInferencia` y un `Tokenizador` por constructor. `application/` y `domain/`
   no importan `onnxruntime` ni `tokenizers`. **No se inlinean adapters ni puertos.** Un lote vacío devuelve `[]` sin invocar el modelo.
2. **Probabilidades que suman 1.** El adapter aplica *softmax* a los tres logits del modelo y mapea los índices de clase por
   `id2label` de la configuración del modelo (no por orden supuesto). Las tres probabilidades (`p_entailment`, `p_neutral`,
   `p_contradiction`) suman 1 (tolerancia numérica); `ResultadoNli` expone `label` (argmax) y `p_entailment`; la batería de
   AC-1 comprueba la suma sobre la salida de la sesión. Nunca devuelve `None` ni un `label` por defecto: ante un fallo
   lanza el error del puerto.
3. **Error del puerto.** Todo fallo de inferencia (archivo corrupto, tokenizer, tensor inesperado) se traduce en
   `FalloDeInferencia` (el error del puerto que ya existe en `app/application/ports.py`), sin texto de premisa ni hipótesis en el
   mensaje ni en los logs. L1D-180 captura ese tipo y responde `503 NLI_UNAVAILABLE`; aquí no hay respuesta HTTP nueva.
4. **Verificación de modelos reutilizada, no reescrita.** `ARCHIVOS_A_VERIFICAR` suma `("NLI_MODEL_PATH","NLI_MODEL_SHA256")` y
   `("NLI_TOKENIZER_PATH","NLI_TOKENIZER_SHA256")` (SHA-256 por archivo cargado, RN-22). Mismo contrato: `raise
   ModeloNoVerificadoError(variable) from None`; stdout y stderr completos sin ruta ni hashes (esperado ni calculado); el AC-4
   arranca en **subproceso**. `cargar_modelos_locales` construye también el NLI y `ModelosDeRecuperacion` pasa a llevar
   `clasificador_nli` (o un contenedor `ModelosLocales` si el cambio de nombre lo evita; se decide en la tarea de refactor).
   Con `MODEL_PROVIDER=fake` no se verifica ni se importa ningún runtime.
5. **Procedencia (`meta.nliModel`).** `describir_modelo()` de US-231a produce `"<NLI_MODEL>@<NLI_MODEL_REVISION>#sha256:<NLI_MODEL_SHA256>"`
   desde la configuración (no desde el texto generado ni releyendo el archivo). El SHA-256 de **procedencia** es un identificador
   público del peso y puede ir en `meta` y logs; nunca la ruta ni el hash esperado/calculado de un fallo (D4). La **lectura**
   de ese valor es una propiedad del adapter (`version`); que `meta.nliModel` salga en la respuesta HTTP lo cablea L1D-180.
6. **Sin red, sin descargas, supply chain intacta.** Misma política que US-231a D7/D9: `Tokenizer.from_file(<ruta local>)`,
   `InferenceSession(<ruta local>)`, `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, bind mount `read_only` de `MODEL_HOST_DIR`. La
   lista prohibida estática se amplía a `app/infrastructure/nli`. **Sin dependencias nuevas**; `transformers` y `huggingface_hub`
   siguen sin importarse (el test de US-231a se extiende al nuevo paquete). El modelo NLI fp32 viene como ONNX exportado fuera
   del repo (ver Open Questions).
7. **Semilla con modelos reales.** `fabricar_embedder_real(ajustes)` pasa de lanzar `AdapterDeEmbeddingsNoDisponible` a
   verificar los pesos de embeddings con `verificar_modelo` y devolver `EmbedderDePasajesBgeM3` (US-231a). Con `MODEL_PROVIDER=fake` sigue sin
   haber embedder real (error explícito nombrando la variable). Se elimina `AdapterDeEmbeddingsNoDisponible` y su test.
   `TokenizadorPorPalabras` se sustituye en el cargador por `TokenizadorDeArchivo(EMBEDDING_TOKENIZER_PATH)`: `fragmentar()` cuenta
   **tokens** de BGE-M3, así `CORPUS_CHUNK_SIZE = 1024` y `CORPUS_CHUNK_OVERLAP` se leen como tokens (`[S1 resp. 38]`). El módulo
   `tokenizer/por_palabras.py` se conserva únicamente como fake de tests del cargador (mismo `Protocol`); no hay bifurcación de
   producción por proveedor dentro de `fragmentar()`.
8. **Composición del corpus en `main.py`.** Una función `crear_puertos_del_corpus(settings)` (módulo de composición bajo
   `app/infrastructure/corpus/`) construye `PuertosDelCorpus` con `MilvusRepository` (URI de `MilvusSettings`) y los lectores del
   schema `corpus` con el rol `rag_corpus` (`CorpusReleaseReader`, `CorpusCatalogReader`). `app/main.py` la invoca **solo**
   cuando `MODEL_PROVIDER=local` y `LLM_PROVIDER=local`; con `fake` no se importa Milvus ni SQLAlchemy de composición. Una
   conexión a Milvus o al catálogo que falle al construir termina el arranque nombrando la variable (`MILVUS_URI`, `CORPUS_DB_URL`
   o la que corresponda), sin eco de valores. Hasta que el corpus compone bien, la matriz de US-231a D6 se mantiene: `LLM=local`+`MODEL=fake`
   → `503` fail-closed.
9. **Corte previo a los pares del reranker (decisión 82).** `RETRIEVAL_TOP_K=30` (candidatos de Milvus) y `RERANKER_MAX_PAIRS=12`
   (ADR-39). El servicio de recuperación recorta, **antes** de llamar al `Reranker`, a los `RERANKER_MAX_PAIRS` mejores por
   puntaje de recuperación (desempate por `chunk_id` para ser determinista, IA-07). Función pura `recortar_a_pares_del_reranker()`
   en `app/domain/` y una etapa nombrada en `RAGOrchestratorService`. Se elimina `CandidatosSuperanLosParesDelReranker` del arranque
   (el exceso ya no es un error de configuración); `RerankerFalso(max_pairs=…)` y el adapter real siguen lanzando `FalloDeInferencia`
   si reciben más de 12 (LSP), pero el servicio nunca los supera. Ambos valores en configuración (RN-22). `RETRIEVAL_TOP_K <
   RERANKER_MAX_PAIRS` es válido (no hay nada que recortar).
10. **Mediciones.** Latencia NLI (AC-6): `3` corridas de los 3 pares de FX-06a-c en **un** lote, reloj inyectado, mediana ≤ 1500 ms.
    Memoria (AC-7): se cargan los tres modelos en un proceso de prueba y se lee el RSS máximo del proceso (`resource.getrusage`
    normalizado a MiB, o `psutil` si ya existe en `requirements`; **sin dependencia nueva**) tras inferir una vez con cada uno; ≤ 4489 MiB.
    Ambas con `@pytest.mark.models`, no son compuerta de CI; un exceso se reporta al refinamiento sin ajustar el presupuesto.
11. **Smoke (AC-9).** Tarea de infra, «test después»: contra el Compose de L1D-164 con el manifiesto real de la semilla y los pesos de
    `MODEL_HOST_DIR`, corre `python -m app.scripts.load_seed_corpus` y comprueba con `corpus` y Milvus reales documentos `embebido` +
    `is_current`, metadatos copiados del catálogo y `CorpusRelease` con `excluded_sources = ["NCCN","ESMO"]`; después envía `Q-HER2`
    a `/rag/query` (JWT de servicio de prueba) con `LLM_PROVIDER=fake` y `MODEL_PROVIDER=local` y comprueba `200` con chunks recuperados.
    Solo corpus público con licencia registrada (RN-21); sin datos de pacientes (RN-13).

## Privacidad y ownership

- **Fronteras:** sin nuevas. `rag-orchestrator` sigue accediendo solo al schema `corpus` (rol `rag_corpus`) y a Milvus; la
  composición de `main.py` usa esas credenciales y ninguna otra. El NLI recibe **solo** premisa (texto del corpus) e hipótesis;
  `clinicalContext`, `pseudoPatientId` y la identidad nunca entran al modelo (RN-10, RN-11). Una hipótesis puede contener un
  hecho verbalizado del paciente ya desidentificado (ADR-34); el adapter no la persiste ni la registra.
- **RN-12/RN-13:** modelos solo locales; sin cliente de nube ni HTTP en los paquetes de adapters (lista estática ampliada); sin
  *fallback*. Con `REAL_*_ENABLED=true`, `MODEL_PROVIDER=fake` sigue impidiendo el arranque (US-231a).
- **Logs:** nunca premisa, hipótesis, texto de chunk, rutas ni hashes de **verificación**. Se registran clase del error, etapa,
  `traceId`, versión del modelo (incluye el SHA-256 de procedencia, público) y latencias.
- **Datos:** FX-06a-c es sintético; el *smoke* usa el manifiesto de la semilla (corpus público con licencia aceptada). Los pesos
  no se versionan (RN-14, repositorio público); NCCN/ESMO solo como `excluded_sources`, nunca su contenido.
- **Aislamiento:** sin acceso a `clinical-minio` ni a schemas clínicos; sin credenciales nuevas; el rol `rag_corpus` conserva
  `REVOKE ALL` sobre los schemas clínicos (los tests de *permission denied* existentes no cambian).

## Contratos

Sin cambio en `apps/rag-orchestrator/openapi.yaml` ni en `contracts/examples/`: `meta.nliModel` ya es `string`, `NLI_UNAVAILABLE` y
su schema son de L1D-180. Las respuestas de `/rag/query` del *smoke* (AC-9) se validan contra el spec con el *helper* de L1D-164.
Sin regeneración de modelos Pydantic ni cliente TS. `ModeloNoVerificadoError` no tiene respuesta contractual (termina el proceso).

## Evaluación

No cambia modelo, prompt, umbral de calidad, catálogo ni corpus: ejecuta lo decidido en ADR-39 y carga la semilla ya existente.
No se lanza `ai-eval-runner`. Riesgo anotado: el corte previo a 12 pares (D9) y el *chunking* en tokens pueden mover
recall@10 respecto de la medición del ADR; la calidad con modelos reales la mide US-072/US-073 y el p95 conjunto, L1D-274.
**Presupuestos medidos aquí (NFR-01, ADR-39):** etapa NLI ≤ 1500 ms (mediana de 3, VM Docker ≥ 10 GB) y RSS conjunto ≤ 4489 MiB;
un valor fuera de presupuesto se **reporta** al refinamiento, no se oculta ni se ajusta el presupuesto.

## Dependencias y colaboradores

| Módulo | Nuevo/modifica | Depende de |
|---|---|---|
| `app/application/ports.py` | modifica | `NliClassifier`, `ParNli`, `ResultadoNli` (firma D7 de L1D-180) |
| `app/infrastructure/nli/mdeberta.py` | nuevo | `SesionDeInferencia`, `Tokenizador`, `describir_modelo`; error `FalloDeInferencia` |
| `app/infrastructure/models/local.py` | modifica | suma el NLI a `ARCHIVOS_A_VERIFICAR` y a los modelos cargados |
| `app/config/settings.py`, `app/config/modelos.py` | modifica | `NLI_MODEL_PATH`, `NLI_MODEL_SHA256`, `NLI_TOKENIZER_PATH`, `NLI_TOKENIZER_SHA256` |
| `app/scripts/load_seed_corpus.py` | modifica | `fabricar_embedder_real` real; tokenizer de BGE-M3 |
| `app/infrastructure/corpus/composicion.py` | nuevo | `MilvusRepository`, lectores del schema `corpus` |
| `app/main.py` / `app/bootstrap.py` | modifica | compone el corpus real solo con `MODEL_PROVIDER=local` + `LLM_PROVIDER=local` |
| `app/domain/` (`recortar_a_pares_del_reranker`) y `rag_orchestrator_service.py` | nuevo / modifica | decisión 82; elimina la negativa de arranque |
| `infra/docker/docker-compose.yml` | modifica | variables `NLI_*` del servicio `rag-orchestrator` |
| `tests/support/` | modifica | `NliFalso` mínimo, batería de contrato real/fake, sesión falsa del NLI, FX-06a-c con pares NLI |

## Risks / Trade-offs

- **Pesos reales no disponibles en la CI** → la CI usa sesión falsa y archivos temporales; `models` corre en la VM local y en el
  *smoke*. Una regresión del modelo real solo se ve fuera de la CI; se mitiga con la batería de contrato común.
- **RSS conjunto vs suma del ADR** (4489 MiB medidos por separado): el proceso único puede superar la suma por el *runtime*; se mide y reporta.
- **Latencia NLI en fp32** (mDeBERTa no se cuantiza, ADR-39): 1500 ms con 3 pares es holgado, pero L1D-180 enviará más pares por opción; la
  medición de p95 es de L1D-274.
- **Clasificación de FX-06a-c depende del modelo real** (3 pares): si el modelo da una clase distinta se reporta, no se ajusta el par para pasar.
- **Composición del corpus** abre conexiones al arrancar: un Milvus o PostgreSQL caído impide arrancar con `local`; es coherente con el fail-closed, pero hay que documentarlo en el runbook de Compose.
- **Tokenizer por tokens** cambia los límites de chunk frente a L1D-115 (provisional por palabras): la semilla se re-indexa en el *smoke*; los chunks anteriores quedan `is_current = false` (RN-05, el histórico no se borra).

## Migration Plan

Sin esquema que migrar. Los pesos del NLI se aprovisionan fuera del repo en `MODEL_HOST_DIR` con su SHA-256 en configuración. La re-carga de la semilla
con tokens es idempotente por `checksum`/versión (L1D-115). Rollback: `MODEL_PROVIDER=fake` o revertir el PR; los puertos y el contrato no cambian.

## Open Questions

- **Formato del NLI fp32** (ONNX exportado): se asume un único `.onnx` + `tokenizer.json`; si trae datos externos se añaden sus variables (ver Pendientes 2).
- **¿Un AC-10 `(asumido)` para la decisión 82 y la composición de `main.py`?** (ver Pendientes 1; requiere aprobación del usuario).
- **¿`psutil` ya está en `requirements`?** Si no, se usa `resource.getrusage` (sin dependencia nueva).
