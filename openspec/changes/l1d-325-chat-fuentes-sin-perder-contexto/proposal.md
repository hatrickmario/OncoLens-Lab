# Proposal — l1d-325-chat-fuentes-sin-perder-contexto

## Trazabilidad

L1D-325 · US-268 · FEAT-12 (L1D-312, bloque 12-C) · Sprint 6 · Estimación **3** · HU-03 · RN-01, RN-04, RN-25,
SEG-12 · AC-T1.1, AC-T1.3 · US-268 AC-1…AC-5 · `[S6 resp. 2]` (escenario 5 del spike: abrir fuentes, expandir,
consultar referencias sin perder el contexto), `[S6 resp. 15]` y `[S6 resp. 16]` (referencia: variante B «Hilo con
tarjetas», `docs/ux/S6/variante-b.html`, `docs/ux/S6/pantallas-s6.md` §2 y §4) · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-268 (fixtures FX-12-a, FX-12-b, FX-12-e); decisión de UI:
ADR-51 §8 anotado por `l1d-314-spike-assistant-ui`. Vocabulario: `backlog/sprints/S6-glosario-chat.md` (manda si algo
discrepa).

## Why

El panel conversacional (US-267) muestra cada turno con sus enlaces ◆ a datos del paciente y sus citas `[E1 · frag. n]`.
Verificar una afirmación exige abrir la fuente o el dato; si eso navega fuera, desmonta el hilo o borra la pregunta a
medio escribir, el oncólogo pierde el contexto y deja de verificar (AC-T1.1, AC-T1.3). Este change hace que toda
interacción de consulta ocurra **sobre** la conversación, sin desmontarla.

## What Changes

- **Cita → panel lateral (`Sheet`)** con el texto del fragmento (`chunkTextSnapshot`) y sus metadatos copiados del
  corpus (`CitedSource`, RN-04/RN-25); al cerrarlo se conservan la posición de *scroll* del hilo, el texto del campo de
  pregunta y el foco vuelve a la cita (AC-1).
- **«Ver en el caso» de un `ConversationDataLink`** (`turn.dataLinks[]`) abre en el mismo `Sheet` el dato del paciente con su origen y, si fue
  corregido, su histórico (`supersedes_id`, ADR-50) por la ruta que deriva `rutaDeHistorico(resourceType, resourceId)`
  sobre `/api/*` (el contrato no trae `historyPath`), sin salir de la página del paciente; el hilo sigue montado (AC-2).
  Solo «Abrir la vista de caso completa» abre otra pestaña, anunciado.
- **Expandir / plegar por turno** («Expandir todo» con `aria-pressed`): la tabla de aplicabilidad y el aviso
  «n afirmaciones omitidas por falta de soporte» (`omittedClaims`) se despliegan en el turno sin re-renderizar los demás
  (AC-3).
- **«Ver referencias»** del turno: lista de las citas con sus metadatos o «No disponible»; los enlaces externos abren
  en otra pestaña con `rel="noopener noreferrer"` (AC-4). Los enlaces siguen la regla de SEG-12 que define L1D-266
  («Enlaces de cita solo con esquemas seguros», `esUrlHttpSegura()`); este change no la redefine, solo verifica en sus
  superficies que `javascript:` no crea enlace (AC-5).
- **Markdown (glosario §3):** si un texto del `Sheet` o de las referencias se pinta como Markdown, sin `rehype-raw`, con
  `rehype-sanitize` y `urlTransform` vía `esUrlHttpSegura()` (L1D-266); escenario con `<img onerror>`.
- El estado de la conversación vive en el componente padre del panel (US-267) y no se desmonta al abrir paneles.
- Sin cambios de API: solo consume `GET /api/patients/{id}/case` y el histórico de correcciones ya existentes en `web`
  y los campos del turno que definen `l1d-315`/`l1d-316`/`l1d-317`/`l1d-322`/`l1d-323`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-panel`: requisitos **ADDED** de interacción con fuentes, datos, bloques y referencias dentro del panel
  conversacional (la misma capacidad web que modifica US-267 · `l1d-324-panel-conversacional`).

## Bounded contexts

`frontend` (`apps/web/components/**`). Sin `clinical-platform` (no hay Route Handlers nuevos) ni `ai-services`.

## Dependencias

- ⛔ **`l1d-324-panel-conversacional`** (US-267, L1D-324): el panel conversacional, el componente padre que guarda el estado de la
  conversación y las tarjetas de turno sobre las que se montan estas interacciones.
- ↪ `l1d-314-spike-assistant-ui` (US-257): decisión de UI (assistant-ui o shadcn) en ADR-51 §8; los componentes de este
  change se escriben dentro de la opción elegida.
- ↪ `l1d-315-conversacion-paciente` (US-258): `ConversationDataLink` `{ factRef, resourceType, resourceId, origin,
  relativeDay|null, recordedDate|null }`, sin `historyPath` (glosario §2); `l1d-317-chat-caso-situacion` (US-260) lo
  rellena en el turno de caso.
- ↪ `l1d-322-chat-evidencia-seguimiento` y `l1d-323-chat-fuentes-limitaciones` (US-265, US-266): turno de evidencia con
  `CitedSource`, aplicabilidad y `omittedClaims`.
- ↪ US-253 (ADR-50, ya en `main`): histórico de correcciones con `supersedes_id` y su Route Handler en `web`.
- 🔗 Consume US-216 (L1D-266): CSP sin `unsafe-eval` (el `Sheet` no añade estilos ni scripts inline), `esUrlHttpSegura()`
  y el requisito «Enlaces de cita solo con esquemas seguros» (SEG-12), que este change no duplica.

## Fuera de alcance

- Visor del PDF fuente o enlace de descarga del documento (US-212, Post-MVP; requisito vigente «Origen visible sin
  enlace de descarga» de `case-timeline`).
- «Preguntar sobre este turno» (`aboutTurnId`) y «Copiar referencias»: los entrega US-265/US-267.
- Lista de conversaciones anteriores (Post-MVP). E2E de AC01–AC06 (US-269).

## Impact

- `apps/web/components/ui/sheet.tsx` (shadcn, sobre Radix Dialog ya presente), organismos y moléculas del panel
  conversacional; tests Vitest + Testing Library y Playwright (`e2e/`).
- Sin dependencias npm nuevas (Radix Dialog ya está en `apps/web`), sin `NEXT_PUBLIC_` nuevas, sin cambios de contrato.
