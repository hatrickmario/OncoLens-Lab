# Proposal — l1d-72-ficha-minima-paciente

## Trazabilidad

L1D-72 · US-051 · FEAT-02a (L1D-9) · Sprint 2 · Estimación **5** · HU-02 · FR-04 (parte S1) · RN-10 ·
RN-26 · AC-T1.1 (ficha) · AC-02.4 · NFR-12 · OL-01 (pacientes semilla) · US-051 AC-1…AC-6 ·
`backlog/sprints/S2-refinamiento.md` §2 y §3.3 · `docs/ux/S2/pantallas-s2.md` S2-00, S2-04

## Por qué

Antes de preguntarle nada a la IA, el oncólogo necesita ver en una pantalla el diagnóstico vigente y
los biomarcadores recientes de su paciente, sin abrir documentos sueltos (AS-IS P1). Es la puerta de
entrada del recorrido de la demo del S2 (login → listado → ficha → análisis).

## Qué cambia

- `clinical-api`: módulo `patients` (lectura) con `GET /platform/patients/{patientId}` → `PatientSummary`
  (vista `doctor`, permiso `clinical:read`): identidad descifrada solo en esta respuesta (vía
  `IdentityService` de L1D-200), diagnóstico con `is_active = true`, último valor por biomarcador con
  `trend = null`, `pendingReviewCount` (solo `requiere_revision`, propuesto P-4), `missingCriticalCount = 0`
  hasta el S3 y `cancerTypeEnabled` desde un puerto de tipos habilitados. `404` para un UUID inexistente
  o mal formado. El `admin` (sin `clinical:read`, con `patients:lookup`) recibe `200 PatientAdminSummary`
  (vista `default` del `x-view-by-permission`), nunca `403` ni datos clínicos.
- `web`: página `/pacientes/[id]` (RSC) con S2-04 (identificación, diagnóstico vigente con histología y
  gradación, biomarcadores recientes, origen y revisión en texto, aviso de pendientes que no bloquea,
  acción "Analizar evidencia") y barra del paciente de S2-00; Route Handler BFF `GET /api/patients/[id]`
  si la página no llama a `clinical-api` desde el servidor directamente (ver design D6). Lecturas con
  `cache: 'no-store'` y `Cache-Control: no-store`. Aviso agregado "[n] datos sin verificar · no
  bloquean el análisis" para valores `auto_aceptado` (RN-26).
- Sin cambio de contrato propio: `PatientSummary`, `PatientAdminSummary`, `Diagnosis` (`histology`,
  `histologyCode`, `grade`, `gradings[]`), `Biomarker` y `Provenance` ya existen. El `500 ErrorInterno`
  de `getPatient` (integridad de la identidad) lo declara `l1d-202-listado-busqueda-pacientes` (1.9.0).

## Capacidades

- `patients-identity` (nueva en `openspec/specs/`, prevista en `openspec/config.yaml`): lectura de la ficha.
  Si L1D-200 la crea antes, este change solo AÑADE requisitos distintos (sin duplicarlos).

## Bounded contexts

clinical-platform (módulo `patients`, Route Handler BFF) · frontend (página de la ficha, barra del paciente).

## Dependencias

- ↪ `l1d-200-identidad-cifrada-indice-ciego` (US-046): `IdentityService.descifrar()` y el seed con
  identidad cifrada; sin él, AC-1 no puede afirmar `identification` descifrada.
- ⛔ `l1d-202-listado-busqueda-pacientes`: declara el `500 ErrorInterno` de `getPatient` y
  `enmascararDocumento()` (vista del admin); comparten el módulo `patients`.
- ↪ `l1d-199-usuarios-cli-rbac`: `authorize()` y `vistaSegunPermiso()`; este change cubre las
  regresiones delegadas `[US-045 AC-4]` y `[US-045 AC-6]` sobre la ficha.
- ↪ `l1d-198-sesion-expiracion-bloqueo` (US-044) para la cabecera con "Cerrar sesión" de S2-00 (la ficha
  usa el guard de sesión ya mergeado de L1D-197).
- ↪ L1D-168 / L1D-169 (archivados): esquema y seed sintético (pacientes semilla a, b, c).
- 🔗 Produce para `l1d-173-tipos-cancer-habilitados` (US-043): el puerto `TiposDeCancerHabilitados` y el
  hueco del aviso de alcance en la ficha; US-043 aporta la validación contra `manifest.json` y el aviso.
- 🔗 Regresión [FR-18, auditoría de la lectura] → US-102 (activa desde S6). 🔗 Produce para US-091 (tendencia).

## Fuera de alcance

Tendencia ↑ ↓ = (US-091, `si-hay-capacidad`, DEC-08); visor del documento y datos OCR (S3); contador de
faltantes real (S3, FEAT-04); auditoría de la lectura (S6, US-102); vista de caso (US-090, S3);
"Registrar un dato a mano" (S4); listado y búsqueda (L1D-202); autorización por paciente (FR-15, Post-MVP).
