# Design — l1d-299-poblacion-dorado-suite

## Context

- El runner `python -m app.evaluation.evaluate --config <ruta> --suite <familia>` (US-072, ADR-41) vive en
  `apps/rag-orchestrator/app/evaluation/`; `l1d-244` añade la familia `aplicabilidad` (configuración propia, `all` no la
  incluye, código 3 por invariante) y `revision_muestra.py`. Esta suite sigue ese patrón.
- US-242 (`l1d-292`) entrega el extractor en abanico (`application/corpus_metadata/population_fanout.py`) con
  `finish_reason`, deduplicación y contadores; US-243 (`l1d-293`) las reglas puras de estado con listas
  (`app/domain/applicability_rules.py`).
- Sin TDD de contenido (CLAUDE.md): el dorado y las metas se miden con `evaluate`; la **orquestación** de la suite se
  hace con adaptadores falsos y TDD estricto en lo que es regla pura (métricas, veredicto).

## Goals / Non-Goals

**Goals:** conjunto dorado versionado y revisado; suite `poblacion` determinista con adaptadores falsos y ejecutable
con proveedor local; veredicto que nunca da PASS sin revisor.
**Non-Goals:** herramienta de revisión a escala, extracción doble, calibración de umbrales (US-120), metas definitivas.

## Decisions

**D1 · Familia nueva `poblacion` en el runner.** `SUITES` gana `poblacion` (fuera de `all`, como `aplicabilidad`, para no
cambiar la huella de `test-fake.yaml` ni `baseline.json`). Configuración propia `eval/configs/test-poblacion.yaml`
(adaptadores falsos, CI) y `eval/configs/poblacion-local.yaml` (`proveedor: local`, ejecución manual). Composición en
`composicion_poblacion.py`; reutiliza el extractor de US-242 y las reglas de US-243 sin duplicarlas (`proyectar_estado`).

**D2 · Conjunto dorado.** `data/evaluation/poblacion-dorado/`: `manifest.json` (`clase`, `licencias`, `version`,
`revisor: {rol, fecha}`), `pares.yaml` (documento, criterio, fragmento, `valor`, `scope`) y `estados.yaml` (paciente de
prueba × fuente → estado esperado F-20…F-24, `valores_en_conflicto` si aplica). Solo corpus público con licencia
aceptada (RN-21); sin datos de paciente; los pacientes de prueba son sintéticos.

**D3 · Métricas (puras, `metricas/poblacion.py`).** `precision_por_criterio()`, `cobertura_por_criterio()`,
`tasa_duplicados()` (valores normalizados), `cortes_por_longitud()` (lista de `(documento, criterio)`),
`concordancia_de_estados()` con `no_coincide_indebido` (`ADR47-R2`) y `coincide_indebido` (`ADR47-R1`) por separado,
`sin_evidencia_vs_baseline()`, `tasa_cortes_del_bucle()` y `veredicto()` (código ≠ 0 con `length` > 0). Metas en
configuración (RN-22), nunca en el código.

**D4 · Sin revisor → no concluyente.** El lector del dorado valida `revisor.rol` y `revisor.fecha`; ausentes, precisión y
cobertura salen `no_concluyente` y el veredicto nunca es PASS (asumido, AC-7). Reutiliza el esquema de
`revision_muestra.py`.

**D5 · Repetición del bucle (R17).** ≥ 20 pares pregunta + fuentes distintos del caso del tamoxifeno en
`pares-bucle.yaml`; el reporte da la tasa de cortes y la marca OUT-06 `cerrada` solo si es 0.

**D6 · «Sin evidencia».** Compara la métrica `sin_evidencia` con `data/evaluation/baseline.json` (sin regenerarlo) y
cuenta invocaciones del LLM de generación en el camino sin evidencia: debe ser 0 (RN-02).

**D7 · Reporte y logs.** Solo agregados, nombres de métricas y IDs de documento y criterio del corpus público; nunca
contenido de fragmentos, valores extraídos ni salida del LLM (RN-14).

## Privacidad y ownership

- Todo corre dentro de `rag-orchestrator` sobre corpus público y pacientes sintéticos; no cruza web → clinical-api →
  rag-orchestrator ni lee datos clínicos: sin acceso a datos clínicos ni a `clinical-minio` (RN-10).
- Las guardas de `guardas.py` (clase y licencia) se aplican al manifiesto del dorado; el escaneo de PII de la CI cubre el
  directorio. LLM solo local (RN-12): `proveedor: local`, sin *fallback* a nube.

## Contratos

