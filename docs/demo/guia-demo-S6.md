# Guía de la Demo 6 (S6): chatbot MVP sobre el paciente

Todo con **datos sintéticos** (pacientes del seed; corpus público con licencia aceptada, RN-14, RN-21). Complementa `docs/demo/runbook-demo-S1.md` (preparar, levantar, apagar, fallos frecuentes) y las guías `guia-demo-S4.md` y `guia-demo-S5.md`. Fuentes de esta guía: `backlog/features/FEAT-12-chatbot-mvp.md`, `backlog/sprints/S6-plan.md`, `backlog/sprints/S6-deuda.md`, `contracts/examples/chat-turn-*.json` y `apps/rag-orchestrator/app/infrastructure/fake/fake_chat_turn.py`.

> **Los textos del guion son los del modo fingido.** Son los de `LLM_PROVIDER=fake`, que sirve los ejemplos de `contracts/examples/`. Con el LLM real local la redacción y las opciones varían. Toda salida muestra «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación» (RN-19). Los resultados medidos de la corrida final real del S6 (2026-11-07, commit `5920002a`, L1D-333) están en el §5; el chat con modelos locales **no se pudo medir** (D6-51/D6-52).

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
- Latencia real (tope p95 de consulta completa de 20 s, decisión del usuario del 2026-11-07; antes 15 s) y soporte de preguntas libres. Esperar 17-18 s por consulta con el LLM real y casos aislados de 23-25 s (§5).
- Cualquier dato de tipo real: **prohibido** antes del gate G-piloto (RN-13); la demo es sintética.

## 4. Límites conocidos (`S6-deuda.md`)

Declararlos en la demo, no esconderlos:

- **D6-55 · duplicidad del texto de «sin opciones».** En un turno de evidencia sin opciones pueden verse dos frases cercanas («Evidencia recuperada sin opciones soportadas» de Backend 2 y «La evidencia recuperada no describe opciones para esta pregunta» de `AnalysisResult`). **Decidido** (usuario, 2026-11-07): la fuente única es Backend 2 y `web` solo renderiza lo que devuelve; el ajuste **no está implementado** en el S6 (próximo periodo).
- **D6-46 · fidelidad NLI de 0,83 frente a la meta de 0,90** en los tres modos de recuperación; problema previo, no atribuible a la híbrida. Post-MVP (calidad NLI, OL-06).
- **Próstata con la expansión contextual (D6-42).** El top-3 deja de ser cribado por PSA (54/66 a 2/13), pero a costa de cobertura: solo 9/22 preguntas genéricas con evidencia con el caso con grado y 13/22 con el caso con HRR (mama: 22/22). Además, 1/24 preguntas adversarias recupera evidencia en próstata (preexistente). No presentar la expansión en próstata como validada (§5).
- **Latencia (D6-45).** Con 20 pares y expansión, el p95 de consulta completa medido es 17,05 s (fase 1) y 18,3 s (fase 2), frente a 14,71 s de la línea densa de 12 pares. El máximo observado es 23-25 s. El tope autorizado es de 20 s sobre el p95, no sobre el máximo. Una sola corrida, sin línea base A/B del mismo día.
- **Fidelidad NLI 0,822 frente a la meta de 0,90** en la corrida final (267/325); sin línea base para compararla.
- **Chat con modelos locales: no ejecutable (D6-51/D6-52).** El script `eval-chat-preparar.ts` está trasladado y no existe; no se midió ninguna cifra del chat con LLM real (p95 por intención, AC01 a AC06). El soporte NLI, la precisión de enlaces y la latencia del chat solo se midieron con adapters falsos (D6-50).
- **El `evaluate` oficial no mide la expansión contextual.** Las cifras del §5 salen de scripts de medición fuera del repo, no de un reporte versionado.
- **D6-53 · dataset `chat-v1`:** 13 casos con `revision_oncologo: pendiente`; el reporte dice `no_validada`.
- **D6-49 · E2E:** cobertura de punta a punta solo del recorrido feliz de mama contra el fake; próstata sin E2E.
- **D6-38 · preguntas en inglés** se enrutan mal (patrones solo en español).
- **D6-40:** el 503 del histórico en el panel lateral no ofrece «Reintentar» y el panel desborda 1 px a 375 px. **D6-41:** contraste con `docs/ux/S6/` (variante B) sin revisar.
- **D6-36:** tests de plazo 504 inestables en CI; pueden aparecer fallos intermitentes (no afectan a la demo).
- **D6-43 / D6-47:** `RETRIEVAL_MODE` se queda `dense`; la híbrida no es configurable en Compose.
- **D6-37:** `evaluate` con el corpus ampliado falla hasta aplicar la corrección de L1D-326.
- **D6-56:** tercera copia de `normalizar` en el validador del catálogo; sin efecto en runtime.

