# Design — l1d-298-evaluate-modelos-locales

## Context

`app/evaluation/composicion_suite.py` arma `RAGOrchestratorService` con adaptadores falsos y rechaza `adaptadores.proveedor: local` («se cablea con US-073»). Ya existen los adapters reales de producción (US-231a/b), `juez_fidelidad.py`, `llamadas.py` (registro de llamadas a nube con datos reales, hoy solo del juez), `guardas.py` (`es_proveedor_local()`), `medicion_modelos.py` y `cronometro.py`. El procedimiento está en `openspec/changes/archive/2026-10-22-l1d-235-suite-evaluate/design.md` D21. Decidido `[S4 resp. 6]`, `[S4 resp. 10]`; no se reabre.

## Decisiones

- **Reutilizar, no duplicar:** `proveedor: local` instancia los mismos adapters de `app/infrastructure/` que producción (mismo contenedor de modelos de US-231b D4); la suite solo añade guardas y medición. Los fakes siguen cumpliendo el contrato del adapter real.
- **Fail-closed sin pesos:** una comprobación previa (`chequeo_config.py`) lista los artefactos faltantes (variable de configuración, nunca ruta ni valor) y sale con código ≠ 0; nunca PASS ni cifras inventadas (AC-4).
- **Juez local:** nombre propio `juzgar_afirmacion(afirmacion, fragmentos_citados)` que construye el prompt solo con esos dos insumos (sin respuesta completa ni modelo generador); `parsear_veredicto()` devuelve `no_soportada` + contador `veredictos_invalidos` si el JSON es inválido o la cita no está entre los fragmentos. `EVAL_JUDGE_TEMPERATURE=0` y `EVAL_JUDGE_SEED` en configuración (RN-22).
- **Acuerdo:** funciones puras `porcentaje_de_acuerdo()` y `kappa_de_cohen()` (determinista); `JUEZ_ACUERDO_MINIMO` en configuración. Sin muestra humana (DEC-06, S5) solo se reporta juez↔NLI y juez↔humano queda `sin_medir` (nunca 0).
- **RSS y latencia:** `resource.getrusage` (sin dependencia nueva), reloj inyectado vía `cronometro.py`; p50/p95 por hipótesis y por lote; el límite de memoria del contenedor viene de configuración. Un exceso se **reporta**, no se ajusta el presupuesto.
- **Alternativas:** una propuesta elegida (reutilizar adapters y guardas existentes); descartados un juez de nube (ADR-41, RN-12) y un segundo juez local distinto de G (una sola ruta de juez).

## Dependencias y colaboradores

- Modifica `composicion_suite.py`, `config_suite.py`, `chequeo_config.py`, `guardas.py`, `llamadas.py`, `juez_fidelidad.py`, `armado_reporte.py`/`reporte.py`, `corrida.py`, `medicion_modelos.py`; nuevo `app/evaluation/acuerdo_juez.py` (funciones puras) y config `eval/configs/local.yaml`. Depende de los puertos de LLM, embeddings, reranker y NLI, nunca de clientes concretos en `domain/`.
- Reglas con nombre propio: `es_proveedor_local()` (RN-12), `juzgar_afirmacion()`, `parsear_veredicto()`, `kappa_de_cohen()`, `marcar_fidelidad_no_concluyente()`.
- Arrastres: deduplicar el filtro `extraido_verificado` (adapter SQL vs `CatalogoEnMemoria`); hacer públicos los nombres de `config_suite` importados por `corrida_aplicabilidad.py`; mover el armado del reporte de aplicabilidad.

## Privacidad y ownership

Solo `rag-orchestrator`, solo datos sintéticos (`clase: sintetico`, RN-13/RN-14); no toca datos clínicos ni `clinical-minio`. Ningún request sale de la máquina: la lista de hosts locales (loopback y `host.docker.internal`) está en código y no se amplía por configuración ni por alias de Ollama (`ollama cp x:cloud` sin guarda de nube: se valida el nombre del modelo, hallazgo del S2). El reporte contiene solo agregados y configuración, nunca textos de preguntas, fragmentos ni salidas; las discrepancias del acuerdo se listan por id de afirmación. Sin PII en logs.

## Contratos

