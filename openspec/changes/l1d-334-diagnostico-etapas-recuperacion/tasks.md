# Tasks — l1d-334-diagnostico-etapas-recuperacion

Orden: primera historia nueva del S7; va antes de la corrida base y de L1D-335, L1D-336 y L1D-337. Sin cambios de API:
no hay sección `## contratos`. Sin cambio de código de producción. Sin TDD de contenido (modelos, umbrales, corpus: suite
`evaluate`); TDD estricto en la orquestación de la familia y en las reglas puras. Mocks solo en los bordes (LLM,
embeddings, *reranker*, NLI, búsqueda); nunca módulos propios. Reloj y semillas inyectados. Primero también en el orden
de los archivos de la suite (propuesta de planificación): este change → `l1d-329` → `l1d-331` (código) → `l1d-336` →
`l1d-335` → `l1d-337`. Corpus: dataset `s5-corpus-ampliado` en memoria, el mismo en base y final (`[S7 resp. 10]`);
umbrales actuales (`[S7 resp. 11]`).

## 1. ai-services

- [x] 1.1 (test después) Dataset `data/eval/parafrasis-v1/`: `manifest.yaml` (`clase: sintetico`, corpus,
      `revision_provisional: {rol: ia, fecha}`) y `pares.yaml` con ≥ 10 pares, los cuatro tipos de variación y el par de
      la Demo 6; cada `cita` es un fragmento literal de `data/eval/s5-corpus-ampliado/corpus.yaml`. Test de integridad
      `tests/evaluation/test_dataset_parafrasis.py` en el mismo PR. Sin contenido de NCCN ni ESMO. `[US-276 AC-1]` `[AC-4]`
- [x] 1.1b (test después) Lenguaje y marca de revisión del dataset: los pares usan **redacciones descriptivas** y el
      test de integridad pasa cada redacción por el verificador de términos prescriptivos prohibidos del catálogo
      (RN-23; el mismo verificador de la suite, sin lista propia), como `l1d-246` y `l1d-299`: «ninguna redacción de
      un par contiene un término prescriptivo prohibido [US-276 AC-4]». La forma de `revision_provisional` se valida
      con la regla pura única de `app/evaluation/` compartida con `dataset_opciones.py` (`l1d-246`) y
      `dataset_poblacion.py` (`l1d-299`): buscarla en el árbol antes de escribirla y no duplicarla (design D7).
- [x] 1.2 (TDD estricto) Test de aceptación en rojo: «da por pregunta el puesto denso, la entrada en los pares, el
      relevance_score, el paso del umbral, las opciones y las afirmaciones del NLI cuando se ejecuta la familia
      diagnostico con adaptadores falsos [US-276 AC-1]» · integración del runner con `diagnostico-fake.yaml`; incluye
      `null` (nunca `0.0`) cuando el chunk no llega al *reranker* y la reproducibilidad byte a byte. Esqueletos con
      `raise NotImplementedError`. Commit `test(L1D-334)`.
      Evidencia: rojo `4d2c74d1` (falla en la aserción `assert 2 == 0`: la familia no está disponible), verde `e449e643`;
      los tests de aceptación de AC-1…AC-4 están en `tests/evaluation/test_diagnostico_aceptacion.py` (más los de `null`,
      reproducibilidad y dataset real con `diagnostico-fake.yaml`).
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: «asigna la pérdida a una sola etapa y da el recuento por etapa
      cuando una redacción tiene evidencia y la otra no [US-276 AC-2]» · fixture con un par por etapa
      (`recuperacion_densa`, `corte_de_pares`, `umbral_de_relevancia`, `nli`), uno `sin_asignar` y uno sin pérdida; el
      informe trae el texto de la regla. Commit `test(L1D-334)`.
- [x] 1.4 (TDD estricto) Test de aceptación en rojo: «da el histograma de p_entailment y el recuento de la banda bajo el
      umbral sin proponer un umbral cuando el NLI descarta afirmaciones [US-276 AC-3]» · con la variante sin
      descartadas. Commit `test(L1D-334)`.
- [x] 1.5 (TDD estricto) Test de aceptación en rojo: «contiene solo ids, puestos y puntajes y rechaza un dataset que no
      es sintetico cuando se inspecciona el informe [US-276 AC-4]» · busca en el informe el texto de cada pregunta, chunk
      y afirmación del fixture; código ≠ 0 con otra clase y con una cita que no está en el corpus. Commit `test(L1D-334)`.
