# Guía de la Demo 6 (S6): chatbot MVP sobre el paciente

Todo con **datos sintéticos** (pacientes del seed; corpus público con licencia aceptada, RN-14, RN-21). Complementa `docs/demo/runbook-demo-S1.md` (preparar, levantar, apagar, fallos frecuentes) y las guías `guia-demo-S4.md` y `guia-demo-S5.md`. Fuentes de esta guía: `backlog/features/FEAT-12-chatbot-mvp.md`, `backlog/sprints/S6-plan.md`, `backlog/sprints/S6-deuda.md`, `contracts/examples/chat-turn-*.json` y `apps/rag-orchestrator/app/infrastructure/fake/fake_chat_turn.py`.

> **Solo modo fingido, hasta la corrida final.** Los textos de esta guía son los de `LLM_PROVIDER=fake`, que sirve los ejemplos de `contracts/examples/`. Con el LLM real local la redacción y las opciones varían. Toda salida muestra «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación» (RN-19). Esta guía **no contiene resultados medidos de la corrida final**: los marcadores `[PENDIENTE: resultado de la corrida final]` se rellenan después.

## 1. Objetivo de la Demo 6

Mostrar el **chatbot MVP** (FEAT-12) sobre un paciente sintético abierto en la ficha: el doctor conversa y obtiene, en un mismo hilo, (A) la comprensión del **caso**, (B) la **información faltante** y (C) la **evidencia** científica del corpus, con cada afirmación enlazada a un dato del paciente o a una cita recuperada y verificada (RN-01). El chat no recomienda: describe lo que dice la evidencia («Opciones descritas en la evidencia», RN-23) y no resuelve contradicciones del expediente.

Qué debe verse en toda la demo:

- Encabezado «Opciones descritas en la evidencia» en los turnos de evidencia (no «recomendado para este paciente»).
- Avisos de RN-19 en cada turno del asistente (los de intención `no_clasificada` y `fuera_de_alcance` no llevan análisis y solo muestran una limitación).
- Sin identidad ni PII en pantalla ni en red: el navegador solo habla con `web` (`/api/*` del mismo origen).
- Afirmación sin enlace o sin soporte NLI: se omite y suma a `omittedClaims`; nunca se muestra.

## 2. Guion con preguntas literales

Abrir primero la **ficha del paciente** (la recuperación filtra por su tipo de cáncer) y abrir el chat desde ahí. Paciente semilla de mama = (a); de próstata = (b) (PSA en serie). Con `ENABLED_CANCER_TYPES=mama,prostata`. Preguntar cada una **tal cual**: el modo fingido enruta con las mismas reglas del motor real y, sin regla que coincida, responde `no_clasificada`.

### AC01 · Situación clínica, resumen y evolución (US-260)

| Paciente | Pregunta literal | Respuesta esperada (fingida) | Debe verse |
|---|---|---|---|
| (a) mama | «¿Cuál es la situación actual de la paciente?» | Bloques `documentado`: «Carcinoma ductal infiltrante de mama, Nottingham grado 2, estadio IIA (TNM 8), ECOG 1, al momento del diagnóstico.» y «HER2: 3+ (IHQ), relevante, al momento del diagnóstico.» | Cada bloque con enlace al dato de la ficha; avisos RN-19 y «Verifique contra las fuentes»; texto con verbalización determinista |
| (b) próstata | «¿Cuál es la situación actual del paciente y cómo ha evolucionado el PSA?» | Bloques `documentado` (PSA 4,2 → diagnóstico Gleason 4+3=7 · ISUP 3, T2cN0M0, ECOG 0 → PSA 9,8 → progresión bioquímica → PSA 12,4) y una `interpretacion` («El PSA registró 9.8 al momento del diagnóstico y 12.4 a los 37 días después del diagnóstico.») | PSA en orden ascendente de día relativo; la interpretación rotulada «Interpretación generada por…»; fechas solo relativas |

### AC02 · Un examen, un tratamiento o un periodo concreto (US-261, US-262)

| Paciente | Pregunta literal | Respuesta esperada | Debe verse |
|---|---|---|---|
| (b) próstata | «¿Qué tratamiento previo ha recibido y cuándo?» | Bloque `documentado` con la verbalización del tratamiento, fechas y secuencia | Enlace al tratamiento; solo días relativos |
| `P-CHAT` / paciente con eventos | «¿Qué ocurrió en los últimos 100 días?» | Solo hechos con día relativo ≥ −100 | Sin la quimioterapia anterior al periodo |
| (a) mama | «¿Cuál fue el resultado de la gammagrafía ósea?» | «No se encontró información…» (el dato no está documentado) | Ninguna afirmación inventada |
| `P-CHAT` | «¿Hay contradicciones en el expediente?» | Bloque `conflicto` con los dos valores y sus días relativos; el chat **no** dice cuál es el correcto | Sin resolución; el estado de revisión no cambia |
| (a) mama | «¿Hay contradicciones?» | «No hay contradicciones registradas en el expediente» | Sin llamada al LLM de generación |