Sin cambios en `openapi.yaml` ni en `contracts/`: la suite invoca `RAGOrchestratorService` en proceso. Claves nuevas del reporte de `evaluate` (`eval/results/*.json`, esquema `esquema_suite.py`) son aditivas; `baseline.json` solo gana claves. Verificación del proveedor no aplica.

## Evaluación

Cambia la forma de medir, no el modelo, prompt, umbral, catálogo ni corpus. Métricas OL-06 afectadas, contra TBD-02: fidelidad (M-07.2), precisión de citas, «sin evidencia», salidas prescriptivas = 0, p95 por etapa (M-10.1) y las nuevas (acuerdo juez↔NLI, RSS, latencia del NLI). Ejecución manual por `ai-eval-runner` en el MacBook de referencia (Ollama con `OLLAMA_CONTEXT_LENGTH=8192`, LLM ≤ 21 GB, stack ≤ ~30 GB, sin swap, `ollama ps`); reporte a `reports/eval/`. Metas sin modificar.

## Risks / Trade-offs

- Sin los pesos en la máquina de CI el AC-1/AC-7 no se verifican allí: se verifican por el reporte de la corrida manual y por tests con adapters fingidos del cableado y las guardas.
- RSS/latencia del NLI por encima del límite (ADR47-R7): se reporta al refinamiento.
- Kappa con pocas afirmaciones es inestable: el reporte incluye el tamaño de la muestra.

## Pendientes de definir

- Valor inicial de `JUEZ_ACUERDO_MINIMO` (asumido en la historia; dueño: refinamiento/usuario, afecta AC-6). **Implementado como 0,8 en `eval/configs/local.yaml` (`juez.acuerdo_minimo`) — supuesto sin calibrar**; la clave es obligatoria cuando hay juez y no tiene valor por defecto en código (RN-22).
- Muestra humana juez↔humano llega con DEC-06 (S5): hasta entonces `sin_medir`.
- Límite de memoria del contenedor para la marca de AC-7: **implementado como `medicion.rss_limite_mib: 4489`** (hereda el presupuesto conjunto de ADR-39 / us-231b AC-7; supuesto). La suite lo exige con `proveedor: local`.

## Implementación (decisiones tomadas al aplicar)

