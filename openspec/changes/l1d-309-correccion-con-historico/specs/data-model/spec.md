## ADDED Requirements

### Requirement: supersedes_id enlaza cada corrección con la fila que reemplaza
`clinical.biomarker`, `clinical.exam` y `clinical.clinical_note` MUST tener `supersedes_id uuid NULL` con FK restrictiva a la misma tabla y un índice único parcial (`WHERE supersedes_id IS NOT NULL`), creados por una migración aditiva y documentados en `docs/architecture/data-model.md` (ADR-50). Las filas existentes SHALL quedar con `supersedes_id = null`.

#### Scenario: La migración añade la columna sin tocar las filas existentes [US-253 AC-1] [ADR-50]
- **GIVEN** la base de test con el seed sintético aplicado antes de la migración
- **WHEN** se aplica la migración
- **THEN** las tres tablas tienen `supersedes_id` nullable con FK a su propia `id`, todas las filas previas tienen `supersedes_id = null` y el número de filas no cambia

#### Scenario: Una fila no puede ser reemplazada dos veces [US-253 AC-1] [RN-08] (Decidido (usuario, 2026-11-03): D2 del design, `[S5 resp. 13]`)
- **GIVEN** un biomarcador `B2` con `supersedes_id = B1`
- **WHEN** se intenta insertar otro biomarcador con `supersedes_id = B1`
- **THEN** PostgreSQL rechaza el `INSERT` por el índice único parcial

#### Scenario: supersedes_id no admite una fila inexistente [US-253 AC-1] (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`)
- **WHEN** se inserta una nota con `supersedes_id` que no existe en `clinical.clinical_note`
- **THEN** PostgreSQL rechaza el `INSERT` por la FK
