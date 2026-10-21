# Design — l1d-56-carga-documento-api

## Context

Ver `proposal.md`. Existe la tabla `document` (L1D-168) con `@@unique([patientId, checksum])` y el índice
`(ocr_status, uploaded_at)` para la cola; `clinical-minio` corre en Compose y `clinical-api` ya recibe
`CLINICAL_MINIO_PASSWORD_FILE`, pero no hay cliente del almacén ni módulo `documents`. El `openapi.yaml` declara
`uploadDocument` con `202`, `401`, `403`, `404`, `409`, `422` (egresado/`documentType`) y dos respuestas pendientes
(`413`, `415`) con `x-pending-owner: FEAT-01b`.

## Goals / Non-Goals

**Goals:** endpoint de carga con validaciones antes del almacén, deduplicación por checksum, clave opaca, fila en
`pendiente` (la cola), fallos cerrados y logs sin datos del documento.

**Non-Goals:** *worker* (US-078), UI (US-079), lote (US-077), lectura del archivo (US-212), BFF (ver Open Questions).

## Decisions

1. **Orden de validación** (barato → caro; nada toca el almacén antes del paso 6): `documentType` (Zod) → permiso →
   paciente existe → lectura con límite → *magic bytes* → checksum duplicado → `putObject` → `INSERT`. Una regla por
   paso, cada una con nombre propio en el service: `esPdfPorMagicBytes()`, `superaTamanoMaximo()`,
   `claveDeObjeto()`.
2. **Códigos según los AC: `422`** para "no es PDF" y "tamaño excedido" (US-076 AC-2, AC-3), con códigos cerrados
   `ARCHIVO_NO_PDF` y `ARCHIVO_DEMASIADO_GRANDE`. Se retiran las respuestas pendientes `413`/`415`, que el spec dejaba
   a la historia dueña sin fijarlas. Alternativa descartada: `413`/`415` HTTP-semánticos (contradicen los AC
   aprobados en el refinamiento y obligarían a reabrirlos; el contrato les cedía la decisión).
3. **Lectura en memoria con límite** (`MAX_UPLOAD_MB`, 20 MB): el parser *multipart* corta al superar el límite
   (no se lee el resto) y el SHA-256 se calcula sobre el *buffer*. 20 MB por request cabe holgado en el presupuesto
   de memoria del stack; el *streaming* directo al almacén se descarta porque obligaría a escribir antes de saber si
   es duplicado.
4. **Clave del objeto `<patientId>/<documentId>`** con `documentId` del generador de IDs inyectado (UUID v4 aleatorio).
   No contiene nombre ni checksum. **`original_filename` se trata como identidad** (un nombre de archivo suele llevar
   nombre o documento del paciente): se guarda solo en la fila de `document` (lo devuelve el contrato al doctor) y
   **nunca** se envía a Backend 2, ni se escribe en `audit`, ni en los metadatos ni etiquetas del objeto en MinIO
   (`putObject` sin `x-amz-meta-*` ni `Content-Disposition` con el nombre), ni en logs ni en el `message` de los errores.
5. **Duplicados:** comprobación previa por `(patientId, checksum)` y, ante carrera, la violación de la `UNIQUE`
   también se mapea a `409` y borra el objeto recién escrito (compensación).
6. **Puerto `AlmacenDeDocumentos`** (`guardar(clave, bytes)`, `borrar(clave)`) con adapter S3-compatible para MinIO
   y un fake en memoria para unitarios; los tests de integración usan el `clinical-minio` de test de Compose. Errores
   del adapter → `AlmacenNoDisponible` → `503 ALMACEN_NO_DISPONIBLE`.
7. **Bucket:** se crea de forma idempotente al arrancar `clinical-api` (`asegurarBucket()`), sin bloquear la salud
   del proceso si MinIO no está; descartado un contenedor *one-shot* nuevo en Compose (más infraestructura para una
   operación idempotente).
