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
- La `applicability: SourceApplicability[]` por fuente la producen `l1d-127`, `l1d-128` y `l1d-129`
  (el `ApplicabilityService`, sin implementar aún). Este change consume su salida, no la calcula.
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
3. **Relevancia de una fuente dentro de la opción** = máximo `relevanceScore` de los chunks de esa fuente que
   la opción cita (mismo criterio que `relevancia_de_opcion()` de L1D-275, RN-03). Asumido: el AC-3 dice
   "mayor `relevanceScore`" sin definir el de una fuente. Desempate final por `externalId` ascendente.
4. **Agregación en `app/domain/applicability_aggregation.py`**: `agregar_aplicabilidad_de_opcion(fuentes) ->
   AplicabilidadDeOpcion(resumen, por_fuente, no_comparable, avisos)` con la fuente más aplicable vía el
   comparador; `no_comparable = all(f.populationNotComparable)`; `avisos = (poblacion_no_comparable,)` si
   `no_comparable`. `por_fuente` en el orden del comparador (asumido: el AC-1 no fija el orden; así la primera
   entrada coincide con `applicabilitySummary`).
5. **Recorte**: `recortar_a_max_opciones()` deja de lanzar con aplicabilidad no vacía; recibe opciones ya
   agregadas (`OpcionConRelevancia` + `AplicabilidadDeOpcion | None`). Con aplicabilidad → clave del comparador
   sobre la fuente más aplicable con `chunk_principal_id` como desempate; sin ella → regla del S1 sin cambios
   (el escenario de US-225 AC-3 sigue en verde). El service no reimplementa el orden.
6. **Orden en el service**: citas → soporte → `agregar_aplicabilidad_de_opcion()` por soportada → recorte →
   ensamblado. `_opcion_con_evidencia()` copia resumen, `perSource`, `populationNotComparable` y `warnings` de
   la agregación. La agregación no se aplica a `discardedOptions` (el contrato no la incluye).
7. **Fuente citada sin `SourceApplicability`** con `applicability` no vacía: no debería ocurrir (US-122 AC-5
   produce entrada con todo `desconocido` para cada fuente recuperada); se trata como invariante rota → error
   interno `500 ErrorInterno` sin respuesta parcial (falla cerrada). Si US-124 decide otra cosa, solo cambia
   esta rama.
8. **Decisiones del usuario del 2026-10-24 (`[S3 resp. 16]`)**: (a) ejemplos — este change **no crea
   ejemplo propio**; reutiliza el par de `l1d-129` y, si hace falta, actualiza en él los campos de la opción;
   (b) `warnings` de datos del paciente fuera de alcance → US-126 (S4); (c) la variable es
   `ANALYSIS_MAX_OPTIONS`; (d) orden de archivo de `applicability`: 127 → 128 → 129 → **130** → 182.

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
- Modificados: `app/domain/option_selection.py` (`recortar_a_max_opciones` acepta aplicabilidad),
  `app/application/rag_orchestrator_service.py` (paso de agregación antes del recorte),
  `app/application/respuesta_con_evidencia.py` (copia la agregación).
- Dependen solo de tipos del dominio y de los modelos generados; ningún cliente concreto ni puerto nuevo.
- Reglas extraídas con nombre propio: `clave_de_aplicabilidad()` (RN-28), `contar_excluyentes_no_coincide()`
  (RN-28), `agregar_aplicabilidad_de_opcion()` (ADR-31).

## Risks / Trade-offs

- [Los changes de US-122…US-124 aún no existen y pueden fijar otra forma interna de la aplicabilidad] → el
  dominio de este change consume `SourceApplicability` del contrato generado, no un tipo interno suyo.
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
