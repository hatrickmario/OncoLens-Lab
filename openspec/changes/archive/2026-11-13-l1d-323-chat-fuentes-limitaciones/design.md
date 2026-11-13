# Design — l1d-323-chat-fuentes-limitaciones

## Context

US-266 (capacidad C del chat, AC06): el oncólogo pregunta de dónde sale la evidencia y qué no cubre. El grafo
(`l1d-316-chat-turn-langgraph`) ya trae el nodo esqueleto `fuentes_limitaciones`, el enum cerrado de 8 valores de
`ChatBlock.kind` (incluye `fuente` y `limitacion`) y `StructuredState.ultimaEvidencia?` en el contrato 1.12.0. El nodo
`evidencia` y el seguimiento llegan con `l1d-322-chat-evidencia-seguimiento` (US-265), que **rellena** `ultimaEvidencia`
(`backlog/sprints/S6-glosario-chat.md` §2, vinculante). Lo que ya existe en `main`:

- `apps/rag-orchestrator/app/infrastructure/catalog/catalogo_reader.py`: `LectorCatalogoPostgres.fichas_por_documento()`
  devuelve la `FichaDeFuente` del catálogo (`title`, `source_name`, `language`, `license_class`, `published_at`…) por
  documento, schema `corpus` (dueño Backend 2).
- `apps/rag-orchestrator/app/config/settings.py`: `corpus_cutoff_date` y `corpus_excluded_sources`, los mismos valores
  que `/rag/query` publica en `meta.corpusCutoffDate` y `meta.excludedSources`.
- La regla de citas copiadas del corpus (`evidence-analysis`, RN-04/RN-25) y `/rag/query` con `sin_evidencia` sin LLM
  de generación (US-055, US-238).

## Goals / Non-Goals

**Goals:** nodo `fuentes_limitaciones` determinista que **consume** `ultimaEvidencia` (de L1D-322); reglas de enrutado
para esa intención; bloque `limitacion` de la recuperación también en el turno de análisis `sin_evidencia`; `notices[]`
rellenos en esos turnos.

**Non-Goals:** el nodo `evidencia`, el seguimiento, la persistencia del análisis y el relleno de `ultimaEvidencia`
(L1D-322); cualquier cambio de contrato (este change **no sube versión**, glosario §1); generación de limitaciones con LLM
(US-064); la UI (US-267/US-268); la suite `evaluate` del chat (US-269).

## Decisions

1. **Nodo determinista, sin LLM.** Las fuentes y limitaciones son datos que ya existen; generarlas con el LLM añadiría
   riesgo de metadatos inventados (RN-04) y latencia. Los bloques `fuente` y `limitacion` son deterministas (catálogo,
   configuración o metadatos) y por eso **están exentos** de la regla de cita o enlace (glosario §3, RN-01). Alternativa
   descartada: pasar las citas al LLM para que redacte un resumen (requeriría NLI y podría omitir o deformar metadatos).
2. **Entrada = `StructuredState` del hilo, sin ids de Backend 1.** `ultimaEvidencia = { query, chunkIds[],
   topRelevanceScore | null }` (L1D-322, **sin `analysisId`**) y `citasMostradas[]` (chunkId). Backend 1 la guarda y la
   reenvía al rehidratar (ADR-51), así un hilo rehidratado responde igual en fuentes y limitaciones de la recuperación.
   - documentos citados = documentos de los chunks de `ultimaEvidencia.chunkIds ∩ citasMostradas`, resueltos en el
     catálogo del corpus (chunk → documento, schema `corpus`);
   - fragmentos evaluados por el *reranker* = `len(ultimaEvidencia.chunkIds)`;
   - fecha de corte y fuentes no incluidas = `corpus_cutoff_date` y `corpus_excluded_sources` de la configuración de
     Backend 2, los mismos que publica `/rag/query` (un solo dueño).
   Alternativa descartada: ampliar `ultimaEvidencia` con esos campos o con `analysisId` (contradice el glosario §2 y
   obligaría a subir el contrato).
3. **Bloque `fuente` = un documento, sin `chunkId`** (glosario §2). Su `text` lleva título, `sourceName`, año (de
   `published_at`), idioma y licencia **releídos del catálogo** en el turno por id de documento (`fichas_por_documento`),
   nunca del estado ni del texto generado (RN-04). Sin `citations[]` ni `factRefs`: una `ChatCitation` exige `chunkId` y
   el bloque describe el documento, no un fragmento. Metadato ausente → «No disponible» (RN-25), nunca `0` ni un valor
   inferido. Una fuente con documento retirado (`is_current = false`) se sigue listando con sus metadatos históricos
   (RN-05).
