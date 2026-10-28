# Spec Delta — evidence-panel

## ADDED Requirements

### Requirement: Metadatos factuales de la fuente visibles en la cita
Al expandir una cita, el panel MUST mostrar, además de los metadatos del S1, la fase del ensayo (`trialPhase`), el endpoint principal (`primaryEndpoint`), el tamaño de muestra (`sampleSize`) y la versión de la guía (`guidelineVersion`), cada uno con su rótulo. Un campo `null` MUST mostrarse como "No disponible", sin omitir la fila ni rellenar el valor (RN-25). Un valor presente se muestra tal cual llega, como texto.

#### Scenario: El endpoint y el tamaño de muestra ausentes se muestran como "No disponible" [US-127 AC-3] [RN-25]
- **GIVEN** el stack Compose con seed sintético y `LLM_PROVIDER=fake`, cuyo análisis devuelve una cita de `doc-a3` con `primaryEndpoint = null` y `sampleSize = null`
- **WHEN** el oncólogo expande esa cita en `/pacientes/[id]/analisis`
- **THEN** las filas "Endpoint principal" y "Tamaño de muestra" están presentes y muestran "No disponible"
- **AND** esos rótulos "No disponible" no llevan `data-origen="corpus"`

#### Scenario: Los metadatos presentes se muestran con el valor del contrato [US-127 AC-1] [RN-25]
- **GIVEN** una respuesta de `contracts/examples/` cuya cita trae `trialPhase`, `primaryEndpoint`, `sampleSize` y `guidelineVersion` no nulos
- **WHEN** se expande el chip de la cita
- **THEN** cada fila muestra el valor del campo del ejemplo, renderizado como texto (sin HTML)
