# ADR-41 — Evaluación de la calidad de la IA: framework propio con Pytest, métricas deterministas, NLI como juez principal de fidelidad y juez LLM local secundario

> Linear: [L1D-232](https://linear.app/l1der-lab-mjbc/issue/L1D-232) · Historia: US-014 · Feature: FEAT-T5a (L1D-46) · Change: `l1d-232-adr41-framework-evaluacion`
> Plantilla: MADR 4 (variante mínima, en español).

- **Estado:** propuesto (lo acepta el humano al mergear)
- **Fecha:** 2026-10-21
- **Decisores:** usuario (propietario del producto); el encuadre (propio con Pytest, NLI principal, juez G secundario) lo decidió el usuario el 2026-10-21 (`[S2 resp. 3]`, P-3)
- **Consultados / informados:** ai-services-dev (redacción), ai-eval-runner (revisión de coherencia con `run-ai-eval`), privacy-guardian, clinical-language-auditor
- **Requisitos:** FR-20, IA-10, RN-12, RN-13, RN-14, RN-22, RN-23; OL-06 (`readme.md` §6); AC-T5.3, AC-T5.4; C-10

> **Alcance y honestidad de las cifras.** Este ADR no ejecuta ningún modelo ni fija ninguna meta (las metas son de DEC-07 / US-017; las de recuperación son provisionales hasta US-229, nota del usuario en ADR-45). Los hechos de herramientas externas llevan su fuente y fecha de verificación (2026-10-21); lo no verificado está marcado **[supuesto]** y se lista al final.

## Contexto y problema

La suite `evaluate` (US-072) y su exigencia en la Definition of Done (US-074) dependen de una decisión cara de revertir: con qué framework se calculan las métricas de OL-06, cuáles son deterministas, qué juez mide la fidelidad y cómo se adjunta el reporte al PR. Estado de [ADR-39](ADR-39-modelos-locales.md) verificado el 2026-10-21 en `main` (PR #107 fusionado el 2026-10-20): el campo *Estado* de la cabecera dice «aceptado … fase A» y no recoge la fase B; la sección «Fase B» registra que el usuario aceptó el 2026-10-20 el runtime Ollama y G como `LLM_MODEL`, pero el resumen de esa misma sección todavía rotula G como «propuesto, con el riesgo de margen < 1 GB en el stack». Este ADR trata G como el LLM decidido por el usuario, **y el juez secundario depende de ello**: si ADR-39 cambia el LLM, solo cambia `EVAL_JUDGE_MODEL`, no el framework ni el juez principal (NLI). Modelos: LLM `gemma4:26b-a4b-it-q4_K_M` (G) por Ollama `/v1`, NLI `mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` en fp32, BGE-M3 y bge-reranker-v2-m3 en int8. Eso desbloquea el juez local (US-014 solo depende de ADR-39 por la elección del LLM juez).

Base ya escrita en `apps/rag-orchestrator/app/evaluation/` (inventario del 2026-10-21): `retrieval_metrics.py` (acierto@10, MRR, IC 95 % por *bootstrap* con `semilla` recibida por parámetro), `reporte.py` (`escribir_reporte` rechaza claves que podrían contener textos: `CLAVES_PROHIBIDAS`), `dataset_loader.py` (exige `clase: sintetico` en el manifiesto y en cada archivo; `CLASE_SINTETICA`), `config_medicion.py` (`semilla_bootstrap`), `model_selection.py`, subpaquete `vm/` (baseline manual VM-1/VM-2). Tests en `apps/rag-orchestrator/tests/evaluation/` (entre ellos `test_retrieval_metrics.py`, `test_dataset_loader.py`, `test_reproducibilidad_fase_a.py`). Datasets sintéticos en `data/eval/adr39-mini/`, `data/eval/ocr-mini/` y la partición congelada `data/eval/ol06-particion-v1/` (ADR-45); casos de VM en `data/evaluation/vm-baseline/`. `requirements-eval.txt` (dependencias de la medición de ADR-39) no incluye ragas ni DeepEval.

## Factores de decisión

1. **RN-12 / AC-3:** con datos reales solo modelos locales, sin *fallback* a la nube; una herramienta con juez de nube por defecto es un riesgo por olvido de configuración.
2. **AC-2:** misma configuración, mismas métricas deterministas.
3. **RN-14 / RN-13:** el repo es público; solo agregados y configuración; la calibración con datos reales anonimizados corre fuera del repo.
4. **Cobertura de OL-06:** muchas métricas son propias del dominio (citas, "sin evidencia", prescriptivas = 0, PII, eventos, mapeo, faltantes, aplicabilidad); ningún framework genérico las trae.
5. **Superficie de dependencias y mantenimiento**, y licencia académica (CLAUDE.md).
6. **Memoria:** el juez no debe añadir un segundo LLM al tope de 21 GB / stack 30 GB (ADR-39): se reutiliza G.

## Opciones consideradas

Las cuatro del backlog (US-014). Verificado en la fuente el 2026-10-21:

| Hecho | ragas | DeepEval |
|---|---|---|
| Versión más reciente en PyPI | 0.4.3, subida 2026-01-13 (`pypi.org/pypi/ragas/0.4.3/json`) | 4.3.1, subida 2026-10-16 (`pypi.org/pypi/deepeval/4.3.1/json`) |
| Licencia (metadatos PyPI) | Apache-2.0 | Apache-2.0 |
| Dependencias núcleo relevantes (`requires_dist`) | `openai>=1.0.0`, `langchain`, `langchain-core`, `langchain-community`, `langchain_openai` | `openai` (sin fijar), `posthog` (`>=7.0.0,<8.0.0` en Python 3.10+), `opentelemetry-api` y `opentelemetry-sdk` (`>=1.24.0,<2.0.0`), además de `pytest` y plugins |
| Telemetría por defecto | Activa: `do_not_track()` devuelve `False` salvo que `RAGAS_DO_NOT_TRACK=true` (`src/ragas/_analytics.py` en GitHub, rama `main`) | Activa: envía a PostHog nombres de eventos, nombres de métricas, IP pública y un UUID anónimo; se desactiva con `DEEPEVAL_TELEMETRY_OPT_OUT=1` (`deepeval.com/docs/data-privacy`). La página no menciona OpenTelemetry como destino |
| Juez por defecto | **[supuesto]** OpenAI: no se pudo leer en la documentación; lo sugieren `openai` y `langchain_openai` como dependencias núcleo | La documentación implica OpenAI como juez por defecto ("To stop using your local Ollama model and move back to OpenAI…", `deepeval.com/docs/metrics-introduction`) y pide `OPENAI_API_KEY` para métricas con juez |

### Opción A · Propio con Pytest (métricas deterministas + NLI + juez LLM local)

Se amplía la base existente. Fidelidad: NLI por afirmación (el mismo modelo de RN-01) como juez principal; juez LLM G local como secundario.

### Opción B · ragas fijado, solo para la fidelidad

### Opción C · DeepEval

### Opción D · Híbrido (propio para las deterministas, ragas o DeepEval solo para la fidelidad)

## Decisión

Opción elegida: **A, framework propio con Pytest**, porque es la única que cumple a la vez RN-12 por construcción (sin telemetría ni juez de nube en el árbol de dependencias), AC-2 (control total del determinismo) y la cobertura de OL-06 (las métricas propias hay que escribirlas igual con cualquier opción), reutilizando código ya escrito y probado.

### Qué calcula cada opción (AC-1)

Leyenda: **D** = determinista (función pura de entradas fijas y de una semilla de configuración); **NLI** = determinista dado el modelo y su versión fijados (mDeBERTa fp32 en CPU, ADR-39); **J** = usa juez LLM; **—** = la opción no la trae y habría que escribirla. En B, C y D la columna describe la oferta genérica; **[supuesto]** que sus métricas de fidelidad y precisión de contexto existen con esos nombres (el backlog las cita; no se leyó su catálogo completo).

| Familia OL-06 | Métrica | A · propio | B · ragas | C · DeepEval | D · híbrido |
|---|---|---|---|---|---|
| Recuperación | acierto@10 (total y es→en), MRR, IC 95 % *bootstrap* | **D** (ya existe) | — | — | **D** (propio) |
| Recuperación | p95 por etapa | **D** sobre tiempos medidos | — | — | **D** |
| Generación | precisión de citas (la cita está en un chunk recuperado en esa consulta, RN-01/RN-04) | **D** | — | — | **D** |
| Generación | exactitud de "sin evidencia" (RN-02) | **D** | — | — | **D** |
| Generación | salidas prescriptivas (RN-23) | **D** (verificador de RN-23 sobre `CAMPOS_GENERADOS`) | — | — | **D** |
| Generación | inyección efectiva (el chunk esperado entra al contexto) | **D** | — | — | **D** |
| Generación | fidelidad por afirmación y % de opciones con soporte | principal **NLI**; secundaria **J** (G) | **J** con el juez que se configure | **J** con el juez que se configure | **J** en el framework; la misma dependencia de juez |
| OCR | exactitud por campo, OCR crítico, calibración de `auto_aceptado` | **D** | — | — | **D** |
| PII | sensibilidad (y especificidad sobre texto limpio) | **D** | — | — | **D** |
| Eventos | exactitud de eventos y tratamientos previos | **D** | — | — | **D** |
| Datos | duplicados fusionados, conflictos detectados | **D** | — | — | **D** |
| Mapeo | exactitud de mapeo terminológico (RN-27) | **D** | — | — | **D** |
| Faltantes | sensibilidad y especificidad | **D** | — | — | **D** |
| Discrepancias | discrepancias reportadas | **D** | — | — | **D** |
| Aplicabilidad | concordancia de estados por criterio con el dataset | **D** (la concordancia con el oncólogo exige datos revisados, ver Reporte) | — | — | **D** |
| Agente (FR-30) | iteraciones y sub-consultas dentro de `AGENT_MAX_*`; criterios resueltos | **D**; calidad del resultado con **NLI** | — | — | **D** / **NLI** |
| Corpus | exactitud de los metadatos sobre la muestra revisada (RN-25) | **D** | — | — | **D** |

Lectura: **todas las métricas de OL-06 salvo la fidelidad son deterministas y propias**; solo la fidelidad admite juez, y para ella el NLI ya cubre el juez principal. Ragas y DeepEval aportarían únicamente la fila de fidelidad, que no es lo que decide el costo de la suite.

### Fidelidad y juez (AC-3)

- **Principal: NLI** (mDeBERTa del ADR-39) por afirmación contra el texto de los chunks citados. Es el mismo verificador de RN-01, determinista en CPU, y no añade memoria.
- **Secundario: LLM local G** (`gemma4:26b-a4b-it-q4_K_M`, Ollama `/v1`), `temperature=0` y `seed` en configuración. **Sesgo de autoevaluación declarado:** es el mismo modelo que genera. Por eso su cifra se reporta aparte y **nunca decide sola un umbral ni bloquea un PR**; si discrepa del NLI, el reporte lo marca.
- **Nunca un proveedor de nube**, tampoco con datos sintéticos como juez de fidelidad: una sola ruta de juez evita que un olvido de configuración envíe datos reales a la nube (RN-12).
- **Lista local cerrada en código.** `es_proveedor_local()` decide con `HOSTS_LOCALES` definida en el código (loopback `127.0.0.0/8`, `::1`, `localhost`, `host.docker.internal`); **no es configurable**: ninguna variable ni YAML la amplía. Rige para el juez y para todo adapter con URL (LLM, embeddings, reranker, NLI, OCR). Un juez con URL fuera de la lista falla antes de enviar nada.
- **Aborto por clase de dataset.** Si la clase del dataset no es `sintetico`, todos los adapters deben ser locales o la suite aborta con código ≠ 0 sin enviar ningún *request* (extiende la regla que ya aplica `dataset_loader.py`).
- **Datos reales anonimizados:** la calibración corre **fuera del repo**, por ruta local a un volumen cifrado, nunca en la CI (RN-13, RN-14).
- **Test sin red (RN-12):** un test de Pytest bloquea los *sockets* salientes salvo loopback durante la suite y falla si se intenta una conexión. Entra con el primer bloque del *runner* (**US-072a**) junto con `es_proveedor_local()`, no con 072b.

### Reproducibilidad (AC-2)

**Existe hoy (inventario del 2026-10-21):** `semilla_bootstrap` en `config_medicion.py` y su uso en `retrieval_metrics.py` (`metrica`, `_bootstrap_ic`); `huella_sondas` en `trabajos.py` (huella de vectores de sondeo, no de la configuración de la suite); `test_reproducibilidad_fase_a.py` (la configuración congelada de la fase A coincide con su reporte).

**Se crea en US-072a (L1D-235)** y no existe todavía:

- La **huella SHA-256 de la configuración** de la suite, que forma parte del nombre del resultado. Ninguna métrica depende del reloj (se inyecta, CLAUDE.md).
- Semilla de *bootstrap* y repeticiones como configuración de la suite (hoy solo en la configuración de ADR-39).
- Las claves del juez LLM `EVAL_JUDGE_MODEL`, `EVAL_JUDGE_BASE_URL`, `EVAL_JUDGE_TEMPERATURE` (0) y `EVAL_JUDGE_SEED`. **No se promete bit a bit** la salida del juez LLM entre versiones del runtime o del hardware **[supuesto: no se midió]**; por eso su cifra no es «determinista» en la tabla y no decide umbrales.
- El test de que dos corridas con la misma configuración producen métricas deterministas idénticas.

**Se descarta lo que no garantice métricas deterministas idénticas:** una opción cuya métrica determinista dependa de una llamada a un juez LLM o de una red externa queda fuera. Con B, C y D la fidelidad dependería de un juez configurable por el framework; en A el juez principal es el NLI.

### Reporte (AC-4)

JSON de **agregados + configuración**, escrito por `escribir_reporte`. **Límite actual:** `escribir_reporte` y `claves_con_texto` (`reporte.py`) solo rechazan por **nombre de clave** (`CLAVES_PROHIBIDAS`); un texto bajo una clave permitida pasaría. **Regla de esquema cerrado (se crea en US-072a):** el reporte se valida contra una lista blanca de claves, y cada valor es numérico, booleano o una cadena de un conjunto enumerado (identificadores de modelo, versiones, huellas, rótulos); cualquier otra clave o cadena libre hace fallar la escritura. Contenido:

1. Métricas con IC y `n`.
2. **Origen del estado «revisado por el oncólogo»:** un campo del manifiesto del dataset (p. ej. `revision_oncologo` por archivo o por ítem, con la fecha de revisión), que se **crea en US-072a**: `dataset_loader.py` hoy solo conoce `clase`. Por métrica, el conteo de ítems **revisados por el oncólogo** y **no revisados**, y una etiqueta `validada` / `no_validada`. Una métrica solo se rotula `validada` si todo su dataset (o la muestra declarada) fue revisado; la concordancia de aplicabilidad exige revisión.
3. Configuración: modelos (con revisión o digest), prompt (versión o huella), umbrales, `corpusRelease`, `catalogVersion`, semillas, huella de la configuración y clase del dataset.
4. Nunca preguntas, salidas, citas ni datos reales (RN-14). Ejemplos ilustrativos de este ADR usan solo lenguaje descriptivo, por ejemplo "Opciones descritas en la evidencia".

### DoD: cómo se adjunta el reporte al PR (AC-5)

- **Disparadores** (FR-20, AC-T5.4): el PR cambia **modelo, prompt, umbral, catálogo o corpus**. Prevalece el PRD sobre la tarea 5 de OL-06, que omite el catálogo (C-10, H-07 de `backlog/02-adrs.md`).
- **En la CI** corre un job `eval-required` con la configuración de prueba (adapters falsos, datasets sintéticos) y el comparador de regresión contra el baseline; no carga modelos pesados.
- **Con modelos reales** el reporte se genera en la máquina de referencia con `npm run evaluate` y se adjunta al PR como comentario más artefacto en `reports/eval/` (agregados y configuración solamente).
- El PR sin reporte, o con la huella de configuración que no corresponde al diff, no cumple la DoD. El detalle del job lo especifica `l1d-237-eval-required-ci`.

### Consecuencias

- **Positivas:** sin telemetría ni dependencias de nube en el árbol de evaluación; métricas deterministas reproducibles; reutiliza el código y los datasets existentes; sin memoria adicional (el juez reutiliza G y el NLI).
- **Negativas:** más código propio a mantener (mitigado con la base existente y los tests del *runner* con adapters falsos); el juez secundario comparte sesgo con el generador; no hay métricas de RAG prefabricadas.
- **Configuración (RN-22):** `EVAL_JUDGE_MODEL`, `EVAL_JUDGE_BASE_URL`, `EVAL_JUDGE_TEMPERATURE`, `EVAL_JUDGE_SEED`, `EVAL_MAX_REGRESSION` (tolerancia del comparador de regresión), semilla del *bootstrap* y repeticiones; metas y umbrales en configuración (valores de DEC-07, no de este ADR). `HOSTS_LOCALES` queda en código a propósito.

### Confirmación

Existe hoy: `test_retrieval_metrics.py`, `test_dataset_loader.py` (rechazo de `clase` distinta de `sintetico` al cargar) y `test_reproducibilidad_fase_a.py`. **Se crea en US-072a (L1D-235):** test de Pytest sin red y `es_proveedor_local()`; test de aborto de la suite con dataset no `sintetico` y adapters no locales (US-072a); test de dos corridas con la misma configuración y métricas deterministas idénticas; test del esquema cerrado del reporte (rechaza claves y cadenas fuera de la lista blanca, no solo claves prohibidas). **Se crea en l1d-237:** job `eval-required`. Además, revisión de `ai-eval-runner` y del Gate 2.

### Preguntas abiertas

1. **Ruta de los datasets:** OL-06 y la skill `run-ai-eval` dicen `data/evaluation/`; el repo usa `data/eval/` (`adr39-mini`, `ocr-mini`, `ol06-particion-v1`) y `data/evaluation/vm-baseline/`. Decisión pendiente: US-072a fija una sola ruta y actualiza la skill o el ADR.
2. **Baseline en la CI:** `eval-required` con adapters falsos compara contra un baseline propio de la configuración de prueba, **no** contra `data/evaluation/baseline.json` (que corresponde a modelos reales). Se precisa en `l1d-237-eval-required-ci`.
3. **Reporte con modelos reales:** quién lo ejecuta y lo sube (propuesta: quien abre el PR, desde la máquina de referencia) y qué verifica la regla «huella que no corresponde al diff» (propuesta: el job compara la huella del reporte adjunto con la que calcula desde la configuración del PR). Lo cierra `l1d-237-eval-required-ci`.

## Pros y contras de las opciones

### A · Propio con Pytest

- A favor: sin telemetría ni juez de nube en las dependencias; determinismo bajo control; base ya escrita; cubre las métricas propias de OL-06.
- En contra: más código propio.

### B · ragas 0.4.3

- A favor: métricas de RAG prefabricadas **[supuesto]**; Apache-2.0.
- En contra: telemetría activa por defecto (`RAGAS_DO_NOT_TRACK`); `openai` y `langchain*` como dependencias núcleo; juez por defecto probablemente OpenAI **[supuesto]**; última versión de enero de 2026; no calcula las métricas propias de OL-06. **Descartada** (AC-3, AC-2).

### C · DeepEval 4.3.1

- A favor: integración con Pytest; Apache-2.0.
- En contra: telemetría a PostHog activa por defecto; OpenAI como juez por defecto; muchas dependencias (grpcio, opentelemetry, plugins de pytest) y versiones frecuentes (4.3.1 es del 2026-10-16; la frecuencia semanal es un **[supuesto]** no medido); tampoco calcula las métricas propias. **Descartada**.

### D · Híbrido

- A favor: equilibrio entre control y métricas prefabricadas.
- En contra: dos piezas a versionar y el mismo riesgo de B o C en la pieza de fidelidad, que además el NLI ya cubre. **Descartada**.

## Más información

- Historia: `backlog/features/FEAT-T5a-baseline-evaluacion.md` §US-014 y `backlog/02-adrs.md` §US-014. Desbloquea `l1d-235-suite-evaluate`, `l1d-236-calibracion-umbral-baseline`, `l1d-237-eval-required-ci` y FEAT-T5b.
- [ADR-39](ADR-39-modelos-locales.md) (modelos, fase B), [ADR-45](ADR-45-mejora-recuperacion-ol06.md) (partición y metas provisionales), OL-06 en `readme.md` §6.
- Fuentes verificadas el 2026-10-21: `https://pypi.org/pypi/ragas/json`, `https://pypi.org/pypi/deepeval/json`, `https://raw.githubusercontent.com/explodinggradients/ragas/main/src/ragas/_analytics.py`, `https://deepeval.com/docs/data-privacy`, `https://deepeval.com/docs/metrics-introduction`.
- Revisión prevista: al cerrar US-072b (primer reporte con juez real) y si ragas o DeepEval cambian telemetría o juez por defecto.

### Supuestos no verificados

1. Juez por defecto de ragas (OpenAI): inferido de sus dependencias, no leído en la documentación.
2. Nombres y alcance de las métricas de fidelidad de ragas y DeepEval: tomados del backlog.
3. "Versiones frecuentes" de DeepEval: sin serie de versiones leída.
4. Determinismo bit a bit del juez LLM con `temperature=0` y `seed` en Ollama entre versiones y hardware: no medido.

## Trazabilidad de los AC

| AC | Sección de este ADR |
|---|---|
| AC-1 | Opciones consideradas; "Qué calcula cada opción" |
| AC-2 | "Reproducibilidad" |
| AC-3 | "Fidelidad y juez"; descarte de B, C y D |
| AC-4 | "Reporte" (esquema cerrado y origen de «revisado») |
| AC-5 | "DoD: cómo se adjunta el reporte al PR"; "Preguntas abiertas" 2 y 3 |