Sin cambio de `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni `contracts/examples/`. El reporte
amplía `esquema_suite.py` (esquema interno, no HTTP) con la sección `poblacion`; oasdiff no aplica; compatible con ADR-26.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `app/evaluation/config_suite.py`, `evaluate.py`, `armado_reporte.py`, `esquema_suite.py` | familia `poblacion`, código ≠ 0, sección del reporte | `l1d-244` |
| `app/evaluation/composicion_poblacion.py` (nuevo) | arma extractor y reglas | `l1d-292`, `l1d-293` |
| `app/evaluation/metricas/poblacion.py` (nuevo) | D3 | tipos de dominio |
| `app/evaluation/dataset_poblacion.py` (nuevo) | carga y guardas del dorado | `revision_muestra.py` |
| `eval/configs/test-poblacion.yaml`, `poblacion-local.yaml` (nuevos) | metas y proveedor | US-233a |
| `data/evaluation/poblacion-dorado/`, `corpus-metadatos/PLANTILLA.md` | datos y plantilla ampliada | revisión `[HUMANO]` |

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus de producto: añade una familia. Métricas: M-08.3, M-08.4, M-08.2,
concordancia de estados, `finish_reason=length` = 0, «sin evidencia» (RN-02). `run-ai-eval` confirma que las familias
existentes dan las mismas métricas (`baseline.json` y huella de `test-fake.yaml` sin cambio). Cada invariante tiene una
variante que falla (un `length` inyectado da código ≠ 0; un esperado alterado baja la concordancia). La medición con el
LLM real es manual y su reporte va a `reports/eval/`.

## Risks / Trade-offs

- **ADR47-R9:** conjunto pequeño → estratificación y marca «no concluyente»; no se presenta como validación definitiva.
- **Dependencia humana:** sin la revisión de `l1d-117` 2.3 / `l1d-244` 2.2 la suite entrega solo la forma. Mitigación:
  semilla sintética etiquetada y marca explícita.
- **Metas provisionales** hasta DEC-07 (S5).

## Pendientes de definir

- Metas de precisión/cobertura por criterio (provisionales, RN-22; las fija DEC-07).
- Tamaño mínimo 30 pares (asumido) y estratos exactos.
- Firma de DEC-11 (`[S4 resp. 9]`) para los estados F-20…F-24.

## Sprint 7 · Proveedor local, medición y dorado ampliado (movido-S7, 2026-11-22)

Fuente: `backlog/sprints/S7-refinamiento.md` (§1, §5, `[S7 resp. 1]`, `[S7 resp. 2]`) y
`backlog/sprints/S7-revision-clinica.md` §4. D1…D7 siguen vigentes.

**S7-D1 · `proveedor: local` (D5-26).** `corrida_poblacion.py` compone los puertos con el mismo patrón que
`modelos_locales.cargar_puertos_locales` (LLM local por Ollama, NLI por ONNX); `eval/configs/poblacion-local.yaml`
lleva las metas (RN-22) y los mismos `POPULATION_*` que la ingesta. Solo modelos locales (RN-12): un alias de nube
aborta, y sin pesos o sin `modelos.env` la suite sale con código ≠ 0 nombrando la variable, sin escribir cifras. La
orquestación se prueba con adaptadores falsos en el puerto (TDD estricto); el LLM real solo corre en la medición.

**S7-D2 · Revisión provisional del dorado.** `manifest.json` gana `revision_provisional: {rol: ia, fecha}` (misma forma
que `l1d-335` y `l1d-334`); `revisor` sigue `{rol: null, fecha: null}`. D4 no cambia: sin revisor humano, precisión y
cobertura son «no concluyentes» y el veredicto nunca es PASS. El reporte sigue trayendo las cifras por criterio, con esa
marca. `dataset_poblacion.py` valida la forma del campo nuevo.
- **Una sola definición de la marca (Gate 1 del S7).** La forma `{rol: ia, fecha}` no se redefine aquí. En el catálogo es
  `comun.schema.json#/$defs/revisionProvisional` (dueño: `l1d-126` parte A). En los datasets de evaluación la valida
  **una** regla pura compartida en `app/evaluation/` (asumido el nombre `validar_revision_provisional()`), que usan
  `dataset_poblacion.py`, `dataset_opciones.py` (`l1d-246`) y el dataset de `l1d-334`: la crea el change que la
  implemente primero y los demás la importan.

**S7-D3 · Ampliación del dorado (D-1…D-5).** Todo sintético, redactado para la prueba, `licencias: sintetico_propio`.
- **D-1:** ≥ 16 pares de próstata: `estado_castracion`, `extension`, `isup` y `hrr_brca` × guía, ensayo y revisión × es/en,
  más `ecog` y `linea_tratamiento`. Los estratos siguen declarados por documento.
- **D-2:** ≥ 12 casos difíciles, marcados con un campo `redaccion` (asumido: `plantilla` | `dificil`) y su tipo
  (negación, rango, definición implícita, inclusión total, umbral, tabla). El reporte desagrega precisión y cobertura
  por `redaccion`, solo con agregados.
