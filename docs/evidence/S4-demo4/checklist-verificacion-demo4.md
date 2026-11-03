# Demo 4 · Listado de verificación (S4)

Cómo usarlo: marca **una** de las tres casillas por fila (☐ → ☒) y anota en *Comentarios* lo observado (texto exacto, captura, valor medido). Todo con **datos sintéticos**.

- **Pasa**: lo observado coincide con lo esperado.
- **No pasa**: no coincide, o falla. Anota qué viste.
- **Otro**: no se pudo probar, no aplica, o pasa con una salvedad (explícala).
- **Modo**: `VIVO` = LLM real (gemma4 en Ollama) · `FING` = modo fingido, reproducible (`LLM_PROVIDER=fake`) · `CMD` = comando o inspección técnica · `HUM` = tarea humana.
- Las filas con `(conditional)` solo aplican si el caso aparece en la respuesta: en vivo, el LLM decide cuántas opciones redacta y qué fragmentos cita.

Fuente de lo esperado: `docs/demo/guia-demo-S4.md`, los textos de `apps/web/messages/es.json`, `backlog/sprints/S4-cierre.md` y `backlog/sprints/S4-deuda.md`. Las casillas de la sección A vienen sin marcar: la instalación la dejó lista, pero la verificación de cada punto es tuya.

Datos de la sesión: **fecha** 2026-11-02 · **responsable** ____ · **commit** `d8f422e9` · **proyecto Compose** `oncolens-demo4` · **LLM** `gemma4:26b-a4b-it-q4_K_M`.

---

## A. Instalación y arranque desde cero (L1D-297)

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| A1 | Levantado con un comando | `COMPOSE_PROJECT_NAME=oncolens-demo4 scripts/demo/levantar.sh` | Termina con «== Listo», código 0, URL `http://127.0.0.1:3000/login` y usuario `doc1@test.local` | CMD | ☒ | ☐ | ☐ | Claude: `levantar.sh` terminó con código 0 y «== Listo» (2026-11-02). Confirma tú. |
| A2 | Verificación del seed | Leer el bloque «Verificación del seed» de la salida | Todas las líneas con `esperado=N obtenido=N`; pacientes = identidades = pacientes del seed; ningún `FALLA` | CMD | ☒ | ☐ | ☐ | Claude vio: clinical.patient 5/5, identity.patient_identity 5/5, auth."user" 2/2, corpus.documentos_vigentes 10/10, con_poblacion_verificada mínimo 8, obtenido 8. |
| A3 | Corpus de la demo | Mismo bloque, línea del corpus | 10 documentos públicos y 310 fragmentos vigentes; 8 de 10 con población verificada | CMD | ☒ | ☐ | ☐ | Claude vio 10 documentos cargados, 8 con población verificada y 310 fragmentos reindexados en sparse. |
| A4 | Un solo puerto publicado | `docker ps --format '{{.Names}}\t{{.Ports}}'` | Solo el contenedor `web` publica `127.0.0.1:3000` (solo accesible desde esta máquina); `clinical-api`, `rag-orchestrator`, bases y MinIO sin puerto en el host (OUT-05) | CMD | ☒ | ☐ | ☐ | Claude vio solo `web` con `127.0.0.1:3000->3000`; el resto sin puerto publicado en el host. Ojo: se publica en 127.0.0.1, no en 0.0.0.0. |
| A5 | Ollama con contexto 8192 | `curl -s localhost:11434/api/ps` | El modelo cargado muestra `context_length: 8192` (ADR-39) | CMD | ☒ | ☐ | ☐ | Claude: el script verificó el contexto 8192 al cargar el modelo. Después Ollama lo descarga por inactividad (`/api/ps` vacío): vuelve a cargarse con la 1.ª consulta. |
| A6 | La app responde | Abrir `http://127.0.0.1:3000/login` | Pantalla de inicio de sesión (HTTP 200) | VIVO | ☒ | ☐ | ☐ | Claude: `/login` respondió HTTP 200. |
| A7 | Imágenes construidas desde cero | `docker images --filter "reference=oncolens-demo4*"` | Imágenes de `web`, `clinical-api`, `rag-orchestrator` y `clinical-seed` creadas por esta instalación | CMD | ☒ | ☐ | ☐ | |

