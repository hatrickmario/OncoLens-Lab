# Guía de la Demo 3 (review del S3): qué probar y cómo reproducirlo

Para la sesión con oncólogos y equipo técnico. Todo con **datos sintéticos**. Complementa `docs/demo/runbook-demo-S1.md` (preparar, levantar, apagar, fallos frecuentes) y `docs/demo/flujo-s1-s2.md` (diagrama). Tema del S3: **aplicabilidad por criterio**, **faltantes críticos** y **Base del análisis**.

## 0. Antes de la demo (ensayo obligatorio, 20 min)

1. Levanta con `scripts/demo/levantar.sh` (ver runbook §2). Credenciales: `cat infra/docker/secrets/seed_doctor_password` (médico `doc1@test.local`).
2. **Riesgo a descartar en el ensayo:** `levantar.sh` no se tocó en el S3. Si el corpus del demo no tiene metadatos de población extraídos (`extraido_verificado`), la opción mostrará **«Aplicabilidad no evaluada: sin datos de población en las fuentes citadas»** en vez de los estados por criterio. Comprobación: haz la pregunta del §2.1 y mira si cada opción trae la línea «Criterios del estudio frente a datos registrados: …».
   - Si aparecen los estados: sigue el guion en vivo.
   - Si no aparecen: muestra la aplicabilidad con la evidencia del §6 (reportes y tests), y di claramente que la extracción de población sobre el corpus real se mide en el S4 (US-233).
3. Cierra apps pesadas (stack ~29 GB con el LLM) y verifica `ollama ps` con contexto 8192.

## 1. Datos de partida

| Paciente | Qué muestra |
|---|---|
| (a) Mama HER2+ completa | Caso completo: TNM_8 IIA, ECOG 1, HER2 3+, RE positivo, posmenopáusica. Base sin faltantes críticos. |
| (e) Mama sin estado menopáusico ni Ki-67 | Faltantes críticos; criterios «Desconocido» por dato ausente en el paciente. |
| (b) Próstata ISUP 3 | Checklist de próstata (solo ítems de próstata); serie de PSA, ADT previo y progresión. |
| (c) Biomarcador fuera del catálogo | `no_mapeado`: presente sin verificar, nunca inventado ni descartado (RN-27). |
| (d) Opt-out de `analisis_ia` | `403` en toda generación con IA (comentado; el recorrido completo es del S5/S6). |

## 2. Recorrido en vivo (≈ 15 min)

### 2.1 Aplicabilidad por criterio — paciente (a)
**Pasos:** login → paciente (a) → Análisis → pregunta: *«¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?»*

**Qué mirar (visual):**
- Encabezado **«Opciones descritas en la evidencia»** (nunca «recomendado»).
- Por opción: línea **«Criterios del estudio frente a datos registrados»** con los conteos **Coincide / Parcial / No coincide / Desconocido** (no hay puntaje combinado).
- Texto del **criterio de orden**: «Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego la que coincide en más criterios; la relevancia solo desempata. Es un criterio de orden, no una …».
- **Relevancia de recuperación** como metadato secundario («no mide eficacia ni solidez clínica»), después de las citas.
- **Citas** con título, fuente y diseño del estudio copiados del catálogo (no del texto generado); ausente → «No disponible».
- Aviso «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación».

**Pregunta para los oncólogos:** ¿el orden y los estados por criterio reflejan cómo ustedes compararían el estudio con esta paciente? ¿Falta algún criterio excluyente (DEC-01/DEC-11, hoy en `propuesta_revisada` hasta el S4)?

### 2.2 Población no comparable
**Qué mirar:** si una opción tiene un criterio excluyente en «No coincide» en todas sus fuentes, aparece el aviso «Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.» (no se oculta ni se bloquea, RN-26).

### 2.3 Base del análisis y faltantes — pacientes (a) y (e)
**Pasos:** repite una pregunta de mama con (e) y abre **«Ver detalle de la Base»**.

