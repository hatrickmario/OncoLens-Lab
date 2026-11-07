---
name: chat-evaluate-l1d326-trampas
description: Cómo quedó la familia chat de evaluate (L1D-326) y trampas del enrutado, NLI léxico, pii-scan y el arnés del worktree
metadata:
  type: project
---

`app/evaluation/chat.py` compone el `ChatTurnService` REAL (evidencia, fuentes y relevancia incluidas) sobre `componer_servicio` + `PosicionesDelDataset`; el LLM falso es `ClienteDelChat` (guion por caso en `data/eval/chat-v1/casos.yaml`) y el corpus es `data/evaluation/opciones` (las preguntas AC05 deben ser EXACTAMENTE las de ese dataset: `GeneradorGuionado` busca por texto). Un caso con `previo` continúa el hilo (AC06 tras AC05).

**Why:** el modal normativo («debe recibir») muere en `validar_forma_de_afirmacion` ANTES del filtro de términos prohibidos; para probar que el filtro de RN-23 detecta algo hace falta un control sin modal («recomendado para este paciente») y NLI forzado a `entailment`.
**How to apply:**
- El NLI léxico (`NliLexico`) exige que los tokens de >=4 letras de la hipótesis estén en UNA sola premisa (verbalización del hecho): una interpretación con dos `factRefs` suele quedar omitida; un `documentado` solo necesita `factRefs` (texto lo escribe el código).
- pii-scan marca como `documento_identidad` un DOI en `documentId` (no en `externalId`) y también el texto de `motivo` de la allowlist: no escribir el DOI en el motivo.
- El rojo de aceptación se deja con `NotImplementedError` en el esqueleto; `ruff format` reescribe el test tras el commit rojo, formatea ANTES de commitear.
- Bash del worktree: no encadenar `git` con heredocs/`python3 - <<` en el mismo comando; escribir scripts en el scratchpad con Write y ejecutarlos aparte; `ln -s` de `node_modules` temporal y borrarlo al terminar.
