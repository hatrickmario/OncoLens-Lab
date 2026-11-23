# Design — l1d-334-diagnostico-etapas-recuperacion

## Context

- El runner `python -m app.evaluation.evaluate --config <ruta> --suite <familia>` (US-072, ADR-41) vive en
  `apps/rag-orchestrator/app/evaluation/`. Las familias `aplicabilidad`, `poblacion` y `opciones` ya siguen el patrón
  «configuración propia, fuera de `all`, corrida en `corrida_<familia>.py`».
- El servicio de consulta emite `rag_query_recuperacion` (recuentos por loop), `rag_query_corte` (ids y puesto denso de
  lo **cortado**, acotado a `RERANKER_CUT_LOG_MAX_IDS`), `rag_query_citas` y `rag_query_soporte` (recuentos). Ninguno
  lleva el `relevance_score` por chunk, el puesto denso de un chunk que **sí** pasó el corte ni la `p_entailment` por
  afirmación.
- El runner ya envuelve los puertos del servicio con observadores (`medidores.py`: `BuscadorMedido`,
  `RerankerObservado`, `GeneradorObservado`, `NliMedido`) sin tocar producción.
- CLAUDE.md: el contenido (modelos, umbrales, corpus) se mide con `evaluate`, sin TDD; la **orquestación** de la suite y
  las reglas puras, con adaptadores falsos y TDD estricto.

## Goals / Non-Goals

**Goals:** pares de paráfrasis versionados; informe por pregunta y etapa; etapa responsable por par con una regla pura;
histograma de `p_entailment`; informe sin texto; forma reproducible en la CI.
**Non-Goals:** cambiar umbrales, modelos, prompts, catálogo o corpus; medir recall@10 global; calibrar el NLI; añadir
campos a los eventos de producción.

## Decisions

**D1 · Familia nueva `diagnostico`.** `SUITES` gana `diagnostico`, fuera de `all` (no cambia la huella de
`test-fake.yaml` ni `baseline.json`). Configuraciones: `eval/configs/diagnostico-fake.yaml` (adaptadores falsos, CI) y
`eval/configs/diagnostico-local.yaml` (`proveedor: local`, corrida manual). Descartadas en una línea: ampliar la familia
`retrieval` (mezcla una métrica agregada con un informe por pregunta y cambia la huella del baseline) y un script suelto
(prohibido por la regla del S7: «un script del scratchpad no cuenta»).

**D2 · Fuente de las observaciones: los puertos, no el texto de los logs.** La historia pide reutilizar los eventos de
log y no cambiar producción. Los eventos no traen los tres datos que el AC-1 y el AC-3 exigen (ver Context). El
diagnóstico los toma de observadores de la suite sobre los mismos puertos alrededor de los cuales se emiten los eventos:
orden denso (`ChunkSearch.search_dense`), pares y puntajes (`Reranker.puntuar`), propuesta del LLM
(`EvidenceGenerator.generar`) y `ResultadoNli` por par (`NliClassifier.clasificar`). Los eventos quedan como la traza de
producción y no cambian. Descartadas: añadir campos a los eventos (cambia producción y pone puntajes por chunk en los
logs) y analizar el texto del log (frágil y sin los datos).

**D3 · Chunk esperado.** Cada par declara `evidencia: [{documento, cita}]`. Los chunks esperados de una pregunta son los
del corpus cuyo documento coincide y cuyo texto contiene la cita literal. «Primer chunk esperado» = el de mejor puesto
denso. Si ninguno está entre los candidatos densos, `puesto_denso = null`.

**D4 · Regla de la etapa responsable (pura, `metricas/diagnostico.py`).** Para la redacción que pierde la evidencia, la
primera condición que se cumple, en el orden del *pipeline*:

| Orden | Etapa | Condición sobre el chunk esperado |
|---|---|---|
| 1 | `recuperacion_densa` | no está entre los `RETRIEVAL_TOP_K` candidatos densos |
| 2 | `corte_de_pares` | es candidato y queda fuera de los `RERANKER_MAX_PAIRS` pares |
| 3 | `umbral_de_relevancia` | fue puntuado y su `relevance_score` < `RELEVANCE_THRESHOLD` |
| 4 | `nli` | superó el umbral, hubo opciones con citas válidas y ninguna pasó el soporte |
| — | `sin_asignar` | superó el umbral y no hubo opciones generadas (`sin_opciones_generadas`) o cayeron en la validación de citas (`citas`) |