**Qué mirar:**
- Resumen visible sin expandir: «Supuestos · Fuentes no incluidas · Afirmaciones omitidas» y **«N datos críticos faltantes»** («Solo informa; no bloquea el análisis»).
- En el detalle: datos del paciente usados, fuentes consultadas, «N fragmentos recuperados · M sobre el umbral», fecha de corte de la evidencia («Evidencia del corpus al …»), fuentes no incluidas (NCCN y ESMO solo como no incluidas).
- Con (e): criterio dependiente de menopausia/Ki-67 en **«Desconocido»** por dato ausente, no «No coincide».

**Pregunta para los oncólogos:** ¿los datos críticos listados para mama/próstata son los que ustedes exigirían? ¿Faltan o sobran? (A-1: destinos de `psa_serie`, BRCA/HRR, `tratamientos_previos`, `estado_menopausico`.)

### 2.4 Lista de pacientes y checklist
**Pasos:** `/pacientes`.
**Qué mirar:** columnas **Faltantes críticos** y **Por revisar**; (a) sin faltantes, (e) con faltantes; paciente de próstata solo con ítems de próstata. Un dato en `requiere_revision` cuenta como presente **sin verificar**; `rechazado` cuenta como faltante.

### 2.5 Sin evidencia
**Pregunta:** *«¿Qué dice la evidencia sobre el tratamiento de la leucemia mieloide aguda en niños?»*
**Qué mirar:** «Ningún fragmento del corpus superó el umbral… No se generaron opciones», «Relevancia máxima: no aplica», «Qué se buscó» y el alcance («no implica que no exista evidencia»), en ~3 s y **sin invocar al LLM** (RN-02).

### 2.6 Todas las opciones descartadas
**Qué mirar (si aparece o con el ejemplo de contrato):** «No hay opciones descritas con soporte verificable en la evidencia recuperada» y, bajo el titular, el resumen de motivos con su recuento (un motivo una vez; motivos mixtos con recuento). Las descartadas solo se ven «para revisión», sin forma de opción.

### 2.7 Procedencia del dato en el contexto de la IA
**Concepto (no visible en pantalla):** el prompt etiqueta los datos del paciente **sin verificar** o **en conflicto** (diagnóstico y biomarcadores). Evidencia: tests `[US-065 AC-5]`; se enseña el contrato, no la pantalla.

## 3. Validaciones de concepto con los oncólogos (decisiones que cierran en el S4)

| # | Tema | Qué se pide | Referencia |
|---|---|---|---|
| 1 | Criterios excluyentes (HER2, castración, menopausia) | Validar la lista de `propuesta_revisada` | DEC-01, DEC-11 (US-021) |
| 2 | Dos HER2 en conflicto | ¿Se fuerza «Desconocido»? | A-2 (US-124) |
| 3 | `no_mapeado` | Aceptar: cuenta como presente sin verificar; campo final de «información adicional» donde el oncólogo ingresa o confirma hallazgos | RN-27, US-107 |
| 4 | Datos críticos por tipo de cáncer | Revisar mama y próstata del catálogo `datos-criticos.json` | US-001/US-002 |
| 5 | Lenguaje | ¿Algún texto de la pantalla suena a prescripción o a puntaje clínico? | RN-23, RN-28 |
| 6 | Revisión de la muestra de metadatos | ~20 min con `PLANTILLA.md` sobre `data/evaluation/corpus-metadatos/` | tarea 2.3 de L1D-117 → US-233 |

## 4. Para el equipo técnico (≈ 10 min)

