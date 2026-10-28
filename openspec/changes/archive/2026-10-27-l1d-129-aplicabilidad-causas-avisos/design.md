# Design — l1d-129-aplicabilidad-causas-avisos

## Context

Ver proposal.md (Why). Estado de partida (reconciliado el 2026-10-27, sobre `l1d-128`): el contrato final ya declara
`ApplicabilityCriterion.unknownReason` (`falta_en_paciente | no_reportado_por_fuente | null`),
`patientDataWarning` (`sin_verificar | en_conflicto | faltante | null`), `SourceApplicability.summary` y
`populationNotComparable` (`contracts/schemas/evidence.yaml`, Pre-S1, ADR-26). `rag-orchestrator` ya calcula la
aplicabilidad por criterio (L1D-127: `ApplicabilityService` en `application/aplicabilidad.py`, reglas puras en
`domain/applicability_rules.py`, incluidas `evaluar_criterio` con la causa, `contar_estados` y
`poblacion_no_comparable`) y el valor textual citado (L1D-128), pero `respuesta_con_evidencia._criterio_aplicable`
fija `patientDataWarning = None` y `contexto_del_paciente` descarta la `provenance` y `missingCriticalData`. El
catálogo real (`packages/clinical-catalogs/mama/aplicabilidad.json`) trae 6 criterios (`estado_her2`,
`receptores_hormonales` con `match.name = [RE, RP]`, `estadio`, `linea_tratamiento`, `estado_menopausico`, `ecog`);
el de test `test-apl-1.0.0`, 5.
Cada dato del `clinicalContext` trae `provenance { entryMethod, extractionConfidence, reviewStatus, conflict }`
(`apps/rag-orchestrator/openapi.yaml`, `Provenance`); `clinical-api` pone `conflict = conflictsWithId !== null`
(`clinical-context.builder.ts`). `missingCriticalData` es una lista de claves de catálogo (`^[a-z0-9_]+$`,
US-006 AC-6), p. ej. `estado_menopausico`. `clinical-api` ya copia `applicability` de la respuesta al registro
(`analysis-record.ts`, `evidence-analysis.repository.ts`, columna `Json`).

## Goals / Non-Goals

**Goals:** dos reglas puras y deterministas nuevas sobre la salida de US-122/US-123 — causa del desconocido y
aviso del dato del paciente —, los AC de US-124 sobre población no comparable y conteo (funciones de
`l1d-127`), los tests de regresión de RN-02 y RN-06 y el par de ejemplos de contrato con aplicabilidad.

**Non-Goals:** elegir qué dato del paciente se compara cuando hay varios candidatos (lo fija US-122); herencia
por opción (US-125); textos de UI (US-126, US-062 AC-7); detección real de conflictos (US-099, S5).

## Decisions

**D1 — Reglas como funciones puras con nombre propio en `domain/applicability_rules.py`.** Este change añade
solo `causa_de_desconocido(valor_paciente, valor_estudio) -> CausaDeDesconocido | None` (Extract Method del cuerpo de
`evaluar_criterio`) y `aviso_dato_paciente(procedencias) -> AvisoDelDato | None`, con sus unitarios. El tipo de dominio
`ProcedenciaDelDato(revision_pendiente, en_conflicto)` lo construye `application/contexto_del_paciente.py` desde
`Provenance` (el dominio no importa el esquema generado). `poblacion_no_comparable(criterios) -> bool` y
`contar_estados(criterios) -> ApplicabilitySummary` **son de `l1d-127`** (decisión del usuario, 2026-10-24,
`[S3 resp. 16]`): aquí no se reimplementan ni se duplican sus unitarios; solo se escriben contra ellas los AC de
US-124 (AC-4, AC-5). `evaluar_criterio_de_fuente` compone causa y aviso por criterio y `ApplicabilityService` el conteo y la no comparabilidad al cerrar cada `SourceApplicability`.
Así cada invariante que un guardián verifica (RN-28, RN-26) vive y se prueba en un solo lugar. Descartada:
calcularlas en el ensamblado de la respuesta (mezcla presentación y dominio).

