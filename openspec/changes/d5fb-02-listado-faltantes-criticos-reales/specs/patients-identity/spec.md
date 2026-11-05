# Spec Delta — patients-identity

## RENAMED Requirements
- FROM: `### Requirement: El listado y la búsqueda no calculan el checklist en el S4`
- TO: `### Requirement: El listado y la búsqueda muestran los faltantes críticos reales`

## MODIFIED Requirements

### Requirement: El listado y la búsqueda muestran los faltantes críticos reales
El listado y la búsqueda de pacientes MUST calcular `missingCriticalCount` de cada `PatientListItem` con el mismo `CompletenessService` que la ficha (número de ítems en `faltante`), en lote para la página y sin consultas por fila (el número de consultas MUST NOT depender del tamaño de página). Con tipo de cáncer no habilitado o sin diagnóstico activo el contador SHALL ser `0` con `completenessAvailable` ausente o `true`. Si el checklist de un paciente no puede calcularse, su fila MUST llevar `missingCriticalCount = 0` y `completenessAvailable = false`, y la respuesta SHALL seguir siendo `200` (RN-26). La vista del `admin` MUST NOT invocar el servicio de completitud (PRD v1.4 §11).

#### Scenario: El listado muestra faltantes reales de pacientes del seed [feedback Demo 5] [FR-23] [FR-02]
- **GIVEN** el seed sintético, el catálogo real, `ENABLED_CANCER_TYPES` en `mama,prostata` y en solo `mama`, y un doctor con sesión `clinical:read`
- **WHEN** llama a `GET /platform/patients`
- **THEN** al menos dos pacientes traen `missingCriticalCount > 0`
- **AND** con `mama,prostata` los pacientes de próstata traen contadores reales; con solo `mama` traen `0` y `cancerTypeEnabled = false`
- **AND** el contador de cada fila es igual a `faltantesDe(calcular(id)).length` de la ficha del mismo paciente

#### Scenario: La búsqueda devuelve el mismo contador que el listado [feedback Demo 5] [FR-02]
- **GIVEN** un paciente con faltantes y el doctor con sesión
- **WHEN** lo busca por documento
- **THEN** su `PatientListItem` trae el mismo `missingCriticalCount` que en el listado

#### Scenario: Las consultas del listado no crecen con la página [feedback Demo 5] [NFR listado p95 ≤ 1 s]
- **GIVEN** un contador de consultas sobre la BD de test y páginas de 1 y de N pacientes
- **WHEN** se llama al listado con cada tamaño
- **THEN** el número de consultas de completitud es el mismo en ambos casos

#### Scenario: Un fallo del cálculo no bloquea el listado [RN-26] [feedback Demo 5]
- **GIVEN** un `CompletenessService` que no puede calcular a uno de los pacientes de la página
- **WHEN** el doctor llama al listado
- **THEN** responde `200` con la página completa
- **AND** la fila de ese paciente trae `missingCriticalCount = 0` y `completenessAvailable = false`
- **AND** las demás filas traen su contador real

#### Scenario: Si falla el lote entero todas las filas quedan «no disponible» [RN-26]
- **GIVEN** un lote de completitud que lanza
- **WHEN** el doctor llama al listado o a la búsqueda
- **THEN** responde `200` y todas las filas traen `missingCriticalCount = 0` y `completenessAvailable = false`
- **AND** el log contiene `checklist_no_disponible` con `traceId` y sin identidad, valores clínicos ni el error de `pg`

#### Scenario: Tipo no habilitado o sin diagnóstico no es un fallo [FR-23]
- **GIVEN** un paciente de próstata con `ENABLED_CANCER_TYPES=mama` (`cancerTypeEnabled = false`) y otro sin diagnóstico activo
- **WHEN** el doctor llama al listado
- **THEN** ambas filas traen `missingCriticalCount = 0` sin `completenessAvailable = false`

#### Scenario: El listado no invoca el servicio de completitud [US-003 AC-2] [RN-26] (decisión Q2, 2026-10-30)
El escenario original (nunca invocar el servicio) queda acotado a la vista del `admin`: el feedback de la Demo 5 (2026-11-05) levanta la decisión Q2 para el doctor.
- **GIVEN** un `admin` con sesión y un fake de completitud que cuenta invocaciones
- **WHEN** llama al listado y a la búsqueda
- **THEN** los elementos son `PatientAdminSummary` sin `missingCriticalCount`
- **AND** el fake no se invoca

#### Scenario: La celda del listado distingue 0 de «no disponible» [feedback Demo 5] [RN-26]
- **GIVEN** la tabla del listado con una fila `missingCriticalCount = 3`, otra `0`, otra con `cancerTypeEnabled = false` y otra `completenessAvailable = false` (MSW desde `contracts/examples/`)
- **WHEN** se renderiza
- **THEN** muestran «3», «0», «—» y «No disponible» como texto
- **AND** ninguna celda bloquea el acceso a la ficha
