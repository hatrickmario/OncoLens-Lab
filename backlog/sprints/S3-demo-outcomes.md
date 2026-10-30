# S3 · Outcomes de la Demo 3 (feedback recopilado)

> Creado el 2026-10-28. Recoge el feedback de la Demo 3 (instalación desde cero en `Demo3/OncoLens-Lab` y recorrido). Guía de la demo: [`docs/demo/guia-demo-S3.md`](../../docs/demo/guia-demo-S3.md). Cierre del sprint: [`S3-cierre.md`](S3-cierre.md).
> **Markdown = fuente.** Cada outcome queda sin historia ni destino hasta que el usuario lo triage (S4 o deuda). Los IDs `OUT-nn` son inmutables.
> Estados: `abierto` → `triage` (con destino) → `cerrado`.

| ID | Tipo | Resumen | Estado | Destino |
|---|---|---|---|---|
| OUT-01 | Bug de autorización / UX | El administrador aterriza en la ficha de análisis de un paciente | confirmado en la Demo 3 | por asignar |
| OUT-02 | Bug (bloqueante de la demo) | `GET /api/patients` devuelve `500` (`IDENTITY_INTEGRITY_ERROR`) a todos los roles: el seed deja 5 pacientes y 0 filas en `identity.patient_identity` | confirmado; resuelto en esta instalación | por asignar |
| OUT-03 | Instalación | Reinstalar con volúmenes de un proyecto Compose previo falla en `corpus-migrate` | confirmado en la Demo 3 | por asignar |
| OUT-04 | Mejora de instalación | `levantar.sh` no verifica el seed una vez cargado (conteos mínimos) | confirmado en la Demo 3 | por asignar |
| OUT-05 | Mejora de instalación | `levantar.sh` no hace una limpieza inicial del estado previo (volúmenes, contenedores, imágenes del seed) | confirmado en la Demo 3 | por asignar |
| OUT-06 | Bug (bloqueante de la demo) | La pregunta del tamoxifeno devuelve «El modelo local no está disponible» aunque el modelo responde: una salida JSON inválida del proponente de aplicabilidad se trata como LLM caído y descarta un análisis ya generado | confirmado en la Demo 3 | por asignar |
| OUT-07 | Datos de demo (S4) | Incluir pacientes y preguntas de prueba con ✓ Coincide y ◐ Parcial distintos de 0: requiere actualizar pacientes y el corpus (metadatos de población de estudios y guías) | confirmado en la Demo 3 | S4 (con US-233) |
| OUT-08 | Bug / demo (S4) | La pregunta insignia de la guía §2.1 devuelve «sin opciones con soporte»: 2 opciones generadas y las 2 descartadas por `afirmacion_sin_soporte`; el mensaje mezcla dos motivos | abierto | por asignar |
| OUT-09 | UX | El `403` del administrador muestra el error genérico «No se pudo completar el análisis», no un aviso de permiso | abierto | por asignar (junto con OUT-01) |

## OUT-01 · El administrador aterriza en `/pacientes/<id>/analisis`

- **Observado (2026-10-28):** al iniciar sesión con `admin@test.local`, el navegador abre `/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis` (paciente (a)).
- **Causa:** `scripts/demo/levantar.sh` fija un único `WEB_HOME_PATH` para todos los roles y el login no distingue rol. La página (`apps/web/app/(dashboard)/pacientes/[id]/analisis/page.tsx`) solo valida UUID y sesión, no el rol.
- **Impacto:** no hay fuga de datos: `POST /api/evidence-analyses` con sesión de admin responde `403 PERMISO_DENEGADO`. Pero el administrador ve una pantalla clínica vacía que contradice «`admin` no lee datos clínicos» (PRD v1.4 §11, E-04).
- **Corrección propuesta:** redirigir tras el login según el rol (`doctor` → pacientes o el paciente semilla; `admin` → pantalla propia o «sin acceso»), y que las rutas `/pacientes/**` rechacen al `admin` desde el servidor (`proxy.ts` o el layout).
- **Verificación sugerida:** test de aceptación con sesión `admin` que comprueba redirección y que `/pacientes/<id>/analisis` no renderiza el panel. Relacionado: consola del administrador (S6, baja prioridad).

## OUT-02 · El listado de pacientes responde `500` con `IDENTITY_INTEGRITY_ERROR` (todos los roles)

