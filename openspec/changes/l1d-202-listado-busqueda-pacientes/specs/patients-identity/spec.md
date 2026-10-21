## ADDED Requirements

### Requirement: Listado paginado de pacientes con filtros sin identidad
`GET /platform/patients` MUST exigir sesión y `patients:lookup`, SHALL aceptar solo los filtros `status`, `dataOrigin` y `page`, y devolver `PatientPage` paginado por `PATIENTS_PAGE_SIZE` (configuración, RN-22) en orden determinista, con cada elemento en la vista de su permiso (`PatientListItem` con `clinical:read`, `PatientAdminSummary` sin él). La página `/pacientes` de `web` SHALL mostrar "SINTÉTICO" en todo paciente con `dataOrigin = sintetico`.

#### Scenario: El doctor ve el listado paginado del seed con la etiqueta SINTÉTICO [US-048 AC-1] [HU-06] [FR-02]
- **GIVEN** el seed sintético y `doc1@test.local` con sesión, con `PATIENTS_PAGE_SIZE = 3` en la configuración de test
- **WHEN** abre `/pacientes` y `web` pide `GET /platform/patients?page=1`
- **THEN** la respuesta es `200` `PatientPage` validada contra el spec, con `pageSize = 3`, `total = 5` y 3 elementos `PatientListItem` con `dataOrigin` y `lifecycleStatus`
- **AND** la tabla muestra "SINTÉTICO" en cada fila y "Página 1 de 2"

#### Scenario: Los filtros del listado restringen por origen y estado [US-048 AC-4] [FR-02]
- **GIVEN** el seed sintético
- **WHEN** se pide `GET /platform/patients?dataOrigin=real_identificado` y luego `GET /platform/patients?status=activo`
- **THEN** la primera lista está vacía (`total = 0`) y la segunda contiene los cinco pacientes semilla

#### Scenario: Un filtro fuera del enum responde 422 [US-048 AC-4] (asumido)
- **WHEN** se pide `GET /platform/patients?status=borrado`
- **THEN** responde `422` `ErrorCuerpoInvalido` sin eco del valor

#### Scenario: Sin sesión el listado responde 401 sin datos [US-048 AC-6] [FR-01]
- **WHEN** se pide `GET /platform/patients` sin cookie de sesión
- **THEN** responde `401 NO_AUTENTICADO` y el cuerpo no contiene ningún dato de paciente
- **AND** en `web`, abrir `/pacientes` sin sesión lleva a `/login` sin renderizar la tabla

### Requirement: Búsqueda exacta por documento con la identidad en el cuerpo
`POST /platform/patients/search` con `idType` y `nationalId` MUST calcular el índice ciego del documento recibido y buscar por igualdad; un número parcial MUST NOT encontrar nada. La identidad SHALL viajar solo en el cuerpo y no se restringe por equipo tratante (P-02).

#### Scenario: El documento exacto encuentra al paciente y el parcial no encuentra nada [US-048 AC-2] [FR-02] [ADR-6]
- **GIVEN** FX-T4a-a registrado con `IdentityService`
- **WHEN** se busca con `POST /platform/patients/search` y `{ idType: "cedula_ciudadania", nationalId: "52123456" }`
- **THEN** la respuesta `200` contiene exactamente ese paciente, enmascarado
- **AND** con `nationalId = "5212345"` la respuesta contiene cero resultados

#### Scenario: El país emisor no participa en la búsqueda por documento [US-048 AC-2] [ADR-6] (Gate 1)
- **GIVEN** FX-T4a-a registrado con `issuing_country = CO`
- **WHEN** se busca con `{ idType: "cedula_ciudadania", nationalId: "52123456" }` (sin país, como permite `PatientSearchRequest`)
- **THEN** la respuesta contiene a FX-T4a-a; el índice se calcula sin `issuing_country`, como fija L1D-200

### Requirement: Búsqueda por nombre exacta sobre el nombre normalizado
Propuesto en el refinamiento del S2 (P-4, pendiente de confirmación): `POST /platform/patients/search` con `name` MUST buscar por igualdad del índice ciego del nombre completo normalizado (Unicode sin marcas diacríticas, minúsculas, espacios colapsados), sin descifrar identidades para comparar y sin restringir por equipo tratante (P-02); un nombre parcial MUST NOT encontrar nada.

#### Scenario: El nombre completo con otras tildes, mayúsculas y espacios encuentra al paciente [US-048 AC-3] [FR-02] [P-02] (asumido en la semántica de coincidencia; P-4 pendiente de confirmación)
- **GIVEN** FX-T4a-a ("Lucía Fernanda Rondón Peña") registrado
- **WHEN** se busca con `{ name: "LUCIA  fernanda rondon PEÑA" }`
- **THEN** el resultado contiene a FX-T4a-a, sin consultar `clinical.care_team_member`

#### Scenario: Un apellido suelto no encuentra al paciente [US-048 AC-3] (asumido; P-4 pendiente de confirmación)
- **GIVEN** FX-T4a-a registrado
- **WHEN** se busca con `{ name: "Rondón" }`
- **THEN** la respuesta `200` contiene cero resultados y la UI muestra "No hay pacientes con ese nombre."

