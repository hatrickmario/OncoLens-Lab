# Design — l1d-202-listado-busqueda-pacientes

## Contexto

El contrato ya declara `GET /platform/patients`, `POST /platform/patients/search`
(`PatientSearchRequest` con `idType`+`nationalId` o `name`, `minLength: 2`), `PatientPage`,
`PatientListItem` y `PatientAdminSummary` con `x-view-by-permission`. Las máscaras tienen
`x-pending-owner: US-048`. El contexto técnico de la historia preveía descifrar los nombres en
memoria para buscar; P-4 lo sustituye.

## Decisiones

### D1 · Búsqueda por nombre — Decidido en el refinamiento del S2 (P-4, decidido por el usuario el 2026-10-21)

Decisión cara de revertir (esquema y privacidad):

| Opción | A favor | En contra |
|---|---|---|
| **A · Exacta sobre el nombre completo normalizado por índice ciego HMAC** (decidida) | Igual que el documento (ADR-6): ni el nombre ni fragmentos se guardan en claro; búsqueda por igualdad indexada; sin descifrar en lote | Un apellido suelto o un nombre incompleto no encuentra nada; añade la columna `full_name_hmac` |
| B · Parcial descifrando en memoria el conjunto paginable (contexto técnico original) | Encuentra "Rondón" | Descifra todas las identidades en cada búsqueda (contra RN-10 y el mínimo privilegio); coste lineal; difícil de auditar |
| C · Parcial con n-gramas HMAC | Encuentra fragmentos sin descifrar | Los n-gramas filtran estructura del nombre (ataque de frecuencias); más columnas y tablas |

| D · HMAC por token (cada palabra del nombre) | Encuentra "Rondón" sin descifrar | Enlaza a todos los que comparten un apellido: revela vínculos familiares (rechazada por `privacy-guardian` en el Gate 1) |

**Por qué A:** es la única que mantiene RN-10 y el índice ciego sin descifrar en lote; B, C y D
debilitan la protección para una comodidad que el piloto (10 usuarios, búsqueda por documento
disponible) no necesita. `privacy-guardian` la prefiere frente a D. Está **decidida** (`[S2 resp. 4]`): el AC-3 del
backlog con `{ name: "Rondón" }` se actualiza tras la confirmación.

Detalles de A:
- `normalizarNombre(nombre)`: Unicode NFD, quitar marcas diacríticas (Peña → pena, Lucía → lucia),
  minúsculas, `trim`, espacios internos colapsados a uno. Regla pura con unitarios.
- `full_name_hmac = HMAC-SHA256(clave_hmac, "nombre|" + normalizarNombre(full_name))` con la misma
  clave HMAC del documento y separación de dominio por prefijo (D2 de L1D-200); sin secreto nuevo.
- Migración aditiva `full_name_hmac text NULL` + índice no único
  `patient_identity_full_name_hmac_idx`. Es **nullable** porque la migración no puede calcular el HMAC
  (la clave solo vive en la aplicación); `IdentityService.guardar` lo escribe siempre y el seed
  (idempotente) lo completa en las filas sembradas por L1D-200. Un test comprueba que, tras el seed,
  ninguna identidad lo tiene nulo. `docs/architecture/data-model.md` se actualiza en el mismo PR.
- El texto del AC-3 del backlog debe actualizarse tras la confirmación (lo hace la sesión principal;
  este change no edita `backlog/`).

### D2 · Formato de las máscaras (AC-7; lo fija esta historia, propuesto)

- `fullNameMasked`: inicial de cada palabra del nombre en mayúscula seguida de punto, separadas por
  espacio ("Lucía Fernanda Rondón Peña" → "L. F. R. P."). `enmascararNombre()`.
- `nationalIdMasked` (Gate 1): **longitud fija**, que no revela la del documento: cuatro `•`
  (U+2022), un espacio y los 2 últimos caracteres del número normalizado, para todo `id_type`:
  "1234567" → "•••• 67", "SINT-0000001" → "•••• 01". Sin prefijo conservado (el origen ya lo muestra
  `dataOrigin`). Cambia `contracts/examples/patient-summary-admin.json` ("SINT-*****01" →
  "•••• 01"). `enmascararDocumento()`.