- **Observado (2026-10-28, instalación desde cero):** `GET /api/patients` → `500 ERROR_INTERNO` tanto con `doc1@test.local` como con `admin@test.local`. El log de `clinical-api` registra `error.no_controlado` con `code: IDENTITY_INTEGRITY_ERROR` (p. ej. `traceId` `req_a81a3240`, `req_62d57cc8`). Corrige mi primera lectura, que lo atribuía al rol.
- **Causa confirmada:** `levantar.sh` ejecuta `docker compose ... run --rm clinical-seed` sin reconstruirlo. `up -d --build` no reconstruye servicios de un perfil (`seed`), así que se usó una imagen `oncolens-clinical-seed:latest` de hace 8 días, anterior a la siembra de identidades: sembró 5 pacientes y 0 filas en `identity.patient_identity`. `exigirIdentidad` (`patients.reglas.ts`) lanza `IdentityIntegrityError` ante un paciente sin identidad (invariante L1D-200).
- **Solución aplicada:** `docker compose -f infra/docker/docker-compose.yml --profile seed build clinical-seed` y repetir el seed: `identity.patient_identity` pasa a 5 filas y `GET /api/patients` responde 200 a `doctor` y a `admin`.
- **Impacto:** cualquier máquina con una imagen previa del seed (reinstalaciones, demos repetidas) obtiene un listado y una ficha rotos tras un `levantar.sh` «limpio».
- **Corrección propuesta:** (1) `levantar.sh` debe ejecutar `--profile seed build clinical-seed` antes del seed; (2) no recortar el reporte `seed_completo` y fallar si `identity.patient_identity` queda vacía; (3) test de humo de `levantar.sh` con una imagen del seed obsoleta.
- **Pendiente aparte:** la denegación de rol en `/api/evidence-analyses` sí funciona (`403`); no hay hallazgo de autorización en el listado.

## OUT-03 · Reinstalación con volúmenes de una instalación anterior

- **Observado:** `levantar.sh` falló en `corpus-migrate` con `password authentication failed for user "rag_corpus_migrator"`. Había un volumen `oncolens_postgres-data` (2026-10-21) de otra copia del repo; Compose usa el nombre de proyecto `oncolens` para todas, y los roles conservan las contraseñas viejas mientras `setup-secrets.sh` genera nuevas.
- **Solución aplicada:** borrar los volúmenes `oncolens_*` y relanzar; la instalación terminó bien.
- **Mejora propuesta:** que `levantar.sh` detecte un volumen `oncolens_postgres-data` previo que no corresponde a los secretos actuales y lo diga (con la orden `apagar.sh --borrar-datos`), o que permita un `COMPOSE_PROJECT_NAME` distinto por copia. Añadirlo también a «Si algo falla» del runbook (`docs/demo/runbook-demo-S1.md` §5).
- **Otros avisos de la instalación:** las secciones «Requisitos» y «Modelo en memoria» del log salen vacías y el contexto de 8192 de Ollama no se pudo comprobar en el log; no impidió el arranque.

## OUT-04 · Verificar el seed una vez cargado

- **Propuesto por el usuario (2026-10-28):** tras cargar el seed, comprobar con un test o un `count` sencillo que los datos quedaron bien.
- **Motivo:** OUT-02 pasó inadvertido: `levantar.sh` terminó con éxito y «Listo» con 5 pacientes y 0 identidades. El reporte `seed_completo` se recorta a 120 caracteres y no se valida.
- **Propuesta:** un paso «Verificación del seed» al final de `levantar.sh` (y fallo si no se cumple), con conteos esperados contra PostgreSQL y Milvus: `clinical.patient` = 5, `identity.patient_identity` = 5 (uno por paciente), `auth."user"` = 2, `corpus_chunks` > 0 y los 10 documentos del corpus. Opcional: login de `doc1@test.local` y `GET /api/patients` → 200 con 5 ítems. Los conteos esperados salen del propio seed, no de números fijos en el script.
- **Verificación:** test de humo que corre `levantar.sh` con una imagen del seed obsoleta y comprueba que falla con un mensaje claro.

## OUT-05 · Limpieza inicial antes de instalar

- **Propuesto por el usuario (2026-10-28):** hacer una limpieza inicial antes de levantar.
- **Motivo:** OUT-03 (volúmenes previos con otras contraseñas) y OUT-02 (imagen del seed de otra compilación) vienen del estado que deja una instalación anterior.
- **Propuesta:** un paso previo en `levantar.sh`, o un `scripts/demo/limpiar.sh`, que (1) detecte contenedores y volúmenes `oncolens_*` existentes y **pida confirmación** antes de borrarlos (nunca borrar sin avisar: pueden pertenecer a otra copia del repo), (2) reconstruya con `--build` también el perfil `seed`, y (3) cierre `attu` si quedó abierto. Integrarlo con `apagar.sh --borrar-datos`, que ya borra los volúmenes del proyecto, y documentarlo en el runbook (`docs/demo/runbook-demo-S1.md` §2).

## OUT-06 · «El modelo local no está disponible» con la pregunta del tamoxifeno

