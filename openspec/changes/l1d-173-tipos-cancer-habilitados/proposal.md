# Proposal — l1d-173-tipos-cancer-habilitados

## Trazabilidad

L1D-173 · US-043 · FEAT-PL3 (L1D-32) · Sprint 2 · Estimación **3** · HU-03 · RN-20 (dueña de la configuración) ·
RN-22 · FR-04 · FR-09 · AC-06.1 (`tipo_no_habilitado`) · readme §6 OL-03 (alcance complementario) ·
`01-requisitos.md` §15 resp. 3 (defensa en B2) · US-043 AC-1…AC-5 · `docs/ux/S2/pantallas-s2.md` S2-02, S2-04 ·
🔗 Relacionada: DEC-19 (criterio de "listo", S6)

## Por qué

El oncólogo debe saber con claridad cuándo el tipo de cáncer de su paciente está fuera del alcance del piloto,
para no recibir un análisis sobre evidencia y reglas que nadie ha preparado para ese tipo (RN-20).

## Qué cambia

- `clinical-api`: `ENABLED_CANCER_TYPES` validada al arranque contra `cancerTypes` de `manifest.json` (vacía o con
  un tipo desconocido → no listo). El gateway comprueba el tipo del `Diagnosis` activo **antes** de construir el
  contexto: si no está habilitado, responde `200 status = tipo_no_habilitado` sin llamar a `rag-orchestrator` y
  persiste el `AIAnalysisRecord` con ese estado. La ficha informa `cancerTypeEnabled`.
- Base del análisis en `tipo_no_habilitado` (armada por este change, sin Backend 2): `patientDataUsed = []`,
  `sourcesConsulted` con las fuentes y filtros del request y `retrieved = 0`, `aboveThreshold = 0`,
  `sourcesNotIncluded` desde `CORPUS_EXCLUDED_SOURCES` y `corpusCutoffDate` desde una clave nueva de `clinical-api`
  `CORPUS_CUTOFF_DATE` (RN-22) que actualiza el script de carga del corpus — **Propuesto en el Gate 1 del S2
  (pendiente de confirmación del usuario)**.
- Un `ENABLED_CANCER_TYPES` inválido se registra con el evento único `configuracion_invalida` de `l1d-167` y el
  tipo inválido en su campo cerrado `valorInvalido`.
- `rag-orchestrator`: defensa en profundidad con el mismo catálogo: `cancerType` no habilitado → `422
  TIPO_NO_HABILITADO`, cero invocaciones del LLM; el enum interno de `status` no cambia.
- `web`: aviso informativo "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" en la ficha (sin
  ocultar datos) y estado equivalente en el panel de análisis para `tipo_no_habilitado`.
- Sin cambio de contrato (`tipo_no_habilitado`, `TIPO_NO_HABILITADO` 422 y sus ejemplos ya existen).

## Capacidades

- `clinical-catalogs` (ADDED: tipos habilitados en configuración validados contra el catálogo; defensa en B2).
- `evidence-analysis-gateway` (ADDED: `tipo_no_habilitado` sin invocar a la IA, persistido).

## Bounded contexts

clinical-platform · ai-services · frontend.

## Dependencias

- ↪ `l1d-171-catalogo-montaje-version` (US-041): manifiesto cargado en ambos backends (`cancerTypes`).
- ↪ `l1d-167-config-validada-logs-json` (US-037): módulo de configuración tipada.
- ↪ `l1d-186-base-analisis-builder` (US-066): la Base de las ramas que llaman a Backend 2. **Orden: este change va
  después de `l1d-171` y de `l1d-186`.**
- ↪ `l1d-72-ficha-minima-paciente` (US-051): la ficha, el campo `cancerTypeEnabled` y el puerto
  `TiposDeCancerHabilitados` (este change lo implementa con la validación contra el manifiesto).
- 🔗 `l1d-202-listado-busqueda-pacientes` (US-048) consume el mismo literal en la columna "Alcance" de S2-02.
- Archivados: L1D-103/L1D-104 (gateway y persistencia), L1D-106 (`sin_evidencia`, `analysis_basis`).

## Fuera de alcance

El criterio de "listo" para habilitar un tipo (DEC-19): propuesto en el refinamiento del S2 (P-4, pendiente de
confirmación) como prerrequisito de G-Piloto (S6), no de la demo sintética; leucemia (RN-20, Post-MVP hasta
cumplir el criterio). Contenido de la Base del análisis más allá de los incisos del S1 (US-066/US-067).
