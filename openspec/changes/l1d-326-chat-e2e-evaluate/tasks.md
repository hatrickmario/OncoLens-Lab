# Tasks — l1d-326-chat-e2e-evaluate

## 1. contratos

- [x] 1.1 Añadir `contracts/examples/chat-turn-*-prostata.json` (caso, faltantes, relevancia, evidencia, fuentes) donde
  las historias hermanas solo dejaron ejemplos de mama; sintéticos, aviso RN-19 literal sin punto final, sin vocabulario de
  recomendación · test después · verificación: validan contra `ChatTurnResponse` y `contracts:check` en verde; commit
  `contract(L1D-326)`
 · evidencia: commit `contract(L1D-326)` 4c343099: 10 ejemplos `chat-turn-*-prostata.json` (caso, faltantes, relevancia, evidencia, fuentes y sus peticiones) con entradas en `index.json`; `node scripts/contracts/check.mjs` sin hallazgos (33 reglas); el de evidencia deja `synthesis` vacío como el de mama (`assertClaimsAnchored`); el de fuentes usa `FUENTE-EXCLUIDA-1/2`.
## 2. ai-services

- [x] 2.1 Crear `data/eval/chat-v1/manifest.yaml` y `casos.yaml` (≥ 12 casos AC01…AC06 × mama/próstata, `clase:
  sintetico`, hechos por clave del seed, faltantes sembrados con `gapType`, `revision_oncologo: pendiente`, marcador
  `{identidad_sintetica:P-CHAT}`) · test después · verificación: escaneo de PII local sin hallazgos · evidencia: `data/eval/chat-v1/` con 13 casos (12 AC01…AC06 x mama/próstata + `CHAT-AC01-MAMA-PII`), 2 controles prescriptivos y `faltantes_sembrados` de `paciente-chat`, `paciente-b` y `paciente-e`; escaneo de PII: ver el cierre de verificación de este PR.
- [x] 2.2 Test en rojo: «rechaza chat-v1 sin cobertura AC01…AC06 por tipo de cáncer [US-269 AC-2]» y «rechaza un caso sin
  revision_oncologo [US-269 AC-8]» (Pytest sobre `dataset_chat.py` con esqueleto `NotImplementedError`) · TDD estricto ·
  commit `test(L1D-326)` · evidencia: commit a7a6f9b4 (rojo: 3 failed con `NotImplementedError`).
- [x] 2.3 Implementar `app/evaluation/dataset_chat.py` (reusa `dataset_loader`/`fuente_dataset`, exige `clase: sintetico`)
  · commit `feat(L1D-326)` · verificación: 2.2 en verde · evidencia: commit d39c9b39: `pytest tests/evaluation/test_dataset_chat.py` 8 passed.
- [x] 2.4 Test de aceptación en rojo con `eval/configs/chat-fake.yaml` y los guiones FX-12-e: «publica soporte NLI,
  precisión de enlaces y hechos presentes por tipo de cáncer [US-269 AC-3]», «publica 0 salidas prescriptivas y no
  muestra CHAT-PRESCRIPTIVO [US-269 AC-5]», «publica 0 apariciones de identidad en el estado del hilo y los logs
  [US-269 AC-6]», «publica p95 por intención sin cambiar el código de salida [US-269 AC-7]» y «sin casos aprobados nada
  sale validada y lista los pendientes [US-269 AC-8]» · integración (grafo de producción en proceso, adapters falsos,
  reloj simulado) · TDD estricto · commit `test(L1D-326)` · evidencia: commit 86e9a519 (rojo: 8 failed con `NotImplementedError`; el esqueleto `NotImplementedError` es el de `chat.py`).
- [x] 2.5 Implementar `app/evaluation/chat.py` (patrón de `seguimiento.py`: grafo de producción + guion de LLM; reusa
  `juez_fidelidad`/NLI, `lenguaje_estricto`, `informe_pii`, `cronometro`, `rotulo`); unitarios uno a la vez para la
  precisión de enlaces y el conteo de omitidas · commit `feat(L1D-326)` · verificación: 2.4 en verde · evidencia: commit b319f49a y 6c2014c9: `pytest tests/evaluation/test_chat_evaluate.py test_chat_evaluate_unitarios.py` 17 passed (precisión de enlaces 4/5 y omitidas aparte, incluidas).
- [x] 2.6 `eval/configs/chat-local.yaml` (lista cerrada de proveedores locales, sin nube) · test después · verificación:
  `chequeo_config` en verde · evidencia: `chat-local.yaml` carga con `cargar_config_suite`, `exigir_proveedor_local` en verde y aborta con host de nube (test); sin pesos la CLI termina con código 2 nombrando variables; `python -m app.scripts.adr39_measure --check-config` en verde. La corrida real queda en 5.1 (orquestador).
