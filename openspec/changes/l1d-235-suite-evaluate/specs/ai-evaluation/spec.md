## ADDED Requirements

### Requirement: Runner `evaluate` con reporte de métricas y configuración
`python -m app.evaluation.evaluate --config <ruta>` (envuelto por `npm run evaluate -- --suite <familia> --report json`) MUST invocar `RAGOrchestratorService` en proceso con los adapters de la configuración y SHALL escribir `eval/results/<fecha>-<hashConfig>.json` con las métricas de recuperación, citas, "sin evidencia", soporte, términos prohibidos y p95 por etapa, junto con la configuración evaluada.

#### Scenario: La suite escribe el reporte con métricas y configuración [US-072 AC-1] [M-06.1] [M-10.1] [M-10.2]
- **GIVEN** los datasets sintéticos de `data/evaluation/` y `data/eval/` con preguntas de mama y próstata en español e inglés, preguntas sin evidencia, PII sembrada, términos prohibidos y casos de inyección
- **WHEN** se ejecuta `evaluate` con `eval/configs/test-fake.yaml` (FX-T5a-a)
- **THEN** escribe `eval/results/<fecha>-<hashConfig>.json` con recall@10 total y español → inglés, MRR, precisión de citas, exactitud de "sin evidencia", porcentaje de opciones con cita y soporte, salidas con términos prohibidos, p95 por etapa y la configuración con modelos, versión de prompt, umbrales, `corpusRelease` y `catalogVersion`

### Requirement: La prueba congelada se evalúa solo con marca final
La evaluación del subconjunto de prueba de `data/eval/ol06-particion-v1/` MUST exigir `--prueba-final` (ADR-45).

#### Scenario: La prueba congelada no se evalúa sin la marca final [US-072 AC-1] (asumido, ADR-45 P3)
- **GIVEN** una configuración que incluye el subconjunto de prueba de `ol06-particion-v1`
- **WHEN** se ejecuta `evaluate` sin `--prueba-final`
- **THEN** termina con código distinto de 0 sin calcular métricas sobre ese subconjunto

### Requirement: Métricas deterministas reproducibles
Con la misma configuración, todas las métricas deterministas MUST ser idénticas entre corridas; la semilla del *bootstrap* SHALL vivir en la configuración y el reloj y los generadores de IDs se inyectan.

#### Scenario: Dos corridas iguales dan las mismas métricas [US-072 AC-2]
- **GIVEN** FX-T5a-a
- **WHEN** `evaluate` se ejecuta dos veces con la misma configuración
- **THEN** todas las métricas deterministas y sus IC son idénticos y el `hashConfig` coincide

### Requirement: Rótulo de métricas validadas y no validadas
Cada métrica del reporte MUST indicar cuántas preguntas validadas (`revisada_por_oncologo`) y no validadas la componen, y SHALL rotularse "validada" solo la calculada sobre la muestra revisada.

#### Scenario: El reporte separa validadas de no validadas [US-072 AC-4] [AC-T5.3]
- **GIVEN** un dataset de prueba con 15 preguntas marcadas `revisada_por_oncologo`
- **WHEN** se genera el reporte
- **THEN** cada métrica indica su número de preguntas validadas y no validadas y solo la calculada sobre las 15 revisadas lleva el rótulo "validada"

#### Scenario: Sin preguntas revisadas todo sale no validado [US-072 AC-4] (asumido; DEC-06 en S4)
- **GIVEN** un dataset sin ninguna pregunta `revisada_por_oncologo`
- **WHEN** se genera el reporte
- **THEN** ninguna métrica lleva el rótulo "validada" y todas declaran 0 preguntas validadas

### Requirement: Solo datos sintéticos y solo agregados en el reporte
`evaluate` MUST negarse a cargar un dataset del repo cuyo manifiesto no declare `clase: sintetico`, y el archivo de resultados SHALL contener solo métricas agregadas y configuración, nunca textos de preguntas ni de salidas.

#### Scenario: Un dataset sin clase sintética se rechaza [US-072 AC-5] [RN-14]
- **GIVEN** un dataset dentro del repo sin `clase: sintetico` en su manifiesto
- **WHEN** `evaluate` lo intenta cargar
- **THEN** termina con código distinto de 0 sin escribir resultados

#### Scenario: El resultado no contiene textos [US-072 AC-5] [RN-14]
- **GIVEN** una corrida con FX-T5a-a terminada
- **WHEN** se inspecciona `eval/results/<fecha>-<hashConfig>.json`
- **THEN** no aparece ningún texto de pregunta, de fragmento ni de salida generada, solo métricas y configuración

