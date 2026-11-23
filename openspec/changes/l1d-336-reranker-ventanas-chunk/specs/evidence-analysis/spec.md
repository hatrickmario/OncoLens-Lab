# Spec Delta — evidence-analysis

## ADDED Requirements

### Requirement: El reranker puntúa el chunk entero por ventanas con RERANKER_CHUNK_WINDOWS = maximo
Con `RERANKER_CHUNK_WINDOWS = maximo`, el *reranker* MUST puntuar un chunk que no cabe en `RERANKER_MAX_LENGTH` por ventanas solapadas (`RERANKER_WINDOW_OVERLAP`) que cubren todo su texto, y su `relevance_score` SHALL ser el máximo de sus ventanas con la misma normalización a [0,1]. Sigue siendo un metadato secundario: no ordena opciones ni mide solidez clínica (RN-03).

#### Scenario: La evidencia de la segunda mitad del chunk decide su puntaje [US-278 AC-1] [RN-03]
- **GIVEN** `RERANKER_CHUNK_WINDOWS = maximo` y un chunk más largo que `RERANKER_MAX_LENGTH` cuya única ventana con puntaje alto es la última
- **WHEN** se reranquea contra la pregunta
- **THEN** las ventanas enviadas al modelo cubren todos los tokens del chunk y cada una mide como máximo `RERANKER_MAX_LENGTH`
- **AND** el `relevance_score` del chunk es el de su ventana de mayor puntaje, normalizado a [0,1] como el de cualquier otro chunk

#### Scenario: Un chunk que cabe en una ventana se puntúa igual que con primera [US-278 AC-1]
- **GIVEN** `RERANKER_CHUNK_WINDOWS = maximo` y un chunk cuyo par con la pregunta no supera `RERANKER_MAX_LENGTH`
- **WHEN** se reranquea
- **THEN** se envía una sola secuencia al modelo, idéntica a la de `primera`, y el puntaje es el mismo

#### Scenario: El tope de pares cuenta chunks y no ventanas [US-278 AC-1] (asumido)
- **GIVEN** `RERANKER_CHUNK_WINDOWS = maximo` y tantos candidatos como `RERANKER_MAX_PAIRS`, todos más largos que `RERANKER_MAX_LENGTH`
- **WHEN** se reranquea
- **THEN** se devuelve un puntaje por candidato, en el mismo orden, sin rechazar la llamada por el número de ventanas
- **AND** un candidato más que `RERANKER_MAX_PAIRS` sigue fallando con el error del puerto, sin truncar en silencio

#### Scenario: Una ventana sin puntaje no se disfraza de 0.0 [US-278 AC-1] [RN-02]
- **GIVEN** `RERANKER_CHUNK_WINDOWS = maximo` y una sesión de inferencia que no devuelve un logit finito para una de las ventanas
- **WHEN** se reranquea
- **THEN** la llamada falla con el error del puerto y ningún chunk recibe `None` ni un `0.0` por defecto

#### Scenario: La procedencia del reranker no cambia con el modo de ventanas [US-278 AC-1] [IA-07] (asumido)
- **GIVEN** `/rag/query` con `RERANKER_CHUNK_WINDOWS = maximo`
- **WHEN** responde
- **THEN** `meta.rerankerModel` es idéntico al que devuelve con `primera`: modelo, versión y SHA-256, sin el modo ni el solape
- **AND** la respuesta valida contra el spec OpenAPI de `rag-orchestrator` sin ningún campo nuevo

### Requirement: RERANKER_CHUNK_WINDOWS = primera es el valor por defecto y no cambia el resultado
`RERANKER_CHUNK_WINDOWS` MUST valer `primera` por defecto (configuración, RN-22) y, con ese valor, las secuencias enviadas al modelo, los puntajes y la respuesta de `/rag/query` SHALL ser idénticos byte a byte a los de `main`. Un valor fuera de `primera` y `maximo`, o un `RERANKER_WINDOW_OVERLAP` que no deje avanzar la ventana, MUST impedir el arranque nombrando la clave.

#### Scenario: Sin la clave en el entorno el reranker se comporta como en main [US-278 AC-2] [RN-22]
- **GIVEN** la configuración sin `RERANKER_CHUNK_WINDOWS` y un chunk más largo que `RERANKER_MAX_LENGTH`
- **WHEN** se reranquea
- **THEN** el modo efectivo es `primera` y se envía una sola secuencia por candidato, truncada a `RERANKER_MAX_LENGTH` conservando el separador final
- **AND** los puntajes y `meta.rerankerModel` son idénticos byte a byte a los de `main` para la misma entrada

#### Scenario: Un valor inválido impide el arranque [US-278 AC-2] [RN-22]
- **GIVEN** `RERANKER_CHUNK_WINDOWS = promedio`, o `RERANKER_WINDOW_OVERLAP` mayor o igual que `RERANKER_MAX_LENGTH`
- **WHEN** arranca `rag-orchestrator`
- **THEN** el proceso termina con código distinto de 0 y el error nombra la clave, no su valor

### Requirement: La agregación por ventanas es determinista
El puntaje agregado de un chunk MUST ser el mismo para la misma pregunta y el mismo chunk, sin depender del orden ni del lote en que se ejecutan sus ventanas, y el orden final de los chunks SHALL seguir siendo `relevance_score` descendente y `chunkId` ascendente (RN-28, IA-07).

#### Scenario: Dos ventanas empatadas dan el mismo resultado en cualquier orden [US-278 AC-3] [RN-28]
- **GIVEN** un chunk con dos ventanas del mismo puntaje y `RERANKER_CHUNK_WINDOWS = maximo`
- **WHEN** se agrega con las ventanas en un orden y en el inverso
- **THEN** el `relevance_score` del chunk es idéntico en los dos casos

#### Scenario: Dos chunks con el mismo puntaje agregado se ordenan por chunkId [US-278 AC-3] [RN-28]
- **GIVEN** dos chunks cuyo máximo por ventanas coincide
- **WHEN** `/rag/query` ordena los chunks sobre el umbral
- **THEN** el orden es `relevance_score` descendente y, en el empate, `chunkId` ascendente, igual en dos ejecuciones

### Requirement: Ninguna variante de ventanas relaja la regla de sin evidencia
Con cualquier valor de `RERANKER_CHUNK_WINDOWS`, si ningún chunk supera `RELEVANCE_THRESHOLD` la respuesta MUST ser `sin_evidencia` con `topRelevanceScore = null` y sin invocar al LLM de generación; el umbral SHALL compararse con el puntaje agregado del chunk y no cambia con este modo (RN-02).

#### Scenario: Todas las ventanas bajo el umbral dan sin evidencia sin LLM [US-278 AC-6] [RN-02]
- **GIVEN** `RERANKER_CHUNK_WINDOWS = maximo`, chunks largos cuyas ventanas puntúan todas por debajo de `RELEVANCE_THRESHOLD` y un contador en el LLM falso
- **WHEN** se llama a `/rag/query`
- **THEN** la respuesta es `sin_evidencia` con `topRelevanceScore = null`, nunca `0.0`
- **AND** el LLM de generación registra cero llamadas

#### Scenario: El mismo caso con primera da el mismo resultado [US-278 AC-6] [RN-02]
- **GIVEN** el escenario anterior con `RERANKER_CHUNK_WINDOWS = primera`
- **WHEN** se llama a `/rag/query`
- **THEN** la respuesta es `sin_evidencia` con `topRelevanceScore = null` y el LLM registra cero llamadas
