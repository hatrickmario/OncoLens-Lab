# Tasks — l1d-113-faltantes-desconocido-prompt

> Rama `feat/l1d-113-faltantes-desconocido-prompt`, PR **individual** `[L1D-113] …` (D-12 `[S5 resp. 7]`: toca la
> validación de RN-11). Implementa `ai-services-dev`. TDD estricto en la validación (RN-11), el bloque del prompt y la
> consulta (reglas con lógica y endpoint); el texto del prompt y su efecto en la calidad, con `evaluate` (informe de
> `ai-eval-runner`). Mocks solo en los bordes (LLM, embeddings, búsqueda, NLI falsos en su puerto); nunca módulos propios.
> Sin conflicto con `l1d-79` (US-093): no toca `rag-orchestrator`; `rag-query@0.7.0` es la versión definitiva.

## contratos

- [x] 0.1 Sin cambio de contrato (ADR-26): confirmar que `apps/rag-orchestrator/openapi.yaml`,
  `apps/clinical-api/openapi.yaml` y `contracts/examples/` no cambian (`currentLine`, `missingCriticalData` y
  `ErrorValidacion` ya existen); `npm run contracts:check` y `contracts:breaking` en verde al final. Si `contract-keeper`
  pide documentar el nuevo motivo del `422`, solo la **descripción**, en un commit `contract(L1D-113)` antes de 1.1 · test
  después

## ai-services

### Lector de etiquetas y validación de claves (AC-3)

- [x] 1.1 Test de aceptación en rojo: «responde 422 CUERPO_INVALIDO sin eco ni puertos invocados cuando un faltante es
  texto libre [US-116 AC-3]», «… cuando la clave no es del catálogo del tipo [US-116 AC-3]» y «responde 409 y no 422 con
  otra versión del catálogo [US-116 AC-3]» · integración (`TestClient`, adapters falsos con contador, validación contra
  `ErrorValidacion` del spec) · commit `test(L1D-113)` (esqueletos con `raise NotImplementedError` si el símbolo no existe)
  · TDD estricto
- [x] 1.2 Adapter `app/infrastructure/catalogo_clinico/datos_criticos.py` (lectura única al arranque, Pydantic estricto,
  fallo cerrado `CatalogoNoDisponible`), puerto `EtiquetasDeDatosCriticos` en `app/application/ports.py` y cableado en
  `bootstrap.py`; comprobar que los catálogos de test (`test-1.0.0`, `test-apl-*`) y los ejemplos de `contracts/examples/`
  solo usan claves catalogadas. Unitarios uno a la vez · commit `feat(L1D-113)` · TDD estricto
- [x] 1.3 Regla pura `claves_de_faltantes_invalidas()` en `app/domain/` (índices, nunca valores), `FaltanteNoCatalogadoError`
  en `app/application/errores.py`, su manejador `422` sin eco en `app/api/errors.py` y la llamada en
  `RAGOrchestratorService.consultar()` tras el `409` y el tipo de cáncer, antes de todo puerto; log solo con `traceId` y
  conteo. Unitarios uno a la vez · commit `feat(L1D-113)` · TDD estricto

### Prompt y consulta (AC-1, AC-2, AC-5)

- [x] 2.1 Test de aceptación en rojo: «el bloque de datos contiene Estado menopáusico: desconocido y Ki-67: desconocido
  dentro de los delimitadores [US-116 AC-1]», «sin faltantes no aparece ninguna línea desconocido [US-116 AC-5]» y
  `meta.promptVersion = rag-query@0.7.0` · integración (`TestClient` + LLM falso que captura el prompt) · commit
  `test(L1D-113)` · TDD estricto
- [x] 2.2 Test de aceptación en rojo: «la consulta de recuperación incluye línea de tratamiento 1 y ningún valor faltante
  [US-116 AC-2]» y «sin línea actual no añade línea [US-116 AC-2]» · unitario del resumen + integración (embedder falso que
  captura los textos embebidos) · commit `test(L1D-113)` · TDD estricto
- [x] 2.3 `app/prompts/rag_query.py`: `faltantes_del_contexto()` hermana de `datos_del_contexto()` (que no cambia),
  `bloque_de_datos_del_paciente(contexto, etiquetas)` con las líneas `- <etiqueta>: desconocido` tras los datos presentes,
  instrucción en positivo sobre «desconocido», `VALOR_DESCONOCIDO` y `VERSION_DEL_PROMPT = "rag-query@0.7.0"` (definitiva);
  la instrucción usa el vocabulario «sin dato registrado (desconocido)», nunca «no disponibles»; `generation.py` pasa las etiquetas. Actualizar `tests/unit/test_prompt_rag_query.py` y
  `test_rag_query_procedencia_en_prompt.py` solo en la versión esperada (sin relajar aserciones). Unitarios uno a la vez ·
  commit `feat(L1D-113)` · TDD estricto. *Hecho (desviación menor, ver design.md §Desviaciones):* las etiquetas se resuelven en
  `RAGOrchestratorService` y viajan en `ResultadoDeRecuperacion.etiquetas_de_faltantes`; `bloque_de_datos_del_paciente(contexto,
  faltantes=())` recibe etiquetas ya validadas y `app/prompts/` no importa puertos; el prompt de seguimiento no cambia.