- **Observado (2026-10-29):** *«¿Qué dice la evidencia sobre tamoxifeno adyuvante en cáncer de mama con receptores hormonales positivos?»* sobre la paciente (a) muestra «El modelo local no está disponible. No se muestra ningún resultado parcial.», `traceId` `req_4b114783`. Antes lo había visto como `503 LOCAL_LLM_UNAVAILABLE` por API.
- **El modelo sí estaba disponible.** El log de `rag-orchestrator` para ese `traceId`: recuperación correcta (30 recuperados, 8 sobre el umbral), generación correcta (`opcionesGeneradas=2`, 3 citas traducidas) y cálculo de aplicabilidad (`desconocido=12`). 32 s después, el **proponente de aplicabilidad textual** (`apps/rag-orchestrator/app/infrastructure/llm/proponente_de_aplicabilidad.py`, L1D-128) registró `aplicabilidad_salida_invalida caracteres=4852 errores=json_invalid` y de inmediato `local_llm_unavailable`.
- **Causa:** `_parsear` convierte cualquier JSON inválido o fuera de esquema en `LlmLocalNoDisponibleError` (503), y el servicio descarta todo el análisis, incluidas las 2 opciones ya generadas y validadas. La docstring de `_dentro_del_presupuesto` ya advierte que con demasiado texto la salida se trunca; 4852 caracteres de salida apuntan a una respuesta cortada. Confirmar la truncación con la respuesta cruda (hoy solo se registra la clase del error).
- **Impacto:** con el LLM real, preguntas que recuperan muchos fragmentos fallan por completo en vez de degradar. El mensaje «modelo local no disponible» es engañoso: el oncólogo no sabe si reintentar o apagar algo.
- **Posible agravante por medir:** `ollama ps` mostraba el modelo con `size_vram` ≈ 1,2 GB de unos 17 GB y el contenedor `rag-orchestrator` en 10,3 GiB de 12,65 GiB (crecimiento por consulta, runbook S1 §4). Latencias de 32 a 62 s.
- **Corrección propuesta:** (1) distinguir «salida inválida del proponente» de «LLM caído» con otro código y mensaje; (2) degradar: si el proponente falla, devolver el análisis con la aplicabilidad en `desconocido` y un aviso, sin descartar opciones ya validadas (RN-26: los avisos no bloquean); (3) reducir el presupuesto de fragmentos o subir el límite de salida para evitar la truncación (valor en configuración, RN-22); (4) test de integración con un adapter que devuelve JSON truncado; (5) registrar si la salida estaba truncada, sin contenido (RN-14).
- **Investigación ampliada (2026-10-29, logs de `rag-orchestrator`, 13 consultas desde la instalación):**
  - 6 fallos, todos con **la misma firma**: `aboveThreshold=8`, `opcionesGeneradas=2`, `parrafosDeDetalle=3`, `documentos=2` y `aplicabilidad_salida_invalida caracteres=4852 errores=json_invalid`. Mismo tamaño exacto en los 6: con `temperatura=0.0` el mismo prompt da la misma salida, así que el fallo es **determinista para esa pregunta**, no intermitente; reintentar no ayuda.
  - 4852 caracteres ≈ 2048 tokens a ~2,4 caracteres por token, que es `LLM_MAX_OUTPUT_TOKENS` (2048 por defecto, `docker-compose.yml`). Es coherente con una **salida cortada por el tope de tokens** y con la advertencia de la docstring, pero no está confirmado: no se registra `finish_reason` ni la respuesta cruda.
  - Los 7 análisis que sí respondieron tienen otras firmas: de 1 a 3 documentos distintos, 1 a 7 fragmentos sobre el umbral (uno con 8 pero con 3 documentos). El log no guarda el texto de la pregunta (RN-14), así que no puedo decir qué otras preguntas fallan; solo que **no hay otra firma de fallo** en esta instalación.
  - **El paso es caro y no aporta nada hoy:** en los 7 análisis correctos, el proponente tardó 10 a 39 s (`rag_query_poblacion_textual latenciaMs`) y devolvió `propuestas=0 aceptadas=0`. Con el corpus actual (`population_criteria` en `no_disponible`, ver OUT-07) añade latencia y riesgo de 503 sin cambiar el resultado.
  - **Hipótesis por confirmar:** el riesgo crece con el número de criterios por documento (el esquema pide una propuesta por criterio y fuente) y no solo con el texto de entrada; las 2 fuentes del tamoxifeno generarían más propuestas de las que caben en 2048 tokens.
  - **Prueba que lo confirmaría:** repetir la pregunta con `LLM_MAX_OUTPUT_TOKENS=4096` (o registrar `finish_reason`); si pasa, es truncación.
- **Prueba con `LLM_MAX_OUTPUT_TOKENS=4096` (2026-10-29): la hipótesis de «tope demasiado bajo» queda descartada.** La misma pregunta (paciente (a), tamoxifeno) volvió a fallar con `503` en 70 s y `aplicabilidad_salida_invalida caracteres=8907 errores=json_invalid` (`traceId` `req_40f0b3ac`). La salida creció de 4852 a 8907 caracteres, proporcional al tope (≈2,2 caracteres por token en ambos casos): el modelo **no termina el JSON y genera hasta agotar el tope**, sea el que sea. Es coherente con una repetición sin fin a temperatura 0 (o con un esquema que no deja cerrar), no con un tope escaso. Subir el tope solo alarga la espera.
- **Pendiente para fijar la causa:** capturar la respuesta cruda del proponente con ese prompt (en local, con datos sintéticos) y ver si se repite un patrón o si el esquema obliga a más propuestas de las que caben; probar con temperatura >0 o con otro `format`/esquema. Configuración restaurada al valor por defecto (2048) tras la prueba.
- **Respuesta cruda capturada (2026-10-29, proxy de registro local entre `rag-orchestrator` y Ollama, datos sintéticos y corpus público):** `finish_reason: "length"`, 2048 tokens de salida, 4852 caracteres, prompt de 17 347 caracteres (4435 tokens). **El modelo entra en un bucle de repetición.** De 25 propuestas completas solo 5 son distintas, y una sola (`receptores_hormonales` = `estrogen receptor–positive`, `chunkId` `pmc-mama-tamoxifeno-eca@e2e4820ce4be#0000`) se repite **21 veces** hasta agotar el tope; la última queda cortada a medias. Descarta también la hipótesis de que el esquema pida demasiadas propuestas: el modelo no tiene más que decir, repite.
  - Causas de diseño que lo permiten: el esquema de `SalidaDeAplicabilidad` (`proposals`) **no tiene `maxItems` ni `uniqueItems`**, la temperatura es 0 (sin penalización de repetición efectiva) y la respuesta no se reintenta ni se rescata: un JSON cortado se descarta entero.
  - Otras observaciones: el modelo propone como «valor» cosas que no son una población (`progesterone receptor status`, `hormone receptor–positive or hormone receptor–unknown` es una definición, no un dato); la primera llamada (generación de opciones, 456 tokens, 9 s, `finish_reason: stop`) fue correcta, así que el fallo está solo en el proponente.
  - **Corrección propuesta adicional:** (8) `maxItems` (p. ej. criterios × fuentes) y deduplicar; (9) si la salida se corta (`finish_reason=length`), intentar rescatar las propuestas completas ya emitidas en lugar de descartar todo; (10) probar penalización de repetición o temperatura baja distinta de 0 en este paso; (11) test con un adapter que repite una propuesta hasta el tope. Configuración restaurada (`LLM_BASE_URL` y 2048 tokens) y proxy detenido.
