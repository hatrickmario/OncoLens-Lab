## Trazabilidad

L1D-316 · US-259 · FEAT-12 (bloque 12-A Plataforma del chat) · Sprint 7 · **residual de la historia: tarea de «hora 0»** (hueco Bloqueante B2 de `backlog/sprints/S6-cierre.md` §3; confirmada en `[S7 resp. 5]`, `backlog/sprints/S7-refinamiento.md` §6) · RN-10, RN-12, RN-14 (sin cambio; se comprueba que siguen cumpliéndose) · ADR-51 (sin reabrir) · US-217 (auditoría de dependencias) · Definición «Historia cerrada» de `docs/process/definition-of-done.md` (0 alertas abiertas).

El change original, `l1d-316-chat-turn-langgraph`, está archivado (`openspec/changes/archive/2026-11-13-l1d-316-chat-turn-langgraph/`, PR #362) y sus requisitos viven en `openspec/specs/patient-chat/`. Este change **no** los reescribe.

## Why

L1D-316 se dio por Done al mergear #362, pero la alerta #9 de Dependabot (`langgraph` 1.2.10, severidad media) quedó abierta desde ese merge, y la DoD exige 0 alertas abiertas. El cierre del S6 revirtió la historia a In Review (hueco B2). Cerrar la alerta devuelve L1D-316 a Done y lleva el cierre del S6 de 18/24 a 19/24 historias (80,7 % de los puntos).

Estado de las alertas (lectura de la API de Dependabot, 2026-11-22):

| Alerta | Paquete (manifiesto) | Severidad | Aviso | Rango afectado | Corregida en | Estado |
|---|---|---|---|---|---|---|
| #9 | `langgraph` (`apps/rag-orchestrator/requirements.txt`, runtime) | media | GHSA-3fx2-cqw9-xr3c · CVE-2026-118667: identificadores sin codificar en el *streaming* v3 del SDK de LangGraph permiten redirigir peticiones GET autenticadas | `>= 1.2.3, < 1.2.14` | 1.2.14 | **abierta** |
| #8 | `minimatch` (`package-lock.json`, desarrollo) | media | GHSA-g3hv-75wg-m249 · CVE-2026-118764: denegación de servicio por amplificación de `globParts` | `>= 7.0.0, < 11.0.1` | 11.0.1 | **cerrada (`fixed`)** por el PR #417 (mergeado el 2026-11-21) |

Exposición real de la #9: el código vulnerable es el cliente de *streaming* v3 de `langgraph-sdk` (0.4.0–0.4.5) y `RemoteGraph` de `langgraph` cuando usa ese SDK. `rag-orchestrator` solo importa `langgraph.graph` (`StateGraph`), `langgraph.checkpoint.base`, `langgraph.checkpoint.memory` (`InMemorySaver`) y `langgraph.checkpoint.serde.jsonplus`; no importa `langgraph_sdk` ni `RemoteGraph`, no habla con ningún servidor de LangGraph y ya fija `langgraph-sdk==0.4.6`, fuera del rango afectado del SDK. La ruta vulnerable no es alcanzable; aun así la subida cuesta una línea y es la salida preferida frente a descartar la alerta.

## What Changes

- `apps/rag-orchestrator/requirements.txt`: `langgraph==1.2.10` → **`langgraph==1.2.14`** (primera versión corregida; fuente: campo `first_patched_version` de la alerta #9 y metadatos de PyPI). Sus requisitos (`langchain-core>=1.4.7,<2`, `langgraph-checkpoint>=4.1.0,<5`, `langgraph-prebuilt>=1.1.0,<1.2`, `langgraph-sdk>=0.4.6,<0.5`) ya los cumplen las versiones fijadas hoy (`1.7.6`, `4.3.1`, `1.1.1`, `0.4.6`): **no cambia ninguna otra línea** ni entra ninguna transitiva nueva.
- Verificación «test después»: la suite existente del chat y del grafo (`tests/unit/test_chat*`, `tests/integration/test_chat_turn_*`, `test_arranque_telemetria.py`) y el test del Compose de telemetría siguen en verde sin tocar ninguna aserción. No se añaden escenarios de comportamiento.
- Alerta #9: se comprueba que Dependabot la cierra sola tras el merge. **Repliegue**, solo si la subida rompe la suite y el arreglo no cabe en la hora 0: el humano la descarta con la justificación escrita de `design.md` (D3); los agentes no descartan alertas.
- Alerta #8: triage documentado (ya `fixed`); se vuelve a comprobar su estado antes de pedir el merge. Sin cambios en `package-lock.json`.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- Ninguna. `patient-chat` no cambia: es una subida de parche de una dependencia, sin requisito ni escenario nuevo, por eso el change va con `skip_specs: true` (mismo mecanismo que los changes de decisión y de *spike*). Si la subida obligara a cambiar un comportamiento especificado, el implementador se detiene y lo reporta: ese delta no está previsto aquí.

## Bounded contexts

- **ai-services** (`apps/rag-orchestrator`): única línea de `requirements.txt` y, solo si la subida lo exige, el ajuste mínimo en `app/application/chat/grafo.py` o `registro_de_hilos.py`.
- clinical-platform, frontend y contratos: no se tocan (`openapi.yaml` sigue en su versión; sin `## contratos`).

## Dependencias

- Ninguna ⛔ ni ↪ con otros changes del S7. Es la **hora 0** del orden de ejecución (`S7-refinamiento.md` §5): va primero y no bloquea la medición del RAG.
- El check `dependencies` de `main` ya está en verde (PR #417 y #419 mergeados).

## Fuera de alcance

- D6-66 (guarda de arranque que fuerce apagada la telemetría de LangSmith fuera de Compose): sigue en Post-MVP.
- Subir a la última versión de la rama (`1.2.24`): obliga a mover también `langgraph-prebuilt` (≥ 1.1.3) y amplía la superficie sin cerrar nada más; queda para Dependabot.
- Cualquier cambio en `vigilar-pr.sh` para que lea alertas de Dependabot (retro del S6, mejora de proceso).
- Mover L1D-316 en Linear y actualizar `backlog/`: lo hace `/sprint-close`.