- Ambas se calculan en `clinical-api` tras descifrar en memoria solo las filas de la página; nunca se
  cachean ni se registran.

### D3 · Listado

- Orden determinista: `registered_at` descendente y `id` como desempate; `page` desde 1;
  `PATIENTS_PAGE_SIZE` en configuración (RN-22). `total` = filas que cumplen los filtros.
- `pendingReviewCount` = datos clínicos con `review_status = requiere_revision` (recomendación del
  refinamiento del S2 §3.3 para US-051); `missingCriticalCount = 0` hasta el S3/S4 (FEAT-02a, FEAT-04);
  `cancerTypeEnabled` = el `cancer_type` del diagnóstico activo está en `ENABLED_CANCER_TYPES`.
  Contadores en `contadoresDelPaciente()`, compartido con la ficha de L1D-72.
- Sin autorización por paciente (P-02): no se consulta `care_team_member`.

### D4 · Búsqueda

- El cuerpo se valida con el Zod generado de `PatientSearchRequest`; si trae documento y nombre, gana
  el documento (asumido; el contrato admite ambos por `anyOf`).
- Documento: `indiceCiegoDeDocumento()` de L1D-200 e igualdad sobre `(id_type, national_id_hmac)`;
  número parcial → cero resultados. **País emisor:** `PatientSearchRequest` no lo trae y, como fija
  L1D-200 (D2), `issuing_country` **no entra** en el HMAC; si el mismo número existe en dos países, la
  búsqueda devuelve ambas filas.
- Ayuda de la pestaña "Por nombre": "Escribe el nombre completo" (`pacientes.ayudaNombre`), por la
  semántica exacta de D1.
- Error de integridad de la identidad (L1D-200) → `500 ErrorInterno` en las tres operaciones; este
  change lo declara en el contrato (L1D-72 depende de ello para `getPatient`).
- Respuesta `PatientPage` (página 1 con los resultados); `429` por RN-30 queda en el contrato y su
  control llega con su historia (Regresión [RN-30] activa desde S6).

## Privacidad y ownership

- **Fronteras:** navegador → `web` (identidad solo en el **cuerpo** de `POST /api/patients/search`) →
  `clinical-api` (mismo cuerpo). Nada cruza a `rag-orchestrator`, que no toca datos clínicos,
  `identity` ni `clinical-minio`.
- **URL y logs (AC-5):** `GET /platform/patients` solo acepta `status`, `dataOrigin`, `page`; los
  *logs* de acceso de `web` y `clinical-api` registran método, ruta y estado, nunca cuerpos.
- **Identidad (RN-10):** el listado y la búsqueda devuelven solo máscaras; la completa solo en la
  ficha (L1D-72). Este change añade el paso "buscarlo por documento" (y por nombre) al test de
  no-fuga de L1D-200 (`Regresión [RN-10] → US-046`), buscando las mismas formas que el arnés: claro,
  nombre normalizado ("lucia fernanda rondon pena") y los valores de `national_id_hmac` y
  `full_name_hmac`.
- **Caché:** `/pacientes` y toda lectura del BFF con identidad (aunque enmascarada) usan
  `fetch(..., { cache: 'no-store' })` y responden `Cache-Control: no-store` (Route Handlers y página);
  test.
- **Índice ciego del nombre:** permite saber si dos pacientes tienen el mismo nombre normalizado;
  aceptado (mismo nivel que el del documento) y nunca sale de `clinical-api` ni va a `audit`.
- Solo datos sintéticos (RN-13).

### Seguridad web

- Validación: el mismo Zod generado de `PatientSearchRequest` en el formulario y en el Route Handler;
  los filtros del listado con un schema Zod del query (enum cerrado).
- `NEXT_PUBLIC_`: ninguna nueva. `server-only`: Route Handlers y cliente hacia `clinical-api`.
- La búsqueda es `POST` con `verificarOrigen()` y `Content-Type: application/json` (como el login),
  para no dejar la identidad en el historial ni aceptar CSRF.
