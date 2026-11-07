# Proposal — l1d-332-aviso-ampliacion-visible

## Trazabilidad

L1D-332 · US-274 · FEAT-12 (L1D-312, bloque 12-C) · Sprint 6 · Estimación **2** · HU-03, HU-15 · RN-19, RN-23, RN-01 ·
AC-T3.1 · ADR-52 · US-274 AC-1…AC-5 · `[S6 resp. 24]` (2026-11-07; D6-42) · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-274. ⛔ US-267 (L1D-324, panel conversacional) y US-271 (L1D-329, AC-10:
aviso de ampliación en `notices[]`, ya en `main`). Regresión [RN-19] → US-069.

## Why

Un turno de evidencia con la búsqueda ampliada con datos del caso (US-271) trae su aviso en `turn.notices[]`, pero la
tarjeta lo pinta al final, bajo las opciones y «Ver detalle»: el oncólogo puede leer una respuesta general como si
respondiera exactamente su pregunta. Además, cuando se recuperó evidencia pero ninguna opción quedó soportada, el turno
trae un bloque `limitacion` («Evidencia recuperada sin opciones soportadas» y el alcance de la recuperación) que la rama
`evidenceAnalysis` de la tarjeta no pinta. Ningún E2E verifica estos dos casos.

## What Changes

- En un turno con `evidenceAnalysis`, los `notices[]` del turno (los dos de RN-19 y, si llegó, el de ampliación) se
  pintan tal cual junto al encabezado «Opciones descritas en la evidencia», antes de las opciones, sin expandir nada;
  ya no van al final de esa tarjeta. Los demás turnos no cambian.
- En ese mismo turno, los bloques `limitacion` del turno se pintan sin plegar bajo el rótulo «Alcance de la respuesta»,
  tras el resultado del análisis.
- `web` no añade, traduce ni reescribe avisos de IA (RN-19 falla cerrado, sin cambios).
- E2E sobre el chat falso con las preguntas literales del fake, a 375 y 1280 px.

## Capabilities

### Modified Capabilities

- `evidence-panel`: requisitos **ADDED** sobre la posición de los avisos del turno de evidencia y la visibilidad de
  sus limitaciones.

## Bounded contexts

`frontend` (`apps/web/components/**`, `apps/web/tests/**`, `apps/web/e2e/**`). Sin `clinical-platform` ni
`ai-services`; sin cambios de contrato.

## Dependencias

- ⛔ `l1d-324-panel-conversacional` (US-267) y `l1d-329-segundo-loop-contextual` (US-271 AC-10), ya en `main`.
- ↪ US-069 (aviso RN-19 solo del turno, regresión).

## Fuera de alcance

Cambiar los textos de los avisos (los escribe Backend 2); avisos de IA propios de `web`; mostrar los valores de los
campos usados en la ampliación; tocar `rag-orchestrator`.

## Impact

`conversation-turn-card.tsx`, `conversation-turn-body.tsx`, `analysis-result.tsx` (prop opcional `avisos`); tests
Vitest + Testing Library + MSW y Playwright. Sin dependencias, `NEXT_PUBLIC_` ni contrato nuevos.