#### Scenario: La pestaña Por nombre pide el nombre completo [US-048 AC-3] [S2-02] (Gate 1)
- **WHEN** el doctor abre la pestaña "Por nombre" en `/pacientes`
- **THEN** el campo muestra la ayuda "Escribe el nombre completo", asociada con `aria-describedby`

#### Scenario: La búsqueda por nombre no descifra identidades para comparar [US-048 AC-3] [RN-10] (asumido)
- **GIVEN** el seed con cinco identidades
- **WHEN** se busca un nombre que no existe
- **THEN** `IdentityService.descifrar` no se invoca (contador del puerto real instrumentado en el test) y la respuesta tiene cero resultados

### Requirement: La identidad no aparece en URLs ni en logs de acceso
Las rutas de listado MUST NOT aceptar identidad en la URL ni en cabeceras, y los *logs* de acceso de `web` y `clinical-api` MUST NOT registrar cuerpos de petición.

#### Scenario: Tras buscar por documento ninguna URL ni log contiene la identidad [US-048 AC-5] [RN-10] [NFR-11] [Pre-S1 resp. 22]
- **GIVEN** la búsqueda del AC-2 hecha desde `/pacientes` en `web`
- **WHEN** se leen los *logs* de acceso de `web` y `clinical-api` y las URLs pedidas
- **THEN** ninguna contiene `52123456`, `Lucía`, `Rondón`, "lucia fernanda rondon pena" ni los valores de `national_id_hmac` o `full_name_hmac` de FX-T4a-a
- **AND** el test de no-fuga de L1D-200 gana el paso "buscarlo por documento y por nombre" y sigue sin encontrar esas formas (`Regresión [RN-10] → US-046`)

#### Scenario: Las respuestas con identidad no se cachean [US-048 AC-5] [RN-10] (Gate 1)
- **WHEN** se piden `/pacientes`, `GET /api/patients` y `POST /api/patients/search` con sesión
- **THEN** cada respuesta de `web` lleva `Cache-Control: no-store` y las lecturas del BFF hacia `clinical-api` se hacen con `cache: 'no-store'`

### Requirement: Error de integridad declarado en las operaciones de pacientes
`getPatient`, `listPatients` y `searchPatients` MUST declarar `500 ErrorInterno` en `apps/clinical-api/openapi.yaml` (cambio *minor*, `info.version` 1.9.0) y, ante `IDENTITY_INTEGRITY_ERROR`, SHALL responder ese cuerpo genérico sin datos del paciente.

#### Scenario: Una identidad alterada en la página da 500 genérico en el listado [US-046 AC-3] [US-048 AC-7] (Gate 1)
- **GIVEN** FX-T4a-a con `full_name_ciphertext` alterado en un byte con SQL crudo
- **WHEN** se pide `GET /platform/patients`
- **THEN** responde `500 ErrorInterno` validado contra el spec, sin `52123456`, `Lucía` ni `Rondón`

#### Scenario: La búsqueda de web rechaza un Origin ajeno [US-048 AC-5] [SEG-01] (asumido)
- **WHEN** llega `POST /api/patients/search` con `Origin: https://evil.example`
- **THEN** `web` responde `403 PERMISO_DENEGADO` sin llamar a `clinical-api`

### Requirement: Identidad enmascarada en el listado y la búsqueda
Cada fila del listado y de la búsqueda MUST devolver `fullNameMasked` como las iniciales de cada palabra en mayúscula seguidas de punto y `nationalIdMasked` de longitud fija, "•••• " seguido de los 2 últimos caracteres, que no revela la longitud del documento; nunca el valor en claro. La identidad completa SHALL aparecer solo en la ficha, con auditoría.

#### Scenario: FX-T4a-a sale enmascarado con el formato fijado [US-048 AC-7] [Pre-S1 resp. 36] [Pre-S1 resp. 42] [Pre-S1 trazabilidad M-1]
- **GIVEN** FX-T4a-a registrado
- **WHEN** aparece en el listado o en la búsqueda
- **THEN** su fila trae `fullNameMasked = "L. F. R. P."` y `nationalIdMasked = "•••• 56"`, y el cuerpo de la respuesta no contiene `52123456`, `Lucía` ni `Rondón`

#### Scenario: La máscara no revela la longitud del documento [US-048 AC-7] (Gate 1)
- **GIVEN** el paciente semilla con documento `SINT-0000001` y FX-T4a-a con `52123456`
- **WHEN** aparecen en el listado
- **THEN** sus máscaras son `"•••• 01"` y `"•••• 56"`, de la misma longitud

#### Scenario: El admin recibe la vista sin datos clínicos en el listado [US-048 AC-7] [Pre-S1 resp. 27]
- **GIVEN** `admin@test.local` con sesión
- **WHEN** pide `GET /platform/patients`
- **THEN** cada elemento es `PatientAdminSummary` (sin `pendingReviewCount`, `missingCriticalCount` ni `fullNameMasked`), validado contra el spec
