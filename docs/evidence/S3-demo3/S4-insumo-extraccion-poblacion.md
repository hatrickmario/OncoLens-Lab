# S4 · Insumo: extracción de la población del estudio en abanico, con lista acotada por criterio

> Creado el 2026-10-29 como insumo del refinamiento del S4. Nace de OUT-06 y OUT-07 ([`S3-demo-outcomes.md`](S3-demo-outcomes.md)). **No es una historia ni una decisión**: es un análisis para que el usuario decida. Sin IDs `US-`/`ADR-` asignados; Markdown primero, Linear después y solo con aprobación.
> Alcance: cómo obtener, con la mejor calidad posible, el valor de población que el estudio da a cada criterio de aplicabilidad (HER2, receptores hormonales, estadio, línea, menopausia, ECOG) para que los estados Coincide / Parcial / No coincide / Desconocido sean fiables. Es el núcleo de la hipótesis «caso reconstruido → faltantes → opciones más aplicables» (PRD §14).
> **Qué está medido y qué no:** lo medido (bucle de repetición, 6 fallos con `caracteres=4852`, reproducción con variantes) está en OUT-06. Las cifras de este documento marcadas *(estimación)* **no se han medido**; hay que medirlas en un spike.

## 1. Punto de partida (hechos verificados en esta instalación)

1. Hoy hay **dos caminos** para el valor de población de un estudio:
   - **En la ingesta** (`app/application/corpus_metadata/`, US-118/L1D-117): esquema cerrado desde las claves del catálogo, verificación NLI y muestra humana (`metadata_source = extraido_verificado`). La confianza autorreportada del LLM no se usa (RN-25).
   - **En la consulta** (`proponente_de_aplicabilidad.py`, L1D-128): una sola llamada con **todos** los criterios pendientes y **todos** los fragmentos de las fuentes; es la que entra en bucle.
2. El corpus sembrado carga con `metadata_source = fuente_estructurada` y **los 10 documentos tienen todos los criterios en `no_disponible`**. La ruta de ingesta existe, pero no se ejecutó sobre el corpus de la demo; por eso el camino de consulta es el único que opera y siempre devuelve `propuestas=0`.
3. El bucle de OUT-06 está **localizado** (ver §9): aparece con dos fuentes en el mismo prompt + esquema estricto + sin límite de propuestas; con una fuente por llamada o con una línea que limite las propuestas, termina.
3b. El camino de consulta solo conserva **un valor por (fuente, criterio)** («gana la primera»), tarda 10 a 39 s con salida correcta y se cae con un 503 engañoso cuando el modelo se repite.
4. El prompt del proponente **no contiene datos del paciente** (describe solo la población del estudio). Es una propiedad de privacidad que conviene preservar.
5. Recursos: Ollama con contexto 8192 y sin `OLLAMA_NUM_PARALLEL` fijado; LLM de ~17 GB; VM de Docker de 12,65 GiB con `rag-orchestrator` hasta ~10 GiB. El NFR de `/platform/evidence-analyses` es p95 ≤ 15 s (se recalibra en el S5).

## 2. Propuesta: abanico por (documento × criterio) en la ingesta + comparación determinista en la consulta

La idea combinada que pediste (consulta en paralelo por fuente, criterio y fragmento + lista acotada por criterio) funciona mejor si el abanico **corre en la ingesta**, no en la consulta. Razones en §4.

### 2.1 Etapa A · Extracción en abanico (ingesta, por documento y por criterio)