- **Reproducción con variantes (2026-10-29, la petición capturada reenviada a Ollama, sin tocar el servicio, una a la vez; tope 2048):**

  | Variante | `finish_reason` | JSON válido | Propuestas (únicas) | Máx. repetición |
  |---|---|---|---|---|
  | A · temperatura 0,0 (base) | length | no | 25 (5) | 21 |
  | B · temperatura 0,3 (×2) | length | no | 25 (5), idéntico a A | 21 |
  | C1 · temperatura 0,7 | length | no | 30 (26) | 3 |
  | C2 · temperatura 0,7 | length | no | 25 (7) | 19 |
  | D · `frequency_penalty` 0,5 | stop | sí | 16 (16) | 1 |
  | E · `presence_penalty` 0,5 | stop | sí | 16 (16) | 1 |
  | F · `maxItems` 10 en el esquema | stop | sí | 10 (5) | 6 |
  | G · temperatura 0,3 + `maxItems` 10 | stop | sí | 10 (8) | 2 |

  - **La temperatura no es la solución.** 0,3 da exactamente la misma salida que 0; a 0,7 el bucle aparece en una de dos ejecuciones y en la otra la salida es larga sin repetir y también se corta (30 propuestas, 26 únicas). Cambia el modo de fallo, no lo elimina, y además se pierde el determinismo (RN-22).
  - **Las penalizaciones sí cierran el JSON, pero con un coste:** en D (y E) los dos últimos `chunkId` salen **corrompidos** (`…eca@e2e4ng20ce4be#0000` en vez de `…eca@e2e4820ce4be#0000`), porque la penalización castiga repetir los tokens del identificador, que hay que copiar literalmente. Una cita con identificador alterado es justo lo que RN-04 prohíbe; el filtro por `por_rotulo`/`chunkId` debería rechazarla, pero conviene medirlo. Además entran valores sin utilidad (`TNBC`, `progesterone receptor status`).
  - **`maxItems` solo corta el bucle:** F termina, pero las 10 propuestas son todas de `receptores_hormonales` (6 copias de una) y nunca llega a `estado_her2`, `estadio`, `estado_menopausico`: se pierde cobertura. Con temperatura 0,3 (G) hay más variedad, pero sigue sin cubrir los criterios.
  - **Qué indica:** el esquema deja al modelo libre de emitir cualquier número de filas por criterio, y a esta ventana de contexto (prompt de 4435 tokens) se queda atrapado en la primera. La salida debería tener forma que **no pueda repetirse**.