- **Juez:** `app/evaluation/acuerdo_juez.py` (funciones puras `parsear_veredicto`, `kappa_de_cohen`, `porcentaje_de_acuerdo`, `marcar_fidelidad_no_concluyente`, `acuerdo_con_el_nli` y `juzgar_afirmacion` sobre un puerto `CompletadorDelJuez`). `JuezLlmLocal` es el único completador; una sola ruta de juez. Los fragmentos reciben ids locales `F1…Fn` (la cita del juez es uno de ellos); `soportada` exige que la cita exista, `no_soportada` no la necesita. El formato anterior (`SOPORTADA`/`NO_SOPORTADA` en texto) desaparece. Se envía `response_format` JSON estricto y `reasoning_effort: none` como en producción.
- **Acuerdo:** el mínimo se aplica al **porcentaje de acuerdo** juez↔NLI; el kappa y la muestra se reportan junto al porcentaje (con una muestra de 2 a 9 afirmaciones el kappa es inestable). Sin afirmaciones o con una sola clase en ambos jueces el kappa es `null`, no 0.
- **Reporte (claves aditivas):** `fidelidad.juez_llm.{veredictos_invalidos, acuerdo_con_nli{muestra, porcentaje, kappa, discrepancias[]}, acuerdo_con_humano, estado}`; `privacidad.adaptadores_cubiertos`; `recursos_nli{rss_maximo_mib, rss_limite_mib, supera_el_limite, latencia_ms{por_lote, por_hipotesis}}`. La CI con fakes no emite `adaptadores_cubiertos` ni `recursos_nli`: `baseline.json` no cambia. El esquema cerrado amplía el largo máximo de un identificador de 128 a 255 caracteres: `<modelo>@<revisión>#sha256:<hash>` (ADR-39) mide hasta ~170 y la primera corrida real falló por ello.
- **Proveedor local:** `app/evaluation/modelos_locales.py` reutiliza `cargar_modelos_locales()` de producción (mismo contenedor de modelos) y arma el generador con `OpenAICompatibleLlmClient` + `LlmEvidenceGenerator`; todo adapter registra su llamada (`embeddings`, `reranker`, `nli` como `en-proceso`; `llm` y `juez` con su destino). El corpus del dataset se embebe con el `PassageEmbedder` real y se busca en memoria (`BuscadorEnMemoria` recibe los vectores). `guardas.exigir_proveedor_local` aborta (sin requests ni cargar pesos) si algún `adaptadores.urls.*` no es local, si el modelo es un alias de nube (`x:cloud`) o si falta `medicion.rss_limite_mib`; `chequeo_config.variables_de_modelos_ausentes` lista por nombre lo que falta; los errores nunca llevan rutas, hashes ni valores.
- **Entorno:** `evaluate` recibe el entorno por parámetro; `python -m app.evaluation.evaluate` lo toma de `app/config/entorno.py` (único punto que lee el proceso, US-037 AC-1). Claves nuevas: `JUEZ_ACUERDO_MINIMO` (también flag `--juez-acuerdo-minimo`, mapeada en `scripts/eval/evaluate.mjs`); `EVAL_JUDGE_TEMPERATURE` y `EVAL_JUDGE_SEED` ya existían. **`.env.example` lo aplica la sesión principal** (ver el informe de la implementación).
- **Límite documentado (l1d-244 4.1):** `scripts/ci/eval-required.mjs` solo corre `--suite all`; el código de salida 3 de la familia `aplicabilidad` lo cubre el Pytest de `build-test` (`test_aplicabilidad_aceptacion.py`). No se cambió el script.
- **Constancia de orden TDD (l1d-117 5.5), sin reescribir historia:** `test(L1D-298)` en rojo antes de su `feat(L1D-298)` para AC-5/AC-6 (`5f361e37` → `eb4a9935`), AC-3/AC-4/AC-7 (`5aa018d0` → `e59340e5`), `solo_extraidos_verificados` (`643644db` → `82b372c4`) y los arrastres de aplicabilidad (`bd7f8485` → `21250450`). Los tests de `test_fidelidad_juez.py` se actualizaron al formato JSON del juez (commit `eb4a9935`, `Test-Removal:`). **Excepciones honestas:** dos correcciones nacidas de la corrida/auto-revisión (largo del identificador del reporte, `34d311cd`; valores repetidos en el error de configuración de modelos) llevan el test y el arreglo en el mismo commit; el rojo se comprobó en local antes de arreglar. Los rojos de AC-3/AC-4/AC-7 y de `solo_extraidos_verificados` fallan por `NotImplementedError`/aserción según el esqueleto permitido; el de AC-5 (primer test) falla por `JuezNoDisponible` del formato anterior, no por una aserción.

## Procedimiento reproducible y cifras medidas (3.2–3.4)

Máquina de la corrida: MacBook con **48 GB** (la de referencia del proyecto es de 32 GB: las cifras de RSS del proceso y la latencia son de esta máquina; el comportamiento de memoria del sistema y el swap en 32 GB **no se midieron**). Al empezar ya había ~4,7 GB de swap en uso por otros procesos, así que «sin swap» no se cumplió por condiciones de la máquina. Otro agente usaba Docker (Compose `oncolens-ci-rag`) durante la corrida.

1. Ollama propio en otro puerto, sin tocar el del usuario: `OLLAMA_HOST=127.0.0.1:11436 OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve`. `ollama ps`: `gemma4:26b-a4b-it-q4_K_M`, 17 GB, 100 % GPU, contexto 8192. Se apagó al terminar.
2. Entorno de ADR-39: rutas y SHA-256 de `~/adr39-modelos/modelos.env`, claves de `adr39-config.sh`, `NLI_LABEL_INDEX_ENTAILMENT/NEUTRAL/CONTRADICTION=0/1/2`.
3. `python -m app.evaluation.evaluate --config <local.yaml con el puerto 11436> --suite all --salida reports/eval --nombre-archivo l1d-298-evaluate-modelos-locales-<fixture>.json` (una por dataset: `fx-t5a-a`, `fx-rn23`). La huella `hashConfig` del reporte corresponde a la copia con el puerto 11436; `eval/configs/local.yaml` versiona el puerto 11434 estándar.
4. `-m models`: `tests/integration/test_nli_mediciones.py`, `test_smoke_sparse_con_pesos_reales.py` (con `EMBEDDING_SPARSE_WEIGHTS_*`).