- **Unidad de trabajo:** una tarea por (documento, criterio) o por (documento, todos los criterios), **nunca dos documentos en la misma llamada** (§9: con dos fuentes juntas el modelo etiqueta mal la fuente y se atasca). Cada tarea recibe solo los **k fragmentos más relevantes para ese criterio** (k = 3 a 5, configurable) en lugar de todos los del documento. Selección por la búsqueda ya existente (densa/híbrida, US-112) usando la etiqueta del criterio, más las secciones típicas (Métodos, Elegibilidad, Población).
- **Salida cerrada y corta:** `{"values": [{"value": "...", "chunkId": "...", "scope": "elegibilidad|subgrupo|mencion"}]}` con `maxItems` (p. ej. 3), `value` ≤ 200 caracteres y tope de tokens propio de la tarea (≈ 256 *(estimación)*). Una lista vacía significa «no reportado»; **no** se pide al modelo juzgar la ausencia. Al ser corta y con tope propio, un bucle no puede crecer: en el peor caso se pierde esa tarea, no el documento.
- **`scope`:** distingue lo que el estudio **incluyó** (elegibilidad) de un **subgrupo analizado** o una simple **mención** (en la salida con penalización apareció `TNBC` bajo «receptores hormonales»; era un subgrupo, no la población). Solo `elegibilidad` alimenta los estados; el resto se guarda como contexto.
- **Verificación:** cada valor pasa por el NLI existente con la hipótesis del criterio contra el fragmento citado (el `chunkId` debe ser de ese documento: ya lo exige `validar_citas`). Deduplicación por valor normalizado (minúsculas, sin tildes, sinónimos del catálogo). Si el NLI no soporta el valor, se descarta y se cuenta (`omittedClaims`-like), no se muestra.
- **Paralelismo:** `asyncio.gather` con un semáforo (`POPULATION_EXTRACTION_CONCURRENCY`, RN-22) y cola con reintentos acotados (hoy no hay reintentos por diseño; en la ingesta sí tienen sentido y son seguros: se reintenta **una vez** y con otro `seed`). No hace falta un agente LLM: el reparto es orquestación determinista. Un agente por criterio añade variabilidad y coste sin ganar calidad aquí; el agente de FR-30 (búsqueda complementaria) es otra cosa y sigue en su sitio.
- **Persistencia:** `population_criteria` pasa de un valor a una **lista acotada** por criterio, con procedencia (`chunkId`, versión del prompt y del modelo, resultado NLI, `scope`) y `metadata_source`. Cambia por versión del prompt/modelo/catálogo: se reindexa solo lo cambiado (clave de caché = documento + criterio + versión).
- **Revisión humana:** la muestra existente (≈ 20 min con `PLANTILLA.md`) pasa a ser el **conjunto dorado** de la suite `evaluate` para medir precisión y cobertura por criterio (US-233).

### 2.2 Etapa B · Comparación determinista en la consulta (sin LLM)

- El estado de cada criterio se calcula con reglas puras de dominio sobre `population_criteria` y el dato del paciente, en milisegundos (hoy el cálculo estructurado ya tarda 1 a 8 ms).
- **Semántica de lista (a decidir con el equipo clínico, DEC-01/DEC-11):**
  - Coincide: el paciente cumple **alguno** de los valores `elegibilidad` (p. ej. el estudio incluyó premenopáusicas y posmenopáusicas).
  - Parcial: coincide con una parte del criterio (p. ej. rango de estadio que solo cubre en parte el del paciente).
  - No coincide: solo cuando el estudio declara una **restricción explícita** («solo posmenopáusicas»). **Una lista incompleta no es una exclusión:** si el paciente no está en la lista pero el estudio no declara restricción, el estado es Desconocido, no No coincide.
  - Desconocido: lista vacía, `scope` distinto de elegibilidad, valores en conflicto sin regla, o dato del paciente ausente (con el motivo ya existente: `no_reportado_por_fuente`, `falta_en_paciente`).
- Rangos y escalas (ECOG 0–1, estadio I–III, edad) se resuelven con las tablas del catálogo (`valor_fuera_de_tabla`, `sin_escala`, `forma_no_comparable` ya existen) y no con texto libre.

### 2.3 Etapa C · Respaldo en la consulta (solo si falta metadato)

Si un documento está en `pendiente` (la extracción no corrió o falló), el camino de consulta puede ejecutar **la misma tarea corta** para los criterios que falten, con el mismo esquema, tope de tokens y *deadline* propio. Si falla o se pasa del plazo: el criterio queda Desconocido con aviso y el análisis **no se descarta** (RN-26); código de error distinto de «LLM no disponible». Así desaparece el 503 de OUT-06.

### 2.4 Camino por etapas: la etapa 2 (lista acotada por criterio) es el objetivo del MVP

La etapa 2 es la que da la calidad que pide la hipótesis del RAG de conocimiento. La etapa 1 existe solo para no seguir bloqueando la demo mientras se construye.

