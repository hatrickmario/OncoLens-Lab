## ADDED Requirements

### Requirement: Familia de opciones con verdad conocida y hasta 3 opciones
La suite `evaluate` MUST ofrecer la familia `opciones`, que ejecuta el análisis con hasta `maxOptions` opciones sobre el dataset sintético `data/evaluation/opciones/` y SHALL reportar M-10.1, M-10.2, fidelidad y precisión de citas, número medio de opciones por análisis, porcentaje de análisis con orden conforme a RN-28 y porcentaje de opciones esperadas presentes entre las mostradas, junto con la configuración usada.

#### Scenario: El reporte de la familia trae todas las métricas de opciones [US-140 AC-1] [AC-T5.1]
- **GIVEN** el dataset `data/evaluation/opciones/` con 12 casos sintéticos (6 de mama y 6 de próstata) y la configuración `eval/configs/s5.yaml`
- **WHEN** se ejecuta `evaluate --suite opciones --config eval/configs/s5.yaml`
- **THEN** el reporte trae el porcentaje de opciones mostradas con al menos una cita y soporte (M-10.1), las salidas mostradas con términos prohibidos (M-10.2), la fidelidad y la precisión de citas (M-07.2), el número medio de opciones por análisis, el porcentaje de análisis cuyo orden respeta RN-28 y el porcentaje de opciones esperadas presentes entre las mostradas
- **AND** el reporte incluye la configuración (modelos, umbrales, `maxOptions`, `catalogVersion`, versión del dataset y de la lista de términos)

#### Scenario: El orden se verifica sobre los resúmenes que devuelve cada análisis [US-140 AC-1] [RN-28]
- **GIVEN** un análisis cuyo generador describe opciones distintas de las esperadas por el caso
- **WHEN** la familia verifica el orden
- **THEN** compara cada par de opciones mostradas consecutivas con el comparador de aplicabilidad de RN-28 usando el resumen y los criterios que el propio análisis devolvió para su fuente más aplicable, y no contra un orden fijo del dataset

#### Scenario: El dataset de la familia no es sintético [US-140 AC-1] [RN-14]
- **GIVEN** un manifiesto de `data/evaluation/opciones/` sin `clase: sintetico`
- **WHEN** se ejecuta la familia
- **THEN** la suite no corre, sale con código 1 y el mensaje nombra la causa sin texto de preguntas ni de salidas

### Requirement: Invariantes de opciones con bloqueo
La familia `opciones` MUST terminar con un código de salida distinto de 0 cuando M-10.1 sea menor que 100 %, M-10.2 sea mayor que 0 o algún análisis muestre opciones en un orden que viole RN-28, y SHALL nombrar en el reporte los ids de caso y la invariante, nunca su texto.

#### Scenario: Una opción mostrada sin soporte bloquea [US-140 AC-2] [M-10.1] [G-2]
- **GIVEN** un resultado donde una opción mostrada no tiene cita válida o su afirmación no pasa el NLI
- **WHEN** termina la familia
- **THEN** sale con código 3 y el reporte nombra M-10.1 y el id del caso

#### Scenario: Un término prohibido en la salida mostrada bloquea [US-140 AC-2] [M-10.2] [RN-23] [G-14]
- **GIVEN** un resultado con un campo mostrado que contiene un término de nivel A o B de la lista de RN-23
- **WHEN** termina la familia
- **THEN** sale con código 3 y el reporte nombra M-10.2, el id del caso, el campo y el id de la regla, sin el texto generado

#### Scenario: Un orden que viola RN-28 bloquea [US-140 AC-2] [RN-28]
- **GIVEN** un análisis que muestra una opción con más excluyentes en No coincide antes que otra con menos
- **WHEN** termina la familia
- **THEN** sale con código 3 y el reporte nombra la violación de RN-28 y el id del caso

#### Scenario: Sin violaciones la familia termina en 0 [US-140 AC-2]
- **GIVEN** la configuración falsa con todos los análisis citados, soportados, sin términos prohibidos y en orden de RN-28
- **WHEN** termina la familia
- **THEN** sale con código 0 y el reporte declara las tres invariantes cumplidas