## 5. Expansión contextual de la consulta (`QUERY_CONTEXT_EXPANSION_ENABLED`)

**Decisión del usuario (2026-11-07):** se autoriza la expansión contextual **activa por defecto** y `RERANKER_MAX_PAIRS=20`, con un tope de p95 de consulta completa de **20 s** (antes 15 s), con prioridad a la calidad del RAG y del chatbot. La activación llega con el paso humano **H-1** (L1D-333).

### Comprobar el estado real antes de la demo

Hasta que se aplique H-1, Compose conserva la expansión **apagada** (`${QUERY_CONTEXT_EXPANSION_ENABLED:-false}`) y `RERANKER_MAX_PAIRS` vacío (usa el valor de `Settings`, hoy 12). No asumir el estado: comprobarlo.

- Leer el valor efectivo en el Compose levantado: `docker compose -p oncolens-demo2 config` (o el contenedor `rag-orchestrator`, variables `QUERY_CONTEXT_EXPANSION_ENABLED` y `RERANKER_MAX_PAIRS`), y revisar `.env.example` y `infra/docker/docker-compose.yml` en la rama de la demo.
- Si H-1 no se aplicó, levantar con `QUERY_CONTEXT_EXPANSION_ENABLED=true` y `RERANKER_MAX_PAIRS=20` por entorno, o declarar en la demo que la expansión sigue apagada (con 12 pares).
- Con la expansión activa, verificar el aviso de ampliación visible (L1D-332). Apagada, la pregunta «¿Qué evidencia hay para este caso?» no se amplía con el contexto del paciente.

### Resultados reales de la corrida final (2026-11-07, `5920002a`, `dense`, 20 pares, expansión activa)

Modelos locales (LLM `gemma4:26b-a4b-it-q4_K_M`, pesos ADR-39), corpus `s5-corpus-ampliado` (53 documentos / 252 chunks), umbral de relevancia 0,30, NLI 0,7, catálogo 2026.10.0. Una sola corrida; 0 llamadas a la nube.

| Métrica | Línea densa (12 pares) | Corrida final (20 pares) | Meta |
|---|---|---|---|
| p95 de consulta completa | 14,71 s | **17,05 s** (fase 1); **18,3 s** (fase 2) | ≤ 20 s (decisión del usuario; antes 15 s) |
| Máximo de consulta | n/d | 23,28 s (fase 1); 25,3 s (fase 2) | el tope aplica al p95 |
| recall@10 | 0,875 | 0,906 | ≥ 0,80 |
| recall@10 es→en | 0,886 | 0,914 | ≥ 0,70 |
| MRR | 0,849 | 0,887 | ≥ 0,60 |
| Precisión de citas | n/d | 1,00 (n=180) | ≥ 0,90 |
| Fidelidad NLI | n/d | **0,822** (267/325) | ≥ 0,90 (no se cumple) |
| Violaciones de RN-02 y términos prohibidos mostrados | 0 | 0 | 0 |

La comparación no es A/B puro (cambian código, pares y expansión) y no hay línea base del mismo día.