| | Etapa 1 · puente (arreglo corto) | **Etapa 2 · objetivo del MVP** |
|---|---|---|
| Qué cambia | Una fuente por llamada, instrucción «máximo N por criterio», `maxItems`, deduplicar, rescatar lo completo; si hay más de un valor distinto → Desconocido con `varios_valores_en_la_fuente` | Extracción en la ingesta (§2.1) con **lista acotada por criterio** y `scope`; comparación con semántica de lista (§2.2); respaldo corto en la consulta (§2.3) |
| Contrato | Solo un valor nuevo en `unknownReason` | `studyPopulationValues[]` con procedencia (`chunkId`, `scope`); el campo antiguo se conserva un sprint y se retira |
| Datos | Ninguno | `population_criteria` en lista, con migración y versión de prompt/modelo/catálogo |
| Efecto en el médico | Desaparece el 503; criterios con varios valores salen Desconocido | Coincide / Parcial / No coincide con todos los valores que el estudio incluyó |
| Riesgo principal | Pierde información (no elige entre valores) | R1–R3: falsos positivos y exclusiones erróneas; exige validación clínica |

**Forma de la lista en la etapa 2.** Objeto con una clave por criterio del catálogo; cada clave, una lista de como máximo `POPULATION_MAX_VALUES_PER_CRITERION` (3, RN-22) elementos `{value, chunkId, scope}`. Sin repeticiones posibles por clave, valores ≤ 200 caracteres (ya validado) y tope de tokens por tarea. Es además la forma que el modelo elige por sí solo cuando no se le fuerza una lista plana (§9, variante sin esquema estricto).

**Qué cubre la lista y qué no.** Una lista de valores de elegibilidad resuelve «incluyó premenopáusicas y posmenopáusicas» (cumple alguno → Coincide). No resuelve por sí sola: restricciones (`solo posmenopáusicas` → No coincide solo si es explícita), conflictos sobre la misma cohorte (→ Desconocido con motivo) ni rangos (se resuelven con las tablas del catálogo). Esas reglas son la DEC clínica del §7.

### 2.5 Más de un hallazgo por fuente: cómo se maneja

Con **una fuente por llamada** el modelo sí puede devolver varios hallazgos: varios criterios y, dentro de un criterio, varios valores. Es lo esperable y está medido (fuente S1 sola: 9 propuestas; criterio `estado_menopausico`: `premenopausal`, `postmenopausal` y `pre-/perimenopausal`, de tres fragmentos distintos, `#0041`, `#0112` y `#0064`). Lo que cambia es que ya no hay bucle: la lista es acotada. El manejo, paso a paso:

1. **Extracción:** hasta `POPULATION_MAX_VALUES_PER_CRITERION` valores por criterio (3 por defecto, RN-22), cada uno con `chunkId`, `scope` y el texto copiado del fragmento. Valores de relleno (`not found`, `no expresado`, `chunkId` `none`) se rechazan (R15).
2. **Normalización y deduplicación:** cada valor se mapea a un código del catálogo (sinónimos es/en; `hormone receptor–positive` y `HR+` son lo mismo). Los equivalentes se funden en uno y conservan todas sus citas. Un valor sin código del catálogo queda `no_mapeado`, nunca inventado ni descartado (RN-27).
3. **Si hay más de los permitidos:** se conservan los de `scope = elegibilidad` primero, luego por relevancia del fragmento (puntaje del reranker) y sección (Elegibilidad, Métodos); se registra `truncado = true` y cuántos quedaron fuera. Con truncado y sin regla clara para decidir, el estado es Desconocido (`varios_valores_en_la_fuente`).
4. **Evaluación con la lista:**

   | Situación en la fuente | Estado |
   |---|---|
   | Varios valores de elegibilidad compatibles entre sí (pre y posmenopáusicas) | Coincide si la paciente cumple alguno |
   | Restricción explícita (`solo posmenopáusicas`) | No coincide si no la cumple |
   | Valores contradictorios sobre la **misma** cohorte | Desconocido con motivo |
   | Valores de cohortes o brazos distintos | Coincide si cumple alguno, con las dos citas visibles |
   | Valores de `scope` subgrupo o mención | No cuentan para el estado; se muestran como contexto |

5. **Qué ve el médico:** hasta 3 valores por criterio, cada uno con su cita (título, fuente y fragmento copiados del catálogo, RN-04/RN-25) y la etiqueta de su alcance.

