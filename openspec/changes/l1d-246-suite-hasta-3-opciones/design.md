# Design — l1d-246-suite-hasta-3-opciones

## Context

Ver `proposal.md` (Por qué). Estado actual observado:

- `app/evaluation/evaluate.py` despacha familias con configuración propia (`aplicabilidad`, `poblacion`) antes de la suite
  común; `SUITES` vive en `config_suite.py`. El código 3 ya significa «invariante violada» en la familia `aplicabilidad`.
- `metricas/opciones.py::porcentaje_con_cita_y_soporte` mide mostradas / (mostradas + descartadas): es la tasa de
  validación, **no** M-10.1 (opciones mostradas con cita y soporte, meta 100 %). No se modifica: se añade la métrica nueva.
- `ResultadoConsulta` ya trae `salidas_mostradas_nivel_a/_nivel_b` y `campos_mostrados` (id de regla, nunca texto): M-10.2
  los reutiliza.
- `app/domain/applicability_order.py` (US-125) expone `contar_excluyentes_no_coincide()` y `clave_de_aplicabilidad()`;
  `RagQueryInternalResponse` devuelve por opción `applicabilitySummary`, `perSource`, `populationNotComparable`,
  `relevanceScore`, y por fuente `SourceApplicability.criteria` con el flag de excluyente.
- `reports/eval/s3-cierre.json` es el reporte del S3 con adapters falsos (FX-T5a-a: fidelidad 0,75, precisión 0,80); no hay
  reporte del S3 con modelos locales; el primero local es `reports/eval/l1d-298-evaluate-modelos-locales-fx-t5a-a.json` (S4).
- DEC-07 pasó al S6: no hay umbrales de regresión en `regression.yaml`; las metas iniciales están en
  `eval/configs/metas-iniciales.yaml`.

## Goals / Non-Goals

**Goals:** familia `opciones` reproducible con fakes en la CI y ejecutable con `proveedor: local` en la corrida nocturna;
cuatro bloqueos (M-10.1, M-10.2, orden RN-28 incluido el no comparable, retroceso de M-07.2); rótulo validado/no validado.

**Non-Goals:** cambiar el pipeline del análisis, el comparador ni la lista de términos; medir latencia (US-141); fijar metas
definitivas (DEC-07); regenerar `data/evaluation/baseline.json`.

## Decisions

1. **Familia con configuración y reporte propios** (patrón de `aplicabilidad`/`poblacion`), no ampliar `--suite all`:
   no cambia la huella de `test-fake.yaml` ni el baseline de la CI. *Descartada:* añadir `opciones` a `all` (regenera el
   baseline y mezcla datasets).
2. **Orden verificado sobre los resúmenes del propio análisis**: por cada opción mostrada, su clave es
   `clave_de_aplicabilidad(contar_excluyentes_no_coincide(criterios de su fuente más aplicable), summary.coincide,
   relevanceScore, id)`; la secuencia mostrada debe ser no decreciente. Se reutiliza el comparador de US-125 tal cual; la
   regla tiene un solo dueño (`app/domain/applicability_order.py`). Extraer `orden_conforme_rn28()` (pura) en
   `metricas/orden_opciones.py`. *Descartada:* comparar con el orden esperado del dataset (el LLM real describe otras
   opciones); ese orden solo alimenta «opciones esperadas presentes», que es informativa.
3. **No comparable al final (AC-3)**: regla vigente comprobada el 2026-11-03 (flag de US-125 AC-2 en `openspec/specs/applicability`; orden al final de US-134 AC-4 en `openspec/specs/evidence-analysis`, test `test_rag_query_deja_o_a_ultima_y_visible_con_aviso_cuando_su_poblacion_no_es_comparable`); la métrica la verifica, no la crea. Se comprueba aparte de la clave (una opción con `populationNotComparable = true` no
   puede preceder a una con `false`), para que el reporte nombre esa violación por separado aunque la clave ya la implique.
4. **M-10.1 recalculado de forma independiente**: cada opción mostrada debe tener ≥ 1 cita a un chunk entregado en esa
   consulta y su(s) afirmación(es) con veredicto `entailment` del NLI registrado; no se fía del ensamblado del servicio.
5. **AC-4, referencia por configuración**: `regresion.reporte_referencia` (ruta) y `regresion.faithfulness_regression_tolerance`
   (`FAITHFULNESS_REGRESSION_TOLERANCE`, RN-22). Valor inicial **0,05** (Decidido, usuario, 2026-11-03, igual que `tolerancia_recall`; DEC-07 lo
   recalibra en S6). `opciones-fake.yaml` apunta a `reports/eval/s3-cierre.json` (el reporte del S3, literal del AC);
   `s5.yaml` apunta al reporte del S4 con modelos locales (`l1d-298-…-fx-t5a-a.json`), porque el S3 no tiene reporte local
   (P1 decidido, usuario, 2026-11-03, `[S5 resp. 13]`). Sin referencia legible → código 2 (sin valores por defecto ocultos).
6. **Metas**: se leen de `metas-iniciales.yaml` (no se duplican en `s5.yaml`); M-10.1 = 100 % y M-10.2 = 0 son
   invariantes en código del comparador de invariantes, no metas calibrables (PRD §18.3.10).
