# Design — l1d-274-adr39-runtime-llm-ocr

## Context

Historia de ADR (US-224 · ADR-39 fase B, L1D-274). El entregable es el registro de la decisión en
`docs/architecture/adr/ADR-39-modelos-locales.md` (MADR, plantilla
`docs/architecture/adr/_plantilla-madr.md`), un script repetible y el dataset `data/eval/ocr-mini/`.
El documento lo crea la fase A (change de L1D-102) con *embeddings*, *reranker* y NLI; este change
añade la sección **Fase B** y cierra el estado del ADR.

Hechos de partida (verificados el 2026-10-13, `backlog/sprints/S1-refinamiento.md` §2 y §5, y
`ollama list` / `ollama --version` en la máquina):

| Hecho | Valor | Fuente |
|---|---|---|
| Máquina | Apple M5 Pro, 48 GB, macOS 27.0.1, ~307 GB/s de ancho de banda | refinamiento §5, contexto técnico de US-224 |
| Runtime A | Ollama **0.34.4** (Ollama.app); ≥ 0.40 opcional, lo actualiza el usuario | §5 |
| LLM A | `gemma4:26b-a4b-it-qat` descargado (15 GB); medido con `num_ctx=8192`: **15 GB residentes, 100 % GPU, ~79 tok/s**, JSON con esquema correcto en **una** prueba | §5, Decidido `[S1 resp. 10]` |
| Presupuesto LLM | **21 GB como tope máximo medido** (ollama ps, con `num_ctx` de trabajo); stack total **~30 GB** en el equipo de referencia MacBook Pro M5 de 32 GB. Sustituye el "~16 GB" / 24 GB del 2026-10-13 | Decidido (usuario, 2026-10-20); antes `[S1 resp. 10]` |
| Descartado el 2026-10-13 | `gemma4:26b-mlx` (18 GB solo en pesos): se descartó por el tope de ~16 GB, hoy superado; no está entre los candidatos pedidos el 2026-10-20 y **no se añade** sin instrucción (su 18 GB cabría en 21 GB; G, de 18 GB, ya cubre la misma familia) | `[S1 resp. 10]`; Decidido (usuario, 2026-10-20) |
| Respaldo B | `gemma4:12b-mlx` (7,7 GB) | §5 |
| Respaldo C | `qwen3.5:9b-mlx` (8,9 GB), sin *thinking* | §5 |
| Candidatos añadidos (2026-10-20) | D `qwen3.6:35b-a3b-q4_K_M`; E `medgemma1.5:4b-it-q8_0`; F `medgemma1.5:4b-it-bf16`; G `gemma4:26b-a4b-it-q4_K_M` (tabla de verificación en D3) | Decidido (usuario, 2026-10-20) |
| Runtime alternativo | vllm-metal **0.1.0** (PyPI) en `~/.venvs/vllm-metal`, **sin el paquete `vllm`** que el plugin necesita y no declara como dependencia; no está en Homebrew | §2 ("Datos que resultaron falsos"), §5 |
| OCR A | OCRmyPDF + Tesseract `spa`, **en el contenedor** de `rag-orchestrator` (no en el host) | §5, `[S1 resp. 5]` |
| OCR alternativos | PaddleOCR (PP-OCRv5 latino), docTR; Surya descartado por licencia | `[S1 resp. 5]` |

**Cambio del 2026-10-20.** El usuario sube el tope del LLM local a 21 GB y el del stack total de 24 a
~30 GB (equipo de referencia: MacBook Pro M5 de 32 GB; la máquina de medición actual es una M5 Pro de
48 GB, ver Riesgos). Los candidatos y las reglas de D1 y D3 se fijan **antes** de medir.

Riesgo principal (contexto técnico de US-224): un denso de 12B en Q4 genera ~30–35 tok/s (800
tokens ≈ 23–27 s), por encima del p95 solo con el LLM. La hipótesis A (MoE, ~4B activos) midió ~79
tok/s (~10 s para 800 tokens), lo que deja ~5 s para recuperación, *reranker*, NLI, gateway y
persistencia. Si falla: recortar la salida, decodificación especulativa (MTP en vllm-metal, solo
con `temperature=0`) o el respaldo B/C.

