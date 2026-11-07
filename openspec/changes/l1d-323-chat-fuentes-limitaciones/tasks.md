# Tasks — l1d-323-chat-fuentes-limitaciones

> Rama `feat/l1d-323-chat-fuentes-limitaciones`, PR `[L1D-323] Chat: fuentes y limitaciones; sin evidencia`. Rebasa sobre
> `l1d-316-chat-turn-langgraph`, `l1d-315-conversacion-paciente` y `l1d-322-chat-evidencia-seguimiento` (US-265).
> Secuencia de commits: `contract` 572c976b, 18ffdbac → `test` (rojo) e5e28501 → `feat` 989cc3a7, 085fdaf2 → `refactor`
> e048d3b4 → `test` (nacen verdes, clinical-api) e8300d93 y el siguiente.

## 1. contratos

- [x] 1.1 Ejemplos `contracts/examples/chat-turn-fuentes-ok.json`, `chat-turn-fuentes-sin-anio.json`, `chat-turn-fuentes-sin-evidencia.json`, `chat-turn-fuentes-sin-consulta.json` (y sus peticiones `chat-turn-request-fuentes*.json`): bloques `fuente` sin `chunkId` ni `citations[]`, `notices[]` con el literal RN-19 sin punto final, `structuredState.ultimaEvidencia` sin `analysisId` · evidencia: `contracts:check` sin hallazgos (33 reglas); los cuatro son la salida del motor (`test_chat_turn_fuentes_limitaciones.py`, ejemplos); commit `contract(L1D-323)`
- [x] 1.2 (deuda de `l1d-322`) rag 1.14.0: el 503 de `/chat/turn` declara `ErrorRecuperacionNoDisponible` y `ErrorNliNoDisponible`; `packages/api-contracts` y `VERSION_DEL_SERVICIO` regenerados/subidos · evidencia: `contracts:generate:check` al día, `contracts:check` sin hallazgos, `contracts:breaking` solo marca el ERR `response-body-one-of-added` de la excepción E-20 (H-1), `clinical-api` sin cambios ("No changes detected")

## 2. ai-services