Reportes (solo agregados): `reports/eval/l1d-298-evaluate-modelos-locales-{fx-t5a-a,fx-rn23,memoria,latencia-nli}.json`.

| Medida (modelos reales, G por Ollama) | `fx-t5a-a` (6 preguntas) | `fx-rn23` (4 preguntas) | Meta TBD-02 |
|---|---|---|---|
| Recall@10 / MRR (n=4) | 1,0 / 1,0 | n/a | ≥ 0,80 / ≥ 0,60 |
| Precisión de citas | 1,0 (n=4) | 1,0 (n=4) | ≥ 0,90 |
| «Sin evidencia» (exactitud; violaciones RN-02) | 1,0 (n=6; 0) | 1,0 (n=4; 0) | ≥ 0,90 |
| Fidelidad NLI (afirmaciones soportadas) | 0,667 (6/9) **fuera de meta** | 0,5 (1/2) **fuera de meta** | ≥ 0,90 |
| Fidelidad del juez local (secundaria) | 1,0 (9/9) | 1,0 (2/2) | — |
| Acuerdo juez↔NLI (porcentaje / kappa / n) | 0,667 / 0,0 / 9 | 0,5 / 0,0 / 2 | mínimo 0,8 (supuesto) |
| Estado de la fidelidad del juez | **no concluyente** | **no concluyente** | — |
| Veredictos inválidos del juez | 0 | 0 | — |
| Salidas prohibidas: propuesta cruda / **mostradas** | 0 / 0 | 6 (A=5, B=1) / **1** | mostradas = 0 |
| Llamadas a la nube con datos reales | 0 (45 llamadas registradas) | 0 (23) | 0 |
| p95 consulta / generación / NLI / reranker (ms) | 3253 / 3062 / 46 / 87 | 2660 / 2576 / 14 / 56 | — |
| NLI por lote p50 / p95 (ms; lotes) | 30,7 / 46,0 (4) | 12,1 / 13,9 (2) | — |
| NLI por hipótesis p50 / p95 (ms; hipótesis) | 15,3 / 22,4 (9) | 12,1 / 13,9 (2) | — |
| RSS máximo del proceso (MiB) | **8840,5** | **6987,8** | límite 4489 → **supera** |

Hallazgos que **se reportan al refinamiento, sin ajustar metas ni presupuestos**:

- **AC-2 no se cumple con el LLM real:** en `fx-rn23` las salidas prescriptivas **mostradas** son 1 (meta 0). Las 6 de la propuesta cruda reproducen términos del corpus citado (`terminos_compartidos_con_corpus_citado = 6`) y el filtro de producción deja pasar 1 (hallazgo ya conocido del S2: el filtro cubre el nivel A, hay un término de nivel B). El reporte lista solo ids de regla.
- **RSS (AC-7):** 8,8 GiB frente al presupuesto de 4,4 GiB; el pico ocurre durante la **carga** de los tres modelos (`ru_maxrss`; en macOS no hay `rss_en_regimen`): `test_nli_mediciones.py` midió 8753,5 MiB con los tres modelos cargados e inferidos una vez (exceso 4264,5 MiB). Latencia del NLI (`-m models`, mediana de 3): 36,5 ms por lote de FX-06a-c, dentro de los 1500 ms.
- **Fidelidad por debajo de meta con n minúsculo** (6 y 2 preguntas, ninguna revisada por el oncólogo, rótulo `no_validada`): no es una baseline; sirve para comprobar que la medición funciona de punta a punta.
- **Partición de ADR-45:** no se corrió. `data/eval/ol06-particion-v1` asigna ids de `data/eval/adr39-mini`, que solo trae `golden.yaml` y `nli-pares.yaml` (sin corpus de chunks): la suite no puede cargarlo; no hay forma de aplicar la partición a `fx-*`.
- **No ejecutado (necesita servicios reales):** el *smoke* de la semilla con modelos reales (`us-231b` 1.12) requiere PostgreSQL y Milvus del Compose de test, que estaba en uso por otro agente; y la muestra para el revisor (`l1d-117` 2.2) requiere ingesta con el corpus real sobre esos mismos servicios.
