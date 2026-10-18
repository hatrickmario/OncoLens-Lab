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
2. **Probabilidades que suman 1.** El adapter aplica *softmax* a los tres logits del modelo y mapea los índices de clase con una
   **configuración versionada** (RN-22): `NLI_LABEL_INDEX_ENTAILMENT`, `NLI_LABEL_INDEX_NEUTRAL`, `NLI_LABEL_INDEX_CONTRADICTION`
   (valores del ADR-39 para la revisión fijada), validados al arrancar (tres enteros distintos, dentro de [0, 2], salida del modelo de 3 clases). **Nunca**
   se lee `config.json` ni `id2label` de un archivo sin verificar: un mapeo alterado que intercambie `entailment` y `contradiction` invertiría el soporte
   (RN-01). **A confirmar por el usuario** frente a la alternativa de verificar `config.json` (`NLI_CONFIG_PATH`/`NLI_CONFIG_SHA256` en
   `ARCHIVOS_A_VERIFICAR`); la prueba de AC-1 sobre los pares reales de FX-06a-c detecta además un mapeo invertido. Las tres probabilidades (`p_entailment`, `p_neutral`,
   `p_contradiction`) suman 1 (tolerancia numérica); `ResultadoNli` expone `label` (argmax) y `p_entailment`; la batería de
   AC-1 comprueba la suma sobre la salida de la sesión. Nunca devuelve `None` ni un `label` por defecto: ante un fallo
   lanza el error del puerto.
3. **Error del puerto.** Todo fallo de inferencia (archivo corrupto, tokenizer, tensor inesperado) se traduce en
   `FalloDeInferencia` (el error del puerto que ya existe en `app/application/ports.py`), sin texto de premisa ni hipótesis en el
   mensaje ni en los logs. Se reutiliza `fallos_de_inferencia_como_error_del_puerto` (`app/infrastructure/models/fallos.py`), con un
   test que exige `__cause__ is None` en el error (la excepción original puede traer texto de la premisa o de la hipótesis).
   L1D-180 captura ese tipo y responde `503 NLI_UNAVAILABLE`; aquí no hay respuesta HTTP nueva.
4. **Verificación de modelos reutilizada, no reescrita.** `ARCHIVOS_A_VERIFICAR` suma `("NLI_MODEL_PATH","NLI_MODEL_SHA256")` y
   `("NLI_TOKENIZER_PATH","NLI_TOKENIZER_SHA256")` (SHA-256 por archivo cargado, RN-22). Mismo contrato: `raise
   ModeloNoVerificadoError(variable) from None`; stdout y stderr completos sin ruta ni hashes (esperado ni calculado); el AC-4
   arranca en **subproceso**. `cargar_modelos_locales` construye también el NLI y `ModelosDeRecuperacion` pasa a llevar
   `clasificador_nli` (o un contenedor `ModelosLocales` si el cambio de nombre lo evita; se decide en la tarea de refactor).
   Con `MODEL_PROVIDER=fake` no se verifica ni se importa ningún runtime. **Datos externos del ONNX:** ver D12. **Nada que
   identifique el modelo (versión, SHA-256 de procedencia) se registra ni se expone hasta que TODOS sus archivos están verificados.**
5. **Procedencia (`meta.nliModel`).** `describir_modelo()` de US-231a produce `"<NLI_MODEL>@<NLI_MODEL_REVISION>#sha256:<NLI_MODEL_SHA256>"`
   desde la configuración (no desde el texto generado ni releyendo el archivo). El SHA-256 de **procedencia** es un identificador
   público del peso y puede ir en `meta` y logs; nunca la ruta ni el hash esperado/calculado de un fallo (D4). La **lectura**
   de ese valor es una propiedad del adapter (`version`); que `meta.nliModel` salga en la respuesta HTTP lo cablea L1D-180.