- [x] 2.4 `app/application/resumen_contexto.py`: añadir `línea de tratamiento {n}` (literal P-1, Decidido (usuario, 2026-11-03)) con
  `currentLine` no nulo; nada por los faltantes. Unitarios uno a la vez · commit `feat(L1D-113)` · TDD estricto

### Regresiones (AC-4)

- [x] 3.1 Test de aceptación: «faltantes con Q-SIN responden sin_evidencia con cero invocaciones del LLM de generación y la
  reescritura sin faltantes [US-116 AC-4]» (FX-06a-a, FX-06a-b, FX-06b-a); debe pasar sin código nuevo — si queda en rojo,
  es un bug de 1.3/2.x · integración · commit `test(L1D-113)` · TDD estricto
- [x] 3.2 Regresión [RN-02] → US-055/US-238, [RN-11] → US-049, [RN-07] (procedencia en el prompt) y [RN-23] (plantilla sin
  términos prohibidos): `pytest` completo de `rag-orchestrator` en verde · test después
- [x] 3.3 Refactor en verde (Extract Function / Rename) en los archivos tocados, sin cambiar aserciones · commit
  `refactor(L1D-113)`

## evaluación

- [x] 4.1 Dataset: casos sintéticos con `currentLine` y con faltantes declarados (mama y próstata) en el dataset de
  `evaluate`, con la expectativa de no inferencia (ningún valor atribuido al dato faltante). Todo sintético, sin NCCN ni
  ESMO (RN-21) · evaluate. *Hecho:* `S5-L01…L05` en `data/eval/s5-corpus-ampliado` (mama y próstata, 4 con evidencia y 1 sin
  evidencia; la suite lee `contexto: {linea_actual, faltantes}` por pregunta y arma `currentLine` y `missingCriticalData`).
- [x] 4.2 `run-ai-eval` en la CI con fakes: sin regresión de fidelidad, citas, «sin evidencia» ni salidas prescriptivas
  (= 0) frente al baseline · evaluate. *Evidencia:* `node scripts/ci/eval-required.mjs --base origin/main` → «sin regresión
  contra data/evaluation/baseline.json (tolerancia 0)»; `baseline.json` regenerado (solo cambia `promptVersion`
  `rag-query@0.7.0`). El informe de `ai-eval-runner` en `reports/eval/` (protegido para el implementador) es H-1.
- [ ] 4.3 DIFERIDA -> D5-24. **Con modelos locales** (P-2, decidido: entra): en la **corrida nocturna única del cierre del día 2** (`S5-refinamiento.md` §5),
  recall@10/MRR de la rama dense con y sin `currentLine`, fidelidad y no inferencia con faltantes; informe en
  `reports/eval/`. Destino D5-24 (fila propuesta para `S5-deuda.md`; el orquestador la añade y la asocia a la corrida
  nocturna con D5-06/D5-08/D5-13). Nunca `[x]` sin informe. Si recall retrocede, se ajusta el literal de P-1, no la regla ·
  evaluate

## Cierre

- [x] 5.1 `openspec validate l1d-113-faltantes-desconocido-prompt --strict` en verde (evidencia en el reporte de entrega).
- [ ] 5.2 DIFERIDA -> H-2. Gate 2 con `privacy-guardian`, `clinical-language-auditor`, `contract-keeper` y `design-principles-reviewer`; CI con
  0 checks en fallo, 0 pendientes y 0 alertas antes de pedir el merge (lo corre el orquestador)

## humano

Sin cambio en `.env.example`: este change no añade variables de configuración (el literal «línea de tratamiento» y el texto
del prompt van versionados en código, no son RN-22; `CLINICAL_CATALOG_PATH` ya existe).

- [ ] H-1 Informe de `ai-eval-runner` (CI con fakes) en `reports/eval/`, adjunto al PR. DIFERIDA -> H-1. Bloque literal:

```
node scripts/ci/eval-required.mjs --base origin/main
# esperado: «sin regresión contra data/evaluation/baseline.json (tolerancia 0)»; test-fake igual a su baseline con
# promptVersion rag-query@0.7.0; salidas prescriptivas = 0
```

- [ ] H-2 Gate 2 y CI verde antes del merge (tarea 5.2). DIFERIDA -> H-2.
