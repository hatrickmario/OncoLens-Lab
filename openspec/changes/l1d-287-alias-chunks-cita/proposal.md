# Proposal — l1d-287-alias-chunks-cita

## Trazabilidad

L1D-287 · US-236 · FEAT-T1a (L1D-34) · Sprint 3 · Estimación **3** · HU-03 · RN-04 (dueña: la cita
sale del corpus, no del texto generado) · RN-01 (regresión) · RN-06 (alias nunca persistidos) ·
RN-24 · AC-T1.2, AC-T1.3, AC-10.4 · M-07.2 (precisión de citas ≥ 0,90) · OL-06 · US-236 AC-1 … AC-7 ·
↪ US-063 (`l1d-179-citas-chunk-recuperado`, archivado), US-055 · 🔗 Regresión [RN-01] → US-064
(`l1d-180-soporte-nli-descartadas`, archivado) · 🔗 Regresión [RN-04] → US-063 · 🔗 Medido en: US-072
(precisión de citas) · DoR del S3: ✓ "Confirmada en el S3; AC-7 sobre el dataset actual"
(`backlog/sprints/S3-refinamiento.md` §2, `[S3 resp. 8]`) · **Recorrido principal:** sí.

> **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** el AC-7 mide sobre el dataset de evaluación
> actual (`data/evaluation/`, US-072) y no sobre la partición congelada de US-226 (FEAT-T5e, sin
> sprint comprometido).
>
> **Decidido (usuario, 2026-10-24, `[S3 resp. 15]`):** este change va **primero** y sube el prompt a
> `rag-query@0.3.0`; `l1d-181-procedencia-contexto-ia` va después, hace *rebase* sobre él y sube a
> `rag-query@0.4.0`, con su medición `evaluate` sobre el prompt con alias y etiquetas.
> `l1d-288-motivos-solo-descartadas` también va después (comparten `_validar_citas_y_ensamblar`).
>
> **Supuestos "(asumido)" vigentes:** AC-4 (el `chunkId` real devuelto por el LLM se rechaza: el
> alias es el único formato aceptado y no se repara ningún id "parecido") y AC-7 (10 corridas de la
> pregunta del origen; se recalibra en el refinamiento si la varianza lo exige).

## Why

En la demo del 2026-10-23 (paciente de mama (a), LLM real `gemma4:26b-a4b-it-q4_K_M`, pregunta «¿Cuándo
se considera un inhibidor de CDK4/6 adyuvante?») el único chunk citable era
`pmc-mama-cdk46-guia@a3bb26468a32#0000` y el LLM lo copió mal dos veces (letras inventadas, LaTeX en
medio). `validar_citas()` —coincidencia exacta, RN-04— descartó la opción con `cita_invalida` y el
oncólogo vio «No hay opciones descritas con soporte verificable…» cuando sí había evidencia. Es un
fallo mecánico de transcripción, no de soporte: hay que quitarle al LLM la tarea de copiar un id largo
sin abrir ninguna vía que acepte texto generado como cita.

## What Changes

- **Alias efímeros por consulta** (`C1…Cn`): a cada chunk **entregado a la generación** se le asigna un
  alias por orden de `relevance_score` descendente (desempate por `chunkId`), determinista para la
  misma entrada.
- **Prompt `rag-query` con alias**: cada fragmento se presenta con su alias y el prompt no contiene
  ningún `chunkId` real; la instrucción de citar pide el alias. Sube `VERSION_DEL_PROMPT` a
  `rag-query@0.3.0` (`[S3 resp. 15]`).
- **Traducción alias → `chunkId` real** al parsear la salida del LLM, antes de la validación de citas:
  `validar_citas()` sigue comparando contra `chunkId` reales sin cambios. Un alias inexistente o
  cualquier otro texto (incluido un `chunkId` real) se traduce a una marca no citable, de modo que la
  opción termina en `discardedOptions` con `cita_invalida` (nunca `sin_citas`, nunca reparada).
- **Alias fuera de toda salida**: ni la respuesta (`citedSources[].chunkId` es el real), ni el
  `AIAnalysisRecord` de `clinical-api` ni los logs contienen alias como identificador.
- **Fixtures**: el LLM falso a nivel de cliente (`FakeLlmClient`, FX-06a-b) cita alias; nuevos
  escenarios para alias inexistente y `chunkId` real.
- **Evaluación obligatoria** (cambia el prompt): `run-ai-eval` con `ai-eval-runner`, LLM real sobre el
  dataset actual y la pregunta del origen ×10; reporte adjunto al PR.
- **Sin cambio de contrato**: `apps/rag-orchestrator/openapi.yaml` y `contracts/schemas/evidence.yaml`
  no cambian (`DiscardedOption` no expone citas; `CitedSource.chunkId` sigue siendo el real).

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis`: se **añaden** (ADDED) los requisitos de alias de chunks en el prompt, su
  traducción antes de validar y su carácter efímero. Los requisitos existentes de citas (L1D-179) y
  soporte (L1D-180) no cambian: se reutilizan como regresión.
- `ai-evaluation`: se **añade** (ADDED) la medición de citas con el LLM real sobre el dataset actual y
  la pregunta del origen (AC-7).

## Bounded contexts

- **ai-services** (único con código): `apps/rag-orchestrator` (`app/domain/`, `app/application/generation.py`,
  `app/prompts/rag_query.py`, `tests/`).
- **clinical-platform**: sin código; solo un test de regresión que comprueba que el `AIAnalysisRecord`
  persistido no contiene alias (AC-5). Si el implementador de ai-services no puede tocarlo, lo despacha
  el orquestador a `clinical-platform-dev`.
- **frontend**: no se toca.

## Dependencias

- ↪ `l1d-179-citas-chunk-recuperado` (US-063, archivado): `validar_citas()`, `construir_cita()`.
- ↪ `l1d-180-soporte-nli-descartadas` (US-064, archivado): soporte NLI y términos prohibidos, regresión.
- ↪ US-225 (L1D-275, archivado en el S2): `LlmEvidenceGenerator`, prompt `rag-query`, presupuesto de
  fragmentos.
- 🔗 Coordinación de merge (mismo archivo, sin dependencia lógica): `l1d-128-aplicabilidad-textual-citada`
  usa `validar_citas()` para el camino textual de aplicabilidad con su propio proponente; no consume el
  prompt `rag-query`. Si mergea después, rebasa; ver `design.md` → Riesgos.
- 🔗 Orden de merge `[S3 resp. 15]`: **este change primero**. Después van
  `l1d-181-procedencia-contexto-ia` (US-065: *rebase* sobre este, etiquetas de procedencia en el mismo
  prompt, `rag-query@0.4.0`, `evaluate` sobre el prompt con alias y etiquetas) y
  `l1d-288-motivos-solo-descartadas` (US-237: recuento por motivo en el log de
  `_validar_citas_y_ensamblar`, que este change toca).
- 🔗 Produce para: US-233 (S4, medición con el LLM real) y US-072 (precisión de citas).

## Fuera de alcance

- Reparación difusa de ids (distancia de edición, prefijos): excluida a propósito (AC-4).
- Alias en el camino textual de aplicabilidad (US-123, `l1d-128-aplicabilidad-textual-citada`): si su
  medición en US-233 muestra el mismo fallo, se extiende allí.
- Partición congelada de evaluación (US-226, FEAT-T5e, sin sprint).
- Cambios de contrato OpenAPI y de UI.
