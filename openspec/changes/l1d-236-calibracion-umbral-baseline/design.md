# Design — l1d-236-calibracion-umbral-baseline

## Context

El runner de `l1d-235-suite-evaluate` ya calcula las métricas; ADR-39 dejó un modo `sin_evidencia`
y `retrieval_metrics.py` con IC. ADR-45: metas de recuperación provisionales; la prueba congelada
solo con `--prueba-final`. Re-estimación a 3 pts (P-1 decidido, `[S2 resp. 1]`).

## Goals / Non-Goals

**Goals:** barrido, umbral elegido en configuración, baseline por tipo de cáncer, p95 e2e, en/fuera
de meta. **Non-Goals:** metas definitivas (DEC-07), streaming.

## Decisions

- **D1 · Regla de elección del umbral** (fijada antes de medir): el valor de la grilla que maximiza la
  exactitud de "sin evidencia" con recall@10 no peor que el del umbral actual menos
  `THRESHOLD_RECALL_TOLERANCE` (configuración); empate → el valor más alto (más conservador frente a
  RN-02). Se calibra sobre desarrollo + validación de `ol06-particion-v1`, nunca sobre prueba.
  Alternativa descartada: maximizar F1 combinado (mezcla dos metas que DEC-07 fija por separado).
- **D2 · p95 e2e:** 3 corridas de ≥ 30 consultas **desde el host, por la BFF** (`python -m app.scripts.adr39 e2e
  --bff --base-url https://localhost --origin https://localhost`, `ADR39_PASSWORD` en el entorno; reutiliza el
  subcomando `e2e` de ADR-39); nunca desde un contenedor de clinical-net/ai-net ni desde `rag-orchestrator`. Mediana.
- **D3 · Metas iniciales** en `eval/configs/metas-iniciales.yaml` (solo lectura para este change).

## Privacidad y ownership

Solo seed y datasets sintéticos; el p95 entra por la BFF, que desidentifica en `clinical-api` (RN-11);
`rag-orchestrator` no toca datos clínicos. LLM local (RN-12). Reporte solo con agregados.

## Salvaguardas del barrido (Gate 2)

`--sweep` exige un dataset sintético antes de cargarlo; el JSON del baseline se valida contra una lista blanca
(`ESQUEMA_BASELINE`) antes de escribir el `.md`; `--fijar` solo escribe (atómicamente) dentro de `eval/configs/` y se
rechaza con adapters falsos sobre la configuración versionada; «fijado» en los informes es el resultado (el nuevo texto de
la configuración se calcula antes de escribir nada y `config_con_umbral` rechaza estilos que no sabe reescribir). Desviación: el directorio permitido es inyectable
(`directorio_de_configs`) para que el test de aceptación AC-1 fije el umbral en una copia temporal.

## Deuda registrada (no bloquea)

- Columnas del informe por tipo de cáncer fijas en código (`ETIQUETAS_CANCER`, sección 4): derivarlas del catálogo.
- Menores de diseño: `or 0.0` en `metas.py`/`barrido.py`; unidad deducida del sufijo `_s`; `--fijar`/`--p95-e2e-s` sin
  `--sweep` se ignoran; las metas se leen de una ruta fija; `fijar_umbral_en_config` debería vivir en `config_suite.py`
  y el `hashConfig` del informe es el previo al fijar.
- Historia propuesta para S2 («catálogo de métricas y metas derivado del yaml + columnas por cáncer derivadas»): las
  seis métricas viven hoy en cuatro sitios (`metas-iniciales.yaml`, `metricas_planas`, `ESQUEMA_BASELINE`, etiquetas del
  informe); una meta nueva en el yaml lanza `ReporteFueraDeEsquema` sin capturar tras barrer toda la grilla, y un tercer
  tipo de cáncer igual. Incluye `es_candidata` frente a `motivo_de_descarte` en `elegir_umbral`, y los Menores #8 y #11.
- Preguntas abiertas: `fidelidad_proxy` frente a `opciones_con_cita_y_soporte` como nombre; metas provisionales y límite
  inferior del IC (ADR-45, enmienda 3).
- `corte_para_el_generador` (dominio) es la regla del corte top-N + umbral; el servicio aún repite el corte en
  `_reranquear` (`app/application`, fuera de los paths de este change): enchufarla ahí es un cambio de una línea.
- Mover el subcomando `e2e` de `app/scripts/adr39/` (cliente con sesión sintética) a una ubicación neutral fuera de
  `apps/rag-orchestrator`.

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`.

## Evaluación

Cambia un **umbral** (`RELEVANCE_THRESHOLD`) → OL-06 obligatoria: "sin evidencia" ≥ 0,90,
recall@10, MRR, fidelidad, precisión de citas; p95 ≤ 15 s (G-5).

## Dependencias y colaboradores

- **Crea:** `app/evaluation/barrido.py` con `elegir_umbral()` (RN-02, TBD-03),
  `marcar_frente_a_meta()`; `eval/reports/S1-baseline.md`.
- **Modifica:** configuración de `rag-orchestrator` (`RELEVANCE_THRESHOLD`,
  `RELEVANCE_THRESHOLD_GRID`), `data/evaluation/baseline.json`.

## Risks / Trade-offs

- Dataset pequeño → IC ancho; se reporta.
- Solape con ARR-03 AC-5 → una sola corrida compartida.

## Open Questions

- P-1 (re-estimación a 3) decidido (`[S2 resp. 1]`).
