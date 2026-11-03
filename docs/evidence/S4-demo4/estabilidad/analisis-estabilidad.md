# Estabilidad del análisis: 50 ejecuciones y causa raíz (Demo 4, 2026-11-02)

Paciente (a) `0fd028e2-…`, pregunta: *¿Qué indican las pruebas científicas sobre la terapia dirigida para el cáncer de mama metastásico HER2-positivo en pacientes que han recibido previamente trastuzumab, pertuzumab y trastuzumab emtansina?* Stack `oncolens-demo4`, commit `d8f422e9`, `gemma4:26b-a4b-it-q4_K_M`, temperatura 0, sin semilla. Datos crudos: `cincuenta.jsonl`.

## Resultado

| Entrada | Ejecuciones | Resultado |
|---|---|---|
| Texto en **NFC** (forma normal), 25 con la caché del modelo caliente | 25 | **25 × A** (2 opciones: trastuzumab… y tucatinib) |
| Texto en **NFC**, 25 con la caché vaciada antes de cada una | 25 | **25 × A** |
| Texto en **NFC**, resto (usuario y pruebas previas) | 7 | **7 × A** |
| **Total NFC** | **57** | **57 × A** → reproducibilidad 1,00 (IC 95 % de Wilson: 0,94–1,00) |
| Texto en **NFD** (mismos caracteres visibles, acentos descompuestos), del usuario | 3 | 3 × B (0 opciones, 2 descartadas: lapatinib, trastuzumab emtansina) |
| Texto en **NFD**, reproducido a propósito | 3 | 1 × B · 2 × «1 opción + 1 descartada» |

**Causa raíz:** en las ejecuciones B la pregunta llegó en **NFD**: `é`, `í`, `á`, `á` como letra + `COMBINING ACUTE ACCENT` (206 caracteres frente a 202). Se ve igual, pero el LLM recibe otros tokens y genera otra respuesta. La recuperación no cambió: misma puntuación máxima, 0,97269, y 10 fragmentos sobre el umbral. Nadie normaliza el texto antes del prompt.

**Causa secundaria:** con el texto NFD la generación queda cerca de un empate y además varía entre ejecuciones (2 salidas en 3). El experimento aislado contra Ollama mostró que el mismo prompt puede dar dos salidas según el estado de la caché de prefijo. Con el texto NFC no se manifestó en 57 ejecuciones.

**Corrección a un análisis anterior:** atribuí las 8 primeras ejecuciones, como «muy probable», a la caché del motor. Las 50 lo refutan para ese caso: la variable decisiva fue la forma Unicode de la entrada.

**Lo que funcionó:** la verificación NLI descartó en B la opción «trastuzumab emtansina» para una paciente que, según la pregunta, ya la recibió.

## Top 5 de mejoras por impacto en la estabilidad

| # | Mejora | Qué elimina | Coste | Evidencia |
|---|---|---|---|---|
| 1 | **Normalizar la pregunta a NFC** (y colapsar espacios) en `clinical-api`, que es la autoridad, antes de persistir y enviar, y también en `web` (Zod) y al construir el prompt en `rag-orchestrator` (defensa en profundidad). Revisar que la ingesta del corpus también normalice | Toda la clase «misma pregunta, bytes distintos» | Muy bajo: una función pura con su test (entrada NFD = salida NFC) | 3 de 8 ejecuciones del usuario eran NFD; NFC dio 57/57 iguales |
| 2 | **Resultado canónico por entrada (idempotencia):** si coinciden pregunta normalizada, huella de contexto, *release* del corpus, versión del catálogo, versión del prompt, *digest* del modelo y parámetros, devolver el `AIAnalysisRecord` guardado, rotulado «reutilizado (fecha)». «Re-ejecutar» crea uno nuevo con `rerunOfAnalysisId`, que ya existe en el contrato | Cualquier variación residual del motor ante la misma entrada; además, menos latencia | Bajo-medio (`clinical-api`); decisión de producto sobre qué espera ver el oncólogo | `context_fingerprint` y `rerunOfAnalysisId` ya existen; RN-06 ya persiste |
| 3 | **Inferencia determinista** independiente del estado de la caché: desactivar la reutilización de prefijo en la llamada de generación si el motor lo permite, o un motor con modo determinista (vLLM o SGLang). Se evalúa en el ADR de modelos | La no-determinación del motor en prompts cercanos a un empate | Medio-alto: ADR-39, posible coste de latencia | Experimento aislado: mismo prompt, 2 salidas según la caché; NFD: 2 salidas en 3 |
| 4 | **Una segunda generación acotada cuando todas las opciones se descartan** (o salen 0), validada otra vez con citas y NLI y declarada en la Base del análisis | Respuestas «0 opciones» por un mal sorteo del generador | Medio: latencia extra solo en el caso de fallo; respeta RN-01 | B (0 opciones) frente a A (2 válidas) con los mismos fragmentos |
| 5 | **Suite de reproducibilidad y metamórfica en `evaluate`**, con *gate* en la CI: N repeticiones por pregunta *golden* y variantes invisibles o irrelevantes (NFC/NFD, espacios, mayúsculas, paráfrasis), más un registro por llamada al LLM del hash del prompt y de la salida (sin contenido, RN-14) | Regresiones de estabilidad no detectadas | Medio | Hoy los logs no distinguían A de B; hizo falta ir a la base |

Orden recomendado: 1 (rápida y elimina la causa observada), después 5 (para medir), 2 (garantiza lo que ve el médico), 4 y 3 (más caras y sujetas a ADR).

## Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| Fijar `seed` en la generación | Con temperatura 0 la decodificación es *greedy*: la semilla no interviene, y no corrige ni la forma Unicode ni la numérica del motor |
| Cambiar la temperatura | Ya es 0; subirla aumenta la variación |
| Autoconsistencia con k ≥ 3 muestras por consulta | Multiplica la latencia (7–9 s → más de 21 s) frente al p95 de 15 s; útil solo fuera de línea, en `evaluate` |
| Relajar el umbral NLI o la regla por papel para que pasen más opciones | Viola RN-01; además, B proponía trastuzumab emtansina a quien ya la recibió: el descarte fue correcto |
| Cambiar de modelo | Sin garantía de estabilidad: cualquier LLM tiene empates cercanos; obliga a reevaluar ADR-39 |
| Desactivar *flash attention* o forzar CPU | Puede reducir la variación numérica, pero con un coste de latencia alto y sin medir; se cubre mejor evaluando un modo determinista (mejora 3) |
| Guardar la respuesta del LLM en `rag-orchestrator` | Contradice que Backend 2 procese en memoria sin persistir; el resultado canónico pertenece a `clinical-api` (RN-06) |
| Normalizar solo en el navegador | Un cliente de la API lo saltaría; la normalización autoritativa va en `clinical-api` |
| Reducir afirmaciones por opción (`CLAIMS_MAX_PER_OPTION`) | Afecta a cobertura y calidad; sin evidencia de que mejore la estabilidad; requiere `evaluate` antes |
