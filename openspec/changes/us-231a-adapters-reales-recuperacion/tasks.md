# Tasks — us-231a-adapters-reales-recuperacion

> Matriz TDD (CLAUDE.md): adapters con lógica (prefijos, normalización del puntaje, límite de pares,
> verificación de hash, traducción de errores) y arranque → **TDD estricto, doble bucle** (commit
> `test(US-231a)` con el test de aceptación del AC en rojo antes de su `feat(US-231a)`); configuración y
> cableado → **test después**; calidad con modelos reales → `evaluate` (L1D-274 / US-072, no aquí).
> Mocks solo en los bordes: la sesión de inferencia (ONNX), el disco para el hash y la red. Los fakes cumplen el
> contrato del puerto (`None` ≠ `0.0`, mismos errores). Reloj inyectado. Nunca `.skip`, `skipif` ni `xfail`.
> **Los tests `@pytest.mark.models` no se desactivan: se excluyen de la ruta rápida por marcador** (CI sin pesos
> reales) y corren en la VM local y en el *smoke* de Compose.
> Secuencia de commits: `test` → `feat` → `refactor`, con alcance `US-231a` (sin `L1D-nn`; renombrar cuando exista
> el issue). Sin tarea `## contratos`: el spec no cambia.

## 1. ai-services

- [x] 1.1 (test después) Supply chain: justificar en `design.md` y fijar en `requirements.txt` las dependencias de
  inferencia (ONNX Runtime, *tokenizers*) y el detector de idioma: licencia permisiva (MIT/BSD/Apache), versión exacta
  `==`, solo *wheel* (`--only-binary`), sin `setup.py` ni descarga en importación o primer uso, `pip-audit` sin
  críticas ni altas; `transformers` prohibido en el `requirements.txt` de ejecución (solo `requirements-eval.txt`);
  `huggingface_hub` solo como dependencia transitiva fijada de `tokenizers` y **nunca importada** (test: ningún módulo
  de `app/` fuera de `app/evaluation` lo importa). Verificación: chequeo de `requirements.txt` y salida de `pip-audit`.
- [x] 1.2 (test después) Configuración (RN-22): `MODEL_PROVIDER` enum estricto `fake|local` (rechaza otro valor nombrando la variable), `DEFAULT_QUERY_LANGUAGE`, una clave `*_SHA256` por archivo cargado,
  `EMBEDDING_MODEL_PATH`, `EMBEDDING_MODEL_SHA256`, `RERANKER_MODEL_PATH`, `RERANKER_MODEL_SHA256` en `app/config/`
  y en `.env.example` (lo aplica el humano; el agente solo reporta las claves y sus valores de ejemplo si el permiso del agente deniega la ruta; ver tarea 1.21 de L1D-102).
  Verificación: test de carga de configuración y del chequeo de claves de ADR-39 en verde.
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: "termina el proceso nombrando la variable cuando el SHA-256
  del modelo no coincide o el archivo falta [US-231a AC-7]" · integración (arranque con configuración alterada en un
  *fixture* temporal, `@pytest.mark.ac("US-231a", 7)`). Esqueleto `verificar_modelo()` / `ModeloNoVerificadoError`
  con `raise NotImplementedError`. Commit `test(US-231a)`.
- [x] 1.3b (TDD estricto) Los escenarios de AC-7 arrancan en **subproceso** y afirman sobre stdout+stderr completos
  (código ≠ 0, contiene el nombre de la variable, no contiene ruta, hash esperado ni calculado), más los de la
  matriz de proveedores (valor fuera del enum; `LLM=local`+`MODEL=fake` → 503; `REAL_*_ENABLED=true`+`fake` → no
  arranca; extiende `reject_fake_provider_with_real_data`). Commit `test(US-231a)`.
