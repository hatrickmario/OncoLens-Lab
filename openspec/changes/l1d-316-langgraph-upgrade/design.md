# Design — l1d-316-langgraph-upgrade

## Contexto

Residual de L1D-316 (US-259). El grafo del turno del chat (ADR-51) ya está en `main` y archivado en `openspec/specs/patient-chat/`. Solo queda cerrar la alerta #9 de Dependabot sobre `langgraph` 1.2.10 y dejar constancia del triage de la #8. Disciplina de la matriz TDD: **test después** (configuración y dependencias).

## Decisiones

### D1. Versión objetivo: `langgraph==1.2.14` (la mínima corregida)

Opción elegida: subir solo a la primera versión corregida. Sus rangos de dependencias los cumplen las fijaciones actuales, así que el diff es de una línea y la superficie de regresión son cuatro versiones de parche (1.2.11–1.2.14).

Descartadas: `1.2.24` (última de la rama al 2026-11-22; exige `langgraph-prebuilt>=1.1.3` y `langgraph-checkpoint>=4.3.0`, más diff y más superficie sin cerrar nada más) · no subir y descartar la alerta (válido por exposición, pero deja una versión con aviso conocido en un repo público; queda como repliegue, D3).

Las versiones se fijan exactas (US-034) y se instalan con `--only-binary=:all:` (US-231a); `langgraph` publica *wheel* puro.

### D2. Verificación: la suite existente, sin tests nuevos

El contrato de comportamiento del grafo ya está cubierto: unitarios `tests/unit/test_chat*` y `test_chat_turn_contrato.py`, integración `tests/integration/test_chat_turn_*` (hilos, TTL, rehidratación, memoria, no persistencia, diseño) y `test_arranque_telemetria.py`; en infra, `infra/docker/__tests__/compose-telemetria-rag.test.mjs`. Un test que fijara la versión instalada duplicaría `requirements.txt`. La evidencia del PR es: esa suite en verde con 1.2.14 instalado, sin aserciones cambiadas, y la alerta #9 en estado `fixed`.

`pip-audit` (job `dependencies`) **no** sirve de evidencia para este aviso: hoy pasa en verde con 1.2.10 y sin excepciones en `security/audit-exceptions.json`, es decir, su base no lo lista. La evidencia es el estado de la alerta en GitHub.

Puntos del código que tocan la librería y donde aparecería una incompatibilidad: `app/application/chat/grafo.py` (`StateGraph`, `START`, `END`, `BaseCheckpointSaver`) y `app/application/chat/registro_de_hilos.py` (`InMemorySaver` con `JsonPlusSerializer`). `InMemorySaver` y el serializador viven en `langgraph-checkpoint`, que **no** cambia de versión.

### D3. Repliegue: descartar la alerta #9 con justificación (solo el humano)

Solo si la suite queda en rojo con 1.2.14 por un cambio de la librería y el arreglo excede la hora 0. Texto propuesto para el descarte (motivo «el código vulnerable no se usa»):

> `rag-orchestrator` usa `langgraph` solo como grafo en proceso (`StateGraph`) con `InMemorySaver`. No importa `langgraph_sdk` ni `RemoteGraph`, no se conecta a ningún servidor de LangGraph y fija `langgraph-sdk==0.4.6`, fuera del rango afectado del SDK (0.4.0–0.4.5). El `threadId` del chat es aleatorio y lo genera `clinical-api`, no el usuario. GHSA-3fx2-cqw9-xr3c no es alcanzable. Revisar al subir `langgraph`.

En ese caso el implementador se detiene, reporta el fallo y el orquestador lo eleva: descartar una alerta es un cambio de configuración de seguridad del repositorio y no lo hace un agente.

### D4. Alerta #8 (`minimatch`): triage sin acción

Estado `fixed` desde el PR #417. Es dependencia de desarrollo del *workspace* de npm (`package-lock.json`), fuera de `ai-services`. Este change solo registra la comprobación; si reapareciera abierta, se reporta y no se toca `package-lock.json` desde aquí.

## Privacidad y ownership

- Ningún dato cruza una frontera nueva: no cambian endpoints, estado del hilo, *logs* ni prompts. `rag-orchestrator` sigue sin acceso a datos clínicos ni a `clinical-minio`, y el contexto le llega desidentificado como hasta ahora (RN-10, RN-11).
- RN-12: la subida no añade transitivas ni clientes de red. `langsmith` no cambia de versión y sigue apagado por Compose (`LANGSMITH_TRACING=false`, `LANGCHAIN_TRACING_V2=false`, `LANGSMITH_ENDPOINT=""`); lo comprueban `compose-telemetria-rag.test.mjs` y `test_arranque_telemetria.py`, que deben seguir en verde. El implementador confirma con `pip install --dry-run` (o el diff de `pip freeze`) que solo cambia `langgraph`.
- RN-14: sin datos ni secretos en el diff. Licencia de `langgraph`: MIT, sin cambio.

## Contratos

Sin cambios. `apps/rag-orchestrator/openapi.yaml`, `contracts/examples/` y `packages/api-contracts/` no se tocan; no hay diff propuesto ni riesgo de incompatibilidad (ADR-26).

## Dependencias y colaboradores

- Se modifica: `apps/rag-orchestrator/requirements.txt` (una línea). Las imágenes (`Dockerfile`) y la CI instalan desde ese archivo; no hay otra fijación de `langgraph` (`pyproject.toml`, `requirements-dev.txt`, `-eval.txt` y `-export.txt` no lo nombran).
- No se crean módulos, puertos ni reglas de dominio. No se toca ningún fake; si la subida obligara a tocar `registro_de_hilos.py`, su comportamiento lo fija `test_chat_turn_hilos.py`.
- Decisiones citadas, no reabiertas: ADR-51 (LangGraph con estado efímero), US-034 (versiones exactas), US-217 (auditoría).

## Evaluación

No aplica: no cambia modelo, prompt, umbral, catálogo ni corpus, y `requirements.txt` no está entre los disparadores de `scripts/ci/eval-trigger-paths.yaml`.

## Riesgos

- **Cambios de comportamiento entre 1.2.10 y 1.2.14** (ejecución del grafo, *checkpointing*, validación del estado): no se conocen cambios incompatibles, pero las notas de versión de 1.2.11–1.2.14 **no se han revisado** en la planificación; es la primera tarea. Mitigación: la suite del chat (≈ 50 archivos de test) y la fijación exacta.
- **Dependabot no cierra la alerta sola** tras el merge (tarda o no reescanea): se comprueba con la API; si sigue abierta con 1.2.14 en `main`, se reporta al humano.
- **PR de Dependabot en paralelo** sobre la misma línea: si aparece, se cierra a favor de este PR (o al revés) para no duplicar; lo decide el humano.