## Goals / Non-Goals

**Goals**

- Registrar en ADR-39, con cifras medidas (3 corridas, mediana), runtime, LLM, OCR y p95 extremo a
  extremo por etapa; descartar con cifra y motivo lo que incumpla una restricción dura.
- Fijar los valores elegidos en configuración (RN-22).
- Dejar el protocolo como script repetible (S4: G-5 con síntesis, aplicabilidad y agente).
- Crear `data/eval/ocr-mini/` sintético y reutilizable por FEAT-01b y US-072.

**Non-Goals**

- Implementar el pipeline (US-055, US-225) ni el adapter de OCR/estructuración (FEAT-01b, S2).
- *Fine-tuning*; PII (ADR-40); framework y juez de evaluación (ADR-41); streaming (ADR-42).
- Reabrir *embeddings*, *reranker* o NLI (fase A) o la nube para datos reales (RN-12).

## Decisions

### D1. Protocolo común `[US-224 AC-5]`

- **3 corridas, se reporta la mediana** de cada métrica (protocolo de la fase A, US-012 AC-1).
- Máquina y estado fijos: el ADR anota versión de macOS, de Ollama/vllm-metal, *digest* del modelo
  (`ollama list` → ID), `num_ctx`, temperatura y si el resto del stack (Compose) estaba levantado.
- **Memoria residente** del LLM = la que reporta `ollama ps` (pesos + KV) con el modelo cargado y
  `num_ctx=8192`, contrastada con el monitor del sistema; **memoria total del stack** = LLM nativo
  + `docker stats` de todos los contenedores durante la corrida extremo a extremo. Ambas con su
  cifra, sin redondear a la baja.
- **Memoria con contexto de trabajo (2026-10-20):** la cifra de `ollama ps` se toma con `num_ctx=8192`
  **después** de procesar el prompt más largo del dataset (prefill completo), no recién cargado el
  modelo; se anota también `OLLAMA_FLASH_ATTENTION`/`OLLAMA_KV_CACHE_TYPE` si están definidos. Además de
  `docker stats`, se registran `memory_pressure` y el swap usado antes y después de la corrida
  extremo a extremo (indicador de holgura para macOS, ver reglas de D3).
- Toda cifra procede del script (D6) y su JSON queda en `reports/adr39/` (no versionado si pesa;
  el ADR transcribe las medianas y enlaza el comando que las reproduce).

### D2. Runtime `[US-224 AC-1]`

Candidatos: **Ollama 0.34.4** (A) y **vllm-metal 0.1.0** (alternativo). Por cada uno el ADR
registra: (a) uso real de GPU Metal fuera de Docker (Ollama: columna `PROCESSOR` de `ollama ps` =
`100% GPU`; vllm-metal: dispositivo `mps`/Metal en el log de arranque y la ocupación de GPU en el
monitor), (b) API compatible con OpenAI (`POST /v1/chat/completions` responde con el esquema de
OpenAI), (c) salida JSON **restringida** por esquema (Ollama: `format` con JSON Schema → gramática
de llama.cpp; vllm: *guided decoding*), declarando si la restricción la aplica el runtime o solo se
valida después.

**vllm-metal sin `vllm`:** se intenta instalar `vllm` en `~/.venvs/vllm-metal` según el README de
vllm-metal, con un tope de tiempo (time-box de 1 h) para no comprometer el cierre del sprint. Si no
arranca o no usa la GPU, se **descarta** con ese motivo y el comando probado. Un runtime sin uso real
de GPU queda descartado (AC-1).

### D3. LLM `[US-224 AC-2]`