- [x] 2.1 (TDD estricto) Test de aceptación en rojo: `intent = "fuentes_limitaciones"`, cero llamadas al LLM y un bloque `fuente` por documento citado (de `ultimaEvidencia.chunkIds ∩ citasMostradas`), sin `chunkId`, con título, `sourceName`, año, idioma y licencia del catálogo, y `notices[]` con los avisos RN-19 [US-266 AC-1] · integración · rojo: `13 failed` (`assert 500 == 200` del esqueleto), commit `test(L1D-323)` e5e28501; verde: `18 passed` en `test_chat_turn_fuentes_limitaciones.py`
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: documento sin `published_at` → año «No disponible» en el bloque `fuente`, nunca `0` ni inferido [US-266 AC-2] · mismo rojo y verde que 2.1
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: bloque `limitacion` con corte `2026-09-30` y `NCCN`, `ESMO` de la release del corpus y fragmentos evaluados = `len(ultimaEvidencia.chunkIds)` (41 en el test) [US-266 AC-3] · mismo rojo y verde que 2.1
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: criterios «Desconocido», 1 descartada (del análisis en el estado efímero del hilo) y la frase de FR-10, sin términos de RN-23; y, en un hilo rehidratado sin ese análisis, la frase de FR-10 con la referencia al análisis registrado sin valores inventados [US-266 AC-4] · mismo rojo y verde que 2.1
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: hilo sin `ultimaEvidencia` → «aún no se ha consultado evidencia», sin fuentes ni LLM [US-266 AC-6] · mismo rojo y verde que 2.1
- [x] 2.6 (TDD estricto) Implementar `nodo_fuentes_limitaciones.py` (en `application/chat/capacidades/fuentes_limitaciones.py`) y las reglas puras de `domain/chat/fuentes_limitaciones.py` (12 unitarios en `test_chat_fuentes_limitaciones_reglas.py`), `LimitacionesDelAnalisis` en el estado del hilo y los patrones «no cubre», «fecha de corte» y «corpus» en `clasificar_por_reglas()` (4 casos nuevos de `test_chat_enrutado.py`, rojo `2 failed` y luego `46 passed`); AC-1…AC-4 y AC-6 en verde; commits `feat(L1D-323)` 989cc3a7 y 085fdaf2. Nota: los unitarios del dominio se escribieron junto a las reglas (el bucle externo estaba en rojo desde el commit `test`), no uno a uno
- [x] 2.7 Añadir el bloque de limitaciones de la recuperación al turno `sin_evidencia` del nodo `evidencia` de L1D-322 (RN-02) [US-266 AC-5]; los `notices[]` ya los rellena `avisos_del_turno`; `ultimaEvidencia` la rellena L1D-322 · test de aceptación en `test_chat_turn_fuentes_limitaciones.py` (rojo: el turno solo traía una `limitacion`); `test_chat_turn_evidencia.py` ajusta su aserción a dos bloques `limitacion`
- [x] 2.8 (test de contrato) Lector de catálogo falso con ficha sin `published_at`, `LectorReleaseFalso` y `PosicionesFalsas` con las mismas firmas y errores que sus adapters reales (`null` ≠ `0`): ya los cubren `test_bateria_de_contrato_de_adapters.py` y los fallos cerrados (`503 RETRIEVAL_UNAVAILABLE` sin detalle del borde, parametrizado por catálogo, release y posiciones); el recuperador falso del seguimiento cumple el puerto (`test_seguimiento_con_recuperador_falso.py`)
- [x] 2.9 Refactor: Extract Interface `RecuperadorDeEvidencia` (recuperar, chunks citables, verificar) para `NodoSeguimientoDeEvidencia` y `validar_afirmaciones_citadas`, e Inline de la propiedad `verificador_de_soporte` en `RAGOrchestratorService.verificar`; Extract Method `validar_salida_cruda` (parseo y log duplicados con `LlmSeguimientoGenerator`); commit `refactor(L1D-323)` e048d3b4, tests en verde antes (3720) y después (3725)
- [x] 2.10 (deuda de `l1d-322`) Extract Interface `RecuperadorDeEvidencia` y parseo duplicado con `LlmSeguimientoGenerator`: hecho en 2.9
- [ ] 2.11 TRASLADADA a L1D-326: plantilla de prompt duplicada entre `chat_seguimiento_evidencia.py` y `prompts/seguimiento.py` (cambiarla es un cambio de prompt y exige `run-ai-eval`; L1D-326 mide los prompts del chat)
- [ ] 2.12 TRASLADADA a L1D-326: P2-11 (repositorio de conversación) y las P3 de diseño de `l1d-322` que no caben aquí: flag `con_analisis_activo`, Parameter Object de `_registrar_chat`, defaults de `chunk_ids_evaluados` (cierra el lote de FEAT-12; confirmar o reasignar al ID de deuda que el orquestador cree)
- [ ] 2.13 TRASLADADA a US-185 (L1D-177): prueba de mutación para confirmar los tests que nacieron verdes de `l1d-322` (AC-5/6/7) y los de la sección 3 (StrykerJS, US-185)

## 3. clinical-platform

- [x] 3.1 (TDD estricto) Test de aceptación: `Q-SIN` como turno → `AIAnalysisRecord` `sin_evidencia` con `topRelevanceScore = null` y `evidenceOptions = []` enlazado al turno, cero llamadas de generación y bloque `limitacion` [US-266 AC-5] · integración (Supertest + PostgreSQL real + MSW desde `chat-turn-fuentes-sin-evidencia.json`) en `conversacion-fuentes-limitaciones.test.ts` · **nace verde** (declarado): L1D-315 y L1D-322 ya cubren lo que pide, por lo que no hay rojo ni `feat`; verde: `7 passed`
- [x] 3.2 Regresión sin `feat`: AC-5 en verde y `ultimaEvidencia` reenviada con `topRelevanceScore = null` y sin `analysisId` en la rehidratación (test «reenvía ultimaEvidencia…»), más `502` sin persistir cuando rag responde 503 `RETRIEVAL_UNAVAILABLE` o `NLI_UNAVAILABLE`
- [x] 3.3 Verificación del proveedor: las respuestas del turno con bloques `fuente` y `limitacion` validan contra `apps/clinical-api/openapi.yaml` (`enviarTurno` usa `clienteVerificado`) · evidencia: integración completa con `CONTRACT_VERIFY=strict`: 166 archivos, 876 tests; unitarios 145 archivos, 1374 tests; `contracts:verify-provider -- --proveedor rag-orchestrator`: 649 respuestas verificadas
- [x] 3.4 (deuda de `l1d-322`) Test de `episodioId` nulo: un paciente sin episodio de atención recibe `500` sin persistir turno ni análisis (`conversacion-fuentes-limitaciones.test.ts`, nace verde: la regla existía en `analysis-completion.ts`)