El texto de esta tabla se escribe en el informe (AC-2). `sin_asignar` existe para no forzar a `nli` una pérdida que es
de generación; se cuenta aparte. La regla de qué queda dentro de los pares **no se reescribe**: se reutiliza
`recortar_a_pares_del_reranker` del dominio (un solo dueño).

**D5 · Loops.** Con el segundo loop de RN-02 o la expansión contextual activos, una pregunta puede recuperar más de una
vez. La fila registra el **último** loop ejecutado y el campo `loops`; el primero queda en `loop_1` con los mismos
campos. La etapa se asigna con el último loop (es el que decide el resultado que ve el médico).

**D6 · Histograma del NLI (pura).** `histograma_de_p_entailment(descartadas, ancho)` y
`recuento_en_banda(descartadas, inferior, umbral)`. `diagnostico.nli_banda_inferior` (valor inicial 0,5, el del AC-3) y
`diagnostico.nli_ancho_de_tramo` viven en la configuración de la suite (RN-22). `NLI_ENTAILMENT_THRESHOLD`,
`RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K` y `RERANKER_MAX_PAIRS` se leen de la configuración de la suite y de `Settings`
como hoy; ninguna constante local. Una afirmación con varios pares NLI usa la `p_entailment` máxima, la misma que decide
el soporte en `domain/support.py`. El informe lleva una nota fija: cambiar el umbral exige una calibración con etiquetas
humanas.

**D7 · Dataset `data/eval/parafrasis-v1/`.** `manifest.yaml` (`clase: sintetico`, `corpus: data/eval/s5-corpus-ampliado`,
`revision_provisional: {rol: ia, fecha}`) y `pares.yaml`: `{id, tipo, tipo_de_cancer, redacciones: [{id, idioma,
pregunta}, …], evidencia: [{documento, cita}]}`. Tipos: `coloquial_tecnico`, `sin_tildes`, `orden`, `es_en`. Dataset
nuevo y no ampliación de `preguntas-contextuales.yaml`: ese archivo es la muestra congelada de la medición de ADR-52 y
ampliarlo cambia sus cifras. Las preguntas son inventadas por el equipo; ningún dato de paciente.
- **Redacciones descriptivas (RN-23).** Cada pregunta pide lo que describe la evidencia («qué complicaciones se
  describen…»), nunca qué debe recibir un paciente. El test de integridad del dataset pasa cada redacción por el
  verificador de términos prescriptivos prohibidos del catálogo (`lenguaje/terminos-prohibidos.json`, el mismo que usa
  la suite; sin lista propia), como los datasets de `l1d-246` y `l1d-299`.
- **Marca `revision_provisional`: una sola forma y una sola regla.** `{rol: ia, fecha}` tiene la misma forma que en el
  catálogo (`$defs` único de `schemas/comun.schema.json`, de `l1d-335` y `l1d-126`) y que en los datasets de `l1d-246`
  y `l1d-299`. La regla pura que valida esa forma en los datasets de `evaluate` (rol de un conjunto cerrado, fecha
  ISO) es **una** y vive en `app/evaluation/`; `dataset_diagnostico.py`, `dataset_opciones.py` y
  `dataset_poblacion.py` la llaman. La crea el primero de los tres changes que llegue a `main` y los otros la
  reutilizan: antes de escribirla se busca en el árbol. No es validación de un oncólogo y el informe sigue
  `no_validada`.

**D8 · Informe.** JSON con la tabla por pregunta, la asignación por par, el recuento por etapa, el histograma, la regla,
la configuración y su huella; más un `.md` legible con las mismas cifras. Solo ids, puestos, puntajes y recuentos (AC-4).
Lleva el rótulo `no_validada` del runner (`rotulo.py`). Se escribe en `reports/eval/` con el nombre del change.

**D9 · `null` distinto de `0.0`.** `puesto_denso`, `relevance_score` y `supero_umbral` son `null` cuando la etapa no
llegó a observarse; nunca `0`, `0.0` ni un centinela de texto.

