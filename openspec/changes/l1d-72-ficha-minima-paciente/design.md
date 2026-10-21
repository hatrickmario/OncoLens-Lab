# Design — l1d-72-ficha-minima-paciente

## Contexto

`GET /platform/patients/{patientId}` ya está en el contrato congelado (`apps/clinical-api/openapi.yaml`
1.5.0, `getPatient`, `x-view-by-permission`): con `clinical:read` responde `PatientSummary` (`view = doctor`).
En `clinical-api` aún no existe el módulo `patients` (solo `auth` y `evidence-analysis`). La pantalla de
referencia es S2-04 (`docs/ux/S2/pantallas-s2.md`), con la barra del paciente de S2-00, sobre el sistema
de diseño del Pre-S1 (`docs/ux/sistema-de-diseno.md`) y el prototipo `docs/ux/prototipo/fuente/Caso`.

## Decisiones

**D1 · `pendingReviewCount` cuenta solo `requiere_revision`.** Propuesto en el refinamiento del S2 (P-4,
pendiente de confirmación) (`S2-refinamiento.md` §3.3): el contador suma las filas del paciente con
`review_status = requiere_revision` en las entidades clínicas con ese eje (`diagnosis`,
`diagnosis_grading`, `biomarker`, `prior_treatment`, `clinical_event`, `clinical_attribute`,
`clinical_note`). `auto_aceptado` **no** cuenta: se muestra como "Sin verificar" en el dato (aviso aparte,
RN-26). `rechazado` y `reemplazado` nunca cuentan (RN-07). Descartada: contar `auto_aceptado` (infla el
contador con datos que no esperan acción). La regla vive en un método con nombre propio,
`contarPendientesDeRevision()`, en el repository (consulta) y su lista de estados en una constante del
dominio `ESTADOS_PENDIENTES_DE_REVISION = ['requiere_revision']`.

**D2 · Histología y gradación en la ficha.** Propuesto en el refinamiento del S2 (P-4, pendiente de
confirmación), resuelto sin cambio de contrato: `Diagnosis` ya trae `histology`, `histologyCode`, `grade` y
`gradings[]`, así que la ficha los muestra (S2-04, filas "Histología" y "Gradación"; en próstata, Gleason/ISUP
con espécimen y alcance, DEC-05). Cierra el `Pendiente de definir` de US-051 sobre `PatientSummary.diagnosis`.

**D3 · Diagnóstico vigente.** `diagnosis` = el `Diagnosis` del paciente con `is_active = true`; sin ninguno,
`null` (el contrato lo admite) y la ficha muestra "No registrado". Regla extraída: `seleccionarDiagnosticoVigente()`.

**D4 · Último valor por biomarcador.** Una entrada por `name` (o código LOINC si existe), la de
`performed_at` más reciente; `trend = null` hasta US-091. Se excluyen `rechazado` y `reemplazado` (RN-07).
Regla extraída: `ultimoValorPorBiomarcador()` (lógica pura, unitaria).

**D5 · `cancerTypeEnabled` por puerto.** El service recibe `TiposDeCancerHabilitados.estaHabilitado(tipo)`.
Este change lo compone con la lectura de `ENABLED_CANCER_TYPES` (lista separada por comas, RN-22) en
`src/config.ts`; `l1d-173-tipos-cancer-habilitados` (US-043) añade la validación contra `manifest.json`
al arranque y el aviso visible. Sin diagnóstico vigente → `false` (no hay tipo que analizar).
`missingCriticalCount = 0` fijo hasta el S3 (FEAT-04 US-003), documentado en el service.

**D6 · La ficha es un RSC que llama a `clinical-api` desde el servidor.** `app/(dashboard)/pacientes/[id]/page.tsx`
usa el SDK generado de `clinical-api` (L1D-105) con el `fetch` inyectado de `lib/server/clinical-api.ts`
(L1D-139), reenviando solo la cookie `oncolens_session`. No se añade Route Handler `GET /api/patients/[id]`:
el navegador no pide la ficha por JSON (sin interactividad que lo requiera, YAGNI).

**D7 · `404` y UUID inválido (Gate 1).** UUID bien formado inexistente **y** formato no UUID → `404
NO_ENCONTRADO` (`error-no-encontrado.json`), sin distinguir ambos casos (no revela qué existe) y **sin
cambio de contrato** (el `404` ya está declarado; no se añade `422`). El borde valida el parámetro y,
si no es UUID, responde `404` sin consultar la BD.

**D8 · Vista del administrador (Gate 1).** El contrato dicta `x-permission: [clinical:read,
patients:lookup]` y `x-view-by-permission` (`clinical:read` → `PatientSummary`, `default` →
`PatientAdminSummary`). El `admin` (con `patients:lookup`, sin `clinical:read`) recibe **`200
PatientAdminSummary`**, no `403`, vía `vistaSegunPermiso()` de L1D-199. El *repository* de esa vista no
lee tablas de `clinical` y de `identity` solo descifra el documento para `enmascararDocumento()` (L1D-202);
nunca el nombre ni datos clínicos. Un rol sin ninguno de los dos permisos → `403`. Cubre las
regresiones delegadas por L1D-199: `[US-045 AC-4]` (el doctor lee cualquier paciente semilla con `200`
sin consultar `care_team_member`) y `[US-045 AC-6]` (el admin recibe la vista `default`).

**D9 · Sin caché (Gate 1).** La página y `lib/server/pacientes.ts` leen con `cache: 'no-store'` y la
respuesta lleva `Cache-Control: no-store` (identidad descifrada); test.