### Requirement: La opción no comparable va después de toda opción comparable
En los casos con una opción cuya única fuente es no comparable, la familia `opciones` MUST verificar que esa opción, si se muestra, aparece después de toda opción comparable, y SHALL tratar el incumplimiento como violación de RN-28. Verifica una regla vigente (US-125 AC-2 y US-134 AC-4), no la crea.

#### Scenario: La opción no comparable se muestra última [US-140 AC-3] [AC-08.8] [RN-28]
- **GIVEN** los 2 casos del dataset con una opción cuya única fuente es no comparable y el guion `LLM-TRES`
- **WHEN** se evalúan
- **THEN** el reporte verifica que la opción no comparable aparece después de las comparables y la cuenta como conforme

#### Scenario: La opción no comparable antes de una comparable bloquea [US-140 AC-3] [RN-28]
- **GIVEN** un resultado donde la opción no comparable se muestra antes de una comparable
- **WHEN** termina la familia
- **THEN** sale con código 3 y el reporte nombra el caso y la violación de RN-28

#### Scenario: La opción no comparable fuera del tope no cuenta como violación [US-140 AC-3] (Decidido, usuario, 2026-11-03)
- **GIVEN** un caso donde la opción no comparable queda fuera de las `maxOptions` mostradas
- **WHEN** se evalúa
- **THEN** el reporte la registra como «no mostrada» y no la cuenta como violación

### Requirement: Retroceso de fidelidad y precisión de citas con tolerancia en configuración
La familia `opciones` MUST comparar su fidelidad y su precisión de citas con las del reporte de referencia declarado en la configuración (con modelos locales, el reporte del S4 de `l1d-298`; con adapters falsos, `reports/eval/s3-cierre.json`; Decidido, usuario, 2026-11-03, `[S5 resp. 13]`) y SHALL terminar con código distinto de 0 cuando alguna empeore en más de `FAITHFULNESS_REGRESSION_TOLERANCE`, también declarada en la configuración.

#### Scenario: Un retroceso mayor que la tolerancia bloquea [US-140 AC-4] [M-07.2] [RN-22]
- **GIVEN** una fidelidad o una precisión de citas peor que la del reporte de referencia en más de `FAITHFULNESS_REGRESSION_TOLERANCE`
- **WHEN** termina la familia
- **THEN** sale con código 3 y el reporte nombra la métrica, su valor, el de referencia y la tolerancia

#### Scenario: Un retroceso dentro de la tolerancia no bloquea [US-140 AC-4] [RN-22]
- **GIVEN** una fidelidad peor que la de referencia en menos de `FAITHFULNESS_REGRESSION_TOLERANCE`
- **WHEN** termina la familia
- **THEN** no bloquea por retroceso y el reporte muestra la diferencia

#### Scenario: Sin reporte de referencia la familia no corre [US-140 AC-4] (Decidido, usuario, 2026-11-03)
- **GIVEN** una configuración cuyo reporte de referencia no existe o no trae fidelidad ni precisión de citas
- **WHEN** se ejecuta la familia
- **THEN** sale con código 2 y el mensaje nombra la clave de configuración, sin valores por defecto ocultos

### Requirement: Metas iniciales de la familia de opciones sin DEC-07
Mientras DEC-07 no fije metas definitivas, la familia `opciones` MUST comparar fidelidad y precisión de citas con las metas iniciales versionadas (escenario más probable) sin modificarlas, y SHALL marcar «fuera de meta» sin cambiar el código de salida; M-10.1 y M-10.2 son invariantes, no metas.

#### Scenario: Una métrica bajo la meta inicial se marca sin bloquear [US-140 AC-1] [RN-22] [TBD-02] (S5 resp. 3)
- **GIVEN** una fidelidad de 0,85 con la meta inicial de 0,90 y sin retroceso frente a la referencia
- **WHEN** termina la familia
- **THEN** el reporte marca la fidelidad «fuera de meta», cita la meta y su origen (metas iniciales, DEC-07 pendiente) y el código de salida no cambia por ello

### Requirement: Rótulo validado y no validado en la familia de opciones
Cada métrica de la familia `opciones` MUST indicar cuántos casos `revisada_por_oncologo` y cuántos no validados la componen, y SHALL rotularse «validada» solo la calculada sobre los casos revisados.