## B. Acceso y permisos

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| B1 | Inicio de sesión del médico | Entrar con `doc1@test.local` y la contraseña de `infra/docker/secrets/seed_doctor_password` | Entra y aterriza en `/pacientes/0fd028e2-…/analisis` (paciente (a)) | VIVO | ☒ | ☐ | ☐ | |
| B2 | Cookie de sesión opaca | DevTools → Application → Cookies | Cookie de sesión `HttpOnly`, `SameSite=Strict`; sin JWT visible en el navegador | CMD | ☒ | ☐ | ☐ | |
| B3 | El administrador no ve datos clínicos | Cerrar sesión; entrar con `admin@test.local` (`seed_admin_password`); intentar abrir una ficha o un análisis | Puede gestionar cuentas, pero **no** lee datos clínicos ni análisis (acceso denegado, `403`) | VIVO | ☒ | ☐ | ☐ | |
| B4 | Credenciales erróneas | Contraseña incorrecta del médico | Mensaje de error sin revelar si el usuario existe; no entra | VIVO | ☒ | ☐ | ☐ | |

## C. Listado, ficha y datos críticos faltantes (L1D-95, L1D-97)

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| C1 | Listado de pacientes | `/pacientes` | Lista los 5 pacientes sintéticos. **Observado por Claude: la API del listado devuelve `missingCriticalCount = 0` para todos** (contador por fila sin implementar, deuda de L1D-95): la columna «Faltantes críticos» probablemente no refleja los faltantes reales. Anota qué ves | VIVO | ☒ | ☐ | ☐ | Hallazgo H5 de `pacientes-y-preguntas-demo4.md` |
| C2 | Aviso de faltantes en la ficha | Abrir la ficha del paciente (e) | «Faltan 5 datos críticos para este tipo de cáncer» (RP, Ki-67, estado menopáusico, tratamientos previos, BRCA germinal) y la nota: el análisis puede hacerse igual; los criterios que dependan de esos datos saldrán «Desconocido» | VIVO | ☒ | ☐ | ☐ | Cifra tomada de `GET /completeness` |
| C3 | Paciente (a) | Ficha del paciente (a) (mama HER2+) | **No está sin faltantes**: «Faltan 4 datos críticos» (RP, Ki-67, tratamientos previos, BRCA germinal). La guía lo llama «completa» solo por HER2, RE y estadio | VIVO | ☒ | ☐ | ☐ | Hallazgo H6 |
| C4 | Los avisos no bloquean | Desde la ficha del paciente (e), pulsar «Analizar evidencia» | Se puede lanzar el análisis igualmente (RN-26) | VIVO | ☒ | ☐ | ☐ | |
| C5 | Datos sin verificar (conditional) | Buscar en alguna ficha el aviso «N datos sin verificar · no bloquean el análisis» | Si aparece, informa y no bloquea; se distingue del aviso de faltantes | VIVO | ☒ | ☐ | ☐ | |
| C6 | Checklist de próstata | Ficha del paciente (b) (próstata ISUP 3) | Muestra el checklist propio de próstata, distinto del de mama | VIVO | ☒ | ☐ | ☐ | |

## D. Análisis de evidencia con el LLM real (L1D-144, 145, 131, 296, 291–294)

