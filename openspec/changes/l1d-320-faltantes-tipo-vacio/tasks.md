# Tasks — l1d-320-faltantes-tipo-vacio

> Rama `feat/l1d-320-faltantes-tipo-vacio`, PR `[L1D-320] Chat: faltantes clasificados por tipo de vacío`. Rebasa sobre
> `l1d-316-chat-turn-langgraph` y `l1d-315-conversacion-paciente` (seed `P-CHAT`). Secuencia: contract → test → feat → refactor.
> Vocabulario vinculante: `backlog/sprints/S6-glosario-chat.md`.

## 1. contratos

- [x] 1.1 (exento · contract-first, skill `sync-contracts`) `apps/clinical-api/openapi.yaml` 1.24.0 → 1.25.0 (glosario §1): `gapType` (nullable, enum `no_encontrado|incompleto|por_conciliar|no_buscado`) en `CompletenessItem`; actualizar los ejemplos existentes de `/completeness`
- [x] 1.2 `apps/rag-orchestrator/openapi.yaml` sin cambios: `gapType`, `catalogVersion` y el `409` ya están en la 1.12.0 de `l1d-316`; `sourceDocumentTypes` no viaja
- [x] 1.3 Ejemplos `contracts/examples/completeness-gap-type-p-chat.json`, `chat-turn-faltantes.json`, `chat-turn-faltantes-ninguno.json`; el `409` de `/chat/turn` reutiliza el existente `rag-catalog-version-mismatch.json` (lo usa también l1d-316), sin crear `chat-turn-catalog-version-mismatch.json`
- [x] 1.4 `contracts:check`, `contracts:breaking` (0 incompatibles), `contracts:generate`; commit `contract(L1D-320)`

## 2. clinical-platform

- [x] 2.1 (test después · catálogo) Test del validador: un ítem sin `sourceDocumentTypes` o con un valor fuera del enum hace fallar `catalog:validate` nombrando el ítem [US-263 AC-1]
- [x] 2.2 (catálogo) `schemas/datos-criticos.schema.json` con `sourceDocumentTypes` en `required`; `sourceDocumentTypes` en todos los ítems de `mama/` y `prostata/datos-criticos.json` según design §Decisions 3 (mapeo con `estado = "propuesta"` hasta DEC-01); manifest 1.5.0 → 1.6.0, `datos-criticos` con versión de fichero nueva y `catalogHash` recalculado si aplica; fixture FX-12-c en `test/fixtures/`; actualizar referencias a `1.5.0` en configuración, Compose, tests y el `catalogVersion` de los ejemplos `contracts/examples/chat-turn-request*.json` (de l1d-316 y l1d-322); `catalog:validate` en verde
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: `/completeness` de `P-CHAT` con FX-12-c devuelve Ki-67 `no_buscado`, menopausia `no_encontrado`, RE `incompleto`, TNM `por_conciliar` y `null` en los verificados [US-263 AC-2] · Supertest + PostgreSQL real; commit `test(L1D-320)`
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: Ki-67 sigue `no_buscado` con `D-EX-1` en `ocr_status = error` [US-263 AC-3] · Supertest + BD real; commit `test(L1D-320)`
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: para cada paciente semilla, el `completeness[]` capturado con MSW hacia `/chat/turn` coincide con `/completeness`; `presente_sin_verificar` sin conflicto vigente → `incompleto` y con conflicto → `por_conciliar`; `faltante` con menos registros que `minValues` → `incompleto` y sin registros → `no_buscado`/`no_encontrado`; cada ítem con `gapType` una vez; ningún `no_aplica` [US-263 AC-5] [S6 resp. 17] · Supertest + BD real + MSW; commit `test(L1D-320)`
- [x] 2.6 (TDD estricto) Test de aceptación en rojo con el catálogo 1.6.0 (el mapeo es de l1d-315): `409 ErrorCatalogVersionMismatch` y sin fila nueva en `clinical.conversation_turn` cuando `/chat/turn` responde `409` [US-263 AC-7] · Supertest + BD real + MSW desde `contracts/examples/rag-catalog-version-mismatch.json`; commit `test(L1D-320)`
- [x] 2.7 (TDD estricto) Implementar `clasificarVacio()` en `completeness.rules.ts` con unitarios uno a uno (null → por_conciliar → incompleto por estado sin conflicto → incompleto por `minValues` → no_buscado → no_encontrado → prioridad `por_conciliar` > `incompleto` > `no_buscado` > `no_encontrado`), `tiposDeDocumentoProcesados()` en el repository, composición en el service por _factory_, serialización en la vista y `gapType` en el `completeness[]` del turno desde el mismo service; AC-2, AC-3, AC-5, AC-7 en verde; commit `feat(L1D-320)`
- [x] 2.8 Verificación del proveedor: las respuestas de `/completeness` y el `409` del turno validan contra `apps/clinical-api/openapi.yaml`
- [x] 2.9 Refactor sin cambio de comportamiento (Extract Method en el service), tests en verde antes y después; commit `refactor(L1D-320)`

