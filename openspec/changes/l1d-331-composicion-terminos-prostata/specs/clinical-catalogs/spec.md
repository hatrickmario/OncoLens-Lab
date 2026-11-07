## ADDED Requirements

### Requirement: El léxico declara los biomarcadores que no anclan la consulta contextual
`lenguaje/marcos-de-pregunta.json` SHALL admitir la sección opcional `expansion.biomarcadoresNoAnclables`, un objeto
tipo de cáncer -> lista no vacía, sin duplicados, de nombres normalizados de biomarcador. El validador MUST rechazar una
lista vacía, una entrada vacía, duplicada o sin normalizar, y la versión del léxico y del manifest MUST subir (RN-29).

#### Scenario: El validador acepta la sección y rechaza una mal formada [US-273 AC-4] [RN-29]
- **GIVEN** el léxico real con `expansion.biomarcadoresNoAnclables.prostata = ["psa"]` y copias con una lista vacía y con una entrada duplicada
- **WHEN** corre `catalog:validate`
- **THEN** el real pasa y cada copia falla nombrando el campo

#### Scenario: El guardián exige subir las versiones [US-273 AC-4] [RN-29]
- **GIVEN** el catálogo con `manifest.version` 1.9.0 y `marcos-de-pregunta` 1.8.0 frente a 1.8.0 y 1.7.0 en `main`
- **WHEN** corre `catalog:version-guard`
- **THEN** pasa, y el AC-8 de US-271 (0 genéricas en las 24 con tema y las 69 de `s5`; las 22, genéricas) se mantiene
