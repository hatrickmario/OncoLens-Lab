## ADDED Requirements

### Requirement: Métrica de no inferencia de datos críticos faltantes
En los casos del dataset con datos críticos faltantes declarados, `evaluate` MUST contar las afirmaciones mostradas que atribuyen un valor a un dato faltante (FR-23), con un juez local acotado en su puerto (RN-12), y SHALL reportar solo el conteo y los ids de caso (RN-14). Sin casos con faltantes SHALL valer `null`, nunca `0`. No fija ninguna meta.

#### Scenario: Cuenta una inferencia cuando la salida atribuye un valor a un dato faltante [US-116 AC-1] [FR-23]
- **GIVEN** un caso sintético de mama con `missingCriticalData = ["ki67"]`, el generador falso con una salida que atribuye un valor a Ki-67 y el juez falso en su puerto
- **WHEN** corre `evaluate` sobre ese caso
- **THEN** la métrica de no inferencia cuenta 1 inferencia y el reporte nombra el id del caso
- **AND** el reporte no contiene el texto de la pregunta, de la salida ni de los fragmentos

#### Scenario: Una salida que describe el dato como desconocido no cuenta [US-116 AC-1] [FR-23]
- **GIVEN** el mismo caso con una salida que describe Ki-67 como «sin dato registrado (desconocido)» y no le atribuye ningún valor
- **WHEN** corre `evaluate` sobre ese caso
- **THEN** la métrica de no inferencia cuenta 0 inferencias

#### Scenario: Sin casos con faltantes la métrica es null [US-116 AC-5] (asumido)
- **GIVEN** un dataset en el que ningún caso declara faltantes
- **WHEN** corre `evaluate`
- **THEN** la métrica de no inferencia vale `null` y figura como «no medida», nunca `0`

#### Scenario: Un veredicto inválido del juez no cuenta como sin inferencia [US-116 AC-1] [ADR-41] (asumido)
- **GIVEN** un caso con un faltante declarado y una respuesta del juez con JSON inválido
- **WHEN** se interpreta el veredicto
- **THEN** el reporte incrementa el contador de veredictos inválidos y ese caso no se cuenta como «sin inferencia»
