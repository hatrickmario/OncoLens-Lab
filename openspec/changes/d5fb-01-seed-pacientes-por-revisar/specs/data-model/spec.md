## ADDED Requirements

### Requirement: El seed deja datos por revisar en al menos dos pacientes
El seed MUST sembrar datos clínicos en `requiere_revision` en al menos dos pacientes semilla: los biomarcadores de (f) (FX-T3-a, US-071) y el Ki-67 `20 %` de (h) en un examen propio (feedback de la Demo 5). Todo otro dato sembrado MUST seguir `verificado` y los pacientes semilla MUST seguir siendo 13.

#### Scenario: El Ki-67 de (h) queda por revisar sin cambiar su checklist [Origen: feedback de la Demo 5, 2026-11-05]
- **GIVEN** el seed aplicado
- **WHEN** se consultan los biomarcadores de (h)
- **THEN** el `Ki-67` con valor `20 %` tiene `review_status = requiere_revision` en un examen propio, y `RE`, `RP` y `HER2` siguen `verificado`
- **AND** el checklist de (h) no gana ni pierde faltantes respecto de antes del cambio

#### Scenario: Solo (f) y el Ki-67 de (h) tienen biomarcadores sin verificar [Origen: feedback de la Demo 5, 2026-11-05] [US-039 AC-2] [US-071 FX-T3-a]
- **WHEN** se consultan los biomarcadores con `review_status <> 'verificado'` de todos los pacientes semilla
- **THEN** solo existen los de (f) (Ki-67 y el RE en conflicto) y el Ki-67 de (h), y `clinical.patient` sigue contando 13 pacientes semilla

#### Scenario: El listado muestra al menos dos pacientes con datos por revisar [Origen: feedback de la Demo 5, 2026-11-05] [US-048 AC-1]
- **GIVEN** el seed aplicado y `doc1@test.local` con sesión válida
- **WHEN** pide `GET /platform/patients`
- **THEN** `pendingReviewCount` es 2 para (f), 1 para (h) y 0 para los demás pacientes semilla, y al menos dos pacientes tienen un valor mayor que 0