**D10 · Aviso de datos sin verificar (Gate 1).** Además del aviso de `pendingReviewCount`, la ficha
muestra el aviso informativo agregado "[n] datos sin verificar · no bloquean el análisis" cuando
`n` > 0 valores mostrados (diagnóstico, `gradings[]`, `recentBiomarkers`) tienen `reviewStatus =
auto_aceptado`; `n` se calcula en `web` sobre la respuesta (sin cambio de contrato, `contarSinVerificar()`).
No bloquea (RN-26).

**D11 · Paso "consultar la ficha" del test de no-fuga.** Este change añade al arnés de L1D-200
(`tests/support/no-fuga.ts`) el paso de leer la ficha, con las mismas formas buscadas (claro, nombre
normalizado, valores de los índices ciegos) en *logs*, `audit`, `research` y URLs (`Regresión [RN-10] →
US-046`).

## Privacidad y ownership

- **Fronteras:** navegador → `web` (RSC, servidor) → `clinical-api`. Nada cruza a `rag-orchestrator`: la ficha
  no llama a la IA. `rag-orchestrator` no toca datos clínicos ni `clinical-minio`.
- **Identidad (RN-10):** se descifra con `IdentityService` (L1D-200) **solo** para construir esta respuesta;
  nunca en logs (los logs llevan `patientId` UUID y `traceId`), ni en la URL, ni en `<title>` ("Paciente · OncoLens").
- **Desidentificación (RN-11):** no aplica (no hay contexto hacia la IA).
- **Auditoría de la lectura:** no en el S2 (US-102, S6; Q-06 aceptada).

### Seguridad web

- Validación: el `patientId` de la ruta se valida con el schema Zod generado (`packages/api-contracts/src/zod/clinical-api`)
  en el servidor antes de llamar al SDK; la respuesta se valida con el schema generado de `PatientSummary`.
- Sin variables `NEXT_PUBLIC_` nuevas. Los módulos de `lib/server/` siguen siendo `server-only`.
- Render: todo texto (nombres, histología) se renderiza como texto de React, sin `dangerouslySetInnerHTML`.
- CSP y cabeceras sin cambios (US-216 en el S6). Sin dependencias nuevas.

## Contratos

Proveedor: `clinical-api` (`apps/clinical-api/openapi.yaml`); consumidor: `web` (SDK generado). **Sin diff
propio** (el `500 ErrorInterno` de `getPatient` lo añade L1D-202 en 1.9.0; este change se mergea después):
`getPatient`, `PatientSummary`, `PatientAdminSummary`, `Diagnosis`, `DiagnosisGrading`, `Biomarker`, `Provenance`, `NoEncontrado`,
`PermisoDenegado` y `NoAutenticado` ya existen; ejemplos existentes `patient-summary-doctor.json`,
`diagnosis-con-gradings.json` y `error-no-encontrado.json`. Compatible con ADR-26 (contrato estable).
Si al implementar falta un campo, se detiene y se reporta (cambio de contrato por ADR-26), no se añade.
Las respuestas se verifican contra el spec del proveedor en integración (US-214 / `assertMatchesSpec()`).

## Componentes y patrones

- `organisms/patient-header-bar.tsx` (barra del paciente S2-00: nombre, documento, año, diagnóstico, origen).
  Reutilizable por el panel de análisis (antes `PatientContextCard` en el backlog; se usa la grafía de S2-00).
- `organisms/patient-summary-card.tsx` (identificación), `organisms/active-diagnosis-table.tsx` (filas de S2-04),
  `organisms/recent-biomarkers-table.tsx` (tabla con `<th scope>`), `molecules/provenance-label.tsx`
  (los cuatro `entryMethod` y `reviewStatus` en texto), `molecules/data-origin-badge.tsx` ("SINTÉTICO"),
  `molecules/pending-review-notice.tsx` (`Alert` informativo, nunca de error).
- Todo RSC; sin `'use client'` (no hay interacción). Sin patrones nuevos (sin hooks ni providers: un solo
  consumidor). Componentes < 100 líneas cada uno. Textos en `apps/web/messages/es.json` (espacio `ficha.*`).

## Dependencias y colaboradores

- `src/modules/patients/patients.controller.ts` → `patients.service.ts` (`createPatientsService({ repository,
  identidad, tiposHabilitados })`) → `patients.repository.ts` (pool `pg` inyectado de `server.ts`).
- Puertos: `IdentidadDelPaciente` (implementado por `IdentityService` de L1D-200), `TiposDeCancerHabilitados`.
- Reglas extraídas: `seleccionarDiagnosticoVigente()`, `ultimoValorPorBiomarcador()`, `contarPendientesDeRevision()`.
- `web`: `lib/server/pacientes.ts` (`obtenerFicha(id)`) sobre el SDK generado; `lib/ficha/etiquetas-de-origen.ts`
  (mapa `entryMethod` → texto, extraído porque lo comparten ficha y biomarcadores).

## Tests

Supertest + PostgreSQL real de test (AC-1…AC-4, AC-6) con el seed sintético; Testing Library + MSW sobre la página
(AC-1 distintivo, AC-2, AC-5); E2E Playwright (AC-1, AC-2, AC-5) solo cuando exista el job de E2E de
ARR-02 resto (L1D-278); hasta entonces se registran como pendientes con ese ID.

## Riesgos

- L1D-200 llega tarde → AC-1 no puede afirmar la identidad descifrada; el resto del change no espera.
- Choque de propiedad del módulo `patients` con `l1d-202-listado-busqueda-pacientes` (US-048): ese change crea
  `GET /platform/patients` y la búsqueda; ambos comparten el router. Quien mergea segundo rebasa.

## Pendiente de definir

- D1 y D2: propuestos (P-4), pendientes de confirmación del usuario.
- D8 resuelto en el Gate 1: `200 PatientAdminSummary` para el admin, como dicta el contrato.
