## ADDED Requirements

### Requirement: Anclas con foco en las secciones existentes de la ficha
Los encabezados `h2` de las secciones de diagnóstico y biomarcadores de la ficha MUST llevar `id="diagnostico"` y `id="biomarcadores"` con `tabindex="-1"`, y MUST recibir el foco al llegar con ese fragmento en la URL; MUST NOT crearse secciones nuevas. El componente que da el foco MUST aceptar solo los fragmentos de la lista permitida `{diagnostico, biomarcadores}` y resolverlos con `getElementById`; MUST NOT usar `querySelector` ni ningún selector armado con `location.hash` en crudo.

#### Scenario: El encabezado de destino recibe el foco [US-005 AC-3] [US-005 AC-7] [NFR-12] [S4 resp. 14]
- **GIVEN** la ficha de un paciente
- **WHEN** se abre `/pacientes/{id}#biomarcadores` (y, en otra prueba, `#diagnostico`)
- **THEN** el `h2` con ese `id` y `tabindex="-1"` es el elemento enfocado
- **AND** la ficha no tiene secciones nuevas respecto de la existente

#### Scenario: Un fragmento fuera de la lista permitida no mueve el foco [US-005 AC-3] [privacy Gate 1]
- **GIVEN** la ficha de un paciente
- **WHEN** se abre `/pacientes/{id}#x"],img` (o cualquier fragmento distinto de `diagnostico` y `biomarcadores`)
- **THEN** no se lanza ningún error, no se llama a `querySelector` y el foco no se mueve a ningún elemento por el fragmento

### Requirement: La ficha avisa si no se pudieron verificar los datos críticos
Si `PatientSummary.completenessAvailable` es `false`, la ficha MUST mostrar el aviso no bloqueante «No se pudieron verificar los datos críticos» con `role="status"` y MUST NOT mostrar un contador `0` ni «sin faltantes». El aviso SHALL NOT deshabilitar ni ocultar ninguna acción ni sección de la ficha (RN-26). Ausente o `true`, no se muestra (decisión Q2, usuario, 2026-10-30).

#### Scenario: Con el checklist no disponible la ficha muestra el aviso y no un cero [US-003 AC-2] [US-005 AC-5] [RN-26] (decisión Q2, 2026-10-30)
- **GIVEN** la ficha de un paciente cuyo `PatientSummary` es `contracts/examples/patient-summary-checklist-no-disponible.json` (`completenessAvailable = false`, `missingCriticalCount = 0`)
- **WHEN** el oncólogo abre `/pacientes/{id}`
- **THEN** se lee «No se pudieron verificar los datos críticos» en una región `role="status"`
- **AND** no aparece «0» como contador de faltantes ni «sin faltantes»
- **AND** las secciones y acciones de la ficha siguen disponibles, incluido el enlace al análisis

#### Scenario: Con el checklist disponible la ficha no muestra el aviso [US-003 AC-2] (decisión Q2, 2026-10-30)
- **GIVEN** la ficha de un paciente cuyo `PatientSummary` es `contracts/examples/patient-summary-doctor.json` (`completenessAvailable` ausente)
- **WHEN** el oncólogo abre `/pacientes/{id}`
- **THEN** no aparece «No se pudieron verificar los datos críticos»