## Privacidad y ownership

- Todo corre dentro de `rag-orchestrator`, sobre corpus público con licencia registrada y preguntas sintéticas. Ningún
  dato cruza web → clinical-api → rag-orchestrator. `rag-orchestrator` no toca datos clínicos ni `clinical-minio`
  (RN-10); la familia no abre conexión a PostgreSQL clínico.
- Las solicitudes se arman con `solicitud_base()` del runner: sin contexto de paciente real; RN-11 no se ve afectada.
- LLM solo local (RN-12): `proveedor: local` con la lista cerrada del runner, sin *fallback* a la nube.
- El informe y los mensajes de error no llevan texto de preguntas, chunks ni salidas del LLM (RN-14). Las guardas de
  `guardas.py` rechazan una clase distinta de `sintetico` (RN-13). El escaneo de PII y `dataset-class-check` de la CI
  cubren `data/eval/parafrasis-v1/`.
- NCCN y ESMO: ninguna pregunta ni cita toma contenido de esas guías.

## Contratos

Sin cambio de `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni `contracts/examples/`. Proveedor
y consumidores no cambian; oasdiff no aplica; compatible con ADR-26. El informe amplía `esquema_suite.py` (esquema
interno del runner, no HTTP) con la sección `diagnostico`.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `app/evaluation/config_suite.py`, `evaluate.py`, `esquema_suite.py` | familia `diagnostico`, su sección de configuración y del informe | runner (US-072) |
| `app/evaluation/config_diagnostico.py` (nuevo) | `pares_minimos`, `nli_banda_inferior`, `nli_ancho_de_tramo` (RN-22) | `config_suite.py` |
| `app/evaluation/dataset_diagnostico.py` (nuevo) | carga de `parafrasis-v1`, guardas de clase, cita literal, cobertura de tipos | `guardas.py`, `dataset_loader.py` |
| `app/evaluation/observadores_diagnostico.py` (nuevo) | observadores de los puertos `ChunkSearch`, `Reranker`, `EvidenceGenerator`, `NliClassifier` | puertos del dominio; `medidores.py` |
| `app/evaluation/metricas/diagnostico.py` (nuevo) | `etapa_responsable()`, `recuento_por_etapa()`, `histograma_de_p_entailment()`, `recuento_en_banda()` | tipos puros; `recortar_a_pares_del_reranker` |
| `app/evaluation/corrida_diagnostico.py` (nuevo) | arma el servicio con `componer_servicio`, corre los pares y arma el informe | `composicion_suite.py`, `corrida.py`, `rotulo.py` |
| `eval/configs/diagnostico-fake.yaml`, `diagnostico-local.yaml` (nuevos) | adaptadores y parámetros | `modelos_locales.py` |
| `scripts/eval/evaluate.mjs` | configuración por defecto de la familia | — |
| `data/eval/parafrasis-v1/` (nuevo) | dataset | `data/eval/s5-corpus-ampliado` |

Los services y el dominio de producción no se tocan. La corrida depende de los puertos, nunca de clientes concretos.
Reglas extraídas a métodos con nombre propio: `etapa_responsable()` (RN-02, RN-01) y `chunks_esperados_de()` (D3).

**Fakes que toca.** No crea fakes nuevos de puertos: usa los de `adaptadores_falsos.py` y `tests/evaluation/modelos_falsos.py`.
Los observadores son decoradores de un puerto y pasan el mismo test de contrato que el adapter real:
`tests/evaluation/test_contrato_de_envoltorios.py` y `tests/unit/test_bateria_de_contrato_de_adapters.py` (mismos
errores con entrada vacía; `null` distinto de `0.0`).

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: añade una familia y un dataset. No mueve las metas de OL-06 ni las
compara. Es un insumo de diagnóstico para US-277, US-278 y US-279.

- `run-ai-eval` confirma que `--suite all` da el mismo `baseline.json` y la misma huella de `test-fake.yaml`.
- La medición con modelos locales corre en la **corrida base** del S7 (`[S7 resp. 2]`) con `diagnostico-local.yaml`; la
  ejecuta `ai-eval-runner` y el informe queda versionado en `reports/eval/`. Se repite en la corrida final.
- **Corpus (`[S7 resp. 10]`):** el del dataset `s5-corpus-ampliado`, en memoria, el mismo en la base y en la final. El
  informe registra la ruta del dataset, su versión y el recuento de chunks. No usa la ingesta de `l1d-119`.
- **Umbrales (`[S7 resp. 11]`):** la base y la final corren con los umbrales actuales. Los calibrados entran en la final
  como un brazo más, que aporta `l1d-119`; se adoptan en el cierre, no aquí.
- Ninguna cifra de este diagnóstico se cita en un PR, ADR o cierre sin ese informe versionado. Este change no adelanta
  ninguna cifra.
- Hipótesis a confirmar o descartar con el informe (no es un resultado): la pérdida está en el umbral de relevancia, por
  el recorte del *reranker* a 512 tokens y la falta de sinónimos de procedimientos, y no en el NLI.

## Risks / Trade-offs

- **Muestra pequeña (≥ 10 pares):** el recuento por etapa orienta, no prueba. El informe lo dice y no da intervalos.
- **Cita presente en más de un chunk** (solapamiento del 5 %): se toma el de mejor puesto denso (D3).
- **Deriva entre observadores y eventos:** el test de aceptación compara, por pregunta, los recuentos del informe con
  los de `rag_query_corte` capturados con `caplog`.
- **Comparación entre la base y la final:** el corpus de la familia no cambia (`[S7 resp. 10]`; las reindexaciones de
  US-279 van en colecciones aparte, sobre la ingesta de `l1d-119`). El informe guarda la versión del corpus y la huella
  de la configuración, y dos informes solo se comparan con el mismo dataset.
- **Los fragmentos del dataset son cortos:** pocos superan `RERANKER_MAX_LENGTH`, así que este diagnóstico apenas ve
  la pérdida por el recorte del *reranker*; esa se mide en los brazos de `l1d-336`, sobre la ingesta de `l1d-119`.

## Pendientes de definir

- **Corpus de la medición real: resuelto** por `[S7 resp. 10]`. La historia dice «corpus de la Demo 6»; la familia
  `diagnostico` usa el dataset `s5-corpus-ampliado` en memoria, el mismo en la base y en la final, y las citas de
  `parafrasis-v1` salen de `data/eval/s5-corpus-ampliado/corpus.yaml`. No depende del orden frente a `l1d-119`.
- **Lectura de D2.** La historia dice «reutiliza los eventos de log»; el diseño observa los puertos porque los eventos
  no traen puntaje ni `p_entailment`. Dueño: humano. Afecta: D2 y la tarea 1.6.
- **Categoría `sin_asignar`** (D4): el AC-2 nombra cuatro etapas. Dueño: humano. Afecta: `etapa_responsable()` y el
  recuento.
- **Revisión de los pares:** quedan en `revision_provisional` con rol `ia` (`[S7 resp. 1]`); un oncólogo los revisa
  después del MVP.

## Decisiones de implementación (apply)

Decisiones que ni la spec ni un ADR cubrían; cada una con la alternativa elegida y por qué se descartan las otras.

- **D10 · Cómo observa la suite la búsqueda densa.** `componer_servicio` gana el parámetro opcional `envolver_buscador` (una
  función `ChunkSearch -> ChunkSearch`); la corrida lo usa para decorar la búsqueda en memoria con el observador. Descartadas:
  (a) un segundo compositor del servicio solo para esta familia (duplica ~60 líneas de cableado y deriva del real); (b) subclasear
  `BuscadorEnMemoria` (el observador no podría decorar el buscador que inyecta un test ni el de otra implementación del puerto).
  El cambio es aditivo: ningún llamador existente lo pasa y `--suite all` no cambia (`baseline.json` idéntico).
- **D11 · Qué entró en los pares del *reranker*.** Se lee de lo que el *reranker* recibió de verdad (el observador de
  `Reranker.puntuar`), no se recalcula el corte. El orden denso sí se calcula con `recortar_a_pares_del_reranker(candidatos,
  len(candidatos))` (un solo dueño del orden y del desempate por `chunk_id`). Descartadas: (a) recalcular el corte con
  `RERANKER_MAX_PAIRS` de la configuración (con un reranker local manda el del reranker cargado y el diagnóstico divergiría si
  el tope de producción cambia); (b) analizar el texto de `rag_query_corte` (frágil y ya descartado en D2). El test
  `test_diagnostico_contra_eventos.py` comprueba que lo observado coincide con lo que registra `rag_query_corte`.
- **D12 · `puesto_denso` y los candidatos.** El puesto es el del orden denso de la unión de las dos búsquedas del loop (la
  pregunta y el resumen del contexto), y es `null` si supera `RETRIEVAL_TOP_K` (el chunk no es candidato, como pide la spec).
  Descartada: informar el puesto real aun fuera del top-k (más informativo, pero contradice el escenario «si no está entre los
  candidatos densos, `puesto_denso` es `null`»).
- **D13 · Pares con más de dos redacciones.** Un par pierde si alguna redacción termina con evidencia y otra sin ella; la
  etapa es la de la **primera** redacción sin evidencia en el orden del dataset (las demás quedan en la tabla por pregunta).
  Descartada: una etapa por redacción perdida (rompe «la suma de los recuentos es el número de pares»).
- **D14 · `nli` frente a `sin_asignar/citas`.** Con el fragmento sobre el umbral: sin opciones generadas → `sin_asignar`
  (`sin_opciones_generadas`); con opciones pero ninguna afirmación llegó al NLI (`afirmaciones_al_nli` nulo o 0, cayeron en la
  validación de citas) → `sin_asignar` (`citas`); en otro caso → `nli`. Descartada: forzar todo lo que supera el umbral a `nli`
  (atribuiría al soporte una pérdida de generación y de citas, que son otra cosa).
- **D15 · El generador de los adaptadores falsos.** Con `proveedor: fake` el corpus del servicio lleva, por redacción, una
  opción guionada que cita el chunk esperado con las primeras 12 palabras de la cita como afirmación (para que el humo de la CI
  recorra el camino completo). Con el generador local real esas propuestas no se usan. Descartadas: (a) un `propuestas.yaml` en
  el dataset (mezcla guion de CI con datos de medición real y obliga al LLM real a convivir con él); (b) sin generador (todas las
  redacciones saldrían «sin opciones» y la forma del informe no se ejercitaría).
- **D16 · `RERANKER_MAX_PAIRS` en la configuración.** Con `proveedor: fake` se declara en `diagnostico.reranker_max_pairs` (RN-22,
  20 en `diagnostico-fake.yaml`); con `proveedor: local` manda el del reranker cargado (ADR-39) y declararlo es una configuración
  inválida. El informe registra el valor efectivo (`rerankerMaxPairs`, `null` si no hay corte).
- **D17 · Claves del informe.** `reporte.escribir_reporte` rechaza las claves `texto`, `pregunta`, `cita`, `chunk`… (RN-14), así
  que el recuento de fragmentos del corpus se llama `recuento_de_chunks` y las filas usan `pregunta_id`.
- **D18 · Dónde vive la regla de `revision_provisional`.** No existía en el árbol al empezar este change (`l1d-246` y `l1d-299`
  la crean «después»): se crea aquí en `app/evaluation/revision_provisional.py` (`exigir_revision_provisional`) y `dataset_diagnostico`
  la usa. `l1d-246` (`dataset_opciones`) y `l1d-299` (`dataset_poblacion`) **deben reutilizarla**, no escribir otra.
- **D19 · Par de la Demo 6.** El corpus fijo (`[S7 resp. 10]`) no trae un fragmento sobre las complicaciones de la prostatectomía
  radical; el par `P01` espera el fragmento más cercano que nombra el procedimiento (`ch-nci-prostata-hp-en-2`, «radical
  prostatectomy is generally reserved…»). Mide la sinonimia del procedimiento (US-277), no la calidad clínica de la respuesta;
  queda dicho en el manifiesto del dataset.
- **D20 · Informe legible.** Junto al `.json` se escribe un `.md` con las mismas cifras (D8), generado solo desde el diccionario
  ya validado por el esquema cerrado (no puede llevar más de lo que lleva el JSON).