#### Scenario: Las métricas separan los 4 casos revisados [US-140 AC-5] [AC-T5.3]
- **GIVEN** los 4 casos con `revisada_por_oncologo` = `{rol, fecha}` (sin nombre, RN-10) en el dataset de la prueba
- **WHEN** se genera el reporte
- **THEN** cada métrica indica 4 casos validados y 8 no validados, y solo la calculada sobre los 4 revisados lleva el rótulo «validada»

### Requirement: Reproducibilidad de la familia de opciones
Con la configuración de adapters falsos, la familia `opciones` MUST producir métricas deterministas idénticas en dos corridas con la misma configuración.

#### Scenario: Dos corridas falsas dan las mismas métricas [US-140 AC-6] [OL-06]
- **GIVEN** la configuración falsa `eval/configs/opciones-fake.yaml` (FX-T5a-a + FX-10c-a)
- **WHEN** se ejecuta la familia dos veces
- **THEN** las métricas deterministas y la huella de la configuración son idénticas

### Requirement: La familia de opciones entra en la evaluación obligatoria de los PR
Cuando el diff de un PR toque un disparador de la evaluación (modelo, prompt, umbral, catálogo o corpus), el job `eval-required` MUST ejecutar también la familia `opciones` con la configuración de adapters falsos y SHALL fallar si la familia termina con un bloqueo.

#### Scenario: Un bloqueo de la familia rompe eval-required [US-140 AC-2] [US-074]
- **GIVEN** un PR que cambia un prompt y una familia `opciones` que termina con código 3
- **WHEN** corre `eval-required`
- **THEN** el job falla y su resumen nombra la familia y la invariante, solo con agregados

#### Scenario: Sin disparador la familia no corre [US-074] (Decidido, usuario, 2026-11-03)
- **GIVEN** un PR que solo cambia documentación
- **WHEN** corre `eval-required`
- **THEN** la familia `opciones` no se ejecuta

### Requirement: La mecánica verificada se rotula aparte de la validación clínica
La familia `opciones` MUST contar por separado, en cada métrica, los casos revisados por un oncólogo, los casos con `revision_provisional` (mecánica verificada) y los casos sin revisar, y SHALL reservar el rótulo «validada» a las métricas calculadas solo sobre casos revisados por un oncólogo; una revisión provisional hecha por IA SHALL NOT producir el rótulo «validada».

#### Scenario: Los 4 casos revisados por IA cuentan como mecánica verificada [US-140 AC-5] [AC-T5.3] `[S7 resp. 1]` (asumido: el rótulo `mecanica_verificada` lo añade la revisión clínica provisional)
- **GIVEN** el dataset `data/evaluation/opciones/` con `revision_provisional = {rol: ia, fecha: 2026-11-21}` en OP-01, OP-02, OP-07 y OP-08 y `revisada_por_oncologo = null` en los 12 casos
- **WHEN** se genera el reporte
- **THEN** cada métrica indica 0 casos validados, 4 de mecánica verificada y 8 sin revisar
- **AND** el rótulo de cada métrica es `no_validada`

#### Scenario: Una revisión de oncólogo sigue dando el rótulo validada [US-140 AC-5] [AC-T5.3]
- **GIVEN** un dataset de prueba con `revisada_por_oncologo = {rol, fecha}` (sin nombre, RN-10) en todos los casos de una métrica
- **WHEN** se genera el reporte
- **THEN** esa métrica lleva el rótulo «validada»

#### Scenario: Una revisión provisional mal formada impide cargar el dataset [US-140 AC-5] [RN-10] (asumido)
- **GIVEN** un dataset de prueba con `revision_provisional` con un rol fuera del conjunto admitido, una fecha que no es ISO o un nombre de persona
- **WHEN** se ejecuta la familia
- **THEN** la suite no corre, sale con código 1 y el mensaje nombra el id del caso y el campo, sin texto de la pregunta

### Requirement: El caso OP-08 incluye una fuente de enfermedad sensible a la castración con quimioterapia
El dataset de la familia `opciones` MUST incluir en OP-08 una fuente sintética que describa privación androgénica con quimioterapia en enfermedad sensible a la castración, y la fuente de enfermedad resistente a la castración SHALL seguir mostrándose después de toda opción comparable.

