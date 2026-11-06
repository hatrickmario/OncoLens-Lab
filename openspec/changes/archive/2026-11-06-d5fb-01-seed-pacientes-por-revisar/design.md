# Design — d5fb-01-seed-pacientes-por-revisar

## Context

El listado `/pacientes` muestra `pendingReviewCount` por paciente: cuenta filas con `review_status = requiere_revision` en
diagnósticos, biomarcadores, tratamientos, eventos y atributos (`patients.repository.ts`). El seed (`sembrar.ts`) respeta
`estadoDeRevision` de cada `BiomarcadorSemilla`; solo (f) (FX-T3-a) lo usa. Un dato `requiere_revision` cuenta como
**presente sin verificar** en el checklist de faltantes (guía S3; RN-26: no bloquea).

## Goals / Non-Goals

**Goals:** que «Por revisar» muestre ≥ 2 pacientes con exámenes por revisar en el seed de la demo.
**Non-Goals:** cambiar el contador, la UI, el contrato o el número de pacientes (13); crear pacientes nuevos.

## Decisions

- **D1 · Modificar un paciente existente, no crear uno.** Crear un paciente (n) cambiaría el conteo 13 que verifican
  `levantar.sh` («esperado=13 obtenido=13»), `verificar-conteos.py`, `contar-en-proceso.ts`, el spec `data-model` y la guía.
  Modificar uno existente solo toca su fichero de seed y un test.
- **D2 · El paciente elegido es (h), con el Ki-67 `20 %` en `requiere_revision`.** Alternativas descartadas:
  - (g): su HER2 `2+` por IHQ sin ISH es clínicamente el dato «por revisar» natural, pero (g) es el caso de faltantes
    (HER2 por ISH, Ki-67, BRCA) de la guía y de `pacientes-momentos.test.ts` AC-3 (que exige faltantes de (g) distintos de
    los de (l)); marcar su HER2 mezcla dos señales distintas en el mismo caso.
  - (e): es el caso de checklist «Desconocido: falta en el paciente» sin Ki-67 (`contenido.test.ts`: `ki67` vacío); tocarlo
    rompe ese test.
  - (h) ya tiene un Ki-67 `20 %` verificado, así que **no cambia su checklist** (un dato por revisar cuenta como presente) ni
    su BRCA faltante; solo cambia su estado de revisión. Ki-67 es además el mismo dato por revisar que (f), coherente con el
    texto de la guía («Ki-67 pendiente de revisión»).
- **D3 · Cambios acotados.**
  - `h.ts`: el Ki-67 se mueve a un examen propio `examen-ki67` (la misma razón que (f): el gateway envía el último valor por
    nombre y cada biomarcador con su examen evita empates), con `estadoDeRevision: 'requiere_revision'`. Se usa
    `biomarcador('ki67', 'Ki-67', '20 %', { tipoResultado: 'cuantitativo', estadoDeRevision: 'requiere_revision' })` o se
    amplía `ki67(valor, resto?)` en `auxiliares.ts` (parámetro opcional, sin romper a los demás pacientes).
  - `contenido.test.ts` línea ~74: «todo biomarcador está verificado salvo los de (f)» pasa a «salvo los de (f) y el Ki-67 de
    (h)» (el test excluye `patient_id <> idDe('f')`; se añade la excepción de (h) por nombre `Ki-67`). Es un cambio de
    aserción por cambio del AC en la spec, no un debilitamiento.
  - Test nuevo (integración sobre el seed real): `pendingReviewCount` de `GET /platform/patients` es 2 para (f), 1 para
    (h) y 0 para los demás, y al menos 2 pacientes tienen > 0.
  - `pacientes-momentos.test.ts`: **sin cambios**. Solo afirma faltantes de (g), (k), (l) y la vista de caso 200; (h) no
    entra en sus aserciones de faltantes distintos, y su Ki-67 sigue presente (no faltante).
  - `docs/demo/guia-demo-S5.md`: la fila (h) y el texto del listado indican «Ki-67 20 % por revisar»; «Por revisar»:
    (f) 2 y (h) 1.
- **D4 · Riesgo de análisis.** Un Ki-67 sin verificar en (h) entra al contexto del análisis etiquetado
  (`review_status`, RN-07/RN-26) y aparece como aviso «datos sin verificar» en la Base del análisis; no bloquea. Si algún
  E2E de la demo corre el análisis de (h), solo cambia el aviso; los E2E actuales usan (a), (f) y el paciente «Sintética 7»
  y no se ven afectados (verificado por búsqueda: `paciente-h` solo aparece en `h.ts` e `indice.ts`).

## Risks / Trade-offs

- Cualquier demo grabada que cite «1 paciente por revisar» queda obsoleta: se actualiza la guía.
- Si más adelante el usuario quiere más de 2 pacientes, se repite el patrón sobre (i) o (j) sin más cambios de estructura.
