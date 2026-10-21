# S2 — Tarjetas de arrastre del Sprint 1

> Creado el 2026-10-18 por `/sprint-close S1` y aprobado por el usuario. Reúnen **lo pendiente de verificación** de las historias del S1 que siguen en In Review (ver `S1-trazabilidad.md` y `S1-pendientes-humanos.md`). El código de esas historias está mergeado; aquí vive lo que falta para poder darlas por Done.
> **Markdown = fuente.** Issues creadas el 2026-10-18 (L1D-277 a L1D-282, milestone Sprint 2) tras liberar cupo moviendo Post-MVP y «si hay capacidad» a `V2-Post-MVP.md`. Los IDs `ARR-nn` son inmutables; cuando se creen las issues se anota su `L1D-nn` en cada tarjeta.
> Las historias de origen **no pasan a Done** por separar: se quedan In Review con un enlace a su tarjeta y cierran cuando la tarjeta cierra.
> Prioridad Linear: 2 = Alta, 3 = Media, 4 = Baja. Estimación Fibonacci.

| ID | Linear | Tarjeta | Est. | Prioridad | Desbloquea (S1) |
|---|---|---|---|---|---|
| ARR-01 | L1D-277 | La CI ejecuta la integración y los `servicios_reales` | 5 | **Alta** | L1D-114, L1D-115 (y evidencia de 168, 169, 103, 104) |
| ARR-02 | L1D-278 | E2E y visual-check ejecutables (D-3 + D-2) | 8 | **Alta** | L1D-197, 139, 140, 193, 194 |
| ARR-03 | L1D-279 | OL-06 sobre lo ya implementado (con US-072) | 3 | **Alta** | L1D-180, 275, 115, 193 |
| ARR-04 | L1D-280 | Mediciones de ADR-39 fase B en el MacBook de referencia | 3 | **Alta (temprana)** | L1D-274 y US-231a/b (AC con `models`) |
| ARR-05 | L1D-281 | Baseline manual VM-1/VM-2 con los oncólogos (movida: antes de G-Demo) | 3 | Media | L1D-238 |
| ARR-06 | L1D-282 | Conciliación y deuda del cierre del S1 | 3 | Media | L1D-166, 194, 275, 265 |
| ARR-07 | L1D-283 | URL de la fuente original en «Fragmento citado» (manifiesto, catálogo, UI) | 5 | **Alta** | ARR-02 (E2E) |
| ARR-08 | L1D-284 | Detalle expandible en «Opciones descritas en la evidencia» (resumen + 1–2 párrafos generados y validados) | 8 | **Alta** | ARR-07, US-072 (OL-06) |

**Estado al 2026-10-21:** ARR-04 (L1D-280) hecha; ARR-02 (L1D-278) parcial (E2E ejecutables; faltan el job de CI y la migración de `/login`); ARR-07 (L1D-283) y ARR-08 (L1D-284) hechas; ARR-01, 03, 05 y 06 sin empezar (ARR-05 se propone mover a Sprint 4, decisión 88).

Total: 25 puntos de arrastre.

---

## ARR-01 · La CI ejecuta la integración de `clinical-api` y los `servicios_reales`