8. **Dependencias nuevas:** cliente S3-compatible (`minio` o `@aws-sdk/client-s3`, el más liviano con soporte de
   Node LTS) y parser *multipart* con límite (`busboy`/`multer`); se fijan versión exacta y resultado de `npm audit`
   en el PR.

## Privacidad y ownership

- **Fronteras:** el PDF viaja navegador → `web` (S3) → `clinical-api` → `clinical-minio`. `clinical-api` es el único
  dueño del almacén; `rag-orchestrator` **no** tiene credenciales ni ruta de red hacia `clinical-minio` (spec
  `platform-stack`) y en este change no recibe nada (AC-2 lo verifica con contador de llamadas). La extracción del S3
  le enviará el PDF en el cuerpo del request, sin persistirlo.
- **RN-10/RN-11:** la clave del objeto no lleva nombre ni identidad; `original_filename` es identidad (decisión 4):
  solo vive en la fila de `document`, nunca en Backend 2, `audit`, metadatos de MinIO ni logs; los logs solo UUIDs y
  `traceId`; el `message` de los errores no hace eco del archivo.
- **RN-13/RN-14:** solo FX-01a-a sintético; el gate de datos reales no cambia. El documento puede contener PII
  (`doc-pii.pdf`): queda en el almacén clínico, y el gate de PII se aplica en la extracción (S3), no aquí.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `modules/documents/documents.controller.ts` | nuevo: *multipart*, Zod, mapeo de errores | service |
| `modules/documents/documents.service.ts` | nuevo: orden de validación y compensación | puertos `AlmacenDeDocumentos`, `DocumentsRepository`, `Reloj`, `GeneradorDeIds` (factory, sin DI) |
| `modules/documents/documents.repository.ts` | nuevo: paciente existe, duplicado, `INSERT` | Prisma/pg |
| `infrastructure/almacen-documentos.minio.ts` | nuevo adapter | cliente S3 |
| `src/config.ts` | `MAX_UPLOAD_MB`, `CLINICAL_MINIO_ENDPOINT`, `CLINICAL_DOCUMENTS_BUCKET`, contraseña desde `_FILE` | — |
| `app.ts` / `server.ts` | montaje detrás del guard y del permiso `documents:upload` | — |

## Contratos

**Proveedor:** `clinical-api`; **consumidor:** `web` (S3, US-079). Diff propuesto de `apps/clinical-api/openapi.yaml`:

```yaml
/platform/patients/{patientId}/documents:
  post:
    responses:
-     "413": { description: … , x-pending-owner: FEAT-01b }
-     "415": { description: … , x-pending-owner: FEAT-01b }
      "422":
-       description: documentType inválido, o paciente egresado (RN-17).
+       description: documentType inválido, archivo que no es PDF (magic bytes), tamaño mayor que MAX_UPLOAD_MB, o paciente egresado (RN-17).
        content:
          application/json:
-           schema: { $ref: '#/components/schemas/ErrorSolicitudNoProcesable' }
+           schema: { $ref: '#/components/schemas/ErrorDocumentoNoProcesable' }
+     "503":
+       description: Almacén de documentos no disponible (sin detalles internos).
+       content:
+         application/json:
+           schema: { $ref: '#/components/schemas/ErrorAlmacenNoDisponible' }
components:
  schemas:
+   ErrorDocumentoNoProcesable:
+     type: object
+     additionalProperties: false
+     required: [error, message, traceId]
+     properties:
+       error: { type: string, enum: [CUERPO_INVALIDO, ARCHIVO_NO_PDF, ARCHIVO_DEMASIADO_GRANDE, PACIENTE_EGRESADO] }
+       message: { type: string }
+       traceId: { type: string }
+   ErrorAlmacenNoDisponible:
+     type: object
+     additionalProperties: false
+     required: [error, message, traceId]
+     properties:
+       error: { type: string, const: ALMACEN_NO_DISPONIBLE }
+       message: { type: string }
+       traceId: { type: string }
```

