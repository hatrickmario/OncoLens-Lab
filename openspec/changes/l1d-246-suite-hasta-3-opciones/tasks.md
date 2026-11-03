# Tasks — l1d-246-suite-hasta-3-opciones

> Sin cambio de API: no hay sección `## contratos`. Un contexto: **ai-services** (`ai-services-dev`). TDD: la orquestación
> de la familia y las métricas con adapters falsos y TDD estricto (doble bucle); dataset y configuración, test después; la
> medición real, `evaluate` en la corrida nocturna del día 2.

## 1. ai-services · dataset y configuración

- [x] 1.1 Dataset `data/evaluation/opciones/` (manifiesto `clase: sintetico`, versión): 12 casos (6 mama, 6 próstata) con
  pregunta, contexto desidentificado, corpus de test, opciones esperadas y orden esperado por RN-28; 4 `revisada_por_oncologo`;
  2 con opción de fuente única no comparable; guiones falsos derivados de FX-10c-a (`LLM-CUATRO`, `LLM-TRES`, `APL-FIJA`) ·
  test después: test de carga del dataset (`dataset_opciones`) que comprueba 12/6/6/4/2 · commit `test(L1D-246)` + `feat(L1D-246)`.
  Hecho: `test_dataset_y_config_opciones.py` y `test_opciones_coherencia_dataset.py` (el orden esperado por RN-28 coincide con el
  de la corrida falsa). Ningún caso está marcado `revisada_por_oncologo` (no hay revisión humana): los 4 candidatos (OP-01,
  OP-02, OP-07, OP-08) esperan H-2 y AC-5 se prueba con un fixture de test con 4 revisados.
- [x] 1.2 `eval/configs/opciones-fake.yaml` (FX-T5a-a + FX-10c-a, reloj simulado, `maxOptions: 3`, `regresion.reporte_referencia:
  reports/eval/s3-cierre.json`, `faithfulness_regression_tolerance: 0.05`, metas desde `metas-iniciales.yaml`) y
  `eval/configs/s5.yaml` (`proveedor: local`, mismos campos, `regresion.reporte_referencia: reports/eval/l1d-298-evaluate-modelos-locales-fx-t5a-a.json`, reporte del S4, P1 decidido; solo el corpus del dataset, sin el ampliado de `l1d-119`, P2 decidido) · test después: carga
  de ambas en `config_opciones` y rechazo (código 2) sin referencia · commit `feat(L1D-246)`.

## 2. ai-services · familia `opciones` (TDD estricto)

- [x] 2.1 Test de aceptación en rojo: «el reporte trae M-10.1, M-10.2, fidelidad, precisión de citas, media de opciones,
  orden RN-28 y opciones esperadas presentes cuando se ejecuta la familia con la configuración falsa [US-140 AC-1]» ·
  integración (Pytest, `main([...])` con adapters falsos) · esqueleto `corrida_opciones.ejecutar_opciones` con
  `raise NotImplementedError` · commit `test(L1D-246)`.
- [x] 2.2 Tests de aceptación en rojo: bloqueo con código 3 nombrando caso e invariante para M-10.1 < 100 %, M-10.2 > 0 y
  orden que viola RN-28 `[US-140 AC-2]`; no comparable antes de comparable bloquea y fuera del tope no cuenta `[US-140 AC-3]`;
  retroceso > tolerancia bloquea, dentro no `[US-140 AC-4]`; rótulo 4 validados / 8 no validados `[US-140 AC-5]`; dos corridas
  idénticas `[US-140 AC-6]` · integración · commit `test(L1D-246)`.
- [x] 2.3 Extraer `orden_conforme_rn28()` y `no_comparable_al_final()` (RN-28; verifica la regla vigente de US-125 AC-2 + US-134 AC-4, no la crea) en `metricas/orden_opciones.py`, puras, sobre
  `clave_de_aplicabilidad`/`contar_excluyentes_no_coincide` de `app/domain/applicability_order.py` (sin reimplementar la
  regla) · unitarios uno a uno · entran con `feat(L1D-246)`.
- [x] 2.4 Implementar `metricas/opciones_mostradas.py` (M-10.1 recalculado por cita entregada + NLI, M-10.2 desde
  `salidas_mostradas_nivel_a/_b` y `campos_mostrados`, media de opciones, esperadas presentes) y el veredicto de retroceso
  reutilizando el patrón de `comparar_regresion.py` · unitarios · `feat(L1D-246)`.
- [x] 2.5 Implementar `corrida_opciones.py`, `config_opciones.py`, `dataset_opciones.py`, `ESQUEMA_OPCIONES` en
  `esquema_suite.py`, `opciones` en `SUITES` y despacho en `evaluate.py`; marcas «fuera de meta» desde `metas-iniciales.yaml`
  sin cambiar el código de salida; solo agregados e ids en reporte y mensajes (RN-14) · 2.1 y 2.2 en verde · `feat(L1D-246)`.
- [x] 2.6 `eval-required` ejecuta también `--suite opciones --config eval/configs/opciones-fake.yaml` cuando hay disparador;
  un código 3 rompe el job y el resumen nombra la familia · test después en `scripts/ci/__tests__/` (Vitest, tiempo máximo
  explícito si lanza proceso) · va **después** de mergear `arr-11-ci-rapida` · commit `ci(L1D-246)`.
