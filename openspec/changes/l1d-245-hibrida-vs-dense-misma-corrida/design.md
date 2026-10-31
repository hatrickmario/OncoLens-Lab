# Design — l1d-245-hibrida-vs-dense-misma-corrida

## Context

La suite `evaluate` ya mide recall@10 y MRR (`retrieval_metrics.py`, `corrida.py`) y compara contra un baseline (`comparar_regresion.py`, `regresion.py`). US-112 (`l1d-109`) añade `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K` y `HYBRID_SPARSE_WEIGHT`; US-233a cablea los modelos locales. Aquí se añade una corrida **multi-brazo en una sola ejecución**: los tres brazos comparten índice, modelos, corpus y preguntas, de modo que la diferencia es atribuible solo al modo de recuperación. Medición (suite `evaluate`), no TDD de producto; la lógica de decisión (retroceso, guarda de partición) sí es código con test.

## Decisiones

- **Brazos como configuración, no como código:** `eval/configs/s4-hibrida.yaml` declara `brazos: [A0, A2, A2b]` con las claves de l1d-109: A0 `RETRIEVAL_MODE = dense`; A2 `hibrida` + `RETRIEVAL_FUSION = rrf` + `RRF_K = 60`; A2b `hibrida` + `ponderada` + `HYBRID_SPARSE_WEIGHT = 0,3`. Hiperparámetros de la fuente, sin barrer (ADR-45 P1).
- **Diferencia frente a A0 en la misma corrida:** función pura `diferencia_frente_referencia(metricas_brazo, metricas_a0)` por métrica; sin baseline externo `[S4 resp. 19]`.
- **Retroceso:** función pura `marcar_retroceso(diferencias, tolerancia)`; `RETRIEVAL_REGRESSION_TOLERANCE` vive en la configuración de la suite (RN-22), sin valor por defecto inventado: lo fija la preinscripción P1. Cualquiera de las tres métricas peor que la tolerancia marca el brazo; código de salida ≠ 0 si hay algún retroceso.
- **Trazabilidad:** cada resultado de consulta lleva `retrievalMode`, `fusion` y `fusionParam` de `meta.retrievalParams` (forma de l1d-109, sin `null`); el reporte verifica 100 % de coherencia brazo ↔ (`dense`, `ninguna`, 0) / (`hibrida`, `rrf`, 60) / (`hibrida`, `ponderada`, 0,3) y, si no, falla.
- **Guarda de partición (P2):** el cargador de dataset recibe `conjunto: desarrollo`, filtra por `particion.yaml`, verifica `golden_sha256` contra el golden vigente y no abre archivos de validación/prueba (test con detección de lectura). Cambiar la partición exige `ol06-particion-v2`.
- **Determinismo (AC-4):** con adapters falsos, semilla e IDs inyectados; dos corridas, métricas idénticas.
- **Alternativas:** comparar contra el baseline del S1 (descartada: falsos y otros modelos); corridas separadas por brazo (descartada: índice y modelos podrían diferir).

## Dependencias y colaboradores

- Modifica o extiende: `app/evaluation/corrida.py`, `config_suite.py`, `reporte.py`/`armado_reporte.py`, `dataset_loader.py`, `retrieval_metrics.py`, `regresion.py`; nuevo `app/evaluation/brazos_recuperacion.py` (funciones puras) y config `eval/configs/s4-hibrida.yaml`; preinscripción en `docs/` (ADR-45 P1). `scripts/ci/eval-required.mjs` solo si debe reconocer la nueva config.
- Reglas con nombre propio: `marcar_retroceso()`, `diferencia_frente_referencia()`, `verificar_golden_sha256()`.
- Coordinación con **l1d-298** (misma capacidad, mismos archivos `corrida.py`, `config_suite.py`, `armado_reporte.py`): ambos son ADDED, pero las tareas deben rebasarse sobre el merge de l1d-298. Con **`l1d-109-busqueda-hibrida-retrieval-mode`** (claves `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K`, `HYBRID_SPARSE_WEIGHT`; campos `fusion`/`fusionParam` de `rag-orchestrator` 1.7.0).

## Privacidad y ownership

Solo `rag-orchestrator`, solo datos sintéticos (`clase: sintetico`, RN-14); sin datos clínicos, sin `clinical-minio`. Con modelos locales y sin llamadas a la nube (RN-12, guardas de l1d-298). El reporte contiene agregados y configuración, sin textos de preguntas ni fragmentos.

