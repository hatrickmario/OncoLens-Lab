# Design — l1d-329-segundo-loop-ac9-reporte

## Context

- Residual de L1D-329 (US-271): falta el test y el reporte del AC-9 (D6-33). El comportamiento de producción ya está en
  `main` y archivado; este change **no lo toca**.
- El runner `python -m app.evaluation.evaluate --config <ruta> --suite <familia>` (US-072, ADR-41) ya tiene familias
  con configuración propia fuera de `all` (`aplicabilidad`, `poblacion`, `opciones`; `diagnostico` llega con `l1d-334`).
- Las 60 preguntas sintéticas de la medición de ADR-52 están versionadas en
  `data/eval/s5-corpus-ampliado/preguntas-contextuales.yaml` (22 `generica`, 24 `con_tema`, 14 `control`; `CTX-C12`,
  `CTX-C13` y `CTX-C14` son las de sinónimos). Los 8 casos sintéticos desidentificados están en
  `packages/clinical-catalogs/test/fixtures/temas-del-caso.json`.
- `--suite all` no pasa contexto de caso al servicio, por eso no mide la expansión (D6-60).

## Goals / Non-Goals

**Goals:** test de aceptación del AC-9; familia mínima que deje el reporte reproducible desde el repo; causa escrita
para cada pregunta de sinónimos que no pase.
**Non-Goals:** hacer que las 3 preguntas pasen; suite del nodo de relevancia; diagnóstico por etapa; comparar con metas
de OL-06; cambiar valores por defecto.

## Decisions

**D1 · Familia nueva `contextual`, fuera de `all`.** Configuraciones `eval/configs/contextual-fake.yaml` (CI) y
`contextual-local.yaml` (`proveedor: local`, corrida base). Descartadas en una línea: un script suelto (prohibido por
la regla del S7), ampliar `retrieval` (cambia la huella del baseline) y meter las 3 preguntas en `parafrasis-v1` de
`l1d-334` (su cargador exige una cita literal del corpus, y aquí la causa posible es justo que el término no esté).

**D2 · Corpus de la corrida: el del dataset `s5-corpus-ampliado`, en memoria (decidido, `[S7 resp. 10]`).** Un corpus
fijo para la familia `contextual`, el mismo en la corrida base y en la final. Es el de la medición de ADR-52 y no
depende de la ingesta de `l1d-119`. La familia indexa los chunks del dataset igual que `retrieval`. Cada reporte
registra el corpus con el que corrió (ruta del dataset, su versión y el recuento de chunks), para que base y final
solo se comparen si coinciden.

**D3 · Preguntas de sinónimos declaradas en la configuración.** `contextual.preguntas_de_sinonimos: [{pregunta:
CTX-C12, termino: antraciclinas}, {pregunta: CTX-C13, termino: pertuzumab}, {pregunta: CTX-C14, termino: TILs}]`.
`preguntas-contextuales.yaml` no cambia: es la muestra congelada de ADR-52 y tiene una copia verificada en
`tests/fixtures/expansion_contextual/`. `termino` debe ser un `terminoCanonico` del catálogo montado; si no, la suite no
corre.

**D4 · Regla de la causa (pura, `metricas/contextual.py`, `causa_de_sinonimo()`).** Para una pregunta de sinónimos:

| Condición | Resultado |
|---|---|
| algún chunk supera `RELEVANCE_THRESHOLD` | `supero_umbral: true`, `causa: null` |
| ninguna forma del término (canónica o sinónimo, es/en, sin distinguir mayúsculas ni tildes) aparece en un chunk del corpus de la corrida | `termino_ausente_del_corpus` |
| alguna forma aparece y ningún chunk supera el umbral | `bajo_umbral_con_termino_en_corpus` (el detalle por etapa es de `l1d-334`) |

Las formas del término son **todos** los textos de `sinonimos[]` de ese término, sea cual sea su relación: la pregunta
es si el término aparece en el corpus con cualquiera de sus nombres, no si esos nombres expanden una consulta. La
familia las obtiene por un único punto, `formas_del_termino()` en `corrida_contextual.py`, que lee el cargador de
`app/infrastructure/catalogo_clinico/sinonimos.py`; la regla no reescribe la normalización. Hoy ese cargador
(`cargar_sinonimos`) devuelve todos los textos. `l1d-335` llega después, lo limita a los `equivalente` y añade
`cargar_formas_por_termino` con todos los textos: en ese change `formas_del_termino()` se repunta a él (su tarea 2.5b).
Para que el cambio no pase en silencio, este change deja el test «cuenta como forma cada texto de `sinonimos[]` del
término»: queda en rojo si alguien lee solo los equivalentes. El texto de la tabla va en el informe.

**D5 · Casos.** `contextual.casos` lista ids del fixture; cada pregunta corre una vez por caso. Este change fija
`mama-completo` y `prostata-con-grado` en `contextual-fake.yaml` y `contextual-local.yaml`. `l1d-331` añade
`prostata-con-psa-y-hrr` antes de la corrida base (lo necesita US-273 AC-2). La corrida base y la final ejecutan los
**tres** casos (propuesta de planificación; se aprueba con el plan). La solicitud se arma con `solicitud_base()` del
runner más el `clinicalContext` del caso; el `pseudoPatientId` lo genera el generador inyectado de la suite.

**D6 · Indicador y tope de pares desde la configuración.** `contextual.expansion_habilitada` y, con `proveedor: local`,
el `RERANKER_MAX_PAIRS` del entorno de ADR-39, como hoy. Ninguna constante local (RN-22). `RELEVANCE_THRESHOLD` se lee
de `umbrales` de la suite: los umbrales actuales en la corrida base y en la final; los calibrados entran en la final
como un brazo aparte que aporta `l1d-119` (`[S7 resp. 11]`).