`P-CHAT` es el paciente de fixtures de FEAT-12 (FX-12-b); en el seed de la demo, usar el paciente con eventos y conflicto que indique el `runbook`. Si no está sembrado, estas dos filas se omiten de la demo en vivo.

### AC03 · Información faltante (US-263)

| Paciente | Pregunta literal | Respuesta esperada | Debe verse |
|---|---|---|---|
| (a) mama (con faltantes) | «¿Qué información falta?» | Bloques `faltante`: TNM «hay registros en conflicto por conciliar»; Receptor de estrógeno «incompleto o sin verificar»; Ki-67 «aún no se ha procesado ningún documento de tipo examen»; Estado menopáusico «no se halló en los documentos procesados (historia clínica)» | Distinción **no encontrado / incompleto / por conciliar / no buscado**; mismo orden en cada repetición; coherente con el checklist de la vista de caso; ningún faltante bloquea (RN-26) |
| (b) próstata | «¿Qué información falta del caso?» | `faltante`: Sitios metastásicos y Genes HRR / BRCA «no se halló en los documentos procesados» | Igual que arriba |

### AC04 · Por qué importa un dato faltante (US-264)

| Paciente | Pregunta literal | Respuesta esperada | Debe verse |
|---|---|---|---|
| (a) mama | «¿Por qué importa el estado menopáusico?» | Bloque `catalogo` («dato crítico del catálogo vigente (versión 1.9.0)…, criterios de aplicabilidad que lo usan») y bloque `evidencia` con cita | Catálogo y evidencia por separado; sin lenguaje prescriptivo |
| (a) mama | «¿Por qué importa el Ki-67?» | `catalogo`: «Ningún criterio de aplicabilidad del catálogo vigente usa este dato» y `evidencia` con cita | Aviso de que ningún criterio lo usa |
| (b) próstata | «¿Por qué importa conocer los genes HRR / BRCA?» | Respuesta de relevancia de próstata (catálogo y evidencia) | Igual |
| cualquiera | «¿Por qué importa el CA 15-3?» | Dice que no es un dato crítico del catálogo vigente; sin bloque `catalogo` | Nunca inventa un requisito clínico |

### AC05 · Evidencia científica para el paciente (US-265)

| Paciente | Pregunta literal | Respuesta esperada | Debe verse |
|---|---|---|---|
| (a) mama | «¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?» | El mismo análisis que serviría `/rag/query` para esa pregunta (`FakeEvidenceQuery`): opciones citadas, tabla de aplicabilidad por criterio, opciones descartadas si las hay | «Opciones descritas en la evidencia»; citas del corpus con fuente, año y licencia; aplicabilidad Coincide / Parcial / No coincide / Desconocido; sin puntaje clínico (RN-28) |
| (b) próstata | «¿Qué opciones sistémicas describe la evidencia del corpus de la demo para un paciente con cáncer de próstata metastásico sensible a la castración?» | Análisis de próstata con opciones citadas | Igual |
| (a) mama | «¿En qué se diferencia la población del estudio de mi paciente?» (seguimiento tras una evidencia) | Bloque `evidencia` sobre la población del estudio citada | El turno sigue citando fuentes recuperadas en el hilo; el hilo conserva el contexto |
| (a) mama | «¿Qué evidencia hay para este caso?» | Expansión contextual (ver §5): puede salir una evidencia ampliada con aviso de ampliación, o «sin opciones» | Aviso de ampliación visible cuando se amplió la búsqueda |

Sin evidencia sobre el umbral: tras el **único** segundo loop de reescritura, «sin evidencia» con `topRelevanceScore = null` (RN-02) y sin invocar al LLM de generación.

### AC06 · Fuentes y limitaciones (US-266)