- [x] 2.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(L1D-246)`.

## evaluación

- [ ] 3.1 DIFERIDA -> H-1 · `run-ai-eval` con `opciones-fake.yaml` adjunto al PR (CI con adapters falsos) · evaluate. La corrida falsa se
  ejecutó en local (exit 0: M-10.1 = 100 %, M-10.2 = 0, orden RN-28 12/12, sin retroceso); el reporte versionado en
  `reports/eval/` está protegido para el implementador y lo escribe `ai-eval-runner` en el Gate 2 · DIFERIDA -> H-1
- [ ] 3.2 DIFERIDA -> D5-28 · Medición real en la **corrida nocturna única del cierre del día 2** (`S5-refinamiento.md` §5), junto con
  `l1d-119-corpus-ampliado-calibracion` (8.x) y `l1d-305-rn23-voz-propia-nivel-b` (3.6): `evaluate --suite opciones --config
  eval/configs/s5.yaml` con `proveedor: local` por `ai-eval-runner`; reporte en `reports/eval/l1d-246-*`; si un bloqueo salta,
  no se relaja la meta: se abre el hallazgo para `/sprint-close` con los ids de caso · evaluate. Si la corrida no alcanza
  (US-140 es la última del orden de recorte), DIFERIDA -> US-142 con el motivo.
- [ ] 3.3 DIFERIDA -> D5-28 · Enlazar el reporte de 3.2 en la historia y como insumo de US-142 (L1D-248, G-Demo AC-2) · artefacto entregado ·
  DIFERIDA -> D5-28

## Verificación

- [x] 4.1 `openspec validate l1d-246-suite-hasta-3-opciones --strict` en verde.
- [x] 4.2 Tests de `apps/rag-orchestrator` (Pytest) y de `scripts/ci` en verde (local: Pytest `tests/evaluation` + `tests/unit`,
  Vitest `scripts/ci` y `scripts/eval`, `node scripts/ci/eval-required.mjs --base origin/main` con exit 0); el job
  `eval-required` en el PR lo verifica la CI del PR.

## humano

- [ ] H-1 DIFERIDA -> H-1 · Generar y versionar el reporte de 3.1 (`reports/eval/` está protegido para el implementador), desde
  `apps/rag-orchestrator` y con un Python con `requirements-eval.txt` ·
  ```
  python -m app.evaluation.evaluate --config eval/configs/opciones-fake.yaml --suite opciones --salida ../../reports/eval --nombre-archivo l1d-246-opciones-fake.json
  ```
- [ ] H-2 DIFERIDA -> H-2 · Un oncólogo revisa los 4 casos candidatos (OP-01, OP-02, OP-07, OP-08) de
  `data/evaluation/opciones/preguntas.yaml` y, si los confirma, cambia `revisada_por_oncologo` a `{rol, fecha}` (sin nombre, RN-10) en esos casos.
  Hasta entonces (revisión = `{rol, fecha}` sin nombre) toda métrica de la familia sale
  `no_validada` (0 validados, 12 no validados) y el rótulo «validada» de AC-5 no existe para el dataset real.

## deuda propuesta

- [ ] D5-28 DIFERIDA -> D5-28 · Deuda de diseño propuesta por la implementación (ID D5-28 por confirmar por el orquestador). Gate 2 vuelta 1: `FAITHFULNESS_REGRESSION_TOLERANCE` también por entorno (como RETRIEVAL_REGRESSION_TOLERANCE); tests de contrato del fake `catalogo_con_poblacion`; `CriteriosPorTipo` -> `CriteriosDelCatalogo`; tope `population_max_values` en la huella; sembrar 1-2 salidas de nivel B en `prescriptivas.yaml`; unificar `_valor_en`/tolerancia (`regresion.py`, `config_opciones.py`, `opciones_mostradas._empeora`); partir `corrida_opciones.py` con `reporte_opciones.py`; `MAX_OPCIONES` duplicado; `catalog_version` sin usar; arista `app.evaluation -> infrastructure.catalogo_clinico` sin ADR. Menores sin hacer del re-gate: el trailer `Test-Removal:` del último commit `feat` es impreciso (declararlo en el PR); los defaults de `OpcionMostrada.fuente_evaluada/memoria_citada` fallan abiertos; validar `rol` contra un conjunto cerrado y `fecha` ISO; dos contratos para `revisada_por_oncologo` (bool en las demás suites); la frase del alcance de la revisión está duplicada en Python y JS; el token centinela `sin_fuente_en_applicability` dentro del detalle de `Violacion` RN-28. Además: (a) `corrida_opciones` y
  `evaluate._reloj_de_medicion` duplican la elección del reloj de medición (`RelojSimulado` o `perf_counter`); (b) la
  aplicabilidad por opción no expone cuántos excluyentes tiene en No coincide, así que se toman de `applicability[]` de su fuente
  más aplicable; (c) el reranker falso puntúa 1,0 todos los chunks del dataset, así que el desempate por relevancia de RN-28 no se
  ejercita con datos, solo en los unitarios de `orden_opciones`. DIFERIDA -> D5-28