- **D-3:** ≥ 8 distractores: el valor aparece solo con alcance de subgrupo o como mención en la discusión; el esperado
  no tiene valores de `elegibilidad`. El reporte cuenta aparte los valores que la extracción dio como elegibilidad en
  un distractor.
- **D-4:** se reescriben las frases sin sentido clínico; una cohorte con receptor hormonal positivo y triple negativo se
  declara inclusiva, y el triple negativo se etiqueta como en C-4 (`l1d-126` D12).
- **D-5:** en `estados.yaml`, un caso por regla F-20…F-23 con `estado_castracion`, más los de C-1 (`extension`) y los de
  C-3 (elegibilidad de un solo valor sin «solo»). El esperado de C-3 es el de la regla vigente (`desconocido`): el
  reporte los cuenta aparte como medida de esa rendija (Q-1), sin cambiar la regla.
- **Supuesto compartido sobre C-1 (Gate 1 del S7).** Este change no fija qué estado produce `extension`. Rige SC-1 de
  `l1d-126` (`design.md` D10): `no_coincide` solo con restricción explícita en la fuente y M0/M1 legible en el
  `stage_value` del paciente; si no es legible, `desconocido` con `sin_regla_de_comparacion` (o `falta_en_paciente` sin
  estadio), sin población no comparable. Los casos de `extension` cubren los dos lados: uno con M legible y otro de
  repliegue. Si `l1d-126` parte B se mergea sin la lectura de M0/M1, el esperado del primero es también `desconocido`
  y el reporte lo dice; no se escribe un `no_coincide` que el catálogo mergeado no produzca.
- El estado esperado lo fija quien redacta el caso leyendo la regla del catálogo, no la salida del código (como hoy).

**S7-D4 · Catálogo de estados para próstata.** `manifest.catalogo_de_estados` apunta hoy al fixture `test-apl-1.2.0`,
cuya próstata no tiene `poblacion-reglas.json`. Los casos de próstata y de C-1 necesitan reglas de próstata: se crea un
fixture de catálogo de test nuevo en `apps/rag-orchestrator/tests/fixtures/catalogo/` (asumido el nombre
`test-apl-1.3.0`), copiado del contenido de `l1d-126` cuando esté mergeado; `test-apl-1.2.0` no se toca. Alternativa
(pregunta abierta): apuntar al catálogo real para que la concordancia siga sus cambios.

**S7-D5 · Ventanas (Gate 1 del S7, 2026-11-22; misma política que `l1d-246`).**
- **Antes de la corrida base, lo que no depende de `l1d-126` parte B:** S7-D1 (proveedor local), S7-D2 (marca
  provisional), las métricas nuevas y la parte del dorado que no usa lo que cambia la parte B: pares de próstata de
  `estado_castracion`, `isup`, `ecog` y `linea_tratamiento` (D-1); casos difíciles y distractores (D-2, D-3) sobre
  criterios que la parte B no toca; frases reescritas de D-4, salvo el etiquetado del triple negativo; y los casos de
  C-3 con criterios de mama, que usan el fixture `test-apl-1.2.0` (D-5).
- **Corrida base:** la suite con modelos locales sobre ese dorado, con el catálogo vigente.
- **Entre la base y la final, lo que depende de la parte B** (después de mergearla): pares de `extension` y `hrr_brca`
  (C-1, C-5), casos sobre HER2 bajo (C-2), etiquetado del triple negativo (C-4), los casos de estado de próstata
  (F-20…F-23 con `estado_castracion` y los de C-1) y el fixture de S7-D4. Estos casos llevan una marca en el dataset
  (asumido el campo `ventana: tras_catalogo_s7`).
- **Corrida final:** la suite sobre el dorado completo y el catálogo del S7. La comparación con la base vale para los
  pares y casos que ya estaban en la base; el reporte nombra los añadidos después como **no comparables con la base**
  y los lee por criterio y por estrato.
- **Corpus y umbrales:** los documentos del dorado son el corpus fijo de la familia en la base y en la final, declarado
  en cada reporte (`[S7 resp. 10]`); las dos corren con los umbrales y los `POPULATION_*` actuales, y los umbrales
  calibrados de `l1d-119` entran en la final como un brazo más (`[S7 resp. 11]`).

**Ficheros que toca el S7.** `data/evaluation/poblacion-dorado/` (`manifest.json`, `pares.yaml`, `estados.yaml`);
`apps/rag-orchestrator/app/evaluation/` (`corrida_poblacion.py`, `config_poblacion.py`, `dataset_poblacion.py`,
`metricas/poblacion.py`, `esquema_suite.py`); `apps/rag-orchestrator/eval/configs/poblacion-local.yaml` (nuevo);
`apps/rag-orchestrator/tests/fixtures/catalogo/` (fixture nuevo) y tests en `tests/evaluation/`. **No toca**
`packages/clinical-catalogs/`, `pares-bucle.yaml` ni otros datasets.

