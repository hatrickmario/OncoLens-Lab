# Proposal — l1d-94-checklist-determinista

## Trazabilidad

L1D-94 · US-002 · FEAT-04 (L1D-14) · Sprint 3 · Estimación **5** · HU-18 · FR-23 (checklist determinista de
datos críticos) · RN-07 (rechazado/reemplazado nunca cuentan) · RN-22 (reglas en el catálogo, no en código) ·
RN-27 (`no_mapeado` nunca recibe concepto) · RN-29 (consume: todo ítem tiene destino) · AC-04.1, AC-04.4 ·
US-002 AC-1…AC-8 · ↪ US-001 (L1D-93) · ⛔ DEC-01 (L1D-92): escenario `propuesta_revisada` aceptado para el S3,
cierre en la sesión de oncólogos del S4 `[S3 resp. 1]` · 🔗 Medido en: US-131 (M-04.1, M-04.2).

> **Decidido (usuario, 2026-10-23, `[S3 resp. 5]`, paquete FEAT-04):**
> - En el catálogo real, `whenConditionUnknown = faltante` en los ítems condicionales (DEC-01 Q4). El motor solo
>   aplica lo que declara el catálogo: el AC-4 sobre `test-1.0.0` no cambia.
> - Cuenta el registro **más reciente** aunque no esté verificado (regla 4, conservador): un verificado antiguo
>   con uno más reciente sin verificar da `presente_sin_verificar`.
> - Un `no_mapeado` crítico no se marca aparte; US-131 lo mide. **Decidido (usuario, 2026-10-24):** cuenta como
>   presente sin verificar si su `name` coincide con el catálogo (sustituye a «el ítem queda `faltante`»).
> - Sin cambio de esquema en el S3 para la "ausencia confirmada" (DEC-01 Q8): un paciente sin `PriorTreatment`
>   con la condición cumplida queda en `faltante`. La pregunta va a la sesión de oncólogos del S4.

## Why

Hoy el oncólogo descubre lo que le falta *después* de analizar (AS-IS P4, JTBD 2: "el loop más costoso"), y
`missingCriticalCount` y `missingCriticalData` salen fijos en `0` / `[]`. Para que el checklist, la vista de caso
(US-003/US-004, S4), el inciso (b) de la Base del análisis (US-128) y la causa `falta_en_paciente` de la
aplicabilidad (US-124) tengan un dato real, hace falta un cálculo del estado de cada dato crítico que sea siempre
el mismo para los mismos datos y la misma versión del catálogo, sin IA y cambiable sin desplegar código.

## What Changes

- **Motor puro de completitud** en `clinical-api` (`completeness.rules.ts`): dada la lista de ítems del catálogo
  de datos críticos (US-001) y los datos del paciente, clasifica cada ítem en `presente_verificado`,
  `presente_sin_verificar`, `faltante` o `no_aplica` con la regla de cinco pasos de US-002 (tipo de cáncer del
  `Diagnosis` activo → condición declarativa / `whenConditionUnknown` → registros vigentes (RN-07) y
  `minValues` → registro más reciente contra `verifiedReviewStatuses` → orden del catálogo).
- **`CompletenessService` + repositorio de lectura** en `apps/clinical-api/src/modules/completeness/`: lee los
  registros de los campos de destino del paciente y devuelve el resultado con su `catalogVersion`. Sin LLM, sin
  llamadas a `rag-orchestrator`, sin aleatoriedad.
- **Biomarcadores `no_mapeado`** cuentan como presente sin verificar solo si su `name` coincide con el catálogo; nunca se
  emparejan por `original_name` ni similitud (RN-27, decisión del usuario 2026-10-24).
- **Fixtures FX-04-a** (catálogos `test-1.0.0` y `test-1.1.0`) y **FX-04-b** (pacientes F-M1, F-M2, F-M3,
  F-P1), compartidos por US-002…US-006 y US-131.
- Sin endpoint nuevo, sin cambio de `openapi.yaml` ni de `contracts/examples/`, sin cambio de esquema Prisma.

## Capabilities

### New Capabilities

- `completeness`: checklist determinista de datos críticos por paciente (FR-23). Capacidad prevista en
  `openspec/config.yaml` y sin spec aún; este change crea su primer requisito (el cálculo). US-003 (API y
  vista), US-005 y US-006 (paso al análisis) la amplían.

### Modified Capabilities

- Ninguna. La forma del catálogo de datos críticos y su validador son de `clinical-catalogs` vía L1D-93 (US-001);
  este change solo los consume.

## Bounded contexts

- **clinical-platform** (`apps/clinical-api`): único contexto con código. `ai-services` no interviene (el
  catálogo ya está montado en ambos backends; el uso de faltantes en el prompt es de US-116). `frontend` no
  cambia (US-004, S4).

## Dependencias

- ↪ **L1D-93 (US-001)**, change del S3 que crea otro agente en paralelo: esquema de ítem de
  `datos-criticos.json` (`key`, `cancerType`, `destination`, `condition`, `whenConditionUnknown`, `minValues`,
  `estado`), `verifiedReviewStatuses` a nivel de catálogo, carga validada al arrancar (`catalog:validate`) y el
  contenido inicial. Este change consume el catálogo ya validado; los AC se verifican con FX-04-a, así que puede
  avanzar en paralelo y se rebasa sobre él.
- ⛔ **DEC-01 (L1D-92)**: no bloquea el código (las reglas viven en el catálogo) `[S3 resp. 1]`.
- 🔗 Produce para: **US-006 (L1D-98)** (faltantes viajan al análisis), **US-003 (L1D-95, S4)** (API
  `/completeness`), **US-124 (L1D-129, `l1d-129-aplicabilidad-causas-avisos`)** (causa `falta_en_paciente`),
  **US-128** (inciso b), **US-131** (M-04.1, M-04.2).

## Fuera de alcance

- Exponer el checklist por API, en la vista de caso o en la ficha → US-003 (S4); mostrarlo → US-004 (S4).
- Sustituir `FALTANTES_CRITICOS_POR_AHORA` en `missingCriticalCount` y poblar `missingCriticalData` del análisis
  → US-003 / US-006.
- Medir sensibilidad y especificidad, y contar los `no_mapeado` críticos → US-131.
- Contenido real del catálogo y su revisión clínica → US-001 / DEC-01. Marca de "ausencia confirmada" → sesión de
  oncólogos del S4 (DEC-01 Q8).
- Antigüedad máxima de un dato (DEC-01 Q7): no hay regla en el S3.

## Impact

- `apps/clinical-api/src/modules/completeness/` (nuevo: `completeness.rules.ts`, `completeness.service.ts`,
  `completeness.repository.ts`, `ports.ts`, `completeness.module.ts`), cableado en `src/composition.ts`.
- `apps/clinical-api/tests/fixtures/completeness/` (FX-04-b) y `packages/clinical-catalogs/test/fixtures/`
  (FX-04-a; si L1D-93 ya los crea, se reutilizan).
- API: sin cambio. Esquema: sin cambio. Evaluación: sin cambio de modelo, prompt, umbral ni corpus; el catálogo
  real no cambia aquí (lo cambia US-001).
