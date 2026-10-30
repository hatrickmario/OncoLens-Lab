# Design — l1d-293-estado-criterio-lista-poblacion

## Context

ADR-47 guarda la población del estudio como lista acotada `{value, chunkId, scope}` por documento y criterio (US-241).
Este change calcula, con una función pura, el estado de cada criterio de una opción a partir de **los valores de los
fragmentos que la opción cita**, el valor del paciente copiado del `clinicalContext` (ADR-34) y las tablas del catálogo.
DEC-11 (escenario aceptado, `[S4 resp. 8]`) fija la semántica.

## Goals / Non-Goals

- Goals: reglas puras deterministas, cuatro estados visibles, `partialReason`/`unknownReason`, unidad = fragmento citado.
- Non-Goals: extracción (US-242), contrato (US-241), respaldo (US-244), UI (US-126), orden (US-134), puntajes.

## Decisions

**D1 · Entrada por opción.** `valores_de_la_opcion(opcion, criterio)` = unión de los valores de `population_criteria` cuyo
`chunkId` está entre las citas de la opción; ningún otro fragmento entra, tampoco uno del mismo documento o de la misma
sección (ADR-47 §Consulta). Un valor de un fragmento no citado nunca entra (AC-7). El mismo documento con dos opciones puede dar estados distintos.

**D2 · Estados internos y proyección.** Función `clasificar_poblacion(valores, valor_paciente, catalogo)` →
`EstadoInterno`; `proyectar_estado(interno)` → (`status`, `partialReason`, `unknownReason`):

| Interno | Visible | Motivo |
|---|---|---|
| `exacto` (población específica del perfil) | `coincide` | — |
| `inclusivo` (varios grupos, el paciente en uno) | `parcial` | `partialReason = inclusiva` |
| `mezclado` (fragmento sin desagregar: `study_design = guia` o revisión con varios valores) | `parcial` | `mezclada` |
| `rango_solapado` (rango del estudio que solapa el del paciente, según las tablas del catálogo) | `parcial` | `partialReason = rango_solapado` |
| `solo_subgrupo` (**solo forma antigua**, `{valor, alcance: subgrupo}`; ver D6) | `parcial` | `partialReason = solo_subgrupo` |
| `restringido` (restricción explícita que excluye al paciente) | `no_coincide` | — |
| `en_conflicto` (códigos excluyentes en fragmentos distintos del mismo documento) | `desconocido` | `valores_en_conflicto` |
| `ausente` (sin valor o sin restricción) | `desconocido` | `no_reportado_por_fuente` |
| `sin_regla` (`valor_fuera_de_tabla`, `sin_escala`, `forma_no_comparable`) | `desconocido` | `unknownReason = sin_regla_de_comparacion` |

`partialReason` usa el enum de US-241 (`inclusiva | mezclada | rango_solapado | solo_subgrupo | null`); con `status` distinto
de `parcial` es `null`. El texto visible de `sin_regla_de_comparacion` («? Desconocido · el catálogo no define cómo comparar
este criterio») lo define `l1d-131`; aquí solo se emite el motivo.

Los estados internos no salen en la API; solo los cuatro de RN-28. `scope = subgrupo | mencion` se excluye del cómputo y se
devuelve como contexto en `studyPopulationValues` (`[S4 resp. 8]`, ADR47-R1).

**D3 · Restricción y conflicto desde el catálogo.** La restricción explícita se reconoce por `restrictionMarkers` del catálogo
(es/en: `solo`, `exclusivamente`, `only`, `exclusively`) en el valor; el conflicto por códigos del catálogo excluyentes entre
sí en fragmentos distintos del mismo documento. Rangos y escalas salen de las tablas del catálogo, nunca de texto libre; si
el valor cae fuera de la tabla (`valor_fuera_de_tabla`), el criterio no tiene escala (`sin_escala`) o la forma no se puede
comparar (`forma_no_comparable`), el criterio queda `desconocido` con `sin_regla_de_comparacion`; los sinónimos normalizan y lo que no mapea queda `no_mapeado`
(RN-27). Cambiar la semántica tras la sesión de oncólogos = cambiar el catálogo.