- [x] 1.4 (TDD estricto) Verde de 1.3 y 1.3b, con `raise ModeloNoVerificadoError(variable) from None` sin registrar
  ruta, hashes ni `exc_info`, verificando el SHA-256 de cada archivo cargado: unitarios uno a la vez en `app/infrastructure/models/verificacion.py`
  (hash correcto → ok; hash distinto → error con la variable de SHA; archivo ausente → error con la variable de
  ruta; el mensaje no contiene ruta ni hashes; proveedor `fake` → no verifica). Commit `feat(US-231a)`.
- [x] 1.5 (TDD estricto) Test de aceptación en rojo: "cada vector tiene 1024 dimensiones y ch-m1-1 queda primero
  por coseno [US-231a AC-1]" · `@pytest.mark.models` + `@pytest.mark.ac("US-231a", 1)` con FX-06a-c; y, en la
  ruta rápida, el mismo AC contra la sesión de inferencia falsa (dimensión, orden, prefijos). Esqueleto
  `BgeM3Embedder` (`NotImplementedError`). Commit `test(US-231a)`.
- [x] 1.6 (TDD estricto) Verde de 1.5: unitarios uno a la vez de `app/infrastructure/embeddings/bge_m3.py`
  (puerto de consulta con prefijo de pregunta; puerto de pasaje con prefijo de pasaje y orden del lote; dimensión
  distinta de `EMBEDDING_DIM` → error del puerto; *sparse* calculado y no expuesto). Una sola sesión para los dos
  puertos. Commit `feat(US-231a)`.
- [x] 1.7 (TDD estricto) Test de aceptación en rojo: "puntúa en [0,1] y ch-m1-1 por encima de ch-p1-1 [US-231a AC-2]"
  (`models`) más su versión con sesión falsa en la ruta rápida. Esqueleto `BgeReranker`. Commit `test(US-231a)`.
- [x] 1.8 (TDD estricto) Verde de 1.7: unitarios uno a la vez de `app/infrastructure/reranker/bge_reranker.py`
  (sigmoide del logit; orden de los candidatos; > `RERANKER_MAX_PAIRS` → error; truncado a
  `RERANKER_MAX_LENGTH`; nunca `None` ni `0.0` por defecto; lista vacía). Commit `feat(US-231a)`.
- [x] 1.9 (TDD estricto) Test de aceptación en rojo: "meta.rerankerModel contiene modelo, versión y hash de la
  configuración [US-231a AC-3]" · `TestClient` con el `Reranker` real (sesión falsa en la CI; modelo real con
  `models`), respuesta validada contra el spec con el *helper* de L1D-164. Commit `test(US-231a)`.
- [x] 1.10 (TDD estricto) Verde de 1.9: `describir_modelo()` pura en `app/domain/` o en el paquete de modelos
  (formato `<modelo>@<revisión>#sha256:<hash>`) y `Reranker.version`. Commit `feat(US-231a)`.
- [x] 1.11 (TDD estricto) Test de aceptación en rojo: "devuelve es para Q-HER2 y en para ch-m1-1 [US-231a AC-4]".
  Esqueleto del detector. Commit `test(US-231a)`. Verde: adapter local determinista de
  `app/infrastructure/language/detector_local.py`, unitarios uno a la vez (es, en, vacío, indeterminado → valor
  documentado). Commit `feat(US-231a)`.
- [x] 1.12 (TDD estricto) Test de aceptación en rojo: batería de contrato común "mismas firmas y errores, `None`
  ≠ `0.0`, fallo de modelo → `RETRIEVAL_UNAVAILABLE` [US-231a AC-5]" parametrizada sobre real y fake de los cuatro
  adapters (real con `models` y también con sesión falsa en la ruta rápida); `503` validado contra el spec.
  Commit `test(US-231a)`; verde en `feat(US-231a)`: traducción de errores de inferencia al error del puerto, sin
  texto de pregunta ni de chunk en el mensaje.
- [x] 1.13 (TDD estricto) Test de aceptación en rojo: "dos procesos distintos dan el mismo relevance_score
  [US-231a AC-6]" (`models`, subproceso) y su versión con sesión falsa. Verde: hilos y orden de lote fijados por
  configuración. Commits `test(US-231a)` / `feat(US-231a)`.
