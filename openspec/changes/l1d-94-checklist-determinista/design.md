# Design — l1d-94-checklist-determinista

## Context

Ver `proposal.md` (Why). Estado observado en el repo (2026-10-24):

- `packages/clinical-catalogs/<tipo>/datos-criticos.json` existe con `items = []` y un schema mínimo
  (`schemas/datos-criticos.schema.json`: `version` + `items` sin forma). L1D-93 (US-001) define la forma del ítem,
  `verifiedReviewStatuses`, el validador (`catalog:validate`, allowlist DMMF) y la carga al arrancar.
- `clinical-api` ya lee `manifest.json` con `crearProveedorDeCatalogo()`
  (`src/modules/evidence-analysis/catalog-version.provider.ts`) y tiene el predicado único de RN-07
  (`sqlDatoVigente()` y `ESTADOS_DESCARTADOS` en `src/modules/patients/estados-de-revision.ts`).
- Los repositorios del módulo `patients` usan SQL parametrizado sobre un `Consultador` (no el cliente Prisma).
- Modelo (`prisma/schema.prisma`): `Biomarker` no tiene `patient_id` ni fecha propia (va por `Exam.patient_id` y
  `Exam.performed_at`); `ClinicalAttribute.observed_at` es nullable; `PriorTreatment.started_at` es nullable;
  `Diagnosis` lleva `review_status` a nivel de fila; `mapping_status` ∈ {`mapeado`, `no_mapeado`}.
- `missingCriticalCount` sale fijo de `FALTANTES_CRITICOS_POR_AHORA = 0` (`patients.reglas.ts`): lo sustituye
  US-003, no este change.
- El backlog sitúa FX-04-b en `apps/clinical-api/test/fixtures/completeness/`; el directorio real del repo es
  `tests/` → se usa `apps/clinical-api/tests/fixtures/completeness/` (discrepancia de ruta, sin efecto en los AC).

## Goals / Non-Goals

**Goals:** motor puro testeable sin BD, un único lugar para la regla de cinco pasos, lectura acotada a los
destinos que declara el catálogo, resultado serializable de forma estable.

**Non-Goals:** endpoint HTTP, procedencia por ítem (`Provenance`, US-003), cambios de esquema, caché del resultado.

## Decisions

**D1. Motor puro + servicio + repositorio.** `completeness.rules.ts` exporta
`calcularChecklist(items, registrosPorDestino, verifiedReviewStatuses)` sin E/S; `CompletenessService` (factory que
recibe el repositorio y el proveedor del catálogo por parámetro, sin contenedor de DI) carga el catálogo y los
registros y delega. Alternativa descartada: calcular en SQL (opaco, difícil de probar por borde).

**D2. Reglas con nombre propio** (cada una se prueba sola): `itemsDelTipoActivo()` (paso 1),
`evaluarCondicion()` → `cumple | no_cumple | no_evaluable` (paso 2), `registrosVigentes()` (paso 3, RN-07,
reutiliza `ESTADOS_DESCARTADOS`), `registroQueCuenta()` (paso 4, más reciente) y `estadoDeVerificacion()`. El
orden de salida es el de entrada (paso 5).

**D3. Condición evaluada sobre el registro que cuenta del ítem referenciado.** `condition.item` apunta a otra
clave del catálogo; se toma su registro que cuenta (vigente, más reciente), sin importar su `review_status`. Si no
hay registro vigente → `no_evaluable` → `whenConditionUnknown`. Operadores declarativos de US-001 (nombres del catálogo real):
`igualdad` (el valor es exactamente `values[0]`), `pertenencia` (el valor es uno de `values`) y `prefijo`
(`values.some(p => valor.startsWith(p))`); el motor rechaza un operador desconocido con `CatalogoInconsistenteError`
(el validador de L1D-93 ya debería impedirlo). **`prefijo` es `startsWith` exacto, sensible a mayúsculas y a
espacios, sin normalizar ni recortar:** `"2+ (IHQ)"` activa `"2+"` (her2_ish); `" 2+ (IHQ)"` y `"iv"` contra `"IV"`
no. Si el dato condicionante no tiene valor (`null`, o su campo de destino no está declarado) la condición es
`no_evaluable`. Ejemplos: F-M2 HER2 "2+ (IHQ)" → `her2_ish` aplica; F-M3 sin TNM →
`tratamientos_previos` con `whenConditionUnknown = faltante`.

**D4. Fecha del registro por entidad**: `Biomarker` → `Exam.performed_at`; `ClinicalAttribute` → `observed_at`;
`PriorTreatment` → `started_at`; `Diagnosis` → solo el activo (`is_active = true`), un único registro. Un registro
sin fecha se ordena como más antiguo que cualquiera fechado; el desempate final es `created_at` más tarde y, si
persiste, `id` (orden total, determinista). Alternativa descartada: `created_at` como única fecha (contradice la
regla 4 del backlog).

**D5. Coincidencia de destino** por `destination.entity` + `match` del catálogo: `Biomarker` por `name` canónico
(y `Exam.exam_type` cuando el `match` lo declara, `[S3 resp. 5]` de US-001), excluyendo `mapping_status =
no_mapeado` (RN-27); `ClinicalAttribute` por `attribute_key`; `Diagnosis` por campo no nulo (y
`staging_system`/`performance_scale` cuando el `match` lo declara); `PriorTreatment` sin filtro adicional.
`minValues` por defecto `1` si el ítem no lo declara (lo fija el schema de US-001).

**D6. Salida**: `{ catalogVersion, items: [{ key, status }] }`, con claves en orden fijo para que dos
serializaciones sean iguales byte a byte (AC-5). US-003 la amplía con la procedencia.