**D4 · Pureza.** Sin E/S, sin LLM, sin reloj ni aleatorios; misma entrada ⇒ misma salida; ninguna función produce puntaje o
porcentaje (RN-28). El resumen de la fuente cuenta por estado visible: un valor `scope = subgrupo` de la forma nueva no
suma a `coincide` ni a `parcial`; `solo_subgrupo` de la forma antigua es `parcial` y suma como tal (D6).

**D5 · Alternativa descartada** (una línea): decidir el estado con el LLM por fragmento; descartada por ADR-34 (verbalización
determinista) y RN-28.

**D6 · Subgrupo: forma nueva frente a forma antigua (decisión explícita, S4).** En la forma nueva, un criterio cuyos
valores citados son solo de `scope = subgrupo` queda `desconocido` con `no_reportado_por_fuente` (AC-6), y su causa visible
es «la fuente no reporta este dato para la población elegible (solo para un subgrupo)» (la UI la deriva de
`unknownReason = no_reportado_por_fuente` con `studyPopulationValues` solo de subgrupo). La forma antigua
(`{valor, alcance: subgrupo}`) **sigue en Parcial** con `partialReason = solo_subgrupo` durante el S4: lectura doble, un
sprint, para no cambiar el estado de análisis ya demostrados (A-M1 × `doc-a1`, US-122 AC-4). Se revisa al retirar el lector
antiguo en el S5.

**D7 · Logs (regla común l1d-291…294).** `poblacion_conflicto` y cualquier otro log de este paso llevan criterio, `chunkId`
y `traceId`; nunca el valor, el texto del fragmento, el prompt ni la salida del LLM (RN-14).

## Dependencias y colaboradores

- Modifica: `app/domain/applicability_rules.py` (extrae `clasificar_poblacion()`, `proyectar_estado()`,
  `valores_de_la_opcion()`, `detectar_conflicto()`, `reconoce_restriccion()`), `app/domain/aplicabilidad_tipos.py`
  (`EstadoInterno`, `MotivoParcial`, `ValorDelEstudio` con `chunk_id` y `scope` desde US-241),
  `app/application/` (`RAGOrchestratorService`, paso de aplicabilidad por opción), `app/domain/applicability_aggregation.py`
  (resumen por fuente con la lista).
- Depende del **puerto** `CriteriosDeAplicabilidad` y del lector del catálogo del corpus de US-241 (nunca de JSON/Path).
- El dominio no importa adapters; el servicio solo orquesta.

## Privacidad y ownership

- Solo valores de catálogo y de fragmentos públicos del corpus más el valor del paciente ya desidentificado en el
  `clinicalContext` (RN-11); ningún dato cruza una frontera nueva (`web` → `clinical-api` → `rag-orchestrator`).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; sin credenciales nuevas. Los logs de forma inválida o conflicto
  registran criterio, `chunkId` y `traceId`, nunca el valor, el texto del fragmento, el prompt ni la salida del LLM (RN-14, D7). Fixtures 100 % sintéticos (A-M2, A-M3, `doc-b*`).

## Contratos

Sin cambios en los `openapi.yaml` ni en `info.version`: `partialReason`, `studyPopulationValues` y
`unknownReason ∈ {valores_en_conflicto, sin_regla_de_comparacion}` los añade US-241
(`l1d-291-poblacion-lista-contrato-migracion`); `populationNotComparable` ya existe en `contracts/schemas/evidence.yaml`. Este change es consumidor de
esos tipos y **productor** de `sin_regla_de_comparacion`; si US-241 no está en `main`, `## contratos` y el cableado esperan, las reglas puras no.
Compatible con ADR-26.