## 3. ai-services

- [x] 3.1 (TDD estricto) Test de aceptación en rojo: dos turnos «¿Qué información falta?» con el mismo `completeness[]` dan los mismos bloques `faltante` en el mismo orden y el LLM falso registra cero llamadas [US-263 AC-4] · Pytest + `TestClient`, adapters falsos que cuentan, reloj congelado; `@pytest.mark.ac("US-263", 4)`; commit `test(L1D-320)`
- [x] 3.1b (TDD estricto) Test en rojo: las cuatro plantillas usan «no se halló en los documentos procesados» (`no_encontrado`) y ninguna contiene «ausente en el paciente»; los bloques `faltante` no llevan `citations` y el validador los trata como exentos [US-263 AC-4] [RN-01] · Pytest; commit `test(L1D-320)`
- [x] 3.2 (TDD estricto) Test de aceptación en rojo: sin `gapType` en ningún ítem, un único bloque que dice que no faltan datos críticos y nombra `1.6.0` [US-263 AC-6] · Pytest + `TestClient`; commit `test(L1D-320)`
- [x] 3.3 (TDD estricto) Test de aceptación en rojo: `/chat/turn` con `catalogVersion` distinta responde `409 CATALOG_VERSION_MISMATCH` y ningún adapter registra invocaciones [US-263 AC-7] · Pytest + `TestClient`; commit `test(L1D-320)`
- [x] 3.4 (TDD estricto) Implementar `domain/chat/faltantes.py` (`verbalizar_faltantes`, plantillas fijas por `gapType`, `sourceDocumentTypes` leídos del catálogo montado por `item`, orden del catálogo, bloques `faltante` exentos de cita) con unitarios uno a uno y `application/chat/nodo_faltantes.py` sin puertos de IA; la comprobación de catálogo como primer paso de `/chat/turn` es de l1d-316 (aquí solo se verifica con el salto 1.5.0 → 1.6.0); AC-4, AC-6, AC-7 en verde; commit `feat(L1D-320)`
- [x] 3.5 Verificación del proveedor: respuestas de `/chat/turn` (`faltantes`, `409`) válidas contra `apps/rag-orchestrator/openapi.yaml`
- [x] 3.6 Refactor sin cambio de comportamiento; commit `refactor(L1D-320)`

## 4. evaluación y cierre

- [ ] 4.1 (evaluate) Cambia el catálogo: suite `evaluate` en el PR (skill `run-ai-eval`), sin regresión frente al baseline
- [x] 4.2 Escaneo de PII y secretos en verde (el seed `P-CHAT` solo sintético, con su entrada en `config/pii-allowlist.json`)

## Notas (sin checkbox)

- 4.1 (`evaluate`) la corre `ai-eval-runner` con el LLM real en el Gate 2; queda abierta a propósito.
- 2.2: el catálogo real 1.6.0 hace de fixture FX-12-c (un test comprueba `ki67`, `estado_menopausico`, `re` y `tnm`); `catalogHash` de `test-1.1.0` recalculado.
- Evidencia: rojo/verde por AC en los commits `test(L1D-320)` y `feat(L1D-320)`; verify-provider 1033 (clinical-api) y 554 (rag) respuestas; pytest rag 4566, vitest 1343, integración 842.
- `npm run quality` y eslint no corren en este entorno (falta `@vitest/eslint-plugin`); ruff C901/PLR0915 y lint-imports sí, en verde.
- Desviación: un `por_conciliar` puede acompañar a un `presente_verificado` (TNM de P-CHAT); el `status` no cambia.