**D2 — `falta_en_paciente` gana sobre `no_reportado_por_fuente`** (confirmada por el usuario, 2026-10-24,
`[S3 resp. 16]`; `l1d-127` D5 aplica la misma precedencia). Si el paciente no tiene el dato, el criterio
es `desconocido` con `falta_en_paciente`, `patientValue = null` y `patientDataWarning = faltante`, aunque la
fuente tampoco lo reporte: la causa accionable para el oncólogo es completar su paciente. Un dato es "faltante"
si la clave del criterio está en `missingCriticalData` **o** el destino del criterio no tiene ningún dato en el
contexto (cubre criterios que no son dato crítico del checklist, p. ej. RE/RP). La correspondencia clave del criterio
↔ clave del checklist es por igualdad de clave (`estado_menopausico`, `ecog`); los demás (`tnm`, `re`, `her2_ihq` del
checklist frente a `estadio`, `receptores_hormonales`, `estado_her2`) los cubre la ausencia del dato. Ver Q2.

**D3 — Precedencia de avisos `en_conflicto` > `sin_verificar` > `null`.** Un dato en conflicto también está en
`requiere_revision`; el conflicto es la información más fuerte. **El aviso sale del mismo dato que se copia
en `patientValue`** (el de menor `monthsAgo`, L1D-127 D3), no de los demás candidatos: un valor antiguo sin verificar no
ensucia a uno reciente verificado. En un destino compuesto (RE/RP) se reúnen las procedencias de sus componentes y rige
la misma precedencia. En el conflicto sembrado del AC-3 ambos HER2 llevan `conflict = true`, así que el elegido avisa.
Los datos del `Diagnosis` (estadio, grado, ECOG) comparten la `provenance` del diagnóstico. **Paridad:** la regla
reproduce `rag_query.etiqueta_de_procedencia` (L1D-181); un test de tabla `reviewStatus × conflict` en cada lado
(`aviso_dato_paciente` y `etiqueta_de_procedencia`) impide que diverjan. `verificado`, `corregido` y
`auto_aceptado` no generan aviso. El aviso **no** cambia `status` ni produce error (RN-26): el estado lo sigue
calculando la regla de US-122 sobre el valor que esa historia elige.

**D4 — `populationNotComparable` solo por excluyente en `no_coincide`.** Un excluyente `desconocido` o `parcial`
no la activa (AC-08.6); la limitación textual asociada es de US-130.

**D5 — `summary` es un conteo derivado de `criteria`, nunca un campo independiente.** `contar_estados()` recorre
la lista final (después de omitir afirmaciones sin soporte, US-123), de modo que la suma es siempre el número de
criterios del catálogo. Sin pesos ni porcentajes: el validador del catálogo ya rechaza `peso/score/weight`
(US-121 AC-3) y el schema tiene `additionalProperties: false`.

**D6 — Conflicto del AC-3 en un fixture de test, no en el seed de demo.** Variante `A-M1-CONFLICTO` de FX-08b-a:
dos HER2 (`3+ (IHQ)` y `2+`), ambos `requiere_revision` con `conflicts_with_id` cruzados, que llegan a B2 con
`provenance.conflict = true`. En `rag-orchestrator` se construye directamente como `clinicalContext` (la mitad
B1, conflicto sembrado → `conflict = true`, ya la verifica L1D-181). El seed #212 de la demo no lo contiene. Sembrarlo en el paciente (a) de la demo
rompería US-065 AC-1 (`conflict = false`).

**D7 — AC-7 sin código nuevo en B1.** El test Supertest fija que la persistencia copia `applicability` sin
transformarla; si pasa en verde a la primera, se documenta como test de regresión (test después) en vez de rojo.

## Privacidad y ownership

- Datos que cruzan: `clinical-api → rag-orchestrator` el `clinicalContext` desidentificado de siempre (seudónimo
  por consulta, fechas relativas, texto enmascarado; RN-11) con `provenance` y `missingCriticalData` (claves de
  catálogo, sin PHI). De vuelta, `applicability` con `patientValue` **copiado** del contexto (ADR-34), nunca
  generado. Nada nuevo cruza la frontera.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`: las reglas operan en memoria sobre el request y
  el catálogo del corpus (`population_criteria`, schema `corpus`, rol `rag_corpus`).
- Logs: solo conteos (criterios por estado, número de fuentes no comparables); nunca valores del paciente ni del
  estudio.
- Sin cambio en `apps/web` (no aplica Seguridad web).

## Contratos

- **Sin diff** en `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni
  `contracts/schemas/evidence.yaml`: los campos y enums existen desde el Pre-S1. Proveedor: `rag-orchestrator`
  (`/rag/query`); consumidor: `clinical-api` vía cliente generado. Compatible con ADR-26; `contracts:breaking`
  sin cambios.
