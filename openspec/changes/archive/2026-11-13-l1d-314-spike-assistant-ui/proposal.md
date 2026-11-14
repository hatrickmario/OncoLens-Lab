# Proposal — l1d-314-spike-assistant-ui

## Trazabilidad

L1D-314 · US-257 · FEAT-12 (L1D-312, bloque 12-C) · Sprint 6 · Estimación **3** · Spike (exento de TDD) ·
RN-19, RN-23, SEG-12 · ADR-51 §8 · US-257 AC-1…AC-7 · `[S6 resp. 2]` (cinco escenarios como criterio de
salida), `[S6 resp. 15]` y `[S6 resp. 16]` (referencia: variante B «Hilo con tarjetas»,
`docs/ux/S6/variante-b.html`) · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md` §US-257; contexto:
`backlog/sprints/S6-refinamiento.md` §1–§5 y `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`.

## Why

ADR-51 decidió la arquitectura del chat (LangGraph en Backend 2, registro en Backend 1), pero dejó
**abierta** la UI: assistant-ui o shadcn a mano sobre los componentes del panel (ADR-51 §8). Adoptar
assistant-ui (0.x, ~267 KB gzip) sin comprobarlo arriesga romper la CSP estricta (US-216), renderizar
HTML crudo del LLM o depender de APIs inestables. US-267 y US-268 necesitan la decisión antes de empezar.

## What Changes

- **Prototipo desechable** en la rama `spike/l1d-314-assistant-ui` (fuera de `main`, nunca se mergea):
  `@assistant-ui/react` 0.15.32 solo en esa rama, con `ExternalStoreRuntime` o `LocalRuntime` (APIs
  estables) contra respuestas fijas de `contracts/examples/chat-turn-*.json` (contrato de
  `l1d-315-conversacion-paciente` / `l1d-316-chat-turn-langgraph`) y el paciente semilla (a) (FX-12-a),
  maquetado según la variante B.
- **Recorrido Playwright** de los cinco escenarios `[S6 resp. 2]` con la CSP de US-216 (sin
  `unsafe-eval` ni `unsafe-inline` en `script-src`), escucha de `securitypolicyviolation`, red solo al
  origen de `web` y prueba de Markdown hostil (`<img onerror>`, `javascript:`) renderizado sin `rehype-raw`, con
  `rehype-sanitize` y `urlTransform` restringido mediante `esUrlHttpSegura()` (definida en L1D-266,
  `apps/web/lib/evidence/procedencia.ts`; glosario `backlog/sprints/S6-glosario-chat.md` §3 «Markdown»).
- **Reporte** `docs/evidence/S6-spike-assistant-ui/README.md`: `cumple | no cumple` por escenario con
  captura de `visual-check`, APIs usadas con su estado (estable/experimental/unstable_/beta), peso gzip
  medido y decisión.
- **Anotación en ADR-51 §8** (sección «UI»): opción elegida (assistant-ui si AC-1…AC-4 cumplen; si no,
  «shadcn sobre los componentes del panel»), fecha, peso gzip y enlace al reporte; la parte de UI pasa
  de «abierta» a «decidida» (cierra también US-256 AC-4).
- Sin cambios de contrato, de esquema ni de specs: `skip_specs: true`. Lo único que llega a `main` es el
  reporte y la anotación del ADR.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna (`skip_specs: true`: el entregable es la decisión registrada, no un comportamiento del
sistema). Relacionadas, sin delta: `evidence-panel` y `web-bff` (las cambiará US-267 según la decisión).

## Bounded contexts

`frontend` (prototipo en `apps/web`, solo en la rama del spike) · documentación (`docs/evidence/`,
`docs/architecture/adr/ADR-51-…`).

## Dependencias

- ↪ **US-256 · ADR-51** (L1D-313): la arquitectura del chat y §8 que este spike cierra. Es una historia de
  registro (ADR ya escrito, 2026-11-06); si se crea su change, será `l1d-313-…` (no existe todavía).
- ↪ `l1d-315-conversacion-paciente` y `l1d-316-chat-turn-langgraph`: forma del turno y ejemplos
  `contracts/examples/chat-turn-*.json`. Si al empezar el spike aún no están en `main`, el prototipo usa
  una copia local en su rama con la forma propuesta en sus `design.md` y el reporte lo anota.
- 🔗 Consume **US-216** (L1D-266, CSP sin `unsafe-eval`): hoy `apps/web/proxy.ts` no emite CSP; si su
  change no está mergeado, el prototipo aplica la CSP objetivo de US-216 en su rama.
- 🔗 Regla de Markdown de **US-216** (L1D-266, design D6): `react-markdown` + `rehype-sanitize`, sin `rehype-raw`,
  `urlTransform` que devuelve `''` si `esUrlHttpSegura()` es falso. El spike la reutiliza; no define otra.
- 🔗 Produce para: US-267 (L1D-324) y US-268 (L1D-325), que deben esperar a la anotación de ADR-51 §8.

## Fuera de alcance

- `@assistant-ui/react-langgraph` y `langgraph-api` (ADR-51 §7: el navegador hablaría con Backend 2;
  licencia Elastic-2.0).
- Integración real con `clinical-api` o `rag-orchestrator` y el panel definitivo (US-267, US-268).
- Añadir `@assistant-ui/react` a `apps/web/package.json` en `main` (solo si gana, dentro de US-267).

## Impact

- `main`: `docs/evidence/S6-spike-assistant-ui/README.md` (+ capturas) y ADR-51 §8. Sin código.
- Rama `spike/l1d-314-assistant-ui`: prototipo y dependencia; se cierra sin merge.
