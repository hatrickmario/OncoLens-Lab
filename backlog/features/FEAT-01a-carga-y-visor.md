# FEAT-01a — Carga de documentos, cola de extracción y visor del documento de origen

> Linear: [L1D-6](https://linear.app/l1der-lab-mjbc/issue/L1D-6)

**Talla:** L · **Sprint:** 2 (US-076, US-078, US-079) · 3 (US-212) · `si-hay-capacidad` (US-077, US-080, US-081) · **Capacidad:** CAP-01 (AC-01.1 parte de carga, cola y visor; AC-01.2) · T-1 (AC-T1.1: abrir la fuente de un dato) · **Recorrido principal:** sí (US-076, US-078, US-079, US-212) · no (US-077, US-080, US-081)
**Requisitos:** FR-05 (dueña, vía HU-04) · FR-07 (dueña, vía HU-05 escenario 1: US-212 sirve y audita el archivo; US-080 el visor con página y resaltado) · NFR-07 (cola durable, 3 intentos, 0 documentos colgados) · NFR-02 (p95 ≤ 60 s, medido) · AC-03.4 (checksum) · V-13 (resolución de `cuarentena_pii` / `requiere_revision_identidad`, *workaround*)
**Evidencia:** [→ PRD §5 FR-05, FR-07], [→ PRD §7 NFR (fiabilidad de la cola, extracción p95)], [→ PRD §10 (`…/documents`, `…/documents/batch`, `…/documents/{docId}/file`)], [→ PRD §18.3.1 AC-01.1, AC-01.2], [→ PRD §18.3.3 AC-03.4], [→ PRD §18.4 AC-T1.1], [→ readme §5 HU-04, HU-05], [→ readme §6 OL-05 (tareas 1–5, 9; criterios de aceptación)], [→ readme §6.1 #9, #11], [→ readme §4.1 `Document`, `POST …/documents`, endpoints adicionales], [→ readme §3.1 `DOCUMENT`], [→ readme §2.5 (gate de PII)], [→ backlog/01-requisitos.md §10 V-13], [→ docs/AS-IS.md P1, etapa 1]
**Dependencias:** ↪ US-034 (`clinical-minio` en Compose), US-038 (tabla `document`), US-044 (sesión), US-054 (JWT de servicio) · 🔗 Consume: US-082…US-087 (extracción y persistencia, FEAT-01b) · 🔗 Produce para: US-102 (US-212 escribe el registro `document.file.read`; US-102 lo verifica en el S6) · 🔗 Medido en: US-103 (M-01.2, p95 de extracción) · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · 🔗 Regresión [RN-15] → US-148 (activa desde S6: la carga **no** responde `403` por opt-out, FR-16)
**Valor:** hoy el oncólogo recibe PDFs sueltos y transcribe a mano lo que necesita (AS-IS, etapa 1; P1). Con esta Feature sube uno o varios PDFs en una sola acción, ve en todo momento en qué estado está cada uno y, desde cualquier dato extraído, abre la página exacta del documento de donde salió.
**Workaround en el MVP:** carga múltiple (US-077) → un PDF por acción; visor (US-080) → la procedencia muestra documento y página con un enlace que descarga el PDF completo por US-212 (S3); UI de cuarentena (US-081) → el documento retenido no aporta datos y la lista muestra su estado.
**Stories:** US-076, US-078, US-079 (13 puntos, S2) · US-212 (2 puntos, S3) · US-077, US-080, US-081 (9 puntos, `si-hay-capacidad`)

## Fixtures

- **FX-01a-a · Archivos de carga** (`apps/clinical-api/test/fixtures/documents/`, todos sintéticos):
  - `mama-examen.pdf` — PDF digital de 2 páginas: examen de patología de mama del 2026-08-10 con "HER2 3+ (IHQ)" en la página 2 y "Receptor de estrógeno: positivo (80 %)".
  - `prostata-hc.pdf` — PDF digital de historia clínica de próstata: PSA 9,5 ng/mL del 2026-07-15, tratamiento con leuprorelina desde 2025-11 y progresión el 2026-07-20.
  - `escaneado.pdf` — PDF de 1 página sin capa de texto (imagen).
  - `ilegible.pdf` — PDF de 1 página en blanco con ruido.
  - `doc-pii.pdf` — examen de mama que incluye "CC 1234567" en el encabezado.
  - `informe.docx` — documento de Word.
  - `falso.pdf` — el mismo `informe.docx` renombrado a `.pdf`.
  - `grande.pdf` — PDF válido de 21 MB.
- Pacientes: semillas (a) y (b) de OL-01 (US-039), con solo lo que OL-01 define de ellos. `MAX_UPLOAD_MB = 20`, `EXTRACTION_MAX_ATTEMPTS = 3`, `WORKER_STALE_AFTER_SECONDS = 120` y `MAX_BATCH_FILES = 10` en la configuración de test `[RN-22]`.
- `rag-orchestrator` simulado con respuestas controladas (éxito, `422`, *timeout*, `5xx`) y contador de llamadas.

---

## US-076 — El oncólogo sube un PDF y el sistema lo valida, lo guarda y encola su extracción

> Linear: [L1D-56](https://linear.app/l1der-lab-mjbc/issue/L1D-56)

`FEAT-01a` · Sprint 2 · Estimación **5** · HU-04 · FR-05 (dueña), FR-01 · AC-01.1 (magic bytes, 20 MB, `409`), AC-03.4 (checksum) · ↪ US-034, US-038, US-044 · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · Ticket: OL-05

## Story
Como oncólogo, quiero subir el PDF de una historia clínica o de un examen de mi
paciente, para que sus datos se registren sin transcribirlos a mano.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local` autenticado y el paciente semilla (a),
  cuando envía `POST /platform/patients/{id}/documents` con `mama-examen.pdf` y
  `documentType = examen`, entonces responde `202` con un `Document` en
  `ocrStatus = pendiente`; la tabla `document` tiene esa fila con `checksum` SHA-256 y
  `attempts = 0`; y `clinical-minio` (bucket `clinical-documents`) guarda el binario bajo
  una clave generada por el servidor que no contiene el nombre original del archivo.
  `[HU-04]` `[OL-05]` `[FR-05]`
- **AC-2 (borde · no es PDF)** · Dados `informe.docx` y `falso.pdf`, cuando se envían,
  entonces cada uno responde `422` con `{ error, message }`, no se crea ninguna fila en
  `document`, no hay objeto nuevo en `clinical-minio` y el cliente de `rag-orchestrator`
  registra cero llamadas. `[HU-04]` `[AC-01.1]` `[OL-05]`
- **AC-3 (borde · tamaño)** · Dado `grande.pdf` con `MAX_UPLOAD_MB = 20`, cuando se
  envía, entonces responde `422` y no se crea fila ni objeto. `[FR-05]` `[RN-22]`
- **AC-4 (borde · duplicado)** · Dado `mama-examen.pdf` ya cargado para el paciente (a),
  cuando se envía de nuevo, entonces responde `409` y el paciente sigue con una sola
  fila de ese `checksum`. `[AC-03.4]` `[FR-05]`
- **AC-5 (borde · `documentType` inválido)** · Dado `documentType = receta`, cuando se
  envía, entonces responde `422`. `[readme §4.1]`
- **AC-6 (borde · paciente inexistente)** · Dado un `patientId` que no existe, cuando se
  envía `mama-examen.pdf`, entonces responde `404` y no se escribe en `clinical-minio`.
  `[OL-05]`
- **AC-7 (borde · sin sesión)** · Dado un request sin cookie de sesión válida, cuando
  llega, entonces el guard responde `401` antes del controlador. `[FR-01]`
- **AC-8 (borde · almacén caído)** · Dado `clinical-minio` sin responder, cuando se
  envía `mama-examen.pdf`, entonces responde `503` con `{ error, message }` sin
  detalles internos y no queda fila en `document`. (asumido)

## Contexto técnico
Módulo `documents` de `clinical-api` (`documents.controller/service/repository/schema.ts`,
Zod en el borde). Validación por *magic bytes* (`%PDF-`), no por extensión ni por
`Content-Type`, antes de tocar el almacén `[OL-05]`. El navegador sube a `web`
(`app/api/patients/[patientId]/documents/route.ts`, Route Handler en *streaming*), que
reenvía la cookie a `clinical-api`; ningún servicio más publica puerto `[CLAUDE.md]`. Los
*logs* registran solo UUID del paciente y del documento y el `traceId`, nunca el nombre
del archivo ni su contenido `[CLAUDE.md]`. Tests: Vitest + Supertest con MinIO de test y
FX-01a-a.

## Non-goals
Extracción (FEAT-01b). Carga múltiple (US-077). Interfaz (US-079). `422` por paciente
egresado: el egreso es Post-MVP (US-198).

## INVEST
**Small** ✓ un endpoint con cuatro validaciones previas al almacenamiento.
**Testable** ✓ ocho tests de integración con resultados observables en BD, MinIO y contador de llamadas.

---

## US-077 — El oncólogo sube varios PDFs en una sola acción y cada uno avanza por su cuenta

> Linear: [L1D-57](https://linear.app/l1der-lab-mjbc/issue/L1D-57)

`FEAT-01a` · Sprint si-hay-capacidad · Estimación **3** · HU-04 · FR-05 (carga múltiple) · AC-01.2 · ↪ US-076 · **Recorrido principal:** no · **Workaround en el MVP:** carga de un PDF por acción (US-076) repetida; cada documento avanza por su cuenta en la cola (US-078)

## Story
Como oncólogo, quiero seleccionar varios PDFs de mi paciente y subirlos de una vez,
para no repetir la carga archivo por archivo cuando recibo un paquete de documentos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el paciente semilla (a), cuando `doc1@test.local` envía
  `POST /platform/patients/{id}/documents/batch` con `mama-examen.pdf`,
  `prostata-hc.pdf` e `informe.docx`, entonces responde `207` con tres resultados en el
  orden de envío: dos con estado `202` y su `documentId` en `pendiente`, y uno con estado
  `422`; existen exactamente dos filas nuevas en `document`. `[AC-01.2]` `[FR-05]`
- **AC-2 (borde · duplicado contra lo ya cargado)** · Dado `mama-examen.pdf` ya cargado,
  cuando se envía un lote con `mama-examen.pdf` y `prostata-hc.pdf`, entonces el primero
  trae `409` y el segundo `202`. `[AC-01.2]` `[AC-03.4]`
- **AC-3 (borde · duplicado dentro del lote)** · Dado un lote con dos copias de
  `prostata-hc.pdf`, cuando se envía, entonces la primera trae `202` y la segunda `409`.
  (asumido)
- **AC-4 (borde · fallo aislado)** · Dado `clinical-minio` que falla solo al guardar el
  segundo archivo de un lote de tres, cuando se envía, entonces ese resultado trae `503`
  y los otros dos `202` con su `Document` creado. `[AC-01.2]`
- **AC-5 (borde · límite de archivos)** · Dado `MAX_BATCH_FILES = 10`, cuando se envía
  un lote de 11 archivos, entonces responde `422` y no se crea ningún `Document`.
  `[RN-22]` (asumido: el límite no está definido en las fuentes)

## Contexto técnico
Reutiliza el servicio de US-076 archivo por archivo, cada uno en su propia transacción.
Contrato de la respuesta `207` propuesto (vacío en readme §4.1, que solo nombra el
endpoint): `{ results: [{ originalFilename, status, documentId?, error? }] }`; se agrega
al spec OpenAPI y se regenera `packages/api-contracts` (DoD). Tests: Supertest con
FX-01a-a y MinIO de test con inyección de fallos.

## INVEST
**Small** ✓ un endpoint que orquesta la carga unitaria existente.
**Testable** ✓ cinco tests de integración sobre el cuerpo `207` y las filas creadas.

---

## US-078 — La cola de extracción procesa cada documento una sola vez, reintenta y nunca deja documentos colgados

> Linear: [L1D-58](https://linear.app/l1der-lab-mjbc/issue/L1D-58)

`FEAT-01a` · Sprint 2 · Estimación **5** · HU-04 · FR-06 (orquestación), NFR-07 (dueña) · AC-01.1 (3 reintentos, sin colgados) · ↪ US-076, US-054 · 🔗 Consume: US-082 (`/documents/extract`), US-087 (persistencia) · 🔗 Medido en: US-103 (M-01.2)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** la extracción (US-082, US-087) llega en el S3. En el S2 la cola se verifica con `rag-orchestrator` simulado (respuestas controladas de FX-01a-a); la extracción real se integra en el S3.

## Story
Como oncólogo, quiero que cada documento que subo termine siempre en un estado
claro, aunque el sistema se reinicie o la extracción falle, para no quedarme esperando
un resultado que nunca llega.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un `Document` en `pendiente` de `mama-examen.pdf`, cuando
  el *worker* lo toma, entonces en la misma transacción queda `procesando` con
  `attempts = 1` y `processing_started_at` no nulo; `rag-orchestrator` recibe
  `POST /documents/extract` en `multipart/form-data` con el archivo en el cuerpo,
  `Authorization: Bearer <jwt>`, `traceId`, `documentType`, `dataClassification` y
  `mode = carga`; y tras la persistencia (US-087) el documento queda `completado` con
  `extracted_at`. `[OL-05]` `[FR-06]` `[readme §4.2]`
- **AC-2 (borde · concurrencia)** · Dados 5 documentos `pendiente` y dos instancias del
  *worker* en paralelo, cuando terminan, entonces `rag-orchestrator` registra exactamente
  5 llamadas y ningún documento tiene `attempts > 1`. `[NFR-07]` `[OL-05]`
- **AC-3 (borde · reinicio)** · Dados un documento en `procesando` con
  `processing_started_at` más antiguo que `WORKER_STALE_AFTER_SECONDS` y `attempts = 1`,
  y otro igual con `attempts = 3`, cuando arranca `clinical-api`, entonces el primero
  vuelve a `pendiente` y el segundo pasa a `error`. `[AC-01.1]` `[NFR-07]`
- **AC-4 (borde · Backend 2 caído o lento)** · Dado `rag-orchestrator` que responde con
  *timeout* o `5xx` en todas las llamadas, cuando el *worker* procesa el documento,
  entonces lo intenta exactamente `EXTRACTION_MAX_ATTEMPTS = 3` veces y termina en
  `error` sin ningún dato clínico con su `source_document_id`. `[FR-06]` `[NFR-07]`
- **AC-5 (borde · ilegible)** · Dado `rag-orchestrator` que responde `422`, cuando se
  procesa el documento, entonces pasa directo a `error` con `attempts = 1`, sin reintento.
  `[OL-05]`
- **AC-6 (invariante · el binario viaja en el cuerpo)** · Dado el request capturado del
  AC-1, cuando se inspecciona, entonces no contiene ninguna URL ni clave de
  `clinical-minio`, y las credenciales de MinIO de `rag-orchestrator` reciben *access
  denied* al listar `clinical-documents`. `[OL-05]` `[CLAUDE.md]` `[SEG-06]`
- **AC-7 (borde · *logs*)** · Dado el procesamiento del AC-1, cuando se inspeccionan los
  *logs* de ambos servicios, entonces solo aparecen el UUID del documento y el `traceId`,
  sin nombre de archivo, texto ni URL. `[CLAUDE.md]` `[NFR-11]`

## Contexto técnico
`workers/extraction.worker.ts` en `clinical-api`: sondeo con
`SELECT … FOR UPDATE SKIP LOCKED` (vía `$queryRaw`), recuperación al arrancar y
reintentos según configuración `[RN-22]` `[readme §6.1 #9]`. No hay broker
`[readme §3.3 #11]`. `dataClassification` sale de `Patient.data_origin`. Tests: Vitest
con PostgreSQL de test y `rag-orchestrator` simulado; AC-6 además con MinIO de test.

## Non-goals
Lo que hace `rag-orchestrator` con el PDF (FEAT-01b) y cómo se persiste lo extraído
(US-087).

## INVEST
**Small** ✓ un *worker* con tres caminos (éxito, reintento, error).
**Testable** ✓ siete tests con contadores de llamadas y estados en BD.

---

## US-079 — Desde la ficha y la vista de caso subo documentos y veo el estado de cada uno

> Linear: [L1D-59](https://linear.app/l1der-lab-mjbc/issue/L1D-59)

`FEAT-01a` · Sprint 2 · Estimación **3** · HU-04, HU-05 (escenario 2) · FR-05 (UI), NFR-12 · AC-01.2 (parte de estados) · ↪ US-076, US-078 · 🔗 Relacionada: US-090 (vista de caso), US-077 (carga múltiple, `si-hay-capacidad`), US-081 (estados de cuarentena, `si-hay-capacidad`)

## Story
Como oncólogo, quiero subir documentos desde la ficha o la vista de caso y ver cómo
avanza cada uno, para saber cuándo sus datos ya están disponibles.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el oncólogo en la vista de caso del paciente semilla (a),
  cuando sube `mama-examen.pdf`, entonces `web` envía `POST /api/patients/{id}/documents`
  y la lista de documentos lo muestra como "Pendiente" y luego "Completado" sin recargar
  la página. `[AC-01.2]` `[HU-04]`
- **AC-2 (borde · rechazo)** · Dado `informe.docx`, cuando se sube, entonces la lista
  muestra junto a ese archivo el mensaje del `422` y no aparece ningún documento nuevo
  en `GET …/documents`. `[AC-01.2]` `[HU-04]`
- **AC-3 (borde · extracción fallida)** · Dado un documento en `ocrStatus = error`,
  cuando el oncólogo abre la ficha, entonces la lista muestra "La extracción falló" con la
  acción "Volver a cargar", y no aparece ningún biomarcador derivado de ese documento.
  `[HU-05]` `[OL-05]`
- **AC-4 (borde · listado paginado)** · Dados 25 documentos del paciente y
  `DOCUMENTS_PAGE_SIZE = 20`, cuando se pide `GET …/documents?page=1` y `?page=2`,
  entonces la primera página trae 20 y la segunda 5, ordenados por `uploadedAt`
  descendente. `[OL-05]` `[readme §6.1 #11]`
- **AC-5 (borde · accesibilidad)** · Dada la lista de documentos, cuando cambia el estado
  de uno, entonces el cambio se anuncia en una región `aria-live` y el selector de
  archivos es operable con teclado. `[NFR-12]`

## Contexto técnico
Componente `DocumentUploader` + `DocumentList` en `apps/web`, reutilizado en la ficha
(US-051) y en la vista de caso (US-090). El estado se consulta con sondeo de
`GET …/documents` (intervalo en configuración) a través de Route Handlers. Tests:
Playwright contra Compose en perfil de test con FX-01a-a (AC-1 a AC-3, AC-5) y Supertest
(AC-4). La selección de varios archivos en una sola acción (`…/documents/batch`, `207`)
es de US-077 (`si-hay-capacidad`); hasta entonces se sube un PDF por acción.

## INVEST
**Small** ✓ dos componentes sobre endpoints existentes.
**Testable** ✓ cinco tests E2E y de integración.

---

## US-080 — Desde un dato extraído abro el documento de origen en la página del valor

> Linear: [L1D-60](https://linear.app/l1der-lab-mjbc/issue/L1D-60)

`FEAT-01a` · Sprint si-hay-capacidad · Estimación **3** · HU-05 (escenario 1) · FR-07 (visor: página y resaltado) · AC-01.1 (visor), AC-T1.1 · ↪ US-212 (archivo servido y auditado, S3), US-087 · 🔗 Regresión [FR-18] → US-102 (cada apertura se audita por US-212) · **Recorrido principal:** no · **Workaround en el MVP:** la procedencia muestra el documento y la página del valor (US-092) con un enlace que descarga el PDF completo por US-212, sin visor ni resaltado

## Story
Como oncólogo, quiero abrir desde cualquier dato extraído el PDF del que salió, en la
página exacta y con el fragmento resaltado, para verificarlo en segundos sin buscarlo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el HER2 extraído de `mama-examen.pdf` con
  `source_span.page = 2`, cuando el oncólogo elige "Ver documento", entonces el visor
  carga el archivo por el endpoint de US-212 y abre la página 2 con el fragmento
  resaltado. `[FR-07]` `[HU-05]` `[AC-T1.1]`
- **AC-2 (borde · varias fuentes)** · Dado un dato con una fuente adicional en
  `ClinicalDataSource` (US-099), cuando el oncólogo abre su origen, entonces ve las dos
  fuentes listadas y cada una abre su propio documento en su página. `[FR-07]` `[AC-03.1]`
- **AC-3 (invariante · sin URL del almacén)** · Dada la apertura del AC-1, cuando se
  inspeccionan las peticiones del visor, entonces solo hay peticiones a `web`, y
  ninguna respuesta contiene una URL prefirmada ni una clave de `clinical-minio`.
  `[CLAUDE.md]` `[OL-05]` (regresión del AC-5 de US-212 con el visor)
- **AC-4 (borde · sin posición del fragmento)** · Dado un dato cuyo `source_span` trae
  la página pero no `bbox` ni *offset*, cuando se abre su origen, entonces el visor abre
  esa página sin resaltado y muestra "Fragmento no localizado en la página". (asumido)
- **AC-5 (borde · archivo no disponible)** · Dado el endpoint de US-212 respondiendo
  `404` o `503`, cuando el oncólogo elige "Ver documento", entonces el visor muestra
  "No se pudo abrir el documento" sin detalles internos y el dato sigue visible con su
  procedencia. (asumido)

## Contexto técnico
Visor con `pdf.js` en `apps/web` sobre `GET /api/patients/{id}/documents/{docId}/file`
(endpoint, autorización, auditoría y *streaming* de US-212); el resaltado usa
`source_span` (página, `bbox`, *offset*) de `Biomarker`, `ClinicalEvent`,
`PriorTreatment`, `ClinicalAttribute` y `ClinicalDataSource`. Tests: Playwright contra
Compose en perfil de test con FX-01a-a (AC-1 a AC-5).

## INVEST
**Small** ✓ un componente visor sobre un endpoint que ya existe (US-212).
**Testable** ✓ cinco tests E2E.

---

## US-081 — Un documento en cuarentena o con identidad distinta se muestra con su motivo y no aporta datos

> Linear: [L1D-61](https://linear.app/l1der-lab-mjbc/issue/L1D-61)

`FEAT-01a` · Sprint si-hay-capacidad · Estimación **3** · HU-04 (escenario 3) · FR-06 (bordes), V-13 (*workaround*) · AC-01.1 (`cuarentena_pii`, `requiere_revision_identidad`) · ↪ US-078, US-083 · 🔗 Relacionada: US-079 · **Recorrido principal:** no · **Workaround en el MVP:** el documento retenido (`cuarentena_pii` o identidad distinta) no aporta datos (US-083) y la lista de documentos (US-079) muestra su estado, sin pantalla de resolución

## Story
Como oncólogo, quiero ver por qué un documento quedó retenido por datos personales o
por no corresponder a mi paciente, para saber que sus datos no entraron al caso y
cargar una versión correcta.

## AC (Given/When/Then)
- **AC-1 (happy path · cuarentena)** · Dado `doc-pii.pdf` del paciente semilla (a)
  procesado por el gate (US-083), cuando el oncólogo abre la lista de documentos,
  entonces lo ve como "Retenido por datos personales" con el tipo de hallazgo
  ("número de documento") y sin el valor, y ningún dato clínico tiene ese
  `source_document_id`. `[HU-04]` `[FR-06]` `[readme §2.5]`
- **AC-2 (borde · identidad distinta)** · Dado un documento en
  `requiere_revision_identidad`, cuando se abre la lista, entonces se muestra "La
  identidad del documento no coincide con la del paciente" y ningún dato clínico tiene
  ese `source_document_id`. `[FR-06]`
- **AC-3 (borde · versión corregida)** · Dado `doc-pii.pdf` en cuarentena, cuando el
  oncólogo sube una versión sin el dato personal (otro `checksum`), entonces se crea un
  `Document` nuevo que sigue el flujo normal y el retenido conserva su estado. (asumido)
- **AC-4 (borde · no se reprocesa)** · Dado un documento en `cuarentena_pii`, cuando el
  *worker* sondea la cola, entonces nunca lo toma y `attempts` no cambia. (asumido)
- **AC-5 (invariante · sin valores)** · Dado el documento del AC-1, cuando se leen
  `document.pii_finding_types`, la respuesta de `GET …/documents` y los *logs*, entonces
  solo contienen tipos de hallazgo, nunca "1234567". `[readme §4.2]` `[RN-10]`

> Pendiente de definir en refinamiento (dueño: usuario + Ingeniería · afecta: campo `Document.ocr_status` y un endpoint nuevo): ¿quién resuelve un documento en `cuarentena_pii` o en `requiere_revision_identidad` (descartarlo, reasignarlo al paciente correcto o liberarlo) y con qué endpoint y estado final? Hasta decidirlo, el *workaround* del MVP es que el documento retenido no aporta datos y el oncólogo carga una versión corregida.

## Contexto técnico
Solo lectura y presentación de estados que ya existen en el esquema
(`ocr_status`, `pii_finding_types`). El *worker* filtra por `ocr_status = pendiente`
(US-078). Textos de UI en español, sin términos prescriptivos (regresión de RN-23).
Tests: Supertest (AC-1, AC-2, AC-4, AC-5) y Playwright (AC-1 a AC-3).

## Non-goals
Flujo de resolución o reasignación (V-13, pendiente). Borrado de documentos (solo baja
total o retención, Post-MVP).

## INVEST
**Small** ✓ presentación de dos estados y una regla del *worker*.
**Testable** ✓ cinco tests sobre listado, BD y *logs*.
*(Valuable ⚠ es un *workaround*: protege el caso de datos equivocados sin resolver el documento.)*

---

## US-212 — Descargo el PDF de origen de un dato desde la ficha o la vista de caso

> Linear: [L1D-62](https://linear.app/l1der-lab-mjbc/issue/L1D-62)

`FEAT-01a` · Sprint 3 · Estimación **2** · HU-05 (escenario 1, parte del archivo) · FR-07 (archivo servido sin caché y auditado), FR-18 (registro de la apertura), SEG-02 (RBAC), RN-10 · AC-T1.1 (abrir la fuente de un dato) · ↪ US-076 (`Document` y objeto en `clinical-minio`), US-034, US-211 (guard de sesión) · 🔗 Consumida por: US-090 (AC-2), US-092 (AC-1), US-004 (AC-4), US-080 (visor, `si-hay-capacidad`) · 🔗 Produce para: US-102 (AC-2, verificación de `document.file.read` en el S6) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-15] → US-148 (activa desde S6: descargar no es generación con IA y no responde `403` por opt-out) · 🔗 Regresión [FR-15] → US-204 (Post-MVP)

> **Origen (usuario, 2026-10-07, `01-requisitos.md` §15 "Ajustes al slicing v2"):** se separa de US-080 (visor, `si-hay-capacidad`) para sostener el *workaround* "documento y página con enlace" del recorrido principal.

## Story
Como oncólogo, quiero descargar el PDF del que salió un dato desde la ficha o la vista
de caso, para verificar el valor en el documento original aunque no haya visor
integrado.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local` y `mama-examen.pdf` (FX-01a-a) subido
  para el paciente semilla (a) por US-076, cuando elige el enlace "Documento · pág. 2"
  de un dato y el navegador pide `GET /api/patients/{id}/documents/{docId}/file` a
  `web`, entonces la respuesta es `200` con `Content-Type: application/pdf`,
  `Cache-Control: no-store` y un cuerpo cuyo SHA-256 es igual a `Document.checksum`.
  `[FR-07]` `[AC-T1.1]` `[readme §4.1]`
- **AC-2 (borde · sin sesión)** · Dado un request sin cookie de sesión válida, cuando
  pide el archivo, entonces responde `401` sin bytes del archivo y `clinical-minio`
  registra cero lecturas. `[FR-01]` `[readme §2.5]`
- **AC-3 (borde · permiso denegado)** · Dado `lector@test.local` (FX-T4a-b, rol con solo
  `patients:read`), cuando pide el archivo del AC-1, entonces responde `403` sin bytes y
  `clinical-minio` registra cero lecturas. `[SEG-02]` `[ADR-1]` (asumido: permiso
  `documents:read`)
- **AC-4 (borde · documento de otro paciente)** · Dado un `docId` del paciente semilla
  (b), cuando se pide bajo el `patientId` del paciente (a), entonces responde `404` sin
  bytes y no se escribe ningún registro de auditoría. (asumido)
- **AC-5 (invariante · el navegador solo habla con `web`)** · Dada la descarga del AC-1
  en Playwright contra Compose, cuando se registran las peticiones del navegador y se
  inspeccionan las respuestas, entonces todas van al origen de `web`, ninguna contiene
  una URL prefirmada, un *bucket* ni una clave de objeto de `clinical-minio`, y
  `clinical-minio` no publica puerto al host. `[CLAUDE.md]` `[OL-05]` `[SEG-09]`
- **AC-6 (borde · auditoría sin contenido ni URL)** · Dada la descarga del AC-1, cuando
  se leen `audit.audit_log` con SQL crudo y los logs de `web` y `clinical-api`, entonces
  existe una fila `action = document.file.read`, `entity_type = document`,
  `entity_id = {docId}` con el `user_id` de `doc1` y `metadata` solo con `traceId`,
  `route` y `status`; y ni la fila ni los logs contienen el nombre del archivo, la clave
  de objeto, la URL interna ni bytes del contenido. `[FR-07]` `[FR-18]` `[RN-10]` `[CLAUDE.md]`
- **AC-7 (borde · almacén caído)** · Dado `clinical-minio` no disponible, cuando se pide
  el archivo, entonces responde `503` con `{ error, message }` sin detalles internos ni
  bytes parciales. (asumido)

## Contexto técnico
`GET /platform/patients/{id}/documents/{docId}/file` en el módulo `documents` de
`clinical-api`: valida sesión (guard de US-211/US-044) y permiso, comprueba que el
`Document` pertenece al paciente, abre el objeto en `clinical-minio` por la red interna
y lo reenvía en *streaming*; el Route Handler
`web/app/api/patients/[id]/documents/[docId]/file/route.ts` lo pasa sin almacenarlo.
La fila de auditoría se escribe en la misma petición, antes de enviar el primer byte,
con el `AuditService` mínimo sobre `audit.audit_log` (tabla de US-038); US-102 (S6) lo
generaliza al *middleware* declarativo y verifica esta acción junto con las lecturas
de ficha y vista de caso. Logs solo con `patientId`, `docId` (UUID) y `traceId`.
Tests: Supertest con `clinical-minio` de test y contador de lecturas (AC-1 a AC-4,
AC-6, AC-7) y Playwright contra Compose en perfil de test con FX-01a-a (AC-1, AC-5).

## Non-goals
Visor con página y resaltado (US-080, `si-hay-capacidad`). Descarga de documentos en
`cuarentena_pii` o con identidad distinta: queda como hoy, sin resolución (V-13,
US-081).

## INVEST
**Small** ✓ un endpoint de *streaming* de solo lectura, un Route Handler y una fila de auditoría.
**Testable** ✓ siete tests de integración y E2E sobre status, cabeceras, contadores, BD y logs.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-07 | PRD FR-05: `422` por paciente egresado en la carga (S2) | Slicing adoptado (`01-requisitos.md` §15): ciclo de vida y egreso en Post-MVP | Slicing: el `422` por egresado llega con FEAT-T4b (US-198, Post-MVP); aquí solo regresión |
| P-02 | readme §4.1 `POST …/documents`: `403` sin pertenencia al equipo tratante (Sprint 5+) | Decisión P-02: autorización por paciente fuera del MVP | P-02: solo RBAC; sin `403` por equipo (US-204, Post-MVP) |
| — | readme §4.1 lista `POST …/documents/batch` con `207` sin esquema de respuesta | — | No es conflicto sino vacío: US-077 propone el esquema y lo agrega al spec |
| Slicing v2 | PRD FR-05, FR-07 y §14 S2; AC-01.1 (visor) y AC-01.2 (carga múltiple); readme §5.0 S2 (HU-04, HU-05) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): carga múltiple, visor y UI de cuarentena `si-hay-capacidad` | AC-01.2 (lote) y la parte de visor de AC-01.1 quedan en historias `si-hay-capacidad`; la cola y la carga individual siguen en el S2 |
| Ajuste del 2026-10-07 | PRD FR-07 (Sprint 2) y readme §4.1: el archivo y el visor como una sola capacidad | Decisión del usuario (`01-requisitos.md` §15, "Ajustes al slicing v2"): descarga del PDF de origen en US-212 (S3, recorrido principal), visor en US-080 (`si-hay-capacidad`) | Decisión del usuario: US-212 sirve y audita el archivo en el S3; el visor con resaltado sigue diferido |