- Render: valores del contrato como texto (React escapa); sin HTML crudo. `<title>` "Pacientes ·
  OncoLens", sin identidad.
- CSP y cabeceras: sin cambios (US-216, S6). Dependencias nuevas: `Tabs` de shadcn/ui (tras ARR-02
  AC-3); auditoría `npm audit` en el PR.

## Contratos

- **Proveedor:** `clinical-api`; **consumidor:** `web` (SDK y Zod generados).
- **Diff propuesto** (*minor* por las respuestas `500` nuevas; `info.version` **1.9.0**. Orden de
  versiones del S2: L1D-167 → 1.6.0, L1D-171 → 1.7.0, L1D-56 → 1.8.0, L1D-202 → 1.9.0; este change se
  mergea después de L1D-56 y, si el orden cambia, toma la siguiente libre y lo anota en el PR):

  ```diff
   PatientListItem:
     properties:
       nationalIdMasked:
  -      description: Documento enmascarado; ... Pendiente: el formato de la máscara lo fija la historia dueña (US-048).
  -      x-pending-owner: US-048
  +      description: >-
  +        Documento enmascarado de longitud fija: "•••• " seguido de los 2 últimos caracteres
  +        ("•••• 67"); no revela la longitud. El completo solo en la ficha, auditado.
       fullNameMasked:
  -      description: Nombre enmascarado (iniciales o primer nombre); ... (US-048).
  -      x-pending-owner: US-048
  +      description: >-
  +        Iniciales de cada palabra del nombre en mayúscula seguidas de punto ("L. F. R. P."). El
  +        completo solo en la ficha, auditado.
   /platform/patients/search:
     post:
       description: >-
  -      ... la búsqueda por nombre queda con US-048 como dueña ...
  +      ... la búsqueda por nombre es exacta sobre el nombre completo normalizado (sin tildes,
  +      minúsculas, espacios colapsados) por índice ciego; un nombre parcial no encuentra nada.
  +      issuingCountry no participa en la búsqueda por documento.
   getPatient / listPatients / searchPatients:
     responses:
  +    '500':
  +      $ref: '#/components/responses/ErrorInterno'
  ```

- **Ejemplos nuevos** en `contracts/examples/`: `patient-search-name.json` (`{ "name": "Prueba
  Sintética 1" }`) y `patient-page-doctor.json` (una página con `PatientListItem` enmascarado); se actualiza
  `patient-summary-admin.json` a la máscara de longitud fija. Sin
  cambios incompatibles (`contracts:breaking` en verde); compatible con ADR-26.

## Componentes y patrones

- `organisms/BusquedaDePacientes` (`'use client'`: pestañas y formulario), `organisms/TablaDePacientes`
  (RSC), `molecules/FiltrosDePacientes` (enlaces con query, RSC), `molecules/Paginacion` (RSC),
  `molecules/EtiquetaDeOrigen` (reutilizada por la ficha si L1D-72 la necesita). Página
  `app/(dashboard)/pacientes/page.tsx` (RSC) que pide el listado al BFF en el servidor.
- Sin hooks ni providers nuevos (un consumidor cada uno). Ningún componente supera 100 líneas.

## Dependencias y colaboradores

- `src/modules/patients/patients.{controller,service,repository,schema}.ts` (nuevo); el *service*
  recibe `IdentityService`, `PatientsRepository` y la configuración por *factory*.
- Reglas extraídas: `normalizarNombre()`, `enmascararNombre()`, `enmascararDocumento()`,
  `contadoresDelPaciente()`.
- `prisma/migrations/<ts>_identity_full_name_hmac/`, `prisma/schema.prisma`, seed (completa
  `full_name_hmac`), `docs/architecture/data-model.md`.
- `web`: `lib/server/patients.ts`, `app/api/patients/route.ts`, `app/api/patients/search/route.ts`,
  claves `pacientes.*` en `messages/es.json`.

## Tests

Supertest + PostgreSQL real (AC-1…AC-4, AC-6, AC-7) con respuestas validadas contra el spec;
integración con lectura de *logs* (AC-5); Vitest + Testing Library + MSW (UI); Playwright (AC-1)
cuando exista el job de E2E (ARR-02 resto).

