# Tasks — us-231b-adapter-nli-smoke-semilla

> Matriz TDD (CLAUDE.md): adapter NLI con lógica (softmax, mapeo de clases, lote vacío, traducción de errores), verificación de
> modelos, `fabricar_embedder_real`, chunking en tokens y corte previo a 12 pares → **TDD estricto, doble bucle** (commit
> `test(US-231b)` con el test de aceptación del AC en rojo antes de su `feat(US-231b)`); configuración, Compose y cableado de
> `main.py` → **test después**; el *smoke* (AC-9) y las mediciones → **test después** contra Compose / VM local.
> Mocks solo en los bordes: sesión de inferencia (ONNX), disco para el hash, red, Milvus y PostgreSQL en su puerto cuando la CI
> no los tenga. Los fakes cumplen el contrato del puerto (`None` ≠ `0.0`, mismos errores). Reloj inyectado.
> Nunca `.skip`, `skipif` ni `xfail`: los tests `@pytest.mark.models` se **excluyen de la ruta rápida por marcador** y corren
> en la VM local y en el *smoke* de Compose.
> Secuencia de commits: `test` → `feat` → `refactor`, alcance `US-231b` (sin `L1D-nn`; renombrar cuando exista el issue).
> Sin tarea `## contratos`: el spec no cambia.

## 1. ai-services

- [ ] 1.0 (previa, sin código) Inspeccionar `MODEL_HOST_DIR` (`ls`): ¿los modelos de embeddings y reranker de US-231a traen un `model.onnx.data`
  sin verificar (cuantizados con `use_external_data_format=True`)? Si existe es deuda de US-231a: se corrige en la tarea 1.6 con el mismo
  mecanismo (D12) y se informa al orquestador. Confirmar con el usuario el origen del ONNX fp32 del NLI (por defecto, reexportar en un solo archivo).
- [ ] 1.1 (test después) Configuración (RN-22): `NLI_MODEL_PATH`, `NLI_MODEL_SHA256`, `NLI_TOKENIZER_PATH`, `NLI_TOKENIZER_SHA256`,
  `NLI_LABEL_INDEX_ENTAILMENT`/`_NEUTRAL`/`_CONTRADICTION` (validados al arrancar) y, si el modelo trae datos externos,
  `NLI_MODEL_DATA_PATH`/`NLI_MODEL_DATA_SHA256`, en `app/config/` y en el `environment` de `rag-orchestrator` en
  `infra/docker/docker-compose.yml`, junto con `CORPUS_DATABASE_URL` y `MILVUS_URI` y el cambio del valor por defecto `RETRIEVAL_TOP_K` 40 → 30
  (con su test en `compose-config.test.mjs`, línea 122); `.env.example` lo aplica el humano: el agente solo reporta las claves.
  Sin dependencias nuevas; el test de US-231a «`transformers`/`huggingface_hub` no se importan» cubre `app/infrastructure/nli`.
- [ ] 1.1b (test después, RN-14) Añadir `**/*.onnx.data` a `.gitignore`, `.dockerignore` raíz y `apps/rag-orchestrator/Dockerfile.dockerignore`,
  añadiendo `**/*.onnx.data` al array de `infra/docker/__tests__/compose-modelos.test.mjs` (línea 80; cubre `.gitignore` y los dos dockerignore).
  Registrar también el origen versionado de los índices `NLI_LABEL_INDEX_*` (adenda al ADR-39 o model card de la revisión fijada; el ADR no
  los fija) y, si se añaden al bloque del ADR, actualizar el recuento de 25 de `clavesDeAdr39()` (`compose-modelos.test.mjs:73`).
- [ ] 1.2 (TDD estricto) Test de aceptación en rojo: «devuelve su clase esperada con probabilidades que suman 1 para los tres
  pares de FX-06a-c en un lote [US-231b AC-1]» · `@pytest.mark.models` + `@pytest.mark.ac("US-231b", 1)`, y su versión con sesión
  falsa en la ruta rápida. Esqueletos: `NliClassifier`/`ParNli`/`ResultadoNli` en `app/application/ports.py` y
  `ClasificadorNliMdeberta` (`NotImplementedError`). Commit `test(US-231b)`.
- [ ] 1.3 (TDD estricto) Verde de 1.2: unitarios uno a la vez de `app/infrastructure/nli/mdeberta.py` (lote vacío → `[]` sin
  invocar la sesión; softmax y suma 1; mapeo por los índices de configuración, nunca por `config.json`/`id2label` (D2); `label` por argmax;
  `p_entailment`; orden del lote; token de relleno leído del `pad_token` del `tokenizer.json`). Commit `feat(US-231b)`.
- [ ] 1.4 (TDD estricto) Test de aceptación en rojo: «la metainformación del NLI contiene modelo, versión y hash de la configuración
  [US-231b AC-2]». Verde: `describir_modelo()` reutilizada y propiedad `version` del adapter. Commits `test(US-231b)` / `feat(US-231b)`.