- **Investigación de la causa del bucle (2026-10-29; petición capturada de la pregunta del tamoxifeno, reenviada a Ollama con temperatura 0; cada variante es **una** ejecución determinista, sin repetir):**

  | Variante | Resultado |
  |---|---|
  | Original (2 fuentes + esquema estricto + sin límite) | bucle: 25 propuestas, 5 distintas, una ×21; `finish_reason=length` |
  | Sin esquema estricto (`response_format` quitado) | termina (775 tokens, 22 s); el modelo elige solo una forma `fuente → criterio → [valores]`, en un bloque ```json (no es el contrato) |
  | Con una línea «como máximo UNA propuesta por fuente y criterio» | termina (483 tokens, 11 s), 6 propuestas distintas |
  | Solo la fuente S1 | termina (709 tokens, 13 s), 9 distintas |
  | Solo la fuente S2 | termina (176 tokens, 4 s), 2 distintas |
  | Una tarea por criterio, ambas fuentes (6 tareas) | las 6 terminan (5 a 11 s cada una, ≈ 47 s en serie); ver calidad abajo |

  - **El bucle solo aparece con las tres condiciones a la vez:** las dos fuentes en el mismo prompt, la salida forzada por el esquema estricto y ninguna instrucción que limite las propuestas. Quitar cualquiera de las tres lo evita en esta pregunta. No es un fallo de temperatura ni de tope de tokens.
  - **Qué hace el modelo (probabilidades de los tokens, `logprobs`):** al terminar cada propuesta elige continuar la lista (`},`) con probabilidad ≈ 1,0 **desde la primera propuesta**; la probabilidad de cerrar (`]`) es ≈ 0 en todos los puntos. No hay señal de parada: el modelo "cree" que debe seguir listando. Las propuestas 6, 7 y 8 repiten el valor con probabilidad media ≈ 0,997: copia lo que acaba de escribir con casi total seguridad (efecto de autorrefuerzo). La temperatura 0,3 no cambia nada porque el modelo ya está casi seguro de cada token; solo a 0,7 aparece variedad, y entonces se pierde el determinismo.
  - **Desencadenante observable:** en la propuesta 4 el modelo cita un fragmento de la fuente S2 (`pmc-mama-tamoxifeno-eca…#0000`) pero la etiqueta **«fuente S1»**; nunca emite «fuente S2» y no pasa a otros criterios (no llega a `estado_her2` ni `estadio`). Es decir, se atasca en el cambio de fuente y en el primer criterio. Con una sola fuente por prompt no ocurre.
  - **Límite de lo investigado:** la causa raíz *interna* del modelo (por qué esa ruta de tokens) no se puede observar más allá de estas probabilidades. Lo demostrado es qué condiciones la provocan y cuáles la evitan, en **una** pregunta y **un** conjunto de fuentes. Hay que repetirlo con otras preguntas en `evaluate` antes de generalizar.
  - **Calidad de las tareas por criterio (importante para el diseño):** aunque terminan, 3 de 6 etiquetan un fragmento con la fuente equivocada (`etiquetaIncoherente`), y aparecen valores de relleno: `"not found"` con `chunkId` `"none"` o `"not found"` (HER2, estadio) y `"no expresado"` repetido en cada fragmento (ECOG), contra la instrucción de omitir el criterio que no se expresa. Con **una sola fuente por llamada** (S1 o S2 solas) no hubo etiquetas incoherentes. Por tanto la unidad de trabajo recomendada es (fuente, criterio) o (fuente, todos los criterios), nunca dos fuentes en la misma llamada, y hay que rechazar los valores de relleno.
- **Segunda pregunta afectada (2026-10-29):** *«¿Qué opciones de tratamiento describe la evidencia para cáncer de próstata localizado?»* (paciente (b) próstata) también devuelve `503 LOCAL_LLM_UNAVAILABLE` (54 s). En la captura, la llamada del proponente de aplicabilidad terminó con `finish_reason: length` (prompt de 12 374 caracteres), igual que el tamoxifeno. Ya son **dos preguntas** con la misma causa, no una (corrige la lectura de F-14 «ninguna otra»). La pregunta de complicaciones tras la cirugía de próstata respondió bien (1 opción, 1 descartada).
- **Soluciones propuestas, por orden (por probar con la suite `evaluate`):**
  1. **Estructura de salida cerrada (preferida, sin probar):** un objeto con una entrada por criterio de la lista (`{"receptores_hormonales": {"value": …, "chunkId": …} | null, …}`) y una llamada por fuente, en lugar de una lista abierta de propuestas. Imposibilita el bucle por construcción y acota los tokens (≈ criterios × fuentes).
  2. **Red de seguridad en código:** `maxItems` en el esquema, deduplicar por (fuente, criterio, valor, `chunkId`) y, si `finish_reason=length`, rescatar las propuestas completas ya emitidas en vez de devolver 503.
  3. **Degradar sin tirar el análisis:** si el proponente falla, devolver las opciones validadas con la aplicabilidad en Desconocido y un aviso (RN-26), y otro código de error distinto de «LLM no disponible».
  4. Penalizaciones (≈ 0,1–0,3) solo si se miden contra la corrupción de `chunkId`; no se recomienda `frequency_penalty` 0,5 tal cual.
- **¿Y si una fuente reporta más de un valor para un criterio?** Hoy el sistema solo admite **uno** por (fuente, criterio): `planificar_propuestas` (`app/domain/applicability_text.py`) ignora las repetidas y «gana la primera», y `studyPopulationValue` es un texto único. Por tanto un objeto con una entrada por criterio no pierde nada respecto al comportamiento actual, pero **destapa un riesgo ya existente**: si el estudio describe `premenopausal women` y `postmenopausal women`, queda el primero que el modelo escriba y una paciente posmenopáusica saldría «No coincide» con razón falsa (ilustrativo; no observado, porque en todas las ejecuciones `propuestas=0 aceptadas=0`). Opciones, de más a menos conservadora:
  1. **(recomendada para el MVP)** Si la fuente da más de un valor distinto para el criterio, el modelo devuelve `null` y el criterio queda **Desconocido** con un motivo nuevo (p. ej. `varios_valores_en_la_fuente`), sin elegir uno. No inventa ni decide (RN-27, RN-26). Cambio mínimo: un valor nuevo en el enum de `unknownReason` del contrato (contract-first).
  2. Lista acotada por criterio (`values`, `maxItems` 3) con la regla de dominio «el paciente coincide si cumple alguno»: cambia el contrato (`studyPopulationValue` pasa a lista), el cálculo de estados y la validación NLI; requiere ADR y validación clínica del catálogo (DEC-01/DEC-11).
  3. Una llamada por (fuente, criterio) y por fragmento: más latencia (hoy 10 a 39 s en total) para el mismo problema semántico.
  - Los rangos y las poblaciones mixtas («estadio I o II») deberían salir del metadato estructurado `population_criteria` (arrays), no del texto libre; el texto solo rellena lo que falta.
