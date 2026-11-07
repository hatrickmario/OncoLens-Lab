# Proposal — l1d-330-relative-end-day

## Trazabilidad

L1D-330 · US-272 · FEAT-12 (L1D-312, bloque 12-B, capacidad A) · Sprint 6 · Estimación **2** · HU-15 · FR-21 · RN-11,
RN-01 · ADR-26, ADR-34 · AC-02.1 · US-272 AC-1…AC-4 · `[S6 resp. 23]` · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-272; origen: nota «Notas (sin tarea)» de
`openspec/changes/l1d-318-chat-examen-tratamiento-periodo/design.md` y su regla ya probada en dominio
(`HechoDelCaso.dia_relativo_fin`, `filtrar_hechos_por_periodo`); plan: `backlog/sprints/S6-plan.md` (O5, lote R1);
vocabulario: `backlog/sprints/S6-glosario-chat.md`. Medido en US-269 (`l1d-326`).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 23]`: alta dentro del Sprint 6; el ancla de «últimos N días» en el día 0
  del diagnóstico se mantiene (REVISAR en la Demo 6).
- **ADR-26:** el campo es aditivo (opcional y `nullable`); sube la versión **menor** del contrato de rag (el único que
  define `CaseFact`).
- **RN-11 / ADR-34:** Backend 2 solo ve días relativos; la verbalización la escribe Backend 1 en código.

## Why

La regla de periodo de `l1d-318` ya sabe tratar un hecho con intervalo, pero `CaseFact` solo trae el día de inicio. Una
quimioterapia iniciada hace 160 días y todavía activa (o terminada hace 60) desaparece de «¿qué ocurrió en los últimos
100 días?» y el oncólogo podría creer que el paciente no estuvo o no está en tratamiento. Con el día relativo de fin en el
hecho, la regla ya existente se activa en integración.

## What Changes

- **Contrato (aditivo):** `CaseFact.relativeEndDay` opcional y `nullable` (entero o `null`) en el `openapi.yaml` de rag
  (versión menor; el cliente TS de clinical-api se regenera, y su `openapi.yaml` no cambia); ejemplos con intervalo,
  terminado y en curso.
- **Backend 1:** `construirHechosDelCaso` calcula `relativeEndDay` con el mismo ancla del día 0 que `relativeDay`, solo
  para tratamientos previos: entero si hay fecha de fin; `null` explícito si el tratamiento está **en curso** (`ongoing` y
  sin fecha de fin); campo ausente en cualquier otro caso (hecho puntual o fin desconocido).
- **Backend 2:** el borde `traduccion.hechos_del_caso` lee el campo; un `null` explícito marca `HechoDelCaso.en_curso`; la
  rama de intervalos de `filtrar_hechos_por_periodo` queda activa: el hecho cuyo fin cae dentro del periodo, o que sigue
  en curso, entra y lleva «(iniciado antes del periodo)» si empezó antes; el en curso lleva además «(en curso)»; el que
  terminó antes del periodo no entra.
- **`describir_hecho`** incorpora el fin del intervalo («hasta N días antes del diagnóstico») para el prompt y la premisa
  del NLI; la verbalización de Backend 1 no cambia.
- **Respuesta sin datos del periodo:** un periodo que deja sin hechos responde con el único bloque `limitacion` de texto
  fijo, sin texto del LLM (ver pendiente P-2).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- Ninguna de `openspec/specs/`. Los requisitos se añaden a `patient-chat` y `chat-conversation`, capacidades nuevas de
  FEAT-12 (creadas por `l1d-316` y `l1d-315`; este delta usa requisitos de título distinto).

## Bounded contexts

`contratos` (rag, versión menor, ejemplos) · `clinical-platform` (`apps/clinical-api`,
`construirHechosDelCaso` y el builder del contexto) · `ai-services` (`apps/rag-orchestrator`, borde y dominio del
periodo). Sin `frontend`.

## Dependencias

- ↪ `l1d-318-chat-examen-tratamiento-periodo` (US-261): regla `filtrar_hechos_por_periodo` y `dia_relativo_fin` ya en
  dominio (en integración, inactiva hasta este change). Entrada en `main` obligatoria.
- ↪ `l1d-317-chat-caso-situacion` (US-260): `caseFacts[]`, `construirHechosDelCaso`.
- **Coordinación con `l1d-319-chat-contradicciones` (mismo nodo `caso` y mismo `hechos-del-caso.ts`):** este change va
  **antes** de L1D-319 en O5 (2 pts, con contrato; L1D-319 no tiene contrato) o, si se paraleliza, L1D-319 se rebasa
  sobre este; nunca dos ramas sobre `hechos-del-caso.ts` y `traduccion.py` a la vez.
- 🔗 Medido en `l1d-326` (US-269) · Coordina el número de versión con `l1d-329-segundo-loop-contextual` (ver
  `design.md` Contratos).

## Pendientes de definir (para /sprint-start)

- **P-1 · Semántica de `relativeEndDay = null`** (dueño: PO; afecta: AC-2, Backend 1 y Backend 2). US-272 AC-2 dice «`null`
  = en curso solo para tratamientos con estado activo» `(asumido)`. Hallazgos al revisarlo contra el código: (a) el
  tratamiento del contexto es `PriorTreatment`, que **no tiene `status` activo**: tiene `ongoing` (booleano) y `endedAt`;
  `Treatment.status = activo` es el tratamiento decidido, que no entra en `caseFacts`; (b) en Backend 2 `dia_relativo_fin
  = None` ya significa «puntual o aún no informado» (`l1d-318`): un `null` explícito no se distingue de «ausente» salvo
  por presencia del campo. Supuesto de este change: «estado activo» = `ongoing = true` sin `endedAt`; `null` explícito =
  en curso, **campo ausente** = puntual o fin desconocido, y el borde de Backend 2 distingue ambos por presencia
  (`model_fields_set`). Alternativa descartada: un booleano `ongoing` aparte (un campo más de contrato). Si el PO prefiere
  el booleano, cambia el contrato de esta historia.
- **P-2 · Texto de «periodo sin hechos»** (dueño: PO; afecta: tarea de AC-4). US-272 AC-4 pide el texto «No se encontró
  información documentada sobre lo preguntado en el expediente», pero `l1d-318` ya implementa para el periodo vacío con
  expediente con datos otro texto fijo (`CHAT_SIN_DATOS_PERIODO_TEXTO`: «No se encontró información documentada en el
  periodo consultado; el expediente tiene datos fuera de ese periodo»). Supuesto de este change: se conserva el texto de
  `l1d-318` (comienza igual, es más preciso y ya tiene su `.env.example`) y se enmienda la redacción del AC-4.

## Fuera de alcance

- Cambiar el ancla del periodo (día 0 del diagnóstico; revisión en la Demo 6) y periodos con fechas absolutas.
- Eventos con intervalo: `ClinicalEvent` solo tiene `eventDate`; no emite `relativeEndDay`.
- Tratamientos decididos (`Treatment`): siguen fuera de `caseFacts` en el MVP.
- Rótulos de UI de «en curso» (la UI pinta el bloque tal como llega).

## Impact

- `apps/rag-orchestrator/openapi.yaml` (1.14.0; `clinical-api/openapi.yaml` sin cambios), `contracts/examples/`
  (`chat-turn-request-caso-periodo.json`, `chat-turn-caso-periodo.json`, uno nuevo de en curso), `packages/api-contracts/`
  (generado).
- `apps/clinical-api/src/modules/evidence-analysis/` (`ports.ts` `EnlaceDeDato`, `clinical-context.builder.ts`,
  `conversation/hechos-del-caso.ts`).
- `apps/rag-orchestrator/app/application/chat/traduccion.py`, `app/domain/chat/` (`turno.py`,
  `periodo_de_la_pregunta.py`, `descripcion_de_hechos.py`).
- No cambia prompt, modelo, umbral, catálogo ni corpus: sin `run-ai-eval`.