- Candidatos (la letra se conserva; D–G añadidos el 2026-10-20):

  | | Tag (Ollama) | Digest | Tamaño publicado | Licencia | Estado de verificación |
  |---|---|---|---|---|---|
  | A | `gemma4:26b-a4b-it-qat` | `2dd70431afed` | 16 GB en la página; `ollama list` local: 15 GB | Apache 2.0 | verificado (2026-10-20) |
  | B | `gemma4:12b-mlx` | `ded7a2735003` | 7,7 GB | Apache 2.0 (HF `google/gemma-4-12B-it`) | verificado |
  | C | `qwen3.5:9b-mlx` | `203e30078279` | 8,9 GB | Apache 2.0 (HF `Qwen/Qwen3.5-9B`) | verificado |
  | D | `qwen3.6:35b-a3b-q4_K_M` | `07d35212591f` | **24 GB** (arquitectura `qwen35moe`, 36B parámetros) | Apache 2.0 (Ollama y HF `Qwen/Qwen3.6-35B-A3B`) | verificado; **ya excede 21 GB solo en pesos** |
  | E | `medgemma1.5:4b-it-q8_0` | `d6ae3cddb663` | 5,0 GB | Términos HAI-DEF de Google (`license: other`), no permisiva estándar | tag y tamaño verificados; licencia: **condicionada**, ver abajo |
  | F | `medgemma1.5:4b-it-bf16` | `32f17fbd85fe` | 8,6 GB | ídem E | ídem E |
  | G | `gemma4:26b-a4b-it-q4_K_M` | `5571076f3d70` | 18 GB (25,8B parámetros) | Apache 2.0 | verificado |

  Fuentes: `ollama.com/library/{qwen3.6,gemma4,medgemma1.5,qwen3.5}/tags`, páginas de cada tag y la API
  de Hugging Face de los repositorios `Qwen/Qwen3.6-35B-A3B`, `google/gemma-4-26B-A4B-it`,
  `google/medgemma-1.5-4b-it` (consultadas el 2026-10-20). La página de tags de Ollama muestra tamaños
  en rangos o redondeados y puede cambiar (las páginas dicen "actualizado hace 3 días"): el tamaño que
  vale es el de `ollama list`/`ollama ps` del día de la medición, y el ADR anota el *digest*.
  **No verificado:** (i) que Ollama 0.34.4 sirva `qwen35moe` (D) y `medgemma1.5` (E, F) con GPU Metal y
  salida JSON restringida: se comprueba en la medición de admisión; (ii) la velocidad (tok/s) y el
  español de D, E, F y G: no hay cifra previa; (iii) el alcance exacto de la cláusula de «Clinical Use»
  de los términos HAI-DEF para un uso de investigación (ver licencia).
  - **MedGemma 1.5 (E, F):** la familia es de Google (Gemma 3, 4B denso, multimodal, entrenada para
    texto e imagen médicos); no es Apache 2.0 sino los términos HAI-DEF (`health-ai-developer-foundations/terms`),
    que definen «Clinical Use» como cualquier uso en diagnóstico o tratamiento de pacientes, **incluida
    una investigación**, y prohíben usos que hagan a Google «fabricante» de un dispositivo médico. El
    repositorio de Hugging Face es *gated* (aceptación automática). Un candidato con esta licencia solo
    puede ser **elegido** si el usuario acepta los términos por escrito en el PR del ADR (RN-21 pide
    licencia registrada y aceptada); medirlo no exige aceptarlos más allá de la descarga. El tag
    `medgemma1.5` de Ollama figura como «actualizado hace 6 meses»; MedGemma 1.5 4B en Hugging Face
    es de 2026-04-13.
  - **Qwen3.6 (D):** se mide con *thinking* desactivado (igual que C); sin la opción, la latencia no
    es comparable.
  - Las variantes MTP (`qwen3.6:35b-a3b-mtp-q4_K_M`, 23 GB; `gemma4:26b-a4b-it-mtp-q4_K_M`, 19 GB) no
    son candidatos: son la palanca de decodificación especulativa de D4.
  - Todos en el runtime ganador de D2 (y A también en el otro si es viable, para aislar el efecto del
    runtime).
