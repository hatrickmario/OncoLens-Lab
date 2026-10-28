# Proposal — l1d-181-procedencia-contexto-ia

## Trazabilidad

L1D-181 · US-065 · FEAT-T1a (L1D-34) · Sprint 3 · Estimación **3** · HU-03 · RN-07 (dueña: etiquetas en el
contexto y exclusión de rechazados) · AC-02.6 (contexto), AC-T1.1 (contexto) · readme §4.1 `Provenance`,
§4.2 `clinicalContext` · US-065 AC-1…AC-5 · ↪ `l1d-95a-seed-codigos-catalogo` (renombra el seed a `RE`/`RP`) · ↪ US-052 (constructor de contexto, archivado en
`2026-10-18-l1d-103-gateway-contexto-clinico`) · 🔗 Consumida por: US-066 (inciso a de la Base del análisis),
US-124 (`l1d-129-aplicabilidad-causas-avisos`, aviso `en_conflicto`/`sin_verificar`) · `[S3 resp. 8]` (AC-4 sobre
conflicto sembrado).

> **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** el AC-4 se verifica sobre un conflicto **sembrado** (el
> receptor de estrógeno `90 %` de FX-T1a-a, `requiere_revision` con `conflicts_with_id` hacia el del seed,
> insertado por el test, sin detección automática), porque la detección real (US-099) pasó al S5. El AC original,
> con el conflicto detectado por la reconciliación al persistir una extracción, vive en US-099 AC-8 (FEAT-03a, S5).
>
> **Decidido (usuario, 2026-10-27):** es **Non-Goal explícito** que el prompt etiquete la procedencia solo del
> diagnóstico y los biomarcadores en el S3; atributos, tratamientos previos y eventos viajan con `provenance` en el
> payload (B1) pero siguen fuera del bloque del prompt, como hoy.
>
> **Decidido (usuario, 2026-10-24, `[S3 resp. 15]`):** `l1d-287-alias-chunks-cita` va **primero** y sube el prompt
> a `rag-query@0.3.0` (alias de chunks); este change va **después**, hace *rebase* sobre él y sube a
> `rag-query@0.4.0`. Su medición `evaluate` corre sobre el prompt con alias **y** etiquetas.

## Why

Desde que entran datos extraídos (S3), el análisis no puede apoyarse en un dato dudoso como si fuera firme: la IA
tiene que saber qué está verificado, qué no y qué está en conflicto, y nunca usar un dato rechazado o reemplazado
(RN-07; P12, JTBD 8). En el S1 `clinical-api` ya copia los cuatro ejes de procedencia y filtra los descartados
en la lectura, pero ningún test lo fija como invariante sobre el payload y el registro, y `rag-orchestrator`
descarta la procedencia al armar el prompt: el bloque "Contexto clínico" no distingue un Ki-67 sin verificar de
uno verificado.

## What Changes

- **clinical-api:** se fija con tests de aceptación que cada dato del `clinicalContext` (diagnóstico,
  biomarcadores, atributos, tratamientos, eventos) lleva `provenance { entryMethod, extractionConfidence,
  reviewStatus, conflict }`, con `conflict = true` cuando el dato tiene `conflicts_with_id`, y que los datos
  `rechazado`/`reemplazado` no aparecen ni en el `clinicalContext` enviado ni en el `clinical_context_snapshot`
  persistido. La lógica ya existe desde el S1 (`provenanceDe()`, filtro `SIN_RECHAZADOS`); se nombra como la
  regla única de RN-07 y el filtro pasa a usar `sqlDatoVigente()` (fuente única del predicado).
- **rag-orchestrator:** el prompt `rag-query` recibe un bloque de datos del paciente que acompaña cada dato
  `requiere_revision` **del diagnóstico y de los biomarcadores** con la etiqueta "(sin verificar)" y cada dato en conflicto con "(en conflicto)" (asumido,
  ver design D3). Sobre el prompt con alias de `l1d-287` (`rag-query@0.3.0`), sube la versión a
  `rag-query@0.4.0` (`[S3 resp. 15]`). El texto que se embebe para la recuperación
  (`resumen_del_contexto_clinico`) **no** cambia.
