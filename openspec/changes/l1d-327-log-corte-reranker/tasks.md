# Tasks — l1d-327-log-corte-reranker

> Rama `feat/l1d-327-log-corte-reranker`, PR `[L1D-327] Log del corte previo al reranker con ids y puesto denso`.
> Sin cambios de API: no hay sección de contratos. Secuencia: test → feat → refactor.

## humano

- [ ] H-1 Añadir a `.env.example`, junto a `RERANKER_MAX_PAIRS=12`, el bloque literal siguiente. DIFERIDA -> H-1 (hecho en PR chore/s6-h1-env-example)

```
# Máximo de chunkId cortados que lista el evento rag_query_corte (US-270, RN-22)
RERANKER_CUT_LOG_MAX_IDS=50
```

## 1. ai-services

- [x] 1.1 (TDD estricto) Test de aceptación en rojo: el evento `rag_query_corte` registra `recibidos=15 descartados=3 enviados=12` y `cortados=ch-13:13,ch-14:14,ch-15:15` cuando hay 15 candidatos y 12 pares [US-270 AC-1] · integración (`tests/integration/test_corte_previo_a_pares_del_reranker.py`, `@pytest.mark.ac("US-270", 1)`); commit `test(L1D-327)`
- [x] 1.2 (TDD estricto) Test de aceptación en rojo: ningún registro capturado con `caplog` contiene el texto de un chunk, la pregunta ni el `pseudoPatientId` cuando llevan marcadores únicos [US-270 AC-2] · integración; mismo commit `test(L1D-327)`
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: `descartados=0` y `cortados=` vacío cuando hay 10 candidatos [US-270 AC-3] · integración; mismo commit `test(L1D-327)`
- [x] 1.4 (TDD estricto) Test de aceptación en rojo: con 200 candidatos y `RERANKER_CUT_LOG_MAX_IDS = 50`, `cortados` lista los puestos 13…62 y `cortados_omitidos=138` [US-270 AC-4] · integración; mismo commit `test(L1D-327)`. Si el símbolo de configuración no existe, el commit incluye solo su esqueleto
- [x] 1.5 Reescribir `test_el_log_de_la_etapa_de_corte_registra_solo_recuentos_sin_ids_ni_texto` para que conserve solo «sin texto» (su AC cambió); commit con el trailer `Test-Removal: decisión 82 cambia a ids sin texto [S6 resp. 4]` en el último párrafo, junto a `Co-Authored-By`
- [x] 1.6 (TDD estricto) Extraer `cortados_con_puesto()` en `app/domain/pares_del_reranker.py` con unitarios uno a uno (sin corte → vacío; corte → ids y puesto 1-based en orden denso; empate → desempate por `chunk_id`; tope → omitidos), reutilizando el mismo orden que `recortar_a_pares_del_reranker`; clave `RERANKER_CUT_LOG_MAX_IDS` (por defecto 50, ≥ 1) en Settings y cableado en `bootstrap.py` y `ParametrosDelServicio`; formateo en `_cortar_a_pares_del_reranker` y *docstring* actualizado («ids y puesto, nunca texto»); AC-1…AC-4 en verde; commit `feat(L1D-327)`
- [x] 1.7 Refactor (sin cambios: la regla ya nació extraída y el orden denso compartido en `_orden_denso`): Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-327)`

## evaluación

- [x] 2.1 (exento) Sin `run-ai-eval`: no cambia modelo, prompt, umbral, catálogo ni corpus; el conjunto enviado al *reranker* no cambia

## cierre

- [x] 3.1 `openspec validate l1d-327-log-corte-reranker --strict`
- [x] 3.2 Suite de `rag-orchestrator` en verde (Pytest 3169 passed, ruff; mypy no instalado en el entorno de pruebas, no ejecutado)
Nota (acción del archivado en /sprint-close, no tarea de este PR): al archivar, reconciliar el escenario «La etapa de corte envía como máximo 12 pares al reranker y registra solo recuentos» de `us-231b-adapter-nli-smoke-semilla` («sin ids ni texto» → «sin texto», citando `l1d-327`)