- **200 llamadas por candidato** con el prompt del S1 (change de L1D-275) y
  `RagQueryInternalResponse` (`apps/rag-orchestrator/openapi.yaml`) como esquema de salida, sobre
  las preguntas de `data/eval/adr39-mini/` (fase A; ≥ 30 preguntas, se repiten hasta 200) con los
  chunks que recupera el pipeline del S1 (o, si el pipeline aún no está, con los chunks etiquetados
  del dataset como contexto fijo; el ADR anota cuál).
- **Medición de admisión previa (2026-10-20):** antes de las 200 llamadas, cada candidato se carga con
  `num_ctx=8192`, procesa el prompt más largo y se lee `ollama ps` (3 repeticiones, mediana). Si la
  memoria residente supera el tope, el candidato se **descarta con esa cifra** y no se le hacen las 200
  llamadas. Para D (24 GB publicados) se espera este resultado; se mide igualmente para registrar la
  cifra real en lugar de descartarlo por la etiqueta.
- Registro por candidato: memoria residente (pesos + KV), tokens/s (generación y *prefill*), **JSON
  válido contra el esquema** (meta ≥ 99 %), fidelidad sobre una **muestra revisada** (≥ 20 salidas,
  revisadas por `ai-eval-runner` a mano con el criterio de soporte de US-064; ADR-41 aún no existe),
  **calidad en español** (ver reglas), p95 de **estructuración por documento** (ver abajo), licencia y
  si la restricción por JSON Schema la aplica el runtime.
- **Estructuración y p95 de extracción (≤ 60 s):** con el texto de verdad de terreno de
  `data/eval/ocr-mini/` (no con la salida del OCR, para aislar el LLM), cada candidato estructura cada
  documento; se registra el p95 por documento. El p95 de extracción de extremo a extremo de D5
  (OCR + estructuración) se calcula con el OCR elegido y debe ser ≤ 60 s.

**Reglas de decisión, fijadas antes de medir (2026-10-20).** No se modifican después de ver las cifras;
si una regla resulta inaplicable se registra la desviación en el ADR, no se reescribe.

1. **Eliminatorias (en este orden; la primera que falla descarta con su cifra):**
   (a) licencia académica/permisiva verificada (un candidato con términos HAI-DEF pasa a «condicionado»:
   se mide, pero solo puede ser elegido con la aceptación del usuario);
   (b) memoria residente del LLM (`ollama ps`, `num_ctx=8192`, tras el prompt más largo) **≤ 21 GB**;
   (c) memoria total del stack (LLM + `docker stats` + modelos de CPU de la fase A) **≤ 30 GB** con todo
   levantado, y el swap usado no crece durante la corrida extremo a extremo (indicador de holgura; si
   crece, se descarta aunque la suma esté bajo 30 GB);
   (d) JSON válido contra el esquema **≥ 99 %** de las 200 llamadas;
   (e) p95 extremo a extremo de `/platform/evidence-analyses` **≤ 15 s** (D4) y p95 de extracción
   **≤ 60 s** (estructuración de D3 más OCR de D5).
2. **Calidad en español** (sobre la muestra revisada de ≥ 20 salidas por candidato): fidelidad ≥ 0,90;
   0 salidas prescriptivas (RN-23); 0 salidas en otro idioma que el de la pregunta; terminología clínica
   correcta según el criterio de `ai-eval-runner`. Incumplir cualquiera descarta con la cifra.
3. **Elección entre los que superan 1 y 2:** mayor fidelidad en la muestra; dos candidatos están
   **empatados** si difieren en una salida de la muestra (0,05 con n = 20) o menos, y entonces gana el de
   **menor memoria residente** (regla de US-012 AC-4). Un modelo más grande **no** gana por serlo.
4. **Si nadie supera 1 y 2:** se aplica US-012 AC-5 (escalar al usuario), sin elegir uno que incumpla.
5. **Sensibilidad:** si el elegido deja menos de 1 GB de margen bajo 21 GB o bajo 30 GB, el ADR lo
   declara como riesgo y registra el siguiente candidato que sí deja margen (respaldo).

### D4. p95 extremo a extremo `[US-224 AC-3]`

