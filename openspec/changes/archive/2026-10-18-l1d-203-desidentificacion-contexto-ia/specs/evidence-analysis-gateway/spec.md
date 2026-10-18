## REMOVED Requirements

### Requirement: El desidentificador provisional falla cerrado fuera de datos sintéticos
**Reason**: Requisito transitorio de L1D-103 (`[S1 resp. 14d]`), válido solo mientras existía el adaptador provisional de `ContextDeidentifier`; este change lo sustituye por el definitivo.
**Migration**: El fallo cerrado de la desidentificación pasa a "La desidentificación falla cerrada" de la capacidad `deidentification` (`503 DESIDENTIFICACION_NO_DISPONIBLE`). La guarda `exigirEntornoSintetico()` (`APP_ENV ∈ {local, test}` y `data_origin = sintetico`, `502 ERROR_SERVICIO_IA`) se conserva con el mismo comportamiento como "La guarda de entorno sintético se conserva hasta G-Piloto" de `deidentification` y la retira US-143; sus tests se mueven con ella, sin `Test-Removal:`. Este delta exige que l1d-103 esté archivado antes que l1d-203.
