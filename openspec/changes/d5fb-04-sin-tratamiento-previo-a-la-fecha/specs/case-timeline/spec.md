## ADDED Requirements

### Requirement: La sección de tratamientos distingue «ninguno declarado» de «sin datos»
La vista de caso y la ficha MUST mostrar, sin tratamientos previos y con una declaración `sin_tratamiento_previo` vigente, «Sin tratamiento previo a la fecha» con la fecha relativa y el origen de la declaración; sin declaración, el texto «Sin datos». La declaración NO SHALL aparecer como fila de la tabla, línea de tiempo ni línea de tratamiento.

#### Scenario: Declaración vigente sin tratamientos [FR-07] [AC-T1.1]
- **GIVEN** el paciente (g) con la declaración vigente
- **WHEN** se abre la vista de caso
- **THEN** la sección de tratamientos muestra «Sin tratamiento previo a la fecha» con su origen «Registro manual» y la columna «Datos críticos» lo muestra presente

#### Scenario: Sin declaración se mantiene «Sin datos» [AC-04.1]
- **GIVEN** el paciente (g) sin declaración
- **WHEN** se abre la vista de caso
- **THEN** la sección muestra «Sin datos» y el ítem «Faltante»
