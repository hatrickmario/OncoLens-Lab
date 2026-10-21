# Proposal — l1d-202-listado-busqueda-pacientes

## Trazabilidad

L1D-202 · US-048 · FEAT-T4a (L1D-40) · Sprint 2 · Estimación **5** · HU-06 · FR-02 · FR-01 ·
RN-10 · RN-26 · NFR-11 · ADR-6 · P-02 · `[Pre-S1 resp. 22]` · `[Pre-S1 resp. 36]` ·
`[Pre-S1 resp. 42]` · `[Pre-S1 trazabilidad M-1]` · US-048 AC-1…AC-7 · diseño
`docs/ux/S2/pantallas-s2.md` S2-02 (y S2-00 para la cabecera) · `backlog/sprints/S2-refinamiento.md`
§3.3 (P-4)

> **Propuesto en el refinamiento del S2 (P-4, pendiente de confirmación):** la búsqueda por nombre
> (AC-3) es **exacta sobre el nombre completo normalizado** (sin tildes, minúsculas, espacios
> colapsados) por **índice ciego HMAC**. Consecuencias: el ejemplo literal del AC-3 (`{ name:
> "Rondón" }` encuentra a FX-T4a-a) deja de cumplirse —un apellido suelto da cero resultados— y el
> esquema gana la columna `identity.patient_identity.full_name_hmac`. `privacy-guardian` (Gate 1)
> prefiere este HMAC exacto sobre el nombre completo frente a un HMAC por token, por el riesgo de
> vincular familiares que comparten apellidos. P-4 sigue **propuesto**; el AC-3 del backlog (`{ name:
> "Rondón" }`) deberá actualizarse tras la confirmación. Si el usuario elige coincidencia parcial, este
> change se rehace en el AC-3 y en la migración.

## Por qué

El doctor necesita llegar a la ficha del paciente que va a analizar. Hoy no existe ni listado ni
búsqueda; la identidad está cifrada (L1D-200), así que buscar exige índice ciego y el listado solo
puede devolver la identidad **enmascarada**.

## Qué cambia

- `GET /platform/patients` (filtros sin identidad `status`, `dataOrigin`, `page`; paginado por
  `PATIENTS_PAGE_SIZE`) y `POST /platform/patients/search` (identidad en el cuerpo) en un módulo nuevo
  `patients` de `clinical-api`, con `authorize('patients:lookup')` y vista por permiso
  (`PatientListItem` / `PatientAdminSummary`).
- Búsqueda por documento exacta por índice ciego (L1D-200); búsqueda por nombre exacta por índice
  ciego del nombre normalizado (P-4, propuesto).
- Formato de las máscaras `fullNameMasked` y `nationalIdMasked` (AC-7, documento con longitud fija
  `•••• 56`), que reemplaza `x-pending-owner: US-048` del contrato.
- Contrato: `500 ErrorInterno` en `getPatient`, `listPatients` y `searchPatients` (error de integridad
  de L1D-200); *minor* → `info.version` **1.9.0** (orden: 167 → 1.6.0, 171 → 1.7.0, 56 → 1.8.0,
  202 → 1.9.0).
- Páginas con identidad con `cache: 'no-store'` y `Cache-Control: no-store`.
- `web`: página `/pacientes` (S2-02) con pestañas "Por documento"/"Por nombre", filtros, tabla,
  paginación y estados; Route Handlers `app/api/patients/route.ts` y
  `app/api/patients/search/route.ts`.

## Capacidades

- `patients-identity` (ADDED; la introduce `l1d-200-identidad-cifrada-indice-ciego`).
- `data-model` (MODIFIED: "Índice ciego único de la identidad", columna `full_name_hmac`).

## Bounded contexts

clinical-platform (módulo `patients`, migración, seed, Route Handlers) · frontend (`/pacientes`).

## Dependencias

- ⛔ `l1d-200-identidad-cifrada-indice-ciego` (`IdentityService`, índice ciego, seed con identidades).
- ↪ `l1d-199-usuarios-cli-rbac` (`authorize()`, `vistaSegunPermiso()`).
- ↪ `l1d-198-sesion-expiracion-bloqueo` (cabecera con "Cerrar sesión" y redirección
  `?motivo=expirada` ante `401`); sin ella, la página usa el guard de L1D-197.
- Con `l1d-72-ficha-minima-paciente` (US-051, ficha): comparten los contadores `pendingReviewCount` y
  `missingCriticalCount` (lo crea el primero que se mergee; el otro lo reutiliza).
- Con `l1d-173-tipos-cancer-habilitados` (US-043): el texto "Tipo de cáncer fuera del alcance del piloto: sin
  análisis con IA" de la columna Alcance es de US-043; este change solo entrega `cancerTypeEnabled`.

## Fuera de alcance

- Coincidencia parcial o difusa por nombre (descartada en P-4, propuesto).
- Registro de pacientes y enlace "registrar" desde "sin resultados" (US-047, S4).
- Equipo tratante (FR-15, US-204, Post-MVP; P-02). Columna de diagnóstico en el listado (no está en
  `PatientListItem`; S2 §8).