## 4. evaluación

- [ ] 4.1 (evaluate) `run-ai-eval` de regresión (`eval/configs/rn23-local.yaml --suite all`) por el cambio de reglas de enrutado y del texto fijo de limitación: salidas prescriptivas = 0 y «sin evidencia» sin regresión; AC06 del chat se mide en US-269 · DIFERIDA -> H-2 (lo lanza el orquestador con `ai-eval-runner` en el Gate 2); evidencia local: `eval-required.mjs --base origin/main` con adapters falsos, sin regresión; el texto fijo cumple RN-23 (`check_prohibited_terms` niveles A y B sobre cada bloque en AC-4)

## 5. cierre

- [x] 5.1 `openspec validate l1d-323-chat-fuentes-limitaciones --strict` (y `--all`: 54 passed), `pytest` de `apps/rag-orchestrator` (3725 passed + `tests/evaluation` 4787 con `verify-provider`), `ruff format/check`, `lint-imports` (2 kept), `npm run quality` (0 errores), `tsc -p tsconfig.build.json`, `eslint`/`prettier` del test nuevo, `pii-scan`, `tasks-destino`
- [ ] 5.2 DIFERIDA -> H-2. Gate 2 con los guardianes, CI verde y merge

## humano

- [ ] H-1 Excepción ADR-26 E-20 (archivo protegido para el implementador): sin ella `contracts:breaking` y el job de contratos fallan por el ERR `response-body-one-of-added` de `POST /chat/turn` 503. DIFERIDA -> H-1. Añadir al final de `scripts/ci/contracts-breaking-excepciones.json`:

  ```json
  {
    "id": "E-20",
    "adr": "ADR-26",
    "documento": "ADR-26-contrato-congelado-y-excepciones-declaradas.md",
    "change": "l1d-323-chat-fuentes-limitaciones",
    "proveedor": "rag-orchestrator",
    "regla": "response-body-one-of-added",
    "operacion": "POST",
    "ruta": "/chat/turn",
    "texto": "added `#/components/schemas/ErrorRecuperacionNoDisponible, #/components/schemas/ErrorNliNoDisponible` to the response body `oneOf` list for the response status `503`"
  }
  ```

  y la fila en `docs/architecture/adr/ADR-26-contrato-congelado-y-excepciones-declaradas.md` (tabla de excepciones, tras E-18 y E-19; actualizar «E-1…E-13» de la línea de `excepcionesDeContrato.test.mjs` si la cuenta se verifica):
  `| E-20 | rag-orchestrator | `response-body-one-of-added` en `POST /chat/turn`: `ErrorRecuperacionNoDisponible` (`RETRIEVAL_UNAVAILABLE`) y `ErrorNliNoDisponible` (`NLI_UNAVAILABLE`) añadidos al `oneOf` del `503` | l1d-323-chat-fuentes-limitaciones | Aditivo: `clinical-api` clasifica por código HTTP y de error y los traduce a `502` (`rag-failure.ts`); los dos esquemas ya existían en `/rag/query` y `/rag/follow-up`. Pendiente de decisión del PO |`
- [ ] H-2 Informe de `ai-eval-runner` (regresión de enrutado y texto fijo, `rn23-local.yaml --suite all`) en `reports/eval/`, Gate 2 y CI verde antes del merge (tareas 4.1 y 5.2). DIFERIDA -> H-2.

Nota (sin checkbox): no se añadieron claves de configuración ni cambios en `.env.example`, Compose ni su test de paridad.
Nota (sin checkbox): rag `1.14.0` y clinical-api `1.29.0` (sin cambio); si otro change mergea antes con `1.14.0`, se renumera el segundo (glosario §1).