- Contra el Compose local con **seed sintético** (paciente semilla de OL-01, `dataClassification =
  sintetico`) y el **LLM real** (no `LLM_PROVIDER=fake`): 3 corridas de **≥ 30 consultas** a
  `POST /platform/evidence-analyses` vía la sesión de `doc1@test.local` (usuario de test sintético).
- **p95 total** (cliente) y **por etapa**: gateway y desidentificación (Backend 1), recuperación
  *dense*, *reranker*, generación LLM, validación de citas, NLI, persistencia del
  `AIAnalysisRecord` (RN-06). Las etapas se leen de los tiempos que el pipeline registra por
  `traceId` (sin contenido ni PHI en los *logs*); si una etapa no expone su tiempo, el ADR lo anota
  como "no desglosado" en vez de estimarlo.
- Una combinación con p95 > 15 s o memoria total del stack > ~30 GB (o swap creciente, D3 regla 1c) queda **descartada** con la cifra.
  Si ninguna cumple → **US-012 AC-5**: el ADR lo declara y escala el ajuste de metas al usuario
  (G-5 / NFR-01) sin elegir una combinación que incumpla. Las palancas (recorte de salida, MTP con
  `temperature=0`, respaldo B/C) se registran como medidas, no como supuestos.

### D5. OCR `[US-224 AC-6]`

- Candidatos: **A** OCRmyPDF + Tesseract `spa`; alternativos PaddleOCR (PP-OCRv5 latino) y docTR.
  Medidos **dentro del contenedor** Linux arm64 de `rag-orchestrator` (donde correrán en FEAT-01b),
  sin GPU.
- Registro por motor: **exactitud por campo crítico** (coincidencia exacta normalizada del valor de
  cada campo de la verdad de terreno), **p95 por documento** (meta ≤ 60 s), memoria residente pico y
  licencia. p95 > 60 s → descartado con la cifra. Empate → menor memoria.
- La medición procesa los PDF en memoria (como el endpoint `/documents/extract`), sin persistir
  copias fuera de `data/eval/ocr-mini/`.
- **Criterio "escribe a disco"** (Gate 1, 2026-10-14): se registra por motor si escribe archivos
  temporales y dónde. OCRmyPDF y Tesseract **sí** escriben (OCRmyPDF crea un directorio de trabajo
  con páginas rasterizadas e intermedios; Tesseract lee y escribe imágenes en disco), y PaddleOCR y
  docTR pueden escribir cachés de modelos. No descarta por sí solo, pero obliga a la mitigación:
  - **Mitigación obligatoria** (con el Compose de L1D-164, design D-"solo lectura"): el contenedor
    `rag-orchestrator` corre con `read_only: true` y `TMPDIR=/tmp` sobre un `tmpfs` (tamaño en
    configuración, RN-22); el motor se invoca con su directorio de trabajo bajo `TMPDIR` (en
    OCRmyPDF, sin `--keep-temporary-files`) y la caché de modelos es un volumen de solo lectura.
    La medición de D5 se hace **con esa configuración**: un motor que necesite escribir fuera de
    `TMPDIR` o desactivar `read_only` queda **descartado** con el motivo (se corrige con una
    variable de directorio, nunca quitando `read_only`).
  - **Directorio de trabajo por request (Gate 1, 2ª vuelta):** el adapter OCR (y el subcomando
    `ocr` que lo emula) crea un `tempfile.TemporaryDirectory(dir=TMPDIR)` **por request** y pasa
    esa ruta al motor como directorio de trabajo; la limpieza va en un `finally` (o el *context
    manager*), de modo que se ejecuta también si el motor falla o si se agota el *timeout*
    (al cancelar, se termina primero el subproceso del motor y después se borra el directorio).
    Nunca se comparte un directorio entre requests.
  - **Test de no-residuos:** tras extraer cada PDF de `data/eval/ocr-mini/`, el subcomando `ocr`
    comprueba que `TMPDIR` queda vacío (sin páginas, imágenes, texto ni PDF) y que no hay archivos
    nuevos fuera de él; si quedan, la corrida falla nombrando el motor y la ruta (nunca el
    contenido). El ADR registra este test como **consecuencia obligatoria** para el adapter real de
    OCR de FEAT-01b (S2), que debe reproducirlo en su Pytest de integración en **tres casos**: extracción
    correcta, **fallo del motor** (error forzado con un motor falso que escribe y luego lanza) y
    **timeout** (motor falso que escribe y se bloquea más allá del *deadline*); en los tres,
    `TMPDIR` queda vacío al terminar. RN-14 y la regla de
    ownership: ningún PDF ni texto extraído persiste en el contenedor.

