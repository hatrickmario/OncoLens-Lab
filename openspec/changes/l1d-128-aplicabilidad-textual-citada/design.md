# Design — l1d-128-aplicabilidad-textual-citada

## Context

US-122 (L1D-127) calcula la aplicabilidad criterio a criterio cuando la fuente trae
`population_criteria` estructurados (US-118), con una regla pura del catálogo y sin LLM. Si el
criterio no tiene valor estructurado, US-122 lo deja `desconocido` (`no_reportado_por_fuente`). Esta
historia añade el camino textual: el LLM **propone** el valor del estudio y su cita, y el sistema lo
acepta solo con cita válida y soporte NLI. Los validadores ya existen en `main`: `validar_citas()`
(`app/domain/citations.py`, US-063) y `VerificadorDeSoporte` / `app/domain/support.py` (US-064), con
`NLI_ENTAILMENT_THRESHOLD` y `503 NLI_UNAVAILABLE`. El NLI es mDeBERTa (ADR-39 fase A); los AC corren
con adapters falsos (FX-08b-a) y el S3 con `LLM_PROVIDER=fake` (`S3-refinamiento.md` §3).

**Decisión del usuario `[S3 resp. 16]` (2026-10-24, hallazgos del Gate 1 del S3):** `studyPopulationValue` entra en
`camposGenerados` con su par Python y su test de coherencia (D7, cierra OQ-3); la versión del prompt de aplicabilidad se
registra en el log y en el `AIAnalysisRecord` junto a la del generador, sin cambio de contrato (D6); OQ-1 decidida
(D4: sin encaje → `desconocido`, el LLM no asigna estado); la llamada de aplicabilidad usa `chunkId` reales y los alias
de `l1d-287` quedan como seguimiento (Risks).

## Goals / Non-Goals

**Goals**
- Un camino textual por criterio y fuente que reutiliza citas + NLI + filtro RN-23 sin duplicarlos.
- Estado asignado por la regla del catálogo de US-122 sobre el valor aceptado (una sola regla).
- Toda propuesta rechazada termina en `desconocido` / `no_reportado_por_fuente`, nunca en un valor inferido.
- Falla cerrada del NLI y del LLM de aplicabilidad.

**Non-Goals**
- Camino estructurado, `parcial` con metadatos, determinismo (US-122); causas `falta_en_paciente`,
  avisos y `populationNotComparable` (US-124); herencia y selección (US-125); UI (US-126).
- Medición del prompt de aplicabilidad con el LLM real (US-233, S4).

## Decisions

**D1 — Cuándo se usa el camino textual.** Por fuente recuperada sobre el umbral y por criterio del
catálogo del tipo de cáncer: solo si `population_criteria` no trae ese criterio (`valor_del_estudio()` de L1D-127 da
`None`: clave ausente, `no_disponible` o forma no leíble) y el destino del criterio es resoluble. Un documento
`metadata_source = pendiente` **entra** (decidido, usuario, 2026-10-27): L1D-127 lo omitía para no atribuirle un «no
reportado» que nadie verificó; aquí el LLM sí revisa el texto recuperado, así que sus criterios son todos pendientes y el
que no se acepta queda `desconocido` / `no_reportado_por_fuente` (AC-4). El criterio con `falta_en_paciente` también
se propone: la causa del `desconocido` no cambia (L1D-127 D5) pero el oncólogo ve qué población exige la fuente. Un criterio
estructurado nunca va al LLM (US-122 AC-6). Con `sin_evidencia` no hay aplicabilidad ni llamada al LLM
(RN-02). Descartada: pedir al LLM todos los criterios y preferir el estructurado (gasta latencia y abre
la puerta a mezclar valores).

**D2 — Una llamada al LLM por consulta, no por criterio.** El puerto recibe la lista
`(externalId, criterios pendientes, chunks recuperados de esa fuente)` y devuelve propuestas
`(externalId, criterion, studyPopulationValue, chunkId)`. Una llamada por consulta mantiene el
presupuesto de p95 ≤ 15 s. El LLM **nunca** devuelve `patientValue` ni `status`: si los devuelve, se
ignoran (ADR-34). Descartada: una llamada por criterio (latencia lineal).