Paciente (a). Pregunta sugerida para ver un **Parcial** real: *«¿Qué describe la evidencia sobre el beneficio del tamoxifeno adyuvante en mujeres premenopáusicas y posmenopáusicas con cáncer de mama con receptores de estrógeno positivos?»* La primera consulta tarda ~15–25 s (carga el modelo).

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| D1 | Análisis con evidencia | Escribir la pregunta y pulsar «Analizar evidencia» | Estado «Análisis listo: N opciones descritas» bajo el encabezado «Opciones descritas en la evidencia» | VIVO | ☒ | ☐ | ☐ | |
| D2 | Hasta 3 opciones, ordenadas | Contar las tarjetas | Entre 1 y 3 tarjetas numeradas; nunca más de 3 | VIVO | ☒ | ☐ | ☐ | |
| D3 | Criterio de orden visible | Leer encima de las opciones | «Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego…» y «La numeración indica la posición en el orden por aplicabilidad, no una preferencia.» | VIVO | ☒ | ☐ | ☐ | |
| D4 | Citas verificables | Abrir una tarjeta y «Ver fragmento» | Cada opción tiene ≥ 1 chip de cita con `sourceName` y `externalId`; el fragmento sale en su idioma original; metadato ausente = «No disponible» | VIVO | ☒ | ☐ | ☐ | |
| D5 | Relevancia como metadato secundario | Mirar el final de la tarjeta | Rótulo «Relevancia de recuperación de evidencia», **después** de las citas, coma decimal y 2 decimales, sin barra, estrella ni porcentaje; texto «Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad.» | VIVO | ☒ | ☐ | ☐ | |
| D6 | Conteos de aplicabilidad | Línea «Criterios del estudio frente a datos registrados:» | Cuatro conteos (Coincide, Parcial, No coincide, Desconocido), **sin puntaje combinado** | VIVO | ☒ | ☐ | ☐ | |
| D7 | Parcial real por fuente | Tabla de aplicabilidad por fuente de `10.1093/jnci/djag049` (tamoxifeno, ECA) | **Parcial · 1** (`estado_menopausico`, inclusiva) y 5 Desconocido | VIVO | ☒ | ☐ | ☐ | |
| D8 | Criterio excluyente marcado | Buscar un criterio con ⚑ | Leyenda «⚑ Criterio excluyente según el catálogo; un No coincide en él se cuenta primero en el orden por aplicabilidad» | VIVO | ☒ | ☐ | ☐ | |
| D9 | Pares 1 y 2 en vivo | Los textos exactos del §2 de `guia-demo-S4.md` | Observado por Claude: par 1 → 1 opción 0·0·0·6 y 1 descartada; par 2 → 0 opciones (ver D22). El resumen en vivo sale **0·0·0·6** (documentado: el estado se calcula con los fragmentos que cita la opción). Los conteos 1·2·0·3 se enseñan en modo fingido (E2) | VIVO | ☒ | ☐ | ☐ | |
| D10 | Aviso de opciones no mostradas (conditional) | Si la respuesta tiene más de 3 opciones con soporte | «La evidencia describe N opción(es) más con soporte que no se muestran por el límite de 3…» | VIVO | ☒ | ☐ | ☐ | |
| D11 | Descartadas aparte (conditional) | Si alguna opción se descarta en la verificación | Sección **colapsada** «Descartadas en la verificación — solo para revisión», con el motivo; sin ningún control que vincule a un tratamiento | VIVO | ☒ | ☐ | ☐ | |
| D12 | Base del análisis | Abrir el bloque «Base del análisis» | Supuestos, «Fuentes no incluidas» (NCCN y ESMO solo como no incluidas), «Afirmaciones omitidas», «Qué se buscó» (fuentes · filtros · N fragmentos sobre el umbral) y datos críticos faltantes con la nota «Solo informa; no bloquea el análisis» | VIVO | ☒ | ☐ | ☐ | |
| D13 | Avisos obligatorios | Mirar la pantalla del análisis | Visibles: «Generado por IA; requiere validación clínica independiente por el oncólogo tratante.» y «Uso académico/investigación» | VIVO | ☒ | ☐ | ☐ | |
| D14 | Lenguaje no prescriptivo | Leer todas las opciones y justificaciones | No aparece «recomendado para este paciente», «debe recibir», «se recomienda», «considere iniciar» ni equivalentes (RN-23) | VIVO | ☒ | ☐ | ☐ | |
| D15 | Sin evidencia | Pregunta fuera del corpus, p. ej. *«¿Qué evidencia hay sobre trasplante de médula ósea en leucemia pediátrica?»* | «Sin evidencia sobre el umbral»; ninguna opción; no se inventa una respuesta | VIVO | ☒ | ☐ | ☐ | |
| D16 | Paciente con datos faltantes | Misma pregunta del tamoxifeno con el paciente (e) | Los criterios que dependen del dato ausente salen «Desconocido»; el orden puede diferir del paciente (a) | VIVO | ☒ | ☐ | ☐ | |
| D17 | Próstata | Abrir el análisis del paciente (b) y preguntar por próstata | La recuperación filtra por el tipo de cáncer del paciente; las fuentes citadas son de próstata | VIVO | ☒ | ☐ | ☐ | |
| D18 | Latencia | Cronometrar la primera y la segunda consulta | Primera ~15–25 s; ninguna termina en error por plazo (`RAG_TIMEOUT_MS=90000`) | VIVO | ☒ | ☐ | ☐ | |
| D19 | Modos por defecto | DevTools → Network → respuesta de `/api/evidence-analyses`, `meta.retrievalParams` | `retrievalMode = dense` y sin reescritura aplicada (`QUERY_REWRITE_ENABLED=false` por defecto) | CMD | ☒ | ☐ | ☐ | |
| D20 | **Coincide** real | Paciente (a); pregunta **Q14** de `pacientes-y-preguntas-demo4.md` | Opciones con resumen **1·0·0·5** y `estado_her2 → coincide` en la fuente `breast-treatment-pdq`. Observado por Claude el 2026-11-02 (2 opciones: Margetuximab y Tucatinib) | VIVO | ☒ | ☐ | ☐ | |
| D21 | **Parcial** real | Paciente (a); pregunta **Q1** | En la tabla por fuente de `10.1093/jnci/djag049`: **0·1·0·5** con `estado_menopausico → parcial`. El resumen de la opción sale 0·0·0·6 | VIVO | ☒ | ☐ | ☐ | |
| D22 | Pregunta sin opciones (hallazgo H1) | Paciente (a); pregunta exacta del par 2 (**Q4**) | Observado por Claude: `con_evidencia` con **0 opciones y 0 descartadas**. Anota qué muestra la interfaz (¿mensaje, pantalla vacía?) | VIVO | ☒ | ☐ | ☐ | |
| D23 | Descartadas con motivo | Paciente (b); pregunta **Q10** (PARP en próstata) | 0 opciones y 2 descartadas (olaparib), motivo `afirmacion_sin_soporte`; sección «Descartadas en la verificación — solo para revisión» y texto «No hay opciones descritas con soporte verificable en la evidencia recuperada.» | VIVO | ☒ | ☐ | ☐ | |
| D24 | Salida del LLM no validable | Paciente (a); preguntas **Q16** o **Q18** (≈ 10 % de las consultas) | HTTP 503 `LLM_OUTPUT_INVALID`: «El modelo local devolvió una respuesta que no se pudo validar.» La interfaz no muestra detalles internos y deja reintentar | VIVO | ☒ | ☐ | ☐ | Puede no repetirse: el LLM no es determinista |
| D25 | «0 opciones» por descarte de la verificación (hallazgo H8) | Paciente (a); *¿Qué indican las pruebas científicas sobre la terapia dirigida para el cáncer de mama metastásico HER2-positivo en pacientes que han recibido previamente trastuzumab, pertuzumab y trastuzumab emtansina?* Repetir hasta 5 veces: es intermitente | Cuando salen 0 opciones y 2 descartadas: la línea de estado dice «Análisis listo: 0 opciones descritas» (confuso), el cuerpo dice «No hay opciones descritas con soporte verificable en la evidencia recuperada.» con el resumen de motivos, y la sección colapsada «Descartadas en la verificación — solo para revisión» lista trastuzumab emtansina y lapatinib. Observado por Claude: 2 de 3 consultas del usuario descartaron las 2 opciones por `afirmacion_sin_soporte`; 4 de 4 repeticiones por API dieron 2 opciones | VIVO | ☒ | ☐ | ☐ | |