**Matiz importante: la unidad no es el documento sino el fragmento citado.** Un resumen del NCI o una guía agrupa muchos estudios con poblaciones distintas; una lista «cumple alguno» sobre todo el documento daría Coincide con demasiada facilidad (falso positivo, R1/R18). Por eso en la ingesta los valores se guardan **por fragmento** (valor + `chunkId` + sección), y en la consulta el estado de una opción se calcula solo con los valores que provienen de **los fragmentos que esa opción cita** (o de su misma sección). Así la aplicabilidad de cada opción refleja la población de *esa* recomendación y no la de todo el documento. Esto no se ha probado; es una decisión para el ADR del §7 (punto 1) y para la DEC clínica.

### 2.6 Respuestas clínicas recibidas en la Demo 3 (prevalecen sobre §2.2 y §2.5)

Recogidas en [`S3-demo-cierre.md`](S3-demo-cierre.md) §4 (F-20 a F-24). **Entrada de la DEC, no DEC aprobada.** Donde difieren de las tablas anteriores, mandan estas:

| Situación | Antes (propuesta) | Ahora (respuesta clínica) |
|---|---|---|
| El estudio incluyó varios grupos (pre y posmenopáusicas) y la paciente es de uno | Coincide (cumple alguno) | **Parcial**, clasificado como población *inclusiva* (`poblacion_match: parcial/inclusiva`); Coincide solo si la población es específica y exclusiva de su perfil |
| Fragmento que mezcla poblaciones sin desagregarlas | No definido | **Parcial / incierto**, nunca exacto |
| Valores en conflicto en la fuente | Desconocido con motivo | **Mostrar ambos** valores (con fecha y muestra si constan), estado **indeterminado**, «requiere validación clínica/patológica» |
| Valor ausente en la lista del estudio, sin restricción explícita | Desconocido | Igual (F-21) |
| Unidad de evaluación | Fragmento citado (propuesta, R18) | **Confirmada** (F-22): los fragmentos que sustentan la opción, no el documento |
| Presentación | Hasta 3 valores | **Confirmada** (F-24) con «ver más» |

Consecuencia para el diseño: el dominio necesita estados internos más finos (exacto, inclusivo, mezclado, en conflicto) que se proyectan sobre los cuatro estados visibles, y la UI debería mostrar por qué un criterio es Parcial (inclusivo o mezclado) para no ocultar información.

## 3. Impactos

| Área | Impacto | Esfuerzo (relativo, sin medir) |
|---|---|---|
| **Contrato** `rag-orchestrator/openapi.yaml` | `studyPopulationValue` (texto) → lista acotada de valores con procedencia; posible `scope` y un motivo nuevo en `unknownReason`. **Cambio incompatible** para `clinical-api`/`web` (cliente generado en `packages/api-contracts`, ADR-26): primero el OpenAPI, versión mayor, `contracts/examples/` y los mocks MSW/`respx` (US-213) actualizados | Alto |
| **Modelo de datos** | `corpus.corpus_document.population_criteria`: nueva forma + migración Alembic; `metadata_source`; procedencia por valor. `data-model.md` es la fuente | Medio |
| **Dominio** (`rag-orchestrator`) | Reglas de semántica de lista, exhaustividad, rangos y conflictos; refactor de `aplicabilidad.py` y `applicability_text.py` (TDD estricto: son reglas RN-28) | Alto |
| **Catálogo** (`packages/clinical-catalogs`) | Por criterio: cardinalidad máxima, tabla de equivalencias/sinónimos, tipo (categórico / rango / escala), si admite «cualquiera de». Cambio de **versión** del catálogo → `409` si los backends difieren (RN-29) y revalidación clínica | Medio |
| **UI** (`web`) | La tarjeta de criterio debe mostrar varios valores del estudio, su `scope` y su cita sin ensuciar (panel de criterio, L1D-141), con lenguaje RN-23 y textos de «Desconocido» por motivo | Medio |
| **NLI** | Más hipótesis por documento (≈ criterios × valores); RSS y latencia del NLI ya son deuda (`us-231b` 1.11 → US-233) | Medio |
| **Evaluación (OL-06)** | Suite nueva: precisión y cobertura por criterio, tasa de duplicados, tasa de `finish_reason=length` (**debe ser 0**), concordancia de estados, regresión de «sin evidencia». Conjunto dorado más grande que los ≈ 20 min de revisión actuales | Alto |
| **Operación** | Ingesta más larga (§5) → cola, progreso y reanudación (L1D-116 ya aporta ingesta reanudable); caché por versión; `levantar.sh` debe cargar los metadatos (hoy no) y verificarlos (OUT-04) | Medio |
| **Privacidad** | Mejora: el LLM de extracción nunca ve datos de paciente ni sesión, y la consulta deja de enviar texto del corpus al LLM para este paso. Sin cambios en RN-10/11/12 | Bajo |
| **Latencia de consulta** | Baja: sale el paso de 10 a 39 s del camino crítico (salvo el respaldo de §2.3). Ayuda al NFR p95 ≤ 15 s | Positivo |

