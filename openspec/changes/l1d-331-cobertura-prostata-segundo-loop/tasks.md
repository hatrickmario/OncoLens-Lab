# Tasks — l1d-331-cobertura-prostata-segundo-loop

Alcance residual de L1D-331 (US-273): AC-2 (medición) y AC-3 (su test). Dos ventanas:
**(a) parte de código (1.1–1.5, 1.7 y 2.1): después de `l1d-329`, que crea la familia `contextual`, y antes de la
corrida base**, porque el reporte base (2.2, H-1) necesita el caso `prostata-con-psa-y-hrr`, el top-3 y la meta;
**(b) después de la corrida base:** el cambio condicional de composición (1.6) y la medición final (2.3). Orden de los
archivos de la suite (propuesta de planificación): `l1d-334` → `l1d-329` → este change (parte de código) → `l1d-336` →
`l1d-335` → `l1d-337`. Corpus: dataset `s5-corpus-ampliado` en memoria, el mismo en base y final (`[S7 resp. 10]`);
umbrales actuales (`[S7 resp. 11]`). Sin cambios de API: no hay sección `## contratos`. Mocks solo en
los bordes (embeddings, *reranker*, LLM, NLI, Milvus); nunca módulos propios. Reloj y semillas inyectados.
**Ninguna cifra se cita sin reporte versionado en `reports/eval/` producido por `run-ai-eval`.**

## 1. ai-services · parte de código (después de `l1d-329`, antes de la corrida base)

- [x] 1.1 (TDD estricto) Test de aceptación: «envía solo términos del catálogo y no registra valores cuando el caso de
      próstata trae texto libre sembrado, `pseudoPatientId`, PSA con valor y un biomarcador con valor fuera del catálogo
      [US-273 AC-3]» · integración, `tests/integration/test_rag_query_contextual.py`, `@pytest.mark.ac("US-273", 3)`;
      comprueba la consulta del embedder y del *reranker* y los *logs* (`caplog`, evento
      `rag_query_expansion_contextual`). Commit `test(L1D-331)`. Si nace en verde (el comportamiento es del S6), el PR
      lo declara y aquí se anota la mutación local sin commitear que lo pone en rojo (design D1, P-2).
      **Nació en verde** (commit `49500320`, sin commit `feat`). Mutación local (sin commitear, revertida): en
      `app/domain/terminos_del_caso.py::_del_biomarcador_principal`, devolver `(biomarcador.termino, del_caso[biomarcador.nombre])`
      en vez de solo el valor del catálogo; el test falla en la aserción
      (`... ISUP 3 HRR` frente a `... ISUP 3 HRR SENTINELA-VALOR-FUERA-DEL-CATALOGO`), igual que el de US-271 AC-6.
- [x] 1.2 (TDD estricto) Test de aceptación en rojo: «da por caso de próstata las genéricas con evidencia sobre 22, el
      top-3 por pregunta y los campos usados cuando se ejecuta la medición del loop contextual con adapters falsos
      [US-273 AC-2]» · integración del runner con `eval/configs/contextual-fake.yaml`; incluye el caso sin términos del
      catálogo (`null`, nunca `0.0`) y que el reporte no contiene texto de preguntas, consultas ni chunks. Esqueletos
      con `raise NotImplementedError`. Commit `test(L1D-331)`. ⛔ `l1d-329-segundo-loop-ac9-reporte` en `main`.
      Va antes de la corrida base, como 1.3, 1.4 y 1.5.
- [x] 1.3 (TDD estricto) Test de aceptación en rojo: «marca el caso como no cumplido con la meta leída de la
      configuración y señala cada métrica que empeora frente al reporte base cuando la cobertura queda por debajo
      [US-273 AC-2]» · incluye adversarias en `sin_evidencia` con `topRelevanceScore` `null` y 0 llamadas al LLM de
      generación, y 0 falsos positivos en las 24. Commit `test(L1D-331)`.
- [x] 1.4 (TDD estricto) Implementar sobre la familia `contextual`: `prostata-con-psa-y-hrr` en `contextual.casos`
      (junto a `prostata-con-grado`, del fixture `temas-del-caso.json`), top-3 por pregunta, métrica pura
      `genericas_con_evidencia_por_caso()` y comparación con el reporte base en `app/evaluation/metricas/contextual.py`;
      clave `contextual.genericas_con_evidencia_minimo` (RN-22, sin constante local) en `config_contextual.py`,
      `contextual-fake.yaml` y `contextual-local.yaml`. Unitarios uno a la vez.
      «Con evidencia» se lee de la respuesta del servicio; no se reaplica el umbral. El reporte conserva el registro
      del corpus, del catálogo y de los umbrales que deja `l1d-329` (`[S7 resp. 10]`, `[S7 resp. 11]`) y la comparación
      con el reporte base se niega si el corpus no coincide. Commit `feat(L1D-331)`.
