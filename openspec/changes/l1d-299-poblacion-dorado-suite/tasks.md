# Tasks — l1d-299-poblacion-dorado-suite

Orden: después de `l1d-292-poblacion-abanico-ingesta` (extractor), `l1d-293-estado-criterio-lista-poblacion` (reglas),
`l1d-244-eval-aplicabilidad-metadatos` (runner, `revision_muestra.py`) y US-233a / L1D-298 (`proveedor: local`).
Regresión [AC-T5.4] → US-074 activa desde que existe la familia. Sin cambios de API: no hay sección `## contratos`.
Sin TDD de contenido (prompts, modelos, corpus: suite `evaluate`); TDD estricto solo en métricas y veredicto.

## 1. ai-services

- [ ] 1.1 (test después) `[HUMANO]` Ampliar `data/evaluation/corpus-metadatos/PLANTILLA.md` (valor, `scope`, fragmento y
      estado esperado por paciente de prueba) y revisión por el usuario (`l1d-117` 2.3, `l1d-244` 2.2, 20-40 min).
      Verificación: la plantilla ampliada se versiona en el PR.
- [ ] 1.2 (test después) Dataset `data/evaluation/poblacion-dorado/` (D2): `manifest.json` con clase, licencias, revisor
      y fecha; `pares.yaml` (≥ 30 pares, estratos guía/ensayo/revisión × es/en), `estados.yaml` (F-20…F-24) y
      `pares-bucle.yaml` (≥ 20, distintos del tamoxifeno). Verificación: la carga y el rechazo de un manifiesto sin
      licencia o sin revisor corren en el test de aceptación (verde). `[US-233b AC-1]` `[AC-8]` _Estado (L1D-299):_ la carga, las guardas de licencia/clase y la semilla sintética están hechas (`dataset_poblacion.py`, `data/evaluation/poblacion-dorado/`: 36 pares, 6 estratos, 24 del bucle, F-20…F-24; `4 tests` en `test_poblacion_dorado_versionado.py`). **Sigue sin marcar: el AC-1 exige revisor y fecha** y la semilla va con `revisor: {rol: null, fecha: null}` (la suite la marca «no concluyente»). Pendiente de la revisión humana (1.1); destino: lo que el usuario revise.
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: "reporta precisión, cobertura y duplicados por criterio cuando se
      ejecuta la familia poblacion con la configuración falsa [US-233b AC-2]" · integración del runner. Esqueleto de
      `metricas/poblacion.py` con `raise NotImplementedError`. Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` (22 tests, 21 en rojo por aserción: la suite no estaba registrada y salía con 2) → verde `9bc2b426`; `tests/evaluation/test_poblacion_dorado_aceptacion.py`.
- [x] 1.4 (TDD estricto) Test de aceptación en rojo: "sale con código ≠ 0 y nombra documento y criterio cuando una
      tarea termina con finish_reason length [US-233b AC-3]" · incluye variante sin contenido en mensaje y reporte.
      Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; el mensaje y el reporte nombran documento y criterio sin prompt, salida ni fragmentos. El reintento que también se corta cuenta una vez. Los cortes del bucle (OUT-06) NO rompen la suite: alimentan su tasa.
- [x] 1.5 (TDD estricto) Test de aceptación en rojo: "cuenta aparte No coincide indebido y Coincide indebido cuando
      compara los estados esperados F-20…F-24 [US-233b AC-4]" · reglas reales de US-243, sin mocks de módulos propios.
      Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; reglas reales de US-243 (`estado_de_poblacion`), catálogo `test-apl-1.2.0`.
- [x] 1.6 (TDD estricto) Test de aceptación en rojo: "no baja sin evidencia respecto del baseline y no invoca al LLM
      cuando la extracción de US-242 está activa [US-233b AC-5]" · con variante que baja. Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; la suite `all` de `test-fake.yaml` se corre de verdad contra `data/evaluation/baseline.json`; variantes que bajan (0,8 frente a 1,0) y que invocan al LLM (`violaciones_rn02` 1).
- [x] 1.7 (TDD estricto) Test de aceptación en rojo: "marca OUT-06 cerrada solo con tasa de cortes 0 sobre ≥ 20 pares
      [US-233b AC-6]" · con variante de 19 pares y de tasa > 0. Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; variantes de 20, 19 y 20 con un corte (`cerrada` / `insuficiente` / `abierta`). Con adapters falsos «cerrada» solo prueba la lógica: el cierre real de OUT-06 es la medición 2.1.
- [x] 1.8 (TDD estricto) Test de aceptación en rojo: "marca no concluyente y nunca PASS cuando el dorado no trae
      revisor o fecha [US-233b AC-7]". Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426`; cuatro variantes (sin revisor, sin fecha, sin rol, sin nada) y muestra < 30 pares: nunca `pass`.