## E. Modo fingido reproducible (L1D-297, US-247)

Requiere `npm ci` y los navegadores de Playwright en la copia (ver la guía de la sesión).

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| E1 | Prueba de los pares | `scripts/e2e/ejecutar.sh -- --grep "US-247"` | Suite en verde: Compose de test, `LLM_PROVIDER=fake`, seed sintético | FING | ☒ | ☐ | ☐ | |
| E2 | Conteos del par 1 | Resultado de la prueba o respuesta fija | Opción 1: **1·2·0·3**; opción 2: **1·0·0·5**; la opción 1 va primero | FING | ☒ | ☐ | ☐ | |
| E3 | Par 2 con criterio excluyente | Idem | **1·2·1·2**, `populationNotComparable = true`, aviso «Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.» y `warnings` con `poblacion_no_comparable` (RN-26: no se oculta) | FING | ☒ | ☐ | ☐ | |
| E4 | E2E del panel de 3 opciones (D4-37) | `scripts/e2e/ejecutar.sh -- --grep "panel-tres-opciones"` | En verde: 3 tarjetas en el orden esperado, con conteos, citas y relevancia al final (tareas 2.3 y 2.6 de L1D-145) | FING | ☒ | ☐ | ☐ | |
| E5 | Suites de lenguaje y contratos | `npm run test:lenguaje && npm run contracts:check` | 5/5 en verde; contratos sin hallazgos (33 reglas) | CMD | ☒ | ☐ | ☐ | Claude ejecutó en la copia Demo4 `test:lenguaje` (5/5) y `contracts:check` (33 reglas sin hallazgos). |