**D7. Lectura acotada**: el repositorio hace una consulta por entidad de destino presente en los ítems del tipo,
filtrando por `patient_id`, y solo expone las columnas de la allowlist del modelo (`modelo.allowlist.json`, L1D-93
D3); nunca lee `ClinicalNote`, `identity` ni texto libre. **Ajuste en la implementación:** el repositorio *no* filtra
por estado de revisión (no usa `sqlDatoVigente()`): el filtro de RN-07 vive en un solo lugar,
`registrosVigentes()`, para que haya una única guarda auditable. Del `Diagnosis` solo lee el activo (`is_active`).

**D8. Sin diagnóstico activo vigente** (añadido en la implementación): el checklist es `{ catalogVersion, items: [] }`.
Tampoco hay ítems si el tipo del diagnóstico no está en el catálogo. Es un vacío, no un "completo": US-003/US-004
decidirán cómo se muestra. Un ítem cuya `condition` referencia una clave inexistente del tipo, o sin
`whenConditionUnknown`, lanza `CatalogoInconsistenteError`.

**D9. Fixtures FX-04-a propios** (añadido en la implementación): los `test-1.0.0`/`test-1.1.0` de
`packages/clinical-catalogs/test/fixtures/` (L1D-93) tienen 7 ítems de mama y no la tabla de US-002 (12 ítems,
condiciones sobre `tnm` "IV", próstata de dos ítems). Como este change no edita `packages/`, los catálogos de la tabla
viven en `apps/clinical-api/tests/fixtures/completeness/catalogos/` y validan con `catalog:validate --dir`. Los
nombres de biomarcador de la tabla ("Receptor de estrógeno", "HER2 ISH"…) son los del backlog; el catálogo real 1.1.0
usa `RE`/`RP` (ver Riesgos).

## Privacidad y ownership

- Todo ocurre dentro de `clinical-api`: lee schema `clinical` (diagnóstico, exámenes, biomarcadores, atributos,
  tratamientos previos) del paciente por UUID. **Ningún dato cruza a `rag-orchestrator`** ni a `web` en este change;
  `rag-orchestrator` no toca datos clínicos ni `clinical-minio`.
- No lee `identity` ni notas (la `ClinicalNote` con PII sintética de F-M2 existe solo para los tests de no-fuga de
  US-003…US-006). Los logs del servicio, si los hay, registran `patientId` (UUID), `catalogVersion`, conteos por
  estado y latencia; nunca valores clínicos (RN-10).
- Fixtures 100 % sintéticos (`data_origin = sintetico`); la PII sintética de F-M2 se genera en tiempo de test y no
  se versiona (RN-14, escaneo de PII de la CI).
- Desidentificación (RN-11): no aplica aún; el envío de faltantes al análisis es de US-006.

## Contratos

Sin cambios. No hay endpoint nuevo (`GET /platform/patients/{id}/completeness` es de US-003, S4), ni cambio de
`apps/*/openapi.yaml` ni de `contracts/examples/`; no aplica `oasdiff` y es compatible con ADR-26. El formato del
catálogo (contrato de datos con `rag-orchestrator` vía versión) es de L1D-93.

## Dependencias y colaboradores

| Módulo | Nuevo/Modifica | Depende de |
|---|---|---|
| `modules/completeness/completeness.rules.ts` | nuevo | nada (puro); tipos del ítem de catálogo de L1D-93 |
| `modules/completeness/ports.ts` | nuevo | — (`RegistrosDeCompletitud`, `CatalogoDeDatosCriticos`) |
| `modules/completeness/completeness.service.ts` | nuevo | puertos, nunca clientes concretos |
| `modules/completeness/completeness.repository.ts` | nuevo | `Consultador`, `sqlDatoVigente()` |
| `modules/completeness/completeness.module.ts`, `src/composition.ts` | nuevo / modifica | cargador del catálogo de L1D-93 |

Reglas extraídas a métodos con nombre: ver D2 (RN-07 en `registrosVigentes()`, RN-27 en el filtro de destino).

## Evaluación

No cambia modelo, prompt, umbral ni corpus; el catálogo real no se modifica aquí. `run-ai-eval` no aplica. M-04.1
y M-04.2 se miden en US-131.

## Risks / Trade-offs

- [La forma del ítem de L1D-93 difiere de la del backlog] → el motor consume un tipo `ItemDeDatoCritico` importado
  del cargador de L1D-93; se rebasa sobre él antes del Gate 2. Si L1D-93 no ha mergeado, los tests usan FX-04-a con
  la forma del backlog (US-001, contexto técnico).
- [Registros sin fecha ordenados como antiguos] → conservador con la decisión `[S3 resp. 5]`; revisable en la
  sesión de oncólogos del S4 sin cambiar el esquema.
- [Condición sobre un dato sin verificar] → aplica la condición igual (D3); el ítem dependiente sigue mostrando su
  propio estado, y el aviso "sin verificar" del referenciado ya lo da su propio ítem.

- [El catálogo real 1.1.0 nombra los biomarcadores `RE`, `RP`, `BRCA`, `HRR` y el seed sintético usa "Receptor de
  estrógeno"] → con el catálogo real el seed daría `re`/`rp` en `faltante`. Es de L1D-93 / seed (no se toca aquí);
  se reporta para US-003/US-131.

## Open Questions

- Q1 (dueño: L1D-93): nombre exacto de los operadores declarativos (`valueIn`, `startsWith`, igualdad) y de
  `minValues` por defecto; no cambia los AC ni las tareas.
- Q2 (dueño: oncólogo, S4, DEC-01 Q7/Q8): antigüedad máxima y "ausencia confirmada"; fuera del S3.