- **Ejemplos nuevos** en `contracts/examples/` (+ `index.json`): `document-uploaded.json` (`202`),
  `error-archivo-no-pdf.json`, `error-archivo-demasiado-grande.json`, `error-almacen-no-disponible.json`;
  `error-documento-duplicado.json` ya existe.
- **Versión:** `info.version` de `clinical-api` pasa a **`1.8.0`** (minor; tras `l1d-167` → `1.6.0` y `l1d-171` →
  `1.7.0`; si el orden de merge cambia, se toma la siguiente minor libre).
- **Limpieza del contrato:** se quitan de `contracts/examples/index.json` las dos entradas de `pendingExamples` de
  `uploadDocument` (`…/documents/post/responses/413` y `/415`; las de `/documents/extract` de `rag-orchestrator` se
  quedan) y se borra `ErrorSolicitudNoProcesable` de `components.schemas`, que queda huérfano al pasar el `422` a
  `ErrorDocumentoNoProcesable` (comprobar antes con `grep` que no tiene otra referencia).
- **Compatibilidad (ADR-26):** `oasdiff` da **2 ERR `response-property-enum-value-added`** en el `422` de
  `uploadDocument` (valores `ARCHIVO_NO_PDF` y `ARCHIVO_DEMASIADO_GRANDE` en `error`). Retirar `413`/`415` (pendientes
  con `x-pending-owner`) y añadir `503` son solo **INFO**: no bloquean. El problema son los enums.
  - **Decidido (usuario, 2026-10-21, `[S2 resp. 9]`):** excepciones **E-4** y **E-5** de ADR-26, una por valor,
    con la misma forma que E-1…E-3: declaradas en la tabla de ADR-26, en `scripts/ci/contracts-breaking-excepciones.json`
    (regla, operación `POST`, ruta, texto exacto del hallazgo, `change: l1d-56-carga-documento-api`) y con su caso en
    `scripts/ci/__tests__/excepcionesDeContrato.test.mjs` (la lista declarada pasa a `E-1…E-5`; un valor distinto o
    en otra ruta sigue rompiendo). Se hace en la **primera tarea de contratos**, antes de editar el `openapi.yaml`.
    Justificación: el endpoint no tiene implementación ni consumidor (US-079 llega en el S3) y `error` se trata como
    cadena abierta. En la misma tarea se corrige el texto de política de ADR-26: una excepción E-n declarada sube la versión **menor**
    (precedente E-1, E-3), no la mayor (`[S2 resp. 12]`).
  - **Descartada:** `x-extensible-enum` en lugar de `enum`. Su efecto en el Zod generado (`contracts:generate`) no
    está verificado (podría perder la validación cerrada del borde), y en E-2 se midió que el enum extensible no
    evitaba el ERR.
  - Zod y tipos se **generan** del spec (`contracts:generate`), nunca a mano.

## Risks / Trade-offs

- **Memoria por cargas concurrentes** (20 MB × N) → aceptable en el MVP de un usuario; el *rate limit* (RN-30) llega
  con su historia.
- **Objeto huérfano** si el proceso muere entre `putObject` e `INSERT` → la compensación cubre los errores
  controlados; un huérfano por caída no es visible (no hay fila) y se anota para el job de retención (Post-MVP).

## Open Questions

- **Route Handler BFF** (`app/api/patients/[patientId]/documents/route.ts`, en el Contexto técnico de US-076): sin
  consumidor en el S2. Decidido: lo entrega US-079 en el S3 junto a la UI (`[S2 resp. 1]`). Si el humano lo quiere en
  el S2, se añade como tarea `clinical-platform` con su sección de Seguridad web.
- **Variables nuevas** (`MAX_UPLOAD_MB`, `CLINICAL_MINIO_ENDPOINT`, `CLINICAL_DOCUMENTS_BUCKET`): su alta en
  `.env.example` y en el Compose la hace el implementador en el PR con aprobación del humano (no se editan en la
  planificación).
- **`x-pending-owner: FEAT-01b`** apuntaba a la Feature equivocada (la dueña de la carga es FEAT-01a, US-076): se
  corrige al retirar esas respuestas.
