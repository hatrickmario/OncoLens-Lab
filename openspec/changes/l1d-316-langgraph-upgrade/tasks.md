# Tasks — l1d-316-langgraph-upgrade

> Residual de L1D-316 (US-259), hora 0 del S7 (hueco B2, `[S7 resp. 5]`). Matriz TDD: dependencia y
> configuración → **test después** (la suite existente del chat es el test; ninguna aserción cambia).
> Sin cambios de API (no hay `## contratos`), de specs (`skip_specs: true`) ni de IA (no hay
> `## evaluación`). Rama `feat/l1d-316-langgraph-upgrade`; PR `[L1D-316] langgraph 1.2.14 cierra la
> alerta #9 de Dependabot`.

## 1. ai-services

- [x] 1.1 Leer las notas de versión de `langgraph` 1.2.11–1.2.14 y anotar en el PR cualquier cambio
      que toque `StateGraph`, `BaseCheckpointSaver`, `InMemorySaver` o `JsonPlusSerializer` · **exento**
      Evidencia: notas de 1.2.11–1.2.14 revisadas; sin cambios en `StateGraph`, `BaseCheckpointSaver`, `InMemorySaver` ni `JsonPlusSerializer` (los fixes de `DeltaChannel`/`update_state`/`get_state` y `trace_policy`/`response_schema` no se usan aquí; 1.2.14 solo el release).

- [x] 1.2 Línea base: con `langgraph==1.2.10`, correr la suite del chat (`pytest tests/unit -k chat`,
      `tests/integration -k "chat_turn or telemetria"`) y guardar el resultado · **test después**
      Evidencia: línea base con 1.2.10, suite completa de `tests`: 5109 passed, 193 deselected.

- [x] 1.3 `apps/rag-orchestrator/requirements.txt`: `langgraph==1.2.10` → `langgraph==1.2.14`.
      Comprobar con `pip install --only-binary=:all: --dry-run -r requirements.txt` (o el diff de
      `pip freeze`) que no cambia ni entra ningún otro paquete (design D1; RN-12) · **test después**
      Evidencia: `pip install --dry-run` → «Would install langgraph-1.2.14»; diff de `pip freeze` solo en `langgraph`.

- [x] 1.4 Con 1.2.14 instalado: suite completa de `rag-orchestrator` (unitarios e integración) en
      verde, sin cambiar aserciones ni desactivar tests; mismos tests que en 1.2; además
      `infra/docker/__tests__/compose-telemetria-rag.test.mjs` · **test después** `[US-259]`
      Evidencia: con 1.2.14, 5109 passed, 193 deselected (misma suite, sin cambios de aserciones); `compose-telemetria-rag.test.mjs` 2 passed.

- [x] 1.5 Solo si 1.4 queda en rojo por la librería: ajuste mínimo en `app/application/chat/grafo.py`
      o `registro_de_hilos.py` sin cambiar comportamiento especificado. Si el arreglo cambia un
      escenario de `patient-chat` o no cabe en la hora 0, **detenerse** y reportar al orquestador
      (repliegue D3). Si 1.4 pasa, se marca hecha con la nota «no aplica» · **test después**
      No aplica: 1.4 pasó en verde.

- [x] 1.6 `scripts/ci/auditar-dependencias.sh` en verde (tiempo máximo explícito si se lanza desde un
      test) y commit `fix(deps)` con `L1D-316` en el cuerpo · **test después** `[US-217]`
      Evidencia: `auditar-dependencias.sh` → «sin avisos bloqueantes».

- [x] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-316). Si solo se tocó
      `requirements.txt`, se marca hecha con la nota «sin código tocado»
      Sin código tocado.

## 2. Verificación de las alertas (solo lectura)

- [ ] 2.1 TRASLADADA a orquestador, entrega 1 (CI del PR) · Antes de pedir el merge: CI del PR con 0 checks en fallo y 0 pendientes; la alerta #8
      (`minimatch`) sigue en estado `fixed` (design D4) · **exento**
- [ ] 2.2 DIFERIDA a entrega 2 (tras el merge; verificación de la alerta #9) · Tras el merge: `gh api repos/hatrickmario/OncoLens-Lab/dependabot/alerts/9` devuelve
      `state: fixed` y no hay alertas abiertas; dejar la evidencia en el PR · **exento**

## humano

Los agentes no descartan alertas ni cambian la configuración de seguridad del repositorio.

- [ ] H-1 DIFERIDA -> H-1 (solo repliegue D3) · Solo en el repliegue (design D3): descartar la alerta #9 en GitHub con el motivo «el código
      vulnerable no se usa» y el texto literal de design D3. No aplica si 2.2 da `fixed`
      DIFERIDA -> H-1

## Cierre

- [x] `openspec validate l1d-316-langgraph-upgrade --strict`, tests de `ai-services` en verde; sin
      `contracts:verify-provider` ni `run-ai-eval` (no aplican)