### D6. Script repetible `[US-224 AC-5]`

- `apps/rag-orchestrator/app/scripts/adr39/` con un punto de entrada
  `python -m app.scripts.adr39 <runtime|llm|e2e|ocr> --runs 3 --out reports/adr39/`. Lee modelos,
  URLs y parámetros **de la configuración** (D7), no de constantes; el *dataset* y el número de
  llamadas/consultas son argumentos con los valores del AC por defecto.
- Lógica pura separada y probada (test después): cálculo de mediana y p95, regla de descarte por
  restricción dura, regla de empate por memoria y validación de JSON contra el esquema.
- Reutiliza el arnés de la fase A si el change de L1D-102 lo crea en el mismo paquete; si no, este
  change lo crea y la fase A lo puede adoptar (sin duplicar el cálculo de percentiles).
- Para el S4: los subcomandos admiten un perfil `--pipeline s4` (síntesis, aplicabilidad, agente)
  sin cambiar el protocolo; el ADR documenta el comando exacto.

### D7. Configuración `[US-224 AC-4]`

Valores elegidos en `apps/rag-orchestrator` (módulo de configuración Pydantic Settings que crean los
changes de L1D-164 / L1D-106) y en `.env.example` (change de L1D-164); nombres propuestos
(asumido, alineados con readme §1.4 paso 3):

| Variable | Valor si A gana | Nota |
|---|---|---|
| `LLM_BASE_URL` | `http://host.docker.internal:11434/v1` | runtime nativo fuera de Docker |
| `LLM_MODEL` | `gemma4:26b-a4b-it-qat` | se registra también el *digest* en el ADR |
| `LLM_NUM_CTX` | `8192` | `[S1 resp. 10]` |
| `LLM_TEMPERATURE` | el medido | |
| `LLM_CLOUD_ENABLED` | `false` | sin cambio (RN-12) |
| `OCR_ENGINE`, `OCR_LANGUAGES` | `ocrmypdf-tesseract`, `spa` | consumido por FEAT-01b |

Un test de configuración (test después) comprueba que los valores se leen del entorno y que ningún
nombre de modelo aparece literal fuera de la configuración. **Regresión [RN-12] activa desde S6
(US-050):** la regla de proveedores se verifica con estos valores cuando exista su test.

### D8. Dataset `data/eval/ocr-mini/` `[US-224 AC-6]`

- ≥ 5 PDF **escaneados** en español (imagen rasterizada con ruido, inclinación leve y baja
  resolución para simular escáner), generados por un script versionado
  (`data/eval/ocr-mini/generar.py` o equivalente) desde plantillas de informes de anatomía
  patológica, biomarcadores y laboratorio de mama y próstata.
- Valores y nombres **ficticios** evidentes (sin ningún identificador real, RN-13, RN-14); la
  verdad de terreno por campo crítico (diagnóstico, estadio, receptores/HER2, Gleason/ISUP, PSA,
  fechas relativas) en `ground_truth.json`.
- `manifest.json` con `clase: sintetico`, licencia del dataset y versión del generador; US-072 y
  FEAT-01b lo reutilizan.

### Alternativas (decisión cara de revertir: modelos)

Las tres propuestas y su descarte como hipótesis principal ya están registradas en
`backlog/sprints/S1-refinamiento.md` §2 (A elegida; B y C respaldos) `[S1 resp. 5]`. Este change no
las reabre: las **mide** y el ADR decide por cifras. Runtime: Ollama frente a vllm-metal (D2). OCR:
Tesseract frente a PaddleOCR y docTR (D5).

