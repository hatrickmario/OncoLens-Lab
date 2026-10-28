# Design — l1d-130-herencia-aplicabilidad-recorte

## Context

Ver `proposal.md` (Why). Estado observado en `apps/rag-orchestrator`:

- `RAGOrchestratorService._validar_citas_y_ensamblar()` ya ejecuta validar citas (L1D-179) → soporte NLI y
  lenguaje (L1D-180) → `_recortar_soportadas()` → `ensamblar_respuesta_con_evidencia()`.
- `app/domain/option_selection.py::recortar_a_max_opciones(opciones, max_options, applicability)` ordena por
  `(-relevance_score, chunk_principal_id)` y **lanza `ValueError` si `applicability` no está vacía**
  ("llega con US-125"); el service le pasa `[]`.
- `respuesta_con_evidencia._opcion_con_evidencia()` rellena `applicabilitySummary` con ceros,
  `populationNotComparable = False`, `perSource = []` y `warnings = []`.
- El contrato (`contracts/schemas/evidence.yaml`) ya define `SourceApplicability`, `ApplicabilitySummary`,
  `EvidenceOption.perSource`, `warnings[poblacion_no_comparable]` y `DiscardedOption.discardReason`.
- La aplicabilidad por fuente (`AplicabilidadDeFuente`: criterios evaluados, `resumen`, `poblacion_no_comparable`)
  la producen `l1d-127` (`ApplicabilityService`), `l1d-128` (camino textual, que **re-incorpora** los documentos
  `pendiente`: entran con todo `desconocido` y el texto aceptado puede cambiar sus criterios) y `l1d-129`
  (causas y avisos; un `desconocido` sin causa lleva `unknownReason = null`). Ya está en el service
  (`_evaluar_aplicabilidad`) y en `applicability[]` de la respuesta. Este change consume su salida, no la calcula.
- Un documento sin fila de población, o con un `metadata_source` que el catálogo no declara, **no tiene** entrada
  en `applicability` (`ApplicabilityService.evaluar` lo omite).
- **Conteos reales de A-M1** (catálogo `test-apl-1.0.0`, sin escala para el estadio, de modo que `estadio` queda
  `desconocido` con `unknownReason = null`): `doc-a1` y un `doc-a6` estructurado como `doc-a1` →
  `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`; `doc-a4` → 1 excluyente en No coincide
  (`estado_her2`) y `{ 0, 0, 1, 4 }`. Los `{3, 0, 0, 2}` de FX-08b-b (backlog) son anteriores; el comparador no
  depende de ellos (gana el de 0 excluyentes) y los tests de este change fijan los reales.
- `maxOptions` llega en `RagQueryInternalRequest`; en `clinical-api` sale de `ANALYSIS_MAX_OPTIONS`
  (`src/config/secciones.ts`, 1 por defecto). Es el nombre vigente (decisión del usuario, 2026-10-24,
  `[S3 resp. 16]`).

## Goals / Non-Goals

**Goals:**
- Un **solo** comparador de RN-28, puro y con nombre propio, reutilizado para elegir la fuente más aplicable
  de una opción y para ordenar opciones; US-134 (S4) lo reutiliza con `maxOptions = 3` sin tocar el service.
- Agregación por opción determinista sobre las `SourceApplicability` ya calculadas.
- Orden **después** de citas y soporte y **antes** del recorte (una descartada nunca ocupa posición).

**Non-Goals:**
- Calcular criterios, causas o avisos (US-122…US-124); orden visible de 3 opciones (US-134); UI (US-062 AC-7,
  US-126); `warnings` de datos del paciente en la opción (`datos_sin_verificar`…), que no se emiten en el S3 →
  US-126, S4 (`[S3 resp. 16]`).

## Decisions

1. **Comparador como clave de orden lexicográfica, no como puntaje.** `applicability_order` en
   `app/domain/applicability_order.py` expone `clave_de_aplicabilidad(excluyentes_no_coincide, coincide,
   relevance_score, desempate_id) -> tuple` = `(excluyentes, -coincide, -relevancia, id)` y se usa con
   `sorted(key=...)`. Una tupla hace explícito que no hay combinación (RN-28, ADR-27) y da un orden total.
   *Descartadas:* `functools.cmp_to_key` con un comparador a mano (más propenso a romper la transitividad);
   un puntaje ponderado (prohibido por RN-28).