1. **Ownership:** el navegador solo habla con `web`; `rag-orchestrator` solo ve el schema `corpus`; los faltantes críticos viajan como claves del catálogo (la etiqueta se resuelve en `clinical-api`). Prueba: `docker ps` (un solo puerto publicado) y la suite de *permission denied*.
2. **Catálogo versionado:** `npm run catalog:validate` (versión 1.1.0) y `npm run catalog:version-guard` (el hash del catálogo cambia ⇒ cambia la versión; `validation.status` queda fuera del hash).
3. **Contratos:** `npm run contracts:check` (33 reglas) y `npm run contracts:generate:check`.
4. **Lenguaje y calidad:** `npm run test:lenguaje`; `npm run quality` (higiene de tests y cobertura de líneas cambiadas como alerta).
5. **Evaluación:** `npm run evaluate -- --suite all` (con adaptadores falsos) y `reports/eval/s3-cierre.md`.
6. **CI:** pestaña Actions de `main` en verde (CI, E2E, Push) y code scanning sin alertas abiertas.
7. **Corpus híbrido:** el vector sparse de BGE-M3 se calcula en `ingest reindex-sparse` (US-117b) con el mismo modelo y pesos que usará la consulta; la consulta híbrida (US-112) llega en el S4. Ver Milvus: runbook S1 §6.

## 5. Límites honestos (decirlos antes de que pregunten)

- **Métricas con adaptadores falsos y fixtures sintéticos**, no con el LLM real: M-08.3 = **0,70** (7 de 10; meta 0,90), M-08.4 = 0,95, M-08.2 = M-08.6 = 0, concordancia de estados 41/41. Fidelidad NLI 0,75 y precisión de citas 0,80 en la suite `all` están **bajo la meta (0,90)** con modelos falsos; sin regresión frente al baseline. La medición real es US-233 (S4).
- El baseline no cubre la suite de aplicabilidad (se genera en el S4).
- La consulta es **densa**; la híbrida (léxica + semántica) llega con US-112 (S4).
- Orden de aplicabilidad y criterios con el catálogo `propuesta_revisada`: pendiente de validación clínica.
- La opción «continuar con aviso» y el registro manual aún no tienen UI (US-005, S4).
- Latencia y memoria: ver runbook S1 §4 (primera consulta lenta, p95 ≤ 15 s se recalibra en el S5).

## 6. Evidencia de respaldo si el vivo falla

| Qué | Dónde |
|---|---|
| Informe de evaluación del cierre | `reports/eval/s3-cierre.md` (+ `.json`, `s3-cierre-aplicabilidad.json`) |
| Aplicabilidad (criterios del catálogo, textual citada) | `reports/eval/l1d-126-…md`, `l1d-128-…md`, `l1d-244-…md` |
| Alias de chunks en la cita | `reports/eval/l1d-287-alias-chunks-cita.md` y `l1d-287-ac7-temperaturas.md` |
| Procedencia en el prompt | `reports/eval/l1d-181-procedencia-contexto-ia.md` |
| Ejemplos de contrato (respuestas fijas) | `contracts/examples/` |
| Detalle de opciones | `reports/eval/detalle-opciones.md` |
| Cierre y trazabilidad | `backlog/sprints/S3-cierre.md`, `S3-trazabilidad.md` |

## 7. Si algo falla

Ver `docs/demo/runbook-demo-S1.md` §5 (login 500, `DEADLINE_VENCIDO`, Ollama, memoria). Apagar y limpiar al terminar: `scripts/demo/apagar.sh` (y borrar contenedores, redes y volúmenes del proyecto de la demo).

## 8. Preguntas de feedback para cerrar los outcomes abiertos

Lista de verificación para la sesión de la Demo 3 y su repaso posterior. Cada fila tiene un **criterio de cierre** («Se espera») y lo **observado el 2026-10-28/29** en la instalación desde cero (`Demo3/OncoLens-Lab`), para no repetir lo ya medido. En **Resultado** se marca una opción tras comprobarlo:

- **Verdadero:** se cumple lo que se espera (el outcome puede cerrarse).
- **Falso:** no se cumple (el outcome sigue abierto; anotar qué se vio).
- **Otro feedback:** hay un matiz, una opinión clínica o un hallazgo nuevo (anotarlo en la columna «Notas»).