## Contratos

Sin cambio de API ni de `openapi.yaml`. Las claves de reporte son aditivas. `meta.retrievalParams` (`retrievalMode`, `fusion`, `fusionParam`) es del contrato de la consulta (l1d-109, `rag-orchestrator` 1.7.0); aquí solo se lee.

## Evaluación

Es el entregable: `ai-eval-runner` ejecuta `evaluate --config eval/configs/s4-hibrida.yaml` con modelos locales (US-233a) y su reporte va a `reports/eval/`. Sin retroceso, la demo puede usar `hibrida` `[S4 resp. 17]`; con retroceso sigue en `dense`. Una corrida real no es válida si la preinscripción P1 no está commiteada antes.

## Risks / Trade-offs

- 36 preguntas con respuesta en desarrollo: diferencias pequeñas son ruido; el reporte incluye IC pareado/bootstrap y no se concluye sobre un solo documento (P12). El retroceso se decide con la regla preinscrita, no a ojo.
- Fallos de A0 por etiqueta de pasaje único (auditoría P10 fuera de alcance) pueden sesgar a ambos brazos por igual.
- Solapamiento de archivos con l1d-298: ordenar merges.

## Decisiones tomadas en la implementación

- **Tolerancia en puntos absolutos** (brazo − A0 < −tolerancia), provisional hasta que la preinscripción P1 diga otra cosa; una diferencia `null` (sin preguntas medibles) no cuenta como retroceso. `RETRIEVAL_REGRESSION_TOLERANCE` llega por `comparacion.tolerancia_retroceso` o por la variable de entorno del mismo nombre (que sustituye al YAML y entra en la huella); `s4-hibrida.yaml` no lleva valor.
- **Código de salida 3** = retroceso (el 1 sigue siendo «la suite se negó a correr», el 2 «uso o configuración inválidos»). El reporte se escribe antes de salir.
- **Reporte:** el reporte principal es el del brazo A0; la sección aditiva `comparacion_recuperacion` trae, por brazo, `retrievalMode`/`fusion`/`fusionParam`, `huellaConfig`, recall@10 total y es→en con MRR (con sus IC), diferencias frente a A0, `retroceso`, `trazabilidad {consultas, coherentes}` (si alguna consulta trae el `retrievalParams` de otro brazo la corrida aborta sin escribir), `sin_terminos_lexicos {n, proporcion}` (Q-1 de l1d-109) y `por_documento` (P12).
- **Pregunta sin términos léxicos:** la rama *sparse* falla cerrada (503); en la comparación esa pregunta se cuenta, no tiene `meta` y suma como fallo de recall (ranking vacío). Un 503 que no sea de «sin términos» sigue abortando la corrida.
- **Guarda de partición:** `golden_sha256` se compara con `<origen>/<archivo_golden>` del `manifest.yaml` de la partición (por defecto `golden.yaml`, así que `ol06-particion-v1` no cambia). La CI usa una partición sintética del fixture FX-T5a-a (`apps/rag-orchestrator/eval/particiones/fx-t5a-a/`) porque los ids de `ol06` no existen en él.
- **D4-10:** los puertos de la suite admiten la rama *sparse* (`CodificadorSparseLexico`/`BuscadorSparseEnMemoria` falsos; con `proveedor: local`, el codificador BGE-M3 de la ingesta aplicado a los chunks y a la consulta, con los pesos `EMBEDDING_SPARSE_*` del entorno).

- **Gate 2 (vuelta 1):** `SinTerminosLexicos(FalloDeInferencia)` distingue «sin términos léxicos» de un fallo de inferencia; solo ella cuenta en `sin_terminos_lexicos` y un codificador roto aborta la corrida (exit 1).

## Pendientes de definir

- ¿El `golden_sha256` protege el archivo que la corrida realmente lee? Con los fixtures sí (hashea `preguntas.yaml`); con un dataset real en formato de la suite habrá que decidir si la huella cubre su `preguntas.yaml` o el `golden.yaml` de origen (hoy no hay vínculo dataset↔partición verificado).

- Valor de `RETRIEVAL_REGRESSION_TOLERANCE` y si la diferencia se mide en puntos absolutos o relativos (se fija en la preinscripción P1; dueño: responsable técnico; afecta AC-2).
- Si se exige IC pareado para marcar retroceso o basta la tolerancia puntual.
