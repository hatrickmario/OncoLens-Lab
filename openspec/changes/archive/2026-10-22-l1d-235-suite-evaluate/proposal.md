# Proposal — l1d-235-suite-evaluate

## Trazabilidad

L1D-235 · US-072 (partida **US-072a** 5 pts + **US-072b** 3 pts, P-1 decidido, `[S2 resp. 1]`) ·
FEAT-T5a (L1D-46) · Sprint 2 (desde S1, `[Pre-S1 resp. 9]`) · Estimación **8** · FR-20, IA-10 ·
OL-06 · AC-T5.3 · M-06.1, M-07.2, M-10.1, M-10.2 · G-4, G-8 · RN-12, RN-14, RN-22, RN-23 · SEG-13 ·
US-072 AC-1…AC-7 · Fuente: `backlog/features/FEAT-T5a-baseline-evaluacion.md` §US-072; contexto:
`backlog/sprints/S2-refinamiento.md` §2 (P-1) y §3.2 (ADR-41, P-3).

## Why

Sin medición no se puede proteger ningún cambio de modelo, prompt, umbral, catálogo o corpus. Hoy
`run-ai-eval` devuelve `NO-EJECUTABLE` porque `npm run evaluate` no existe; la base de métricas de
recuperación (`app/evaluation/retrieval_metrics.py`) y los datasets de ADR-39/ADR-45 ya están.

## What Changes

Dos bloques, cada uno en su PR (tareas agrupadas así en `tasks.md`):

- **072a · runner y métricas deterministas** (AC-1 salvo fidelidad y prescriptivas, AC-2, AC-4,
  AC-5): `python -m app.evaluation.evaluate --config eval/configs/<cfg>.yaml` con su envoltorio
  `npm run evaluate -- --suite <familia> --report json` (contrato de `run-ai-eval`); recall@10 total
  y es→en, MRR, precisión de citas, exactitud de "sin evidencia", % de opciones con cita, p95 por
  etapa; resultado `eval/results/<fecha>-<hashConfig>.json` con la configuración; rótulo validada /
  no validada; rechazo de datasets sin `clase: sintetico`; `data/evaluation/baseline.json` (primer
  registro, con la configuración de CI); reutiliza `data/eval/adr39-mini/` y la partición
  `data/eval/ol06-particion-v1/` (ADR-45: la prueba solo con `--prueba-final`); guarda
  `es_proveedor_local()` con lista local cerrada en código (loopback, `host.docker.internal`; con
  dataset no `sintetico`, todo adapter remoto aborta la suite) y test de CI sin salida a red.
- **072b · fidelidad, PII y prescriptivas** (AC-1 en su parte de términos prohibidos, AC-3, AC-6,
  AC-7): fidelidad por afirmación con NLI (principal) y juez local G (secundario) según ADR-41;
  rechazo de juez de nube sin enviar requests; integración del JSON de `npm run eval:pii`
  (`clinical-api`, detector de US-049 sobre `data/eval/pii-mini/` de ADR-40) y conteo de llamadas a
  la nube con datos reales (= 0); salidas con términos prohibidos (lista de US-068, campos de
  `CAMPOS_GENERADOS`, niveles A+B, `permitirFrases: false`, medidas en la propuesta cruda del
  generador y en la salida mostrada) e inyección efectiva con `ch-inj-1`.
- **Fixture** FX-T5a-a (`eval/configs/test-fake.yaml`): adapters falsos, 6 preguntas (3 es, 3 en;
  2 sin evidencia; 1 con `ch-inj-1`), 4 textos con PII sembrada, 2 salidas con términos prohibidos.

## Capacidades afectadas

- `ai-evaluation` (ADDED): runner `evaluate`, reproducibilidad, rótulo validada, guarda de datos
  sintéticos, fidelidad con juez local, privacidad, inyección.

## Bounded contexts

- **ai-services:** `apps/rag-orchestrator/app/evaluation/`, `tests/evaluation/`, `eval/configs/`,
  `data/evaluation/`.
- **clinical-platform:** solo el consumo del JSON de `npm run eval:pii` (lo crea
  `l1d-205-adr40-deteccion-pii`); el envoltorio `npm run evaluate` en el `package.json` raíz.

## Dependencias

- ⛔ 072b bloqueada por `l1d-232-adr41-framework-evaluacion` (juez de fidelidad, AC-3).
- ↪ 072b AC-6 depende de `l1d-205-adr40-deteccion-pii` (dataset `pii-mini` y `eval:pii`); si no
  llega, AC-6 corre con los 4 textos PII de FX-T5a-a y la cifra sobre `pii-mini` se difiere a esa
  historia.
- ↪ Changes del S1 que se miden: recuperación (L1D-106), citas (L1D-179), soporte NLI (L1D-180),
  términos prohibidos (`l1d-193-terminos-prohibidos-rn23`), desidentificación (L1D-203).
- 🔗 Lo usan `l1d-236-calibracion-umbral-baseline` (072a) y `l1d-237-eval-required-ci` (072a).
- 🔗 DEC-06 (US-016) se mueve al S4 (P-1): hasta entonces no hay preguntas `revisada_por_oncologo`
  y todas las métricas salen "no validada"; el mecanismo se prueba con fixture.

## Fuera de alcance

Datasets de OCR, eventos, duplicados, mapeo, faltantes, discrepancias y aplicabilidad (FEAT-T5b).
Métricas de valor (US-075). Metas definitivas (DEC-07). Calibración del umbral (US-073). Job de CI
(US-074).