**Ejemplos que este change actualiza (primera sección `## contratos`, commit `contract(L1D-293)`).** Con D2/D3, A-M1 × `doc-a1`
deja el `estadio` («IIA» frente a «I–III», sin escala en el catálogo de test) en `desconocido` con
`unknownReason = sin_regla_de_comparacion`, no con `null`. Los dos ejemplos que hoy lo traen con `null` pasan al motivo nuevo:
`contracts/examples/rag-query-aplicabilidad-a-m1.json` (~:115, `RagQueryInternalResponse`) y
`contracts/examples/con-evidencia-s3-aplicabilidad.json` (~:120, `EvidenceAnalysis`). Solo cambia ese valor; validan con
`contracts:check` contra el enum de `l1d-291` (`evidence.yaml` 1.1.0). `index.json` no cambia.
`con-evidencia-s3-poblacion-no-comparable.json` (`EvidenceAnalysis`) **conserva** su `estadio` con `null` a propósito: representa un
análisis histórico persistido antes de este change y es la fuente del MSW del texto «causa no registrada en este análisis» de `l1d-131`. Así los MSW/`respx` que salen de
ellos no divergen de lo que produce el proveedor. El requisito de la spec principal «Desconocido sin causa cuando el dato no
falta» (`applicability`) se modifica en este change; el escenario de US-125 AC-5 (`evidence-analysis`) lo modifica
`l1d-144` (dueño de ese requisito en el S4), que depende de este change para él.

**Unidad real de `applicability[]` (D-2, gate 2 vuelta 2).** El contrato trae criterios por fuente, no por opción. Cada fuente
de `applicability[]` lleva los criterios de **la opción más aplicable que la cita** (orden de RN-28, ADR-31), calculados con
los fragmentos que cita esa opción; si ninguna opción la cita, con el mejor chunk. Nunca la unión entre opciones: un
`valores_en_conflicto` y el log `poblacion_conflicto` solo nacen entre fragmentos citados por una misma opción. El resumen por
opción (`perSource`, `applicabilitySummary`) usa los fragmentos de cada opción y no cambia. Sin cambio de contrato.

**Tests que fijan la causa antigua.** `test_rag_query_aplicabilidad.py:74` (`[US-122 AC-1]`) asierta `unknownReason = None`
para el estadio: cambia la aserción con el *trailer* `Test-Removal:` (el AC cambió en la spec de este change). El test de
US-125 AC-5 no fija `unknownReason`; gana la aserción nueva sin *trailer*. Los análisis históricos persistidos con `null`
no se reescriben (RN-06): la UI los muestra con «? Desconocido · causa no registrada en este análisis» (`l1d-131`).

## Evaluación

Toca la semántica del catálogo de aplicabilidad (no prompts ni modelos): el PR corre `run-ai-eval` si cambia el catálogo.
La concordancia de estados la mide US-233b. Sin impacto directo en recall/MRR/fidelidad.

## Risks / Trade-offs

- [La sesión de oncólogos cambia la semántica] → el ajuste va al catálogo; solo se re-estima si cambia la proyección.
- [`l1d-291-poblacion-lista-contrato-migracion` sin mergear] → las reglas puras se prueban con tipos propios mínimos; el
  cableado espera a L1D-291.
- [Choque de deltas con US-241/US-244 en `applicability`] → este change solo AÑADE requisitos nuevos.

## Pendientes de definir

- **Restricción explícita y conflicto** (dueño: oncólogo · DEC-11 · afecta: AC-3, AC-5, `partialReason`): señal
  determinista que distingue restricción de valor único, y conflicto sobre la misma cohorte de cohortes/brazos distintos.
  Escenario implementado: `restrictionMarkers` y conflicto = códigos excluyentes en fragmentos distintos del mismo documento.
- **`solo_subgrupo` tras el S5** (dueño: oncólogo · DEC-11 · afecta: AC-8, US-122 AC-4): en el S4 la forma antigua sigue en
  Parcial (D6); al retirar el lector antiguo en el S5, ¿se mantiene o pasa a Desconocido como la forma nueva?
