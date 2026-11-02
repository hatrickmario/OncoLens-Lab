# Proposal — l1d-97-aviso-faltantes-panel

## Trazabilidad

L1D-97 · US-005 · FEAT-04 (L1D-14) · Sprint 4 · Estimación **3** · HU-18 · FR-23, NFR-12 · RN-26 (RN-23 como regresión) · AC-04.2 · US-005 AC-1…AC-7 (el AC-3 ya no incluye la vista de caso: enlaza a la sección existente de la ficha) · ↪ US-003 (L1D-95), US-061, US-051 (ficha) · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-23] → US-068 · 🔗 Produce para: US-137 (VM-5, S5) · 🔗 Consume lo que dejó: US-006 (L1D-98, el servidor recalcula y envía los faltantes) y US-128 (L1D-188).

> **Decidido (usuario, 2026-10-29):** recortada y comprometida en el S4; el enlace del faltante va a la sección ya existente de la ficha (`#diagnostico`, `#biomarcadores`) con foco en su encabezado; no se crea ninguna sección nueva `[S4 resp. 14]`. La reconexión con la vista de caso es del S5 (US-090, US-004) `[S4 resp. 6d]`. Textos: `docs/ux/S4/pantallas-s4.md` S4-03.

## Dependencias

- ⛔ **`l1d-95-*` (US-003 / L1D-95)**: expone `GET /platform/patients/{id}/completeness` (`items[]` con `status`, `label`, `destination`, `cancerTypeEnabled`) y su tipo/Zod generados en `packages/api-contracts`. Este change NO toca `apps/clinical-api/openapi.yaml`; consume el contrato de US-003. Debe mergear primero.
- ↪ Ya archivados y consumidos: `l1d-94-checklist-determinista`, `l1d-98-faltantes-al-analisis` (el servidor recalcula los faltantes; el cliente solo envía `continueWithWarning`), `l1d-188-base-faltantes-declarados`.
- ↪ `l1d-72-ficha-minima-paciente` (secciones de la ficha donde van las anclas) y el panel de `l1d-145-panel-hasta-3-opciones` (mismo organismo `evidence-panel.tsx`: coordinar el orden de merge, sin tocar sus requisitos).

## Why

Hoy el panel envía el análisis sin decir qué datos críticos faltan ni dar forma de completarlos. FR-23 pide avisar antes de cada análisis sin bloquear (RN-26): el oncólogo decide si analiza ya o completa el caso. Es el eslabón visible de la hipótesis «caso reconstruido → faltantes → opciones más aplicables».

## What Changes

- **frontend**: bloque informativo `role="status"` sobre el botón «Analizar evidencia» con la lista de faltantes (etiqueta del catálogo) y un enlace «Registrar ‹etiqueta› en la ficha» por ítem; texto de aplicabilidad «Desconocido»; el botón siempre habilitado y asociado por `aria-describedby`; el request lleva `continueWithWarning = true` si el bloque se mostró con faltantes, o si el checklist falló, y `false` si no hay faltantes. Estado «No se pudieron verificar los datos críticos» ante `5xx`. Sin bloque si `cancerTypeEnabled = false`.
- **frontend (ficha)**: los encabezados existentes de diagnóstico y biomarcadores pasan a `id="diagnostico"` / `id="biomarcadores"` con `tabindex="-1"` y reciben el foco al llegar por ancla; un destino sin sección propia enlaza al encabezado principal.
- **frontend (ficha, decisión Q2 del usuario, 2026-10-30)**: si `PatientSummary.completenessAvailable = false` (l1d-95), la ficha muestra el aviso no bloqueante «No se pudieron verificar los datos críticos» (`role="status"`) en lugar de un contador `0` o «sin faltantes»; no bloquea nada (RN-26). El listado y la búsqueda no cambian en el S4.
- **clinical-platform**: este change **crea** el Route Handler BFF `GET /api/patients/[id]/completeness` (l1d-95 no lo crea) sobre `lib/server/proxy-json.ts`; reenvía la sesión a US-003, retransmite `200`/`4xx` del contrato y convierte un `5xx` en `{ error, message }` saneado, sin detalles internos ni la URL de `clinical-api`; el POST de análisis ya reenvía el cuerpo tal cual, solo se verifica que `continueWithWarning` pasa.
- **clinical-platform (deudas heredadas de l1d-95 2.15, ensanchan el alcance; Decidido (usuario, 2026-10-30))**: (a) cerrar los ciclos de módulo moviendo `estados-de-revision` y `patients.errores` fuera de `patients/`; (b) añadir `errorClase` (`error.name`) al log `checklist_no_disponible`, sin ensanchar `PatientSummary`; (c) unificar en JS la regla del «diagnóstico vigente» (`seleccionarDiagnosticoVigente`, `diagnosticoVigente` y la función local de `ficha.service.ts`); (d) eliminar el `PacienteNoEncontrado` duplicado y preexistente de `documents.errores.ts`. Son refactors en `apps/clinical-api` sin cambio de comportamiento ni de contrato, más un campo de log.
- Sin cambios de contrato, de catálogo, de prompt ni de modelo (`run-ai-eval` no aplica).

## Capabilities

### Modified/Added
- `evidence-panel` (ADDED): aviso de faltantes antes de analizar, continuar con aviso, caída del checklist, tipo no habilitado, accesibilidad.
- `web-bff` (ADDED): proxy del checklist.
- `patients-identity` (ADDED): anclas de la ficha con foco; aviso de la ficha con `completenessAvailable = false` (Q2).

## Impact

`apps/web/components/organisms/evidence-panel.tsx`, `apps/web/components/organisms/active-diagnosis-table.tsx`, `recent-biomarkers-table.tsx`, `components/molecules/fila-de-ficha.tsx`, `ficha-del-doctor.tsx`/`patient-summary-card.tsx` (aviso Q2), `lib/evidence/solicitar-analisis.ts`, nuevos `lib/evidence/*faltantes*`, `app/api/patients/[id]/completeness/route.ts`, `lib/server/*`, y por las deudas de l1d-95: `apps/clinical-api/src/modules/patients/*` (estados-de-revision, patients.errores, ficha.service.ts), `apps/clinical-api/src/modules/documents/documents.errores.ts` y el módulo que aloja `diagnosticoVigente`, mensajes i18n; tests Vitest/MSW y Playwright.

## Non-goals

Plantillas de preguntas (CAP-05); avisos `datos_faltantes` en tarjetas (US-136) y `patientDataWarning` (US-124); calificar si el aviso fue útil (VM-5, US-137); enlace a la vista de caso (S5); crear secciones nuevas en la ficha; cualquier bloqueo del análisis (RN-26).