#### Scenario: OP-08 muestra la fuente no comparable al final [US-140 AC-3] [RN-28] `[S7 resp. 1]`
- **GIVEN** el caso OP-08 con la fuente nueva de enfermedad sensible a la castración con quimioterapia y la fuente de enfermedad resistente a la castración
- **WHEN** se evalúa con la configuración de adaptadores falsos
- **THEN** la opción de la fuente de enfermedad resistente a la castración aparece después de las comparables y el caso cuenta como conforme a RN-28
- **AND** el orden esperado del caso coincide con el que calcula el comparador de aplicabilidad

### Requirement: Las preguntas del dataset de opciones están en español
Las preguntas de `data/evaluation/opciones/` MUST estar redactadas en español, y las citas esperadas SHALL seguir siendo texto literal del corpus del dataset.

#### Scenario: Ninguna pregunta copia el texto en inglés de su cita [US-140 AC-1] [RN-04] `[S7 resp. 1]` (asumido en el mecanismo de comprobación)
- **GIVEN** las 12 preguntas del dataset
- **WHEN** corre el test de carga del dataset
- **THEN** ninguna `pregunta` contiene el texto literal de su `cita` en inglés
- **AND** cada `cita` sigue apareciendo de forma literal en un chunk del corpus del dataset

#### Scenario: La familia sigue siendo reproducible con las preguntas en español [US-140 AC-6] [OL-06]
- **GIVEN** el dataset con las preguntas en español y la configuración falsa `eval/configs/opciones-fake.yaml`
- **WHEN** se ejecuta la familia dos veces
- **THEN** las métricas deterministas y la huella de la configuración son idénticas y las tres invariantes se cumplen

### Requirement: La medición real de la familia de opciones queda en un reporte versionado
La medición de la familia `opciones` con modelos locales MUST producirla `run-ai-eval` y quedar versionada en `reports/eval/` con su configuración, el corpus usado, la versión del dataset y la versión del catálogo; ninguna cifra de la familia SHALL citarse sin ese reporte.

#### Scenario: La corrida base deja el reporte de la familia [US-140 AC-1] [AC-T5.1] `[S7 resp. 2]`
- **GIVEN** la corrida base del S7 con `proveedor: local` en la máquina de referencia
- **WHEN** `ai-eval-runner` ejecuta `evaluate --suite opciones`
- **THEN** existe en `reports/eval/` un reporte de la familia con las métricas del AC-1, la configuración, la versión del dataset y la del catálogo, solo con agregados e ids de caso
- **AND** el reporte registra como corpus el del propio dataset `opciones` `[S7 resp. 10]` y los umbrales actuales `[S7 resp. 11]`

#### Scenario: La corrida final se compara con la corrida base del mismo sprint [US-140 AC-4] [M-07.2] `[S7 resp. 2]` (asumido: la referencia pasa a ser el reporte de la corrida base)
- **GIVEN** el reporte de la corrida base y la corrida final con el catálogo y las mejoras del S7
- **WHEN** termina la familia en la corrida final
- **THEN** el reporte muestra fidelidad y precisión de citas frente a las de la corrida base y aplica `FAITHFULNESS_REGRESSION_TOLERANCE`
- **AND** un bloqueo se reporta con los ids de caso, sin cambiar ninguna meta

#### Scenario: La base y la final miden el mismo dataset, corpus y umbrales [US-140 AC-4] [US-140 AC-6] `[S7 resp. 10]` `[S7 resp. 11]` (asumido: política de ventanas del Gate 1 del S7)
- **GIVEN** los cambios del dataset que no dependen del catálogo de `l1d-126` parte B (rótulos, preguntas en español y fuente nueva de OP-08) hechos antes de la corrida base
- **WHEN** se comparan los reportes de la corrida base y de la corrida final
- **THEN** los dos declaran el mismo corpus y los mismos umbrales, y la misma versión del dataset salvo los casos que cambiaron por el catálogo nuevo
- **AND** el reporte de la final nombra por id los casos de OP-07…OP-12 cuyo orden esperado cambió por C-1 o C-5 y los declara no comparables con la base

#### Scenario: Los umbrales calibrados se miden como un brazo aparte [US-140 AC-4] [RN-22] `[S7 resp. 11]` (asumido en el mecanismo)
- **GIVEN** los umbrales calibrados por `l1d-119` en una configuración de brazo propia
- **WHEN** corre ese brazo en la corrida final
- **THEN** produce un reporte propio que declara sus umbrales, y el reporte principal de la final sigue con los umbrales de la base

