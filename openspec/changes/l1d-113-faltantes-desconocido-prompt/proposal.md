# Proposal — l1d-113-faltantes-desconocido-prompt

## Trazabilidad

L1D-113 · US-116 · FEAT-06b (L1D-17) · Sprint 5 (O2) · Estimación **3** · HU-18 · FR-09 (contexto con faltantes), FR-23
(«desconocido»), IA-03 · AC-04.3 (parte de Backend 2) · RN-02, RN-11 (regresiones) · US-116 AC-1…AC-5 · ↪ FEAT-04 US-006
(L1D-98, archivado), US-057 · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-02] → US-055 · Sprint:
`backlog/sprints/S5-refinamiento.md`.

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-03, refinamiento del S5):** comprometida en el S5 `[S5 resp. 3]` (D-3, 85 → 90 pts); no está
  en la lista de recorte de §2 (que empieza por US-071 y US-093).
- **RN-02 enmendada (usuario, 2026-10-23, US-238 / `l1d-300`, archivado):** sin chunks sobre el umbral tras el primer loop,
  un único segundo loop de reescritura con el LLM local; si tampoco supera el umbral, «sin evidencia» **sin invocar al LLM de
  generación ni al agente**. El AC-4 de la historia («el LLM registra cero invocaciones») se lee como el **LLM de
  generación**; el de reescritura conserva su límite de US-238 y no recibe los faltantes.
- **`l1d-98-faltantes-al-analisis` (US-006, archivado):** `clinical-api` ya envía `missingCriticalData` como **claves del
  catálogo** (no texto libre); este change es su consumidor en Backend 2.
- **`S5-refinamiento.md` §5:** la suite `evaluate` con modelos locales corre en **una sola corrida nocturna** al cierre del
  día 2; este change **entra en ella** (P-2, Decidido (usuario, 2026-11-03), `[S5 resp. 13]`).
- **D-12 `[S5 resp. 7]`:** PR **individual** — toca la validación de RN-11 en el borde de `rag-orchestrator`, que excluye
  el PR de lote.
- D-01: análisis de evidencia, no recomendaciones; RN-23 en la plantilla del prompt.

## Dependencias

- ↪ **l1d-98-faltantes-al-analisis** (US-006, archivado): produce `missingCriticalData` con claves del catálogo.
- ↪ **US-057** (prompt `rag-query`, `PromptBuilder` = `app/prompts/rag_query.py`) y **US-055** (pipeline dense, resumen del
  contexto embebido = `app/application/resumen_contexto.py`), ambos archivados.
- ↪ **l1d-300-reescritura-consulta-segundo-loop** (US-238, archivado): define qué LLM puede invocarse antes de «sin evidencia».
- 🔗 **`l1d-79-contexto-trayectoria-caso`** (US-093, O2): **sin conflicto de módulo**. Solo toca `apps/clinical-api`; no
  toca `rag-orchestrator`, ni el prompt, ni el resumen embebido. `rag-query@0.7.0` es la versión **definitiva** de este
  change; no hay que coordinar el orden de merge.
- ⛔ Ninguna dura dentro del S5. Prerrequisito de **ejecución** de la evaluación con modelos locales (no de código): la
  corrida nocturna del día 2.

## Por qué

Hoy `rag-orchestrator` recibe `clinicalContext.missingCriticalData` (S3, US-006) pero solo lo usa la aplicabilidad (US-124);
el prompt de generación no dice qué datos críticos faltan, así que el modelo puede suponerlos, y la consulta de recuperación
ignora la línea de tratamiento actual (`currentLine`), que discrimina mucho en oncología (adyuvancia, primera línea
metastásica…). AC-04.3 exige que los faltantes viajen a la IA como «desconocido» y FR-23 que no se infieran.

## Qué cambia

