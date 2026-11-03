# ADR-50 — Una corrección manual crea una fila nueva y la anterior queda `reemplazado`, enlazadas por `supersedes_id`

> Linear: [L1D-309](https://linear.app/l1der-lab-mjbc/issue/L1D-309) · Historia: US-253 · Feature: FEAT-03b
> Plantilla: MADR 4 (variante mínima, en español).

- **Estado:** aceptado
- **Fecha:** 2026-11-03
- **Decisores:** usuario (PO), refinamiento del S5 `[S5 resp. 2]`
- **Consultados / informados:** sesión principal (`/sprint-refine S5`); `clinical-platform-dev`, `privacy-guardian` y `contract-keeper` al implementar
- **Requisitos:** RN-05, RN-07, RN-08, RN-10, RN-11, FR-23, AC-04.1, PRD E-17

## Contexto y problema

Sin OCR en el MVP (PRD E-17), el oncólogo construye el caso a mano y necesita **corregir** biomarcadores, exámenes y notas clínicas ya registrados (US-253). RN-08 exige que un dato nunca se sobrescriba en silencio y que el anterior quede como histórico enlazado. `Diagnosis` ya resuelve la corrección creando una fila `manual_correction` y pasando la anterior a `reemplazado` con `is_active = false` (US-110 AC-2), pero `Biomarker`, `Exam` y `ClinicalNote` no tienen cómo enlazar la versión anterior. Los `AIAnalysisRecord` guardan la huella del contexto que usaron; si la fila leída cambia de valor, el análisis previo deja de ser trazable.

## Factores de decisión

- RN-08 y RN-05: nada se sobrescribe ni se borra.
- Trazabilidad de los análisis guardados (RN-06): lo que leyó un análisis no cambia después.
- Un solo patrón de histórico para todo dato clínico (agentes que mantienen el código).
- Los *logs* y la auditoría nunca guardan PHI (`CLAUDE.md`); la auditoría completa llega en el S6 (US-150).
- Coste en un sprint de 3 días: migración aditiva, sin cambio incompatible de contrato (ADR-26).

## Opciones consideradas

1. **Fila nueva** `entry_method = manual_correction` + la anterior a `review_status = reemplazado` (y `is_active = false` donde exista) + columna nullable `supersedes_id` en la nueva.
2. `UPDATE` en el sitio + tabla `clinical.data_version` con instantánea JSON de la versión anterior.
3. `UPDATE` en el sitio + histórico en `AuditLog`.

## Decisión

Opción elegida: **1**, porque es el mismo patrón que `Diagnosis`, no altera la fila que leyó un análisis previo (la huella del contexto cambia sola al haber una fila vigente nueva) y las lecturas ya excluyen `reemplazado` (RN-07).

### Consecuencias

- **Positivas:** un solo concepto de histórico; trazabilidad de análisis intacta; migración aditiva (`supersedes_id uuid NULL REFERENCES … (id)` en `clinical.biomarker`, `clinical.exam` y `clinical.clinical_note`); el histórico se lee siguiendo `supersedes_id`.
- **Negativas:** las lecturas «vigentes» deben filtrar siempre `reemplazado` (ya es regla); una corrección de un `Biomarker` crea también su `Exam` de registro o reutiliza el existente — se decide en el `design.md` de US-253 sin cambiar este ADR.
- **Configuración (RN-22):** ninguna.

### Confirmación

- Tests de integración de US-253 (Supertest + PostgreSQL real): AC-1/AC-2 comprueban fila nueva, anterior `reemplazado` y enlace `supersedes_id`; ningún `UPDATE` cambia `value`/`content` de una fila existente.
- `docs/architecture/data-model.md` y la migración Prisma se actualizan en la tarea `## contratos` de US-253; `contract-keeper` verifica el cambio aditivo en el Gate 2.
- `privacy-guardian`: la nota corregida pasa por el detector de PII antes de la IA (ADR-40) y nada del histórico llega a *logs*.

## Pros y contras de las opciones

### 1 · Fila nueva + `supersedes_id`

- A favor: RN-08 por construcción; coherente con `Diagnosis`; análisis previos intactos.
- En contra: una columna más por tabla; leer el histórico es una cadena.

### 2 · `UPDATE` + tabla de versiones

- A favor: lecturas vigentes sin filtro.
- En contra: dos modelos de histórico (diagnóstico por filas, el resto por instantáneas); la fila que leyó un análisis cambia de valor.

### 3 · `UPDATE` + `AuditLog`

- A favor: sin cambio de esquema.
- En contra: pondría PHI en la auditoría; la auditoría es del S6; el histórico no sería consultable desde la ficha.
