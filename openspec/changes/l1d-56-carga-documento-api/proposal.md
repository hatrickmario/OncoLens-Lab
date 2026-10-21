# Proposal — l1d-56-carga-documento-api

## Trazabilidad

L1D-56 · US-076 · FEAT-01a (L1D-6) · Sprint 2 · Estimación **5** · HU-04 · FR-05 (dueña), FR-01 · RN-10, RN-14,
RN-22 · AC-01.1 (parte de carga: *magic bytes*, 20 MB, `409`), AC-03.4 (checksum) · OL-05 · readme §4.1 `Document`,
`POST …/documents` · readme §6.1 #9, #11 · US-076 AC-1…AC-8 · Refinamiento `backlog/sprints/S2-refinamiento.md`
(DoR ✓, "n/a, sin UI en S2") · 🔗 Regresión [RN-17] → US-198 (Post-MVP: `422` por paciente egresado) ·
🔗 Regresión [RN-15] → US-148 (activa desde S6: la carga **no** responde `403` por opt-out, FR-16).

> **Alcance del S2 (P-1 del refinamiento, aprobada por el usuario el 2026-10-21, `[S2 resp. 1]`):** solo la API de `clinical-api`
> (subida, validación por *magic bytes*, `MAX_UPLOAD_MB`, checksum `409` y almacenamiento en `clinical-minio`). El
> *worker* de la cola (US-078) y la UI con estados (US-079) se proponen para el S3 junto a la extracción (US-082) y
> **no** entran en este change.

## Why

Hoy el oncólogo recibe PDFs sueltos y transcribe a mano lo que necesita (AS-IS etapa 1, P1). El primer paso de la
ingesta es recibir el PDF de forma segura: comprobar que es un PDF de verdad, que no excede el tamaño, que no está
duplicado, guardarlo en el almacén clínico con una clave que no revela nada y dejarlo **encolado** (`Document` es la
cola: `ocr_status = pendiente`, `attempts = 0`) para que la extracción del S3 lo recoja.

## What Changes

- **Módulo nuevo `documents`** en `apps/clinical-api/src/modules/documents/`
  (`documents.controller/service/repository/schema.ts`, Zod en el borde), montado detrás del guard de sesión
  con el permiso `documents:upload` (`doctor`; `admin` → `403`).
- **`POST /platform/patients/{patientId}/documents`** (`multipart/form-data`: `file`, `documentType`):
  1. `documentType` ∈ {`historia_clinica`, `examen`} → si no, `422`.
  2. Paciente existe → si no, `404`, sin tocar el almacén.
  3. Lectura del archivo con límite `MAX_UPLOAD_MB` (configuración, RN-22) → excedido, `422`.
  4. *Magic bytes* `%PDF-` (no extensión ni `Content-Type`) → si no, `422`.
  5. Checksum SHA-256 del binario; duplicado para el paciente → `409 DOCUMENTO_DUPLICADO`.
  6. Escritura en `clinical-minio` (bucket `CLINICAL_DOCUMENTS_BUCKET`, por defecto `clinical-documents`) bajo una
     clave generada por el servidor (`<patientId>/<documentId>`, sin nombre original) → almacén caído, `503`.
  7. Fila `document` con `ocr_status = pendiente`, `attempts = 0`, `checksum`, `uploaded_by`; respuesta `202` con
     `Document`. Si la inserción falla tras escribir el objeto, se borra el objeto (compensación).
- **Puerto `AlmacenDeDocumentos`** con adapter MinIO/S3 en `src/infrastructure/` y un fake de test que cumple el
  mismo contrato (errores incluidos).
- **Contrato:** se concretan los códigos que el spec dejaba pendientes (`413`/`415` con `x-pending-owner`): `422`
  para "no es PDF" y "tamaño excedido" según los AC, con códigos de error cerrados, y `503` por almacén no disponible.
  Los dos valores nuevos del enum del `422` son ERR de `oasdiff`: se proponen como excepciones E-4/E-5 de ADR-26
  (decidido por el usuario el 2026-10-21). `clinical-api` pasa a `1.8.0`.
- **Logs:** solo UUID de paciente y documento y `traceId`; nunca el nombre del archivo, su contenido ni la clave.
  `original_filename` es identidad: solo en la fila `document`; nunca a Backend 2, `audit` ni metadatos de MinIO.

## Capabilities

### New Capabilities

- `documents-ingestion`: carga de documentos clínicos en `clinical-api` (validación, deduplicación, almacenamiento y
  encolado). Listada en `openspec/config.yaml`, aún sin spec en `openspec/specs/`; la amplían US-077 (lote), US-078
  (cola) y US-212 (lectura del archivo).

### Modified Capabilities

- Ninguna. (`api-contracts` no cambia de requisito: el diff es del `openapi.yaml`, ver design `## Contratos`.)

## Bounded contexts

- **clinical-platform** (único): `apps/clinical-api` (módulo `documents`, adapter del almacén, configuración) y
  `contracts/examples/`. Sin `ai-services` (no hay llamada a `rag-orchestrator`) ni `frontend`.

## Dependencias

- ↪ Ya en `main`: L1D-164 (Compose con `clinical-minio`), L1D-168 (tabla `document` con `@@unique([patientId, checksum])`),
  L1D-197 (guard de sesión), L1D-169 (pacientes semilla).
- ↪ `l1d-199-usuarios-cli-rbac` (US-045, RBAC por CLI) si cambia la composición de permisos; el permiso `documents:upload` ya está en la
  matriz congelada.
- 🔗 Habilita (S3): US-078 (cola, *worker*), US-079 (UI), US-082 (extracción), US-212 (servir el archivo).
- 🔗 Contrato: coordina con `l1d-264-verificacion-proveedor` (US-214, verificación del proveedor) si mergea antes.

## Fuera de alcance

- *Worker* de extracción y reintentos (US-078), UI de carga y estados (US-079), carga múltiple `…/documents/batch`
  (US-077), servir el archivo (US-212), extracción (FEAT-01b).
- **Route Handler BFF** `app/api/patients/[patientId]/documents/route.ts`: sin consumidor en el S2; se propone que
  lo entregue US-079 en el S3 (ver design, Open Questions).
- `422` por paciente egresado (US-198, Post-MVP) y `403` por opt-out (no aplica a la carga, FR-16).

## Impact

- Código: `apps/clinical-api/src/modules/documents/*`, `src/infrastructure/almacen-documentos.*`, `src/config.ts`,
  `src/app.ts`/`server.ts` (composición). Tests en `apps/clinical-api/tests/integration/documents/` con FX-01a-a.
- Contratos: `apps/clinical-api/openapi.yaml` (respuestas de `uploadDocument`, schemas de error) y ejemplos nuevos
  en `contracts/examples/`.
- Dependencias npm nuevas (con auditoría en el PR): cliente S3/MinIO y parser *multipart* con límite de tamaño.
- Configuración nueva (RN-22): `MAX_UPLOAD_MB`, `CLINICAL_MINIO_ENDPOINT`, `CLINICAL_DOCUMENTS_BUCKET`.
- Evaluación: no toca la IA → sin `evaluate`. Datos: solo FX-01a-a sintético (RN-14).
