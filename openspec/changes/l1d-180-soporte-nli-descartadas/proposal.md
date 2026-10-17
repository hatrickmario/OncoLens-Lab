# Proposal — l1d-180-soporte-nli-descartadas

## Trazabilidad

L1D-180 · US-064 · FEAT-T1a (L1D-34) · Sprint 1 · Estimación **5** · HU-03 (escenario 3) ·
RN-01 (dueña: soporte NLI de opciones y afirmaciones sueltas en el S1), FR-10 (dueña), IA-04, RN-22,
RN-23 (términos prohibidos generados en ejecución, `01-requisitos.md` §15 resp. 2; dueña de la lista: US-068 = L1D-193) ·
AC-T1.2 (parte S1), AC-10.4 · OL-02 (tarea 8 y tests adicionales NLI) · ADR-26, ADR-34 (regresión) ·
US-064 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8 · Medido en: US-072 (fidelidad M-07.2, M-10.1, M-10.2) ·
DoR del S1: ✓ (`backlog/sprints/S1-refinamiento.md` §1, "8 AC, en el límite") ·
Gate 1: `[S1 resp. 11]` (el LLM no genera limitaciones en el S1), `[S1 resp. 12]` (familia `503`),
`[S1 resp. 15]` (RN-23 en dos niveles), `[S1 resp. 16]` (literal de retiro), `[S1 resp. 17]` (nombres
canónicos, orden de merge) · Validación clínica de los oncólogos asesores (2026-10-14, `backlog/sprints/S1-plan.md`
§7): `[S1 resp. 29]` al retirar una frase por lenguaje se registra en el log el `ruleId` y la versión de la política
de lenguaje, nunca el texto; la traza completa pasa a US-150 (S6) · `[S1 resp. 34]` la evaluación registra
`false_positive_language_filter_rate` · `[S1 resp. 37]` registro de versiones: rag 1.2.0 (L1D-106) → **1.3.0**.

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se
> aceptan. En esta historia, el del AC-6: **falla cerrada** — si el NLI no está disponible,
> `rag-orchestrator` responde `503 NLI_UNAVAILABLE` y ninguna opción sale sin validar.
>
> Contexto del sprint que aplica: `[S1 resp. 6]` (división de US-055: el tramo de generación donde se
> invoca este validador es US-225 = L1D-275) y `[S1 resp. 5]` (hipótesis A de ADR-39: NLI
> mDeBERTa-v3-base multilingüe, change de L1D-102).

## Why

El oncólogo no puede verificar cada frase de la IA contra cada fuente (AS-IS P12, JTBD 8). El
change de L1D-179 garantiza que cada cita apunta a un chunk recuperado en esta consulta; falta la
segunda mitad de la garantía G-2: que **lo que la opción afirma esté respaldado por el texto que
cita**. Sin este validador, una justificación que agrega "reduce la mortalidad a la mitad" llegaría
al oncólogo como evidencia. Esta historia hace que toda afirmación generada pase un NLI estricto
contra los chunks citados y que lo que no lo pase se aparte (opción → `discardedOptions`) o se
omita (afirmación suelta → `omittedClaims`), y que ningún término prescriptivo generado por el LLM
llegue a la respuesta (RN-23), tampoco dentro de una descartada.

## What Changes

- **Nuevo** `apps/rag-orchestrator/app/domain/support.py` (`SupportChecker`, puro): divide la
  justificación en afirmaciones, aplica `checkProhibitedTerms` (lista de L1D-193) a cada una y, a
  las que lo pasan, el NLI estricto por afirmación contra los chunks citados; decide opción →
  `evidenceOptions` o `discardedOptions` (`afirmacion_sin_soporte`, `unsupportedClaims`) y, **si el
  generador propone una limitación**, → conservada con `origin = llm_verificado` u omitida y contada en
  `omittedClaims`. En el S1 el LLM no genera limitaciones `[S1 resp. 11]`: esa regla se prueba con un
  generador falso.
- **Umbral de soporte en configuración** (RN-22): `NLI_ENTAILMENT_THRESHOLD`; `entailment` con
  probabilidad menor que el umbral no es soporte.
- **Falla cerrada** (AC-6, `[S1 resp. 3]`): un error del adapter NLI corta la respuesta con
  `503 NLI_UNAVAILABLE`; nunca se devuelve una opción sin validar ni una respuesta parcial.