Los outcomes están en [`docs/evidence/S3-demo3/S3-demo-outcomes.md`](../evidence/S3-demo3/S3-demo-outcomes.md); el análisis de la extracción de población, en [`docs/evidence/S3-demo3/S4-insumo-extraccion-poblacion.md`](../evidence/S3-demo3/S4-insumo-extraccion-poblacion.md). Usuarios: médico `doc1@test.local` y administrador `admin@test.local` (contraseñas en `infra/docker/secrets/`).

### 8.1 Acceso y rol del administrador (OUT-01)

| # | Qué verificar | Se espera | Observado (29-oct) | Resultado | Notas |
|---|---|---|---|---|---|
| F-01 | Iniciar sesión con `admin@test.local`: ¿a qué pantalla llega? | Una pantalla propia del administrador o «sin acceso»; **no** el panel de análisis de un paciente | Llega a `/pacientes/0fd028e2-…/analisis` (la ruta de inicio es única para todos los roles) | X Verdadero ☐ Falso ☐ Otro | Una vez logueado llega a http://127.0.0.1:3000/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis |
| F-02 | Como administrador, en `/pacientes/<id>/analisis`, lanzar una pregunta | `403` con aviso claro de falta de permiso; sin datos clínicos | `POST /api/evidence-analyses` responde `403 PERMISO_DENEGADO` | X Verdadero ☐ Falso ☐ Otro | Da como resultado No se pudo completar el análisis. No se muestra ningún resultado parcial. Código de traza: req_09415dba |
| F-03 | Como administrador, abrir `/pacientes` y una ficha | Solo documento enmascarado, estado y fecha de alta; sin nombre ni datos clínicos (PRD v1.4 §11) | La API devuelve la vista `admin` con esos tres campos; **la pantalla no se ha mirado** | X Verdadero ☐ Falso ☐ Otro | |

### 8.2 Listado y búsqueda de pacientes (OUT-02)

| # | Qué verificar | Se espera | Observado (29-oct) | Resultado | Notas |
|---|---|---|---|---|---|
| F-04 | Como médico, abrir `/pacientes` justo después de `levantar.sh` | Lista de 5 pacientes, nombre y documento enmascarados, columnas «Faltantes críticos» y «Por revisar» | Tras reconstruir la imagen del seed: `200` con 5 pacientes. Con la imagen antigua: `500 IDENTITY_INTEGRITY_ERROR` | X Verdadero ☐ Falso ☐ Otro | |
| F-05 | Buscar por documento: tipo **Sintético** + `SINT-0000001` … `SINT-0000005` | Devuelve el paciente de la tabla (1 = mama HER2+ completa, 2 = próstata, 3 = mama con dos diagnósticos, 4 = mama IIIA, 5 = mama IB) | Verificado por API con los 5 | X Verdadero ☐ Falso ☐ Otro | |
| F-06 | Buscar con tipo «Cédula de ciudadanía» y un número de prueba | Mensaje claro; idealmente una pista de que los datos de prueba usan «Sintético» | Responde «No hay pacientes con ese documento», sin pista | X Verdadero ☐ Falso ☐ Otro | |

### 8.3 Instalación y limpieza (OUT-03, OUT-04, OUT-05)

