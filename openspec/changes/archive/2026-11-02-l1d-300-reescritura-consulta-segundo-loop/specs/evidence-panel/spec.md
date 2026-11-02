## ADDED Requirements

### Requirement: La Base muestra que la búsqueda se repitió con reformulación
Con `analysisBasis.sourcesConsulted.queryRewritten = true` y `status = con_evidencia`, el resumen visible de la Base del análisis MUST mostrar, sin expandir, bajo «Qué se buscó» el texto exacto de la clave i18n `evidence.base.reescrituraAplicada` (literal en el escenario y en design.md D8); con `false` SHALL NOT mostrarlo y el resumen de `con_evidencia` no cambia. La consulta reformulada nunca se muestra (decisión D-d, 2026-10-30).

#### Scenario: El rescate por reescritura se lee en «Qué se buscó» [US-238 AC-7] [FR-27]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-reescritura.json` servida al panel con MSW
- **WHEN** se renderiza el panel
- **THEN** sin expandir, bajo «Qué se buscó», se lee «La búsqueda se repitió con una reformulación de la pregunta con términos del catálogo; la relevancia se calculó contra la pregunta original»
- **AND** la pregunta mostrada es la original

#### Scenario: Sin rescate no aparece el texto de reformulación [US-238 AC-2] [FR-27]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s1.json` (`queryRewritten = false`)
- **WHEN** se renderiza el panel
- **THEN** no se lee «La búsqueda se repitió con una reformulación»
