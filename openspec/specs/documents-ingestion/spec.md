# documents-ingestion Specification

## Purpose
TBD - created by archiving change l1d-56-carga-documento-api. Update Purpose after archive.

## Requirements

### Requirement: Carga de un PDF que queda almacenado y encolado
`POST /platform/patients/{patientId}/documents` MUST aceptar un PDF válido con `documentType` permitido, guardarlo en `clinical-minio` bajo una clave generada por el servidor que no contiene el nombre original, crear la fila `document` con `ocr_status = pendiente`, `attempts = 0` y `checksum` SHA-256, y responder `202` con el `Document`.

#### Scenario: Un PDF válido se guarda y queda pendiente de extracción [US-076 AC-1] [HU-04] [OL-05] [FR-05]
- **GIVEN** `doc1@test.local` autenticado y el paciente semilla (a)
- **WHEN** envía `POST /platform/patients/{id}/documents` con `mama-examen.pdf` (FX-01a-a) y `documentType = examen`
- **THEN** responde `202` con un `Document` en `ocrStatus = pendiente` que valida contra el spec del proveedor
- **AND** la tabla `document` tiene esa fila con `checksum` SHA-256 del archivo y `attempts = 0`
- **AND** el bucket `clinical-documents` de `clinical-minio` guarda el binario bajo una clave que no contiene "mama-examen"

### Requirement: Solo PDFs por magic bytes y dentro del tamaño máximo
El endpoint MUST validar el archivo por sus *magic bytes* (`%PDF-`), nunca por extensión ni `Content-Type`, y rechazar con `422` todo archivo que no sea PDF o que supere `MAX_UPLOAD_MB` (configuración, RN-22), antes de tocar el almacén, sin crear fila y sin llamar a `rag-orchestrator`.

#### Scenario: Un documento de Word, con o sin extensión .pdf, se rechaza [US-076 AC-2] [HU-04] [AC-01.1] [OL-05]
- **GIVEN** `informe.docx` y `falso.pdf` (el mismo `.docx` renombrado) de FX-01a-a
- **WHEN** se envía cada uno
- **THEN** cada uno responde `422` con `{ error, message, traceId }` que valida contra el spec
- **AND** no se crea ninguna fila en `document` ni objeto nuevo en `clinical-minio`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas

#### Scenario: Un PDF que supera el tamaño máximo se rechaza [US-076 AC-3] [FR-05] [RN-22]
- **GIVEN** `grande.pdf` (21 MB) y `MAX_UPLOAD_MB = 20` en la configuración de test
- **WHEN** se envía
- **THEN** responde `422` y no se crea fila ni objeto

#### Scenario: Un documentType fuera del contrato se rechaza [US-076 AC-5] [readme §4.1]
- **GIVEN** `mama-examen.pdf` con `documentType = receta`
- **WHEN** se envía
- **THEN** responde `422` y no se crea fila ni objeto

### Requirement: Duplicados por checksum por paciente
El endpoint MUST responder `409 DOCUMENTO_DUPLICADO` cuando el paciente ya tiene un documento con el mismo checksum SHA-256, sin crear fila ni dejar objeto nuevo en el almacén (AC-03.4).

#### Scenario: El mismo PDF dos veces para el mismo paciente responde 409 [US-076 AC-4] [AC-03.4] [FR-05]
- **GIVEN** `mama-examen.pdf` ya cargado para el paciente semilla (a)
- **WHEN** se envía de nuevo
- **THEN** responde `409` con `error = DOCUMENTO_DUPLICADO`
- **AND** el paciente sigue con una sola fila de ese `checksum` y un solo objeto en `clinical-minio`

### Requirement: Paciente, sesión y permiso se comprueban antes de almacenar
El endpoint MUST responder `401` sin sesión válida antes del controlador, `403` sin el permiso `documents:upload` y `404` si el paciente no existe, en todos los casos sin escribir en `clinical-minio` ni en `document`.

#### Scenario: Paciente inexistente [US-076 AC-6] [OL-05]
- **GIVEN** un `patientId` con formato UUID que no existe
- **WHEN** se envía `mama-examen.pdf`
- **THEN** responde `404` y no se escribe en `clinical-minio`

#### Scenario: Sin sesión el guard responde antes del controlador [US-076 AC-7] [FR-01]
- **GIVEN** un request sin cookie de sesión válida
- **WHEN** llega a `POST /platform/patients/{id}/documents`
- **THEN** el guard responde `401` y el controlador no se invoca

#### Scenario: El administrador no puede cargar documentos (asumido) [data-model: matriz de permisos]
- **GIVEN** `admin@test.local` autenticado (`documents:upload` = no)
- **WHEN** envía `mama-examen.pdf` para el paciente semilla (a)
- **THEN** responde `403` y no se crea fila ni objeto

### Requirement: Almacén caído falla cerrado y sin detalles
Si `clinical-minio` no responde, el endpoint MUST responder `503` con `{ error, message, traceId }` sin detalles internos y SHALL NOT dejar fila en `document`. Si la fila no se puede crear después de escribir el objeto, el objeto MUST borrarse.

#### Scenario: clinical-minio sin responder [US-076 AC-8] (asumido)
- **GIVEN** el adapter del almacén sin conexión con `clinical-minio`
- **WHEN** se envía `mama-examen.pdf`
- **THEN** responde `503` con `error = ALMACEN_NO_DISPONIBLE` y un `message` sin host, bucket ni traza
- **AND** no queda fila en `document`

### Requirement: Los logs de la carga no revelan el documento
Los logs de la carga MUST registrar solo el UUID del paciente, el UUID del documento, el resultado y el `traceId`; SHALL NOT registrar el nombre original del archivo, su contenido, la clave del objeto ni identidad (RN-10). `original_filename` se trata como identidad: MUST guardarse solo en la fila `document` y SHALL NOT enviarse a `rag-orchestrator`, ni escribirse en `audit`, ni en los metadatos del objeto en `clinical-minio`.

#### Scenario: La carga no deja el nombre del archivo en los logs (asumido) [RN-10]
- **GIVEN** la carga de `mama-examen.pdf` del escenario [US-076 AC-1]
- **WHEN** se inspeccionan los logs capturados del request
- **THEN** no contienen "mama-examen", la clave del objeto ni bytes del archivo

#### Scenario: El nombre original no sale de la fila del documento (asumido) [RN-10]
- **GIVEN** la carga de `mama-examen.pdf` del escenario [US-076 AC-1]
- **WHEN** se inspeccionan el objeto en `clinical-minio`, las filas de `audit` y las llamadas a `rag-orchestrator`
- **THEN** el objeto no tiene metadatos ni `Content-Disposition` con "mama-examen", `audit` no lo contiene y `rag-orchestrator` no recibió ninguna llamada