**Mama:** 22/22 preguntas genéricas con evidencia con el caso completo, sin falsos positivos.

**Próstata:**

- El top-3 deja de ser cribado: 54/66 en la línea base pasa a 2/13 con el caso con grado (meta ≤ 33/66 cumplida en lo numérico). Se logra con menos evidencia recuperada, no con más tratamiento.
- Cobertura de las 22 genéricas con evidencia: **9/22** (caso con grado) y **13/22** (caso con HRR), frente a 22/22 en la base. El criterio ≥ 18/22 no se cumple en próstata.
- El top-3 restante se concentra en `nci-prostata-pac-es`.
- 1/24 preguntas adversarias recupera evidencia en próstata (CTX-A08, `prevencion-hp-en`, puntaje 0,41, 0 opciones generadas); ya ocurría en la base. En mama, 0/24.
- Las adversarias sin evidencia devuelven `sin_evidencia` con `topRelevanceScore` null y sin invocar al generador (RN-02); los 14 controles quedan intactos.

### Qué decir y qué no prometer en la demo

- Decir: la expansión contextual mejora el caso de mama (22/22 con evidencia) y la latencia p95 medida es de 17-18 s por consulta con el LLM real, bajo el tope de 20 s; puntualmente puede llegar a 23-25 s.
- Decir: en próstata el sesgo de cribado por PSA baja, pero a costa de cobertura, y la fidelidad NLI (0,822) está por debajo de la meta de 0,90.
- No prometer: que las preguntas genéricas de próstata devuelvan evidencia. Pueden devolver «sin evidencia». **Preferir preguntas con tema propio** (por ejemplo, un tratamiento o un dato concreto del paciente) en vez de «¿Qué evidencia hay para este caso?».
- No prometer: métricas del chat con modelos locales (no se midieron), ni que el `evaluate` oficial cubra la expansión.

## 6. Checklist previo al ensayo

- [ ] Rama de la Demo 6 actualizada con `main` y CI en verde (0 checks en fallo, 0 pendientes, 0 alertas abiertas).
- [ ] Modelos locales disponibles (`ollama list`): LLM, embeddings, *reranker* y NLI según el ADR de modelos locales; LLM ≤ 21 GB y stack ≤ ~30 GB sin swap (equipo de referencia de 32 GB). Comprobar con `ollama ps`.
- [ ] `ollama serve` activo **fuera de Docker** (Metal no se expone en Docker). Sin esto el modo real devuelve «LLM local no disponible».
- [ ] **Estado de la expansión:** comprobar el valor efectivo de `QUERY_CONTEXT_EXPANSION_ENABLED` y `RERANKER_MAX_PAIRS` (§5); si H-1 no se aplicó, siguen apagado y 12.
- [ ] **Latencia esperada:** con el LLM real, 17-18 s por consulta (p95 medido 17,05 s y 18,3 s; tope 20 s), no 15 s; avisar de casos de 23-25 s.
- [ ] `LLM_PROVIDER=fake` para el ensayo sin modelos; con modelos reales, el chat no está medido (D6-51/D6-52).
- [ ] Verificar en «Verificación del seed» de `levantar.sh` el número de pacientes sembrados; abrir la ficha del paciente (a) y del (b) antes de preguntar.
- [ ] Recorrer las preguntas del §2 literalmente, con RN-19 y «Opciones descritas en la evidencia» visibles.
- [ ] Comprobar la consola y la red (`visual-check`): cero violaciones de CSP, solo `/api/*` del mismo origen, sin PII en URLs.
- [ ] Sin datos reales ni secretos en pantalla ni en el repo (RN-14); solo pacientes sintéticos.
- [ ] **Al terminar:** limpieza de Compose del proyecto de la demo (contenedores, redes y volúmenes del proyecto `oncolens-demo2`; cuidado con la red en `levantar.sh`), y detener `ollama serve` si ya no se usa.
