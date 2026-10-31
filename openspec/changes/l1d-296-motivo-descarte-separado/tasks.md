# Tasks — l1d-296-motivo-descarte-separado

> Sin cambio de API: no hay tareas en `## contratos` (web es consumidor; el valor aditivo `lenguaje_no_permitido`, los ejemplos `con-evidencia-solo-descartadas-lenguaje.json` y `con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json`, la clave en `INDICE_DE_MOTIVO` y la etiqueta provisional los entrega `l1d-295`/US-245 (D-b), que debe estar mergeado; `contracts:check` sin cambios). Solo **frontend**. Diseño: `docs/ux/S4/pantallas-s4.md` S4-02.

## frontend

- [x] 1.1 Fixtures: handlers MSW desde `contracts/examples/` (incluidos `…-lenguaje.json` y `…-sin-soporte-y-lenguaje.json`, creados por `l1d-295`); caso de motivo desconocido por override de MSW dentro del test (no es ejemplo del contrato) · test después (fixture)
- [x] 1.2 Mensajes en `apps/web/messages/es.json`: `evidence.discardReason.afirmacion_sin_soporte` («Una afirmación no tiene soporte en la fuente citada»), confirmar `lenguaje_no_permitido` (provisional de `l1d-295`), título de la sección «Descartadas en la verificación — solo para revisión», rótulo de afirmación no verificada, nota de lenguaje y «(texto no mostrado)»; sin clave de motivo desconocido · test del AC primero (cubierto por 1.3, AC-4)
- [x] 1.3 Tests de aceptación en rojo AC-1, AC-2, AC-3, AC-4, AC-5 (`… [US-246 AC-n]`): resumen y lista por motivo, título nuevo, filtro RN-23 y literal «(texto no mostrado)» sin rótulo conservando el motivo recibido, `unsupportedClaims` ocultas en `lenguaje_no_permitido`, mixtos con «n × », etiquetas de `es.json` + `lint:lenguaje` + aviso `role="note"`, motivo desconocido → estado de error existente del panel (`evidence.error.generico` + «Reintentar», sin valor crudo; el Zod generado no se relaja) · Vitest + Testing Library + MSW · test del AC primero · commit `test(L1D-296)`; esqueletos solo si falta un símbolo
- [x] 1.4 Extraer `mostrarSiPermitido()` (RN-23, `checkProhibitedTerms`) y `descripcionDeDescartada()` (exhaustiva sobre el tipo generado, sin rama de motivo desconocido); ajustar `DiscardReasonsSummary` y `DiscardedOptions` (extraer `DiscardedOptionItem` si pasa de 100 líneas); `resumirMotivos()` sin cambios salvo lo que exijan los tests; AC-1…AC-5 en verde · test del AC primero · commit `feat(L1D-296)`
- [x] 1.5 Regresiones: tests existentes de `evidence-panel*.test.tsx`, `resumir-motivos.test.ts` y `panel-analisis.spec.ts` actualizados solo en la etiqueta cambiada (sin relajar aserciones; `Test-Removal:` si un AC cambió), [RN-23] (US-068) y [RN-19] (US-069) en verde · test después (suite existente)
- [x] 1.6 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px contra S4-02; cada fallo se convierte primero en un test en rojo
- [x] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-296)`

## Cierre

- [x] 2.1 `openspec validate l1d-296-motivo-descarte-separado --strict`, tests de `apps/web` en verde, `contracts:check` sin cambios
