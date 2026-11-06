# Proposal — d5fb-01-seed-pacientes-por-revisar

## Trazabilidad

Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del usuario) ·
extiende **US-254** (pacientes semilla en distintos momentos de la enfermedad, `data-model`) y **US-048** (columna «Por
revisar» del listado) · RN-08 (un dato sin verificar convive con los verificados) · RN-26 (los avisos clínicos no bloquean) ·
RN-14 (solo datos sintéticos) · `[CLAUDE.md Política TDD]`: seed → **test después**.

> Fuente del feedback: «En la columna "Por revisar" del listado /pacientes solo hay 1 paciente con 2 por revisar; aumenta a
> al menos 2 pacientes con exámenes por revisar.»

## Why

El contador `pendingReviewCount` del listado funciona (`patients.repository.ts` cuenta las filas en `requiere_revision`),
pero el seed solo siembra datos por revisar en el paciente (f) (Ki-67 y RE). En la demo la columna «Por revisar» muestra a
un único paciente con 2, y no se aprecia que sea una señal del listado y no una rareza de un caso.

## What Changes

- El paciente semilla **(h)** (mama adyuvante, «Prueba Sintética 8») pasa a tener su **Ki-67 `20 %` en `requiere_revision`**,
  en un examen propio (el Ki-67 deja el examen `examen-ihq` y se siembra como `examen-ki67`, con la misma fecha relativa o
  una cercana). El resto de (h) no cambia.
- Resultado en el listado: (f) con 2 y (h) con 1 en «Por revisar» (2 pacientes); el resto de pacientes con 0.
- Se ajustan los tests, conteos y guías que afirmaban «solo (f) tiene biomarcadores sin verificar» (ver `design.md` D3).
- No cambia el número de pacientes (13), ni identidades, contratos, API, esquema ni UI.

## Capabilities

### New Capabilities

— (ninguna)

### Modified Capabilities

- `data-model`: requisito nuevo «El seed deja datos por revisar en al menos dos pacientes» (matiza «Contenido verificable
  de los pacientes semilla»; el Ki-67 de (h) queda por revisar).

## Impact

- `apps/clinical-api/prisma/seed/pacientes/h.ts` (y, si hace falta, `auxiliares.ts`: `ki67()` con parámetro opcional).
- `apps/clinical-api/tests/integration/seed/contenido.test.ts` (afirmación «todo biomarcador está verificado salvo los de
  (f)») y un test nuevo del listado/contador sobre el seed.
- `docs/demo/guia-demo-S5.md` (fila de (h) y descripción de la columna «Por revisar»).
- Sin impacto en `contracts/`, `apps/web`, `scripts/demo/verificar-conteos.py`, `contar-en-proceso.ts` ni `levantar.sh`
  (verifican conteos de pacientes, tratamientos, eventos y atributos, no de biomarcadores por estado).
