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

## Revisión humana y su alcance

`revisada_por_oncologo` es `null` (sin revisar) o `{rol, fecha}` sin nombre (RN-10); `dataset_opciones` rechaza un booleano o una
revisión sin rol o fecha. El dataset real tiene **0 casos revisados** hasta que un oncólogo confirme los 4 candidatos (H-2), por eso
AC-5 se prueba con una copia de test con 4 revisados y otra prueba exige `no_validada` con el dataset real. Lo revisado es solo la
**pregunta** de cada caso (`alcance_de_la_revision: preguntas`): las fuentes esperadas, el orden esperado y las propuestas los fija
quien lee la regla, y el reporte y el resumen de CI lo dicen. Además: una opción cuya fuente más aplicable no figura en
`applicability[]` es violación de RN-28 (falla cerrado), y una cita que no es un chunk del corpus o que reproduce un análisis previo
es violación de RN-24.

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

## Sprint 7 · Revisión clínica provisional y medición (movido-S7, 2026-11-22)

Fuente: `backlog/sprints/S7-refinamiento.md` (§1, §4, §5, `[S7 resp. 1]`, `[S7 resp. 2]`) y
`backlog/sprints/S7-revision-clinica.md` §3. Las decisiones anteriores siguen vigentes.

**S7-D1 · Dos rótulos: `mecanica_verificada` y `validada`.** Cada pregunta del dataset puede llevar, además de
`revisada_por_oncologo` (`null` o `{rol, fecha}`), el campo `revision_provisional: {rol: ia, fecha}` (misma forma que en
`l1d-335` y `l1d-334`). Una pregunta con `revision_provisional` y sin `revisada_por_oncologo` cuenta como
`mecanica_verificada`; solo `revisada_por_oncologo` cuenta como validada. El reporte da, por métrica, tres recuentos
(validados, de mecánica verificada, sin revisar). `rotular_validada()` no cambia: «validada» sigue exigiendo que todos
los casos de la métrica estén revisados por un oncólogo, así que con el dataset real el rótulo sigue en `no_validada`.
La revisión de IA nunca produce «validada» (`[S7 resp. 1]`). OP-01, OP-02, OP-07 y OP-08 llevan
`revision_provisional: {rol: ia, fecha: 2026-11-21}`.
- Regla pura con nombre (`contar_revision()`, junto a `rotulo.py`), con TDD estricto; `dataset_opciones.py` valida la
  forma de `revision_provisional` (rol de un conjunto cerrado, fecha ISO) y `ESQUEMA_OPCIONES` gana el recuento.
- *Descartado:* reutilizar `revisada_por_oncologo` con `rol: ia`. Haría pasar por validado lo que no lo está.
- **Una sola definición de la marca (Gate 1 del S7).** La forma `{rol: ia, fecha}` no se redefine aquí. En el catálogo
  es `comun.schema.json#/$defs/revisionProvisional` (dueño: `l1d-126` parte A). En los datasets de evaluación la valida
  **una** regla pura compartida en `app/evaluation/` (asumido el nombre `validar_revision_provisional()`), que usan
  `dataset_opciones.py`, `dataset_poblacion.py` (`l1d-299`) y el dataset de `l1d-334`: la crea el change que la
  implemente primero y los demás la importan. `contar_revision()` sí es propia de esta familia.

**S7-D2 · OP-08.** `corpus.yaml` gana un documento y un chunk sintéticos «(test)» de enfermedad sensible a la castración
con privación androgénica y quimioterapia; `propuestas.yaml` y `casos.yaml` lo incorporan a OP-08. La fuente de
enfermedad resistente a la castración sigue en el caso y sigue al final por no comparable (AC-3). El orden esperado no
se escribe a mano: sale de la regla de RN-28 y lo comprueba `test_opciones_coherencia_dataset.py`. Texto descriptivo,
sin lenguaje prescriptivo (RN-23) y sin contenido de NCCN ni de ESMO.

**S7-D3 · Preguntas en español.** Las 12 preguntas se redactan en español completo; `evidencia.cita` sigue siendo literal
del corpus del dataset. *Riesgo:* con adaptadores falsos la recuperación puede depender del solape léxico entre la
pregunta y el chunk en inglés; si una pregunta deja de recuperar su fuente, se corrige el dataset (texto del chunk o
guion falso), no la regla. Verificación: el test de coherencia y dos corridas falsas idénticas (AC-6).

**S7-D4 · Versión del dataset y comparabilidad.** Los cambios de S7-D1…D3 suben `version` del manifiesto del dataset y
cambian la huella de `opciones-fake.yaml`. **Propuesta** que se evaluó: dejarlos entre la corrida base y la final, como
dice `S7-refinamiento.md` §5; así la diferencia entre ambas mezclaría dataset y mejoras. **Opción elegida (Gate 1 del
S7, 2026-11-22; misma política que `l1d-299`):**
- Lo que **no depende de `l1d-126` parte B** (S7-D1, S7-D2 y S7-D3) se hace **antes de la corrida base**: no necesita
  modelos reales y deja la base y la final sobre el mismo dataset.