| # | Qué verificar | Se espera | Observado (29-oct) | Resultado | Notas |
|---|---|---|---|---|---|
| F-07 | Con volúmenes `oncolens_*` de una instalación anterior, ejecutar `scripts/demo/levantar.sh` | Detecta el estado previo, avisa y propone `apagar.sh --borrar-datos` antes de seguir | Falla en `corpus-migrate`: `password authentication failed for user "rag_corpus_migrator"` | ☐ Verdadero ☐ Falso X Otro | Ya se agrego feedback de la salida, se debe avisar y borrar. realizar limpueza |
| F-08 | Terminar `levantar.sh`: ¿verifica el seed? | Un paso final comprueba conteos (5 pacientes, 5 identidades, 2 usuarios, 10 documentos, chunks en Milvus) y falla si no cuadran | No verifica: terminó en «Listo» con 5 pacientes y **0** identidades | X Verdadero ☐ Falso ☐ Otro | |
| F-09 | `docker images` tras reinstalar: ¿`oncolens-clinical-seed` es de hoy? | La imagen del seed se reconstruye en cada instalación | Era de hace 8 días (`up --build` no reconstruye los servicios del perfil `seed`) | X Verdadero ☐ Falso ☐ Otro | |
| F-10 | Al terminar la demo: `docker ps` | Un solo puerto publicado (`127.0.0.1:3000`); sin Attu ni proxies | Attu (`8000`) quedó abierto durante la sesión; hay que cerrarlo con `docker rm -f attu` | X Verdadero ☐ Falso ☐ Otro | |

### 8.4 Análisis de evidencia y «modelo local no disponible» (OUT-06)

Paciente (a) mama HER2+: `/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis`. Esperar entre consulta y consulta (una a la vez): el LLM local solo atiende bien una petición.

| # | Qué verificar | Se espera | Observado (29-oct) | Resultado | Notas |
|---|---|---|---|---|---|
| F-11 | Pregunta: *«¿Qué dice la evidencia sobre tamoxifeno adyuvante en cáncer de mama con receptores hormonales positivos?»* | Un análisis con opciones citadas; si un paso interno falla, aviso y aplicabilidad en Desconocido, **sin** perder el análisis ni decir «modelo local no disponible» | `503 LOCAL_LLM_UNAVAILABLE` en 6 de 6 intentos con la misma huella (el modelo entra en bucle: 25 propuestas, una ×21) | X Verdadero ☐ Falso ☐ Otro | El mensaje mostrado es : El modelo local no está disponible. No se muestra ningún resultado parcial. Código de traza: req_c3af47a6 |
| F-12 | Repetir F-11 una segunda vez | Mismo resultado (la falla es determinista, no intermitente) | Idéntico: `caracteres=4852` en todas las ejecuciones | X Verdadero ☐ Falso ☐ Otro | |
| F-13 | Preguntas de la guía §2.1 (HER2 estadio IIA) y de antraciclinas | Responden con opciones (o «sin opciones con soporte») y muestran la aplicabilidad con su motivo | HER2 IIA: 0 opciones, 2 descartadas (32 s). Antraciclinas: 1 opción, `0·0·0·6` (62 s) | ☐ Verdadero ☐ Falso X Otro | Responde: No hay opciones descritas con soporte verificable en la evidencia recuperada. Motivos: Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido|
| F-14 | Anotar **cualquier otra pregunta** que dé «El modelo local no está disponible» (guardar el `traceId`) | Ninguna otra; si aparece, registrarla con su `traceId` | En 13 consultas de esta instalación solo hay una huella de fallo | X Verdadero ☐ Falso ☐ Otro | |
| F-15 | Tiempo de respuesta con evidencia | ≤ 15 s p95 (NFR; se recalibra en el S5) | 32 a 70 s en estas pruebas; la primera consulta es más lenta | X Verdadero ☐ Falso ☐ Otro | |
| F-16 | Repetir el análisis del bucle con ≥ 20 preguntas distintas | 0 salidas cortadas por longitud (`finish_reason=length`) | Investigado solo con la pregunta del tamoxifeno (R17) | X Verdadero ☐ Falso ☐ Otro | |

### 8.5 Estados de aplicabilidad (OUT-07)