## 4. Por qué el abanico va en la ingesta y no en la consulta

- **Latencia:** hay un único LLM local de ~17 GB. Paralelizar N llamadas en la consulta no escala linealmente (cabe un modelo, el KV cache multiplica memoria por `OLLAMA_NUM_PARALLEL`, y el equipo de referencia ya va justo: stack ≤ ~30 GB, margen de 0,7 GB según el runbook). En la ingesta la latencia no importa y el paralelismo se ajusta a lo que la máquina aguante.
- **Calidad:** en la ingesta caben reintentos, doble extracción con comparación, revisión humana y versionado. En la consulta, no.
- **Reproducibilidad:** el valor del estudio queda **fijo y trazable** por versión; dos consultas iguales dan el mismo estado. Hoy dependen de una salida del LLM que puede o no cerrar.
- **Cobertura del MVP:** con 10 documentos es trivial; con cientos, el abanico en la consulta sería inviable y el de la ingesta es un trabajo por lotes.

## 5. Estimaciones a medir (no son resultados)

- Tarea corta: ~1,2k tokens de prompt y ≤ 256 de salida → **~3 a 8 s** por (documento, criterio) *(estimación; hoy la llamada grande tarda 10 a 39 s con 4,4k tokens de prompt)*.
- 10 documentos × 6 criterios = 60 tareas ≈ **3 a 8 min en serie**; 1000 documentos × 8 criterios ≈ **7 a 18 h en serie**, de ahí la cola y la concurrencia *(estimaciones)*.
- Ganancia real de paralelizar en este equipo: **desconocida**; hay que medir con 1, 2 y 4 solicitudes simultáneas y la memoria de Ollama y de Docker.

## 6. Riesgos

Severidad: A = puede dar un estado clínicamente engañoso; M = degrada calidad o plazo; B = molestia.

