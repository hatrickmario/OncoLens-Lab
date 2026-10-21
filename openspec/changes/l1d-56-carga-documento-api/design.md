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
    Justificación: el endpoint no tiene consumidor (US-079 llega en el S3) y `error` se trata como
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

## Desviaciones y notas de la implementación

- **`clinical-minio` en la integración:** el adapter real (`@aws-sdk/client-s3` contra el endpoint S3) corre en los tests y
  el almacén se simula **en su borde HTTP con MSW** (`tests/support/documentos.ts`: `PUT`/`DELETE` de objeto, `HEAD` de
  bucket). CLAUDE.md lista MinIO como borde mockeable y así la CI de `clinical-api` no necesita MinIO. El adapter se
  comprobó además **a mano contra un MinIO real** (`pgsty/minio`, la imagen del Compose): `asegurarBucket` idempotente,
  `PUT`, `DELETE` idempotente y credencial mala → `AlmacenNoDisponible`. No hay override de Compose de test para MinIO.
- **Cliente S3:** `@aws-sdk/client-s3` 3.1148.0 en lugar de `minio` 8.0.7, que arrastra 4 avisos moderados
  (`stream-json`, `decode-uri-component`). `busboy` 1.6.0 (+ `@types/busboy` 1.5.5). `npm audit --omit=dev`: 0
  vulnerabilidades (2.13).
- **Orden de validación:** el *multipart* se lee primero (el campo `documentType` puede llegar tras el archivo), con el
  archivo cortado en `MAX_UPLOAD_MB` + 1 byte; después `documentType` (Zod generado) → UUID de la ruta (no UUID = `404`) →
  paciente → tamaño → *magic bytes* → checksum → `putObject` → `INSERT`. Nada toca el almacén antes del paso `putObject`.
- **Fixtures:** `tests/fixtures/documents/` (el repo usa `tests/`, no `test/`). `grande.pdf` no se versiona ni se genera en
  `global-setup`: `pdfSinteticoDe(21)` lo arma en memoria en el test.
- **Rojos de los AC:** en AC-3 a AC-6 y AC-8 el rojo falla porque el endpoint aún no mapea el caso (devuelve `202` o un `500`
  que la verificación del proveedor rechaza por no estar declarado), no por un `import`. AC-7 (`401`) y el `403` del
  administrador pasaron desde el primer día: el guard (L1D-197) y `authorize('documents:upload')` ya existían.
- **Contrato fuera de `apps/clinical-api`:** E-4/E-5 obligaron a tocar `docs/architecture/adr/ADR-26-…`,
  `scripts/ci/contracts-breaking-excepciones.json` y su test (tarea 1.1), el fixture de parches
  `scripts/contracts/__fixtures__/parches/ac-17-errores-identidad-permisos.json` (al quitar los `pendingExamples` de
  `uploadDocument`, el índice 0 pasa a ser de `rag-orchestrator`) y `readme.md` (extracto generado por
  `contracts:readme-extract`).
- **`TraceIdGenerator` y `crearTraceIdMiddleware`** se importan del módulo `evidence-analysis`: son genéricos y
  convendría moverlos a `src/middleware/` en un refactor propio (fuera del alcance de este change).
- **Variables nuevas (RN-22), para el humano en `.env.example`** (todas opcionales; vacías = por defecto):
  `MAX_UPLOAD_MB` (20), `CLINICAL_MINIO_ENDPOINT` (`http://clinical-minio:9000`), `CLINICAL_DOCUMENTS_BUCKET`
  (`clinical-documents`), `CLINICAL_MINIO_ROOT_USER` (`clinical-minio-admin`, ya la usa el servicio MinIO) y
  `CLINICAL_MINIO_TIMEOUT_MS` (10000; no se pasa desde el Compose). `CLINICAL_MINIO_PASSWORD_FILE` pasa a ser
  obligatoria: sin ella `clinical-api` no arranca (fallo cerrado). `docker-compose.yml` ya pasa las cuatro primeras.

## Gate 2: decisiones pendientes y deuda

### Para el usuario: `original_filename` en claro (privacy-guardian, Mayor 2; RN-10)

`docs/architecture/data-model.md` (líneas 220 y 811) pide que `original_filename` "se guarde cifrado o enmascarado". Este
change lo guarda **en claro** en `clinical.document` (nunca en logs, `audit`, metadatos de MinIO ni Backend 2: lo cubre el
test parametrizado de no-fuga). Es una desviación del data-model, no un descuido. Dos opciones, sin implementar ninguna
hasta que el usuario decida:

- **A. Cifrar ahora** con el AES-256-GCM de `identity` (claves y anillo de versiones ya existentes) y descifrar solo al
  responder el `Document`. Coste: el cifrador de identidad se abre a un segundo módulo, columna `bytea` o nueva migración
  y el test de integridad de las versiones de clave.
- **B. DEC + historia de deuda** que cifre el nombre, con **bloqueo en `preflight real-data` antes de G-Piloto**. Con
  datos sintéticos (RN-13) el riesgo es nulo y evita ampliar el alcance de este change.
- **Recomendación: B.** Hasta ese momento el nombre se normaliza en el borde (NFC, sin control ni formato, 255).
- **FEAT-01b no tiene historia dueña** del cifrado del nombre: se propone una historia nueva «cifrar `original_filename`
  (data-model.md) y bloquearla en el preflight», dependiente de la elegida entre A y B.

### Para el usuario: `500 ErrorInterno` no declarado en `uploadDocument` (contract-keeper)

El endpoint puede responder `500` (fallo del `INSERT`, error no controlado) pero el contrato no lo declara. Declararlo es
aditivo, exige otra versión menor y reordena `56 → 202` (1.8.0 → 1.9.0 de `l1d-202`). **No se resuelve aquí.**
Recomendación: añadirlo en L1D-202 junto con los demás `500` de los endpoints de pacientes. Los tests que ejercitan el
`500` lo declaran con `respuestasAjenasAlContrato` acotado a `status: 500`.

### Aplicado en esta ronda

- Multipart hostil: el lector atiende `error` del archivo y de la petición (abortada o truncada → `422`, sin tumbar el
  proceso ni dejar la promesa colgada); límites `{ files: 1, fields: 4, parts: 6, fieldSize: 1 KiB, headerPairs: 20 }`
  (superarlos → `422`), corte de lectura al superar el archivo y rechazo por `Content-Length` > máximo + 64 KiB con
  `Connection: close` antes de leer el cuerpo.
- `limiteDeLecturaDeCarga(maxMb)` (el +1 byte se explica en la regla) con PDF de exactamente `MAX_UPLOAD_MB` → `202`.
- `normalizarNombreOriginal` en el borde. `compensar()` de mejor esfuerzo: el duplicado siempre responde `409` y la
  compensación fallida se registra por UUID. `esDuplicadoPorChecksum` compara el nombre de la restricción.
- `documents` es **obligatorio** en `RoutersProtegidos`: olvidarlo en `server.ts` rompe el build. El arnés del gateway
  pasa un `Router()` vacío; la suite de documents verifica el montaje y la coherencia con el contrato.

### Deuda propuesta (historia «infraestructura compartida de ingesta» antes de US-077)

Mover `crearTraceIdMiddleware` y `TraceIdGenerator` a `src/middleware/`; unificar los errores de dominio repartidos entre
módulos; usuario raíz de MinIO como credencial de `clinical-api` (crear un usuario de servicio acotado al bucket);
`ESTADO_INICIAL_DE_COLA` (`pendiente`, `attempts = 0`) como constante compartida con el *worker* de US-078.