- Sin cambio de contrato: `Provenance` existe en `apps/rag-orchestrator/openapi.yaml` desde el Pre-S1 (ADR-26).

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `evidence-analysis-gateway`: procedencia completa en cada dato del contexto y exclusión de rechazados y
  reemplazados en el payload y en el registro (ADDED; no modifica "Contexto clínico por allowlist explícita",
  que modifica `l1d-98-faltantes-al-analisis`, y cumple su "Regresión [RN-07] activa desde S3 (US-065)").
- `evidence-analysis`: el prompt etiqueta los datos del paciente sin verificar o en conflicto (ADDED).

## Bounded contexts

- **clinical-platform** (`apps/clinical-api`): tests de aceptación AC-1…AC-4 (Supertest, PostgreSQL real,
  `rag-orchestrator` simulado con MSW) y refactor del predicado de RN-07.
- **ai-services** (`apps/rag-orchestrator`): bloque de datos del paciente con etiquetas en el prompt (AC-5).

## Dependencias

- ↪ archivados: `2026-10-18-l1d-103-gateway-contexto-clinico` (US-052, `ClinicalContextBuilder`),
  `2026-10-18-l1d-203-desidentificacion-contexto-ia` (US-049, desidentificación del contexto),
  `2026-10-18-l1d-104-persistencia-analisis-fallos` (registro con `clinical_context_snapshot`).
- ↪ **l1d-287-alias-chunks-cita** (US-236) `[S3 resp. 15]`: mergea primero (`rag-query@0.3.0`, alias `C1…Cn` en
  `construir_prompt_rag_query()`, que recibe `fragmentos: Sequence[FragmentoConAlias]`, y `generation.py`); este change hace *rebase* sobre él, añade el bloque de datos
  del paciente al mismo prompt (como el argumento `contexto_clinico: str` existente) y sube a `rag-query@0.4.0`.
- 🔗 Coordina con **l1d-129-aplicabilidad-causas-avisos** (US-124): ese change consume
  `provenance.conflict`/`reviewStatus` para `patientDataWarning`; la mitad B1 de su AC-3 (conflicto sembrado →
  `conflict = true`) la verifica este change (US-065 AC-4). Ninguno bloquea al otro: l1d-129 construye el
  `clinicalContext` directamente en sus tests de B2.
- 🔗 Coordina con **l1d-98-faltantes-al-analisis** (US-006): ambos tocan `clinical-context.builder.ts`; este
  change no modifica su requisito ni `missingCriticalData`. Si se implementan en paralelo, el segundo en mergear
  rebasa.
- 🔗 Coordina con **l1d-128-aplicabilidad-textual-citada** (US-123): añade un prompt de aplicabilidad distinto;
  este change solo toca `rag-query`.
- 🔗 US-099 (S5): detección real de conflictos (US-099 AC-8). 🔗 FEAT-03b (S4): flujo real de revisión.

## Fuera de alcance

- Detección de conflictos al extraer o al reconciliar (US-099, S5): aquí el conflicto se siembra con FX-T1a-a.
- Flujo de revisión humana (verificar, corregir, rechazar) y su UI (FEAT-03b, S4).
- Marcar como `conflict = true` el **otro** extremo del conflicto (el dato del seed sin `conflicts_with_id`) o
  enviar ambos valores en conflicto: no lo pide ningún AC (ver Pendientes en design.md).
- Etiquetar en el prompt la procedencia de atributos, tratamientos previos y eventos (Non-Goal explícito del S3,
  decidido 2026-10-27): solo diagnóstico y biomarcadores.
- Sembrar el conflicto en el paciente (a) de la demo: rompería el AC-1 (`conflict = false` en el seed).
- Base del análisis (US-066, ya archivada en el S2) y textos de UI.

## Impact

- `apps/clinical-api/src/modules/evidence-analysis/` (`clinical-context.builder.ts`,
  `evidence-analysis.repository.ts`) y `tests/integration/evidence-analysis/` (FX-T1a-a ya existe en
  `tests/support/filas-sinteticas.ts`).
- `apps/rag-orchestrator/app/prompts/rag_query.py`, `app/application/generation.py` y sus tests.
- Cambia un **prompt**: OL-06 obligatoria (`run-ai-eval`).