- [x] 2.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(L1D-326)`
 · evidencia: commit 2a2acc64 `refactor(L1D-326)`: Extract Method `chat.py:_registrar_control` y `_registrar_turno_del_caso`; tests en verde antes y después.
- [x] 2.8 (añadida por D6-34, destino L1D-326) `FakeChatTurn` sirve la variante de próstata (caso, faltantes, fuentes) por el tipo de cáncer del contexto y el ejemplo de relevancia del dato que nombra «¿Por qué importa…?» (Ki-67, estado menopáusico, HRR/BRCA; otro dato, fuera del catálogo) · TDD estricto · commits `test(L1D-326)` 0abb1be4 (7 failed en la aserción) y `feat(L1D-326)` f9447f84 (`test_chat_turn_fake*.py` 34 passed). El ejemplo de caso con `factRef` en HER2 de D6-34 ya está en `chat-turn-caso-ok.json` (f2): sin cambio.
- [x] 2.9 (añadida por D6-37, destino L1D-326) `parametros_de_recuperacion` y `PuertosLocales` fijan `reranker_max_pairs` como el *bootstrap* de producción · test después · commit 6bb2c304 (`test_reranker_max_pairs_de_la_suite.py` 2 passed)
- [ ] 2.10 DIFERIDA -> D6-33: suite `evaluate` propia del loop contextual (ADR-52, apagado por defecto) y dataset de etiquetas de pertinencia con script de medición versionado; el nodo de relevancia ya queda cubierto por los casos AC04 de `chat-v1`, el loop contextual no

## 3. clinical-platform

- [ ] 3.1 Test de aceptación en rojo: «la pregunta FX-12-d no deja nombre, documento ni fecha de nacimiento en los
  cuerpos hacia /chat/turn [US-269 AC-6]» (Supertest + PostgreSQL real + MSW que captura) · TDD estricto · commit
  `test(L1D-326)` · si ya pasa con lo de las hermanas, se registra como regresión y no requiere `feat`
- [ ] 3.2 Test de aceptación en rojo: «publica sensibilidad, especificidad y exactitud de gapType 4/4 para P-CHAT con
  FX-12-c [US-269 AC-4]» y «resuelve el marcador de identidad y escribe peticiones desidentificadas [US-269 AC-6]»
  (integración con BD de test y seed) · TDD estricto · commit `test(L1D-326)`
- [ ] 3.3 Implementar `scripts/eval-chat-preparar.ts` (`npm run eval:chat-preparar`): seed en BD de test, se niega con
  `REAL_*_ENABLED` o entorno `piloto`, arma `ChatTurnRequest` con el pipeline de producción, traduce claves del seed a
  `factRefs`, calcula M-04.1/M-04.2/`gapType`, escribe en `apps/clinical-api/eval/results/tmp/` · commit `feat(L1D-326)` · verificación:
  3.2 en verde
- [ ] 3.4 Script raíz `npm run evaluate:chat` que encadena 3.3 y 2.5 y combina los agregados en
  `reports/eval/l1d-326-chat-v1.json`; añadir `data/eval/chat-v1/`, prompts y nodos del chat a las rutas de
  `eval-required` de la CI · test después · verificación: fixture de PR que dispara `eval-required`
- [ ] 3.5 Añadir `apps/clinical-api/eval/results/tmp/` al `.gitignore` raíz (hoy solo está `apps/rag-orchestrator/eval/results/`) · test después · verificación: tras `npm run eval:chat-preparar`, `git status --porcelain` no lista nada bajo `apps/clinical-api/eval/results/tmp/`; mismo commit que 3.3
- [ ] 3.6 Refactor en los archivos tocados, tests en verde antes y después, commit `refactor(L1D-326)`

## 4. frontend

- [ ] 4.1 Test E2E `apps/web/e2e/chat-ac01-ac06.spec.ts`: «recorre AC01…AC06 con el paciente (a) con intent, ≥ 1 `factRef` en los bloques `documentado`, `interpretacion` y `conflicto` y ≥ 1 cita en los `evidencia` (los `faltante`, `catalogo`, `limitacion` y `fuente` son deterministas y exentos, glosario §3)
  y avisos RN-19 sin punto final [US-269 AC-1]», ídem con el paciente (b), y «0 apariciones de la identidad sintética en
  los logs de Compose tras FX-12-d [US-269 AC-6]» (reusa `buscar-secretos.ts`) · Playwright contra Compose,
  `LLM_PROVIDER=fake` · verificación: verde en la CI (`retries: 1` solo en CI, con *trace*)

## 5. evaluación

- [ ] 5.1 `run-ai-eval` con `chat-fake.yaml` (CI) y `chat-local.yaml` (modelos locales, junto con la corrida nocturna
  `[S6 resp. 12]`): reporte de `ai-eval-runner` en `reports/eval/l1d-326-chat-v1.md` con M-02.x, M-04.x, RN-23 = 0, no
  fuga = 0, p95 por intención y casos pendientes de revisión

## 6. cierre

- [ ] 6.1 Registrar en el cierre del S6 la deuda de los casos `revision_oncologo: pendiente` `[S6 resp. 12]` y la
  latencia medida para la revisión de ADR-51
- [ ] 6.2 `openspec validate l1d-326-chat-e2e-evaluate --strict` en verde
- [ ] 6.3 Suites de `rag-orchestrator` (`pytest`), `clinical-api` (`vitest`) y E2E en verde; `contracts:check` sin
  incompatibles
- [ ] 6.4 Gate 2 con `privacy-guardian`, `clinical-language-auditor`, `contract-keeper` y `design-principles-reviewer`