- Lo que **depende de C-1 o C-5** (corregir `casos.yaml` si el comparador da otro orden en OP-07…OP-12 con el catálogo
  `1.11.0`) va **entre la base y la final**, después de `l1d-126` parte B. Si cambia algún caso, el dataset sube otra
  vez de versión y el reporte de la final nombra esos casos como **no comparables con la base**.

**S7-D4b · Supuesto compartido sobre C-1.** Este change no fija qué estado produce `extension`. Rige SC-1 de `l1d-126`
(`design.md` D10): `no_coincide` solo con restricción explícita en la fuente y M0/M1 legible en el paciente; si no,
«Desconocido» (`sin_regla_de_comparacion` o `falta_en_paciente`), sin población no comparable. En el repliegue, un
excluyente en «Desconocido» no suma a «No coincide» y el orden de OP-07…OP-12 no cambia por C-1. En los dos casos el
orden esperado lo da el comparador de RN-28 con el catálogo mergeado, no se escribe a mano.

**S7-D5 · Medición real y referencia.** Corpus (`[S7 resp. 10]`): la familia trae su corpus en el dataset; ese es su
corpus fijo en la base y en la final, y cada reporte lo registra (dataset y versión). No usa la ingesta de `l1d-119`.
Umbrales (`[S7 resp. 11]`): la base y la final corren con los umbrales actuales; los calibrados de `l1d-119` entran en
la final como un brazo más, con su propio reporte, y se adoptan en el cierre. Esto sustituye, para el S7, a «o los que
fije `l1d-119` antes de la corrida» de la decisión 7. Corrida base: `evaluate --suite opciones --config eval/configs/s5.yaml`
(`proveedor: local`), por `ai-eval-runner`, con reporte en `reports/eval/`. Corrida final: la misma familia con el
catálogo del S7 (`l1d-126`) y las mejoras; su referencia de retroceso pasa a ser el reporte de la corrida base de este
mismo sprint (asumido; hoy `s5.yaml` apunta al reporte del S4 de `l1d-298`, de otro dataset: deuda D5-28). Si un bloqueo
salta, no se relaja la meta: se reporta con los ids de caso. Cifras anteriores sin reporte versionado no se citan.

**Ficheros que toca el S7.** `data/evaluation/opciones/` (`manifest.yaml`, `preguntas.yaml`, `corpus.yaml`,
`propuestas.yaml`, `casos.yaml`); `apps/rag-orchestrator/app/evaluation/` (`rotulo.py`, `dataset_opciones.py`,
`corrida_opciones.py`, `esquema_suite.py`); `apps/rag-orchestrator/eval/configs/` (configuración de la corrida final);
tests en `apps/rag-orchestrator/tests/evaluation/`. No toca `packages/clinical-catalogs/` ni otros datasets.

**Decisiones de implementación del S7 (antes de la corrida base).**
- **S7-I1 · Dónde van los tres recuentos.** Cada `validacion` de las 8 métricas de la familia gana
  `preguntas_mecanica_verificada` y `preguntas_sin_revisar` (con `preguntas_validadas`/`preguntas_no_validadas` intactas), con
  un objeto de esquema propio en `ESQUEMA_OPCIONES` (`_VALIDACION_DE_OPCIONES`). *Descartado:* un bloque `revision` de nivel
  superior (el spec pide el recuento por métrica y el subconjunto `metricas_validadas` tiene el suyo); ampliar `_VALIDACION`
  compartido (cambiaría el esquema de las demás familias, fuera de alcance).
- **S7-I2 · `contar_revision()`** vive en `app/evaluation/contar_revision.py` (módulo propio, pura, junto a `rotulo.py`):
  recibe dos secuencias de booleanos por caso y devuelve `RecuentoDeRevision(validados, mecanica_verificada, sin_revisar)`; una
  pregunta con ambas revisiones cuenta solo como validada. *Descartado:* meterla en `rotulo.py` (mezcla rótulo y recuento).
  La marca se valida con `exigir_revision_provisional()` de `revision_provisional.py` (creada por `l1d-334`): ninguna segunda
  copia; un test de paridad compara `ROLES_DE_REVISION_PROVISIONAL` con el enum de `$defs/revisionProvisional` del catálogo.
- **S7-I3 · Preguntas en español y recuperación falsa.** El reranker falso es léxico y no cruza idiomas: cada fragmento del
  corpus gana una frase descriptiva en español (la `cita` sigue siendo el texto en inglés). *Descartado:* conservar términos en
  inglés en la pregunta (viola AC-1) o tocar el guion falso (la recuperación fallaría igual).
- **S7-I4 · OP-08.** Con `maxOptions: 3` las propuestas son P1, P5 (nuevo, sensible a la castración, quimioterapia) y P2
  (resistente, no comparable, al final); P3 sale del caso para que la no comparable quede dentro del tope y AC-3 siga
  ejercitándose. El orden `[doc-p1, doc-p5, doc-p2]` lo confirma el comparador de RN-28
  (`test_opciones_coherencia_dataset.py`), no se fijó a ojo. *Descartado:* mantener cuatro propuestas (la no comparable
  quedaría fuera del tope y OP-08 dejaría de probar «no comparable al final»).

