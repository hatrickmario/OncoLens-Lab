# Tasks — l1d-305-rn23-voz-propia-nivel-b

> Rama `feat/l1d-305-rn23-voz-propia-nivel-b`, PR **individual** `[L1D-305] …` (D-12 `[S5 resp. 7]`: cambia la política de
> RN-23). Implementa `ai-services-dev`. TDD estricto en el filtro (RN-23 de dominio); la suite `evaluate` y el juez, sin TDD
> (informe de `ai-eval-runner`). Mocks solo en los bordes (LLM y NLI falsos en su puerto); nunca módulos propios.

## contratos

- [x] 0.1 Sin cambio de contrato (ADR-26): confirmar que ni `apps/rag-orchestrator/openapi.yaml`, ni
  `apps/clinical-api/openapi.yaml`, ni `contracts/examples/` cambian; `npm run contracts:check` y `contracts:breaking` en
  verde **después** de la tarea 1.1 (la lista 1.6.0 también lintea descripciones y ejemplos). Si un ejemplo coincide con un
  término nuevo, se corrige el ejemplo en un commit `contract(L1D-305)` antes de cualquier test o código · test después

## ai-services

### Catálogo y verificador (AC-1, AC-2, AC-3)

- [x] 1.1 Test en rojo: casos positivos y negativos de voz propia en `packages/clinical-language/conformidad/casos.json`
  (con `id` por caso), la carga de 1.6.0 con `salidaGenerada.nivelB` y el fallo cerrado con un id desconocido, en Vitest
  y Pytest — «coinciden las formas en voz propia en Node y en Python [US-249 AC-3]» · integración (conformidad) · commit
  `test(L1D-305)` · TDD estricto
- [x] 1.2 `terminos-prohibidos.json` 1.6.0: términos del nivel A de `design.md` §1 con `formas` y `excepciones`, y
  `salidaGenerada.nivelB`; esquemas de carga Zod (`load-prohibited-terms.ts`, `tipos.ts`) y Pydantic (`ListaTerminos`) con
  la validación de ids; el runner de conformidad nombra `id` y grupo del caso. Commit `feat(L1D-305)` · TDD estricto
- [x] 1.3 `npm run lint:lenguaje` y el recorrido de UI de `human-control` en verde con 1.6.0; una colisión se corrige en el
  texto, nunca en la lista · test después

### Filtro de producción (AC-1, AC-2)

- [x] 2.1 Test de aceptación en rojo: «la opción va a discardedOptions con lenguaje_no_permitido cuando la justificación dice
  "Se recomendaría iniciar" [US-249 AC-1]» y «Se aconseja» / «Considere iniciar» / limitación en voz propia, con el log
  `fragmento_retirado_lenguaje` (ruleId y `languagePolicyVersion = 1.6.0`, sin texto) · integración (`TestClient` + LLM y
  NLI falsos) · commit `test(L1D-305)` · TDD estricto
- [x] 2.2 Test de aceptación en rojo: «se rechaza con b-recommend cuando el rationale atribuye la recomendación sin comillas
  [US-249 AC-2]», la forma española `b-recomiend`, la cita textual atribuida («Según ‹fuente›:») de `ch-g1-1` permitida, la misma cita sin atribución
  rechazada, la cita atribuida fuera de los fragmentos citados rechazada, la cita con «debe recibir» rechazada, `b-es-administrar` no aplicado y el arranque con
  `salidaGenerada` inválido fallido · integración · commit `test(L1D-305)` · TDD estricto
- [x] 2.3 Extraer `reglas_para_salida_generada()` (RN-23) en `ListaTerminos` y aplicar nivel A + subconjunto B en
  `coincidencias_en_campo_generado` (`support.py`); ampliar `check_prohibited_terms`/`checkProhibitedTerms` con el límite de
  ids del nivel B sin cambiar su valor por defecto (solo A). Unitarios uno a la vez. Commit `feat(L1D-305)` · TDD estricto
- [x] 2.4 Extraer `tapar_citas_textuales_del_corpus()` (RN-23, RN-04) en `app/domain/lenguaje.py`: tapa solo tramos entre
  comillas atribuidos con «Según ‹fuente›:» y presentes literalmente (normalizados) en los `chunkTextSnapshot` de los fragmentos que cita la opción, y solo
  para el subconjunto B; `ProhibitedTermsChecker` recibe esos textos en `bootstrap.py` y en `composicion_suite.py` (misma
  política en producción y en la suite). Unitarios uno a la vez. Commit `feat(L1D-305)` · TDD estricto
