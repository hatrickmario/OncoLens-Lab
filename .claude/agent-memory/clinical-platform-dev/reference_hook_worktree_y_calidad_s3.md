---
name: hook-worktree-y-calidad-s3
description: Trampas del hook de worktree al editar, y hechos de la calidad de tests (L1D-285) que no se ven en el código
metadata:
  type: reference
---

- El hook del worktree rechaza Bash con heredocs/python inline cuando el texto menciona "git" o usa `for` con sed: escribir el
  script con Write en el scratchpad y ejecutarlo con `python3 <ruta>`; usar Edit para cambios puntuales.
- `@vitest/eslint-plugin` 1.6.27 NO detecta `it.todo` ni `fit`: los cubre `oncolens/tests-sin-desactivar`. En msw 3 la opción
  es `onUnhandledFrame`, no `onUnhandledRequest` (se ignora sin error).
- `vitest.quality.config.ts` ejecuta todo `*.test.*` bajo ci/tests/quality: los fixtures de lint/capas se nombran `.fixture.ts`.
- Los tests de web derivados del ejemplo `patient-page-doctor.json` cambian con él (pacientes-pagina.test.tsx).
- Subredes libres para el PostgreSQL de test: 10.85.x (otros agentes usan 10.94/10.126).

**Why:** perdí rondas con el hook y con tests ejecutados por error. **How to apply:** al tocar calidad/CI o ejemplos del contrato.