- **Ejemplos:** (1) los 6 ejemplos de petición con «Receptor de estrógeno» pasan a `RE`
  (nombre del seed de L1D-95a y `match.name` del catálogo real); los tests de prompt que fijan la línea se
  actualizan en el mismo commit `contract`. (2) **Este change es dueño del par** (decisión del usuario, 2026-10-24, `[S3 resp. 16]`):
  `contracts/examples/rag-query-aplicabilidad-a-m1.json` (interno, `RagQueryInternalResponse` de
  `rag-orchestrator`, con `request` a su petición) y su público `con-evidencia-s3-aplicabilidad.json`
  (`EvidenceAnalysis` de `clinical-api`), ambos registrados en `contracts/examples/index.json` y validados con
  `contracts:check`. Contenido: `applicability` de `doc-a1` con los **6 criterios del catálogo real** para A-M1
  (petición dedicada `rag-query-request-aplicabilidad-a-m1.json`: HER2 `3+ (IHQ)`, sin RE/RP, diagnóstico en
  `requiere_revision`, `missingCriticalData` con `estado_menopausico`): `estado_menopausico` y `receptores_hormonales`
  `falta_en_paciente`/`faltante`, `ecog` `coincide` con `sin_verificar`, `estadio` `desconocido` sin causa, y su
  `summary`. Todo criterio con valor del estudio lleva su cita. El handler MSW del AC-7 se
  construye desde él. Regla de `l1d-188` (`[S3 resp. 18]`): todo ejemplo con `analysisBasis` lleva
  `missingCriticalDataLabels`; si `l1d-188` ya está en `main`, este change lo incluye en el público; si llega
  después, lo añade `l1d-188` (tarea 1.1 condicional en ambos sentidos). `l1d-127` no publica ejemplo; `l1d-130` y `l1d-141` reutilizan este par (`l1d-141` solo
  añade la variante `poblacion-no-comparable`). `l1d-188` (#216) ya está en `main`: se incluye
  `missingCriticalDataLabels` en el público.

## Dependencias y colaboradores

- Modifica `app/domain/applicability_rules.py` (US-122) con las dos funciones nuevas de D1; sin dependencias de
  infraestructura.
- Modifica `app/domain/aplicabilidad_tipos.py` (`ProcedenciaDelDato`, `AvisoDelDato`, campo `aviso` de
  `CriterioEvaluado`, `datos_criticos_faltantes` del contexto), `app/application/contexto_del_paciente.py` (traduce
  `Provenance` y `missingCriticalData`) y `app/application/respuesta_con_evidencia.py` (copia el aviso al contrato).
  `ApplicabilityService` no cambia: el aviso lo fija `evaluar_criterio_de_fuente`, que ya compone la fuente; el camino
  textual (`con_valor_textual`) conserva el aviso del criterio que reemplaza.
- `clinical-api`: sin módulos nuevos; test en `apps/clinical-api/test/` del módulo `evidence-analysis`.
- Reglas extraídas: `causa_de_desconocido()` (FR-25), `aviso_dato_paciente()` (RN-26, RN-07). Reutilizadas de
  `l1d-127`: `poblacion_no_comparable()` (AC-08.6), `contar_estados()` (RN-28).
- Orden de archivo de `applicability` (`[S3 resp. 16]`): 127 → 128 → **129** → 130 → 182.

## Risks / Trade-offs

- [US-122/US-123 aún no mergeados, `ApplicabilityService` puede cambiar de forma] → este change se implementa
  después en la misma oleada; las reglas de D1 son puras y no dependen de la forma del service.
- [Claves del checklist ≠ claves de aplicabilidad para algún criterio] → D2 añade la ausencia del destino como
  segunda señal; los casos sin igualdad se anotan en Dudas.
- [El estado de un criterio con datos en conflicto puede parecer firme] → el aviso `en_conflicto` es obligatorio
  y US-126 lo hace visible; tratarlo como `desconocido` queda como duda para la sesión de oncólogos del S4.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: no exige `evaluate`. Las métricas M-08.2/M-08.4 las mide
US-132.

## Open Questions

- Q1 (oncólogos, S4): con dos valores en conflicto, ¿el `status` debe forzarse a `desconocido` en vez de
  calcularse sobre el valor que elige US-122? No cambia este change (solo fija el aviso); cambiaría
  `applicability_rules` de US-122 y el catálogo.
- Q2 (US-121/DEC-11): confirmar que cada criterio de aplicabilidad que es dato crítico usa la misma clave que el
  checklist de US-002 (`estado_menopausico`, `ecog`, …); si no, añadir el campo de correspondencia en el catálogo.