4. **Limitaciones de la evidencia** (criterios «Desconocido», número de `discardedOptions`): salen del último
   `EvidenceAnalysis` que el grafo guarda en el estado **efímero** del hilo (`InMemorySaver`, ADR-51), nunca en
   `structuredState` (no lleva ids ni análisis). Si el hilo fue rehidratado y ese análisis ya no está en memoria, el bloque
   dice la frase fija de FR-10 y que el detalle de criterios y opciones descartadas está en el análisis registrado de la
   conversación, sin inventar valores. Abierto para el humano: si se quiere el detalle también tras la rehidratación,
   hace falta ampliar `ultimaEvidencia` (cambio del glosario, no de este change).
5. **Formato en reglas puras** (`app/domain/chat/fuentes_limitaciones.py`): `bloque_de_fuente(ficha)`,
   `limitaciones_de_la_recuperacion(corte, excluidas, evaluados)`, `limitaciones_de_la_evidencia(analisis | None)`; el
   literal «No disponible» y la frase de FR-10 viven como constantes en un solo módulo (un solo dueño). El año se deriva de
   `published_at`; `null` → «No disponible».
6. **Enrutado**: patrones en `clasificar_por_reglas()` («fuentes», «limitaciones», «de dónde sale», «qué no cubre»)
   para que AC-1 no gaste la clasificación con el LLM. Si la pregunta mezcla evidencia nueva y fuentes, gana `evidencia`
   (regla de precedencia documentada en el módulo).
7. **`sin_evidencia` en el chat**: el nodo `evidencia` (L1D-322) delega en `/rag/query`; este change solo añade al turno
   el bloque de `limitaciones_de_la_recuperacion()` cuando `status = sin_evidencia`. `ultimaEvidencia.topRelevanceScore`
   queda `null` (lo rellena L1D-322).
8. **Avisos (RN-19)**: el turno `fuentes_limitaciones` y el turno `sin_evidencia` llevan en `notices[]` los avisos de IA
   y de uso académico tomados de la configuración de Backend 2, con el literal sin punto final (glosario §3). La UI solo
   los pinta.

## Privacidad y ownership

- **web → clinical-api**: pregunta del oncólogo con sesión opaca; sin cambios en `web`.
- **clinical-api → rag-orchestrator** (JWT de servicio): pregunta enmascarada y `structuredState` con `ultimaEvidencia`
  (pregunta enmascarada, ids de chunk del corpus, un puntaje) y `citasMostradas`. Sin identidad, sin `patientId`, sin
  `analysisId`, sin fechas absolutas del paciente (RN-10, RN-11).
- **rag-orchestrator**: lee solo el schema `corpus` (rol `rag_corpus`) y su configuración; no persiste nada del hilo
  (invariante de US-259 AC-8). Sin LLM en este nodo; el resto del turno solo con LLM local (RN-12).
- Logs: `traceId`, `threadId`, intención y conteos; nunca la pregunta ni los metadatos listados.
- NCCN y ESMO solo aparecen como nombres en «fuentes no incluidas», nunca su contenido.

## Contratos

Proveedores: `rag-orchestrator` (`/chat/turn`, de `l1d-316`; `activeAnalysisId?`/`subintent?` de `l1d-322`) y
`clinical-api` (`ConversationTurn`, de `l1d-315`). **Sin esquemas nuevos**: `fuente` y `limitacion` ya están en el enum
cerrado de `ChatBlock.kind` (1.12.0) y `ultimaEvidencia` en `StructuredState` (1.12.0). `ConversationTurn.blocks[]` usa el
mismo `ChatBlock`. **rag sube a 1.14.0** porque el 503 de `/chat/turn` pasa a declarar `RETRIEVAL_UNAVAILABLE` y
`NLI_UNAVAILABLE` (los esquemas ya existían en `/rag/query`): el nodo de fuentes falla cerrado si el catálogo, las
posiciones o la release no responden, y el seguimiento de `l1d-322` ya lo hacía sin declararlo. Decisión tomada aquí y no
diferida: el costo es una excepción ADR-26 (E-20, tarea H-1) y el contrato no tiene que volver a abrirse en `l1d-326`.
`clinical-api` no cambia de contrato: traduce esos 503 a `502 ErrorServicioIa`.

