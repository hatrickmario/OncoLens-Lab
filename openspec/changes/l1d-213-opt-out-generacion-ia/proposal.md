# Proposal — l1d-213-opt-out-generacion-ia

## Trazabilidad

L1D-213 · US-148 · FEAT-T4c · Sprint 6 (→ G-Piloto) · HU-14 · RN-15 (dueña), RN-10, RN-26 · FR-16, FR-09, FR-21 ·
AC-T4.6, AC-T3.3, AC-06.1, AC-02.5, AC-T4.1 (parte) · G-9 (parte de opt-out) · DEC-22 · `[S6 resp. 8]` ·
Fuente: `backlog/features/FEAT-T4c-opt-out-analisis-ia.md` § US-148; decisiones en `backlog/sprints/S6-refinamiento.md`
y `docs/decisions/DEC-22-opt-out-403-diferido-s6.md`.

**Decidido (usuario, 2026-11-06):**
- **`[S6 resp. 8]`:** entra con sus 9 AC como excepción a la DoR por tamaño.
- **Alcance de «generación con IA» (DEC-22; DEC-16 queda Post-MVP):** el análisis (`POST /platform/evidence-analyses`),
  el seguimiento (`POST /platform/evidence-analyses/{analysisId}/follow-ups`, vivo aunque la UI deje de usarlo) y
  **todo turno del chat con LLM** (`POST /platform/conversations/{conversationId}/turns`, l1d-315). Crear
  (`POST /platform/patients/{patientId}/conversations`) y leer (`GET /platform/conversations/{conversationId}`) una
  conversación **no** son generación. Resumen del caso, re-ejecución y búsqueda complementaria entran al guardia
  cuando existan.
- El mensaje del panel (AC-8) se aplica también al panel conversacional (US-267, l1d-324).

## Why

RN-15 presume el consentimiento bajo el convenio; el único control que protege al paciente que se opuso es que OncoLens
nunca genere nada con IA sobre él. Hoy `PatientOptOut` existe en el esquema, el seed y el contrato (`403
OPT_OUT_ANALISIS_IA`), pero ningún servicio lo consulta (DEC-22). Sin este guardia G-Piloto no se supera.

## What Changes

- **Contrato `clinical-api` (aditivo, ADR-26) 1.26.0 → 1.27.0** (glosario del chat §1): extensión `x-genera-ia: true`
  solo en las **otras** operaciones de generación, `createEvidenceAnalysis` y `createFollowUp`; `createConversationTurn`
  ya la declara l1d-315 (1.24.0) junto con su `403 PermisoDenegadoOOptOut`, y aquí no se toca; campo `aiAnalysisAvailable: boolean` en `PatientSummary` (vista del doctor), sin detalle de
  la marca; ejemplos actualizados en `contracts/examples/`.
- **Módulo `opt-outs` en `clinical-api`:** `OptOutGuard` declarativo que lee la última marca `analisis_ia` por
  `(patient_id, opt_out_type, recorded_at DESC)` y la regla «paciente real sin convenio → no se presume» (RN-15,
  `data-model.md`); se monta tras la sesión y el RBAC y antes de cualquier llamada a `rag-orchestrator`, del
  `AIAnalysisRecord` y del turno persistido. Responde `403` con `error = "OPT_OUT_ANALISIS_IA"`.
- **Registro de rutas `generaIA`** y test de cobertura: toda operación del spec con `x-genera-ia` coincide con la lista
  cerrada `RUTAS_GENERA_IA` y su ruta Express aplica el guardia; una ruta `generaIA` sin guardia falla la CI.
- **Ficha:** `aiAnalysisAvailable` calculado por el mismo servicio del guardia (una sola regla).
- **UI `web`:** con `aiAnalysisAvailable = false`, el panel de análisis y el panel conversacional muestran «El análisis
  con IA no está disponible para este paciente», con el campo de pregunta y el botón de envío del panel conversacional (L1D-324 retira el formulario de una pregunta)
  deshabilitados; la ficha y la vista de caso se ven completas.

## Capabilities

### New Capabilities

- `opt-out`: guardia de opt-out de `analisis_ia` sobre toda generación con IA, regla de «sin convenio», lista cerrada
  de rutas `generaIA` con su test de cobertura, `aiAnalysisAvailable` en la ficha y el aviso en la UI. El nombre ya está
  en la lista de capacidades de `openspec/config.yaml`; ninguna de `openspec/specs/` lo cubre (las existentes solo lo
  anotan como «Regresión [RN-15] activa desde S6»).

