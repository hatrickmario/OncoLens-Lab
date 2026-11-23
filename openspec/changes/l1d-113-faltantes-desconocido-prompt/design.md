# Design — l1d-113-faltantes-desconocido-prompt

## Contexto

`POST /rag/query` recibe `RagQueryInternalRequest.clinicalContext` ya desidentificado por `clinical-api`. Desde el S3
(`l1d-98`), `missingCriticalData` trae **claves** de `datos-criticos.json` (p. ej. `estado_menopausico`, `ki67`) y
`currentLine` la línea actual (`integer | null`). Hoy:

- `app/prompts/rag_query.py` (`PromptBuilder` de US-057, `rag-query@0.6.0`): `bloque_de_datos_del_paciente()` se arma con
  `datos_del_contexto()` (diagnóstico y biomarcadores con su etiqueta de procedencia, RN-07). Los faltantes no aparecen.
- `app/application/resumen_contexto.py` (`RetrievalQueryBuilder` de la historia): `resumen_del_contexto_clinico()` embebe
  el mismo `datos_del_contexto()` sin etiquetas y lo busca junto con la pregunta en la rama dense
  (`_recuperar_dense`). La rama sparse y la reescritura (US-238) usan solo la pregunta.
- `app/application/contexto_del_paciente.py` ya pasa los faltantes a la aplicabilidad (US-124); no cambia.
- `rag-orchestrator` no lee `datos-criticos.json`: solo `aplicabilidad.json`, `poblacion-reglas.json` y `sinonimos.json`
  del catálogo montado (`CLINICAL_CATALOG_PATH`), con la versión exigida antes de cualquier borde (`409`).

## Objetivos / No objetivos

**Objetivos:** AC-1…AC-5 de US-116 con el mínimo cambio en dos constructores existentes y una validación en el borde de la
aplicación. **No objetivos:** ver `proposal.md` §Fuera de alcance.

## Decisiones

### 1 · Etiquetas de los faltantes desde el catálogo montado (AC-1, AC-3)

Nuevo adapter de solo lectura `app/infrastructure/catalogo_clinico/datos_criticos.py`
(`cargar_datos_criticos(catalogos, tipos)`), con el mismo patrón que `aplicabilidad.py`: lee una vez al arranque
`<catálogo>/<tipo>/datos-criticos.json` de cada tipo del manifiesto, valida con Pydantic estricto (`key` con
`^[a-z0-9_]+$`, `label.es` no vacío) y falla cerrado (`CatalogoNoDisponible`) si falta o es inválido. Expone un puerto de
dominio `EtiquetasDeDatosCriticos.etiqueta(tipo_de_cancer, clave) -> str | None` (en `app/application/ports.py`), cableado
en `bootstrap.py`.