- [ ] 1.5 (TDD estricto) Test de aceptación en rojo: batería de contrato «misma firma, nunca `None`, `label` válido, mismo error ante
  fallo [US-231b AC-3]» parametrizada sobre real (sesión falsa en la ruta rápida; modelo real con `models`) y `NliFalso` mínimo de
  `tests/support/` (L1D-180 lo completa con FX-06a-b). Verde: traducción de excepciones de inferencia a `FalloDeInferencia` con
  `fallos_de_inferencia_como_error_del_puerto`, sin premisa ni hipótesis en el mensaje y con un test `__cause__ is None`. Commits `test(US-231b)` / `feat(US-231b)`.
- [ ] 1.6 (TDD estricto) Test de aceptación en rojo, en **subproceso**: «termina nombrando la variable cuando el SHA-256 del NLI no
  coincide o el archivo falta [US-231b AC-4]» (stdout+stderr completos: código ≠ 0, nombre de la variable, sin ruta ni hashes).
  Escenarios adicionales en subproceso: mapeo de clases inválido, y modelo con datos externos sin su par verificado (D12, nombra
  `NLI_MODEL_DATA_PATH`). Verde: `ARCHIVOS_A_VERIFICAR` suma los pares del NLI; `cargar_modelos_locales` lo construye con `_construir`
  (`from None`) y crea la sesión **desde los bytes ya hasheados**; la versión y el SHA-256 de procedencia se registran solo DESPUÉS de verificar
  todos los archivos; si 1.0 halla `.onnx.data` en embeddings/reranker, se corrige igual. Documentar el pico de RSS durante la carga. Con
  `fake` no se verifica. Commits `test(US-231b)` / `feat(US-231b)`.
- [ ] 1.7 (TDD estricto) Test de aceptación en rojo: «responde con la red bloqueada y sin conexiones salientes [US-231b AC-5]»
  (fixture de bloqueo de sockets; `models`) más el chequeo estático con la lista prohibida de US-231a D7 extendido a
  `app/infrastructure/nli` y la exigencia de `Tokenizer.from_file(<ruta local>)`/`InferenceSession(<bytes leídos de la ruta verificada>)` (D12), en la ruta rápida. Esto
  modifica `test_adapters_sin_red.py:140` de US-231a (hoy `== str(ruta)`): commit con `Test-Removal: la sesión de ONNX pasa a crearse desde bytes
  verificados (D12); cambia el AC-8 de US-231a`, aplicado al NLI y, junto con la deuda de 1.0, a embeddings y reranker.
  Commits `test(US-231b)` / `feat(US-231b)`.
- [ ] 1.8 (TDD estricto) Test de aceptación en rojo: «ch-largo-1 se trocea en ≥ 2 chunks de ≤ 1024 tokens de BGE-M3 [US-231b AC-8]»
  (`models`, con tokenizer real) y su versión con tokenizer de archivo falso en la ruta rápida; más «`fabricar_embedder_real` devuelve
  el adapter real y con `fake` falla nombrando la variable». Esqueleto de la sustitución. Commit `test(US-231b)`. Verde, unitarios uno a
  la vez: `fabricar_embedder_real` con `verificar_modelos_locales` (al menos los pares `EMBEDDING_*`, construyendo con `_construir`, `from None`)
  + `EmbedderDePasajesBgeM3`; `TokenizadorDeArchivo` en el cargador; `ModeloNoVerificadoError` en la rama `except` explícita de `main()` del
  cargador (subproceso: tokenizer alterado → código ≠ 0, nombra `EMBEDDING_TOKENIZER_SHA256`, sin ruta ni hashes); `TokenizadorPorPalabras`
  queda solo como fake de tests; se elimina `AdapterDeEmbeddingsNoDisponible` y su test. Commit `feat(US-231b)`.
- [ ] 1.9 (TDD estricto, decisión 82) Test en rojo: «recorta a `RERANKER_MAX_PAIRS` por puntaje de recuperación con desempate por
  `chunk_id` antes de reranquear; el `Reranker` nunca recibe más de 12 pares [US-231b AC-9]» · integración con `TestClient`, Milvus
  fingido en su puerto y reranker espía. Verde: `recortar_a_pares_del_reranker()` pura en `app/domain/` (unitarios: menos candidatos
  que pares → sin recorte; empate → orden por `chunk_id`; determinista) y etapa nombrada en `RAGOrchestratorService` que registra solo
  recuentos (recibidos, descartados, enviados); se retira `CandidatosSuperanLosParesDelReranker` del arranque y **solo el primer test** de
  `test_coherencia_de_candidatos.py` (el de 12/12 sigue); los tests «13 pares → `FalloDeInferencia`» del adapter real y del fake **se quedan**
  (commit con `Test-Removal: RETRIEVAL_TOP_K>RERANKER_MAX_PAIRS pasa de error de arranque a corte previo (decisión 82)`). Commits `test` / `feat`.