- [x] 1.9 (TDD estricto) Test de aceptación: "contiene solo corpus público con licencia y agregados, y el escaneo de PII
      no encuentra nada [US-233b AC-8]" · integración con el escáner de la CI y código 1 con manifiesto sin licencia.
      Commit `test(L1D-299)`. _Evidencia:_ rojo `af6d55b3` → verde `9bc2b426` (manifiesto sin licencia, con licencia no aceptada y con otra clase: código 1, sin reporte). `node scripts/ci/pii-scan.mjs` y `dataset-class-check.mjs` corridos a mano sobre el directorio: sin hallazgos; el job `data-scan` de la CI los vuelve a correr (3.2). **No hay un test de pytest que invoque el escáner.** Ojo: `dataset-class-check` solo admite `clase: sintetico`; un dorado real con `corpus_publico` exigirá ampliar ese chequeo.
- [x] 1.9b (TDD estricto; Decidido (usuario, 2026-10-30), Mayor de `clinical-language-auditor` en el Gate 2 de L1D-291) El recolector de textos generados de la suite `evaluate` (`apps/rag-orchestrator/app/evaluation/salida_generada.py`, `textos_de_respuesta`) recorre `applicability[].criteria[]` incluyendo `studyPopulationValue` y `studyPopulationValues[].value`, para que la métrica «salidas prescriptivas = 0» cubra los valores de población (RN-23). Test de aceptación en rojo: «marca salida prescriptiva cuando un studyPopulationValues[].value o un studyPopulationValue contiene un término prohibido sembrado [US-233b AC-9]» (con variante limpia que no marca). Commits `test(L1D-299)` y `feat(L1D-299)`. _Evidencia:_ rojo `44426fd2` (1 en rojo por aserción) → verde `7a115e08`; `salida_generada.textos_de_poblacion`, cubre `studyPopulationValue` y `studyPopulationValues[].value`.
- [x] 1.10 (TDD estricto) Implementar `metricas/poblacion.py` (`precision_por_criterio`, `cobertura_por_criterio`,
      `tasa_duplicados`, `cortes_por_longitud`, `concordancia_de_estados`, `sin_evidencia_vs_baseline`,
      `tasa_cortes_del_bucle`, `veredicto`) con unitarios uno a la vez, del caso más simple al siguiente. Reloj y
      semillas inyectados. Commit `feat(L1D-299)`. _Evidencia:_ `9bc2b426`; `metricas/poblacion.py` (19 unitarios en `test_metricas_poblacion.py`). Funciones puras: no necesitan reloj ni semilla.
- [ ] 1.11 (TDD estricto) `dataset_poblacion.py` (carga, guardas de clase y licencia, revisor y fecha), familia
      `poblacion` en `config_suite.py`, `evaluate.py`, `composicion_poblacion.py`, `armado_reporte.py` y
      `esquema_suite.py`; metas en `eval/configs/test-poblacion.yaml` y `poblacion-local.yaml` (RN-22). Fuera de `all`.
      Commit `feat(L1D-299)`. _Estado (L1D-299), parcial:_ hecho `dataset_poblacion.py`, `config_poblacion.py`, `corrida_poblacion.py` (en lugar de `composicion_poblacion.py`/`armado_reporte.py`), familia `poblacion` en `SUITES` (fuera de `all`), `evaluate.py` y `esquema_suite.py`; metas en `eval/configs/test-poblacion.yaml` (`9bc2b426`, `757e15b3`). **Sin marcar:** `poblacion-local.yaml` y `proveedor: local` (sale con 2 «se cablea con la medición real»); destino: la medición 2.1 (S5).