- **Texto prohibido nunca se devuelve** (RN-23, §15 resp. 2, `[S1 resp. 15]`/`[S1 resp. 16]`): una
  afirmación con término prohibido cuenta como sin soporte (`discardReason = afirmacion_sin_soporte`,
  sin cambiar el enum) y su texto se reemplaza **siempre** por "[afirmación retirada: formulación no
  permitida]" (con pregunta en inglés, "[claim removed: disallowed wording]"). `checkProhibitedTerms`
  se aplica solo a los **campos generados** (`option`, `rationale`, `unsupportedClaims`,
  `limitations[].text`, `synthesis`; tupla `CAMPOS_GENERADOS`, contrastada por test con
  `packages/clinical-language/origen-de-campos.json`), nunca a los copiados del corpus, con el origen de campos
  definida una sola vez en `packages/clinical-language` (L1D-193).
- **Puerto `NliClassifier`** en `application/ports.py`, adapter falso de test (FX-06a-b) y adapter
  real mDeBERTa (ADR-39 fase A, change de L1D-102) en `infrastructure/nli/`.
- **Integración** en la etapa de validación de `RAGOrchestratorService`, después de
  `validar_citas()` (L1D-179) y antes de `recortar_a_max_opciones()` (L1D-275).
- **Contrato (aditivo, contract-first, `[S1 resp. 12]`):** solo añade `ErrorNliNoDisponible`
  (`error: const NLI_UNAVAILABLE`) como tercera alternativa del `oneOf` del `503` de `/rag/query` que
  crea L1D-106 (`LOCAL_LLM_UNAVAILABLE`, `RETRIEVAL_UNAVAILABLE`); ejemplo
  `contracts/examples/rag-nli-no-disponible.json`; `info.version` 1.2.0 → **1.3.0** `[S1 resp. 37]`. `DiscardedOption`, `omittedClaims` y `limitations[].origin` ya están
  congelados (US-033) y no cambian.

## Capabilities

### New Capabilities

- Ninguna. La capacidad `evidence-analysis` la crea el change de **L1D-106** (US-055).

### Modified Capabilities

- `evidence-analysis`: este change **añade** (ADDED) requisitos de nombre propio sobre soporte NLI,
  descartadas por falta de soporte, afirmaciones sueltas omitidas, umbral de soporte, falla cerrada
  del NLI y términos prescriptivos generados. No redefine su `## Purpose` ni modifica requisitos de
  L1D-106, L1D-275 ni L1D-179.
- `api-contracts`: sin delta de requisitos. El cambio del `openapi.yaml` (nuevo código de error
  cerrado con ejemplo) cumple los requisitos existentes "Códigos de error cerrados y sin eco" y
  "Política de versión del contrato" sin modificarlos.

## Bounded contexts

- **ai-services** (único con código): `apps/rag-orchestrator`.
- `contratos`: `apps/rag-orchestrator/openapi.yaml`, `contracts/examples/` y regeneración de
  `packages/api-contracts` / modelos Pydantic.
- No toca `clinical-platform` (el mapeo del `503 NLI_UNAVAILABLE` en el gateway es de L1D-104, ver
  Dependencias) ni `frontend` (la UI de las descartadas es L1D-140).

## Dependencias

- ↪ **Depende de** la historia **US-231** (adapters reales de *embeddings*, *reranker*, detector de idioma y NLI, ADR-39; Linear: pendiente (límite de issues del workspace); propuesta, decisión 74 del plan): debe estar en `main` antes de este change para correr con modelos reales; los AC siguen verificándose con adapters falsos.
- ↪ **Depende de** el change de **L1D-179** (US-063): `validar_citas()` y `CitedSource` con
  `chunkTextSnapshot` copiado del corpus, que es la premisa del NLI; el soporte solo se evalúa sobre
  citas válidas.
- ↪ **Depende de** el change de **L1D-275** (US-225): tramo de generación (`GenerationOutput` con
  `options[].rationale`, sin `limitations` `[S1 resp. 11]`; el puerto `EvidenceGenerator` conserva
  `limitaciones_propuestas`, vacío con el LLM real) y orden de etapas del service donde se inserta
  `verificar_soporte()`. **Orden de merge** `[S1 resp. 17]`: L1D-164 → L1D-105 → L1D-106 → L1D-179 →
  L1D-275 → **L1D-180**; el enlace de producción de la rama con evidencia se activa en el PR de este
  change (L1D-275 D9).