- [x] 1.14 (TDD estricto) Test de aceptación en rojo: "responde con la red bloqueada y sin conexiones salientes
  [US-231a AC-8]" (fixture que bloquea sockets y registra intentos; `models`; más el chequeo estático con la lista
  prohibida de design D7 y la exigencia de `Tokenizer.from_file`/`InferenceSession(<ruta local>)`, en la ruta rápida). Verde: carga local sin resolución remota (`HF_HUB_OFFLINE`, rutas locales).
  Commits `test(US-231a)` / `feat(US-231a)`.
- [x] 1.14b (test después, **infra**) `infra/docker/docker-compose.yml`: *bind mount* `read_only` desde un
  directorio del host fuera del repo (variable `MODEL_HOST_DIR`, obligatoria, sin default dentro del repo) hacia `MODEL_CACHE_DIR`; pasa `MODEL_PROVIDER` (default `local` en Compose, `fake`
  en la CI; decisión por defecto a confirmar), `*_MODEL_PATH`, `*_MODEL_SHA256`, `HF_HUB_OFFLINE=1` y
  `TRANSFORMERS_OFFLINE=1`; patrones de pesos en `.gitignore`, en el `.dockerignore` raíz y repetidos en `apps/rag-orchestrator/Dockerfile.dockerignore`
  (`dockerignore.test.mjs` lo exige). La CI usa `MODEL_PROVIDER=fake` y un `MODEL_HOST_DIR` temporal vacío (smoke y resolutor).
  Test en `infra/docker/__tests__` con el patrón de `compose-config.test.mjs`, que comprueba también que la fuente
  resuelta del montaje queda **fuera de la raíz del repo**. Verificación: test en verde.
- [x] 1.15 (test después) Cableado en `app/bootstrap.py`: con `MODEL_PROVIDER=local` verifica los modelos
  (1.4), construye los adapters reales y los inyecta en `RAGOrchestratorService` (reemplaza la rama de
  `503 RETRIEVAL_UNAVAILABLE` en la composición de L1D-106 cuando hay adapters); con `fake`, no importa el runtime; `LLM=local`+`MODEL=fake` → `503` fail-closed.
  Verificación: test de integración del arranque en ambos modos y no regresión de los tests de L1D-106.
- [x] 1.16 (test después) Medición de latencia por etapa (AC-9): script/test `@pytest.mark.models` que mide
  *embeddings* y *reranker* (12 pares), 3 corridas, mediana, con reloj inyectado, y escribe el resultado (sin
  datos reales) para el PR. Verificación: informe con medianas y veredicto frente a 500 ms y 4500 ms; un exceso
  se reporta, no se oculta ni se ajusta el presupuesto. Corre en la VM local, no en la CI.
- [x] 1.17 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests
  en verde antes y después, commit `refactor(US-231a)`. No inlinear adapters ni puertos.

## 2. evaluación

- [x] 2.1 Constancia en el PR: el change no cambia modelo, umbral, prompt, catálogo ni corpus (ejecuta ADR-39), así
  que no requiere `run-ai-eval`; la calidad con modelos reales queda para US-072/US-073 y el p95 conjunto para
  L1D-274. Se adjunta el informe de latencia de 1.16.

## 3. Verificación

- [x] 3.1 `openspec validate us-231a-adapters-reales-recuperacion --strict` en verde.
- [ ] 3.2 Suite de `apps/rag-orchestrator` en verde en la ruta rápida de la CI (sin pesos reales): `pytest -m "not models"`;
  y los tests `models` en verde en la VM local con los pesos de `MODEL_CACHE_DIR`, con la salida adjunta al PR.
- [ ] 3.3 `npm run quality` (Ruff + import-linter): `application/` y `domain/` sin importar `onnxruntime`,
  `tokenizers` ni el detector; `mypy` si está configurado.
- [x] 3.4 Escaneo de secretos y PII (`pii-scan`) en verde; ningún peso, ruta de máquina ni hash real versionado
  fuera de la configuración.