- **¿Hace falta un máximo de «loops» de búsqueda?** No para este fallo. El pipeline actual es **lineal y sin reintentos** (una llamada por paso; `generation.py` y el proponente declaran «sin reintento silencioso»), y el límite de iteraciones del agente (`AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`, `AGENT_DEADLINE_MS`, FEAT-08c, FR-30) aún no existe en el código: el agente es posterior. El bucle observado está **dentro de una sola generación** (repetición de tokens), no es un bucle de búsqueda, y un tope de iteraciones no lo frenaría. Lo que sí lo acota es el tope de tokens, `maxItems` o la estructura cerrada. Cuando llegue el agente, el límite de iteraciones y el *deadline* ya previstos en FEAT-08c siguen siendo necesarios, y conviene que además cada llamada al LLM del agente lleve su propio tope de salida y un test de salida repetitiva.
- **Corrección adicional:** (6) registrar `finish_reason` y la longitud de la salida (sin contenido) en `aplicabilidad_salida_invalida`; (7) valorar saltarse el proponente textual cuando ninguna fuente tiene criterios de población verificados que completar, o darle un tope propio de salida y un plazo corto.
- **Relación:** L1D-128 (aplicabilidad textual citada) y la suite `evaluate`, que con adaptadores falsos no ejerce este camino.

## OUT-07 · Pacientes y preguntas de prueba con Coincide y Parcial (S4)