7. **Configuraciones**: `s5.yaml` (`proveedor: local`, corpus del dataset, `maxOptions: 3`, umbrales iguales a los de
   `local.yaml` o los que fije `l1d-119` antes de la corrida) y `opciones-fake.yaml` (adapters falsos, reloj simulado).
   No se crea ni toca `s5-calibracion.yaml` (de `l1d-119`) ni `rn23-fake.yaml` (de `l1d-305`).
8. **Corpus de la medición nocturna**: solo el del dataset (verdad conocida y reproducible). **No** se mide sobre el corpus
   ampliado de `l1d-119` (P2 decidido, usuario, 2026-11-03).

## Dependencias y colaboradores

- **Se crean:** `app/evaluation/corrida_opciones.py` (despacho, invoca `RAGOrchestratorService` vía `componer_servicio` con
  los puertos de la configuración), `app/evaluation/config_opciones.py`, `app/evaluation/dataset_opciones.py`,
  `app/evaluation/metricas/orden_opciones.py` (`orden_conforme_rn28()`, `no_comparable_al_final()`, puras),
  `app/evaluation/metricas/opciones_mostradas.py` (M-10.1, M-10.2 por agregación de `ResultadoConsulta`, opciones esperadas
  presentes, media de opciones), `eval/configs/s5.yaml`, `eval/configs/opciones-fake.yaml`, `data/evaluation/opciones/*`.
- **Se modifican:** `config_suite.py` (`SUITES` + `opciones`), `evaluate.py` (despacho), `esquema_suite.py`
  (`ESQUEMA_OPCIONES`, reporte cerrado), `scripts/ci/eval-required.mjs` (segunda invocación) y su test.
- Dependen de puertos (`Clock`, LLM, NLI, reranker, embeddings, aplicabilidad) y del dominio puro
  (`applicability_order`); nunca de clientes concretos. El veredicto de regresión reutiliza el patrón de
  `comparar_regresion.py` (no se duplica la comparación con tolerancia).
- **Fakes que se tocan:** guiones del LLM (`LLM-CUATRO`, `LLM-TRES` y uno por caso), NLI y `APL-FIJA` de
  `adaptadores_falsos.py`; su test de contrato sigue en los tests de los adapters (mismos errores; `null` ≠ `0.0` en
  `relevanceScore`/`top_relevance_score`).

## Privacidad y ownership

Todo ocurre en `rag-orchestrator`, en proceso, con datos **sintéticos** (`clase: sintetico`); no cruza `web` ni
`clinical-api`, no toca datos clínicos, `clinical-minio`, ni schemas fuera de `corpus`. Los contextos de paciente del
dataset ya están desidentificados (sin nombres, fechas relativas, sin `pseudoPatientId` en el prompt; RN-11). El reporte y
los mensajes llevan solo agregados, ids de caso e ids de regla, nunca texto de preguntas ni de salidas (RN-14). La medición
real usa solo proveedores locales por lista cerrada (RN-12, `exigir_proveedor_local`).

## Contratos

Sin cambios de API: ni `apps/*/openapi.yaml` ni `contracts/examples/`. La familia consume `RagQueryInternalResponse`
generado (no se edita a mano). El reporte usa un esquema JSON cerrado propio (`ESQUEMA_OPCIONES`), interno a la suite.

## Evaluación

Métricas OL-06 afectadas: M-10.1 (100 %, bloqueante), M-10.2 (0, bloqueante, niveles A y B), M-07.2 fidelidad y
precisión de citas (metas iniciales 0,90, «fuera de meta» sin bloquear; retroceso > `FAITHFULNESS_REGRESSION_TOLERANCE`
bloquea), orden RN-28 (100 % de análisis conformes, bloqueante), media de opciones y opciones esperadas presentes
(informativas). CI con `opciones-fake.yaml`; medición real en la **corrida nocturna única del día 2**
(`S5-refinamiento.md` §5) con `proveedor: local`, junto con `l1d-119` y `l1d-305`, por `ai-eval-runner`; reporte en
`reports/eval/l1d-246-*`.

## Risks / Trade-offs

- [El LLM real describe menos de 3 opciones o ninguna esperada] → el orden se mide sobre lo que devuelve; «esperadas
  presentes» es informativa y no bloquea.
- [Comparar fidelidad entre datasets distintos (referencia FX-T5a-a frente a `opciones/`)] → se declara en el reporte el
  dataset de la referencia (P1: reporte del S4 de `l1d-298`); DEC-07 (S6) fija la referencia definitiva.
- [La corrida nocturna no alcanza] → orden de prioridad de `l1d-119` §8; US-140 es la última del orden de recorte del S5,
  su medición real se difiere con ID si no cabe.
- [Choque con ARR-11 en `eval-required`] → esta tarea va después de mergear `arr-11-ci-rapida`.

## Open Questions

Ninguna. **P1** (referencia de AC-4 con modelos locales = reporte del S4 de `l1d-298`) y **P2** (no se mide sobre el
corpus ampliado de `l1d-119`) quedan Decididos (usuario, 2026-11-03, `[S5 resp. 13]`).