- [x] 2.5 Regresión [RN-23] → US-068: `pytest` y Vitest de `human-control`, `evidence-analysis` (incl. «Los usos
  descriptivos no coinciden en el Nivel A» y «La raíz recomend solo se aplica cuando se pide el Nivel B», sin cambios) en
  verde · test después
- [x] 2.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes
  y después, commit `refactor(L1D-305)`

## evaluación

- [x] 3.1 `data/eval/fx-rn23` versión 2: preguntas y propuestas guionadas nuevas (voz propia ES, nivel B atribuido EN/ES, cita
  textual atribuida y cita sin atribución, controles `legitima: true`), archivo de conformidad por forma y variante con `id`, y la copia fija
  `linea-base/terminos-prohibidos-1.5.0.json` (línea base de US-068). Todo sintético, sin NCCN ni ESMO (RN-21) · evaluate
- [x] 3.2 Test en rojo de la suite de conformidad del filtro sobre `fx-rn23` (positivos rechazados, negativos aceptados, el
  fallo nombra `id`, forma y variante; test estructural de cobertura por forma y variante) [US-249 AC-3] · integración ·
  commit `test(L1D-305)`; su paso a verde llega con 2.3–2.4 · TDD estricto (es el filtro de dominio)
- [x] 3.3 A+B bloqueante (AC-4): `scripts/eval/comparar-baseline.mjs` pasa `terminos_prohibidos.salida_mostrada_nivel_b` a
  `bloqueante` (con su test en `scripts/eval/__tests__/compararBaseline.test.mjs` en rojo primero); `esquema_suite.py` y el
  docstring de `metricas/prescriptivas.py` quitan «seguimiento»; métrica `corregidas_por_el_filtro` por nivel · evaluate
  (la orquestación con fakes y TDD)
- [x] 3.4 Regresión de falsos positivos (AC-5): `rechazos_legitimos` con 1.5.0 y 1.6.0 sobre las mismas propuestas,
  `rn23_tolerancia_falsos_positivos` como clave obligatoria de la configuración (`rn23-fake.yaml` y `local.yaml`, valor
  `0`, decidido) sin valor por defecto en código, fallo que nombra id de caso y de regla sin texto · evaluate (la
  orquestación con fakes y TDD)
- [ ] 3.5 `run-ai-eval` en la CI con fakes (`test-fake`, `rn23-fake`): A = 0, B = 0, `rechazos_legitimos` dentro de la
  tolerancia, sin regresión de fidelidad, citas ni «sin evidencia» frente al baseline; informe de `ai-eval-runner` en el
  PR · evaluate
- [ ] 3.6 **AC-4 con el generador real**: se ejecuta en la **corrida nocturna única del cierre del día 2** del S5
  (`S5-refinamiento.md` §5), junto con US-120 AC-5/AC-6, US-140, D4-21 y D4-30, con `proveedor: local` (Ollama nativo y
  pesos de ADR-39 en el MacBook de referencia), **nunca** en horario de trabajo ni en la CI. `ai-eval-runner` escribe el
  informe en `reports/eval/` (D5-03) con `salida_mostrada_nivel_a`, `salida_mostrada_nivel_b`, propuesta cruda por nivel,
  `corregidas_por_el_filtro`, `rechazos_legitimos` (AC-5) y `llamadas_nube_datos_reales = 0`. Si la corrida no cabe en el
  día 2, la tarea se marca `DIFERIDA -> D5-nn` con la deuda creada en `S5-deuda.md`; nunca se marca `[x]` sin el informe · evaluate
- [ ] 3.7 Si la corrida nocturna da A o B > 0: no se relaja la meta; se abre el hallazgo para `/sprint-close` con los ids de
  regla y de caso (sin texto), y la historia no cuenta como cerrada (DoD) · evaluate

## Cierre

- [x] 4.1 `openspec validate l1d-305-rn23-voz-propia-nivel-b --strict` en verde
- [x] 4.2 Tests del contexto en verde (`pytest` de `rag-orchestrator`, Vitest de `packages/clinical-language`,
  `scripts/eval`), `lint:lenguaje` y `contracts:check` en verde; sin `contracts:verify-provider` (no hay cambio de API)