> Linear: [L1D-277](https://linear.app/l1der-lab-mjbc/issue/L1D-277) · Prioridad Alta · Est. 5 · Origen: B-1 y B-2 de `S1-trazabilidad.md`; tarea 2.4 de L1D-114.

**Como** equipo, **quiero** que la CI corra los tests de integración con PostgreSQL y Milvus reales, **para** que los AC de US-038, 039, 049, 052, 053, 058, 059 y 211 tengan evidencia automatizada y no solo local.

**Estado de partida:** el job `integration` de `clinical-api` (PostgreSQL de test, `scripts/ci/integracion-clinical-api.sh`) lo añade #93; **falta** Milvus y los tests `-m servicios_reales` de `rag-orchestrator`.

**AC**
1. *Given* un PR, *when* corre la CI, *then* el job `integration` ejecuta los 199 tests de `clinical-api` contra el PostgreSQL de test y es parte de `ci-ok` (verificar que #93 lo dejó en verde en `main`).
2. *Given* un PR, *when* corre la CI, *then* un job ejecuta `pytest -m servicios_reales` dentro de `corpus-db-net` y `ai-net` con PostgreSQL y Milvus de test (tarea 2.4 de L1D-114), y los 23 casos de Milvus de L1D-106 más los de catálogo, release, scripts y carga de semilla pasan.
3. *Given* los 7 AC sin test ejecutado (US-058 AC-1, AC-3, AC-4; US-059 AC-1, AC-3, AC-4, AC-5), *when* se corre el job, *then* cada uno tiene un test con `@pytest.mark.ac` ejecutado en verde.
4. *Given* el caso `ac2-cited-sources-build` de L1D-166, *when* se archive L1D-140, *then* el caso se activa con el build de `web` verificado en el entorno de la CI (ver ARR-06).

**Dependencias:** ninguna. **Desbloquea:** L1D-114, L1D-115.

## ARR-02 · Los E2E y el visual-check se pueden ejecutar (D-3 + D-2)

> **Estado (usuario, 2026-10-21, `[S2 resp. 1]`):** el cierre automático de L1D-278 al mergear #111 fue un error de la automatización GitHub → Linear; el resto (job de E2E en la CI y AC-3, `/login` con Tailwind v4 + shadcn/ui, ~3 pts) vuelve a *In Progress* en el S2 (change `l1d-278-e2e-ci-login-tailwind`).

> Linear: [L1D-278](https://linear.app/l1der-lab-mjbc/issue/L1D-278) · Prioridad Alta · Est. 8 · Origen: deudas D-2 y D-3; tareas E2E de L1D-197 (3.3, 3.5, 4.2), L1D-139 (2.8, 3.2), L1D-140 (2.7, 3.5, 4.2, 4.3), L1D-193 y L1D-194 (3.3).

**Como** equipo, **quiero** Playwright contra Compose en perfil de test con modelos fingidos y el sistema de diseño real (Tailwind v4 + shadcn/ui), **para** ejecutar los 12 E2E y los visual-checks que hoy están escritos o pendientes.

**AC**
1. *Given* Compose con `LLM_PROVIDER=fake` y `MODEL_PROVIDER=fake`, el seed de `doc1@test.local` y `npx playwright install chromium`, *when* corre el job de E2E, *then* se ejecutan sin `.skip` los E2E de login, panel, aviso de IA y lenguaje no prescriptivo, con `retries: 1` solo en la CI y con *trace*.
2. *Given* el E2E de US-060 AC-3, *when* se escribe (hoy no existe), *then* comprueba con `page.on('request')` que el navegador solo habla con el origen de `web`.
3. *Given* `/login` en CSS Modules provisional, *when* se migra a Tailwind v4 + shadcn/ui con los tokens de `docs/ux/sistema-de-diseno.md` (D-2), *then* el visual-check a 375 y 1280 px no deja errores de consola ni violaciones de CSP.
4. *Given* el AC-4 de US-211 y el AC-1 en navegador, *when* corren, *then* quedan en verde (cookie HttpOnly Secure SameSite=Strict y redirección sin datos del paciente).

**Avance (2026-10-20, `scripts/e2e/ejecutar.sh`, `npm run test:e2e`):** los 12 E2E existentes + 3 nuevos (`sesion-y-origen.spec.ts`: cookie HttpOnly/Secure/SameSite=Strict [US-211 AC-1], redirección sin datos [US-211 AC-4] y origen único del navegador [US-060 AC-3]) pasan en Chromium contra Compose fingido (proyecto `oncolens-e2e`, ~1 min desde cero). **Cumplidos en local:** AC-1 (salvo el job de CI), AC-2 y AC-4. **Alcance restante en el S2, prioridad Alta (decisión del usuario, 2026-10-20):** (1) el job de CI de E2E (`retries: 1` solo en CI, traza, Docker en el runner; entra primero fuera de `ci-ok` hasta ser estable) y (2) el AC-3: migración de `/login` a Tailwind v4 + shadcn/ui (D-2) y su visual-check a 375 y 1280 px. Prerrequisitos que faltaban: `npm run build --workspaces`, `playwright install chromium`, `WEB_HOME_PATH` en Compose, migración clínica y seed.

**Dependencias:** ARR-01 (perfil de Compose) recomendable. **Desbloquea:** L1D-197, 139, 140, 193, 194.

## ARR-03 · OL-06 sobre lo ya implementado (junto a US-072 / L1D-235)

> Linear: [L1D-279](https://linear.app/l1der-lab-mjbc/issue/L1D-279) · Prioridad Alta · Est. 3 (además de US-072, que ya está en el plan del S2) · Origen: L1D-180 (3.1, 4.4), L1D-275 (3.1), L1D-115 (2.1), L1D-193 (5.1).

**Como** responsable de calidad de IA, **quiero** correr la evaluación OL-06 con el NLI y el generador reales sobre las historias ya mergeadas, **para** adjuntar el reporte de `ai-eval-runner` que el Gate 2 dejó pendiente.

**AC**
1. *Given* la suite `evaluate` de US-072, *when* se ejecuta con el NLI real, *then* hay reporte en `reports/eval/` con fidelidad, precisión de citas y «sin evidencia» frente a las metas (TBD-02).
2. *Given* la evaluación manual del S1 de L1D-275, *when* se completa con el LLM real, *then* hay reporte de lenguaje no prescriptivo (salidas prescriptivas = 0).
3. *Given* los casos de RN-23 que quedan fuera del Nivel A («La guía recomienda X»), *when* se mide, *then* el caso en `evaluate` mide si el generador los reproduce y el prompt fuerza «La fuente [cita] describe que…».
4. *Given* «standard of care» y «recommended treatment» presentes en el corpus citado, *when* se mide, *then* se anota si el generador los reproduce literalmente (se retira la afirmación).
5. *Given* el umbral `NLI_ENTAILMENT_THRESHOLD=0.7` y `RETRIEVAL_TOP_K=30` provisionales, *when* se calibran, *then* se registran los valores definitivos en configuración (RN-22).

**Dependencias:** US-072 (L1D-235), modelos locales cargados (ARR-04).

## ARR-04 · Mediciones de ADR-39 fase B en el MacBook de referencia

> Linear: [L1D-280](https://linear.app/l1der-lab-mjbc/issue/L1D-280) · Prioridad Alta, temprana en el S2 · Est. 3 (el desarrollo ya está en #83/#86) · Origen: L1D-274 (tareas 1.4 a 1.8), US-231a/b (1.11, 1.12).

**Como** PO, **quiero** medir runtime, LLM, OCR y p95 extremo a extremo con el hardware y los modelos reales, **para** cerrar el ADR-39 y saber si la latencia del análisis (riesgo aceptado como alto) cumple.

**AC**
1. *Given* Ollama con `OLLAMA_CONTEXT_LENGTH=8192`, *when* se ejecuta `llm` (los `llm.json` previos usaron `/api/chat` y no son comparables), *then* hay medición por la ruta `/v1` de producción con admisión por memoria (`ollama ps`, `num_ctx=8192`).
2. *Given* 3 corridas de ≥ 30 consultas a `POST /platform/evidence-analyses` vía web `/api/*`, *when* se miden, *then* se registra el p95 frente a ≤ 15 s y se decide si se recalibra en el S5.
3. *Given* OCRmyPDF + Tesseract `spa`, PaddleOCR y docTR, *when* se miden, *then* el p95 de extracción se compara con ≤ 60 s y el OCR crítico con ≥ 0,95.
4. *Given* el stack completo, *when* se mide la memoria, *then* el stack ≤ ~30 GB con LLM ≤ 21 GB y sin swap.
5. *Given* las cifras, *when* se completa el ADR-39 fase B y su delta de spec, *then* L1D-274 puede cerrar y los tests `models` de US-231a/b (AC-9, AC-6, AC-7) corren en la VM de Docker ≥ 10 GB.

**Dependencias:** modelos descargados en `MODEL_HOST_DIR` (con el `ls` previo por `model.onnx.data`). **Desbloquea:** L1D-274, US-231a/b.

## ARR-05 · Baseline manual VM-1/VM-2 con los oncólogos

> **Decisión 88 (usuario, 2026-10-19):** los primeros sprints usan la simulación académica como baseline; las sesiones reales se mueven a un sprint posterior, **antes de G-Demo (S5)**, y el baseline se ajustará entonces. Esta tarjeta deja de ser del S2: milestone a decidir en el refinamiento (propuesta: S4).

> Linear: [L1D-281](https://linear.app/l1der-lab-mjbc/issue/L1D-281) · Prioridad Media (depende de la agenda) · Est. 3 · Origen: L1D-238 (3.1 a 3.5), DEC-02, decisión 81.

> **Movida al S4 (usuario, 2026-10-21, `[S2 resp. 1]`):** en la misma sesión con los oncólogos que DEC-06, DEC-08 y DEC-09.

**Como** PO, **quiero** medir el baseline manual con los oncólogos asesores, **para** tener VM-1 y VM-2 de referencia antes de comparar con OncoLens (G-Demo).

**AC**
1. *Given* los 4 casos ficticios y los 6 checklists, *when* los dos oncólogos los validan en una sesión conjunta, *then* los checklists llevan `version` y `fecha_validacion_clinica`, y se decide la etiqueta de `prostata-01`.
2. *Given* dos sesiones de ~3 h, *when* se miden VM-1 y VM-2 por separado, *then* `eval/vm/baseline-S1.csv` queda sin nombres, fechas ni justificaciones, y la correspondencia nombre ↔ `O1`/`O2` queda fuera del repo.
3. *Given* un tercer oncólogo, *when* valida a ciegas los `pares-validacion`, *then* se registra la mediana de VM-2 validada.
4. *Given* el CLI `baseline`, *when* se ejecuta dos veces con la misma fecha, *then* los reportes son idénticos byte a byte y se versionan en un PR `chore`.

**Dependencias:** agenda de los oncólogos. **Desbloquea:** L1D-238. No bloquea a las demás tarjetas.

## ARR-06 · Conciliación y deuda del cierre del S1

> Linear: [L1D-282](https://linear.app/l1der-lab-mjbc/issue/L1D-282) · Prioridad Media · Est. 3 · Origen: `S1-cierre.md`, deudas D-7, D-9 y menores de los Gate 2.

**Como** equipo, **quiero** cerrar la deuda de conciliación y de higiene que dejó el S1, **para** que los changes pendientes se puedan archivar.

**AC**
1. *Given* `tasks.md` de L1D-194 y L1D-275 sin ninguna tarea marcada, *when* se concilian con la evidencia de `/opsx:verify`, *then* las cumplidas quedan `[x]` y las pendientes llevan su ID destino.
2. *Given* L1D-265, *when* se cierra D-7 (`ruff format` limpio y `pytest tests/evaluation` sin fallos con las dependencias declaradas), *then* el change se archiva.
3. *Given* L1D-166 (4.1, 4.2 y 5.2), *when* el administrador activa la protección de `main` y se archive L1D-140, *then* se cierran 4.1, 4.2 y 5.2 (ver el caso `ac2-cited-sources-build`).
4. *Given* D-9, *when* se refina, *then* se decide si la seguridad web de `apps/web` (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) se adelanta desde US-216 (S6).
   > **Decidido (usuario, 2026-10-21):** US-216 se queda en el S6, antes de G-Piloto. `[S2 resp. 7]`
5. *Given* US-231a y US-231b (sin issue de Linear), *when* se crean sus issues, *then* se enlazan con sus changes y se concilian 231a (3.2, 3.3) y 231b (1.0, 2.1, 3.1, 4.2, 4.4).
6. *Given* la deuda de 169 sin ID (one-shot `clinical-migrate`, rol `clinical_seed` solo DML) y el RN-06 que no bloquea `DELETE`/`TRUNCATE`, *when* se registran en `backlog/features/README.md`, *then* tienen ID por asignar.

**Dependencias:** ARR-01 y ARR-02 para los puntos 2 y 3.

## ARR-07 · URL de la fuente original en «Fragmento citado»

> Linear: [L1D-283](https://linear.app/l1der-lab-mjbc/issue/L1D-283) · Prioridad Alta · Est. 5 · Origen: petición del usuario, 2026-10-20 (el panel «Fragmento citado» no muestra la URL de donde se extrajo el texto; el catálogo del corpus no la guarda: `source_url = None`, RN-25).

**Como** médico que revisa una cita, **quiero** ver al final del panel «Fragmento citado» la URL de donde se extrajo el texto del documento, **para** abrir la fuente original y verificarla.

**AC**
1. *Given* `original_url` (https, con host) en un documento del manifiesto, *when* se lee, *then* `DocumentoDeSemilla.url_original` la trae; sin ella es `None`; `http`, `javascript:`, `ftp` o texto que no sea URL se rechazan nombrando documento y campo. El `source_url` existente (URL de descarga del texto) no cambia.
2. *Given* el manifiesto real, *when* se lee, *then* los 10 documentos declaran `original_url` https (cancer.gov para NCI; XML JATS de Europe PMC para PMC).
3. *Given* la migración de Alembic y `data-model.md` §4.6, *when* se carga la semilla, *then* `corpus.corpus_document.source_url` (text, nullable) guarda la URL y la ficha de la cita la devuelve como `sourceUrl`; sin URL, `null`.
4. *Given* una cita con `sourceUrl`, *when* se abre «Ver fragmento», *then* el panel muestra al final «Fuente original: <enlace>» (pestaña nueva, solo http(s) seguro); sin URL, «No disponible».
5. *Given* el stack fingido, *when* corre el E2E, *then* una spec comprueba el enlace en el panel.

**Notas:** sin cambio de contrato (`sourceUrl` ya existe, nullable). Un corpus ya cargado exige recargar la semilla (los documentos con el mismo checksum se omiten). **Dependencias:** ARR-02 (E2E ejecutables, hecho en #111).

## ARR-08 · Detalle expandible en «Opciones descritas en la evidencia»

> Linear: [L1D-284](https://linear.app/l1der-lab-mjbc/issue/L1D-284) · Prioridad Alta · Est. 8 · Origen: petición del usuario, 2026-10-20. **Decidido (usuario, 2026-10-20):** el detalle lo genera el LLM (alternativas descartadas: copiar un pasaje de la fuente, o solo alargar la justificación).

**Como** médico que lee «Opciones descritas en la evidencia», **quiero** ver cada opción como un resumen (titular + justificación) y poder expandir 1–2 párrafos más de detalle, **para** entender qué reporta la fuente sin salir de la tarjeta.

**AC**
1. *Given* la salida del LLM, *when* se genera una opción, *then* puede traer `details` (0–2 párrafos, máximo configurable, RN-22); el prompt pide describir solo lo que reportan los fragmentos.
2. *Given* los párrafos de `details`, *when* se validan, *then* cada afirmación pasa por citas y NLI (RN-01) y por la lista de términos prohibidos (RN-23): el párrafo con alguna afirmación sin soporte o con lenguaje prohibido se **omite** y cuenta en `omittedClaims`; la opción se mantiene si su justificación se soporta; sin párrafos válidos, `details` queda ausente (nunca vacío).
3. *Given* el contrato `EvidenceOption`, *when* se añade `details` (array de texto, máx. 2, opcional), *then* el cambio es aditivo (excepción E-n de ADR-26 si `oasdiff` lo marca ERR); clientes generados, ejemplos y modo fingido incluyen el campo; clinical-api lo persiste y lo devuelve.
4. *Given* una opción con `details`, *when* se muestra, *then* la tarjeta presenta el resumen y un `<details>` «Ver más detalle» (teclado y lector de pantalla); sin `details`, no hay control.
5. *Given* el stack fingido, *when* corre el E2E, *then* una spec verifica el control y su contenido.
6. *Given* el cambio de prompt y de salida, *when* se mide, *then* hay reporte de `ai-eval-runner` (OL-06): fidelidad, 0 salidas prescriptivas, JSON válido y latencia/tokens con detalle (sin agotar el tope de tokens de salida).

**Riesgos:** más tokens y segundos en una consulta que ya tarda ~30 s; más afirmaciones para el NLI. **Dependencias:** ARR-07 (mismo panel), US-072 (OL-06 en la DoD).