- **Faltantes como «desconocido» en el prompt (AC-1, AC-5):** el bloque de datos del paciente del prompt `rag-query` añade,
  dentro de sus delimitadores, una línea `«<etiqueta del catálogo>: desconocido»` por cada clave de `missingCriticalData`,
  con la etiqueta en español de `datos-criticos.json` del tipo de cáncer del caso, y la instrucción pide describirlos con
  el vocabulario unificado «sin dato registrado (desconocido)» (nunca «no disponibles»). Sin faltantes, ninguna línea
  «desconocido». La versión del prompt sube a `rag-query@0.7.0` (definitiva).
- **Consulta de recuperación enriquecida (AC-2):** el resumen del contexto que se embebe junto con la pregunta (rama dense)
  añade la etiqueta de la línea actual (`«línea de tratamiento {n}»`, decidida) cuando `currentLine` no es `null`, y nunca un valor para un dato faltante (ni la
  palabra «desconocido»). La rama sparse y la reescritura siguen usando solo la pregunta.
- **Claves, no texto (AC-3, RN-11):** antes de cualquier puerto (embeddings, Milvus, LLM, NLI), un elemento de
  `missingCriticalData` que no cumple `^[a-z0-9_]+$` o no está en el catálogo del tipo de cáncer del caso responde `422
  CUERPO_INVALIDO` (`ErrorValidacion`, sin eco del valor).
- **Sin evidencia sigue sin LLM de generación (AC-4, RN-02):** regresión con faltantes y `Q-SIN`.

## Capacidades afectadas y bounded contexts

- `evidence-analysis`: ADDED faltantes como «desconocido» en el bloque de datos del paciente; ADDED línea actual en la
  consulta de recuperación sin valores de faltantes; ADDED validación de claves de `missingCriticalData` con `422`; ADDED
  regresión «sin evidencia» con faltantes; ADDED subida de versión del prompt.
- Sin capacidad nueva.
- Contextos: **ai-services** (`apps/rag-orchestrator`: `app/prompts/rag_query.py`, `app/application/resumen_contexto.py`,
  `app/application/rag_orchestrator_service.py`, `app/application/errores.py`, `app/api/errors.py`, un lector de
  `datos-criticos.json` en `app/infrastructure/catalogo_clinico/`, `bootstrap.py`, tests) y **evaluación** (`ai-eval-runner`,
  obligatoria: cambia el prompt y la consulta de recuperación). Sin cambios en `clinical-api`, `web` ni en contratos.

## Fuera de alcance

- **Contratos:** sin cambio de `openapi.yaml` ni de `contracts/examples/` (ADR-26). `currentLine` (`integer | null`) y
  `missingCriticalData` ya existen en `ClinicalContext`; el `422` reutiliza `ErrorValidacion` (`CUERPO_INVALIDO`), ya
  declarado en `/rag/query`. No se añade `pattern` al esquema (estrecharía la entrada: cambio incompatible).
- Uso de los faltantes en la aplicabilidad («Desconocido: falta en el paciente»): US-124, ya implementado.
- Atributos, tratamientos previos, eventos y tendencias en el bloque del prompt: siguen fuera en el S5 (US-093/`l1d-79`
  solo los lleva al payload, P-2 de ese change).
- Prompt de seguimiento (`app/prompts/seguimiento.py`, `l1d-268`) y `/case/summary`: no reciben las líneas «desconocido» en
  este change.
- Línea actual en el **prompt** de generación (el AC-2 la pide solo en la consulta de recuperación).
- Cambiar modelo, umbrales, el modo de recuperación o la reescritura de US-238.

## Decisiones cerradas (antes «Pendientes abiertos»)

- **P-1 · Etiqueta de la línea actual (AC-2) · Decidido (usuario, 2026-11-03), `[S5 resp. 13]`:** literal
  `"línea de tratamiento {n}"`, versionado con el resumen embebido (el catálogo no tiene etiqueta para `currentLine`).
  La suite mide su efecto en el recall de la rama dense; si retrocede, se ajusta el literal, no la regla.
- **P-2 · Corrida con modelos locales · Decidido (usuario, 2026-11-03):** este change **entra en la corrida nocturna
  única del día 2** (`S5-refinamiento.md` §5). Si no cabe: `DIFERIDA -> D5-nn`.
