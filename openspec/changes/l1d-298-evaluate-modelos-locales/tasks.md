# Tasks — l1d-298-evaluate-modelos-locales

> Sin cambio de API: no hay tareas en `## contratos` (la suite corre en proceso; claves de reporte aditivas). Un solo contexto: **ai-services**. La ejecución con modelos reales es manual en el MacBook de referencia (pesos en `~/adr39-modelos/`); la CI sigue con adaptadores falsos.

## ai-services

- [ ] 1.1 Tests de aceptación en rojo AC-3 y AC-4 (`… [US-233a AC-n]`, `@pytest.mark.ac("US-233a", n)`): con `respx`, ningún request fuera de la lista local y `llamadas_nube_datos_reales = 0` en todos los adapters; sin pesos sale ≠ 0 nombrando la variable; alias `:cloud` aborta · integración · TDD estricto · commit `test(L1D-298)`; esqueleto solo si falta un símbolo
- [ ] 1.2 Cablear `proveedor: local` en `composicion_suite.py` con los adapters de producción y las guardas de `es_proveedor_local()`; `chequeo_config.py` lista lo que falta; `llamadas.py` cubre todos los adapters; AC-3 y AC-4 en verde · TDD estricto · commit `feat(L1D-298)`
- [ ] 1.3 Tests de aceptación en rojo AC-5 y AC-6: el juez recibe una afirmación y solo sus fragmentos, JSON inválido/cita inexistente = no soportada y contada, kappa y acuerdo juez↔NLI, «no concluyente» bajo `JUEZ_ACUERDO_MINIMO`, juez↔humano `sin_medir` · integración con LLM del juez fingido en su puerto · TDD estricto · commit `test(L1D-298)`
- [ ] 1.4 Implementar `juzgar_afirmacion()`, `parsear_veredicto()`, `kappa_de_cohen()` y `marcar_fidelidad_no_concluyente()` (nuevo `app/evaluation/acuerdo_juez.py`); claves `EVAL_JUDGE_TEMPERATURE`, `EVAL_JUDGE_SEED`, `JUEZ_ACUERDO_MINIMO` en configuración y `.env.example` (lo aplica la sesión principal) · TDD estricto · commit `feat(L1D-298)`
- [ ] 1.5 Test de aceptación en rojo AC-7 (reloj inyectado, `resource.getrusage`): reporte con RSS máximo, p50/p95 del NLI por hipótesis y por lote y marca de exceso; luego implementación en `medicion_modelos.py`/`cronometro.py`/`armado_reporte.py` · TDD estricto · commits `test` y `feat(L1D-298)`
- [ ] 1.6 Medición de lenguaje con el LLM real (AC-2): sin código nuevo de dominio; la verificación es la corrida de 3.2, con orquestación probada con adapters falsos (`fx-rn23`) · evaluate
- [ ] 1.7 Arrastre `l1d-117` 5.3: deduplicar el filtro `extraido_verificado` entre el adapter SQL y `CatalogoEnMemoria` (una sola regla con nombre) · TDD estricto · commits `test`/`feat(L1D-298)`
- [ ] 1.8 Arrastre `l1d-244` 4.1 y 4.2: `eval-required.mjs` corre también la familia `aplicabilidad` (salida 3) o se documenta el límite; hacer públicos los nombres de `config_suite` usados por `corrida_aplicabilidad.py`; deduplicar `_ficha_de`/`adaptadores_falsos._ficha`; mover el armado del reporte; guarda `clase: sintetico` en `CoberturaEnMemoria`; causa `escala_no_comparable`; pares con `priorAnalyses` (RN-24) y con datos `requiere_revision` (RN-26) · test después (CI/config) y TDD estricto en las reglas · commits `feat(L1D-298)`
- [ ] 1.9 Arrastre `us-117b` G2.B2–B4 y A1–A4 (menores del design reviewer, ver su Gate 2) y `l1d-117` 5.5 (orden TDD: constancia de commits test → feat en este change, sin reescribir historia) · refactor/test después · commit `refactor(L1D-298)`
- [ ] 1.10 Opcional (si hay capacidad; si no, deuda con ID): validar la IP resuelta del descargador contra la lista de bloqueo (hallazgo bajo de `/security-review` del S3) · TDD estricto
- [ ] 1.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-298)`

## evaluación

- [ ] 3.1 Config `eval/configs/local.yaml` (modelos y versiones de ADR-39, `proveedor: local`) · test después (fixture de carga de config)
- [ ] 3.2 `run-ai-eval` / `ai-eval-runner` en el MacBook de referencia (`OLLAMA_CONTEXT_LENGTH=8192`, G cargado, `ollama ps`, sin swap): `evaluate --suite all` sobre `fx-t5a-a`, `fx-rn23` y la partición de ADR-45 (AC-1, AC-2, AC-6, AC-7); reporte en `reports/eval/` adjunto al PR · evaluate
- [ ] 3.3 Cerrar con evidencia ejecutada: `us-231b` 1.11 (RSS y latencia del NLI, `-m models`) y 1.12 (*smoke* de la semilla con modelos reales; nota para cerrar 1.13 y 2.13b de L1D-115/L1D-106); `l1d-117` 2.2 (muestra para el revisor, `data/evaluation/corpus-metadatos/<release>.yaml`); `us-117b` 0.4b (test de sparse con pesos, `-m models`) · evaluate
- [ ] 3.4 Documentar en `design.md` de este change el procedimiento reproducible y las cifras medidas; un exceso de RSS/latencia se reporta al refinamiento · exento (documentación)

## Cierre

- [ ] 4.1 `openspec validate l1d-298-evaluate-modelos-locales --strict`, Pytest de `rag-orchestrator` en verde (`-m "not models"` en CI), `run-ai-eval` con el reporte adjunto