## F. Verificaciones que cierran deuda (solo con el stack real)

| # | Qué cierra | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| F1 | D4-02 / AC-7 de L1D-298: RSS en régimen estable | Tras 1–2 consultas de calentamiento, medir con `docker stats --no-stream` y `ps` de Ollama; repetir ≥ 3 veces con proceso fresco | Stack ≤ ~30 GB sin swap y LLM local ≤ 21 GB (máquina de referencia de 32 GB; esta tiene 48 GB, anótalo) | CMD | ☒ | ☐ | ☐ | |
| F2 | L1D-205 tarea 1.4: RSS con PII (modelo G) cargado | Misma medición con el stack completo | Valor medido anotado; sin swap | CMD | ☒ | ☐ | ☐ | |
| F3 | D4-08: smoke de la semilla y partición ADR-45 | Con PostgreSQL y Milvus reales (tareas de `us-231b` 1.12 y ADR-45) | Smoke en verde | CMD | ☒ | ☐ | ☐ | |
| F4 | D4-35 1.1 / L1D-117 (US-118): revisión humana de la muestra | Revisar `data/raw/seed/poblacion-verificada.json` con `data/evaluation/corpus-metadatos/PLANTILLA.md` (~20 min) y limpiar `linea` en `pmc-mama-cdk46-guia` | Cada campo marcado correcto o incorrecto; porcentaje anotado. Cierra el AC de US-118 | HUM | ☒ | ☐ | ☐ | |
| F5 | D4-30: segundo loop de reescritura (AC-9 de L1D-300) | `evaluate` con el brazo «reescritura» y el LLM local | Latencia, recall@10 y MRR con y sin reescritura; «sin evidencia» ≥ 0,90. Decide el valor por defecto de `QUERY_REWRITE_ENABLED` | CMD | ☒ | ☐ | ☐ | |
| F6 | D4-21: híbrida frente a densa (AC-1 de L1D-245) | `evaluate --config eval/configs/s4-hibrida.yaml` | Reporte con A0, A2 y A2b: recall@10, recall es→en y MRR. Sin retroceso → la demo puede usar `hibrida`; con retroceso → sigue `dense` | CMD | ☒ | ☐ | ☐ | |
| F7 | D4-39 3.3: `ANALYSIS_MAX_OPTIONS=3` | Comprobar `.env.example` | La línea existe con valor 3 (los agentes no pueden leer ese fichero) | HUM | ☒ | ☐ | ☐ | |
| F8 | D4-34: lenguaje de la guía | Buscar «recomendada» en `docs/demo/guia-demo-S4.md` (línea ~93) | Sustituir por «sugerida» (RN-23) | HUM | ☒ | ☐ | ☐ | |