## 2. evaluación

- [ ] 2.1 (suite `evaluate`) Ejecutar `evaluate --suite poblacion` con `proveedor: local` en el MacBook de referencia
      sobre el dorado revisado; `ai-eval-runner` guarda el reporte en `reports/eval/` (precisión y cobertura por
      criterio, duplicados, `length` = 0, concordancia, «sin evidencia», tasa del bucle). Sin TDD de contenido. **TRASLADADA al S5** (sin LLM local ni revisor en esta corrida; depende de 1.1/1.2 y de cablear `proveedor: local` en `corrida_poblacion.py`). No se ejecutó.
- [x] 2.2 `run-ai-eval`: confirmar que `baseline.json` y la huella de `test-fake.yaml` no cambian. _Evidencia:_ `EVAL_PYTHON=… HF_HUB_OFFLINE=1 node scripts/eval/evaluate.mjs --suite all` da un reporte **byte a byte igual** a `data/evaluation/baseline.json` (huella `57b8a05d…`); `--suite aplicabilidad` y `--suite poblacion` salen con 0.

## 3. Verificación

- [x] 3.1 Suite Pytest de la familia y suites existentes del runner en verde; `openspec validate l1d-299-poblacion-dorado-suite --strict`. _Evidencia:_ `pytest` de `apps/rag-orchestrator` 3549 passed (187 deseleccionados por marca); `tests/evaluation` 900 passed; `ruff format --check` limpio; `lint-imports` 2 contratos kept; `contracts:verify-provider --proveedor rag-orchestrator` 311 respuestas; `openspec validate … --strict` válido. `ruff check` tiene 2 hallazgos previos (E741 en `test_barrido_configuracion.py`).
- [ ] 3.2 CI en verde (escaneo de secretos y PII sobre `data/evaluation/poblacion-dorado/`) antes de pedir el merge. CI aún sin correr: no se abrió PR (lo hace el orquestador).

## 4. Deuda absorbida (acelerada, 2026-10-31)

- [x] 4.1 D4-09 módulo estadístico único: `app/evaluation/estadistica.py` (`mediana`, `percentil_rango_mas_cercano`, `percentil_interpolado`); `cronometro`, `medicion_modelos`, `fase_a`, `fase_a3`, `retrieval_metrics` y `vm/dominio` delegan en él · _Evidencia:_ `4bc5903f` (`test_estadistica.py`; 851 passed en `tests/evaluation`). `armado_comparacion` usa `statistics.mean`, que no es mediana ni percentil: no se tocó.
- [x] 4.2 D4-04 (parcial) cobertura de aplicabilidad: pares `a-m2` con escala de desempeño no comparable (Karnofsky frente al ECOG del criterio → `desconocido` / `falta_en_paciente`), HER2 `requiere_revision` con `aviso: sin_verificar` sin cambiar el estado (RN-26) y análisis previo en `priorAnalyses` citado por el LLM falso (omitido, RN-24); `Esperado` gana el `aviso` opcional · _Evidencia:_ `5d86162f`. **Queda sin hacer:** la causa `escala_no_comparable` no existe en el contrato (el enum `unknownReason` de `openapi.yaml` no la tiene; añadirla es un cambio de contrato) y mover el armado del reporte fuera de `corrida_aplicabilidad.py` (refactor).
- [ ] 4.3 D4-13 medir la población del respaldo y la cobertura 0/1 del respaldo con el modelo local: **TRASLADADA al S5**. `finish_reason` ya se mide en la familia `poblacion` (1.4) con adapters falsos; con el LLM real depende de 2.1.
- [ ] 4.4 D4-07 muestra etiquetada a mano del alcance elegibilidad/subgrupo/mención: **TRASLADADA al S5** (es trabajo `[HUMANO]`, se ata a 1.1) y el test del criterio vacío sin llamar al LLM sigue en `test_poblacion_abanico.py`.
- [ ] 4.5 D4-05 menores G2.B2–B4 y A1–A4 de `us-117b`: **TRASLADADA al S5**; el detalle no está en el repo (solo «ver su Gate 2»).
