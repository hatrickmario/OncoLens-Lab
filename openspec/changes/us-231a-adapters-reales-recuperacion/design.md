# Design — us-231a-adapters-reales-recuperacion

## Context

Ver `proposal.md` (Why). Estado de partida (`main`): L1D-106 dejó en `app/application/ports.py` los puertos
`QueryEmbedder` (`modelo`, `embeber(texto)`), `Reranker` (`version`, `puntuar(pregunta, candidatos)` con puntaje
en [0,1], nunca `None`) y `LanguageDetector` (`detectar(texto) -> Idioma`), con fakes de recuperación **solo en `tests/support/`**
(en `app/infrastructure/fake/` viven únicamente `FakeEvidenceQuery` y `FakeLlmHealth`); L1D-115 dejó `PassageEmbedder` en `app/application/seed_corpus/ports.py`. El
`bootstrap` con `LLM_PROVIDER=local` responde `503 RETRIEVAL_UNAVAILABLE` (etapa `composicion`) mientras falten
estos adapters (D4 de L1D-106). ADR-39 fase A (aceptada, decisión 73) fija BGE-M3 int8, bge-reranker-v2-m3 int8,
`RERANKER_MAX_PAIRS` = 12, `RERANKER_MAX_LENGTH` = 512, chunks de 1024 tokens, CPU/ONNX Runtime. Esta historia
construye los adapters reales; **no** cambia puertos, servicio, contrato ni modelos.

## Goals / Non-Goals