## Criterios de verificación por AC

`skip_specs: true`: cada AC se verifica sobre el ADR, los datasets y la configuración.

| AC | Se verifica en |
|---|---|
| `[US-224 AC-1]` | Sección "Fase B · Runtime" del ADR con (a), (b), (c) por runtime y la resolución de vllm-metal |
| `[US-224 AC-2]` | Tabla LLM del ADR (memoria, tok/s, JSON válido sobre 200, fidelidad de la muestra, licencia, restricción por runtime o posterior) |
| `[US-224 AC-3]` | Tabla p95 total y por etapa (3 × ≥ 30 consultas) y descartes con cifra; escalado si nadie cumple |
| `[US-224 AC-4]` | `.env.example` y configuración con los valores; test de configuración en verde; nota de regresión RN-12 (S6) |
| `[US-224 AC-5]` | Script `app.scripts.adr39` con sus tests y el comando documentado en el ADR |
| `[US-224 AC-6]` | `data/eval/ocr-mini/` (≥ 5 PDF, manifiesto `clase: sintetico`) y tabla OCR del ADR |

## Privacidad y ownership

- **Solo datos sintéticos** (RN-13): seed de OL-01, `data/eval/adr39-mini/` y `data/eval/ocr-mini/`
  con valores ficticios; ningún dato real ni anonimizado en el repo (RN-14). Los reportes de
  `reports/adr39/` contienen métricas, no textos de salida con datos de pacientes.
- **Fronteras:** la medición extremo a extremo entra por `web`/`clinical-api` como cualquier cliente;
  `clinical-api` desidentifica (RN-11) y solo el contexto desidentificado llega a `rag-orchestrator`.
  El script no lee PostgreSQL clínico ni `clinical-minio`: `rag-orchestrator` sigue sin acceso a
  datos clínicos; el benchmark de OCR recibe los PDF del dataset por argumento y los procesa en
  memoria.
- **Modelos solo locales** (RN-12): todo el benchmark corre contra el runtime nativo local;
  `LLM_CLOUD_ENABLED=false`. Ningún candidato de nube se evalúa.
- **Logs:** tiempos por etapa por `traceId`, sin contenido de prompts, documentos ni PHI.
- **Secretos:** ninguno nuevo; las credenciales de test del Compose vienen de `scripts/`.

## Contratos

Sin cambios: ni `apps/clinical-api/openapi.yaml` ni `apps/rag-orchestrator/openapi.yaml` ni
`contracts/examples/`. `RagQueryInternalResponse` se usa como esquema de validación del LLM
(lectura). Sin `contracts:check` ni oasdiff que correr; compatible con ADR-26.

## Evaluación

Cambia **modelo** (LLM y OCR fijados): aplica OL-06. La suite `evaluate` automatizada llega en el
S2 (US-072); en el S1 `ai-eval-runner` evalúa a mano `[Pre-S1 resp. 9]`. Métricas afectadas:
JSON válido ≥ 99 %, fidelidad ≥ 0,90 (muestra), salidas prescriptivas = 0 (RN-23, en la muestra),
OCR crítico ≥ 0,95 (sobre `ocr-mini`, orientativo con ≥ 5 PDF), p95 ≤ 15 s y extracción p95 ≤ 60 s.
Las cifras de este ADR son el punto de partida del baseline de US-072/US-073.

## Dependencias y colaboradores

- **Crea:** `apps/rag-orchestrator/app/scripts/adr39/` (CLI + funciones puras `mediana()`,
  `percentil_95()`, `descartar_por_restriccion()`, `desempatar_por_memoria()`, `validar_contra_esquema()`),
  `data/eval/ocr-mini/`. Los clientes HTTP del script (runtime OpenAI-compatible, gateway) quedan en
  el borde del script; la lógica pura no depende de ellos.
- **Modifica:** `docs/architecture/adr/ADR-39-modelos-locales.md` (sección Fase B, estado),
  `.env.example` y la configuración de `rag-orchestrator` (solo valores).