## Pendiente de definir

- **P-4:** D1 decidido (usuario, 2026-10-21, `[S2 resp. 4]`); el AC-3 del backlog ya está corregido (nombre completo encuentra, apellido suelto no).
- **Formato de máscaras (D2):** lo fija esta historia; se somete al Gate 1.

## Notas de implementación (clinical-platform)

- **Erratum de la máscara:** el ejemplo del documento `1234567` es `"•••• 67"` (la regla es "los 2 últimos caracteres"),
  no `"•••• 56"` como decían el diseño, la delta y el contrato en su primera versión; corregido en `openapi.yaml` (commit
  `contract(L1D-202)` aparte), en la delta y en las tareas. `SINT-0000001` sigue siendo `"•••• 01"`.
- **Contrato:** `nationalIdMasked` declara `pattern: '^•{4} [A-Za-z0-9]{2}$'` (PatientListItem y PatientAdminSummary). La
  máscara real rellena a la izquierda con `0` si el documento tiene menos de 2 caracteres alfanuméricos y descarta
  los no alfanuméricos. **Pregunta para `privacy-guardian`:** ¿basta el `pattern` (y el Zod generado lo hace cumplir
  también en `web`) o prefiere no declarar el formato en el contrato para no fijar cuántos caracteres se revelan?
- **Ejemplo `patient-page-doctor.json`:** la regla AC-17 vigente (#161) exime solo a `nationalIdMasked`; para
  `fullNameMasked` sigue exigiendo "Prueba Sintética [n]", así que el ejemplo usa `"Prueba Sintética 1"` y no las
  iniciales `"P. S. 1."`. Es un ejemplo no normativo; la máscara real (`"L. F. R. P."`) la prueban los tests. Si se quiere
  que el ejemplo muestre el formato de iniciales, hay que eximir también `fullNameMasked` en la regla (decisión del
  dueño de la regla, no de este change).
- **AC-3 del backlog:** el literal `{ name: "Rondón" }` queda superado por P-4: el nombre completo (otras mayúsculas,
  tildes y espacios) encuentra y un apellido suelto da cero resultados; lo actualiza la sesión principal en `backlog/`.
- **Configuración:** `PATIENTS_PAGE_SIZE` (entero positivo, por defecto 20; `src/config/pacientes.ts`). **Para el
  usuario:** añadirla a `infra/docker/.env.example` (este change no lo toca; el valor por defecto de código basta).
- **Zod generado:** `PatientSearchRequest` se genera como `intersection(unknown, strictObject)`, sin el `anyOf` ni el
  rechazo de campos extra; `patients.schema.ts` añade (a) el rechazo de campos no declarados, (b) el criterio completo
  (documento o nombre) y (c) que el listado rechaza todo parámetro que no sea `status`, `dataOrigin` o `page`.
- **Búsqueda sin descifrar:** `IdentityService.buscarPorDocumento` y `buscarPorNombre` solo comparan índices ciegos; el
  listado descifra únicamente la identidad de las filas de la página (`descifrarVarios`) y, si la página está vacía,
  no llama al servicio.
- **Orden:** `clinical.patient.created_at` descendente y `id` como desempate (el seed comparte `created_at`).
- **Tareas web diferidas:** 2.8 (parte `web`) y 2.9 (`app/api/patients/**`) quedan fuera de los paths asignados a este
  agente (`apps/web/**`); la parte `clinical-api` de 2.8 (logs/URLs, no-fuga, `Cache-Control`) está hecha.
- **`getPatient` (500) y `403`/`429`:** el `500 ErrorInterno` de `getPatient` es contrato adelantado: la ruta y su test los
  entrega L1D-72 (ficha). Un `403` de lista/búsqueda no se puede provocar con los roles sembrados (ambos tienen
  `patients:lookup`) y el `429` queda para su historia (RN-30). Los commits `wip` del contrato no se reescriben (sin
  force): el orden contract → test → feat → refactor se conserva.
