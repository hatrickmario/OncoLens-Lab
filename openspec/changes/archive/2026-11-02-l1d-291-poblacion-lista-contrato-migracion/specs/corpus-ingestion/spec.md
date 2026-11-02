## ADDED Requirements

### Requirement: population_criteria por criterio como lista acotada con procedencia
La migración Alembic `0005`, ejecutada como `rag_corpus_migrator`, MUST dar a `population_criteria` la forma de lista por criterio con procedencia sin perder las filas existentes, SHALL tener `downgrade -1` y MUST NOT crear objetos fuera de `corpus`; el tope por fragmento y criterio sale de `POPULATION_MAX_VALUES_PER_CRITERION` (RN-22, ADR-47); la marca por criterio `{"status": "pendiente", "values": []}` forma parte de la forma nueva.

#### Scenario: La migración 0005 conserva las filas y es reversible [US-241 AC-3] [ADR-47] [RN-05]
- **GIVEN** un schema `corpus` migrado a `0004` con `doc-a1` en la forma antigua de `population_criteria`
- **WHEN** se aplica `alembic upgrade head` (0005) y luego `alembic downgrade -1`
- **THEN** tras el `upgrade` existe la forma nueva por criterio y `doc-a1` conserva su valor
- **AND** tras el `downgrade` el schema y las filas coinciden con los de `0004` y `alembic heads` informa una sola cabeza

#### Scenario: La migración no abre la frontera de rag_corpus [US-241 AC-6] [AC-T4.4] [SEG-06]
- **WHEN** corre la CI con `0005` aplicada con el rol migrador del schema `corpus`
- **THEN** ninguna tabla nueva queda fuera de `corpus` y los tests de *permission denied* del rol `rag_corpus` sobre `auth`, `identity`, `clinical`, `audit` y `research` siguen en verde

Regresión [AC-T4.4] activa desde S2 (US-040): con el rol `rag_corpus`, `SELECT` sobre esos schemas → *permission denied*.
