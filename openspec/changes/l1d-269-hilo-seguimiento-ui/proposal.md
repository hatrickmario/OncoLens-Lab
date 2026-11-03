# Proposal — l1d-269-hilo-seguimiento-ui

## Trazabilidad

L1D-269 · US-219 · FEAT-10c (L1D-25) · Sprint 5 (oleada O2) · Estimación **3** · FR-31 · RN-01, RN-19, RN-23, RN-24,
RN-26, RN-22 · TBD-08 · DEC-22 · US-219 AC-1…AC-5 · `[Pre-S1 resp. 14]` · `[S4 resp. 1]` · `[S5 resp. 3, 8, 10, 13]` ·
Fuente:
`backlog/features/FEAT-10c-hasta-3-opciones-por-aplicabilidad.md` §US-219; sprint: `backlog/sprints/S5-refinamiento.md`
§2 (O2, lista «Nunca» del recorte, G-Demo D-5 recorre **2 preguntas de seguimiento con citas**). Diseño:
`docs/ux/S5/pantallas-s5.md` **S5-04** (textos auditados por `clinical-language-auditor`, PASS, 2026-11-03) sobre
`docs/ux/flujo-e2e.md` pantalla 09 punto 9; organismo `FollowUpThread` en `docs/ux/sistema-de-diseno.md`.

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-10-11)** `[Pre-S1 resp. 14]`: seguimiento en el MVP, **10 preguntas por análisis** en
  configuración (`ANALYSIS_FOLLOWUP_MAX`, RN-22), contexto fijo, persistencia en Backend 1; el hilo va **antes del
  feedback** en la pantalla 09.
- **Decidido (usuario, 2026-10-29)** `[S4 resp. 1]`: la historia pasa del S4 al S5.
- **`S5-refinamiento.md`** `[S5 resp. 3]`: US-219 no se recorta; G-Demo (D-5) la recorre. §3 «Lo que no se reabre»: D-01,
  RN-23, RN-24 (los hallazgos del análisis son memoria no citable en el seguimiento).
- **S5-04** (textos literales): «Preguntas de seguimiento sobre este análisis», «n de 10 preguntas usadas», recuadro
  «Contexto fijo de esta conversación», la nota «Cada afirmación cita un fragmento del corpus recuperado para esta pregunta o enlaza a un dato del paciente. Fuente, año y población: del catálogo, o «No disponible».» (texto
  corregido en el Gate 1, usuario, 2026-11-03), «nueva en el seguimiento», aviso RN-19 y «Uso
  académico/investigación» **leídos de configuración en cada turno** (el aviso, del `disclaimer` del turno, que
  `clinical-api` toma de `AI_DISCLAIMER_TEXT`; la etiqueta, de `app.academicUseLabel`), y los textos de
  `sin_evidencia`, `fuera_de_contexto` y `409 LIMITE_SEGUIMIENTO` con «Nuevo análisis».
- **TBD-08**: progreso, nunca texto parcial (sin streaming de contenido; ADR-42 sigue `si-hay-capacidad`).
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 10]`: el tope del contador sale de `AnalysisBasis.maxFollowUps`, que añade
  **`l1d-268-seguimiento-analisis`** (contrato y `clinical-api`); este change **solo lo consume**.
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 8]`: el `403` por opt-out es Regresión [RN-15] activa desde S6 (DEC-22).
- **Decidido (usuario, 2026-11-03)** `[S5 resp. 13]`: los supuestos del change quedan aceptados (pasos de progreso de texto
  fijo; «Nuevo análisis» lleva el foco al campo de pregunta; Base de la respuesta tomada del análisis de origen; hilo sin
  `GET` en el S5; contador sin total en análisis históricos; `404` propio para un `analysisId` no UUID).

## Why

US-218 (`l1d-268-seguimiento-analisis`) implementa el contrato del seguimiento en los dos backends, pero el oncólogo no
tiene dónde formular la pregunta ni ver la respuesta citada. Sin esta UI, G-Demo («análisis con debate de varias
preguntas», PRD E-17) no se puede recorrer en el navegador. El hilo debe mostrar el mismo rigor que el panel: citas del
corpus con «ver fragmento», metadatos del catálogo, aviso de IA en cada turno, estados sin error técnico y ninguna
respuesta parcial.

## What Changes

