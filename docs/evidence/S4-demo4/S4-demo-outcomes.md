# S4 · Outcomes de la Demo 4 (feedback recopilado)

> Creado el 2026-11-02. Recoge el feedback de la Demo 4 (instalación desde cero en una copia aparte, proyecto Compose `oncolens-demo4`, commit `d8f422e9`, y recorrido). Guía de la demo: [`docs/demo/guia-demo-S4.md`](../../demo/guia-demo-S4.md). Cierre del sprint: [`S4-cierre.md`](../../../backlog/sprints/S4-cierre.md).
> **Markdown = fuente.** Los IDs `OUT-nn` son inmutables. Estados: `abierto` → `triage` (con destino) → `cerrado`.

| ID | Tipo | Resumen | Estado | Destino |
|---|---|---|---|---|
| OUT-01 | UX | Tras el login, médico y administrador deben llegar a `/pacientes`, no al análisis del paciente (a) | cerrado | PR #284 (`levantar.sh` fija `WEB_HOME_PATH=/pacientes`) |
| OUT-02 | UX | En el listado, la columna Paciente ocupa dos líneas para el nombre y el ID enmascarado | cerrado | PR #284 |
| OUT-03 | UX | El enlace «Registrar en la ficha» de los faltantes lleva a una ficha de solo lectura | triage | Revisar en la Demo 5; el formulario es US-111 (S5) |
| OUT-04 | UX | La línea de estado dice «Análisis listo: 0 opciones descritas» cuando todas las opciones se descartaron en la verificación | abierto | por asignar |
| OUT-05 | Bug (estabilidad) | La misma pregunta visible da otro resultado si llega en Unicode NFD: no se normaliza antes del prompt | triage | **US-250** (FEAT-06a, S5) |
| OUT-06 | Mejora (estabilidad) | Ante la misma entrada, devolver el análisis ya guardado; «Re-ejecutar» genera uno nuevo | triage | **US-251** (FEAT-11a, S6) |
| OUT-07 | Mejora (evaluación) | Medir reproducibilidad y estabilidad en `evaluate`, con hashes de prompt y salida en los logs | triage | **US-252** (FEAT-T5b, S6) |
| OUT-08 | UX | En la tabla de aplicabilidad, la columna «Estudio» muestra la fuente (URL o DOI) como texto, no como enlace | triage | Por asignar (decidido el criterio de destino, 2026-11-02) |

## OUT-05 · La misma pregunta da otro resultado si llega en Unicode NFD

- **Observado (2026-11-02):** paciente (a), pregunta *«¿Qué indican las pruebas científicas sobre la terapia dirigida para el cáncer de mama metastásico HER2-positivo en pacientes que han recibido previamente trastuzumab, pertuzumab y trastuzumab emtansina?»*. En 8 intentos, 5 dieron 2 opciones (trastuzumab… y tucatinib) y 3 dieron 0 opciones con 2 descartadas (lapatinib y trastuzumab emtansina, `afirmacion_sin_soporte`).
- **Causa confirmada:** los 3 casos distintos traían la pregunta en **NFD**: `é`, `í`, `á`, `á` como letra más `COMBINING ACUTE ACCENT` (206 caracteres frente a 202). Se ve igual, pero el LLM recibe otros tokens. La recuperación fue idéntica en todos: puntuación máxima 0,97269 y 10 fragmentos sobre el umbral.
- **Medición:**
  - texto **NFC**: 57/57 idénticas (25 con la caché del modelo caliente y 25 con la caché vaciada antes de cada una); IC 95 % de Wilson 0,94–1,00;
  - texto **NFD** reproducido a propósito: 3/3 distintas del resultado NFC y variables entre sí.
- **Hallazgo secundario:** un experimento aislado contra Ollama (temperatura 0, sin semilla) dio dos salidas para el mismo prompt según el estado de la caché de prefijo. En la app solo se manifestó con el texto NFD, que deja la generación cerca de un empate. Motiva OUT-06.
- **Lo que funcionó:** la verificación NLI descartó «trastuzumab emtansina» para una paciente que, según la pregunta, ya la había recibido.
- **Corrección:** US-250.

## OUT-06 · Resultado canónico ante la misma entrada

- **Motivo:** aun con la entrada idéntica, el motor puede variar en prompts cercanos a un empate. El oncólogo debe ver lo mismo ante la misma pregunta, el mismo paciente y el mismo contexto, y poder pedir explícitamente un análisis nuevo.
- **Corrección:** US-251. Pendientes del refinamiento del S6: la ventana de reutilización y si `sin_evidencia` también se reutiliza.

## OUT-07 · Reproducibilidad medida en `evaluate`

- **Motivo:** la inestabilidad solo se pudo explicar consultando la base de datos. Los logs no distinguían una salida de otra y ninguna suite medía la reproducibilidad.
- **Corrección:** US-252.


## OUT-08 · La fuente de la columna «Estudio» no es un enlace

- **Observado (2026-11-02):** en «Criterios del estudio frente a datos registrados», la columna «Estudio (valores extraídos de la fuente por IA y verificados contra el fragmento)» muestra «según {fuente} · {externalId}» como texto. En las guías del NCI el `externalId` es una URL, pero no se puede pulsar.
- **Causa:** `presentarValor` (`apps/web/lib/evidence/presentar-valor.ts`) une el valor, el fragmento y la fuente en **una sola cadena** de texto. El detalle de la cita del panel sí enlaza la fuente con `EnlaceFuenteOriginal` (`apps/web/components/molecules/citation-details.tsx`): solo si la URL es segura (`esUrlHttpSegura`), en otra pestaña y con `rel="noopener noreferrer"`. La tabla de aplicabilidad no lo reutiliza.
- **Criterio de destino (decidido por el usuario, 2026-11-02):**
  - si la fuente tiene DOI (artículos de PMC, p. ej. `10.1093/jnci/djag049`), el enlace va a `https://doi.org/<doi>`;
  - si no, a la URL de la fuente (guías del NCI);
  - no se enlaza la URL de la API de Europe PMC (`…/fullTextXML`), que devuelve XML;
  - el destino pasa siempre por `esUrlHttpSegura`, y sin URL válida se muestra «No disponible» (RN-25).
- **Corrección propuesta:** que `presentarValor` devuelva partes estructuradas (texto y destino) y que la fila de aplicabilidad reutilice `EnlaceFuenteOriginal` con el destino calculado. Prueba del AC primero (Testing Library), con un caso NCI (URL), un caso PMC (DOI) y uno sin URL segura.

## Alternativas descartadas para OUT-05…OUT-07

- **Fijar `seed`:** con temperatura 0 no interviene.
- **Cambiar la temperatura:** ya es 0; subirla aumenta la variación.
- **Generar varias veces y votar:** multiplica la latencia frente al p95 de 15 s; solo sirve fuera de línea.
- **Relajar el NLI o la regla por papel:** viola RN-01.
- **Cambiar de modelo:** no garantiza estabilidad.
- **Desactivar *flash attention* o forzar CPU:** latencia alta y sin medir.
- **Guardar la respuesta en `rag-orchestrator`:** contradice que ese servicio no persista.
- **Normalizar solo en el navegador:** cualquier cliente de la API se lo saltaría.
- **Recortar las afirmaciones por opción:** afecta a la calidad, sin evidencia de que mejore la estabilidad.

Pendientes de priorizar: la inferencia determinista (ADR de modelos) y una segunda generación acotada cuando todas las opciones se descartan.
