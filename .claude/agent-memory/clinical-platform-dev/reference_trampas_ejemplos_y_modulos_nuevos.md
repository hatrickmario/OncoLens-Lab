---
name: trampas-ejemplos-y-modulos-nuevos
description: Trampas al publicar un ejemplo de 200 en contracts/examples y al añadir una carpeta de integración nueva en clinical-api (L1D-74)
metadata:
  type: reference
---

- `assertErrorsNoEcho` trata todo ejemplo cuyo destino contiene `/responses/` como ejemplo de error: una propiedad `value` lo rompe. Registrar el 200 contra `#/components/schemas/<Schema>`, no contra `…/responses/200`.
- `pii-scan` lee un uuid que empieza con letras y luego 6+ dígitos (p. ej. `d1087510-…`) como `documento_identidad` cuando va tras la clave `id`. Si el ejemplo lleva uuid v5 derivados, probar el namespace con `coincidenciasPii` (scripts/lib/formatosPii.mjs) antes del commit `contract`.
- Carpeta nueva de `tests/integration/<x>/`: añadirla al `include` de `vitest.integration.config.ts` Y al `exclude` de `vitest.config.ts` (lo comprueba `config-vitest-integracion.test.ts`); cada archivo necesita `ESPACIO_DE_IDS` único; la base es una por archivo, así que los ids fijos de un fixture solo chocan dentro de un archivo.
- Un router nuevo se añade a `RoutersProtegidos` (composition.ts): obliga a tocar tres llamadas de prueba a `componerRutasProtegidas`.
- `npm run quality` y `format:check` necesitan en el PATH un venv con `ruff` e `import-linter` (pip install ruff import-linter); los 13 fallos de `evalRequired` en `npx vitest run` son de `pydantic_settings` ausente (entorno).
- `tasks-destino.mjs` no reconoce `ARR-nn` como ID destino: añadir también un `L1D-nn` (p. ej. el change que archiva ARR) en la tarea trasladada.

**Why:** costaron vueltas en L1D-74. **How to apply:** antes de publicar ejemplos o abrir un módulo/carpeta nueva.