**D3 — Orden de validación por propuesta** (método con nombre propio
`validar_propuesta_de_poblacion()`, RN-01):
1. Criterio y fuente existen en la consulta; si no, se ignora la propuesta.
2. Cita: el `chunkId` es un chunk recuperado **de esa fuente** en esta consulta (`validar_citas()`);
   si no → rechazo sin NLI (AC-3).
3. Filtro RN-23 sobre el valor propuesto como campo generado `studyPopulationValue`
   (`coincidencias_en_campo_generado()`, D7); coincidencia → rechazo sin NLI.
4. NLI: premisa = `chunkTextSnapshot` del chunk citado, hipótesis = `{etiqueta del criterio}: {studyPopulationValue}` (Gate 2: el valor suelto lo implicaría un chunk de varios biomarcadores); soporte
   solo con `entailment` ≥ `NLI_ENTAILMENT_THRESHOLD` (`soporta()` de US-064). Los pares de todas las
   propuestas van en **un único lote de la etapa de aplicabilidad** (`VerificadorDeSoporte.pares_soportados`, mismo
   clasificador y misma falla cerrada). *Desviación* de la versión anterior de D3 («junto con los de las opciones»):
   la aplicabilidad se calcula antes de generar las citas de las opciones y no depende de ellas (L1D-127 D1); unirlos
   obligaría a atar ambas etapas. Coste: dos lotes NLI por consulta en lugar de uno.
5. Aceptado → `studyPopulationValue` = valor propuesto, `citedSources` = `construir_cita()` (copiado del
   corpus, RN-04), `status` = regla del catálogo de US-122 sobre el valor (D4).
6. Rechazado (2, 3 o 4) → `desconocido`, `no_reportado_por_fuente`, `studyPopulationValue = null`,
   `citedSources = []`, `omittedClaims += 1`.
Sin propuesta para un criterio pendiente → `desconocido` sin sumar a `omittedClaims` (AC-4).

**D4 — El estado lo pone la regla del catálogo.** La regla de US-122 (igualdad, pertenencia, rango)
se aplica sobre el valor aceptado tras normalizarlo: `normalizar_valor_al_catalogo()` quita del texto, sin LLM, los
rótulos del propio criterio que el catálogo ya declara (sus etiquetas `es`/`en`, su `studyKey`, su clave y los nombres
de `destination.match`: «HER2 negativo» → `negativo`, «ECOG 0-1» → `0-1`, «estadio I–III» → `I–III`) y, en `igualdad`,
lleva a la clave de `equivalences` el texto que la nombra sin distinguir mayúsculas. `sinonimos.json` del catálogo 1.1.0
está vacío, así que no hay sinónimos que aplicar todavía (cuando los traiga, se leerán del catálogo, no del código).
El **texto mostrado** (`studyPopulationValue`) es el propuesto y verificado, no el normalizado. Si el valor
aceptado no encaja en ningún valor de la regla, el criterio queda `desconocido`
(`no_reportado_por_fuente`) y el LLM **no** asigna estado (OQ-1 decidida `[S3 resp. 16]`). Descartada: que el LLM
asigne el estado y lo valide el NLI (lo permitía la historia; ninguna AC lo cubre y abriría un estado no determinista).

**D5 — Falla cerrada.** Error del NLI → `NliNoDisponibleError` → `503 NLI_UNAVAILABLE` (mismo mapeo
del router que L1D-180); error o salida inválida del LLM de aplicabilidad → `503
LOCAL_LLM_UNAVAILABLE`. Nunca se devuelve aplicabilidad parcial. Sin *fallback* a otro proveedor (RN-12).

**D6 — Prompt real.** Plantilla versionada en `infrastructure/llm/` (junto a la de generación de
L1D-275), en español, sin lenguaje prescriptivo, que pide solo características de la población
descritas en el texto citado y prohíbe usar el contexto del paciente para inferir. Salida JSON validada
con Pydantic; inválida → D5. En el S3 corre `LLM_PROVIDER=fake`; su calidad se mide en US-233.
Versión con nombre propio `VERSION_DEL_PROMPT_APLICABILIDAD = "aplicabilidad-texto@0.1.0"` junto a la plantilla
`[S3 resp. 16]`: cuando el proponente se invocó en la consulta, `meta.promptVersion` =
`<VERSION_DEL_PROMPT del generador>+<VERSION_DEL_PROMPT_APLICABILIDAD>` (un solo token sin espacios, como exige el
reporte de `evaluate`); si no se invocó (todo estructurado o `sin_evidencia`), solo la del generador. `clinical-api`
lo persiste tal cual en `AIAnalysisRecord.promptVersion` (sin cambio de código ni de contrato: `string`) y el log del
análisis registra `applicabilityPromptVersion` aparte. Descartada: un campo nuevo en `meta` (cambio de contrato y de
esquema en ambos backends).

