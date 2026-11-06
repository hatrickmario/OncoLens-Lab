# Tasks — l1d-323-chat-fuentes-limitaciones

> Rama `feat/l1d-323-chat-fuentes-limitaciones`, PR `[L1D-323] Chat: fuentes y limitaciones; sin evidencia`. Rebasa sobre
> `l1d-316-chat-turn-langgraph`, `l1d-315-conversacion-paciente` y `l1d-322-chat-evidencia-seguimiento` (US-265).

## 1. contratos

- [ ] 1.1 (sin cambio de esquema ni de versión, glosario §1) Ejemplos `contracts/examples/chat-turn-fuentes-ok.json`, `chat-turn-fuentes-sin-anio.json`, `chat-turn-fuentes-sin-evidencia.json`, `chat-turn-fuentes-sin-consulta.json`: bloques `fuente` sin `chunkId` ni `citations[]`, `notices[]` con el literal RN-19 sin punto final, `structuredState.ultimaEvidencia` sin `analysisId` · test después · verificación: validan contra `ChatTurnResponse` y `contracts:check` en verde; commit `contract(L1D-323)`

## 2. ai-services

- [ ] 2.1 (TDD estricto) Test de aceptación en rojo: `intent = "fuentes_limitaciones"`, cero llamadas al LLM y un bloque `fuente` por documento citado (de `ultimaEvidencia.chunkIds ∩ citasMostradas`), sin `chunkId`, con título, `sourceName`, año, idioma y licencia del catálogo, y `notices[]` con los avisos RN-19 [US-266 AC-1] · integración (`TestClient` + `corpus` real + LLM falso con contador); commit `test(L1D-323)`
- [ ] 2.2 (TDD estricto) Test de aceptación en rojo: documento sin `published_at` → año «No disponible» en el bloque `fuente`, nunca `0` ni inferido [US-266 AC-2] · integración; commit `test(L1D-323)`
- [ ] 2.3 (TDD estricto) Test de aceptación en rojo: bloque `limitacion` con corte `2026-09-30` y `NCCN`, `ESMO` de la configuración de Backend 2 y fragmentos evaluados = `len(ultimaEvidencia.chunkIds)` [US-266 AC-3] · integración; commit `test(L1D-323)`
- [ ] 2.4 (TDD estricto) Test de aceptación en rojo: criterios «Desconocido», 1 descartada (del análisis en el estado efímero del hilo) y la frase de FR-10, sin términos de RN-23; y, en un hilo rehidratado sin ese análisis, la frase de FR-10 con la referencia al análisis registrado sin valores inventados [US-266 AC-4] · integración; commit `test(L1D-323)`
- [ ] 2.5 (TDD estricto) Test de aceptación en rojo: hilo sin `ultimaEvidencia` → «aún no se ha consultado evidencia», sin fuentes ni LLM [US-266 AC-6] · integración; commit `test(L1D-323)`
- [ ] 2.6 (TDD estricto) Implementar `nodo_fuentes_limitaciones.py` y las reglas puras de `domain/chat/fuentes_limitaciones.py` (con unitarios uno a uno), y los patrones de `fuentes_limitaciones` en `clasificar_por_reglas()` con su precedencia; AC-1…AC-4 y AC-6 en verde; commit `feat(L1D-323)`
- [ ] 2.7 Añadir el bloque de limitaciones de la recuperación y los `notices[]` al turno `sin_evidencia` del nodo `evidencia` de L1D-322 (RN-02); `ultimaEvidencia` la rellena L1D-322, aquí solo se consume
- [ ] 2.8 (test de contrato) Lector de catálogo falso con ficha sin `published_at` y LLM falso: mismo test de contrato que sus adapters reales
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-323)`

## 3. clinical-platform

- [ ] 3.1 (TDD estricto) Test de aceptación en rojo: `Q-SIN` como turno → `AIAnalysisRecord` `sin_evidencia` con `topRelevanceScore = null` y `evidenceOptions = []` enlazado al turno, cero llamadas de generación y bloque `limitacion` [US-266 AC-5] · integración (Supertest + PostgreSQL real + MSW desde `chat-turn-fuentes-sin-evidencia.json`); commit `test(L1D-323)`
- [ ] 3.2 Si 3.1 ya pasa con L1D-315 (guarda y rehidrata `structuredState` tal cual) y L1D-322 (persiste el análisis `sin_evidencia`), se registra como regresión sin `feat`; si no, se corrige en el módulo dueño · verificación: AC-5 en verde y `ultimaEvidencia` reenviada sin `analysisId` en la rehidratación
- [ ] 3.3 Verificación del proveedor: las respuestas del turno con bloques `fuente` y `limitacion` validan contra `apps/clinical-api/openapi.yaml`

## 4. evaluación

- [ ] 4.1 (evaluate) `run-ai-eval` de regresión (`eval/configs/rn23-local.yaml --suite all`) por el cambio de reglas de enrutado y del texto fijo de limitación: salidas prescriptivas = 0 y «sin evidencia» sin regresión; AC06 del chat se mide en US-269

## 5. cierre

- [ ] 5.1 `openspec validate l1d-323-chat-fuentes-limitaciones --strict`, tests de `apps/rag-orchestrator` y `apps/clinical-api` en verde, `contracts:verify-provider`, `run-ai-eval`
