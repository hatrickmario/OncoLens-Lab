## Trazabilidad

L1D-204 · US-050 · FEAT-T4a · Sprint 6 · Estimación **3** · HU-03 · RN-12 (dueña), SEG-05 · AC-06.1 (`503`) · OL-02, OL-03 · FR-09 · ADR-26, ADR-41 D4, ADR-51 · `[S6 resp. 8]` · ↪ US-052, US-055 · 🔗 Medido en: US-072 (G-8: 0 datos reales en la nube) · Fuente: `backlog/features/FEAT-T4a-acceso-identidad-pacientes.md` § US-050; sprint: `backlog/features/README.md` («Seguridad arrastrada», `[S6 resp. 8]`).

**Decidido (usuario, 2026-11-06)** `[S6 resp. 8]`: se mantiene en el S6 tal cual y aplica también a la ruta del chat: `POST /platform/conversations/{id}/turns` (US-258, `l1d-315-conversacion-paciente`) y `POST /chat/turn` (US-259, `l1d-316-chat-turn-langgraph`) entran en la verificación por código de ambos backends; con datos reales y el LLM local caído, el turno responde `503` y ningún adapter de nube registra llamadas.

## Why

RN-12 («datos reales solo con modelos locales, sin *fallback* a la nube») hoy se cumple por omisión: no existe adapter de nube y `LLM_CLOUD_ENABLED` vale `false` por defecto. Antes del gate G-Piloto (S6) la regla tiene que estar **aplicada por código y probada** en ambos backends, para que un fallo del LLM local, un cambio de configuración o un adapter de nube añadido más tarde nunca terminen enviando datos de un paciente real a un proveedor externo. El chat del S6 añade una segunda ruta de generación que también debe quedar cubierta.

## What Changes

- **rag-orchestrator (dominio):** regla pura `proveedores_permitidos(data_classification, llm_cloud_enabled)` en el módulo existente `app/domain/reglas_proveedor.py` (se reutiliza en lugar de crear `provider_rule.py`): con `real_anonimizado` o `real_identificado` → solo `local`; con `sintetico` → `local` y, solo si `LLM_CLOUD_ENABLED=true`, `nube` como respaldo.
- **rag-orchestrator (aplicación):** selector de proveedor del LLM (`SelectorDeProveedorLlm`) entre la fábrica de adapters y los consumidores (`/rag/query` y los nodos de `/chat/turn`): aplica la regla por petición; local caído con dato real o con la nube deshabilitada → `503 LOCAL_LLM_UNAVAILABLE` sin tocar el adapter de nube; `meta.llmProvider` refleja el adapter que respondió. En producción el puerto de nube queda vacío (no hay adapter); los tests inyectan uno falso que cuenta invocaciones.
- **Sin cambios de spec en `/chat/turn`:** `ChatTurnRequest.dataClassification` y `ChatTurnResponse.llmProvider` se publican en la 1.12.0 de `l1d-316-chat-turn-langgraph`, dueño único del contrato del chat (glosario canónico `backlog/sprints/S6-glosario-chat.md` §1). Este change aporta la aplicación por código y sus tests, y reutiliza el ejemplo `503` `contracts/examples/chat-turn-llm-local-no-disponible.json` de `l1d-316`.
- **clinical-api:** la clasificación del request interno sale siempre de `Patient.data_origin`, nunca del body, en `POST /platform/evidence-analyses` y en `POST /platform/conversations/{id}/turns`; defensa en profundidad: una respuesta de Backend 2 con `llmProvider = nube` para un paciente real → `502 ERROR_SERVICIO_IA` sin persistir; el `503 LOCAL_LLM_UNAVAILABLE` se propaga sin detalles internos y sin `AIAnalysisRecord` ni `conversation_turn`.
- Se retira la nota «Regresión [RN-12 503 y `llm_provider` local con datos reales] activa desde S6 (US-050)» del gateway: pasa a escenarios.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis`: requisito nuevo de selección de proveedor por clasificación de datos en `rag-orchestrator` (AC-1…AC-3).
- `evidence-analysis-gateway`: clasificación tomada del paciente (AC-4), verificación de `meta.llmProvider` y propagación del `503` (AC-5); MODIFIED de «Una sola tabla de mapeo de fallos de rag-orchestrator» para retirar la nota de regresión.
- `patient-chat` (creada por `l1d-316-chat-turn-langgraph`, aún no archivada): requisito añadido para `/chat/turn` (`[S6 resp. 8]`).
- `chat-conversation` (creada por `l1d-315-conversacion-paciente`, aún no archivada): requisito añadido para `POST …/turns` (`[S6 resp. 8]`).
- La regla de `api-contracts` (contrato aditivo, generación reproducible) se aplica sin cambiar sus requisitos.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): regla pura, selector, cableado en `bootstrap.py`, tests.
- **clinical-platform** (`apps/clinical-api`): clasificación desde el paciente en ambas rutas y verificación de `llmProvider`.
- **contratos**: sin cambios. `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` y `contracts/examples/` sin diff; consume los esquemas y ejemplos de `/chat/turn` de `l1d-316` (1.12.0).
- frontend: no se toca.

## Dependencias

- ↪ US-052 y US-055 (gateway y `/rag/query`, ya mergeados en S1–S4): no bloquean.
- ↪ `l1d-316-chat-turn-langgraph` (US-259): las partes del chat dependen de él. `/chat/turn`, su contrato 1.12.0 (con `dataClassification` y `llmProvider`), el ejemplo `chat-turn-llm-local-no-disponible.json` y sus nodos deben estar en la rama base antes de §2.5–§2.6 y §3.4.
- ↪ `l1d-315-conversacion-paciente` (US-258): `POST …/turns` y su `ChatTurnPort` deben existir antes de §3.5.
- La parte de `/rag/query` y `POST /platform/evidence-analyses` (AC-1…AC-5) no depende del chat y puede ir en la primera oleada.
- 🔗 Medido en: US-072 (`ai-evaluation`, G-8: 0 llamadas a la nube con datos reales). Relacionada: US-143 (`preflight real-data`, G-Piloto).

## Pendientes de refinamiento

- **Contrato del chat** (resuelto en el Gate 1, vuelta 1): `dataClassification` y `llmProvider` viven en la 1.12.0 de `l1d-316`; este change no edita el spec ni necesita excepción de `oasdiff`.
- **AC-4 y el body público** (asumido): `EvidenceAnalysisRequest` tiene `additionalProperties: false`, así que un `dataClassification` en el body público responde `400` sin invocar a la IA; el AC se verifica además en el unitario del armado del request interno con el paciente real.

## Fuera de alcance

- Un adapter de nube real: no existe ni se crea (Post-MVP, requeriría ADR). El escenario de respaldo con sintéticos se prueba con un fake.
- `preflight real-data` y la habilitación de `REAL_*_ENABLED` (US-143, G-Piloto); el arranque con datos reales y modo `fake` ya lo cubre `platform-stack`.
- *Embeddings*, *reranker* y NLI: ya son solo locales por `MODEL_PROVIDER ∈ {fake, local}` (US-231a); aquí solo se añade la regresión de que el selector no los cambia.
- El `403` por opt-out en la ruta del chat (US-148, L1D-213) y la suite `evaluate` del chat (US-269).