| # | Riesgo | Sev. | Mitigación | Dónde cubrirlo |
|---|---|---|---|---|
| R1 | **Falso positivo de población** (valor de un subgrupo o de una mención tomado como elegibilidad) → Coincide indebido | A | `scope`, NLI contra el fragmento, política asimétrica: ante duda, Desconocido; revisión humana de la muestra; métrica de precisión por criterio con meta explícita | Extractor + `evaluate` + DEC clínica |
| R2 | **Lista incompleta tratada como exclusión** → No coincide indebido | A | No coincide solo con restricción explícita; ver §2.2; tests de aceptación por caso | Dominio |
| R3 | **Conflicto entre valores** de una misma fuente (p. ej. dos HER2, A-2 de la guía S3) | A | Regla explícita (Desconocido + motivo) validada por los oncólogos (A-2, US-124) | DEC + dominio |
| R4 | **Bucle de repetición** vuelve a ocurrir en tareas cortas | M | Tope de tokens por tarea, `maxItems`, deduplicación, rescate de lo completo, métrica `finish_reason=length` = 0 en `evaluate` y en CI | Extractor + CI |
| R5 | **Corrupción de `chunkId`/valor** (penalizaciones de repetición, copia imperfecta) | A | No usar `frequency_penalty` alto; validar `chunkId` contra el documento; el valor se verifica con NLI y se compara con el texto del fragmento (subcadena normalizada) | Extractor |
| R6 | **Cambio incompatible de contrato** rompe `clinical-api`/`web`/mocks | M | Contract-first (`sync-contracts`, `oasdiff`), versión mayor, ejemplos nuevos, migración por fases (aceptar ambas formas un sprint) | Primer ítem del sprint |
| R7 | **Memoria**: NLI + LLM + Docker en el equipo de referencia | M | Spike de capacidad; concurrencia configurable; ejecutar la ingesta con la demo apagada | Spike S4 |
| R8 | **Deriva por modelo/prompt/catálogo**: todos los metadatos quedan obsoletos | M | Versionar (prompt, modelo, catálogo) en cada fila, reindexación selectiva, `evaluate` obligatorio por PR (OL-06) | Pipeline |
| R9 | **Gold set pequeño**: la métrica no es estadísticamente fiable | M | Ampliar la muestra humana (p. ej. ≥ 30 documentos × criterios), estratificar por tipo de fuente (guía, ensayo, publicación) y por idioma (es/en) | US-233 |
| R10 | **Texto en español/inglés**: el valor se copia en el idioma del fragmento y el catálogo puede no reconocerlo | M | Sinónimos bilingües en el catálogo (ya hay `etiqueta_es/en`); normalización antes de comparar | Catálogo |
| R11 | **Coste de la ingesta** crece con el corpus y bloquea la actualización | B | Cola reanudable, caché, lotes nocturnos, medir tiempo por documento | Operación |
| R12 | **UI sobrecargada** con listas largas | B | Máximo visible 3 + «ver más», mismo criterio de orden y lenguaje RN-23; `visual-check` | UI |
| R13 | **Licencias/fuentes**: extraer de documentos con licencia no aceptada | M | La ingesta ya filtra por licencia (RN-21, ADR-36); no cambia, pero el extractor debe correr solo sobre lo aceptado | Ingesta |
| R14 | Tentación de **«arreglar» con temperatura >0 o penalizaciones** | M | Descartado por medición (OUT-06): cambia el modo de fallo y no lo elimina | Decisión registrada |
| R15 | **Valores de relleno** del modelo (`"not found"`, `"no expresado"`, `chunkId` `"none"`) tomados como dato | A | Rechazar por lista de marcadores y por NLI; exigir `chunkId` del documento; instrucción explícita de omitir; test con adaptador que los emite | Extractor |
| R16 | **Etiqueta de fuente equivocada** con varias fuentes en una llamada (observado en 3 de 6 tareas por criterio) | A | Una fuente por llamada; la fuente no la elige el modelo: el código la fija al construir la tarea | Extractor |
| R17 | **Generalizar con una sola pregunta**: la causa del bucle se investigó con el tamoxifeno y un conjunto de fuentes | M | Repetir con ≥ 20 preguntas/pares de fuentes en `evaluate` y medir la tasa de cortes por longitud antes de dar la causa por cerrada | Evaluación |
| R18 | **Documento de revisión o guía con varias poblaciones**: «cumple alguno» sobre todo el documento da Coincide indebido | A | Valores por fragmento y evaluación solo con los fragmentos citados por la opción (§2.5); `scope`; métrica de precisión por tipo de fuente (guía, revisión, ensayo) | ADR + dominio + `evaluate` |

## 7. Candidatas para los próximos sprints (sin IDs; el usuario decide)

**Antes del refinamiento del S4 (arreglo corto del bloqueo de la demo, independiente de este diseño):** salida del proponente con `maxItems` + deduplicación + rescate de propuestas completas + degradación a Desconocido con código de error propio (OUT-06, correcciones 2 y 3). Entra como corrección de L1D-128.

**S4**
1. **ADR** «extracción de población en abanico y lista acotada»: alternativas (consulta vs ingesta, un valor vs lista, `scope`), semántica de lista y política asimétrica. Revertir es caro (contrato + datos) → 3 propuestas con exploración, como indica el proceso.
2. **Spike de capacidad y paralelismo** en el equipo de referencia (1/2/4 solicitudes, memoria de Ollama, NLI y Docker) y tiempos reales por tarea. Su código no se mergea.
3. **DEC clínica** con los oncólogos: semántica de lista (cualquiera de), qué cuenta como restricción explícita, conflicto entre valores (A-2) y lista final de criterios excluyentes (DEC-01/DEC-11).
4. **Contrato + migración** (lista acotada, `scope`, motivo nuevo, versión mayor, ejemplos, mocks), primero el OpenAPI.
5. **Extractor en abanico** (tarea corta, esquema cerrado, topes, NLI, deduplicación, caché por versión) con la suite `evaluate` ampliada y el conjunto dorado (extiende US-233).
6. **Dominio de estados con listas** (TDD estricto, doble bucle) y ajuste de `perSource`/`applicability` en la respuesta.
7. **Datos de demo** de OUT-07: documentos y pacientes que produzcan Coincide, Parcial y No coincide verificables.

**S5:** UI de varios valores y `scope`; herramienta de revisión humana (muestra más grande); reindexación selectiva por versión; `levantar.sh` con carga y verificación de metadatos (OUT-04/05); recalibrar la latencia sin el paso de 10 a 39 s.

