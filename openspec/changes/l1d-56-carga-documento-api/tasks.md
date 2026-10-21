# Tasks — l1d-56-carga-documento-api

> Matriz TDD (CLAUDE.md): endpoint y service con lógica → **TDD estricto, doble bucle** (commit `test(L1D-56)` en
> rojo antes de `feat(L1D-56)`); adapter del almacén, configuración y composición → **test después**.
> Mocks solo en los bordes: `clinical-minio` real de test en integración (y fake del adapter solo para simular la
> caída y en unitarios), MSW con contador hacia `rag-orchestrator`; PostgreSQL real; reloj e IDs inyectados. Nunca
> `.skip`, `.only` ni `it.todo`. Secuencia de commits: `contract` → `test` → `feat` → `refactor`.

## 1. contratos

- [ ] 1.1 (test después; E-4/E-5 decididas, `[S2 resp. 9]`; incluye corregir en ADR-26 que una E-n sube la versión menor, `[S2 resp. 12]`) Declarar las excepciones E-4 (`ARCHIVO_NO_PDF`) y E-5 (`ARCHIVO_DEMASIADO_GRANDE`), regla `response-property-enum-value-added` en `POST /platform/patients/{patientId}/documents` (`422`), en la tabla de `docs/architecture/adr/ADR-26-contrato-congelado-y-excepciones-declaradas.md`, en `scripts/ci/contracts-breaking-excepciones.json` (texto exacto del hallazgo de `oasdiff`) y en `scripts/ci/__tests__/excepcionesDeContrato.test.mjs` (lista `E-1…E-5`; el mismo valor en otra ruta o un valor distinto sigue rompiendo). Verificación: test en verde.
- [ ] 1.2 (exento) Editar `apps/clinical-api/openapi.yaml` según el diff del design (`422` con `ErrorDocumentoNoProcesable`, `503` con `ErrorAlmacenNoDisponible`, retiro de `413`/`415` pendientes, borrado de `ErrorSolicitudNoProcesable` huérfano tras comprobar con `grep` que no tiene otra referencia, `info.version` a `1.8.0`) y añadir los ejemplos `document-uploaded.json`, `error-archivo-no-pdf.json`, `error-archivo-demasiado-grande.json`, `error-almacen-no-disponible.json` a `contracts/examples/` e `index.json`.
- [ ] 1.3 (exento) Quitar de `contracts/examples/index.json` las dos entradas de `pendingExamples` de `uploadDocument` (`…/documents/post/responses/413` y `/415`), conservando las de `/documents/extract`.
- [ ] 1.4 (exento) `contracts:check`, `contracts:breaking` (solo E-4/E-5 perdonadas; el retiro de `413`/`415` y el `503` salen como INFO) y `contracts:generate`; commit `contract(L1D-56)`.

## 2. clinical-platform

- [ ] 2.1 (test después) Fixtures FX-01a-a en `apps/clinical-api/test/fixtures/documents/` (sintéticos: `mama-examen.pdf`, `informe.docx`, `falso.pdf`; `grande.pdf` de 21 MB generado en el `global-setup`, no versionado), configuración de test `MAX_UPLOAD_MB = 20`, bucket de test en el `clinical-minio` de `tests/support/docker-compose.integration.yml` y contador MSW de `rag-orchestrator`. Verificación: test de humo.
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: "responde 202 en pendiente, guarda la fila con checksum y attempts 0 y el objeto con una clave sin el nombre original cuando se sube un PDF válido [US-076 AC-1]" · integración (Supertest + BD + MinIO de test), validando contra el spec. Esqueleto del módulo con `throw new Error('no implementado')`. Commit `test(L1D-56)`.
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: "responde 422 sin fila, sin objeto y sin llamadas a rag-orchestrator cuando el archivo no es PDF por magic bytes [US-076 AC-2]" · integración con `informe.docx` y `falso.pdf`. Commit `test(L1D-56)`.
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: "responde 422 sin fila ni objeto cuando el PDF supera MAX_UPLOAD_MB [US-076 AC-3]" · integración; tiempo máximo explícito. Commit `test(L1D-56)`.
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: "responde 409 y conserva una sola fila cuando el mismo PDF se sube dos veces [US-076 AC-4]" · integración. Commit `test(L1D-56)`.
- [ ] 2.6 (TDD estricto) Test de aceptación en rojo: "responde 422 cuando documentType es receta [US-076 AC-5]" · integración. Commit `test(L1D-56)`.
- [ ] 2.7 (TDD estricto) Test de aceptación en rojo: "responde 404 sin escribir en el almacén cuando el paciente no existe [US-076 AC-6]" · integración. Commit `test(L1D-56)`.
- [ ] 2.8 (TDD estricto) Test de aceptación en rojo: "el guard responde 401 antes del controlador cuando no hay sesión [US-076 AC-7]" y "responde 403 sin fila ni objeto cuando carga el administrador" · integración. Commit `test(L1D-56)`.
- [ ] 2.9 (TDD estricto) Test de aceptación en rojo: "responde 503 ALMACEN_NO_DISPONIBLE sin detalles y sin fila cuando clinical-minio no responde [US-076 AC-8]" · integración con el adapter apuntando a un endpoint cerrado. Commit `test(L1D-56)`.
- [ ] 2.10 Extraer `esPdfPorMagicBytes()`, `superaTamanoMaximo()` y `claveDeObjeto()` con unitarios uno a la vez (bytes vacíos; `%PDF-` exacto; prefijo parcial; límite justo e inmediatamente superior; clave sin nombre ni checksum). Commit `feat(L1D-56)`.
- [ ] 2.11 Implementar el módulo `documents` (controller con parser *multipart* limitado, schema Zod generado, service con el orden de validación y la compensación ante fallo del `INSERT` o carrera de la `UNIQUE`, repository), el puerto `AlmacenDeDocumentos` con adapter S3/MinIO y `asegurarBucket()` al arrancar, la configuración (`MAX_UPLOAD_MB`, `CLINICAL_MINIO_ENDPOINT`, `CLINICAL_DOCUMENTS_BUCKET`, contraseña desde `CLINICAL_MINIO_PASSWORD_FILE`) y el montaje detrás del guard y de `documents:upload`. Verificación: 2.2–2.9 en verde. Commit `feat(L1D-56)`. Alta de las variables en `.env.example`/Compose: en el mismo PR con aprobación del humano, o deuda con ID.
- [ ] 2.12 (test después) Test de no-fuga de `original_filename` [RN-10]: tras la carga de 2.2, los logs capturados no contienen "mama-examen", la clave del objeto ni bytes del archivo; el objeto en MinIO no tiene metadatos ni `Content-Disposition` con el nombre; no hay filas en `audit` con el nombre; y el contador MSW confirma que Backend 2 no recibió nada. Verificación: test en verde.
- [ ] 2.13 (test después) Auditoría de las dependencias nuevas (`npm audit`, versión exacta fijada) registrada en el PR.
- [ ] 2.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-56)`.

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-56-carga-documento-api --strict` en verde.
- [ ] 3.2 Suite de `apps/clinical-api` en verde (Vitest + Supertest).
- [ ] 3.3 `contracts:verify-provider` (o el helper vigente de US-214) sobre `202`, `401`, `403`, `404`, `409`, `422` y `503` de `uploadDocument`.