### Modified Capabilities

- Ninguna. Las regresiones `[RN-15]` ya anotadas en `evidence-analysis-gateway`, `evidence-panel`, `human-control`,
  `data-model` y en las deltas de `chat-conversation` (l1d-315) y `evidence-panel` (l1d-324) quedan cubiertas por los
  requisitos de `opt-out` sin cambiar los suyos.

## Bounded contexts

clinical-platform (contrato, guardia, ficha, tests de integración y de cobertura de rutas) · frontend (aviso y controles
deshabilitados, E2E).

## Dependencias

- ↪ `l1d-315-conversacion-paciente` (US-258): `POST …/turns` con la marca `generaIA`, `x-genera-ia: true` y
  `403 PermisoDenegadoOOptOut` ya declarados en su contrato (`clinical-api` 1.24.0).
- ↪ `l1d-324-panel-conversacional` (US-267): el panel conversacional donde se muestra el aviso. **Expectativa sobre
  l1d-324:** su panel acepta una prop `disabled` que deshabilita el campo de pregunta y el envío; este change solo la
  pasa desde la ficha y no edita l1d-324. Si l1d-324 no la expone, se resuelve en su change antes de la tarea 3.2.
- ↪ US-052 (gateway, en `main`), US-218 (seguimiento, en `main`), US-039 (seed con el paciente (d) con opt-out).
- ↪ US-149 (CLI de marcas): **no está en el S6**; los fixtures FX-T4c-a se siembran con un *builder* de test sobre
  `clinical.patient_opt_out` (ver Pendientes).
- Cadena de versiones (glosario §1): l1d-315 1.24.0 → l1d-320 1.25.0 → l1d-322 1.26.0 → este change 1.27.0. Si una
  versión colisiona, renumera el segundo en mergear.
- 🔗 Regresión [RN-26] → US-071 (los avisos clínicos no bloquean; aquí bloquea solo la regla legal).

## Pendientes de definir

- **Literal del error:** la historia escribe `opt_out_analisis_ia`; el contrato congelado y `contracts/examples/
  error-opt-out.json` usan `OPT_OUT_ANALISIS_IA`. Se sigue el contrato. Dueño: PO · afecta: AC-1, AC-9.
- **Código para «sin convenio» (AC-9):** se reutiliza `OPT_OUT_ANALISIS_IA` (ningún consentimiento presumible) para no
  añadir un valor al enum de respuesta. Si el PO quiere distinguirlo (`SIN_CONVENIO`), es un cambio aditivo aparte.
  Dueño: PO · afecta: AC-9.
- **Fixtures sin la CLI de US-149:** el AC-6 («el administrador registra un opt-out») se simula insertando la marca con
  el *builder* durante el análisis en curso. Dueño: PO · afecta: AC-4…AC-6.

## Fuera de alcance

- AC-2 (resumen del caso): FEAT-02c no está construida; queda como Regresión [RN-15] condicional.
- AC-7, partes que no existen en el MVP: el feedback (`POST …/feedback`, US-137, sin construir) y la llegada del
  documento a `procesado` (extracción OCR, Post-MVP, PRD E-17); aquí se verifica la carga `202` en `pendiente`.
- CLI y UI de registro de marcas (US-149, FEAT-T4b), auditoría de marcas y denegaciones (US-150), `preflight` (US-143),
  borrado por opt-out de `investigacion` (FEAT-T4b) y equipo tratante (FEAT-T4e): Post-MVP o fuera del S6.
- Retirar los endpoints `…/follow-ups` (deuda aparte; mientras vivan, llevan el guardia).

## Impact

- `apps/clinical-api/openapi.yaml`, `contracts/examples/`, `packages/api-contracts/`, `apps/clinical-api/src/zod/`
  (generados).
- `apps/clinical-api/src/modules/opt-outs/` (nuevo), `evidence-analysis/*.controller.ts`, `conversation` (de l1d-315),
  `patients/ficha.*`, `composition.ts`.
- `apps/web/components/organisms/ficha-del-doctor.tsx`, panel de evidencia y panel conversacional; E2E en Playwright.
