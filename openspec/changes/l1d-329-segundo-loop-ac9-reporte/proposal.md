# Proposal — l1d-329-segundo-loop-ac9-reporte

## Trazabilidad

L1D-329 · US-271 · FEAT-12 (chatbot MVP) · Sprint 7 · **residual de la historia: AC-9 (su test y el reporte versionado)**
· deuda **D6-33** (`backlog/sprints/S6-deuda.md`; tareas 5.1, 5.2 y H-3 del change archivado) · hallazgo A1 de
`backlog/sprints/S6-trazabilidad.md` · FR-09, FR-20 · RN-02, RN-13, RN-14, RN-22, RN-27 · ADR-52 (sin reabrir), ADR-41 ·
`[S7 resp. 2]` (corrida base) · `[S7 resp. 10]` (corpus fijo de la familia) · `[S7 resp. 11]` (umbrales actuales) · regla del S7 «ninguna cifra sin reporte versionado en `reports/eval/` producido por
`run-ai-eval`» (`backlog/sprints/S7-refinamiento.md` §4) · orden del §5: el test del AC-9 se prepara **antes** de la
corrida base y el reporte sale **de** la corrida base.

El change original, `l1d-329-segundo-loop-contextual`, está archivado
(`openspec/changes/archive/2026-11-13-l1d-329-segundo-loop-contextual/`, PR #374, #377 y #380). Sus requisitos viven en
`openspec/specs/evidence-analysis/`, `patient-chat/` y `clinical-catalogs/` y **no se reescriben** aquí. El escenario
«Las tres preguntas con tema que fallan hoy pasan o quedan documentadas [US-271 AC-9]» de `clinical-catalogs` sigue
vigente tal cual: este change le da el test y el reporte que le faltan.

## Por qué

L1D-329 volvió a In Review en el cierre del S6: AC-1…AC-8 y AC-10 tienen test; el AC-9 no tiene test de aceptación ni
reporte. Los sinónimos (antraciclinas, pertuzumab, TILs) ya están en `mama/sinonimos.json`, pero nadie puede decir desde
el repositorio si las 3 preguntas (`CTX-C12`, `CTX-C13`, `CTX-C14`) superan el umbral ni, si no, por qué. La medición de
ADR-52 y la del Gate 2 vivieron en scripts del scratchpad: `app/evaluation` no tiene ninguna familia que ejecute las 60
preguntas de `preguntas-contextuales.yaml` con el contexto de un caso y el indicador activo (tarea 5.1 archivada). Sin
esa pieza versionada, `run-ai-eval` no puede producir el reporte y la regla del S7 impide citar cifras.

## Qué cambia

- **Familia `contextual` de la suite `evaluate`** (fuera de `all`; no cambia la huella de `test-fake.yaml` ni
  `baseline.json`): ejecuta las 60 preguntas sintéticas de la medición de ADR-52 por el servicio real de consulta, con
  el contexto desidentificado de casos sintéticos del fixture compartido y el indicador de expansión leído de la
  configuración de la suite. Es el «script de medición versionado» de D6-33, en su forma mínima.
- **Informe por pregunta y por clase**: estado, si superó `RELEVANCE_THRESHOLD`, `top_relevance_score` (`null` cuando no
  hay evidencia) y segundo loop usado; recuentos de genéricas con evidencia, adversarias con evidencia (falsos
  positivos) y controles con evidencia. Solo ids, puntajes y recuentos.
- **Causa de las preguntas de sinónimos** (regla pura): cada una de las 3 supera el umbral o lleva una causa de una
  lista cerrada (`termino_ausente_del_corpus`, `bajo_umbral_con_termino_en_corpus`). Un término que no está en el
  catálogo no es una causa: la suite se niega a correr (el requisito archivado exige que esté).
- **Test de aceptación `[US-271 AC-9]`** con adaptadores falsos (TDD estricto), preparado antes de la corrida base.
- **Reporte versionado** `reports/eval/l1d-329-segundo-loop-ac9-reporte.{json,md}`, de la **corrida base** del S7; lo
  escribe `ai-eval-runner` (tarea humana lanzar la corrida).
- **Sin cambio de producción**: ni `app/api`, `app/application`, `app/domain` ni `app/infrastructure`; sin cambio de
  contrato HTTP, catálogo, prompts, umbrales, modelos ni valores por defecto.

## Capacidades

### Capacidades nuevas

Ninguna.

### Capacidades modificadas

- `ai-evaluation` (ADDED, delta mínimo: un requisito, la familia `contextual` y la causa de las preguntas de
  sinónimos). Justificación: sin familia en el runner no hay reporte producido por `run-ai-eval`. Los requisitos
  existentes del runner (solo sintéticos y agregados, proveedores locales, rótulo `no_validada`) se aplican como
  regresión.
- `clinical-catalogs`, `evidence-analysis`, `patient-chat`: **sin delta**.

## Bounded contexts

- **ai-services**: `apps/rag-orchestrator/app/evaluation/` (familia `contextual`), `apps/rag-orchestrator/eval/configs/`,
  `apps/rag-orchestrator/tests/evaluation/` y `scripts/eval/evaluate.mjs` (configuración por defecto de la familia).
- **clinical-platform** y **frontend**: no se tocan.

## Dependencias

- Sin `⛔`.
- ↪ `l1d-334-diagnostico-etapas-recuperacion` (US-276): **solo por orden de merge y por reutilización**. Los dos añaden
  una familia a `config_suite.py`, `evaluate.py`, `esquema_suite.py` y `scripts/eval/evaluate.mjs`; este change va
  **después** de `l1d-334` (rebase) y reutiliza sus observadores de puertos si ya están en `main`. No depende de su
  dataset ni de su medición.
- **Orden de los archivos de la suite** (propuesta de planificación, se aprueba con el plan): `l1d-334` → **este
  change** → `l1d-331` (parte de código) → `l1d-336` → `l1d-335` → `l1d-337`. Cada uno rebasa sobre el anterior.
- 🔗 Produce para: `l1d-331-cobertura-prostata-segundo-loop` (US-273): amplía esta familia **antes de la corrida base**
  y añade el tercer caso (`prostata-con-psa-y-hrr`). La corrida base ejecuta la familia con los tres casos.
- 🔗 `l1d-335-sinonimos-procedimientos-relacion` (US-277): llega después y cambia el cargador de sinónimos (solo
  `equivalente`). La regla de la causa de este change necesita **todas** las formas del término; `l1d-335` la repunta
  al cargador de todos los textos (design D4).
- 🔗 Produce para: `l1d-333-reporte-h3` (US-275): los recuentos de adversarias y controles con la expansión activa
  (AC-4 de US-275) salen de esta familia. `l1d-333-reporte-h3` va **después**.
- 🔗 Corrida base del S7 (`[S7 resp. 2]`): comparte ventana con `l1d-119`, `l1d-334`, `l1d-113`, `l1d-246` y `l1d-299`.
  La familia usa el corpus del dataset `s5-corpus-ampliado` en memoria (el de la medición de ADR-52), **el mismo en la
  corrida base y en la final**, registrado en cada reporte (`[S7 resp. 10]`); no depende de la ingesta del corpus
  ampliado de `l1d-119`. Corre con los umbrales actuales en las dos corridas (`[S7 resp. 11]`).
- En `main`: L1D-298 (`proveedor: local` del runner), L1D-333 (valores por defecto vigentes: 20 pares y expansión
  activa).

## Fuera de alcance

- El resto de D6-33: la suite del **nodo de relevancia** del chat y su dataset de etiquetas de pertinencia (L1D-326 /
  Post-MVP).
- Cambiar sinónimos, léxico, umbral o valores por defecto para que las 3 preguntas pasen: el AC admite «documentada con
  su causa». Ampliar sinónimos y el campo `relacion` es `l1d-335` (US-277).
- El diagnóstico por etapa de una pregunta que no pasa (`l1d-334`): este informe solo dice si el término está en el
  corpus.
- D6-48 (medición de híbrida frente a densa), `evaluate:chat` (L1D-326) y el reporte H-3 de US-275 (`l1d-333-reporte-h3`).
- Mover L1D-329 en Linear y actualizar `backlog/`: lo hace `/sprint-close`.