| Paciente | Pregunta literal | Respuesta esperada | Debe verse |
|---|---|---|---|
| (a) mama | «¿Cuáles son las fuentes y las limitaciones?» | Bloque `fuente` («Breast Cancer Treatment (test). NCI PDQ. 2025. en. dominio_publico») y bloques `limitacion` (alcance de la recuperación con fecha de corte 2026-09-30 y **fuentes no incluidas**; limitaciones de la evidencia) | Metadatos desde el catálogo (ausente → «No disponible», RN-25); NCCN/ESMO solo como fuente **no incluida**, sin contenido |
| (b) próstata | «¿Cuáles son las fuentes y las limitaciones?» | Variante de próstata de fuentes y limitaciones | Igual |
| (a) mama | «¿Qué describe la evidencia sobre melanoma uveal?» | Respuesta sin evidencia (fuera del corpus): sin opciones y limitación | `top_relevance_score` ausente, no 0 |

### Preguntas de control (límites del chat)

| Pregunta literal | Respuesta esperada |
|---|---|
| «Necesito ayuda con este caso» | `no_clasificada`: «No se pudo clasificar la pregunta. Puede reformularse indicando si se refiere a la situación del caso, a los datos que faltan o a la evidencia científica.» Sin avisos de análisis |
| «¿Lo descrito aplica al tratamiento que recibió [NOMBRE]?» | `fuera_de_alcance`: «Esta conversación solo trata del paciente y del tipo de cáncer del caso abierto…» (la pregunta llega enmascarada) |

## 3. Qué sirve el fake y qué requiere el LLM real local

**Con `LLM_PROVIDER=fake`** (US-034 AC-6, US-267 AC-1; Compose, CI y E2E):

- `FakeChatTurn` no usa grafo ni LLM: enruta la pregunta con **las mismas reglas del motor real** (`es_fuera_de_alcance`, `clasificar_por_reglas`, `es_seguimiento_de_evidencia`); sin regla, `no_clasificada` (no hay LLM que clasifique).
- Sirve el ejemplo del contrato por intención: caso → `chat-turn-caso-ok.json`, faltantes → `chat-turn-faltantes.json`, fuentes → `chat-turn-fuentes-ok.json`, seguimiento → `chat-turn-seguimiento-evidencia.json`; variantes de próstata (`…-situacion-prostata`, `…-faltantes-prostata`, `…-fuentes-prostata`).
- «¿Por qué importa …?» elige el ejemplo por el dato que nombra la pregunta (Ki-67, menopausia, HRR/BRCA); un dato sin ejemplo propio sirve «fuera del catálogo».
- La evidencia sale del mismo análisis que `/rag/query` en modo falso (`FakeEvidenceQuery`), incluido «sin evidencia» y varias opciones.
- Mismo `RegistroDeHilos` que el real: TTL, desalojo y `404 HILO_DESCONOCIDO`, con rehidratación desde Backend 1.
- Es **determinista**: la misma pregunta devuelve el mismo ejemplo, sea cual sea el paciente abierto del mismo tipo (el texto de los ejemplos es el del paciente de referencia; no se recalcula por paciente). **Por eso en la demo fingida la respuesta de caso de otro paciente de mama mostrará los datos del ejemplo.**

**Requiere el LLM real local** (Ollama/vLLM nativo, fuera de Docker, RN-12):

- Clasificación de preguntas sin regla (`CHAT-RUTA`), interpretaciones combinadas, redacción de síntesis y explicación de relevancia con citas.
- NLI y *reranker* reales: soporte de cada afirmación, fidelidad y precisión de citas.
- Latencia real (tope p95 de `/platform/evidence-analyses` de 15 s) y soporte de preguntas libres.
- Cualquier dato de tipo real: **prohibido** antes del gate G-piloto (RN-13); la demo es sintética.

## 4. Límites conocidos (`S6-deuda.md`)

Declararlos en la demo, no esconderlos:

- **D6-55 · duplicidad del texto de «sin opciones».** En un turno de evidencia sin opciones pueden verse dos frases cercanas («Evidencia recuperada sin opciones soportadas» de Backend 2 y «La evidencia recuperada no describe opciones para esta pregunta» de `AnalysisResult`). **Decidido** (usuario, 2026-11-07): la fuente única es Backend 2 y `web` solo renderiza lo que devuelve; el ajuste **no está implementado** en el S6 (próximo periodo).
- **D6-46 · fidelidad NLI de 0,83 frente a la meta de 0,90** en los tres modos de recuperación; problema previo, no atribuible a la híbrida. Post-MVP (calidad NLI, OL-06).
- **Sesgo de cribado en próstata (D6-42).** Con la expansión contextual, próstata recupera cribado por el término PSA; el ajuste **US-273** queda pendiente. No presentar la expansión en próstata como validada.
- **D6-45 · p95 de consulta completa.** ~14,7 s en `dense` frente al tope de 15 s; con `RERANKER_MAX_PAIRS=20` se estimó ~15,4 s (D6-44), sobre el tope. Medido con la máquina cargada; sin repetir en máquina libre.
- **D6-50 · sin corrida real hasta la final.** Soporte NLI, precisión de enlaces y latencia del chat se midieron solo con adapters falsos; la corrida real única del S6 es opcional y depende del presupuesto.
- **D6-53 · dataset `chat-v1`:** 13 casos con `revision_oncologo: pendiente`; el reporte dice `no_validada`.
- **D6-49 · E2E:** cobertura de punta a punta solo del recorrido feliz de mama contra el fake; próstata sin E2E.
- **D6-38 · preguntas en inglés** se enrutan mal (patrones solo en español).
- **D6-40:** el 503 del histórico en el panel lateral no ofrece «Reintentar» y el panel desborda 1 px a 375 px. **D6-41:** contraste con `docs/ux/S6/` (variante B) sin revisar.
- **D6-36:** tests de plazo 504 inestables en CI; pueden aparecer fallos intermitentes (no afectan a la demo).
- **D6-43 / D6-47:** `RETRIEVAL_MODE` se queda `dense`; la híbrida no es configurable en Compose.
- **D6-37:** `evaluate` con el corpus ampliado falla hasta aplicar la corrección de L1D-326.
- **D6-56:** tercera copia de `normalizar` en el validador del catálogo; sin efecto en runtime.

## 5. Expansión contextual de la consulta (`QUERY_CONTEXT_EXPANSION_ENABLED`)

- **Por defecto: apagada** en Compose (`${QUERY_CONTEXT_EXPANSION_ENABLED:-false}`) hasta cerrar H-1 y H-2 de L1D-329 (ADR-52, D6-42). `RERANKER_MAX_PAIRS` va vacío en Compose (usa el valor de `Settings`, hoy 12; la decisión del usuario del 2026-11-07 lo lleva a 20 sin implementar todavía, D6-44).
- Apagada, la pregunta «¿Qué evidencia hay para este caso?» no se amplía con el contexto del paciente.

### Si la corrida final es satisfactoria: encendido (`RERANKER_MAX_PAIRS=20`)

[PENDIENTE: resultado de la corrida final]

- Levantar con `QUERY_CONTEXT_EXPANSION_ENABLED=true` y `RERANKER_MAX_PAIRS=20`.
- Verificar el aviso de ampliación visible (L1D-332) y reportar el p95 de consulta completa frente al tope de 15 s: [PENDIENTE: resultado de la corrida final].
- Revisar la evidencia de próstata por el sesgo de cribado por PSA: [PENDIENTE: resultado de la corrida final].

### Si no: apagado (`RERANKER_MAX_PAIRS=12`)

[PENDIENTE: resultado de la corrida final]

- Dejar los valores por defecto (`false` y 12). Declarar en la demo que la expansión contextual existe, está probada con adapters falsos y no se activa por falta de medición real.

## 6. Checklist previo al ensayo

- [ ] Rama de la Demo 6 actualizada con `main` y CI en verde (0 checks en fallo, 0 pendientes, 0 alertas abiertas).
- [ ] Modelos locales disponibles (`ollama list`): LLM, embeddings, *reranker* y NLI según el ADR de modelos locales; LLM ≤ 21 GB y stack ≤ ~30 GB sin swap (equipo de referencia de 32 GB). Comprobar con `ollama ps`.
- [ ] `ollama serve` activo **fuera de Docker** (Metal no se expone en Docker). Sin esto el modo real devuelve «LLM local no disponible».
- [ ] **`levantar.sh` solo después de la corrida final** (sin Docker, modelos ni corridas antes). Decidir entonces la expansión contextual (§5) y rellenar los marcadores `[PENDIENTE: resultado de la corrida final]`.
- [ ] `LLM_PROVIDER=fake` para el ensayo sin modelos; modelos reales solo si se hizo la corrida final.
- [ ] Verificar en «Verificación del seed» de `levantar.sh` el número de pacientes sembrados; abrir la ficha del paciente (a) y del (b) antes de preguntar.
- [ ] Recorrer las preguntas del §2 literalmente, con RN-19 y «Opciones descritas en la evidencia» visibles.
- [ ] Comprobar la consola y la red (`visual-check`): cero violaciones de CSP, solo `/api/*` del mismo origen, sin PII en URLs.
- [ ] Sin datos reales ni secretos en pantalla ni en el repo (RN-14); solo pacientes sintéticos.
- [ ] **Al terminar:** limpieza de Compose del proyecto de la demo (contenedores, redes y volúmenes del proyecto `oncolens-demo2`; cuidado con la red en `levantar.sh`), y detener `ollama serve` si ya no se usa.