**Goals:** adapters reales intercambiables con los fakes (LSP); verificación de pesos al arrancar reutilizable
por US-231b; cero red en ejecución; resultados deterministas; latencia por etapa medida.
**Non-Goals:** ver `proposal.md` (NLI, LLM/OCR, híbrida/*sparse* en búsqueda, cambio de modelos).

## Decisions

1. **Un adapter por modelo, hexagonal.** `app/infrastructure/embeddings/bge_m3.py`, `reranker/bge_reranker.py`,
   `language/detector_local.py`. El de *embeddings* implementa **dos** puertos (consulta y pasaje) con una sola
   sesión de modelo, diferenciando el prefijo (pregunta vs pasaje). `application/` y `domain/` no importan
   `onnxruntime`, `tokenizers` ni el detector: solo `bootstrap.py` los conoce. **No se inlinean adapters ni puertos.**
2. **Borde de inferencia inyectable.** Cada adapter recibe una `SesionDeInferencia` (Protocol mínimo en
   `app/infrastructure/models/`: tokens → tensores de salida). El runtime real (ONNX Runtime) la implementa; en
   la CI los tests del adapter usan una sesión falsa determinista para cubrir tokenización, prefijos,
   truncado, *batching*, normalización del puntaje y traducción de errores, sin pesos. Los pesos reales solo
   corren en tests `@pytest.mark.models`.
3. **Normalización del puntaje en el adapter, validada en dominio.** El *reranker* aplica sigmoide al logit
   (ADR-8) y devuelve [0,1]; el dominio ya rechaza fuera de rango (`validar_puntaje_normalizado`, L1D-106). El
   adapter nunca devuelve `None` ni `0.0` por defecto: ante un fallo lanza el error del puerto (RN-02).
4. **Verificación común de modelos (`app/infrastructure/models/verificacion.py`).** `verificar_modelo(variable_ruta,
   variable_sha, ruta, sha_esperado)` calcula el SHA-256 por bloques y lanza `ModeloNoVerificadoError(variable=…)`.
   El mensaje contiene **solo el nombre de la variable** (p. ej. `RERANKER_MODEL_PATH`, `RERANKER_MODEL_SHA256`),
   nunca la ruta, el hash esperado ni el calculado. Se lanza con `raise ModeloNoVerificadoError(variable) from None`,
   sin registrar ruta, hashes ni `exc_info`. Se verifica el SHA-256 de **cada archivo que se carga** (modelo ONNX,
   `tokenizer.json`, datos externos del ONNX), con una clave `*_SHA256` por archivo en el entorno (no un manifiesto
   autoatestiguado). Se invoca al construir la app (antes de aceptar tráfico); el
   arranque termina con código ≠ 0. El cálculo del hash se prueba sin disco real (lector inyectado). US-231b la
   reutiliza para el NLI.
5. **Procedencia del *reranker* en `meta.rerankerModel`.** `Reranker.version` devuelve una cadena fija
   `"<RERANKER_MODEL>@<RERANKER_MODEL_REVISION>#sha256:<RERANKER_MODEL_SHA256>"` construida por una función pura
   (`describir_modelo`) desde la configuración (no desde el texto generado ni releyendo el archivo por petición).
   El SHA-256 de **procedencia** es un identificador público del peso y SÍ puede ir en `meta` y en logs; lo que
   nunca se emite es la ruta ni el hash **esperado** o **calculado** de un fallo de verificación (D4). Sin
   cambio de contrato: el campo ya es `string`.
6. **Matriz de proveedores (RN-12, RN-13).** `MODEL_PROVIDER` es un enum **estricto** `fake|local`; cualquier otro
   valor (incluido vacío) impide arrancar y el error nombra la variable (nada de "distinto de `fake` ⇒ real").
   Default **por decisión**: `local` en Compose, `fake` en la CI (a confirmar por el usuario). No existe proveedor
   de nube. Matriz con `LLM_PROVIDER`:

   | `LLM_PROVIDER` | `MODEL_PROVIDER` | Resultado |
   |---|---|---|
   | `fake` | `fake` | arranca; sin runtime de modelos (CI, E2E) |
   | `fake` | `local` | arranca; adapters reales de recuperación y verificación de modelos |
   | `local` | `local` | producción: todo local |
   | `local` | `fake` | **fail-closed**: `/rag/query` responde `503 RETRIEVAL_UNAVAILABLE` (etapa `composicion`, `bootstrap.py`), nunca recupera con fakes; los fakes de recuperación viven solo en `tests/support/` |

   `reject_fake_provider_with_real_data` (`domain/reglas_proveedor.py`) se extiende: con `REAL_*_ENABLED=true`
   rechaza también `MODEL_PROVIDER=fake`, nombrando la variable. Con `fake` no se importa ningún runtime.
7. **Sin red y sin descargas; pesos fuera del repo y de la imagen.** En `main` el servicio `rag-orchestrator` de
   `docker-compose.yml` **no** monta `/models`. Este change añade un *bind mount* `read_only` desde un directorio
   del host fuera del repo hacia `MODEL_CACHE_DIR`; el Compose pasa `MODEL_PROVIDER`, `*_MODEL_PATH`,
   `*_MODEL_SHA256`, `HF_HUB_OFFLINE=1` y `TRANSFORMERS_OFFLINE=1`; los directorios de modelos se excluyen en
   `.gitignore` y en el `.dockerignore` del Dockerfile (nunca `COPY` de pesos). Los adapters cargan solo con
   `Tokenizer.from_file(<ruta local>)` y `onnxruntime.InferenceSession(<ruta local>)`. El test del AC-8 bloquea
   sockets y registra intentos; además un chequeo estático con **lista explícita prohibida** sobre
   `app/infrastructure/{embeddings,reranker,language,models}`: `huggingface_hub`, `transformers`, `requests`,
   `httpx`, `urllib.request`, `socket`, SDK de nube, `from_pretrained`, `hf_hub_download`.
8. **Determinismo.** Mismos pares y misma configuración ⇒ mismo puntaje en procesos distintos: hilos de ONNX
   fijados por configuración (`intra_op_num_threads`), sin muestreo ni semilla variable, orden de *batch* estable.
   Reloj inyectado para las mediciones de latencia.
9. **Supply chain de dependencias de inferencia.** Licencia permisiva de la librería (MIT/BSD/Apache; la licencia
   académica aplica a los **pesos**), versión exacta (`==`), solo *wheel* (`--only-binary`), sin `setup.py` ni
   descarga en importación o primer uso, `pip-audit` sin hallazgos críticos ni altos. La justificación de cada
   dependencia se escribe en este `design.md` antes de añadirla. `huggingface_hub` y `transformers` quedan
   prohibidos en el `requirements.txt` de ejecución (solo `requirements-eval.txt`).
   **Detector de idioma local y determinista.** Restringido a `es`/`en`, sin red y sin estado aleatorio. La
   elección de librería (o de heurística de palabras funcionales) no está fijada por el ADR-39 (Open Questions);
   cualquiera debe pasar la batería (AC-4, AC-5, AC-6, AC-8) y registrar su licencia.
10. **Errores.** Todo fallo de inferencia (archivo corrupto, tokenizer, tensor inesperado) se traduce en el error
    del puerto que el servicio ya convierte en `503 RETRIEVAL_UNAVAILABLE`; el mensaje y los *logs* nunca incluyen
    texto de la pregunta, del chunk ni el contenido de la configuración.

## Privacidad y ownership

- **Fronteras:** `rag-orchestrator` sigue sin acceso a datos clínicos; estos adapters reciben solo texto ya
  desidentificado (pregunta y resumen del contexto) y texto de chunks del corpus público. `pseudoPatientId`
  nunca entra a un modelo (RN-11, ya garantizado por L1D-106).
- **RN-12:** modelos solo locales; sin *fallback* a nube; ningún import de clientes de nube ni HTTP; la batería
  lo comprueba (AC-8). Con datos reales no hay otra ruta.
- **Logs:** nunca `query`, texto del contexto, texto de chunks, rutas ni hashes de configuración. Se registran
  clase del error, etapa, `traceId`, versión del modelo y latencias.
- **Datos:** FX-06a-c es sintético (textos redactados para el test, sin pacientes). Los pesos no se versionan
  (RN-14: repositorio público); licencias académicas registradas (`ACADEMIC_LICENSES`, ADR-39).
- **Aislamiento:** sin acceso a `clinical-minio` ni a schemas clínicos; sin credenciales nuevas.

## Contratos

Sin cambio en `apps/rag-orchestrator/openapi.yaml` ni en `contracts/examples/`. `meta.rerankerModel` y
`meta.embeddingModel` ya son `string`; esta historia solo define el contenido del primero (D5). Las respuestas de
`/rag/query` con adapters reales cableados se validan contra el spec con el *helper* de L1D-164 (AC-3). Sin
regeneración de modelos Pydantic ni cliente TS. `ModeloNoVerificadoError` no es un error HTTP: termina el
proceso y no tiene respuesta contractual.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: ejecuta la decisión de ADR-39. No se lanza `ai-eval-runner`
por este change; la calidad con modelos reales (recall@10, MRR) la mide US-072/US-073 y el p95 conjunto, L1D-274.
**Latencia (AC-9, NFR-01):** *embeddings* ≤ 500 ms y *reranker* (12 pares) ≤ 4500 ms, mediana de 3 corridas en la
VM de Docker ≥ 10 GB; un valor fuera de presupuesto se **reporta** al refinamiento (no se oculta ni se ajusta el
presupuesto). Es una medición local (`models`), no una compuerta de la CI.

## Dependencias y colaboradores

| Módulo | Nuevo/modifica | Depende de |
|---|---|---|
| `app/infrastructure/models/verificacion.py` | nuevo | solo stdlib (`hashlib`); `ModeloNoVerificadoError(variable)` |
| `app/infrastructure/models/sesion.py` | nuevo | Protocol `SesionDeInferencia`; implementación ONNX en el mismo paquete |
| `app/infrastructure/embeddings/bge_m3.py` | nuevo | implementa `QueryEmbedder` y `PassageEmbedder`; `SesionDeInferencia`, tokenizer |
| `app/infrastructure/reranker/bge_reranker.py` | nuevo | implementa `Reranker`; `SesionDeInferencia`, tokenizer |
| `app/infrastructure/language/detector_local.py` | nuevo | implementa `LanguageDetector` |
| `app/config/modelos.py` / `settings.py` | modifica | rutas y SHA-256 (`*_MODEL_PATH`, `*_MODEL_SHA256`), selector de proveedor |
| `infra/docker/docker-compose.yml`, `.gitignore`, `.dockerignore` | modifica | bind mount `read_only`, variables de entorno, exclusión de modelos |
| `app/domain/reglas_proveedor.py` | modifica | extiende `reject_fake_provider_with_real_data` a `MODEL_PROVIDER` |
| `app/bootstrap.py` | modifica | cablea los adapters reales si el proveedor no es `fake`; verifica modelos antes de servir |
| `tests/support/` | modifica | batería de contrato parametrizada real/fake; sesión de inferencia falsa; FX-06a-c |

## Risks / Trade-offs

- **Pesos reales no disponibles en la CI** (GB de descarga, licencias, tiempo) → la CI corre con la sesión
  falsa y con archivos temporales para la verificación de modelos; los tests `@pytest.mark.models` corren en la
  VM local y en el *smoke* de Compose. Riesgo: una regresión del modelo real solo se ve fuera de la CI; se
  mitiga con la batería de contrato común y el reporte de la medición.
- **Tamaño y memoria** de los pesos int8 (BGE-M3 + reranker + NLI) frente al presupuesto (stack ≤ ~30 GB, LLM
  ≤ 21 GB): la memoria conjunta con el NLI se mide en US-231b; aquí se reporta la de los dos modelos.
- **Latencia** del *reranker* (≈ 4,5 s de presupuesto) deja poco margen frente al NFR de 15 s: se mide y se
  reporta.
- **Divergencia real/fake:** mitigada con una única batería parametrizada; los fakes cumplen LSP (`None` ≠ `0.0`).
- **Detector de idioma:** textos cortos o mixtos pueden clasificarse mal.

## Migration Plan

Sin datos ni esquema que migrar. Los pesos se aprovisionan fuera del repo (volumen de solo lectura, con su
SHA-256 en configuración). Rollback: proveedor de modelos en `fake` o revertir el PR; puertos y L1D-106 no cambian.

## Open Questions

- **Nombre del selector:** la historia habla de `MODEL_PROVIDER`; hoy solo existe `LLM_PROVIDER` (`fake|local`),
  que gobierna el LLM y el `bootstrap`. Propuesta: clave nueva `MODEL_PROVIDER` (`fake|local`) para los modelos
  de recuperación y NLI, dejando `LLM_PROVIDER` intacto. Decisión por defecto, **a confirmar por el usuario**: enum estricto `fake|local`.
- **Librería del detector de idioma** (no fijada por ADR-39): una local, determinista y de licencia permisiva;
  decidir en la primera tarea antes de añadir la dependencia.
- **Idioma indeterminado u otro distinto de `es`/`en`:** el puerto devuelve `Idioma`; se usa `es` vía configuración
  (`DEFAULT_QUERY_LANGUAGE`, RN-22), no un literal en el adapter (decisión por defecto, **a confirmar por el usuario**).
- **Fuente de los SHA-256:** claves de entorno (`EMBEDDING_MODEL_SHA256`, `RERANKER_MODEL_SHA256`) frente a un
  manifiesto en `MODEL_CACHE_DIR`; decisión por defecto, **a confirmar por el usuario**: una clave de entorno por archivo (RN-22).