**S6 / si hay capacidad:** extracción doble con comparación y calibración de confianza por señales deterministas (no la autorreportada), métricas de deriva y runbook de reindexación.

## 8. Qué se decide ahora y qué después

- **Ahora (S4, antes de construir):** ingesta vs consulta (recomiendo ingesta con respaldo corto), forma de la lista y semántica de «No coincide». Son las decisiones caras de revertir.
- **Después:** valores de configuración (k fragmentos, `maxItems`, tope de tokens, concurrencia), umbral NLI y metas de precisión; todos en configuración (RN-22) y calibrables con `evaluate`.
- **No hacer:** subir temperatura o penalizaciones como arreglo; subir el tope de tokens; añadir un tope de iteraciones de búsqueda (no aplica a este fallo, ver OUT-06).

## 9. Evidencia sobre la causa del bucle (resumen; detalle en OUT-06)

Reproducción con la petición capturada de la pregunta del tamoxifeno, a temperatura 0, una ejecución por variante:

| Variante | Termina | Propuestas (distintas) | Tiempo |
|---|---|---|---|
| Original: 2 fuentes + esquema estricto + sin límite | no (`length`) | 25 (5), una ×21 | 40 s |
| Sin esquema estricto | sí | forma `fuente → criterio → [valores]` | 22 s |
| + «como máximo UNA propuesta por fuente y criterio» | sí | 6 (6) | 11 s |
| Solo S1 / solo S2 | sí / sí | 9 (9) / 2 (2) | 13 s / 4 s |
| Una tarea por criterio (2 fuentes) | las 6 sí | 2 a 7 por tarea | 5 a 11 s (≈ 47 s en serie) |

Probabilidades de los tokens: el modelo elige continuar la lista con p ≈ 1,0 tras cada propuesta, desde la primera, y repite con p ≈ 0,997; cerrar la lista tiene p ≈ 0. La temperatura 0,3 no cambia la salida; a 0,7 se pierde el determinismo. **Lectura:** el esquema estricto con una lista abierta, dos fuentes y ninguna instrucción de límite no ofrece una salida natural de parada, y el cambio de fuente (S1 → S2) es donde el modelo se atasca. Las dos fuentes juntas también provocan etiquetas de fuente incoherentes. Dividir por fuente y poner un límite explícito elimina el bucle en estas pruebas. Las cifras son de **una** pregunta; ver R17.

## 10. Acción al inicio del S4: crear las tareas en Linear

**Al empezar el S4 (en el refinamiento, `/sprint-refine`) se deben crear en Linear las tareas derivadas de esta investigación**, a partir de §7 y de los outcomes OUT-06 y OUT-07 de [`S3-demo-outcomes.md`](S3-demo-outcomes.md):

1. Arreglo corto del proponente de aplicabilidad (una fuente por llamada, límite de propuestas, rescate, degradación; OUT-06) — corrección de L1D-128.
2. ADR de extracción de población en abanico y lista acotada (incluye la unidad «fragmento citado», §2.5), con 3 propuestas.
3. Spike de capacidad y paralelismo en el equipo de referencia (sin merge de código).
4. DEC clínica con los oncólogos (semántica de lista, restricción explícita, conflictos, A-2).
5. Contrato + migración (lista acotada, `scope`, motivo nuevo, versión mayor).
6. Extractor en abanico + suite `evaluate` ampliada y conjunto dorado (extiende US-233), con la repetición de la causa del bucle en ≥ 20 casos (R17).
7. Dominio de estados con listas (TDD estricto).
8. Datos de demo con Coincide, Parcial y No coincide (OUT-07).
9. Mejoras de instalación (OUT-04 verificación del seed, OUT-05 limpieza inicial, reconstruir la imagen del seed) y las demás de `S3-demo-outcomes.md`.

**Condiciones del proceso del proyecto:** el Markdown es la fuente y Linear el espejo; se crean borradores en `backlog/features/` primero y la publicación en Linear **solo con aprobación explícita** del usuario. Los IDs publicados son inmutables. El workspace de Linear estaba **en su límite de issues** al cierre del S3 (ver `S3-deuda.md` y `S2-arrastre.md`): hay que liberar cupo, como se hizo con `V2-Post-MVP.md`, o decidir qué se registra como tarea de una historia existente. Nada se ha creado en Linear todavía.