- ↪ **Depende de** el change de **L1D-106** (US-055): `RAGOrchestratorService`, puertos y FX-06a-a /
  FX-06a-b.
- ↪ **Depende de** el change de **L1D-193** (US-068): lista versionada
  `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` 1.1.0 (nivel A en ejecución,
  `[S1 resp. 15]`), gemelo Python `check_prohibited_terms()` (`app/domain/lenguaje.py`) con la misma
  normalización, `packages/clinical-language/origen-de-campos.json` (origen de cada campo) y los literales
  de retiro de `[S1 resp. 16]` como casos de cero coincidencias en `conformidad/casos.json`.
- ⛔ **Bloqueado por** el change de **L1D-102** (US-012 · ADR-39 fase A): solo el adapter NLI real
  (modelo, revisión, cuantización). Todos los AC se verifican con el NLI falso, así que el
  desarrollo arranca sin esperar.
- ↪ **Depende de** el change de **L1D-164** (US-034): `Settings` (`app/config/settings.py`), raíz de
  composición (`app/bootstrap.py`), router `app/api/rag_query.py` sobre `EvidenceQueryPort` y el
  *helper* de validación de respuestas contra el spec `[S1 resp. 17]`.
- 🔗 **Consumido por** el change de **L1D-104** (US-053, gateway de `clinical-api`): su tabla única
  de mapeo lleva `NLI_UNAVAILABLE` → `502 ERROR_SERVICIO_IA`, sin persistir y sin eco `[S1 resp. 12]`;
  lo implementa L1D-104, no este change.
- 🔗 **Consumido por** el change de **L1D-140** (US-061): muestra descartadas, `discardReason` y
  `unsupportedClaims` (textos i18n de `docs/ux/S1/pantallas-s1.md`; aclara "o contenía lenguaje no
  permitido", `[S1 resp. 16]`).

## Fuera de alcance

- Validación de citas, `cita_invalida`, `sin_citas` y copia de metadatos: US-063 (L1D-179).
- Afirmaciones sobre datos del paciente (verbalización determinista + NLI, ADR-34), síntesis
  (acuerdos y discrepancias), aplicabilidad, supuestos verificados: S2–S5 y "si hay capacidad"
  (US-095, US-123, US-129, US-130, FEAT-07) con `🔗 Regresión [RN-01] → US-064`.
- Análisis previos como memoria no citable ni soporte NLI (RN-24): Regresión activa desde S4.
- Lista de términos prohibidos, `lint:lenguaje` y recorrido Playwright de la UI: US-068 (L1D-193).
- **Traza completa de cada descartada** (frase original retirada, regla, versión de la política y `chunkIds`,
  persistida sin exponerla en la UI): AC nuevo de US-150 (FEAT-T1b, S6), con su cambio de contrato y de esquema
  `[S1 resp. 29]`. En el S1 solo queda el registro en el log de `ruleId` y versión de la política.
- Elección y calibración del modelo NLI y del valor de producción del umbral: L1D-102 y US-072 (S2).
- Semáforo, *deadline* y `504` del pipeline: US-056 (S4).

## Impact

- Código: `apps/rag-orchestrator/app/domain/support.py` (nuevo), `domain/claims.py` (nuevo),
  puerto `NliClassifier` en `application/ports.py`, `infrastructure/nli/` (fake y mDeBERTa),
  `RAGOrchestratorService` (etapa de soporte), tests en `apps/rag-orchestrator/tests/`.
- Configuración: `NLI_ENTAILMENT_THRESHOLD` (nueva; `NLI_MODEL` y `NLI_MODEL_REVISION` de L1D-102).
- Contratos: `NLI_UNAVAILABLE` en el `oneOf` del `503` de `/rag/query` (aditivo, 1.3.0), ejemplo nuevo
  y regeneración.
- Evaluación: introduce un **umbral** → OL-06 obligatoria (fidelidad, precisión de citas, salidas
  prescriptivas = 0); en el S1, evaluación manual de `ai-eval-runner` (la suite llega con US-072).
- Datos: solo FX-06a-a, FX-06a-b y FX-T1a (sintéticos); ningún dato real ni identificador de
  paciente (RN-13, RN-14).