6. **Sin red, sin descargas, supply chain intacta.** Misma política que US-231a D7/D9: `Tokenizer.from_file(<ruta local>)`,
   `InferenceSession(<ruta local>)`, `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, bind mount `read_only` de `MODEL_HOST_DIR`. La
   lista prohibida estática se amplía a `app/infrastructure/nli`. **Sin dependencias nuevas**; `transformers` y `huggingface_hub`
   siguen sin importarse (el test de US-231a se extiende al nuevo paquete). El modelo NLI fp32 viene como ONNX exportado fuera
   del repo (ver D12 y Open Questions). RN-14: se añade `**/*.onnx.data` a `.gitignore`, `.dockerignore` raíz y
   `apps/rag-orchestrator/Dockerfile.dockerignore` (`torch.onnx.export` y `quantize_dynamic` nombran así los datos externos; los
   patrones actuales cubren solo `**/*.onnx_data`), con su caso en `infra/docker/__tests__/dockerignore.test.mjs`. El tokenizer del NLI usa
   `[PAD]` y `TokenizadorDeArchivo` exige `<pad>`: el token de relleno se lee del `pad_token` del propio `tokenizer.json` (verificado).
7. **Semilla con modelos reales.** `fabricar_embedder_real(ajustes)` pasa de lanzar `AdapterDeEmbeddingsNoDisponible` a
   verificar con `verificar_modelos_locales` **todos** los archivos que el cargador abre (al menos los pares `EMBEDDING_MODEL_*` y
   `EMBEDDING_TOKENIZER_*`, porque el cargador crea `TokenizadorDeArchivo(EMBEDDING_TOKENIZER_PATH)` y la sesión de pasajes), construyendo con
   `_construir` (`from None`), y devolver `EmbedderDePasajesBgeM3` (US-231a). La rama `except` explícita de `main()` del cargador suma
   `ModeloNoVerificadoError` (su `str` es solo el nombre de la variable; el resto de excepciones sigue informando solo la clase). Con `MODEL_PROVIDER=fake` sigue sin
   haber embedder real (error explícito nombrando la variable). Se elimina `AdapterDeEmbeddingsNoDisponible` y su test.
   `TokenizadorPorPalabras` se sustituye en el cargador por `TokenizadorDeArchivo(EMBEDDING_TOKENIZER_PATH)`: `fragmentar()` cuenta
   **tokens** de BGE-M3, así `CORPUS_CHUNK_SIZE = 1024` y `CORPUS_CHUNK_OVERLAP` se leen como tokens (`[S1 resp. 38]`). El módulo
   `tokenizer/por_palabras.py` se conserva únicamente como fake de tests del cargador (mismo `Protocol`); no hay bifurcación de
   producción por proveedor dentro de `fragmentar()`.
8. **Composición del corpus en `main.py`.** Una función `crear_puertos_del_corpus(settings)` (módulo de composición bajo
   `app/infrastructure/corpus/`) construye `PuertosDelCorpus` con `MilvusRepository` (URI de `MilvusSettings`) y los lectores del
   schema `corpus` con el rol `rag_corpus` (`CorpusReleaseReader`, `CorpusCatalogReader`). `app/main.py` la invoca **solo**
   cuando `MODEL_PROVIDER=local` y `LLM_PROVIDER=local` (**o también con `LLM_PROVIDER=fake` + `MODEL_PROVIDER=local` si el usuario elige la
   opción (b) del smoke**, Open Questions; hoy `bootstrap.py:175` solo usa la recuperación real con `LLM=local`); con `fake` no se importa Milvus
   ni SQLAlchemy de composición. La URL del catálogo se compone **reutilizando `CorpusDatabaseSettings` y `componer_url`** (usuario
   `rag_corpus`, URL sin contraseña en `CORPUS_DATABASE_URL`, contraseña desde archivo de secreto, `sslmode=require`); no se inventa otra ruta de
   conexión. **Sonda explícita al arrancar** (`create_engine` no conecta al construirse): `SELECT 1` con `rag_corpus` y `has_collection` en
   Milvus, cada una envuelta con `raise ... from None`. Si Milvus o el catálogo no responden, el proceso termina con código ≠ 0 nombrando
   `MILVUS_URI` o `CORPUS_DATABASE_URL`, **sin URI, host, puerto ni DSN** en stdout/stderr (el AC lo prueba en subproceso) y **sin recurrir a un corpus
   falso**. Se documenta en el runbook de Compose (tarea 1.10b). La matriz de US-231a D6 se mantiene: `LLM=local`+`MODEL=fake` → `503` fail-closed.
9. **Corte previo a los pares del reranker (decisión 82).** `RETRIEVAL_TOP_K=30` (candidatos de Milvus) y `RERANKER_MAX_PAIRS=12`
   (ADR-39). El servicio de recuperación recorta, **antes** de llamar al `Reranker`, a los `RERANKER_MAX_PAIRS` mejores por
   puntaje de recuperación (desempate por `chunk_id` para ser determinista, IA-07). Función pura `recortar_a_pares_del_reranker()`
   en `app/domain/` y una etapa nombrada en `RAGOrchestratorService`. Se elimina `CandidatosSuperanLosParesDelReranker` del arranque
   (el exceso ya no es un error de configuración); `RerankerFalso(max_pairs=…)` y el adapter real siguen lanzando `FalloDeInferencia`
   si reciben más de 12 (LSP), pero el servicio nunca los supera. Ambos valores en configuración (RN-22). `RETRIEVAL_TOP_K <
   RERANKER_MAX_PAIRS` es válido (no hay nada que recortar). La etapa de corte registra **solo recuentos** (candidatos recibidos, descartados,
   enviados al *reranker*; nunca ids ni texto). Los tests «13 pares → `FalloDeInferencia`» del adapter real y del fake **se quedan**; solo se
   retira el primer test de `test_coherencia_de_candidatos.py` (el de 12/12 sigue). El valor por defecto de Compose pasa de `RETRIEVAL_TOP_K=40`
   a `30` (con la actualización de `compose-config.test.mjs`, línea 122).
10. **Mediciones.** Latencia NLI (AC-6): `3` corridas de los 3 pares de FX-06a-c en **un** lote, reloj inyectado, mediana ≤ 1500 ms.
    Memoria (AC-7): se cargan los tres modelos en un proceso de prueba y se lee el RSS máximo del proceso (`resource.getrusage`
    normalizado a MiB, o `psutil` si ya existe en `requirements`; **sin dependencia nueva**) tras inferir una vez con cada uno; ≤ 4489 MiB.
    Se documenta también el **pico de RSS durante la carga** (D12: los bytes ya hasheados se mantienen en memoria hasta crear la sesión) frente al
    RSS en régimen; si el pico de carga supera el presupuesto se reporta (la liberación de los bytes tras crear la sesión es parte del diseño).
    Ambas con `@pytest.mark.models`, no son compuerta de CI; un exceso se reporta al refinamiento sin ajustar el presupuesto.
11. **Smoke (AC-9).** Tarea de infra, «test después»: contra el Compose de L1D-164 con el manifiesto real de la semilla y los pesos de
    `MODEL_HOST_DIR`, corre `python -m app.scripts.load_seed_corpus` y comprueba con `corpus` y Milvus reales documentos `embebido` +
    `is_current`, metadatos copiados del catálogo y `CorpusRelease` con `excluded_sources = ["NCCN","ESMO"]`; después envía `Q-HER2`
    a `/rag/query` (JWT de servicio de prueba) con `LLM_PROVIDER=fake` y `MODEL_PROVIDER=local` y comprueba `200` con chunks recuperados.
    Solo corpus público con licencia registrada (RN-21); sin datos de pacientes (RN-13). **La matriz del smoke (LLM=local vs fake, o recuperación
    bajo el endpoint) está pendiente de decisión del usuario** (Open Questions): con (a) `200 sin_evidencia` o `503` y aserciones sobre el espía del
    *reranker* y los logs; con (b) `200` completo; con (c) la recuperación se prueba por debajo del endpoint.
12. **Datos externos del ONNX: requisito verificado.** `torch.onnx.export` y `quantize_dynamic` pueden dejar `<modelo>.onnx.data` junto al
    `.onnx`; ONNX Runtime lo carga **desde la ruta**, fuera del SHA-256. Mecanismo: la sesión se crea **desde los bytes ya hasheados** del `.onnx`
    (`InferenceSession(bytes)`), de modo que se carga exactamente lo verificado y un `.data` no declarado **falla cerrado** (la sesión no puede
    resolver la referencia externa y el adaptador lo traduce al error de arranque nombrando `NLI_MODEL_DATA_PATH`). Si el modelo realmente
    trae datos externos, se exige el par `NLI_MODEL_DATA_PATH` / `NLI_MODEL_DATA_SHA256` en `ARCHIVOS_A_VERIFICAR`. **Origen por defecto:
    reexportar el fp32 en un solo archivo** (a confirmar por el usuario). **Tarea previa:** inspeccionar `MODEL_HOST_DIR` (`ls`) y comprobar si
    los modelos de embeddings y reranker de US-231a (cuantizados) tienen un `model.onnx.data` sin verificar: si existe, es **deuda de
    US-231a** y se corrige aquí con el mismo mecanismo (par de variables o sesión desde bytes) y se informa al orquestador.

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

Preguntas para el usuario (no se deciden en el change; con el valor por defecto con que se redactaron los artefactos):

1. **Origen del ONNX fp32 del NLI:** reexportarlo en un solo archivo (por defecto) o aceptar `*.onnx.data` con `NLI_MODEL_DATA_PATH`/`_SHA256` (D12).
2. **Mapeo de clases del NLI:** índices en configuración versionada validada (por defecto, D2) o `NLI_CONFIG_PATH`/`NLI_CONFIG_SHA256` verificando `config.json`.
3. **Matriz del smoke de `/rag/query` (AC-9):** (a) `LLM=local` aceptando `200 sin_evidencia` o `503` con aserciones sobre el espía del *reranker* y los
   logs; (b) componer el corpus también con `LLM=fake` + `MODEL=local` cambiando `bootstrap.py:175`; (c) probar la recuperación por debajo del
   endpoint. **Recomendación: (b)**; los escenarios están redactados para (b).
4. **¿Un AC-10 `(asumido)` para la decisión 82 y la composición de `main.py`?** (ver Pendientes 1; requiere aprobación del usuario).
- **¿`psutil` ya está en `requirements`?** Si no, se usa `resource.getrusage` (sin dependencia nueva).