2. **Excluyentes en No coincide se cuentan desde los criterios**, no desde `summary.noCoincide` (que incluye
   criterios no excluyentes): `sum(c.isExclusionary and c.status == no_coincide)`. Se extrae
   `contar_excluyentes_no_coincide()` (RN-28) para que viva en un solo lugar.
3. **Relevancia de una fuente dentro de la opción** = la de su chunk citado más relevante, con la función de
   dominio que ya existe, `relevancia_de_opcion()` (RN-03), aplicada a los chunks de esa fuente que la opción
   cita (la misma regla que da la relevancia de la opción; no se reescribe). Asumido: el AC-3 dice "mayor
   `relevanceScore`" sin definir el de una fuente. Desempate final por `externalId` ascendente.
4. **Agregación en `app/domain/applicability_aggregation.py`**: entrada pura `FuenteDeLaOpcion(external_id,
   resumen, excluyentes_no_coincide, poblacion_no_comparable, relevance_score)` (el dominio no importa
   `application/`); `agregar_aplicabilidad_de_opcion(fuentes) -> AplicabilidadDeOpcion(resumen, por_fuente,
   poblacion_no_comparable, avisos)` con la fuente más aplicable vía el comparador;
   `poblacion_no_comparable = all(...)` (con al menos una fuente); `avisos = ("poblacion_no_comparable",)` si
   aplica. `por_fuente` en el orden del comparador (asumido: el AC-1 no fija el orden; así la primera entrada
   coincide con `applicabilitySummary`).
5. **Recorte**: `recortar_a_max_opciones(opciones, max_options)` pierde el parámetro `applicability` y deja de
   lanzar; `OpcionConRelevancia` gana `aplicabilidad: AplicabilidadDeOpcion | None`. Con aplicabilidad (la
   consulta calculó `applicability` no vacía) → clave del comparador sobre la fuente más aplicable, con la
   relevancia de la opción (RN-03) y `chunk_principal_id` como desempate; sin ella (`None`: catálogo sin
   criterios o ninguna fuente evaluable) → regla del S1 sin cambios (el escenario de US-225 AC-3 sigue en
   verde). El service no reimplementa el orden. Ninguna clave es un puntaje combinado: es una tupla (RN-28).
6. **Orden en el service**: citas → soporte → `agregar_aplicabilidad_de_opcion()` por soportada → recorte →
   ensamblado. `_opcion_con_evidencia()` copia resumen, `perSource`, `populationNotComparable` y `warnings` de
   la agregación. La agregación no se aplica a `discardedOptions` (el contrato no la incluye).
7. **Fuente citada sin entrada en `applicability`** (documento sin fila de población o con origen no declarado,
   que `ApplicabilityService.evaluar` omite a propósito): **no es un error**. Se ignora en `perSource`; si
   ninguna fuente citada por la opción tiene entrada, la opción se agrega con resumen en cero, `perSource = []`
   y `populationNotComparable = false`, y ordena con la clave `(0, 0, relevancia, id)` (`desconocido` y la
   ausencia no ordenan, RN-28). *Corrección* de la versión previa de este design (que lanzaba `500`): el
   orquestador ya omite esos documentos, así que fallar cerrado rechazaría respuestas legítimas.
8. **Decisiones del usuario del 2026-10-24 (`[S3 resp. 16]`)**: (a) ejemplos — este change **no crea
   ejemplo propio**; reutiliza el par de `l1d-129` y, si hace falta, actualiza en él los campos de la opción;
   (b) `warnings` de datos del paciente fuera de alcance → US-126 (S4); (c) la variable es
   `ANALYSIS_MAX_OPTIONS` (1 por defecto; es la que existe en `clinical-api/src/config/secciones.ts`, no hay
   `EVIDENCE_MAX_OPTIONS`); (d) orden de archivo de `applicability`: 127 → 128 → 129 → **130** → 182.

## Privacidad y ownership

- Este change no mueve datos nuevos entre servicios: opera dentro de `rag-orchestrator` sobre la
  `applicability` ya calculada a partir del `clinicalContext` desidentificado (RN-11) y del catálogo del corpus
  (schema `corpus`, rol `rag_corpus`). No toca datos clínicos, `identity` ni `clinical-minio`.
