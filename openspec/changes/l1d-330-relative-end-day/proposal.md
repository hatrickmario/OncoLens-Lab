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
- **Decidido (usuario, 2026-11-06), semántica de AC-2:** «activo» = `ongoing = true` sin `endedAt`;
  `relativeEndDay = null` explícito = en curso, entero = fin, **ausente** = puntual o fin desconocido; si hay `endedAt`
  gana la fecha. **Sin campo nuevo en `CaseFact`** (nada de un booleano `ongoing`).
- **Decidido (usuario, 2026-11-06), periodo:** los tratamientos que terminaron **antes** del periodo se excluyen sin marca;
  las marcas son «(iniciado antes del periodo)» y «(en curso)»; el test de integración de `l1d-318` que lo contradiga se
  ajusta con el trailer `Test-Removal`.
- **Decidido (usuario, 2026-11-06), AC-4:** se conserva `CHAT_SIN_DATOS_PERIODO_TEXTO` de `l1d-318`; el AC-4 cita ambos
  casos (sin datos en absoluto y sin datos en el periodo pero con datos fuera de él).
- **ADR-26:** el campo es aditivo (opcional y `nullable`); sube la versión **menor** del contrato de rag (el único que
  define `CaseFact`), con «la siguiente menor libre respecto de `main`» (orden esperado 323 → 330 → 329).
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
  para tratamientos previos: entero si hay fecha de fin (gana la fecha aunque `ongoing` sea `true` o la fecha sea
  incierta); `null` explícito si el tratamiento está **en curso** (`ongoing = true` y sin fecha de fin); campo ausente en
  cualquier otro caso (hecho puntual, `ongoing = false` sin fecha de fin = fin desconocido, o sin fecha de diagnóstico).
- **Backend 2:** el borde `traduccion.hechos_del_caso` lee el campo; un `null` explícito marca `HechoDelCaso.en_curso`; la
  rama de intervalos de `filtrar_hechos_por_periodo` queda activa: el hecho cuyo fin cae dentro del periodo, o que sigue
  en curso, entra y lleva «(iniciado antes del periodo)» si empezó antes; el en curso lleva además «(en curso)»; el que
  terminó antes del periodo no entra.
- **`describir_hecho`** incorpora el fin del intervalo («hasta N días antes del diagnóstico») para el prompt y la premisa
  del NLI; la verbalización de Backend 1 no cambia.
- **Respuestas sin datos (AC-4):** sin datos en absoluto, el único bloque `limitacion` con «No se encontró información
  documentada sobre lo preguntado en el expediente» (`CHAT_SIN_DATOS_TEXTO`); sin datos en el periodo pero con datos
  fuera de él, el de `CHAT_SIN_DATOS_PERIODO_TEXTO` de `l1d-318`; ambos fijos y sin texto del LLM.
- **Ancla visible:** cuando el turno aplica un periodo y entran hechos, un bloque `limitacion` fijo y determinista
  «Periodo medido desde la fecha del diagnóstico» (constante única en `domain/chat/mensajes.py`).
- **Dato en curso sin verificar (RN-26):** si un hecho «en curso» tiene `reviewStatus = requiere_revision`, `notices[]`
  añade un aviso fijo de «sin verificar»; no bloquea la respuesta.

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
- **Orden de merge** (glosario S6 §1): `l1d-323` (rag 1.14.0) → **este change (1.15.0)** → `l1d-329` (1.16.0), cada uno
  con «la siguiente menor libre»; el segundo en mergear rebasa y **regenera** `packages/api-contracts/` (nunca se
  resuelven los generados a mano). Orden en O5: **330 → 319** (mismo `hechos-del-caso.ts`).
- 🔗 Medido en `l1d-326` (US-269).

## Pendientes de definir (para /sprint-start)

Ninguno. P-1 (semántica de `relativeEndDay = null`) y P-2 (texto de «periodo sin hechos») los decidió el usuario el
2026-11-06 (ver «Decisiones que se respetan»).

## Fuera de alcance

- Cambiar el ancla del periodo (día 0 del diagnóstico; revisión en la Demo 6) y periodos con fechas absolutas.
- Eventos con intervalo: `ClinicalEvent` solo tiene `eventDate`; no emite `relativeEndDay`.
- Tratamientos decididos (`Treatment`): siguen fuera de `caseFacts` en el MVP.
- Rótulos de UI de «en curso» (la UI pinta el bloque tal como llega).

## Impact

- `apps/rag-orchestrator/openapi.yaml` (versión menor siguiente a `main`; `clinical-api/openapi.yaml` sin cambios),
  `contracts/examples/` (**ejemplos nuevos**: `chat-turn-request-caso-intervalo.json`, `chat-turn-caso-intervalo.json`,
  `chat-turn-request-caso-en-curso.json`, `chat-turn-caso-en-curso.json`; los de `l1d-318` no se editan),
  `packages/api-contracts/` (generado).
- `apps/clinical-api/src/modules/evidence-analysis/` (`ports.ts` `EnlaceDeDato`, `clinical-context.builder.ts`,
  `conversation/hechos-del-caso.ts`).
- `apps/rag-orchestrator/app/application/chat/traduccion.py`, `app/domain/chat/` (`turno.py`,
  `periodo_de_la_pregunta.py`, `descripcion_de_hechos.py`).
- No cambia prompt, modelo, umbral, catálogo ni corpus: sin `run-ai-eval`.
