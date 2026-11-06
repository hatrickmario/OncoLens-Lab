---
name: rn12-selector-l1d204
description: L1D-204 (RN-12): selector de proveedor del LLM con ContextVar, guarda de entorno sintético de clinical-api que impide probar real, y trampas del arnés
metadata:
  type: project
---

El selector (`app/application/selector_proveedor_llm.py`) envuelve el cliente local por la fábrica (`envolver_cliente`) y lee la clasificación de un `ContextVar` que abren `consultar`, `responder` (seguimiento) y `ChatTurnService.turno`; sin contexto = solo local. En clinical-api la guarda `exigirEntornoSintetico` (S1 resp. 14d, la retira US-143) corta a todo paciente real antes de llamar a rag, así que las pruebas de RN-12 con `data_origin` real necesitan `omitirGuardaDeEntornoSintetico` en `tests/support/gateway.ts`.

**Why:** sin esa opción los escenarios del delta (503/502 con paciente real) son inalcanzables por el gateway.
**How to apply:** el error de validación del borde del gateway es `422 CUERPO_INVALIDO`, no `400`. En el worktree, `ruff check --fix` con la regla I reordena imports ajenos: no la uses sobre `app/`; verifica con `git status` y revierte el ruido.
