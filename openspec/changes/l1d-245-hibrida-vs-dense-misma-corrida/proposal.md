# Proposal — l1d-245-hibrida-vs-dense-misma-corrida

## Trazabilidad

L1D-245 · US-133 · FEAT-T5b · Sprint 4 (desde `si-hay-capacidad`, `[S4 resp. 19]`) · Estimación **3** · FR-20 · M-06.1 ·
RN-22 (tolerancia en configuración), RN-14 (solo sintético) · US-133 AC-1…AC-5 · ADR-45 (brazos A0, A2, A2b; protocolo P1–P2) ·
`[S4 resp. 17]` `[S4 resp. 18]` `[S4 resp. 19]` · OL-06 · Sprint: `backlog/sprints/S4-refinamiento.md`.

## Dependencias

- ⛔ **`l1d-109-busqueda-hibrida-retrieval-mode`** (US-112: `RETRIEVAL_MODE = dense | hibrida`, `RETRIEVAL_FUSION = rrf | ponderada`, `RRF_K`, `HYBRID_SPARSE_WEIGHT`; `meta.retrievalParams.fusion` = `ninguna | rrf | ponderada` y `fusionParam` numérico, ambos obligatorios y sin `null`): este change mide lo que aquel implementa; sin el flag no hay brazos A2/A2b.
- ⛔ **l1d-298-evaluate-modelos-locales** (US-233a): `proveedor: local` y `eval/configs/local.yaml` con los modelos de ADR-39. Sin ellos la corrida real no es válida.
- ↪ **l1d-235-suite-evaluate** (US-072, archivado): runner, dataset de recuperación y `retrieval_metrics.py`; se extienden, no se rehacen.
- Fuera: US-113 (expansión bilingüe, A3/A4) no es dependencia; sigue en `si-hay-capacidad`.
- 🔗 Mide a FEAT-06b. Su resultado decide el modo de la demo (`hibrida` solo sin retroceso, `[S4 resp. 17]`); adoptar la híbrida como definitiva exige cerrar ADR-45 (validación y prueba), fuera de esta historia.

## Por qué

El baseline del S1 salió con adaptadores falsos y modelos distintos de los de ADR-39, así que no sirve de comparación. Para no empeorar lo que el oncólogo ya recibe hay que comparar híbrida y densa **en la misma corrida**, con los mismos modelos locales, corpus y preguntas (ADR-45: no se adopta una mejora de recuperación sin medirla).

## Qué cambia

- **Configuración `eval/configs/s4-hibrida.yaml`** con tres brazos sobre el mismo índice: A0 (*dense*), A2 (híbrida, RRF, k = 60) y A2b (suma ponderada, 0,3). Solo cambian `RETRIEVAL_MODE`, `RETRIEVAL_FUSION` y su parámetro (`RRF_K` o `HYBRID_SPARSE_WEIGHT`) (AC-1).
- **Reporte** con recall@10 total, recall@10 es→en y MRR por brazo y la diferencia de A2 y A2b frente a A0 en la misma corrida (AC-1).
- **Regla de retroceso** con `RETRIEVAL_REGRESSION_TOLERANCE` (configuración, RN-22): un brazo híbrido peor que A0 más allá de la tolerancia en cualquiera de las tres métricas se marca «retroceso» y la suite sale con código ≠ 0 (AC-2).
- **Trazabilidad por consulta:** `meta.retrievalParams` con `retrievalMode`, `fusion` y `fusionParam` coherentes con el brazo en el 100 % de las consultas (AC-3).
- **Reproducibilidad** con la configuración falsa (AC-4) y **guarda de partición** (AC-5): solo el conjunto de desarrollo de `data/eval/ol06-particion-v1`, verificación de `golden_sha256`, validación y prueba sin abrir (ADR-45 P2).
- **Preinscripción ADR-45 P1** commiteada antes de la primera corrida real (hipótesis, brazos, hiperparámetros sin barrer, métrica, regla de decisión).

## Capacidades afectadas y bounded contexts

- Capacidad: `ai-evaluation` (solo ADDED, requisitos nuevos de comparación de recuperación; sin MODIFIED para no chocar con el delta de l1d-298, que también es solo ADDED). Sin capacidad nueva.
- Contexto: **ai-services** (`apps/rag-orchestrator/app/evaluation/`, `eval/configs/`). Sin cambios en `clinical-api`, `web` ni contratos.

## Fuera de alcance

- Expansión bilingüe y traducción (A3, A4), pool de 48 (A1), contexto de chunk (A5).
- Uso de los conjuntos de validación y prueba, y cierre de ADR-45; adopción definitiva de la híbrida.
- Cambiar modelos, prompts, umbrales o corpus; el barrido de k o pesos (P1: no se barren).
- Implementar la recuperación híbrida (US-112).