## G. Seguridad y privacidad

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| G1 | Cabeceras de seguridad de `web` (hallazgo MEDIO del S4) | DevTools → Network → cabeceras de respuesta de `/login` | **Esperado hoy: ausentes** (`Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`). Si faltan, confirma el hallazgo (se agenda antes de G-Piloto) | CMD | ☒ | ☐ | ☐ | |
| G2 | Sin PII en URLs ni red | Network durante un análisis | Solo llamadas a `/api/*` del mismo origen; rutas con UUID, sin nombres ni documentos | CMD | ☒ | ☐ | ☐ | |
| G3 | Sin datos reales | Revisar nombres y documentos de los pacientes | Todo sintético (tokens `SINT-*`); aviso de uso académico | VIVO | ☒ | ☐ | ☐ | |
| G4 | Logs sin identidad | `docker compose -p oncolens-demo4 logs clinical-api rag-orchestrator \| head -200` | Sin nombres, documentos, secretos ni texto de documentos; pacientes por UUID y `traceId` | CMD | ☒ | ☐ | ☐ | |

## H. Cierre y limpieza

| # | Funcionalidad | Cómo verificar | Resultado esperado | Modo | Pasa | No pasa | Otro | Comentarios |
|---|---|---|---|---|---|---|---|---|
| H1 | Apagado | `COMPOSE_PROJECT_NAME=oncolens-demo4 scripts/demo/apagar.sh --borrar-datos` | Cierra Attu si estaba abierto, baja el stack **con volúmenes** y detiene el Ollama que arrancó `levantar.sh` | CMD | ☒ | ☐ | ☐ | |
| H2 | Nada queda del proyecto | `docker ps -a`, `docker volume ls`, `docker network ls` filtrando `oncolens-demo4` | Sin contenedores, volúmenes ni redes del proyecto `oncolens-demo4` | CMD | ☒ | ☐ | ☐ | |

---

## Resumen de la sesión (rellenar al terminar)

| Sección | Pasa | No pasa | Otro |
|---|---|---|---|
| A. Instalación | 7 | 0 | 0 |
| B. Acceso | 4 | 0 | 0 |
| C. Ficha y faltantes | 6 | 0 | 0 |
| D. Análisis (vivo) | 25 | 0 | 0 |
| E. Modo fingido | 5 | 0 | 0 |
| F. Deuda | 8 | 0 | 0 |
| G. Seguridad | 4 | 0 | 0 |
| H. Cierre | 2 | 0 | 0 |

**Issues de Linear que esta sesión puede mover:** L1D-117 y L1D-244 (con F4), L1D-205 (con F2), L1D-298 (AC-7, con F1), y la verificación empírica pendiente de L1D-300 (F5) y L1D-245 (F6).

**Resultado (usuario, 2026-11-02):** todos los ítems pasaron (61/61). Stack bajado y limpiado: 0 contenedores, volúmenes, redes e imágenes del proyecto `oncolens-demo4`.

**Hallazgos registrados como feedback:** OUT-01…OUT-08 en `docs/evidence/S4-demo4/S4-demo-outcomes.md` (PR #285); OUT-05…OUT-07 → US-250 (S5), US-251 y US-252 (S6).
