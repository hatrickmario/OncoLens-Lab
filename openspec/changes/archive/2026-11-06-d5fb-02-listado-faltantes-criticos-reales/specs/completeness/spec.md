# Spec Delta — completeness

## ADDED Requirements

### Requirement: Checklist en lote con la misma regla que el individual
`CompletenessService` MUST ofrecer `calcularVarios(patientIds)` que, para cada paciente, devuelve el mismo `ChecklistDelPaciente` que `calcular(patientId)` o `no_disponible`, usando una consulta por entidad de destino para todos los pacientes (no una por paciente). `calcular(id)` MUST implementarse sobre `calcularVarios([id])` y SHALL conservar el error `PacienteNoEncontradoError` de la ficha y del endpoint. El fallo al calcular un paciente MUST NOT afectar al resultado de los demás.

#### Scenario: El lote es idéntico al cálculo individual para todo el seed [feedback Demo 5] [FR-23]
- **GIVEN** el seed sintético completo y el catálogo real
- **WHEN** se calcula `calcularVarios` con todos los pacientes y `calcular` con cada uno
- **THEN** el checklist de cada paciente es igual en ambos caminos (ítems, estados, origen, procedencia, destino y condición)

#### Scenario: Un paciente que falla no afecta a los demás [RN-26]
- **GIVEN** un lote con un paciente cuyo cálculo lanza
- **WHEN** se llama a `calcularVarios`
- **THEN** ese paciente es `no_disponible` y los demás traen su checklist

#### Scenario: El número de consultas no depende del número de pacientes [feedback Demo 5]
- **GIVEN** un contador de consultas sobre la BD de test
- **WHEN** se calcula el lote para 1 y para N pacientes
- **THEN** el número de consultas es el mismo
