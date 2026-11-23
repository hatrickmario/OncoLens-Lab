# Design — l1d-331-cobertura-prostata-segundo-loop

## Context

Ver `proposal.md`. Estado del código tras el S6 (PR #388 y #392):

- `apps/rag-orchestrator/app/domain/terminos_del_caso.py`: regla pura. Compone, en orden, tipo (etiqueta CIE-10),
  estadio y grado (Gleason/ISUP) y biomarcador principal. `_del_biomarcador_principal` salta los nombres de
  `CatalogoDeTerminos.biomarcadores_no_anclables`.
- `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json` (1.8.0): `expansion.biomarcadoresNoAnclables.prostata
  = ["psa"]`. Lo carga `app/infrastructure/catalogo_clinico/terminos_del_caso.py`.
- `app/domain/expansion_contextual.py`: `consulta_contextual()` (pregunta original primero, términos después) y el
  conjunto cerrado `FORMATOS_DE_CONSULTA = ("plano",)`, leído de `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT`.
- `app/application/rag_orchestrator_service.py`: `_loop_contextual_si_corresponde` y el evento
  `rag_query_expansion_contextual` (solo `traceId`, campos y número de términos).
- Tests: `tests/unit/test_terminos_del_caso.py` y `tests/integration/test_rag_query_contextual.py` llevan
  `@pytest.mark.ac("US-273", 1)` y `("US-273", 5)`. **Ninguno lleva `("US-273", 3)`.**
- Consultas de hoy con los casos del fixture `temas-del-caso.json`: `prostata-con-grado` → «… Cáncer de próstata IIB
  ISUP 3»; `prostata-con-psa-y-hrr` → «… Cáncer de próstata IIB ISUP 3 HRR positivo».
- `app/evaluation/` **no tiene** hoy una medición del loop contextual: las cifras 9/22 y 13/22 salieron de scripts del
  scratchpad (D6-60). La familia `contextual` la crea `l1d-329-segundo-loop-ac9-reporte`.

## Goals / Non-Goals

**Goals:** test propio del AC-3 con próstata; cobertura de próstata medida desde el repo y con reporte versionado;
decidir con datos si la composición necesita cambiar.

**Non-Goals:** fijar un remedio antes de medir; tocar umbral, modelos, gate G1 o contrato.

## Decisions

**D1 · El AC-3 se cierra con un test, sin delta.** El escenario «Solo términos del catálogo `[US-273 AC-3]`» ya está en
`openspec/specs/evidence-analysis/spec.md`. Se añade un test de integración con el caso de próstata, texto libre
sembrado, `pseudoPatientId`, PSA con valor y un biomarcador con valor fuera del catálogo. Comprueba la consulta que
reciben el embedder y el *reranker* y los *logs* (`caplog`). El comportamiento ya existe: el test puede nacer en
verde. En ese caso no hay commit `feat`; el PR lo declara y la tarea registra una mutación local sin commitear que lo
pone en rojo (ver Pendientes, P-2).

**D2 · La medición amplía la familia `contextual`, no crea otra.** La crea `l1d-329-segundo-loop-ac9-reporte` (estado
por pregunta, recuentos, `contextual.casos` con `mama-completo` y `prostata-con-grado`, corpus del dataset
`s5-corpus-ampliado`). Este change le añade, **antes de la corrida base**, el caso
`prostata-con-psa-y-hrr`, el top-3 por pregunta, la meta por caso y la comparación con un reporte base. Descartado: un script propio (repite D6-60) y usar la familia
`diagnostico` de L1D-334 (mide pares de paráfrasis con evidencia esperada; las genéricas no tienen cita esperada).

**D3 · Casos de la medición.** Los dos casos sintéticos de próstata ya versionados en
`packages/clinical-catalogs/test/fixtures/temas-del-caso.json` (`prostata-con-grado` y `prostata-con-psa-y-hrr`), los
mismos del S6, para que las cifras sean comparables. No se inventa un caso nuevo.

**D4 · La meta es configuración.** `contextual.genericas_con_evidencia_minimo` en la configuración de la suite, con el
valor de US-273 AC-2 como inicial (RN-22). El reporte la compara; no la cambia.

**D5 · La composición no cambia antes de medir.** Orden:

0. Antes de la corrida base: la parte de código de este change (tareas 1.1–1.5) ya está en `main`, tras `l1d-329`.
   Sin ella el reporte base no trae el caso `prostata-con-psa-y-hrr`, el top-3 ni la meta.
1. Corrida base: cobertura por caso con el código actual y, con el diagnóstico de L1D-334, en qué etapa se pierden las
   genéricas (búsqueda densa, corte de pares, umbral).
2. Corrida final: la misma medición, sobre el mismo corpus (`[S7 resp. 10]`) y con los umbrales actuales
   (`[S7 resp. 11]`), con el código y el catálogo de `main` en ese momento (`l1d-335`, `l1d-126`). Los brazos de
   US-278 y US-279 no entran en esta familia: se miden sobre la ingesta de `l1d-119`.
3. Solo si la meta no se alcanza **y** la pérdida es atribuible a la consulta, el humano elige una opción:

| Opción | Qué cambia | Costo | Estado |
|---|---|---|---|
| A · No tocar la composición | Nada; la cobertura depende de US-278, US-279 y el corpus | Ninguno | Por defecto |
| B · Formato nuevo de consulta | Un valor más en `FORMATOS_DE_CONSULTA` (p. ej. cada término con el rótulo de su campo del catálogo); se activa con `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT` | Bajo: configuración, reversible, sin contrato; exige `evaluate` | Hipótesis |
| C · Más términos del catálogo por tipo | Sección declarativa en `expansion` del léxico; versión nueva del catálogo | Medio: catálogo, cadena de versiones con L1D-335 y L1D-126 | Hipótesis |
| D · Campos nuevos del caso | Amplía el enum `contextExpansion.fields` | Alto: contrato (ADR-26) | Fuera de alcance: historia nueva |

B y C son hipótesis sin medir: ninguna cifra las respalda todavía. Si se elige B o C, antes del código se añade su
delta `MODIFIED` de `evidence-analysis` (y de `clinical-catalogs` en C) con `/opsx:update` y pasa por Gate 1.
En cualquier opción: términos solo del catálogo (RN-27), pregunta original primero, sin LLM y sin nube (RN-02, RN-12),
mama idéntica (US-273 AC-5).

**D6 · Criterio de cierre.** La historia se cierra cuando el reporte de la corrida final existe en `reports/eval/` y
(a) los dos casos alcanzan la meta, o (b) el usuario decide el criterio de cobertura de próstata (D6-57) sobre ese
reporte y el AC-2 se actualiza en el Markdown del backlog (lo hace la sesión principal, no este change).

## Decisiones de implementación (S7, ai-services)

- **I1 · Dónde se toma el top-3.** La respuesta de `/rag/query` no trae los chunks bajo el umbral ni el puntaje por chunk, y
  añadírselos cambiaría el contrato. Opciones: (a) ampliar `Observaciones.rankings` de `medidores.py` (indexado por texto de
  pregunta y sin `chunk_id`; lo usan las demás familias); (b) leer los logs de producción; (c) un decorador del puerto
  `Reranker` propio de la familia (`app/evaluation/ranking_contextual.py`), como hace `diagnostico` con sus observadores.
  **Elegida (c)**: aditiva, sin tocar `medidores.py`, `composicion_suite.py` ni `evaluate.py` (el PR de L1D-113 los toca), cumple
  el contrato del puerto (LSP) y guarda solo id y puntaje. Descartadas (a) por riesgo de conflicto y por no tener el id, y (b)
  porque los logs no llevan puntajes por chunk (RN-14).
- **I2 · Meta por caso o por conjunto.** Opciones: una clave única aplicada a todos los casos de la corrida, una lista de casos
  objetivo, o un mapa caso → meta. **Elegida: una clave única** `contextual.genericas_con_evidencia_minimo` (RN-22) y el
  reporte la compara en cada caso (`cumple` = `>=`); los casos de mama también figuran, informativos. Descartadas las otras
  por añadir claves antes de que el usuario decida el criterio (D6-57, P-3).
- **I3 · Reporte base.** Opciones: flag `--base` en `evaluate.py`, o clave opcional `contextual.reporte_base` en la configuración.
  **Elegida la clave** (no toca el parser compartido; su ruta entra en la huella). La clave ausente significa «sin comparación»:
  es la única de la familia que puede faltar, porque no es un valor «a calibrar». Se comprueba el corpus **antes** de medir
  (`dataset` y `corpus` idénticos); si no coincide, `SuiteAbortada` (código 1) sin escribir nada.
- **I4 · Qué es «empeora».** El dataset de la familia no declara evidencia esperada, así que recall@10 y MRR de US-273 AC-2 no se
  pueden calcular aquí (desviación del delta, que los nombra; los miden las familias con evidencia esperada, `all`). Se
  comparan, por ámbito común: genéricas con evidencia, controles con evidencia (bajar es empeorar) y falsos positivos de las
  adversarias, es decir `con_tema` con evidencia (subir es empeorar). El texto del delta sigue pendiente de ajuste en un
  `/opsx:update` si el usuario quiere recall/MRR en esta familia.
- **I5 · Sin términos del catálogo.** El test del runner usa una copia temporal del catálogo en la que el tipo pierde su
  etiqueta CIE-10 y un caso de próstata sin estadio, grado ni biomarcador conocido: no hay segunda recuperación, la pregunta
  queda `sin_evidencia`, `top_relevance_score` es `null` y `llamadas_al_generador` es 0. El caso del fixture `tipo-sin-etiqueta`
  (leucemia) no sirve: el tipo no está habilitado y el servicio responde `422`.
- **I6 · AC-3 en verde.** P-2 aceptada por la planificación: el test nació en verde y su evidencia es la mutación local de
  `tasks.md` 1.1 (el commit `feat` no existe para esta AC).
- Con adaptadores falsos la mayoría de las adversarias sale con evidencia (el *reranker* léxico falso no distingue temas): las
  cifras fake no dicen nada del RAG real y los «0 falsos positivos» se miden en la corrida base real (H-1), no en la CI.

## Ajustes del Gate 2 y deuda (S7)

- **Falso positivo único.** `es_falso_positivo(fila)` (adversaria que superó el umbral, con salida válida o no) es la definición
  de `adversarias_por_caso` y de la comparación; `recuentos[]` lleva `superaron_umbral` y el reporte base debe traerlo. El
  reporte base se valida contra el esquema cerrado, la suite `contextual` y las tres clases por ámbito (`null` ≠ `0`).
- **Top-3** con la regla del servicio (orden estable por puntaje descendente; en empate manda el orden denso) y `zip(strict=True)`.
- **Clase sintética:** `exigir_clase_sintetica(clase, archivo, familia)` recibe la clase (Introduce Parameter); `contextual` y
  `diagnostico` la usan también para el corpus, y la solicitud lleva `dataset.corpus.clase`, no un literal.
- **Meta en casos que no son de próstata:** la clave es única; el informe lo declara en texto (informativo). Un campo explícito
  por caso exigiría una clave de configuración más: descartado por ahora (I2).
- **Deuda registrada fuera de este change:** D7-12 unificar el vocabulario `con_evidencia` entre familias; D7-13 observar el
  soporte NLI donde se conoce el plan (heurística de agrupación); D7-14 adoptar `exigir_clase_sintetica` en
  aplicabilidad/chat/opciones/loader; D7-15 trocear `corrida_contextual.py` y `corrida_diagnostico.py` (informes aparte);
  D7-16 `validar_ancho_de_tramo` y otros P3.

## Privacidad y ownership

- Solo `rag-orchestrator`. No se toca `clinical-api`, PostgreSQL clínico ni `clinical-minio`; ningún dato cruza una
  frontera nueva.
- Casos y preguntas **sintéticos** (`clase: sintetico`); ningún dato real (RN-13, RN-14).
- El test del AC-3 siembra texto libre, identidad y `pseudoPatientId` para comprobar que **no** salen en la consulta ni
  en los *logs* (RN-10, RN-11).
- El reporte lleva ids, puestos, puntajes y recuentos; sin texto de preguntas, consultas ni chunks. Rótulo
  `no_validada` del runner.
- Modelos locales únicamente; sin *fallback* a la nube (RN-12).

## Contratos

Sin cambios. No se edita ningún `openapi.yaml` ni `contracts/examples/`; `contextExpansion.fields` conserva su enum.
No hay sección `## contratos` en `tasks.md`. La opción D lo cambiaría y por eso queda fuera.

## Dependencias y colaboradores

- **Se modifica:** `tests/integration/test_rag_query_contextual.py` (test del AC-3; reutiliza `arnes_contextual.py` y
  `_solicitud_de_prostata`).
- **Se amplía:** la familia `contextual` (`config_contextual.py`, `corrida_contextual.py`, `metricas/contextual.py`, de
  `l1d-329-segundo-loop-ac9-reporte`): caso adicional en `contextual.casos`, métrica pura `genericas_con_evidencia_por_caso()` y comparación con el reporte base en
  `app/evaluation/metricas/`. Depende de los puertos del servicio (`ChunkSearch`, `Reranker`, `Embedder`), nunca de
  clientes concretos.
- **Regla con un solo dueño:** «con evidencia» es la del servicio (`RELEVANCE_THRESHOLD` de `Settings`); la métrica
  lee el resultado de `/rag/query`, no vuelve a aplicar el umbral.
- **Fakes:** los de la suite (`app/evaluation/adaptadores_falsos.py`) y los del arnés (`tests/support/recuperacion.py`);
  su test de contrato vive en `tests/evaluation/test_contrato_de_envoltorios.py`. No se crea ningún fake nuevo.
- **No se toca** `app/domain/terminos_del_caso.py` salvo que el humano elija B o C.

## Evaluación

Métricas OL-06 afectadas: ninguna cambia por este change si la opción es A. Se **miden**: genéricas con evidencia por
caso de próstata, top-3 por pregunta, recall@10, MRR, controles y adversarias de las 60 preguntas (0 falsos positivos
en las 24; `sin_evidencia` con `topRelevanceScore = null` y 0 llamadas al LLM). Con B o C, `run-ai-eval` es
obligatorio (cambia la consulta o el catálogo). Las corridas reales son las dos del S7; una a la vez, sin Docker en
paralelo.

## Risks / Trade-offs

- Si `l1d-329-segundo-loop-ac9-reporte` no se mergea antes, las tareas 1.2…1.5 quedan bloqueadas (el test del AC-3,
  1.1, no depende de él). Si 1.2…1.5 no llegan a `main` antes de la corrida base, el reporte base sale sin el segundo
  caso de próstata y la comparación base frente a final de AC-2 no existe: la corrida base no se lanza sin ellas.
- Limitación declarada (`[S7 resp. 10]`): la familia `contextual` usa el corpus del dataset, no la ingesta de
  `l1d-119`. El efecto del corpus ingerido, de las ventanas del *reranker* (US-278) y del contexto del chunk (US-279)
  sobre la cobertura de próstata no se ve en esta medición. Lo que puede moverla entre base y final es el catálogo
  (`l1d-335`) y, si se elige, la opción B o C.
- La meta puede no alcanzarse con ninguna opción barata → decisión del usuario (D6).
- L1D-335 amplía los sinónimos: una pregunta genérica no debe pasar a «con tema» (US-271 AC-8); lo cubre su test
  existente y se vuelve a medir.
- Las cifras del S6 no son comparables con las del S7 (corpus, pares y código distintos): la comparación válida es
  base frente a final del mismo sprint.

## Pendientes de definir

- **P-1: resuelta.** Corpus: solo el del dataset `s5-corpus-ampliado` en memoria, el mismo en la base y en la final y
  registrado en cada reporte (`[S7 resp. 10]`); no se mide sobre el índice de `l1d-119`. Casos:
  `l1d-329-segundo-loop-ac9-reporte` fija `mama-completo` y `prostata-con-grado`, y este change añade
  `prostata-con-psa-y-hrr` antes de la corrida base (propuesta de planificación; se aprueba con el plan).
- **P-2 (humano):** ¿se acepta que el test del AC-3 nazca en verde, con la mutación local como evidencia?
- **P-3 (usuario, corrida final):** criterio de cobertura de próstata (D6-57): mantener la meta de US-273 AC-2, exigirla
  por caso o en conjunto, o cambiarla.
- **P-4 (usuario, tras la corrida base):** opción A, B o C de D5.