| # | Qué verificar | Se espera | Observado (29-oct) | Resultado | Notas |
|---|---|---|---|---|---|
| F-17 | Con cualquier pregunta con evidencia: línea «Criterios del estudio frente a datos registrados» | Al menos una opción con **Coincide > 0** y otra con **Parcial > 0** en pares paciente + pregunta documentados | Siempre `0 · 0 · 0 · N` (Desconocido): los 10 documentos tienen `population_criteria` en `no_disponible` | X Verdadero ☐ Falso ☐ Otro | |
| F-18 | Un caso con un criterio excluyente en **No coincide** | Aviso «al menos un criterio excluyente del estudio no coincide…» y la opción se muestra igual | No reproducible en el sistema real (solo en `contracts/examples/`) | X Verdadero ☐ Falso ☐ Otro | |
| F-19 | Leer el motivo de cada «Desconocido» | Se distingue «el estudio no lo reporta» de «falta en el paciente» y se entiende sin ayuda | La API da `no_reportado_por_fuente` y `falta_en_paciente`; **la redacción en pantalla no se ha validado con oncólogos** | X Verdadero ☐ Falso ☐ Otro | |

### 8.6 Preguntas clínicas para los oncólogos (decisiones del S4)

| # | Qué verificar | Se espera | Observado (29-oct) | Resultado | Notas |
|---|---|---|---|---|---|
| F-20 | Si el estudio incluyó premenopáusicas **y** posmenopáusicas, ¿una paciente posmenopáusica «coincide»? | Sí: cumple alguno de los grupos que el estudio incluyó | Hoy solo se conserva un valor por fuente y criterio («gana el primero»), lo que puede dar un estado falso | ☐ Verdadero ☐ Falso X Otro | Sí: una paciente posmenopáusica coincide con un estudio que incluyó premenopáusicas y posmenopáusicas. En RAG debe clasificarse como: - poblacion_match: parcial/inclusiva - No como coincidencia exacta exclusiva de posmenopáusicas. |
| F-21 | Si el paciente no está en la lista de valores del estudio, ¿es «No coincide»? | No, salvo que el estudio declare una restricción explícita («solo posmenopáusicas»); si no, Desconocido | Sin regla implementada | X Verdadero ☐ Falso ☐ Otro | |
| F-22 | Un resumen o guía agrupa varios estudios: ¿la población debe medirse sobre los fragmentos que cita la opción y no sobre todo el documento? | Sí: la aplicabilidad de una opción refleja la población de *su* recomendación | Hoy se evalúa por documento (R18) | X Verdadero ☐ Falso ☐ Otro | Sí. La población debe evaluarse sobre los fragmentos citados que sustentan la opción, no sobre el conjunto del documento. Un resumen puede abarcar poblaciones heterogéneas; lo relevante es si la afirmación recuperada se apoya en estudios o análisis que incluyen a la paciente. Si el fragmento mezcla poblaciones sin desagregarlas, clasifíquelo como match parcial/incierto, no como coincidencia exacta.|
| F-23 | Dos valores de HER2 en conflicto en la misma fuente | Se fuerza «Desconocido» con motivo (A-2, US-124) | Pendiente de validación clínica | X Verdadero ☐ Falso ☐ Otro | Muéstrelos ambos, sin resolver el conflicto automáticamente: HER2: información discordante en la fuente   - Resultado 1: IHQ 3+ — [fecha/muestra si consta] - Resultado 2: IHQ 2+ / ISH no amplificado — [fecha/muestra si consta]   Estado para análisis: indeterminado; requiere validación clínica/patológica. |
| F-24 | ¿Basta con mostrar hasta 3 valores del estudio por criterio, cada uno con su cita? | Sí; más de 3 se resumen con «ver más» | No implementado | X Verdadero ☐ Falso ☐ Otro | |

**Cierre:** un outcome se cierra cuando todas sus filas están en **Verdadero**. Cualquier **Falso** o **Otro feedback** se registra en `S3-demo-outcomes.md` (o en un outcome nuevo) antes del refinamiento del S4, donde se crean las tareas en Linear con la aprobación del usuario (`S4-insumo-extraccion-poblacion.md` §10).