- **Propuesto por el usuario (2026-10-29).** Hoy la demo solo enseña `0 · 0 · 0 · N` (Desconocido). Con el corpus actual es inevitable: los 10 documentos tienen `population_criteria` en `no_disponible` en todos los criterios, y no hay ningún Coincide ni Parcial reproducible en el sistema real (solo el ejemplo de contrato `contracts/examples/con-evidencia-s3-aplicabilidad.json`, con `coincide: 2` y sin Parcial).
- **Alcance:** (1) actualizar los **metadatos de población** de estudios y guías del corpus (ECOG, edad, línea, estadio, subtipo, biomarcadores) con valores verificados; (2) ajustar o añadir **pacientes sintéticos** del seed cuyos datos coincidan, coincidan en parte y no coincidan con esos criterios; (3) documentar en la guía de la demo **al menos dos pares paciente + pregunta** con Coincide > 0 y Parcial > 0 y el resultado esperado; (4) incluir un caso con No coincide en un criterio excluyente.
- **Restricciones:** solo fuentes con licencia aceptada (RN-21, ADR-36); metadatos extraídos y verificados (`extraido_verificado`), no inventados; pacientes solo sintéticos (RN-13/14); el catálogo de criterios sigue en `propuesta_revisada` hasta validación clínica (DEC-01/DEC-11).
- **Relación:** US-233 (medición real de la extracción de población, S4), L1D-117 (metadatos de población verificados, PR #198), L1D-127 (estado de criterio estructurado).
- **Verificación sugerida:** prueba de aceptación sobre el seed que, para cada par, comprueba los conteos esperados en `applicabilitySummary`; y el recorrido manual en la demo.

## OUT-08 · La pregunta insignia de la guía §2.1 no muestra opciones

Hallazgo de la Demo 3 en [`S3-demo-cierre.md`](S3-demo-cierre.md) §5 (F-13). **Causa investigada el 2026-10-29** (paciente (a), pregunta *«¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?»*, `traceId` `req_4452b9fa`; reproducida 3 veces con el mismo resultado).

- **Qué ocurre:** la generación funciona (4,9 s, `finish_reason: stop`): 2 opciones, ambas citan solo el fragmento C2 (`pmc-mama-antraciclinas-rs@c019104016b2#0009`, 1363 caracteres, el párrafo de conclusiones de una revisión sistemática de antraciclinas). El NLI las **descarta por `afirmacion_sin_soporte`** y la respuesta queda en 0 opciones. No es un fallo del LLM ni del retrieval.
- **Medición directa del NLI** (mismo clasificador y configuración del servicio, premisa = el texto exacto del chunk en Milvus, umbral de entailment 0,7):

  | Afirmación (justificación de la opción) | Palabras | Entailment | Resultado |
  |---|---|---|---|
  | Opción 1: «…existen estrategias de desescalamiento… y regímenes que evitan las antraciclinas, aunque no establece una equivalencia universal…» | 39 | **0,341** | sin soporte |
  | Opción 2: «…el uso de regímenes que contienen antraciclinas… debe ser selectivo y no rutinario, basándose en el beneficio oncológico anticipado, el riesgo cardiovascular basal, las características del tumor, el escenario de tratamiento y las preferencias del paciente» | 51 | **0,616** | sin soporte |

  A ojo, el párrafo sí respalda ambas frases («supports selective rather than routine use of anthracyclines, guided by the anticipated oncologic benefit, baseline cardiovascular risk, tumor characteristics, treatment setting, and patient preferences»; «does not establish their universal equivalence»). Son **falsos negativos del verificador**, no opciones infundadas.
- **Por qué (cuatro factores medidos):**
  1. **Una justificación larga y compuesta es una sola afirmación.** `dividir_en_afirmaciones` parte por oraciones; cada justificación es una oración de 39 a 51 palabras con varias cláusulas, y se juzga entera. Reformulada en partes cortas, la primera pasa (0,928 y 0,943) y la segunda no (0,146): el NLI no logra soportar la cláusula de salvedad ni la enumeración.
  2. **Modal normativo y abstracción.** «debe ser selectivo» obtiene 0,616; «La evidencia respalda un uso selectivo, y no rutinario…» obtiene **0,878**. El texto fuente *respalda* un uso selectivo, no ordena nada. Con un verbo normativo («should be») en inglés baja a 0,060. Lo mismo pasa con «existen estrategias… en pacientes seleccionados» frente al texto, que habla de «several… strategies».
  3. **Idioma y enumeraciones.** Hipótesis en español sobre premisa en inglés, con lista de factores (riesgo cardiovascular basal, escenario de tratamiento…): la lista aislada puntúa 0,099 a 0,264 (neutral). La misma frase 1 en inglés sube a 0,965.
  4. **El umbral cae en una zona de ruido.** Añadir al final de la premisa el marcador «[fin del fragmento]» (cosmético) movió el resultado: opción 1 de 0,341 a 0,619 y opción 2 de 0,616 a **0,801** (pasaría). Además, otro chunk del mismo documento (`#0001`) con las mismas frases da 0,959 y 0,743: el fragmento citado (C2) empieza a mitad de una oración (`CORPUS_CHUNK_OVERLAP=0`) y el verificador es sensible a ese contexto.
- **Descartado como causa:** truncación (las premisas largas se dividen en ventanas, `mdeberta.py`); efecto del lote u orden (resultados idénticos solo/en lote/invertido); filtro de lenguaje prohibido (las `unsupportedClaims` son el texto original, no el literal de retiro); el umbral (0,7 es el valor configurado y aplicado).
- **Regla de negocio:** RN-01 exige que toda afirmación mostrada esté soportada, y una opción con una afirmación sin soporte se descarta entera (`_descartar_si_no_se_soporta`). Aplicada con justificaciones largas de una sola oración, el resultado es «cero opciones» aunque el contenido sea correcto.
- **Segundo problema (UI):** el mensaje junta dos motivos («una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido») sin decir cuál aplica; aquí solo aplicaba el primero.
- **Soluciones candidatas (sin probar en `evaluate`; ninguna aplicada):**
  1. **Afirmaciones atómicas:** que el generador devuelva la justificación como una lista de oraciones cortas (≤ 20 palabras) y se verifique cada una; una afirmación secundaria sin soporte se omite y se cuenta en `omittedClaims` (como ya se hace con los párrafos de detalle), y la opción se conserva si lo esencial está soportado. **Riesgo:** omitir una salvedad («no establece una equivalencia universal») deja una frase más fuerte que la fuente; requiere regla y validación clínica.
  2. **Redacción cercana a la fuente y sin modales normativos** («la evidencia respalda…» en vez de «debe…»), compatible con RN-23; se evalúa en la suite `evaluate`.
  3. **Fragmentos con contexto:** solapamiento de chunks o corte por oraciones (reindexación; ADR) y/o enviar al NLI el fragmento citado con sus vecinos.
  4. **Calibrar el verificador:** medir falsos negativos en un conjunto dorado (fidelidad y precisión de citas), valorar un NLI más fuerte para es↔en o un umbral por tipo de afirmación; hoy la suite con modelos falsos no ejerce este camino.
  5. **Separar los motivos en la UI** y mostrar cuál afirmación falló.
- **Prueba de la solución 1, afirmaciones atómicas (2026-10-29; 5 preguntas reales, 11 opciones base y 13 atómicas, NLI real con umbral 0,7; una ejecución por caso).** Se reenvió a Ollama cada petición de generación capturada con un esquema donde `rationale` se sustituye por `claims` (1 a 4 oraciones de ≤ 20 palabras, un hecho cada una, sin verbos de obligación) y se verificó cada afirmación contra los fragmentos que la opción cita:

  | Métrica | Base (hoy) | Atómicas |
  |---|---|---|
  | Afirmaciones verificadas | 13 | 41 |
  | Afirmaciones soportadas | 9 (69 %) | 32 (78 %) |
  | Entailment medio | 0,74 | 0,81 |
  | Opciones retenidas si **todas** las afirmaciones deben soportarse (regla actual, RN-01 estricta) | **8 de 11 (73 %)** | **7 de 13 (54 %)** |
  | Retenidas si basta ≥ 50 % de afirmaciones soportadas (el resto se omite y se cuenta) | 9 de 11 | 12 de 13 |
  | Retenidas si basta la afirmación principal (la primera) | 9 de 11 | 10 de 13 |
  | Pregunta insignia (HER2 IIA) | 0 opciones | 0 con la regla estricta (una afirmación en **0,697**, justo bajo el umbral); **1 opción** con 3 de 4 afirmaciones si se omite la dudosa |

  - **Conclusión: las afirmaciones atómicas por sí solas NO arreglan OUT-08 con la regla actual.** Suben el soporte por afirmación, pero hay más afirmaciones y basta que una falle para descartar la opción: la retención baja del 73 % al 54 %. Solo ayudan si cambia la regla a «se omite la afirmación sin soporte y se cuenta en `omittedClaims`, y la opción se conserva si lo esencial está soportado» (compatible con RN-01 para afirmaciones sueltas; requiere decisión clínica sobre qué es «lo esencial» y no omitir salvedades que cambien el sentido).
  - **Ventaja real: el fallo se vuelve preciso.** En la pregunta de próstata localizado el modelo escribió «La revisión respalda el uso de bicalutamida más cuidado estándar…» (lo contrario de lo que dice la fuente: no mejora la supervivencia) y el NLI lo detectó (0,34), mientras la afirmación correcta de esa misma opción pasó (0,76). Con una justificación larga ese error quedaba mezclado. Una salvedad como «no se establece la equivalencia universal» salió como afirmación propia y pasó (0,98), cosa que en la frase compuesta fallaba.
  - **Efectos secundarios de la generación atómica (medidos en las 41):** 20 llevan el alias interno «El fragmento Cn reporta…» dentro del texto visible (el alias es un identificador interno; la base lo hace en 2 de 13); 2 encadenan varias afirmaciones en una cadena; hay erratas («antraciaiclinas», «recurren 15.2%», «1 a 2 cm centímetros») y datos numéricos que no verifican (0,36); 10 de 41 quedan en la zona dudosa 0,55–0,85. Es decir, la calidad de redacción empeora y el NLI sigue ruidoso cerca del umbral.
  - **Misma afirmación, distinta puntuación según la redacción:** «La evidencia indica que 10 años de tamoxifeno es superior…» obtuvo 1,00 y «El fragmento C1 reporta que 10 años… mostró superioridad…» obtuvo 0,32.
  - **Prueba de la variante «quitar el prefijo antes del NLI»** (se elimina «El fragmento Cn / La revisión reporta/concluye/respalda que…»): sube el soporte de 78 % a **90 %** (37 de 41), el entailment medio de 0,81 a 0,92 y las opciones retenidas con la regla estricta de 7 a **10 de 13**; la pregunta insignia pasa a 4 de 4 afirmaciones soportadas (0,94 a 0,99). Mejora 22 afirmaciones y empeora 3.
  - **Trampa detectada al revisar a mano los casos que cambian:** quitar el prefijo no es seguro. «La revisión respalda el uso de bicalutamida más cuidado estándar…» (0,34, correctamente rechazada) se convirtió en el sintagma nominal «El uso de bicalutamida más cuidado estándar en hombres con cáncer…» y subió a **0,83**: sin el verbo que sostiene la tesis, queda una mención que el NLI considera implicada por cualquier texto que hable del tema (falso positivo). «La viabilidad de estrategias de desescalamiento…» (0,78) es otro sintagma nominal. La mejora del 90 % está por tanto **inflada** y no puede usarse como evidencia de calidad sin revisión humana; solo se revisaron a mano las 8 afirmaciones que cambian, no las 33 restantes.
  - **Lectura para el diseño:** lo que hay que hacer no es quitar el prefijo, sino separar roles. El LLM debe escribir solo **oraciones declarativas completas del contenido** («El tamoxifeno durante 5 años reduce la mortalidad por cáncer de mama») y el **marco de atribución lo añade el código de forma determinista** («La fuente reporta que…», como la verbalización determinista de las afirmaciones sobre el paciente, ADR-34). Así el NLI verifica exactamente la proposición que se muestra y el modelo no puede introducir una postura («respalda», «concluye», «debe») que la fuente no asevera. Esto **no se ha probado**: es la hipótesis a validar en `evaluate` con un conjunto dorado revisado por humanos (precisión de afirmaciones soportadas y falsos positivos), no solo con el NLI.
  - **Límites:** 5 preguntas, una ejecución por caso, sin etiquetas humanas de veracidad (el NLI «soporta» no implica «es cierto»), un solo modelo de generación (gemma4) y un solo NLI.
- **Impacto en la demo:** el recorrido central de la guía §2.1 no enseña ninguna opción; la pregunta de antraciclinas (otro conjunto de fragmentos) sí devolvió 1 opción. El riesgo afecta a la hipótesis del RAG de conocimiento: no se ve evidencia útil aunque exista.
- **Limitación:** una sola pregunta y un solo fragmento; las cifras salen de una ejecución por prueba (el modelo NLI es determinista). Repetir con ≥ 20 pares opción/fragmento en `evaluate` antes de generalizar.

## OUT-09 · Aviso de permiso del `403`

Detalle en [`S3-demo-cierre.md`](S3-demo-cierre.md) §5 (F-02). El backend ya responde `403 PERMISO_DENEGADO`; falta un texto específico en `web` distinto del error genérico.

## Actualización tras la Demo 3 (2026-10-29)

- **OUT-03/OUT-05:** decisión del usuario (F-07): ante estado previo, **avisar y ofrecer borrar**, y realizar una limpieza inicial.
- **Estado de los demás:** ver [`S3-demo-cierre.md`](S3-demo-cierre.md) §3.