**D7 · `null` distinto de `0.0`.** `top_relevance_score` y `causa` son `null` cuando no aplican; nunca `0.0` ni un
centinela de texto.

**D8 · Informe.** JSON con la tabla por pregunta y caso, los recuentos por clase, la sección `sinonimos`, la regla D4,
la configuración y su huella, y un `.md` con las mismas cifras. Rótulo `no_validada` (`rotulo.py`). No compara con metas
ni decide PASS o FAIL por las cifras: el AC-9 se cumple si las 3 preguntas tienen `supero_umbral: true` o una causa.

## Privacidad y ownership

- Todo corre dentro de `rag-orchestrator`, con corpus público con licencia registrada, preguntas sintéticas y casos
  sintéticos del fixture. Ningún dato cruza web → clinical-api → rag-orchestrator. `rag-orchestrator` no toca datos
  clínicos ni `clinical-minio` (RN-10); la familia no abre conexión al PostgreSQL clínico.
- El `clinicalContext` del fixture ya está desidentificado (RN-11); los términos añadidos a la consulta salen del
  catálogo (RN-27), como en producción.
- LLM solo local (RN-12): lista cerrada del runner, sin *fallback* a la nube.
- El informe y los errores no llevan texto de preguntas, chunks, términos del caso ni salidas del LLM (RN-14); las
  guardas de `guardas.py` rechazan una clase distinta de `sintetico` (RN-13).
- NCCN y ESMO: ninguna pregunta ni cita toma contenido de esas guías.

## Contratos

Sin cambio de `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni `contracts/examples/`. Proveedor
y consumidores no cambian; oasdiff no aplica; compatible con ADR-26. `esquema_suite.py` (esquema interno del runner, no
HTTP) gana la sección `contextual`.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `app/evaluation/config_suite.py`, `evaluate.py`, `esquema_suite.py` | familia `contextual` y su sección | runner (US-072); va tras `l1d-334` |
| `app/evaluation/config_contextual.py` (nuevo) | `casos`, `casos_ruta`, `expansion_habilitada`, `preguntas_de_sinonimos` | `config_suite.py` |
| `app/evaluation/metricas/contextual.py` (nuevo) | `causa_de_sinonimo()`, `recuentos_por_clase()` | tipos puros |
| `app/evaluation/corrida_contextual.py` (nuevo) | arma el servicio con `componer_servicio`, corre preguntas × casos y arma el informe | `composicion_suite.py`, `corrida.py`, `rotulo.py`, puerto de sinónimos |
| `eval/configs/contextual-fake.yaml`, `contextual-local.yaml`, `contextual-local-apagado.yaml` (nuevos) | adaptadores y parámetros | `modelos_locales.py` |
| `scripts/eval/evaluate.mjs` | configuración por defecto de la familia | — |

Producción no se toca. La corrida depende de puertos, nunca de clientes concretos. **Fakes:** no crea ninguno; usa
`adaptadores_falsos.py` y `tests/evaluation/modelos_falsos.py`, que ya pasan `test_contrato_de_envoltorios.py`.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: añade una familia. No mueve metas de OL-06.

- `run-ai-eval` confirma que `--suite all` da el mismo `baseline.json` y la misma huella de `test-fake.yaml`.
- La medición real corre en la **corrida base** del S7 con `contextual-local.yaml`; la ejecuta `ai-eval-runner` y el
  informe queda en `reports/eval/l1d-329-segundo-loop-ac9-reporte.{json,md}`.
- Este change no adelanta ninguna cifra. Las de la medición de ADR-52 (genéricas con evidencia, falsos positivos) son
  referencia histórica sin reporte versionado: el informe nuevo no las da por línea base.

## Risks / Trade-offs

- **La familia es más que «un test»:** unas pocas piezas del runner. Es el mínimo para que `run-ai-eval` produzca el
  reporte; sin ella solo cabría un script, que el S7 prohíbe.
- **Choque de archivos con `l1d-334`** (los tres módulos del runner y `evaluate.mjs`): se resuelve por orden de merge.
- **Duración de la corrida real:** 60 preguntas × casos con generación; con los tres casos de D5, 180 consultas.
- **Limitación del reporte: la causa de CTX-C13 puede cambiar entre la base y la final por el catálogo, no por la
  recuperación.** CTX-C13 es la pregunta de `pertuzumab`. `l1d-335` (S-4) saca «doble bloqueo anti-HER2» de los
  equivalentes de `pertuzumab` y lo hace término propio. En la corrida final la pregunta puede dejar de expandirse con
  `pertuzumab` y pasar de superar el umbral a `bajo_umbral_con_termino_en_corpus`, o al revés, sin que la búsqueda
  haya cambiado. El reporte final lo anota junto a la fila y registra la versión del catálogo de cada corrida; una
  diferencia en CTX-C13 no se lee como regresión de la recuperación.

## Pendientes de definir

- **Casos de la corrida real (D5).** La medición de ADR-52 no dejó escrito con qué casos corrió. Propuesta de
  planificación: `mama-completo` y `prostata-con-grado` (este change) más `prostata-con-psa-y-hrr` (`l1d-331`). Se
  aprueba con el plan del sprint. Afecta: `contextual-local.yaml` y la duración de la corrida.
- **Corpus (D2): resuelto** por `[S7 resp. 10]` (dataset `s5-corpus-ampliado` en memoria, el mismo en base y final).
