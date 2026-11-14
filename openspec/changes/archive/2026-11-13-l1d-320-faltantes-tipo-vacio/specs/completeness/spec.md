## ADDED Requirements

### Requirement: Cada ítem del checklist clasifica su vacío con un gapType determinista

`clinical-api` SHALL calcular un `gapType` por ítem con la regla pura `clasificarVacio`: `null` si no hay vacío; `por_conciliar` con un registro vigente en conflicto (también sobre un dato `presente_verificado`, RN-08); `incompleto`, `no_buscado` o `no_encontrado` según los escenarios. Prioridad MUST: `por_conciliar` > `incompleto` > `no_buscado` > `no_encontrado`; el `status` MUST NOT cambiar.

#### Scenario: P-CHAT recibe un tipo de vacío por ítem

- **GIVEN** el paciente sintético `P-CHAT` (FX-12-b) y el catálogo de test `datos-criticos` 1.6.0 (FX-12-c)
- **WHEN** un doctor con sesión válida consulta `GET /platform/patients/{id}/completeness`
- **THEN** Ki-67 tiene `gapType = "no_buscado"`, estado menopáusico `"no_encontrado"`, RE `"incompleto"` y TNM `"por_conciliar"`
- **AND** cada ítem `presente_verificado` sin conflicto pendiente tiene `gapType = null`; TNM sigue `presente_verificado` y su `gapType` es `por_conciliar` (RN-08)
- **AND** la respuesta es válida contra `apps/clinical-api/openapi.yaml` [US-263 AC-2] [AC-04.1] [S6 resp. 10]

### Requirement: Solo un documento procesado cuenta como búsqueda

Un ítem sin registros SHALL ser `no_encontrado` solo si el paciente tiene un documento de un tipo de `sourceDocumentTypes` con `ocr_status = completado`; en otro caso SHALL ser `no_buscado`.

#### Scenario: Un documento no procesado no cuenta como búsqueda

- **GIVEN** `P-CHAT` con `D-EX-1` (`document_type = examen`, `ocr_status = error`) y ningún `examen` con `ocr_status = completado`
- **WHEN** se clasifica Ki-67, cuyo `sourceDocumentTypes` es `["examen"]`
- **THEN** su `gapType` es `"no_buscado"` [US-263 AC-3] [S6 resp. 10]

### Requirement: El gapType es coherente con el estado del checklist

Para cualquier paciente, cada ítem con `gapType` no nulo SHALL aparecer una sola vez en el checklist, ningún ítem `no_aplica` MUST tener `gapType`, y el `gapType` que se envía al chat MUST ser el mismo que devuelve `/completeness`.

#### Scenario: Pacientes semilla con faltantes y sin verificar clasificados sin duplicados

- **GIVEN** cada paciente semilla de FX-12-a, `P-CHAT` (FX-12-b, creado por l1d-315) y el catálogo 1.6.0
- **WHEN** se compara `/completeness` con el `completeness[]` que `clinical-api` envía a `/chat/turn` (capturado con MSW) al preguntar «¿Qué información falta?»
- **THEN** cada ítem con `gapType` no nulo aparece una sola vez y su `gapType` es el mismo en `/completeness` y en `completeness[]`
- **AND** cada ítem `presente_sin_verificar` sin conflicto vigente tiene `gapType = "incompleto"` y, con un registro vigente en `requiere_revision` con `conflicts_with_id`, `gapType = "por_conciliar"`
- **AND** cada ítem `faltante` con menos registros vigentes que `minValues` (y al menos uno) tiene `gapType = "incompleto"`, y sin registros, `"no_buscado"` o `"no_encontrado"`
- **AND** un ítem `presente_verificado` solo puede tener `gapType = "por_conciliar"` (conflicto pendiente, RN-08) o `null`
- **AND** ningún ítem `no_aplica` tiene `gapType` ni genera un bloque `faltante` [US-263 AC-5] [AC-04.1] [S6 resp. 17]