**D7 — `studyPopulationValue` es campo generado (RN-23) `[S3 resp. 16]`.** En el camino textual el valor lo redacta el
LLM; en el estructurado se copia del catálogo. Se añade a `camposGenerados` de
`packages/clinical-language/origen-de-campos.json` y al `Literal` `CampoGenerado` de `app/domain/support.py` (de donde
sale `CAMPOS_GENERADOS`); el test de coherencia JSON ↔ Python de L1D-180 pasa a incluirlo. Efecto: el filtro de D3 y
las revisiones de RN-23 de la suite `evaluate` y de `contracts:check` lo tratan como generado. Un valor estructurado
copiado que contenga un término de la lista no se retira (el filtro de D3 solo corre en el camino textual). Descartada:
solo el filtro de D3 con una nota en el JSON (propuesta inicial de OQ-3; dejaba dos fuentes de verdad).

## Privacidad y ownership

- Datos que cruzan: `clinical-api` → `rag-orchestrator` solo el `clinicalContext` desidentificado ya
  enviado hoy (RN-11; `pseudoPatientId` por consulta, nunca en el prompt). El prompt de aplicabilidad
  **no** incluye valores del paciente: solo criterios y chunks del corpus, porque el LLM propone el
  valor del estudio y la comparación la hace la regla.
- `rag-orchestrator` usa solo el schema `corpus` (catálogo de fuentes, `population_criteria`) y Milvus;
  no toca datos clínicos ni `clinical-minio`.
- Logs: conteos de propuestas (aceptadas, rechazadas por cita, por lenguaje, por NLI), latencia,
  `nliModel` y `traceId`; nunca el valor propuesto, el texto del chunk ni el `pseudoPatientId`.
- RN-12/RN-13: solo modelos locales; datos sintéticos (FX-08b-a).

## Contratos

- Proveedor: `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml` + `contracts/schemas/evidence.yaml`);
  consumidor: `clinical-api` (cliente generado).
- **Sin diff**: `ApplicabilityCriterion` (`studyPopulationValue: string|null`, `unknownReason`,
  `citedSources`), `SourceApplicability`, `omittedClaims` y `ErrorNliNoDisponible` ya existen
  (US-033, L1D-180). Sin ejemplos nuevos en `contracts/examples/` (los handlers de MSW de `clinical-api`
  no cambian). `contracts:check` y `contracts:breaking` se corren como verificación; oasdiff sin
  cambios. Compatible con ADR-26. `meta.promptVersion` sigue siendo `string` (D6) y
  `origen-de-campos.json` es un dato del paquete, no un contrato HTTP (D7).

## Evaluación

Toca un **prompt** nuevo (D6): OL-06 aplica. Métricas afectadas: fidelidad (afirmaciones de población
con soporte), precisión de citas, salidas prescriptivas = 0, y las de aplicabilidad M-08.3 (desconocido
correcto) que mide US-132. En el S3 el PR corre `run-ai-eval` con `LLM_PROVIDER=fake` para verificar
que no hay regresión en las métricas existentes; la medición del prompt con el LLM real es de US-233 (S4).

**D8 — La etapa textual compone el servicio estructurado, no lo modifica.** Clase `AplicabilidadTextual`
(`application/aplicabilidad_textual.py`) que recibe el puerto `ApplicabilityTextProposer` y `VerificadorDeSoporte`, toma la
salida de `ApplicabilityService.evaluar()` y devuelve las mismas `AplicabilidadDeFuente` con los criterios aceptados
(estado, valor y chunk citado), el recuento de afirmaciones omitidas y si se invocó al LLM. `ApplicabilityService`
sigue sin puerto de LLM (garantía estructural de ADR-34 b, L1D-127 AC-2/AC-6); su único cambio es dejar de omitir los
documentos `pendiente`. Descartada: inyectar el puerto en `ApplicabilityService` (como decía la versión anterior de esta
sección): mezclaba el cálculo determinista con la propuesta de un modelo en la misma clase.

