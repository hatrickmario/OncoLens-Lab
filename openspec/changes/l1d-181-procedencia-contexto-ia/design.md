# Design — l1d-181-procedencia-contexto-ia

## Context

Ver proposal.md (Why). Estado de partida en `main`:

- `clinical-api`: `provenanceDe()` (`clinical-context.builder.ts`) copia `entryMethod`, `extractionConfidence` y
  `reviewStatus` de la fila y pone `conflict = conflictsWithId !== null`; su comentario dice que "el etiquetado
  completo es de RN-07 (US-065, S3)". El repositorio (`evidence-analysis.repository.ts`) filtra con una constante
  local `SIN_RECHAZADOS` que duplica `sqlDatoVigente()` de `modules/patients/estados-de-revision.ts`. El
  `clinical_context_snapshot` del registro se deriva del mismo contexto (`analysis-record.ts`).
- FX-T1a-a ya existe (`tests/support/filas-sinteticas.ts`, `insertarFxT1aA`), con un test de humo del fixture y
  los tests de US-066 AC-6 sobre la Base del análisis. El examen del fixture es el más reciente del paciente, así
  que el "último valor por biomarcador" elige el receptor de estrógeno en conflicto.
- `rag-orchestrator`: `generation.py` arma el prompt `rag-query@0.2.0` con `resumen_del_contexto_clinico()`, el
  mismo texto que se embebe para la recuperación (`rag_orchestrator_service.py`); la procedencia se pierde.
  Base efectiva tras el *rebase* `[S3 resp. 15]`: `l1d-287-alias-chunks-cita` mergea antes y deja el prompt en
  `rag-query@0.3.0` con fragmentos `[fragmento C<n>]` y `construir_prompt_rag_query(pregunta, contexto_clinico: str,
  fragmentos: Sequence[FragmentoConAlias], idioma, max_parrafos_detalle)`; este change parte de ese estado.

## Goals / Non-Goals

**Goals:** fijar RN-07 en B1 con tests de aceptación sobre el payload y el registro (AC-1…AC-4) y llevar la
procedencia al prompt como etiquetas legibles (AC-5).

**Non-Goals:** detección de conflictos (US-099, S5); flujo de revisión (FEAT-03b, S4); aplicabilidad
(`l1d-129`); ampliar los campos del contexto que entran al prompt. **Non-Goal explícito (usuario, 2026-10-27):** en
el S3 el prompt etiqueta la procedencia **solo del diagnóstico y los biomarcadores**; atributos, tratamientos
previos y eventos siguen fuera del bloque (como hoy) aunque su `provenance` viaje en el payload.

## Decisions

**D1 — Sin `ProvenanceLabeler` nuevo en B1: `provenanceDe()` es la regla única.** El backlog nombra un
`ProvenanceLabeler`; la función ya existe, es pura y la usan los cinco tipos de dato. Crear una clase sería un
*middle man* sin segundo uso (YAGNI). Se actualiza su comentario (deja de ser "mínima del S1") y se conserva el
nombre. Descartada: clase `ProvenanceLabeler` inyectada (sin variación que la justifique).

**D2 — Un único predicado de RN-07.** El repositorio del análisis reemplaza `SIN_RECHAZADOS` por
`sqlDatoVigente('review_status')` / `sqlDatoVigente('b.review_status')`, como la ficha. Es un refactor sin cambio
de comportamiento, con los tests de AC-3 en verde antes y después.

**D3 — Etiquetas en un bloque propio del prompt, no en el texto embebido.** Nueva función pura
`bloque_de_datos_del_paciente(contexto) -> str` en `app/prompts/rag_query.py` (mismo nivel de abstracción que la
plantilla): lista el diagnóstico y los biomarcadores (los mismos campos que hoy) y añade al final de cada dato
la etiqueta derivada de su `provenance` por `etiqueta_de_procedencia(provenance) -> str | None` (RN-07):
`conflict = true` → "(en conflicto)"; si no, `reviewStatus = requiere_revision` → "(sin verificar)"; si no,
ninguna. La precedencia del conflicto coincide con `patientDataWarning` de `l1d-129` (requisito "Aviso del dato del paciente según su procedencia"). La plantilla
renombra "Contexto clínico" a "Datos del paciente" e incluye una línea fija que explica las etiquetas. Literal propuesto (sin términos de RN-23; no se reproduce en la spec):
«Las etiquetas "(sin verificar)" y "(en conflicto)" indican el estado de revisión del dato; no forman parte del
dato.» El bloque pasa como el argumento `contexto_clinico: str` ya existente de `construir_prompt_rag_query()`. `resumen_del_contexto_clinico()` no cambia: etiquetar el texto embebido alteraría la
recuperación y obligaría a recalibrar. Versión del prompt `rag-query@0.3.0` (alias, `l1d-287`) →
`rag-query@0.4.0` `[S3 resp. 15]`; los fragmentos y la instrucción de citar por alias no cambian. Las etiquetas son texto del prompt
(versionado con él), no valores calibrables: no van a configuración (RN-22 no aplica).
Descartada: etiquetar dentro de `resumen_del_contexto_clinico()` (mezcla recuperación y generación).

**D4 — Tests de B1 probablemente en verde a la primera.** La lógica existe desde el S1. Siguiendo el criterio de
`l1d-129` D7, cada test de AC-1…AC-4 se ejecuta primero; si falla en la aserción, va como `test(L1D-181)` en rojo
antes del `feat`; si pasa, se registra como test de regresión (test después) con su salida en el reporte del
Gate 2. AC-5 sí es rojo genuino (hoy no hay etiqueta).

