## Context

RN-12 vive hoy repartida: `app/domain/reglas_proveedor.py` tiene el piso cerrado de hosts locales (`es_proveedor_local`, `es_modelo_de_nube`) y `variable_que_incumple_llm_local` para la ingesta (US-118) y la suite `evaluate` (ADR-41 D4); `Settings.llm_cloud_enabled` vale `false` por defecto (US-037 AC-6); `LLM_PROVIDER ∈ {local, fake}` y `MODEL_PROVIDER ∈ {local, fake}` (US-231a); `/rag/query` traduce todo fallo del generador a `503 LOCAL_LLM_UNAVAILABLE` (`generador_fallando_cerrado.py`), y `clinical-api` ya toma `dataClassification` de `caso.paciente.dataOrigin` (`evidence-analysis.service.ts`) y mapea el `503` en `rag-failure.ts`. Lo que falta es que la regla **dependa de la clasificación de cada petición**, que esté en un solo punto por el que pasan todas las llamadas al LLM (incluido el chat de `l1d-316`) y que `clinical-api` verifique `llmProvider`.

## Goals / Non-Goals

**Goals:** regla pura por clasificación; un selector único delante del LLM para `/rag/query` y `/chat/turn`; tests con contadores de invocaciones (AC-1…AC-3); clasificación desde el paciente y verificación del proveedor en `clinical-api` para el análisis y el turno del chat (AC-4, AC-5).

**Non-Goals:** adapter de nube real; cambios en *embeddings*/*reranker*/NLI; `preflight real-data` (US-143).

## Decisions

- **D1 · Reutilizar `reglas_proveedor.py`.** La historia nombra `provider_rule.py` y `allowed_providers()`; el módulo de reglas de proveedor ya existe y es el dueño de RN-12 (regla de config: «una regla de dominio tiene un solo dueño»). Se añade `proveedores_permitidos(data_classification, llm_cloud_enabled) -> tuple[ProveedorLlm, ...]` (orden = preferencia; clasificación desconocida → solo `local`).
- **D2 · Selector como envoltorio del puerto, no como `if` en cada consumidor.** `SelectorDeProveedorLlm` implementa el mismo puerto LLM que consumen `EvidenceGenerator`, la reescritura de consulta (US-238), la aplicabilidad textual y los nodos del chat; recibe el adapter local y un adapter de nube **opcional** (`None` en producción). La clasificación entra por un contexto de petición explícito (argumento), no por estado global. Alternativa descartada: comprobar la regla en cada caso de uso (duplicaría RN-12 en ≥4 sitios). No es cara de revertir: una línea de alternativas basta.
- **D3 · `meta.llmProvider` sale del selector** (el adapter que respondió), no de `_proveedor_de_meta(settings)`; esa función se elimina o pasa a ser el valor por defecto con un único dueño.
- **D4 · Verificación en `clinical-api`:** función pura `proveedorPermitido(dataClassification, llmProvider)` en el módulo `evidence-analysis`, usada por `mapearFalloRag`/la validación de la respuesta del análisis y por el servicio de conversación de `l1d-315`; `nube` con dato real → `502 ERROR_SERVICIO_IA` y evento `proveedor_no_permitido` (solo `traceId` y clasificación).
- **D5 · Clasificación desde el paciente con una única función** `clasificacionDelPaciente(paciente)` que reutilizan el gateway y la conversación.

## Privacidad y ownership

- Frontera web → clinical-api: sin cambios; el body público no puede fijar la clasificación (`additionalProperties: false`).
- clinical-api → rag-orchestrator: viaja solo `dataClassification` (enum sin identidad) además de lo ya desidentificado (RN-10, RN-11); el `pseudoPatientId` sigue siendo por consulta.
- rag-orchestrator no toca datos clínicos ni `clinical-minio`; el selector no persiste nada ni registra la pregunta. Con datos reales ningún byte sale hacia un host fuera de `HOSTS_LOCALES` (RN-12); en producción ni siquiera existe el adapter de nube.
- Los tests usan pacientes de **contenido sintético** con `data_origin` real en la base de test: nunca datos reales (RN-13, RN-14).

## Contratos

Sin cambios. Proveedor: `rag-orchestrator`; consumidor: `clinical-api` por el cliente generado de `packages/api-contracts/`. `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` (sus `503`/`502` ya existen) y `contracts/examples/` no tienen diff en este change.

- `/chat/turn`: `ChatTurnRequest.dataClassification` (requerido) y `ChatTurnResponse.llmProvider` (`enum [local, nube]`, mismo enum que `RagMeta.llmProvider`) se publican en la 1.12.0 de `l1d-316-chat-turn-langgraph`, dueño único del contrato del chat (glosario `backlog/sprints/S6-glosario-chat.md` §1). Este change solo los **aplica** por código.
- Ejemplos: los tests del chat reutilizan `contracts/examples/chat-turn-llm-local-no-disponible.json` (`503 ErrorLlmLocalNoDisponible`), de `l1d-316`; no se crea otro ejemplo para el mismo caso.
- `/rag/query` no cambia: `dataClassification` y `RagMeta.llmProvider` ya existen.
- Compatibilidad (ADR-26): sin diff, sin excepción de `oasdiff`.

## Dependencias y colaboradores

- `app/domain/reglas_proveedor.py`: + `proveedores_permitidos()` (pura).
- `app/application/selector_proveedor_llm.py` (nuevo): depende del puerto LLM de `ports.py`, nunca de clientes concretos; lanza el mismo error de «LLM no disponible» que ya mapea `app/api/errors.py`.
- `app/bootstrap.py`: compone el selector con el adapter local y `nube=None`; elimina el `_proveedor_de_meta` duplicado (D3).
- `app/application/chat/` (de `l1d-316`): los nodos reciben el selector por el puerto existente.
- `clinical-api/src/modules/evidence-analysis/`: + `proveedorPermitido()` y `clasificacionDelPaciente()` (reglas con nombre propio, RN-12); `rag-failure.ts` gana la fila de proveedor no permitido; el módulo de conversación de `l1d-315` las reutiliza.
- Fakes: adapter LLM local falso (ya existe, con modo «caído») y un **adapter de nube falso** nuevo que cuenta invocaciones, solo en `tests/`; ambos pasan la batería de contrato de adapters LLM existente (mismos errores, `null` ≠ `0.0`).

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: no requiere `run-ai-eval`. La métrica G-8 «0 llamadas a la nube con datos reales» ya la mide US-072 (`app/evaluation/llamadas.py`); este change no la toca.

## Risks / Trade-offs

- [Contrato del chat en vuelo] → resuelto: los campos viven en la 1.12.0 de `l1d-316`; este change espera a que esté en la rama base para las tareas del chat.
- [El selector oculta qué adapter respondió] → `llmProvider` explícito en la respuesta y verificación en Backend 1.
- [Adapter de nube inexistente hace los tests «teóricos»] → el fake lo hace observable; el test estático de `test_adapters_sin_red.py` sigue impidiendo importar clientes de nube.