- **Usa (lectura):** el prompt y los adapters del S1 (L1D-275, L1D-106, L1D-179, L1D-180), el
  esquema `RagQueryInternalResponse`, el Compose de L1D-164.
- Regla extraída a método con nombre: `descartar_por_restriccion()` (NFR-01, NFR-05, licencia), para
  que el ADR y el S4 apliquen la misma regla.

## Risks / Trade-offs

- **El OCR escribe temporales** (D5) → `read_only: true` + `TMPDIR` en `tmpfs` + test de
  no-residuos; un `tmpfs` pequeño puede agotarse con PDF largos → su tamaño es configuración y la
  medición registra el pico de uso.
- **El pipeline completo llega tarde en el sprint** → AC-3 se mide al cierre; si alguna etapa no
  está, el ADR mide lo disponible, lo declara y la historia no se cierra sin el p95 extremo a
  extremo (o con el escalado de US-012 AC-5).
- **vllm-metal inmaduro (0.1.0)** → time-box de 1 h; el descarte documentado es un resultado válido.
- **MLX en Ollama 0.34.4**: B y C son *tags* `-mlx`; si Ollama 0.34.4 no los sirve con GPU, se
  anota y se pide al usuario actualizar Ollama (≥ 0.40, desde la app) o se mide una variante GGUF del
  mismo modelo, anotando el cambio.
- **Muestra de OCR pequeña (≥ 5 PDF)** → la exactitud es orientativa; FEAT-01b y US-072 la amplían.
- **Memoria del stack** (tope 2026-10-20): con el LLM al tope de 21 GB quedan ~9 GB de los ~30 GB
  para Milvus, PostgreSQL, MinIO, los modelos CPU de la fase A, OCR y Docker Desktop; se mide con todo
  levantado, no por suma de estimaciones. Con la hipótesis A (15 GB) quedarían ~15 GB.
- **Holgura de macOS:** en un equipo de 32 GB, un stack de 30 GB deja ~2 GB al sistema y a las
  aplicaciones del usuario (navegador, IDE). El tope lo fijó el usuario; el ADR mide `memory_pressure` y
  swap (D1, D3 regla 1c) en lugar de asumir que cabe, y declara la holgura real medida.
- **Máquina de medición ≠ equipo de referencia:** la máquina actual es una M5 Pro de 48 GB; una corrida
  sin presión de memoria allí no demuestra que quepa en 32 GB. El ADR anota la RAM de la máquina y, si no
  se repite en una de 32 GB, deja la verificación como condición de G-Piloto (no se afirma «cabe en 32 GB»
  solo con la suma de cifras).
- **Más candidatos, mismo coste (3 pts):** D–G añaden hasta 4 × 200 llamadas, pero la admisión previa
  descarta primero por memoria y MedGemma (4B) es rápido; si el tiempo no alcanza, D se descarta con la
  cifra de admisión y E/F se miden con 100 llamadas anotándolo. La estimación no cambia sin aprobación.
- **Licencia de MedGemma (HAI-DEF):** no permisiva estándar; ganar exige aceptación del usuario.

## Migration Plan

No aplica (sin datos ni contratos). Revertir = cambiar valores de configuración; el LLM puede
cambiarse sin reindexar.

## Open Questions

- ¿Quién aprueba el ADR (estado "aceptado")? Propuesto: el usuario en la revisión del PR, como en
  ADR-36.
- Tamaño de la muestra revisada de fidelidad (propuesto ≥ 20 salidas por candidato) y si la revisa
  solo `ai-eval-runner` o también un humano.
- Si B y C (`-mlx`) no corren en Ollama 0.34.4: ¿actualizar Ollama (lo hace el usuario) o medir su
  variante GGUF? Lo mismo para D (`qwen35moe`) y E/F (`medgemma1.5`).
- ¿El usuario acepta los términos HAI-DEF si MedGemma 1.5 gana? ¿Se repite la corrida final en un
  equipo de 32 GB? (Pregunta abierta de 2026-10-20.)