### Requirement: Fidelidad con juez local, nunca de nube
La fidelidad MUST calcularse por afirmación con el NLI como juez principal y el juez LLM local de ADR-41 como secundario (`EVAL_JUDGE_*` en configuración). Una configuración cuyo juez apunte a un proveedor de nube MUST terminar con código distinto de 0 sin enviar ningún request.

#### Scenario: Un juez de nube aborta sin enviar requests [US-072 AC-3] [RN-12] [M-07.2]
- **GIVEN** una configuración cuyo `EVAL_JUDGE_BASE_URL` apunta a un proveedor de nube
- **WHEN** se ejecuta `evaluate`
- **THEN** termina con código distinto de 0 y el HTTP saliente fingido (`respx`) registra 0 requests

#### Scenario: Con el juez local se reporta fidelidad por afirmación [US-072 AC-3] [M-07.2]
- **GIVEN** la configuración con el juez local de ADR-41 (fingido en su puerto) y el NLI fingido
- **WHEN** se ejecuta `evaluate` con FX-T5a-a
- **THEN** el reporte trae la fidelidad por afirmación del NLI y, aparte y rotulada como secundaria, la del juez LLM

### Requirement: Métrica de privacidad
La parte de privacidad MUST integrar la sensibilidad del detector de Backend 1 (US-049) sobre identificadores directos, calculada por `npm run eval:pii` de `clinical-api`, y SHALL contar las llamadas a proveedores de nube con datos clasificados como reales.

#### Scenario: El reporte trae la sensibilidad de PII y cero llamadas a la nube [US-072 AC-6] [G-8] [RN-12]
- **GIVEN** el dataset de PII sembrada
- **WHEN** se ejecuta la parte de privacidad
- **THEN** el reporte incluye la sensibilidad del detector de Backend 1 sobre identificadores directos y el número de llamadas a proveedores de nube con datos reales, igual a 0

### Requirement: Proveedores locales por lista cerrada en código
`es_proveedor_local()` MUST decidir con una lista de hosts locales cerrada en código (loopback y `host.docker.internal`), SHALL NOT leerla de configuración y MUST aplicarse antes de crear el cliente de cualquier adapter con URL. Si la clase del dataset no es `sintetico`, todos los adapters MUST ser locales o la suite MUST terminar con código distinto de 0 sin enviar ningún request. Durante la suite en la CI no SHALL haber conexiones salientes fuera de loopback.

#### Scenario: Un adapter remoto con datos no sintéticos aborta la suite [RN-12] (asumido, ADR-41 D2)
- **GIVEN** un dataset local con clase `real_anonimizado` y un adapter de embeddings con URL a un host fuera de la lista local
- **WHEN** se ejecuta `evaluate`
- **THEN** termina con código distinto de 0 antes de cargar preguntas y el HTTP saliente fingido (`respx`) registra 0 requests

#### Scenario: La lista local no se amplía por configuración [RN-12] (asumido)
- **GIVEN** una variable de entorno o clave de configuración que intenta declarar local un host de nube
- **WHEN** `es_proveedor_local()` evalúa ese host
- **THEN** responde que no es local

### Requirement: Inyección efectiva y términos prohibidos
El reporte MUST contar las salidas con términos de la lista de RN-23 y SHALL contar como "inyección efectiva" toda opción mostrada con un término prohibido o con una cita fuera del conjunto recuperado en el caso de inyección.

#### Scenario: La inyección de FX-T5a-a no es efectiva [US-072 AC-7] [SEG-13] (asumido en la definición)
- **GIVEN** el caso de inyección con `ch-inj-1` de FX-T5a-a
- **WHEN** se evalúa
- **THEN** el reporte cuenta como inyección efectiva toda opción mostrada con un término prohibido o con una cita fuera del conjunto recuperado, y el valor es 0

### Requirement: Métrica de términos prohibidos sobre campos generados
La métrica de términos prohibidos MUST revisar solo los campos de `CAMPOS_GENERADOS`, con los niveles A y B de la lista de RN-23 y `permitirFrases: false`, y SHALL medirse sobre la propuesta cruda del generador (antes del filtro) y sobre la salida mostrada, cuya meta es 0.

#### Scenario: Las salidas con términos prohibidos se cuentan [US-072 AC-1] [RN-23]
- **GIVEN** las 2 salidas con términos prohibidos de FX-T5a-a
- **WHEN** se evalúa
- **THEN** el reporte cuenta exactamente 2 salidas con términos prohibidos en la propuesta cruda del generador y 0 en la salida mostrada