- [x] 1.6 (TDD estricto) Implementar `observadores_diagnostico.py` (observadores de `ChunkSearch`, `Reranker`,
      `EvidenceGenerator` y `NliClassifier`) y añadirlos a la batería de contrato de envoltorios
      (`tests/evaluation/test_contrato_de_envoltorios.py`). Test que compara sus recuentos con los de `rag_query_corte`
      (`caplog`). Commit `feat(L1D-334)`.
      Nota: la batería `test_contrato_de_envoltorios.py` es la de los envoltorios ONNX (la lista vacía lanza `ValueError`) y
      `test_bateria_de_contrato_de_adapters.py` la del `LlmClient`; los observadores decoran los puertos de dominio (la lista
      vacía devuelve `[]`), así que su contrato (mismas firmas, mismos resultados y errores, vacío sin anotar) está en
      `tests/evaluation/test_observadores_diagnostico.py` y la comparación con `rag_query_corte` en
      `tests/evaluation/test_diagnostico_contra_eventos.py`.
- [x] 1.7 (TDD estricto) Extraer `etapa_responsable()` (RN-02, RN-01) y `chunks_esperados_de()` en
      `metricas/diagnostico.py`, con `recuento_por_etapa()`, `histograma_de_p_entailment()` y `recuento_en_banda()`;
      unitarios uno a la vez, del caso más simple al siguiente. El corte reutiliza `recortar_a_pares_del_reranker` del
      dominio (sin duplicar la regla). Commit `feat(L1D-334)`.
- [x] 1.8 (TDD estricto) `dataset_diagnostico.py`, `config_diagnostico.py` (`pares_minimos`, `nli_banda_inferior`,
      `nli_ancho_de_tramo`; RN-22, sin constantes locales), `corrida_diagnostico.py`, familia `diagnostico` en
      `config_suite.py`, `evaluate.py` y `esquema_suite.py` (fuera de `all`); `eval/configs/diagnostico-fake.yaml` y
      `diagnostico-local.yaml`; configuración por defecto en `scripts/eval/evaluate.mjs` con su test. Commit
      `feat(L1D-334)`.
- [x] 1.9 (test después) Humo del proceso real: `node scripts/eval/evaluate.mjs --suite diagnostico` sale con 0 y
      escribe el informe en un directorio temporal; tiempo máximo explícito del test (60 s, no los 5 s por defecto).
- [x] 1.10 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-334)` (Extract Method del armado del informe y del Markdown).

## 2. evaluación

- [x] 2.1 (suite `evaluate`) `run-ai-eval`: confirmar que `--suite all` da el mismo `data/evaluation/baseline.json` y la
      misma huella de `test-fake.yaml`, y que `--suite diagnostico` con `diagnostico-fake.yaml` sale con 0.
- [ ] 2.2 (suite `evaluate`) DIFERIDA -> H-1 (corrida base del S7). Ejecutar `evaluate --config
      eval/configs/diagnostico-local.yaml --suite diagnostico` con los modelos locales de ADR-39 sobre el corpus del
      dataset `s5-corpus-ampliado` en memoria (`[S7 resp. 10]`) y con los umbrales actuales (`[S7 resp. 11]`); el
      informe registra ambos; lo corre `ai-eval-runner` y el informe queda en `reports/eval/l1d-334-diagnostico-etapas-recuperacion.{json,md}`.
      Ninguna cifra se cita antes de ese informe.

## 3. Verificación

- [x] 3.1 Pytest de `tests/evaluation` y la suite de `apps/rag-orchestrator` en verde; `ruff` y `lint-imports` limpios;
      `openspec validate l1d-334-diagnostico-etapas-recuperacion --strict`. Sin cambios de API: `contracts:verify-provider`
      no aplica.
- [ ] 3.2 CI del PR en verde (incluidos `data-scan` y `dataset-class-check` sobre `data/eval/parafrasis-v1/`): 0 checks
      en fallo, 0 pendientes y 0 alertas antes de pedir el merge.

## humano

- [ ] H-1 DIFERIDA -> H-1: en la corrida base del S7 (`[S7 resp. 2]`), con un solo `ollama serve` y
  `OLLAMA_CONTEXT_LENGTH=8192`, lanzar la medición 2.2 con `ai-eval-runner` y versionar el informe en `reports/eval/`
  (ruta protegida). Bloque literal del comando:

```bash
cd apps/rag-orchestrator && python -m app.evaluation.evaluate \
  --config eval/configs/diagnostico-local.yaml --suite diagnostico --salida ../../reports/eval \
  --nombre-archivo l1d-334-diagnostico-etapas-recuperacion
```

- [ ] H-2 DIFERIDA -> H-2: decidir los dos «Pendientes de definir» que siguen abiertos en `design.md` (lectura de D2 y
  categoría `sin_asignar`) en `/sprint-start S7`. El corpus de la medición real ya está decidido (`[S7 resp. 10]`).