- Se usa `label.es`: la plantilla del prompt es española (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`; el idioma de la respuesta lo fija la instrucción
  «Redacta en …», no el bloque de datos).
- *Alternativa descartada:* que `clinical-api` envíe la etiqueta en el payload — cambia el contrato, duplica la fuente y
  mezcla texto con claves (RN-11).

### 2 · Validación de claves antes de cualquier puerto (AC-3, RN-11)

Función pura de dominio `claves_de_faltantes_invalidas(claves, conocidas) -> tuple[int, ...]` (índices, nunca valores)
en `app/domain/`. `RAGOrchestratorService.consultar()` la aplica **después** de `exigir_catalogo_de_la_solicitud` (`409`
primero: con otra versión las claves no son comparables) y de `_exigir_tipo_habilitado`/tipo registrado, y **antes** de
detectar idioma, embeber, buscar o invocar al LLM. Un índice inválido lanza `FaltanteNoCatalogadoError` (nueva
`ErrorDeAplicacion`), que `app/api/errors.py` traduce a `422` con el cuerpo `ErrorValidacion` ya declarado
(`error = CUERPO_INVALIDO`, `detail[].loc = ["body", "clinicalContext", "missingCriticalData", <i>]`, `msg` genérico,
`type = "faltante_no_catalogado"`), **sin eco** del valor recibido (RN-10/RN-11). El log registra solo `traceId` y el
número de claves inválidas.

- Un elemento que no cumple `^[a-z0-9_]+$` es inválido aunque el catálogo tuviera una clave igual tras normalizar: no se
  normaliza (texto libre ≠ clave).
- *Alternativa descartada:* añadir `pattern` a `missingCriticalData.items` en `openapi.yaml` — estrecha la entrada
  (incompatible para `oasdiff`, ADR-26) y no cubre la pertenencia al catálogo, que exige la regla de aplicación de todos
  modos.

### 3 · Líneas «desconocido» en el bloque de datos del paciente (AC-1, AC-5)

`bloque_de_datos_del_paciente(contexto, etiquetas)` añade, **después** de los datos presentes y dentro del mismo bloque
`Datos del paciente`, una línea `- <etiqueta>: desconocido` por clave, en el orden en que llegan (determinista; el
checklist de `clinical-api` ya las ordena). Sin faltantes, el bloque es idéntico al actual. La instrucción de la plantilla
añade, en positivo y sin términos de RN-23: «Los datos marcados como "desconocido" no se conocen; descríbelos como "sin
dato registrado (desconocido)" y no les atribuyas un valor». Es el vocabulario unificado del S5 para un dato crítico
ausente (nunca «no disponibles», que en RN-25 significa metadato de fuente ausente). La constante `VALOR_DESCONOCIDO = "desconocido"` vive en el módulo del prompt
(texto del prompt versionado con él, no RN-22). `VERSION_DEL_PROMPT` pasa a `rag-query@0.7.0`, versión **definitiva**
(`l1d-79` no toca `rag-orchestrator`).

- Las líneas «desconocido» no llevan etiqueta de procedencia (no hay dato). `datos_del_contexto()` **no** cambia: sigue
  siendo la fuente de los datos presentes; los faltantes van por una función hermana `faltantes_del_contexto()`.

### 4 · Consulta de recuperación con la línea actual (AC-2)

`resumen_del_contexto_clinico(contexto)` añade `línea de tratamiento {n}` (P-1, Decidido (usuario, 2026-11-03)) cuando `currentLine` no es
`null`; **no** añade nada por `missingCriticalData` (ni la etiqueta ni «desconocido»: embeber «Ki-67 desconocido»
acercaría chunks sobre Ki-67 sin dato del paciente). El literal vive junto al resumen, versionado con él. Solo la rama
dense lo usa (sin cambio en sparse ni en reescritura). El *reranker* sigue puntuando contra la pregunta original (RN-03).

### 5 · RN-02 intacta (AC-4)

La validación y los nuevos textos no tocan el corte por umbral ni el segundo loop: con faltantes y `Q-SIN`, la respuesta es
`sin_evidencia`, `topRelevanceScore = null`, el LLM de generación con cero invocaciones y el de reescritura como mucho una
(US-238), y la reescritura recibe solo la pregunta, nunca los faltantes.

## Dependencias y colaboradores

| Archivo | Cambio | Solape |
|---|---|---|
| `app/prompts/rag_query.py` | plantilla, `bloque_de_datos_del_paciente`, `faltantes_del_contexto`, versión | ninguno en el S5 |
| `app/application/resumen_contexto.py` | línea actual | ninguno en el S5 |
| `app/application/rag_orchestrator_service.py` | validación antes de los puertos | `l1d-306` (NFC en `app/api/rag_query.py`, no en el service), `l1d-268` (seguimiento) |
| `app/infrastructure/catalogo_clinico/datos_criticos.py`, `bootstrap.py` | lector nuevo | `l1d-268` (cableado en `bootstrap.py`) |

**Sin conflicto con `l1d-79`** (US-093): ese change solo toca `apps/clinical-api` (contexto del payload); no toca
`rag-orchestrator`, el prompt ni el resumen embebido, así que no hay orden de merge que coordinar y `rag-query@0.7.0` es
definitiva.

## Privacidad y ownership

- `rag-orchestrator` sigue sin acceso a datos clínicos: solo lee el catálogo montado de solo lectura (datos, no PHI) y el
  `clinicalContext` ya desidentificado del request.
- **RN-11:** a la IA viajan **claves** del catálogo convertidas a **etiquetas del catálogo**; ningún texto libre de
  `missingCriticalData` llega al prompt ni al embedding: lo que no es clave catalogada se rechaza con `422` antes de
  cualquier puerto. El `pseudoPatientId` sigue fuera del prompt.
- **RN-10/RN-14:** el `422` y el log no repiten el valor recibido (índice y conteo, sin contenido).
- **RN-12:** sin cambios de proveedor; solo modelos locales con datos reales.

## Contratos

Sin cambio de **esquema** ni de `info.version` (ADR-26): `ClinicalContext.currentLine`, `ClinicalContext.missingCriticalData` y
`ErrorValidacion` (`CUERPO_INVALIDO`) ya existen y los ejemplos `contracts/examples/rag-query-request*.json` ya traen claves
catalogadas. Gate 2 (contract-keeper) pidió describir el comportamiento observable nuevo: un commit `contract(L1D-113)` solo de
**descripción** (como L1D-306) en el `422` de `/rag/query` y de `/rag/follow-up` y en `missingCriticalData`, acotado a esas dos
rutas (`/case/summary` no aplica; alinearlo era deuda D5-25 y, por `[S7 resp. 12]`, sale del S7 a deuda Post-MVP D7-01: cambiaría el contrato). El commit va tras los de test y feat (orden invertido benigno:
solo texto). No se añade `pattern` al esquema (estrecharía la entrada: incompatible).

## Evaluación

Cambian el **prompt** (`rag-query@0.7.0`) y la **consulta de recuperación** (rama dense): `ai-eval-runner` obligatoria
(OL-06).

- **CI (fakes):** `run-ai-eval` con adapters falsos: sin regresión de fidelidad, precisión de citas, «sin evidencia» ni
  salidas prescriptivas (= 0) frente al baseline.
- **Modelos locales (corrida nocturna única del día 2, P-2 decidido: este change entra en ella):** recall@10 y MRR de la rama dense con y sin `currentLine` sobre el
  dataset con casos que la llevan; fidelidad con faltantes declarados; y una métrica nueva de **no inferencia**: en casos
  con un faltante, ninguna afirmación mostrada atribuye un valor al dato faltante (juez acotado; metas iniciales de
  `CLAUDE.md`, a recalibrar en DEC-07). Si recall retrocede, se ajusta P-1, no la regla.

## Riesgos

- **Línea actual que sesga la recuperación** hacia una línea equivocada si `currentLine` está mal: dato verificado por
  `clinical-api`; la suite lo mide.
- **Catálogo de test sin una clave** usada por un fixture → `422` inesperado en tests de otros changes: los fixtures de
  `rag-orchestrator` y los ejemplos usan claves de `test-apl-*`/`1.1.0`; la tarea 1.1 lo comprueba.

## Desviaciones de la implementación

- **Dónde se validan y etiquetan los faltantes.** El design pedía la validación en `consultar()` y `faltantes_del_contexto()` en
  `app/prompts/`. Como el `409` y el tipo habilitado se comprueban dentro de `recuperar()`, la validación vive ahí
  (`_etiquetas_de_los_faltantes`, tras ambos y antes de idioma, embeddings, Milvus, LLM y NLI) y devuelve las **etiquetas**,
  que `ResultadoDeRecuperacion.etiquetas_de_faltantes` entrega al generador. `bloque_de_datos_del_paciente(contexto,
  faltantes=())` solo concatena líneas, así `app/prompts/` sigue sin importar puertos y el prompt de seguimiento (que llama
  a la misma función sin faltantes) no cambia. Consecuencia: `/rag/follow-up` también rechaza con `422` una clave no
  catalogada (RN-11 más estricta; `ErrorValidacion` ya está declarado en esa ruta).
- **Puerto con `claves()`.** `EtiquetasDeDatosCriticos` expone además `claves(tipo)` (la regla pura recibe el conjunto de
  claves conocidas) y `etiqueta(tipo, clave)`.
- **Suite `evaluate`.** `corrida.solicitud_de` deja `missingCriticalData` vacío cuando el tipo de la pregunta difiere del del
  ejemplo base (sus claves son del catálogo de mama) y toma `currentLine`/`missingCriticalData` del bloque `contexto` de la
  pregunta cuando existe (dataset S5, `S5-L01…L05`).

## Sprint 7 (movido-S7, 2026-11-22)

Fuente: `backlog/sprints/S7-refinamiento.md` y las decisiones del usuario del 2026-11-22. Lo anterior sigue vigente salvo
lo que aquí se indica; «corrida nocturna única del día 2» se lee como **corrida base del S7** (`[S7 resp. 2]`).

- **S7-D1 · `/case/summary` fuera del S7 (`[S7 resp. 12]`).** Validar `missingCriticalData` en `/case/summary` con `422`
  `faltante_no_catalogado` no es calidad del RAG y cambiaría el contrato OpenAPI, que hoy declara que esa ruta no aplica
  esa validación. Pasa a deuda Post-MVP **D7-01** (tarea S7.2b, diferida). El resto de D5-25 (S7.2) es refactor interno
  de la suite y de `bootstrap`, sin cambio observable: **sin diff** de `openapi.yaml` ni de `contracts/examples/`
  (ADR-26).
- **S7-D2 · Métrica de no inferencia con requisito propio.** La «métrica nueva de no inferencia» de la sección
  Evaluación no tenía requisito en `openspec/specs/ai-evaluation/spec.md` (comprobado: ningún requisito archivado la
  cubre; «Sensibilidad y especificidad de los faltantes sembrados» mide la detección en `clinical-api`, no la salida
  generada). Se añade el delta ADDED mínimo en `specs/ai-evaluation/spec.md`. La métrica vive en
  `apps/rag-orchestrator/app/evaluation/`, con el juez local acotado en su puerto (adaptadores falsos en la CI; solo
  proveedores locales, RN-12) y un reporte de solo conteos e ids (RN-14). No fija ninguna meta: la decide DEC-07.
- **S7-D3 · Corpus de la medición (`[S7 resp. 10]`).** La familia de faltantes usa la ingesta de `l1d-119` como corpus,
  el mismo en la corrida base y en la final, y cada reporte lo registra. Las preguntas `S5-L01…L05` siguen siendo las
  de `data/eval/s5-corpus-ampliado`.
- **S7-D4 · Umbrales (`[S7 resp. 11]`).** La medición corre con los umbrales actuales; los calibrados que salgan de
  los barridos de `l1d-119` solo entran en la corrida final como un brazo más. Este change no cambia ningún valor por
  defecto.
- **S7-D5 · Cómo se mide la no inferencia (S7.1).** Alternativas: (a) un juez que ve toda la respuesta y devuelve un conteo;
  (b) un juez por par (afirmación mostrada, dato faltante) con veredicto binario; (c) una regla léxica sin juez. Se elige
  **(b)**: el veredicto binario con esquema estricto es lo que ADR-41 ya usa para la fidelidad (lo inválido se contabiliza y
  nunca cuenta como «sin inferencia»), y la unidad por afirmación (cada opción con título, justificación y detalles juntos,
  cada limitación, cada texto de la síntesis) evita contar dos veces el mismo valor repetido en el título y la
  justificación. (a) mezcla en un número lo que el reporte debe poder auditar por caso; (c) no distingue «el Ki-67 de la
  paciente es 30 %» de «en el estudio, Ki-67 alto…». El juez de la CI es léxico (nombra el dato, no lo da por desconocido y
  trae un número o una palabra de valor) y el local reutiliza `ConfigJuez` (mismo modelo, `temperature` y `seed` fijos, guarda
  de RN-12 antes de crear el cliente); el POST se comparte con el juez de fidelidad (`pedir_contenido`). Quedan fuera los
  valores de población (describen el estudio) y las opciones descartadas. El reporte lleva `estado`, `casos`,
  `casos_sin_inferencia`, `casos_con_inferencia` (ids), `inferencias` y `veredictos_invalidos`; sin casos, `inferencias` vale
  `null` y el estado es `no_medida`. La familia aparece en toda corrida `generation`/`all`, así que `data/evaluation/baseline.json`
  se regeneró con adaptadores falsos (solo suma la familia nueva, sin otra diferencia).
- **S7-D6 · `S5-L04` no se reescribe.** La pregunta nombra la «deficiencia de reparación homóloga» mientras el caso declara
  `hrr_brca` como faltante. Alternativas: (a) reescribir solo `S5-L04`; (b) reescribir `S5-L04` y su gemela `S5-P05`;
  (c) mantenerla. Se elige **(c)**: (a) rompe la pareja que S7.5 compara (recall con y sin `currentLine` exige la misma
  consulta) y (b) cambia una pregunta del dataset de calibración del S5 y su recall de referencia. La pregunta describe una
  población, no afirma un dato del paciente; el control de que la salida no le atribuye un valor lo da la métrica nueva sobre lo
  mostrado, no la redacción de la pregunta.
- **S7-D7 · Archivos fuera de la lista del change.** La métrica obliga a tocar `esquema_suite.py` (una entrada de familia: el
  esquema del reporte es cerrado) y `evaluate.py` (cuatro líneas: crear el juez junto al de fidelidad y pasarlo a
  `componer_servicio`); no se tocó `config_suite.py`. S7.2 toca
  `domain/faltantes.py`, `infrastructure/catalogo_clinico/datos_criticos.py` y `bootstrap.py` por la forma de clave única y el
  `or`. Los PR de 246 y 329 pueden chocar en `evaluate.py`/`esquema_suite.py`: son hunks pequeños y aditivos.