## Dependencias y colaboradores

- **Nuevo puerto** `ApplicabilityTextProposer` en `application/ports.py` (`proponer(fuentes) ->
  tuple[PropuestaDePoblacion, ...]`); adapter falso en `tests/support/` (FX-08b-a) y adapter real
  `LlmApplicabilityTextProposer` en `infrastructure/llm/`.
- **Nuevo dominio puro** `app/domain/applicability_text.py`: `PropuestaDePoblacion`,
  `validar_propuesta_de_poblacion()` (RN-01, D3), `criterios_pendientes_de_texto()` (D1) y
  `normalizar_valor_al_catalogo()` (D4). Usa `validar_citas()`, `construir_cita()`, `soporta()` y
  `check_prohibited_terms()` existentes.
- **Nuevo** `AplicabilidadTextual` (`application/aplicabilidad_textual.py`, D8): rama textual tras el camino
  estructurado; el lote NLI pasa por `VerificadorDeSoporte` (sin cliente concreto).
- **Modificado** `ApplicabilityService` (L1D-127): deja de omitir `pendiente` (D1); `CriterioEvaluado` gana
  `chunk_citado_id` (la cita del valor textual aceptado).
- **Modificado** `app/bootstrap.py` y `app/evaluation/composicion_suite.py`: enlace del adapter real (`local`) o del
  falso (suite `evaluate`, `LLM_PROVIDER=fake`).
- **Modificado** `RAGOrchestratorService` (armado de `meta.promptVersion` y log, D6) y `app/domain/support.py` +
  `packages/clinical-language/origen-de-campos.json` (D7).

## Risks / Trade-offs

- La normalización al vocabulario del catálogo puede dejar `desconocido` un valor bien soportado pero
  redactado distinto → mitigado con sinónimos en el catálogo (dato, no código); medible en US-132.
- El NLI sobre frases cortas ("HER2 negativo") puede ser frágil → umbral en configuración; medición US-233.
- Una llamada más al LLM por consulta → latencia; una sola llamada por consulta (D2).
- **La llamada de aplicabilidad devuelve `chunkId` reales** → el LLM real puede copiarlos mal (el fallo que motivó
  `l1d-287-alias-chunks-cita`) y la propuesta se rechazaría por cita (AC-3), dejando `desconocido` un valor soportado.
  Seguro (nunca acepta una cita no recuperada), pero baja la cobertura. **Seguimiento** `[S3 resp. 16]`: extender los
  alias efímeros de L1D-287 a esta llamada en una historia posterior; se mide con el LLM real en US-233.
- `studyPopulationValue` en `camposGenerados` cambia el alcance de `contracts:check` y del recorrido de RN-23 → si un
  ejemplo de `contracts/examples/` trae un valor con un término de la lista, falla; se corre `contracts:check` (tarea
  1.1).

## Migration Plan

Sin migración: no hay esquema ni contrato nuevos (`promptVersion` cambia de valor, no de tipo, D6). Merge tras L1D-126 y L1D-127.

## Open Questions

- ~~OQ-1~~ **Decidida** `[S3 resp. 16]`: valor aceptado que no encaja en la regla → `desconocido`
  (`no_reportado_por_fuente`); el LLM no asigna estado (D4).
- **OQ-2 (asumido, afecta AC-3):** una propuesta con cita ajena suma 1 a `omittedClaims` (es una
  afirmación generada omitida, RN-01). Confirmar.
- **OQ-4 (pregunta al usuario, Gate 2):** ¿degradar a `desconocido` cuando falla el LLM de aplicabilidad, en lugar de `503 LOCAL_LLM_UNAVAILABLE`? Hoy falla cerrada.
- ~~OQ-3~~ **Decidida** `[S3 resp. 16]`: `studyPopulationValue` entra en `camposGenerados` y en `CampoGenerado`, con
  el test de coherencia de L1D-180 (D7).

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-01] (soporte NLI de opciones) → US-064, activa desde S1.
- Regresión [RN-04] (campos de la cita copiados del corpus) → US-063, activa desde S1.
- Regresión [RN-02] (sin evidencia no se invoca al LLM, tampoco el de aplicabilidad) → US-055, activa desde S1.
- Regresión [RN-24] (un análisis previo nunca es premisa del NLI de aplicabilidad) → activa desde S4.