- **`web` · Route Handler BFF (clinical-platform):** `POST /api/evidence-analyses/{analysisId}/follow-ups` →
  `POST /platform/evidence-analyses/{analysisId}/follow-ups` con el SDK generado, mismo patrón que
  `crearManejadorAnalisis` (Origin, tope del cuerpo, cookie de sesión, retransmisión de status y cuerpo, `502` propio
  si `clinical-api` no responde, sin streaming). Valida el UUID de la ruta.
- **`web` · organismo `FollowUpThread` (frontend):** bajo el resultado `con_evidencia` del panel, antes del feedback:
  encabezado y contador, recuadro de contexto fijo, historial de turnos con `aria-live="polite"`, respuesta por
  afirmación con sus citas (reutiliza `CitationChip`/`CitedFragment` y los metadatos del catálogo), marca «nueva en el
  seguimiento», línea «Base de esta respuesta», `AiDisclaimer` con el `disclaimer` del turno y la etiqueta académica en
  cada turno, campo con `<label>` visible y botón «Preguntar», progreso sin texto parcial, y los estados
  `sin_evidencia`, `fuera_de_contexto` y `409` con «Nuevo análisis».
- **Sin cambios de contrato:** el contador «n de N» lee `AnalysisBasis.maxFollowUps`, que añade `l1d-268` (design D1).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-panel`: requisitos nuevos del hilo de seguimiento (encabezado, contador, contexto fijo, turnos citados,
  aviso por turno, progreso sin parciales, estados, accesibilidad).
- `web-bff`: requisito nuevo del Route Handler del seguimiento.
**Bounded contexts:** clinical-platform (Route Handler de `web`) · frontend.

## Dependencias

- ⛔ **`l1d-268-seguimiento-analisis`** (US-218, O1): el endpoint `POST …/follow-ups` real, el `disclaimer` del turno,
  `AnalysisBasis.maxFollowUps` en el contrato (tipo generado y `con-evidencia-s4-tres-opciones.json` con
  `"maxFollowUps": 10`) y `follow-up-sin-evidencia.json`. Los tests de `web` arrancan cuando el commit
  `contract(L1D-268)` está en `main` (MSW desde `contracts/examples/`); el `visual-check` contra Compose necesita
  `l1d-268` completo.
- ↪ US-135 (panel de hasta 3 opciones), US-061/US-064 (tarjeta y citas), US-069 (`AiDisclaimer`, etiqueta académica),
  US-060 (patrón BFF): todo en `main`.
- 🔗 Coordinación con **`l1d-306-pregunta-nfc`** (US-250, O1): el campo de la pregunta valida el máximo con la regla
  compartida `esquemaPreguntaNormalizada` (`packages/clinical-language`) si ya está mergeado; si no, con el Zod generado
  de `FollowUpCreate`, y se compone al mergear.
- 🔗 Consumida por US-142 (G-Demo, O4). Regresión [RN-23] → US-068 · [RN-19] → US-069 · [RN-26] → US-071.

## Fuera de alcance

- Backend del seguimiento (US-218). `GET …/follow-ups` en `web`: sin consumidor en el S5 (el panel no relee un análisis;
  el historial es del S6), se añade con el historial (US-189…US-191).
- «Ampliar la antigüedad» en `sin_evidencia` (US-220, S6): solo «Nuevo análisis».
- Feedback del análisis (T5c, S6), streaming o eventos reales de progreso (ADR-42, `si-hay-capacidad`), `403` por opt-out
  (Regresión [RN-15] activa desde S6 (DEC-22): el panel ya muestra un `403` genérico sin detalles).
- `AnalysisBasis.maxFollowUps` en el contrato y en `clinical-api` (`l1d-268`, `[S5 resp. 10]`).

## Impact

- `apps/web/app/api/evidence-analyses/[analysisId]/follow-ups/route.ts`, `apps/web/lib/server/follow-ups.ts`.
- `apps/web/components/organisms/follow-up-thread.tsx` y moléculas nuevas (turno, contexto fijo, estado del turno),
  `apps/web/lib/evidence/` (cliente y fases del seguimiento), `apps/web/messages/es.json` (claves `followUp.*`),
  montaje en `analysis-result.tsx`.
- Sin cambios en `openapi.yaml`, `contracts/`, generados ni `clinical-api`.
- Sin migración, sin dependencias nuevas, sin cambio de prompt, modelo, umbral, catálogo ni corpus (sin `evaluate`).
- Sin `openapi.yaml` ni RN de privacidad nueva: admite PR de lote según D-12 `[S5 resp. 7]`.
