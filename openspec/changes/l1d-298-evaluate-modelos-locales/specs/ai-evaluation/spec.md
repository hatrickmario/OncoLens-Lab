## ADDED Requirements

### Requirement: La suite evaluate corre con los modelos locales reales
Con `adaptadores.proveedor: local`, `evaluate` MUST componer los adapters reales (NLI, reranker, *embeddings*, generador por Ollama `/v1`) y SHALL escribir en `reports/eval/` un reporte con fidelidad, precisión de citas y «sin evidencia» frente a las metas de TBD-02, con configuración y modelos usados.

#### Scenario: El reporte con modelos reales trae las métricas y la configuración [US-233a AC-1] [M-07.2] [ARR-03 AC-1]
- **GIVEN** la suite con `proveedor: local`, los pesos de ADR-39 y Ollama con el generador en el MacBook de referencia
- **WHEN** se ejecuta `evaluate`
- **THEN** escribe en `reports/eval/` fidelidad, precisión de citas y exactitud de «sin evidencia» comparadas con las metas de TBD-02, junto con la configuración y las versiones de los modelos, sin modificar las metas

#### Scenario: Sin los pesos la suite termina sin cifras [US-233a AC-4] [OL-06]
- **GIVEN** un entorno sin los pesos de algún modelo
- **WHEN** se pide `proveedor: local`
- **THEN** la suite termina con código distinto de 0 nombrando la variable de configuración que falta, no marca PASS y no escribe cifras

#### Scenario: Ningún request sale de la máquina y el resultado solo trae agregados [US-233a AC-3] [RN-12] [RN-14]
- **GIVEN** `proveedor: local` y un dataset `clase: sintetico`
- **WHEN** se ejecuta con el HTTP saliente fingido (`respx`)
- **THEN** todo request va a loopback o `host.docker.internal`, `llamadas_nube_datos_reales` cubre a todos los adapters y vale 0, y el archivo de resultados no contiene textos de preguntas, fragmentos ni salidas

#### Scenario: Un alias de modelo de nube aborta antes de crear el cliente [US-233a AC-3] [RN-12] (asumido, hallazgo del S2)
- **GIVEN** un modelo de Ollama con alias de nube (por ejemplo `x:cloud`)
- **WHEN** se compone la suite local
- **THEN** termina con código distinto de 0 sin enviar ningún request

### Requirement: Lenguaje no prescriptivo medido con el generador real
Con el generador real, `evaluate` MUST medir la propuesta cruda y la salida mostrada, SHALL exigir salidas prescriptivas mostradas = 0 (RN-23) y SHALL anotar cuántas propuestas crudas corrigió el filtro, incluidos los casos fuera del nivel A del S2.

#### Scenario: Las salidas prescriptivas mostradas son 0 con el LLM real [US-233a AC-2] [RN-23] [ARR-03 AC-2]
- **GIVEN** el generador real y `data/eval/fx-rn23` con casos de nivel A y de nivel B
- **WHEN** se evalúan la propuesta cruda y la salida mostrada
- **THEN** las salidas prescriptivas mostradas son 0 y el reporte anota cuántas propuestas crudas corrigió el filtro por nivel

### Requirement: Juez local secundario acotado y de salida estricta
El juez LLM local MUST recibir una sola afirmación y solo los fragmentos que cita, con rúbrica binaria y tres ejemplos, y responder `{"veredicto": "soportada|no_soportada", "cita": "<id>"}` con `temperature` y semilla de configuración. Un veredicto sin cita existente o un JSON inválido SHALL contar como no soportado y contabilizarse.

#### Scenario: El juez solo ve la afirmación y sus fragmentos [US-233a AC-5] [ADR-41] [RN-12]
- **GIVEN** el juez local (Ollama `/v1` fingido en su puerto) y una afirmación con sus fragmentos citados
- **WHEN** juzga la afirmación
- **THEN** el request contiene solo esa afirmación y esos fragmentos, sin la respuesta completa ni el modelo generador, con `temperature` y semilla de configuración

#### Scenario: Un veredicto inválido cuenta como no soportado [US-233a AC-5] [ADR-41]
- **GIVEN** una respuesta del juez con JSON inválido, o con una cita que no está entre los fragmentos
- **WHEN** se interpreta el veredicto
- **THEN** la afirmación cuenta como no soportada y el reporte incrementa el contador de veredictos inválidos

### Requirement: Acuerdo medido del juez, nunca promediado
El reporte MUST incluir el acuerdo juez↔NLI y, cuando exista la muestra del oncólogo, juez↔humano (porcentaje y kappa de Cohen) con la lista de discrepancias. El NLI SHALL seguir siendo el juez principal, sin promediarse con el juez local; bajo `JUEZ_ACUERDO_MINIMO` (configuración) la fidelidad del juez SHALL marcarse «no concluyente».

#### Scenario: El reporte trae acuerdo y discrepancias sin promediar [US-233a AC-6] [ADR-41]
- **GIVEN** veredictos del NLI y del juez local sobre el mismo conjunto
- **WHEN** se genera el reporte
- **THEN** incluye porcentaje de acuerdo y kappa de Cohen juez↔NLI, las discrepancias por id de afirmación y la fidelidad del NLI y la del juez por separado

#### Scenario: Acuerdo bajo el mínimo marca la fidelidad del juez como no concluyente [US-233a AC-6] (asumido el umbral)
- **GIVEN** un acuerdo inferior a `JUEZ_ACUERDO_MINIMO`
- **WHEN** se genera el reporte
- **THEN** la fidelidad del juez aparece «no concluyente» y el juez nunca decide solo

#### Scenario: Sin muestra humana el acuerdo juez↔humano queda sin medir [US-233a AC-6] (asumido, DEC-06 en S5)
- **GIVEN** que aún no existe la muestra revisada por el oncólogo
- **WHEN** se genera el reporte
- **THEN** juez↔humano figura `sin_medir`, no `0`

### Requirement: Recursos del NLI en el reporte local
Con `proveedor: local`, el reporte MUST registrar el RSS máximo de `rag-orchestrator` y la latencia p50 y p95 del NLI por hipótesis y por lote, incluidas las hipótesis de población, y SHALL marcar si el RSS supera el límite de memoria de configuración.

#### Scenario: El reporte registra RSS y latencia del NLI [US-233a AC-7] [ADR47-R7] [M-10.1]
- **GIVEN** el NLI real y el lote de hipótesis de la suite, con reloj inyectado
- **WHEN** se ejecuta `evaluate` con `proveedor: local`
- **THEN** el reporte trae RSS máximo, p50 y p95 del NLI por hipótesis y por lote, y la marca de exceso si el RSS supera el límite configurado, sin ajustar el presupuesto
