# Design — l1d-97-aviso-faltantes-panel

## Context

El panel (`/pacientes/[id]/analisis`, RSC + `EvidencePanel`) arma hoy `EvidenceAnalysisRequest` con `armarSolicitud` sin `continueWithWarning`. `clinical-api` (L1D-98) ya recalcula los faltantes en el servidor en cada análisis y persiste `continued_with_warning`. US-003 (L1D-95) expone `/completeness`. Las secciones de la ficha son `SeccionDeFicha` con `id="ficha-diagnostico"` y `"ficha-biomarcadores"`.

## Goals / Non-Goals

**Goals:** aviso informativo antes de cada análisis; continuar siempre posible; enlace a la sección existente de la ficha con foco; degradación si el checklist cae. **Non-Goals:** ver proposal.

## Decisions

- **D1. El aviso es informativo, el servidor manda.** La lista del cliente nunca viaja al análisis; solo el flag `continueWithWarning` (`true` si hubo ≥1 faltante o el checklist falló; `false` si no hubo). RN-26: ningún estado deshabilita el botón por faltantes.
- **D2. Lectura por BFF.** El panel pide `GET /api/patients/{id}/completeness` (mismo origen). **Este change crea** el Route Handler `apps/web/app/api/patients/[id]/completeness/route.ts` (l1d-95 solo expone el endpoint de `clinical-api` y no toca `apps/web`). El handler valida el UUID, reenvía la cookie de sesión a `clinical-api`, retransmite el `200` y los `4xx` con su cuerpo `{ error, message }` del contrato, y ante un `5xx` o fallo de red **intercepta la respuesta antes de `retransmitir`** (`status >= 500`) y responde con `respuestaPropia({ error, message, traceId })` de `lib/server/respuestas`: código y mensaje fijos y un `traceId` propio de `web` (nunca el `traceId` ni el cuerpo de otra capa), sin pila y sin la URL de `clinical-api`, igual que el patrón de `web-bff`. `retransmitir` queda solo para `200` y `4xx`. Se consulta al cargar el formulario y de nuevo antes de cada análisis nuevo (FR-23: aparece antes de cada análisis, también tras continuar en uno anterior).
- **D3. Solo `status = faltante`.** Se excluyen `presente_sin_verificar` y `no_aplica`. Etiqueta del catálogo (`label`), nunca clave ni valores del paciente.
- **D4. Anclas.** `SeccionDeFicha` cambia a `id` `diagnostico`/`biomarcadores` y `tabindex="-1"`; el enlace elige ancla por `destination.entity` (`Diagnosis` → `#diagnostico`; `Biomarker` → `#biomarcadores`; otro → `/pacientes/{id}` sin ancla, encabezado principal). Un componente cliente mínimo enfoca el destino al montar y en `hashchange` (la navegación de Next no garantiza foco). **Restricción:** el fragmento se compara contra una lista permitida fija `{diagnostico, biomarcadores}` y solo entonces se usa `document.getElementById(<valor permitido>)`; nunca `querySelector` ni ningún selector construido con `location.hash` en crudo (evita inyección de selectores y foco a elementos arbitrarios). Un fragmento fuera de la lista se ignora sin error.
- **D5. Estados.** `cancerTypeEnabled = false` → sin bloque (estado propio del S3); `5xx`/red → mensaje «No se pudieron verificar los datos críticos» con `role="status"` y envío con `continueWithWarning = true`; `4xx` de sesión → flujo de sesión expirada existente.
- **D5b. Ficha con checklist no disponible (decisión Q2 del usuario, 2026-10-30; RN-26).** `PatientSummary.completenessAvailable = false` (l1d-95, D7) → la ficha muestra «No se pudieron verificar los datos críticos» con `role="status"`, nunca un contador `0` ni «sin faltantes»; ausente o `true` → sin aviso. No deshabilita ni oculta nada. Mismo texto y clave i18n que el estado `5xx` del panel (D5). El listado y la búsqueda no cambian en el S4 (no llevan `completenessAvailable`).
- **D6. Textos.** Claves i18n en `lib/mensajes` (español); sin términos de la lista prohibida (RN-23); singular «Falta 1 dato crítico…» (asumido).

## Privacidad y ownership

No hay PII nueva: solo etiquetas del catálogo. El navegador habla solo con `web`; el BFF reenvía la sesión opaca a `clinical-api` y nunca llega a `rag-orchestrator` (RN-10). **Regla de logs (común con l1d-95):** el UUID del paciente SÍ puede ir en logs (CLAUDE.md: pacientes por UUID, `traceId` vía `X-Trace-Id`); la identidad (nombre, documento) nunca. Los logs del BFF tampoco registran etiquetas ni valores clínicos del checklist. `rag-orchestrator` no participa.

### Seguridad web

Las etiquetas y textos del aviso se pintan solo como texto de React (sin `dangerouslySetInnerHTML` ni HTML del servidor). El Route Handler se apoya en `apps/web/lib/server/proxy-json.ts` (módulo `server-only`): la URL de `clinical-api` y el reenvío de la cookie de sesión nunca llegan al bundle del cliente. No se añaden variables `NEXT_PUBLIC_`, ni cambios de CSP, de cabeceras de seguridad ni de `next.config`. El foco por ancla usa la lista permitida de D4.

## Ampliación de alcance (Decidido (usuario, 2026-10-30))

Las cuatro deudas de l1d-95 2.15 (ciclos de módulo, `errorClase` del log, regla única del diagnóstico vigente, `PacienteNoEncontrado` duplicado) pasan a este change como tareas 1.4…1.7 de `## clinical-platform`. **Ensancha el alcance**: l1d-97 deja de tocar solo `apps/web` y toca también `apps/clinical-api` (refactors sin cambio de comportamiento ni de contrato, más un campo de log). Disciplina: TDD estricto en (b); refactor con tests en verde antes y después en (a), (c) y (d). La estimación (3) queda a decisión del orquestador.

## Contratos

Sin cambios en ningún `openapi.yaml`. Consume `GET /platform/patients/{id}/completeness` de US-003 con cliente/Zod generados en `packages/api-contracts` (no editar a mano) y `EvidenceAnalysisRequest.continueWithWarning` ya existente. Los handlers MSW se construyen desde los ejemplos que publica l1d-95 en `contracts/examples/`: `completeness-f-m2.json` (6 faltantes), `completeness-f-m1.json` (0), `completeness-tipo-no-habilitado.json` y `error-interno.json` (`500`); para la ficha (Q2), el ejemplo de `PatientSummary` con `completenessAvailable = false` que publica l1d-95.

## Evaluación

No toca modelo, prompt, umbral, catálogo ni corpus: `run-ai-eval` no aplica.

## Risks / Trade-offs

- Si US-003 no ha mergeado, el change no compila: ⛔ explícito.
- Choque de merge con `l1d-145` en `evidence-panel.tsx`: extraer el bloque a un organismo propio (`missing-data-notice.tsx`) para minimizar el diff.