**D5 — AC-3 y AC-4 sobre el payload y el registro, aseverados por identidad del dato, no por nombre.** El test
captura el request hacia `rag-orchestrator` (MSW desde `contracts/examples/`) y lee `clinical_context_snapshot` de
PostgreSQL real. Identifica los datos por los ids que `insertarFxT1aA` devuelve. El cruce `dataRef` → id se hace con `patient_data_links` del `AIAnalysisRecord` persistido (`entityId` de cada enlace): el test comprueba que ningún enlace apunta a los dos ids `rechazado`/`reemplazado`. El UUID de la entidad nunca va en el `clinicalContext` (RN-10). Además comprueba la
condición «ningún `reviewStatus` `rechazado`/`reemplazado` en el payload ni en el snapshot». No usa el nombre
«Receptor de …»: el seed pasa a `RE`/`RP` en `l1d-95a-seed-codigos-catalogo` y el test no debe depender del rótulo.

**D6 — Un solo origen de los estados descartados.** `sqlDatoVigente()` (SQL) y `registrosVigentes()` (completitud)
derivan de la misma constante `ESTADOS_DESCARTADOS` de `modules/patients/estados-de-revision.ts`. Un unitario
lo fija: cada estado de `ESTADOS_DESCARTADOS` aparece en la cadena de `sqlDatoVigente()` y `registrosVigentes()`
descarta exactamente esos estados; si se añadiera un estado a la constante, ambos cambian a la vez. El
repositorio del análisis deja de tener su literal `SIN_RECHAZADOS`.

## Pendientes de definir

- **Simetría del conflicto (dueño: humano en `/sprint-start`; afecta a l1d-129 y US-099).** Hoy solo el dato con
  `conflicts_with_id` lleva `conflict = true`; el del seed al que apunta queda `conflict = false` y, por el
  "último valor por biomarcador", ni siquiera viaja. Ningún AC del S3 lo pide; se propone dejarlo para US-099 (S5),
  que es quien crea conflictos reales.
- **Texto de las etiquetas** "(sin verificar)" (asumido en el AC) y "(en conflicto)" (asumido aquí).

## Privacidad y ownership

- Datos que cruzan `clinical-api → rag-orchestrator`: el `clinicalContext` desidentificado de siempre (seudónimo
  por consulta, fechas relativas, texto enmascarado; RN-11) con `provenance` (enums, sin identificadores de
  documento: `Provenance` no admite `documentId`, RN-10). Nada nuevo cruza la frontera.
- El prompt no recibe `pseudoPatientId` ni `dataRef` (escenario RN-11 del spec); las etiquetas son literales fijos.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; opera en memoria sobre el request.
- Logs: sin cambios; nunca valores del paciente ni el prompt.
- Sin cambios en `apps/web` (no aplica Seguridad web).

## Contratos

Sin cambios en `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml`, `contracts/schemas/` ni
`contracts/examples/`: `Provenance` (`entryMethod`, `extractionConfidence`, `reviewStatus`, `conflict`) existe
desde el Pre-S1 y su enum `reviewStatus` ya excluye `rechazado`/`reemplazado`. Proveedor `rag-orchestrator`,
consumidor `clinical-api` (cliente generado). Sin cambio incompatible (oasdiff), compatible con ADR-26. Los tests
de integración validan la respuesta contra el spec del proveedor (US-214).

## Dependencias y colaboradores

- `clinical-api/src/modules/evidence-analysis/clinical-context.builder.ts` — `provenanceDe()` (regla RN-07 con
  nombre propio); sin nuevas dependencias.
- `clinical-api/src/modules/evidence-analysis/evidence-analysis.repository.ts` — depende de
  `modules/patients/estados-de-revision.ts` (`sqlDatoVigente`), módulo de dominio sin E/S.
- `rag-orchestrator/app/prompts/rag_query.py` — funciones puras `bloque_de_datos_del_paciente()` y
  `etiqueta_de_procedencia()`; dependen solo de los modelos Pydantic generados (`ClinicalContext`, `Provenance`).
- `rag-orchestrator/app/application/generation.py` — pasa el bloque etiquetado a `construir_prompt_rag_query()`
  en lugar del resumen embebido.

## Evaluación

Cambia el prompt (`rag-query@0.3.0 → 0.4.0`, tras el *rebase* sobre `l1d-287`, `[S3 resp. 15]`): OL-06
obligatoria. La medición corre sobre la rama rebasada, es decir, sobre el prompt con alias **y** etiquetas, y su
referencia es `main` con `l1d-287` ya mergeado (`rag-query@0.3.0`), para aislar el efecto de las etiquetas.
Métricas afectadas: fidelidad, precisión de citas, "sin evidencia" y salidas prescriptivas (= 0); la recuperación
(recall@10, MRR) no debería moverse porque el texto embebido no cambia, y el reporte lo confirma. `run-ai-eval`
con `LLM_PROVIDER=fake` en el PR; el efecto de las etiquetas sobre el LLM real se observa en la siguiente corrida
con modelo real (US-233, S4).

## Risks / Trade-offs

- [Rebase con `l1d-98` en `clinical-context.builder.ts`] → cambios de B1 mínimos (comentario y refactor del
  repositorio); el segundo en mergear rebasa.
- [Mismo prompt y generador que `l1d-287-alias-chunks-cita`] → orden fijado `[S3 resp. 15]`: l1d-287 primero
  (`0.3.0`), este change rebasa y sube a `0.4.0`; no se reabre ni se altera el formato de alias.
- [El renombre "Contexto clínico" → "Datos del paciente" mueve la salida del LLM real] → medido por `evaluate`;
  si empeora, se conserva el encabezado anterior.