- [x] 1.5 (test después) Humo del proceso real: `node scripts/eval/evaluate.mjs --suite contextual` con los casos de
      próstata sale con 0 y escribe el reporte en un directorio temporal; tiempo máximo explícito del
      test (60 s, no los 5 s por defecto).
- [x] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-331)`.

## 2. evaluación · corrida base

- [x] 2.1 (suite `evaluate`) `run-ai-eval` con adapters falsos: `--suite all` da el mismo
      `data/evaluation/baseline.json` y `--suite contextual` con los casos de próstata sale con 0.
- [ ] 2.2 (suite `evaluate`) DIFERIDA -> H-1 (corrida base del S7). `evaluate --config
      eval/configs/contextual-local.yaml --suite contextual` con los modelos locales de ADR-39, con los dos casos de próstata y las 60 preguntas, sobre el corpus del dataset `s5-corpus-ampliado` (`[S7 resp. 10]`); `ai-eval-runner`. Requiere 1.2–1.5 en `main`. Con el diagnóstico
      de L1D-334, anotar en el reporte la etapa que pierde las genéricas.

## 1b. ai-services · composición condicional (después de la corrida base)

- [ ] 1.6 DIFERIDA -> H-1 (condicional; TDD estricto; **después de la corrida base**, en un PR propio) Solo si el usuario elige la opción B o C del design D5 tras la corrida base:
      primero `/opsx:update` con el delta `MODIFIED` de `evidence-analysis` (y `clinical-catalogs` en C) y Gate 1;
      después test de aceptación en rojo `[US-273 AC-2]` `[US-273 AC-5]` (mama idéntica) y la implementación en
      `app/domain/expansion_contextual.py` o `app/domain/terminos_del_caso.py`. En C, versión nueva del catálogo
      **después** de `l1d-335` (1.10.0) y de `l1d-126` parte B (1.11.0), con `catalog:validate` y `catalog:version-guard`. Si se elige A, se marca
      «no aplica: opción A» con la referencia al reporte.

## 2b. evaluación · corrida final

- [ ] 2.3 (suite `evaluate`) DIFERIDA -> H-2 (corrida final del S7). La misma medición, sobre el mismo corpus
      (`[S7 resp. 10]`) y con los umbrales actuales (`[S7 resp. 11]`), con el catálogo ya mergeado (L1D-335, L1D-126)
      y, si se eligió, la opción B o C; comparación contra el reporte de 2.2. Los brazos de US-278 y US-279 se miden
      sobre la ingesta de `l1d-119`, no en esta familia. Las suites
      `rn23-local.yaml --suite all` y `s5.yaml --suite opciones` no aplican: no se toca generación ni prompts.
- [ ] 2.4 DIFERIDA -> H-3 (decisión del usuario sobre D6-57 con el reporte de 2.3).

## 3. verificación

- [x] 3.1 Pytest de `apps/rag-orchestrator` en verde; `ruff` y `lint-imports` limpios;
      `openspec validate l1d-331-cobertura-prostata-segundo-loop --strict`.
- [ ] 3.2 TRASLADADA a orquestador (entrega 1, tras la CI del PR): CI del PR en verde: 0 checks en fallo, 0 pendientes y 0 alertas antes de pedir el merge.

## humano

- [ ] H-1 DIFERIDA -> H-1: en la corrida base del S7 (`[S7 resp. 2]`), con un solo `ollama serve`, sin Docker en
  paralelo, lanzar 2.2 con `ai-eval-runner` y versionar el reporte en `reports/eval/` (ruta protegida). Bloque literal:
  `reports/eval/l1d-331-cobertura-prostata-segundo-loop.base.{json,md}`. Con ese reporte, elegir la opción A, B o C
  (design D5, P-4).
- [ ] H-2 DIFERIDA -> H-2: en la corrida final del S7, lanzar 2.3 y versionar
  `reports/eval/l1d-331-cobertura-prostata-segundo-loop.final.{json,md}`.
- [ ] H-3 DIFERIDA -> H-3: decidir el criterio de cobertura de próstata (D6-57) sobre el reporte de H-2 y, si cambia el
  AC-2, actualizar primero `backlog/features/FEAT-12-chatbot-mvp.md` y después Linear (lo hace la sesión principal).
