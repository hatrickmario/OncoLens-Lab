# Proposal — l1d-237-eval-required-ci

## Trazabilidad

L1D-237 · US-074 · FEAT-T5a (L1D-46) · Sprint 2 (desde S1, `[Pre-S1 resp. 9]`) · Estimación **3** ·
FR-20 · OL-06 · AC-T5.3, AC-T5.4 · C-10 · TBD-02 · RN-22 · readme §6.0 DoD · US-074 AC-1…AC-6 ·
Fuente: `backlog/features/FEAT-T5a-baseline-evaluacion.md` §US-074; contexto:
`backlog/sprints/S2-refinamiento.md` §2 y §3.2 (ADR-41 AC-5 fija cómo se adjunta el reporte).

## Why

La DoD exige la suite OL-06 en cada PR que cambie modelo, prompt, umbral, catálogo o corpus, pero
hoy depende de la disciplina de quien abre el PR. La CI debe detectarlo, ejecutar `evaluate`, publicar
el reporte y fallar ante una regresión configurada.

## What Changes

- **Nuevo** `ci/eval-trigger-paths.yaml`: rutas y claves que disparan el job (prompts de
  `rag-orchestrator`, `packages/clinical-catalogs/**`, manifiesto del corpus en `data/raw/`, claves
  `RELEVANCE_THRESHOLD`, `LLM_MODEL` y demás de modelos y umbrales en `.env.example` y en la
  configuración versionada; las de PII de ADR-40).
- **Nuevo** job `eval-required` en `.github/workflows/ci.yml`: si el diff toca un disparador,
  ejecuta `npm run evaluate -- --suite all --report json` con la configuración de CI (FX-T5a-a,
  adapters falsos, sin red), publica el reporte como artefacto y como comentario del PR con la tabla
  de métricas y la marca validada / no validada (AC-1, AC-2, AC-3, AC-6).
- **Comparador de regresión** con `eval/configs/regression.yaml`: sin umbrales → éxito con el aviso
  "Sin baseline de regresión: umbral no aplicado" (AC-4); con umbrales → falla y nombra la métrica
  (AC-5). Los umbrales reales llegan después como cambio de configuración (US-073 + DEC-07), sin
  tocar el job.
- El reporte con modelos reales se adjunta desde la máquina de referencia cuando la CI no puede
  correrlos (ADR-41 AC-5).

## Capacidades afectadas

- `ai-evaluation` (ADDED): evaluación obligatoria en PR y umbral de regresión.

## Bounded contexts

- **clinical-platform** (infra/CI): `.github/workflows/ci.yml`, `ci/eval-trigger-paths.yaml`,
  `scripts/ci/` (detección de disparadores y comentario).
- **ai-services:** `eval/configs/regression.yaml` y el comparador en `app/evaluation/`.

## Dependencias

- ⛔ `l1d-235-suite-evaluate` (072a: `npm run evaluate` y el reporte JSON).
- ↪ `l1d-232-adr41-framework-evaluacion` (AC-5 del ADR: cómo se adjunta el reporte).
- ↪ ARR-01 (L1D-277): servicios de CI (PostgreSQL de test, Milvus) si la configuración los necesita;
  la de FX-T5a-a no.
- 🔗 Relacionadas: `l1d-236-calibracion-umbral-baseline` y US-017 · DEC-07 (umbrales reales).

## Fuera de alcance

Fijar los umbrales reales (DEC-07). Correr modelos reales en la CI.
