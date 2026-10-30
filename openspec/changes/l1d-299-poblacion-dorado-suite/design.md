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