- `clinical-api` persiste la respuesta tal cual en `AIAnalysisRecord` antes de responder (RN-06); sin cambios.
- Logs: solo conteos (opciones ordenadas, recortadas, con población no comparable) y `traceId`; nunca
  valores del paciente, del estudio ni texto de opciones (RN-10).

## Contratos

- Proveedor: `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`, schemas compartidos en
  `contracts/schemas/evidence.yaml`); consumidor: `clinical-api` (cliente generado en
  `packages/api-contracts`) y, aguas abajo, `web`.
- **Diff del `openapi.yaml`: ninguno.** Los campos ya existen desde el congelamiento del Pre-S1 (US-033,
  ADR-26); `oasdiff` sin cambios incompatibles.
- **Sin ejemplo propio** (`[S3 resp. 16]`): el par con aplicabilidad es de `l1d-129-aplicabilidad-causas-avisos`
  (`rag-query-aplicabilidad-a-m1.json` interno y `con-evidencia-s3-aplicabilidad.json` público, registrados en
  `index.json`). Este change lo reutiliza y, si hace falta, actualiza en ese mismo par los campos de la opción
  (`applicabilitySummary`, `perSource`, `populationNotComparable`) para que los handlers MSW/`respx` de US-062
  AC-7 no diverjan del contrato.
- Modelos Pydantic de `app/schemas/generated/`: se usan, no se editan.

## Evaluación

- Cambia la selección de la opción mostrada, no modelo, prompt, umbral, catálogo ni corpus. Afecta la
  medición de M-08.x (US-132) y de AC-10.1. Se corre `run-ai-eval` con la suite `evaluate` actual (adapters
  falsos y dataset del S2) para confirmar que fidelidad, precisión de citas, "sin evidencia" y salidas
  prescriptivas no empeoran; las métricas de aplicabilidad las mide US-132.

## Dependencias y colaboradores

- Nuevos (dominio puro, sin E/S): `app/domain/applicability_order.py` (`clave_de_aplicabilidad`,
  `contar_excluyentes_no_coincide`), `app/domain/applicability_aggregation.py`
  (`agregar_aplicabilidad_de_opcion`).
- Nuevo en `application/`: `app/application/aplicabilidad_de_opciones.py` (traduce `AplicabilidadDeFuente` +
  chunks citados a `FuenteDeLaOpcion` y agrega por opción; sin reglas propias).
- Modificados: `app/domain/option_selection.py` (`recortar_a_max_opciones` ordena por aplicabilidad si la
  opción la trae), `app/application/rag_orchestrator_service.py` (paso de agregación antes del recorte),
  `app/application/respuesta_con_evidencia.py` (copia la agregación).
- Dependen solo de tipos del dominio y de los modelos generados; ningún cliente concreto ni puerto nuevo.
- Reglas extraídas con nombre propio: `clave_de_aplicabilidad()` (RN-28), `contar_excluyentes_no_coincide()`
  (RN-28), `agregar_aplicabilidad_de_opcion()` (ADR-31).

## Risks / Trade-offs

- [La forma interna de la aplicabilidad la fijan US-122…US-124] → el dominio de este change define su propia
  entrada mínima (`FuenteDeLaOpcion`) y solo `application/aplicabilidad_de_opciones.py` conoce
  `AplicabilidadDeFuente`.
- [Conflicto al archivar: varios changes del S3 crean `openspec/specs/applicability/`] → requisitos con
  nombres distintos; `bulk-archive` los fusiona.
- [La relevancia por fuente (decisión 3) es un supuesto] → aislada en un método; cambiarla no toca el
  comparador.
- [El orden por aplicabilidad oculta una opción más relevante] → es lo que pide RN-28; la UI declara el
  criterio (US-062 AC-7).

## Migration Plan

Sin migraciones ni datos. Despliegue con el resto del S3; *rollback* = revertir el PR (el recorte vuelve a la
regla del S1).

## Open Questions

- Ninguna abierta. Cerradas por el usuario el 2026-10-24 (`[S3 resp. 16]`): la clave de configuración es
  `ANALYSIS_MAX_OPTIONS`; los `warnings` de datos del paciente en la opción quedan fuera de alcance → US-126 (S4).

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-01] → US-064 (soporte NLI antes del recorte), cubierta por el escenario de US-125 AC-7.
- Regresión [RN-06] → US-053: la respuesta con aplicabilidad agregada se persiste igual (US-124 AC-7).