Ejemplos nuevos (uno por caso, validan contra `ChatTurnResponse`; los de texto con fuentes excluidas usan nombres sintéticos porque `assertExamplesSynthetic` prohíbe NCCN y ESMO fuera de `excludedSources`): `contracts/examples/chat-turn-fuentes-ok.json`,
`chat-turn-fuentes-sin-anio.json`, `chat-turn-fuentes-sin-evidencia.json`, `chat-turn-fuentes-sin-consulta.json`. Con
`notices[]` rellenos, bloques `fuente` sin `chunkId` y `structuredState.ultimaEvidencia` sin `analysisId`.

## Desviaciones y decisiones de la implementación

- **La release sale del puerto `CorpusReleaseReader`**, no de `Settings`: la fecha de corte y las fuentes no incluidas que
  publica `/rag/query` en `meta` salen de la release vigente del catálogo (`corpus_release`), así que el nodo lee la misma
  fuente (un solo dueño). En el turno `sin_evidencia` el nodo `evidencia` las toma de `respuesta.meta`.
- **`limitaciones_del_analisis` vive en `EstadoDelHilo`** (estado efímero, ADR-51), junto a `estructurado`, no dentro de él:
  `EstadoEstructurado` es lo que viaja en `structuredState` y no debe crecer. Un hilo rehidratado lo trae en `None`.
- **Chunks no vigentes**: `PosicionDeChunks` solo resuelve chunks vigentes, así que un chunk citado que ya no lo es no
  produce un bloque `fuente` (se cuenta en el log). Si ninguno resuelve, el turno dice que la última consulta no citó
  ninguna fuente. Listar documentos históricos (RN-05) exigiría un puerto nuevo; queda fuera de este change.
- **Precedencia de enrutado**: se conserva el orden de `l1d-316` (faltantes → fuentes → evidencia): «fuentes» y
  «limitaciones» ganan sobre la palabra «evidencia» (la pregunta del AC-1 la menciona en su variante natural). Se añaden
  «no cubre», «fecha de corte» y «corpus». Una mezcla explícita («qué opciones hay y de qué fuentes») sigue en `evidencia`
  solo si no menciona «fuentes»: ambigüedad aceptada y medida en `evaluate`.
- **Extract Interface `RecuperadorDeEvidencia`** (recuperar, chunks citables, verificar) y `validar_salida_cruda`: deuda de
  `l1d-322` pagada como refactor sin cambio de comportamiento.

## Dependencias y colaboradores

| Módulo | Nuevo/modificado | Depende de |
|---|---|---|
| `app/application/chat/nodo_fuentes_limitaciones.py` | nuevo (rellena el esqueleto) | puerto de catálogo (`fichas_por_documento`, chunk → documento), ajustes del corpus, reglas puras |
| `app/domain/chat/fuentes_limitaciones.py` | nuevo | `FichaDeFuente`, constantes de texto |
| `app/domain/chat/enrutado.py` | modificado | patrones de `fuentes_limitaciones` |
| `app/application/chat/nodo_evidencia.py` (L1D-322) | modificado | + bloque de limitaciones de la recuperación en `sin_evidencia` |

`clinical-api`: sin cambios de código previstos (`structuredState` lo guarda y rehidrata `l1d-315`; el análisis
`sin_evidencia` lo persiste `l1d-322`); solo el Supertest de extremo a extremo de AC-5.

Fakes: catálogo falso (lector en memoria con una ficha sin `published_at`) que pasa la batería de contrato del lector
real (`null` ≠ `0`); LLM falso con contador (FX-12-e).

## Evaluación

Sin prompt de generación nuevo; cambian las reglas de enrutado y un texto fijo de limitación visible. `run-ai-eval` de
regresión (`eval/configs/rn23-local.yaml --suite all`): salidas prescriptivas = 0, «sin evidencia» ≥ 0,90 sin cambio. La
medición de AC06 del chat es de US-269.

## Risks / Trade-offs

- [`ultimaEvidencia` llega sin rellenar porque L1D-322 no ha mergeado] → este change rebasa sobre L1D-322 y no lo define
  por su cuenta.
- [Hilo rehidratado sin el análisis en memoria] → limitaciones de la evidencia degradadas a la frase de FR-10 más la
  referencia al análisis registrado (Decisión 4); fuentes y limitaciones de la recuperación idénticas.
- [Reglas de enrutado ambiguas] → precedencia `evidencia` > `fuentes_limitaciones` documentada; el resto cae al LLM.
