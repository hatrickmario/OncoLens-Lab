# Proposal — l1d-205-adr40-deteccion-pii

## Trazabilidad

L1D-205 · US-013 · ADR-40 · FEAT-T4a (L1D-40) · Sprint 2 · Estimación **5** · Historia de ADR ·
RN-10, RN-11, RN-12, RN-14, RN-22 · G-8 · FR-20 · readme §2.5, §2.6, §4.2 · OL-03, OL-05 tarea 12 ·
US-013 AC-1…AC-6 · `[S1 resp. 3]` (opción A vigente en US-049) · Fuente:
`backlog/features/FEAT-T4a-acceso-identidad-pacientes.md` §US-013; contexto:
`backlog/sprints/S2-refinamiento.md` §3.1 (**P-2, decidido por el usuario el 2026-10-21**).

## Why

El texto libre (pregunta, notas, eventos, atributos) debe llegar siempre desidentificado a Backend 2
(RN-10, RN-11) y el gate de PII de documentos (FEAT-01b, S3) necesita un motor que alcance G-8
(sensibilidad ≥ 0,95 en identificadores directos). Hoy rige el escenario más probable aceptado en
el S1 (`[S1 resp. 3]`): la opción A en `clinical-api`
(`apps/clinical-api/src/modules/evidence-analysis/deidentification/pii-detector.opcion-a.ts`:
coincidencia exacta con la identidad conocida + formatos de `config/pii-formats.json`). No hay
dataset de PII sembrada que permita afirmar G-8 ni adapter `pii/` en `rag-orchestrator`. Una fuga
contamina de forma irreversible `clinical_context_snapshot` y la memoria de análisis.

## What Changes

- **Nuevo** `docs/architecture/adr/ADR-40-deteccion-pii.md` (MADR, plantilla `_plantilla-madr.md`)
  con la medición y la decisión (encuadre **propuesto**, P-2, decidido por el usuario el 2026-10-21):
  - **Candidato 1** · patrones configurables en ambos backends + identidad exacta solo en B1. B1 no
    envía a B2 ningún dato de identidad (ni hashes ni indicios); la única excepción del contrato es
    `identityFound` en la **respuesta** de `/documents/extract`.
  - **Candidato 2** · 1 + NER spaCy `es_core_news_md` 3.8.0 (código MIT, **pesos GPL-3.0**,
    descargados, no versionados) en `pii/` de `rag-orchestrator`, directo o vía Presidio 2.2.364.
  - **Regla de elección (fijada antes de medir):** la **más simple** que cumpla G-8 ≥ 0,95 en
    identificadores directos, con falsos positivos sobre términos clínicos medidos; si gana 2, la
    GPL-3.0 de los pesos se registra como riesgo aceptado del MVP académico (sin redistribución).
  - **Descartadas sin medir, con motivo:** GLiNER `urchade/gliner_multi_pii-v1` (1,16 GB > margen de
    0,71 GB del stack con el LLM G de ADR-39), servicio de PII aparte (memoria y operación), NER con
    el LLM local (no determinista, consume el semáforo de inferencia), enmascarar en B2 la pregunta
    (viola RN-10/RN-11).
- **Nuevo** dataset `data/eval/pii-mini/` (sintético, `manifest` con `clase: sintetico`; valores de
  rangos reservados, admitidos en el `pii-scan` por valor con hash en `config/pii-allowlist.json`,
  nunca por exclusión de ruta): PII
  sembrada en pregunta, notas, eventos, atributos y texto de documento (FX-T4a-a, FX-T4a-c como base),
  con etiquetas por *span* y tipo (`findingTypes`), formatos de varios países y un conjunto de
  términos clínicos de control para falsos positivos. Lo reutiliza US-072 (AC-6).
- **Nuevo** script de medición repetible en `apps/rag-orchestrator/app/scripts/adr40/` (lado B2,
  candidatos 1 y 2) y comando `npm run eval:pii` en `clinical-api` (lado B1, candidato 1 con el
  detector existente), ambos con salida JSON de agregados en `reports/adr40/`.
  `es_core_news_md` solo en `requirements-eval.txt` (medición), nunca en `requirements.txt`.
- **Fila** de ADR-40 en `docs/architecture/adr/README.md` y marca de ADR implementado en
  `backlog/02-adrs.md` **al implementarse** (no en este paso de planificación).
- Sin cambios de contrato ni de specs: `skip_specs: true` (entregable = registro de la decisión).

## Capacidades afectadas

Ninguna spec se modifica (`skip_specs: true`). Relacionadas, sin delta: `deidentification`
(punto de enmascaramiento, ya especificado por L1D-203), `ai-evaluation` (dataset `pii-mini`,
consumido por US-072).

## Bounded contexts

- **ai-services:** `apps/rag-orchestrator/app/scripts/adr40/`, `requirements-eval.txt`,
  `data/eval/pii-mini/`, `docs/architecture/adr/ADR-40-deteccion-pii.md`.
- **clinical-platform:** solo el comando de medición `npm run eval:pii` (lectura del detector
  existente; no cambia su comportamiento).

## Dependencias

- ↪ change archivado de L1D-203 (US-049, desidentificación del contexto): detector opción A.
- ↪ ADR-39 fase B aceptada (change archivado de L1D-274): margen de memoria 0,71 GB con G.
- 🔗 Lo consume `l1d-235-suite-evaluate` (US-072b, AC-6: sensibilidad del detector de B1 sobre
  `pii-mini`).
- 🔗 Bloquea: FEAT-01b (adapter `pii/` y gate de documentos, **S3**), FEAT-02b/02c, FEAT-11c.

## Fuera de alcance

- Implementar el adapter `pii/` de Backend 2 y el gate de documentos (FEAT-01b, S3).
- Cambiar el enmascaramiento de US-049 o las clases de datos (#14). Regla de proveedores
  (Regresión [RN-12] activa desde S6, US-050).
