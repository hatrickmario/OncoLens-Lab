# Proposal — l1d-293-estado-criterio-lista-poblacion

## Trazabilidad

L1D-293 · US-243 · FEAT-08b (L1D-20) · Sprint 4 · Estimación **5** · HU-22 · FR-25 (estado determinista con listas) ·
RN-28 (cuatro estados visibles, sin puntaje) · RN-27 · RN-22 · AC-08.1 · AC-08.2 · AC-08.9 · US-243 AC-1…AC-8 ·
ADR-47 · ADR-34 · DEC-11 (US-021) · `[S4 resp. 8]` `[S4 resp. 9]` `[S4 resp. 11]` ·
🔗 Consumida por: US-126, US-134, US-247 · 🔗 Medido en: US-233b (concordancia de estados) ·
🔗 Regresión [RN-28] → US-134 · 🔗 Regresión [RN-02] → US-055

## Dependencias

- ⛔ ADR-47 (aceptado, 2026-10-29) y ⛔ DEC-11 (US-021, escenario aceptado; la firma de la sesión de oncólogos cambia, si acaso, el catálogo, no el código): son decisiones, no changes.
- ↪ `l1d-291-poblacion-lista-contrato-migracion` (US-241, L1D-291): forma de lista `{value, chunkId, scope}`, `partialReason`, `studyPopulationValues`, `unknownReason` (`valores_en_conflicto`, `sin_regla_de_comparacion`) y lector de las dos formas. `populationNotComparable` ya existe en `contracts/schemas/evidence.yaml`. Este change **no** define el contrato.
- ↪ `l1d-127-estado-criterio-estructurado` (US-122, archivado) y `l1d-130-herencia-aplicabilidad-recorte` (US-125, archivado): el comparador por estado y la herencia siguen intactos.
- Colabora sin bloquear con `l1d-292-poblacion-abanico-ingesta` (US-242, la extracción que llena la lista; los AC usan FX-08b-c sembrado) y `l1d-294-respaldo-poblacion-consulta` (US-244, respaldo en la consulta).

## Por qué

Con ADR-47 la población del estudio llega como lista de valores por fragmento. El estado de la v1 (`l1d-127`) asume un valor
único por criterio y toma por coincidencia exacta lo que solo incluye al paciente en parte, o por exclusión lo que la fuente
no dice. El oncólogo necesita distinguir población específica, inclusiva y mezclada, y que lo no dicho sea Desconocido.

## Qué cambia

- **Dominio puro** (`rag-orchestrator`): nuevas reglas en `app/domain/applicability_rules.py` y tipos en
  `app/domain/aplicabilidad_tipos.py` que, por opción y criterio, unen los valores cuyo `chunkId` cita la opción, clasifican el
  estado interno (`exacto | inclusivo | mezclado | rango_solapado | en_conflicto | ausente | restringido |
  sin_regla`) y lo proyectan a los cuatro estados de RN-28, `partialReason` (`inclusiva | mezclada | rango_solapado |
  solo_subgrupo | null`, el enum de US-241) y `unknownReason` (`no_reportado_por_fuente | valores_en_conflicto |
  sin_regla_de_comparacion`; este último para `valor_fuera_de_tabla`, `sin_escala` y `forma_no_comparable`). Los valores `scope = subgrupo` o `mencion` no cuentan para el estado y
  se conservan como contexto en `studyPopulationValues`.
- **Catálogo (datos)**: `restrictionMarkers` es/en, tablas de rangos y sinónimos por criterio se leen del catálogo (el
  catálogo de test `test-apl-1.2.0` de FX-08b-c); lo que no mapea queda `no_mapeado` (RN-27). Ningún literal en código (RN-22).
- **Cableado** en `RAGOrchestratorService`: la aplicabilidad de cada opción usa los fragmentos que **esa opción** cita.
- Sin LLM en este paso; sin puntaje ni porcentaje (RN-28).
- Sin cambio de `openapi.yaml`: el contrato lo fija US-241 (ver `design.md`, Contratos). **Ejemplos**: como primer
  productor de `sin_regla_de_comparacion`, este change actualiza en su sección `## contratos` (commit `contract(L1D-293)`)
  `rag-query-aplicabilidad-a-m1.json` y `con-evidencia-s3-aplicabilidad.json`: el `estadio` de A-M1 × `doc-a1` pasa de
  `unknownReason: null` a `sin_regla_de_comparacion`. Se modifica el requisito «Desconocido sin causa cuando el dato no
  falta» y se ajusta el test de US-122 AC-1 que fijaba `None` (con `Test-Removal:`).

## Capacidades afectadas

`applicability` (ADDED; MODIFIED «Desconocido sin causa cuando el dato no falta»). Bounded contexts: **contratos**
(solo dos ejemplos) y **ai-services**.

## Fuera de alcance

La extracción que llena la lista (US-242), la forma de datos y el contrato (US-241), el respaldo en la consulta (US-244),
la UI (US-126), el orden (US-134) y cualquier ponderación de criterios (RN-28). El comparador de US-125 y el orden de
US-134 no cambian.

## Pendientes de definir

Ver `design.md`: restricción explícita vs valor único y conflicto vs cohortes distintas (oncólogo, DEC-11), y destino de
`solo_subgrupo` después del S5 (en el S4 la forma antigua sigue en Parcial: lectura doble, un sprint).