- [ ] 1.10 (TDD estricto: lleva lógica de seguridad) Composición del corpus: `crear_puertos_del_corpus(settings)` (Milvus y lectores del schema
  `corpus` reutilizando `CorpusDatabaseSettings` y `componer_url`: usuario `rag_corpus`, URL sin contraseña, `sslmode=require`) en
  `app/infrastructure/corpus/composicion.py`, invocada desde `app/main.py` con `MODEL_PROVIDER=local` y `LLM_PROVIDER=local` (sin tocar
  `bootstrap.py:175` y sin generador falso por entorno). **Sonda al arrancar** (`SELECT 1` con
  `rag_corpus` y `has_collection`, cada una con `from None`; `create_engine` no conecta al construirse). Test en rojo en subproceso:
  «Milvus o catálogo inaccesible → código ≠ 0, nombra `MILVUS_URI` o `CORPUS_DATABASE_URL`, sin URI, host ni DSN en stdout/stderr, sin corpus
  falso [US-231b AC-9]». Verificación adicional: integración del
  arranque en ambos modos (con `fake` no importa Milvus ni runtimes), `/rag/query` ya no responde `503` por composición, respuesta
  validada contra el spec con el *helper* de L1D-164, y no regresión de los tests de L1D-106/179/275 y de *permission denied* de `rag_corpus`.
- [ ] 1.10b (test después) Runbook de Compose: documentar que, con `MODEL_PROVIDER=local`, un Milvus o PostgreSQL caído impide arrancar
  (fail-closed, sin corpus falso), cómo leer el error (nombra la variable, sin dirección) y el orden de arranque.
- [ ] 1.11 (test después) Mediciones `@pytest.mark.models` en la VM de Docker ≥ 10 GB, reloj inyectado: (a) etapa NLI con FX-06a-c en un
  lote, 3 corridas, mediana ≤ 1500 ms [US-231b AC-6]; (b) RSS máximo del proceso con los tres modelos cargados e inferidos una vez,
  ≤ 4489 MiB [US-231b AC-7] (`resource.getrusage`, sin dependencia nueva), documentando también el pico durante la carga (D12). Verificación: informe con medianas, RSS y veredicto; un exceso
  se **reporta** al refinamiento, no se oculta ni se ajusta el presupuesto. No es compuerta de CI.
- [ ] 1.12 (test después, *smoke* de L1D-115) Con el Compose de L1D-164, los pesos de `MODEL_HOST_DIR` y el manifiesto real:
  `python -m app.scripts.load_seed_corpus` → todos los documentos `embebido` + `is_current`, chunks con `source_type`, `language` y
  `cancer_type_tags` copiados del catálogo, `CorpusRelease` con `excluded_sources = ["NCCN","ESMO"]`
  (`@pytest.mark.ac("US-059", 1)`) [US-231b AC-9] [US-059 AC-1] [AC-06.1] [RN-05]; después `Q-HER2` a `/rag/query` con
  `LLM_PROVIDER=local` y `MODEL_PROVIDER=local` (opción (a)): se acepta `200 sin_evidencia` o `503 LOCAL_LLM_UNAVAILABLE`, nunca
  `503 RETRIEVAL_UNAVAILABLE`; el tope de ≤ 12 pares se verifica con el log de recuentos y la integración de 1.9, no en Compose. Salida adjunta al PR. **Al terminar, cerrar las tareas 1.13 y 2.13b de L1D-115 (nota en su
  `tasks.md`).** Solo corpus público con licencia registrada (RN-21); sin datos de pacientes (RN-13).
- [ ] 1.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y
  después, commit `refactor(US-231b)`. No inlinear adapters ni puertos; candidatos: contenedor de modelos (D4), etapa de corte (D9).

## 2. evaluación

- [ ] 2.1 Constancia en el PR: el change no cambia modelo, umbral de calidad, prompt, catálogo ni corpus (ejecuta ADR-39 y carga la
  semilla ya existente), así que no requiere `run-ai-eval`; se adjunta el informe de 1.11 y se anota el riesgo del corte previo a 12
  pares y del *chunking* en tokens sobre recall@10 para US-072/US-073 y L1D-274.

## 3. Coordinación

- [ ] 3.1 Notificar a L1D-180 que `NliClassifier`, `ParNli`, `ResultadoNli` y el adapter real están en `main` (sus tareas 2.11 parte
  `NliClassifier` y 2.14 pasan a consumirlos) y a L1D-274 que puede medir el p95 con los tres adapters reales.

## 4. Verificación

- [ ] 4.1 `openspec validate us-231b-adapter-nli-smoke-semilla --strict` en verde.
- [ ] 4.2 `pytest -m "not models"` en verde (ruta rápida de la CI, sin pesos reales) y los tests `models` en verde en la VM local, salida adjunta al PR.
- [ ] 4.3 `npm run quality` (Ruff + import-linter): `application/` y `domain/` sin importar `onnxruntime` ni `tokenizers`; `mypy` si está configurado.
- [ ] 4.4 `pip-audit` sin hallazgos críticos ni altos (sin dependencias nuevas) y escaneo de secretos y PII (`pii-scan`) en verde; ningún peso, ruta de máquina ni hash real versionado.