- [ ] 4.3 `run-ai-eval` adjunto al PR (3.5) y, tras la corrida nocturna, el informe de 3.6 enlazado en la historia

## Notas de implementación (ai-services-dev)

- 3.5 sigue abierta: la medición con fakes está hecha en local (`rn23-fake`: A = 0, B = 0, `rechazos_legitimos` 0 frente a 0 con tolerancia 0; `test-fake` contra su baseline, igual salvo `corregidas_por_el_filtro`), falta el informe de `ai-eval-runner` en el Gate 2.
- Desviación del design.md §2: `salidaGenerada` suma `excepciones` (palabras completas: «recomendación», «recomendaciones», «recommendation», «recommendations»), porque el prefijo `recomend`/`recommend` del subconjunto rechazaba el sustantivo descriptivo y rompía el escenario vigente de US-064 («Los autores del ensayo no emiten una recomendación formal»). Solo rige en el subconjunto de la salida generada; el lint de UI (Nivel B completo) no cambia. Pendiente de que el orquestador lo recoja en design.md y en la spec.
- Decisión de medición: `salida_mostrada_nivel_b` se mide con la misma política que el filtro (Nivel A, `salidaGenerada.nivelB`, cita atribuida y excepciones fuera), porque el resto del Nivel B se permite a propósito (AC-2, AC-5); la propuesta cruda sigue midiéndose con A y B completos.
- Nueva configuración `eval/configs/rn23-local.yaml` (generador real sobre `fx-rn23` 2) para la corrida nocturna 3.6; `local.yaml` mide `fx-t5a-a` y solo recibe la clave.

## humano

- **H-1 (3.6, corrida nocturna única del cierre del día 2, nunca en horario de trabajo ni en la CI).** En el MacBook de referencia, con Ollama nativo y los pesos de ADR-39 (`~/adr39-modelos/modelos.env`, `adr39-config.sh`):
  `OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve` y, desde `apps/rag-orchestrator`, `python -m app.evaluation.evaluate --config eval/configs/rn23-local.yaml --suite all --salida <carpeta fuera de reports/eval>`. Código 0 = A = 0, B = 0 y `rechazos_legitimos` dentro de la tolerancia; 4 = un caso legítimo nuevo (stderr trae id de pregunta y de regla, sin texto).
- **H-2 (3.6).** Entregar el JSON a `ai-eval-runner` para que lo escriba en `reports/eval/` (D5-03) y comprobar en él `salida_mostrada_nivel_a`, `salida_mostrada_nivel_b`, `propuesta_cruda_por_nivel`, `corregidas_por_el_filtro`, `rechazos_legitimos` y `privacidad.llamadas_nube_datos_reales = 0`.
- **H-3 (3.7).** Si A o B > 0 o la diferencia de `rechazos_legitimos` supera la tolerancia: no relajar la meta; abrir el hallazgo para `/sprint-close` con los ids de regla y de caso (sin texto) y no contar la historia como cerrada.
- **H-4 (3.6).** Si la corrida no cabe en el día 2: marcar 3.6 `DIFERIDA -> D5-nn` y crear la deuda en `S5-deuda.md`; nunca `[x]` sin el informe.

## Gate 2 (vuelta 1)

- Evidencia de AC-1: su rojo son los casos VP-nn de conformidad del commit 54d4a5fe; los tests de integración `[US-249 AC-1]` (576d7b27) ya pasaban porque la regla es dato del catálogo 1.6.0. El commit 2979271c usa `feat(` para notas y se deja.
- Hecho: excepciones del sustantivo como frases, `consider starting/initiating/discontinuing`, `fuentes` obligatorio, suite con las mismas reglas de producción (`FuentesDeLaConsulta`, `campo_de_papel`), caso fx-rn23 RN23-15 y test que ancla la decisión de `web` (Nivel A).
- Deuda propuesta (P3 #6–#9 y unificación): historia de deuda «unificar la política de salida generada Node/Python» (ID destino a asignar por el orquestador, p. ej. D5-nn en `S5-deuda.md`); «recommended» suelto como límite conocido, a vigilar en la corrida nocturna. Un modal normativo en una opción `legitima: true` no cupo: el generador guionado los aparta antes del filtro de lenguaje.
