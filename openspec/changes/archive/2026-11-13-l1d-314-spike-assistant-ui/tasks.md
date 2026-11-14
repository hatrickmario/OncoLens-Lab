# Tasks — l1d-314-spike-assistant-ui

> Spike (US-257 · L1D-314). Matriz TDD: **exento** (el código del spike no se mergea); evidencia con
> Playwright y `visual-check` (solo `localhost` y seed sintético). Timebox: 3 puntos; si se agota sin
> AC-1…AC-4 en `cumple`, la salida es shadcn. Sin cambios de API (no hay `## contratos`) ni de specs
> (`skip_specs: true`). Lo único que entra a `main` es el reporte y ADR-51 §8.

## 1. frontend (rama desechable `spike/l1d-314-assistant-ui`, sin merge)

- [x] 1.1 Crear la rama `spike/l1d-314-assistant-ui` desde `main`; instalar `@assistant-ui/react@0.15.32` Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      solo ahí y registrar `npm audit` · **exento**
- [x] 1.2 Respuestas fijas: usar `contracts/examples/chat-turn-*.json` de l1d-315/l1d-316 o, si aún no Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`. Copia local del contrato: repetir con los ejemplos reales de `chat-turn-*.json` DIFERIDA -> L1D-324.
      están en `main`, una copia local con la forma de sus `design.md` (anotarlo en el reporte), sobre el
      paciente semilla (a) (FX-12-a); incluir una respuesta hostil con `<img src=x onerror=alert(1)>` y un
      enlace `javascript:alert(1)` · **exento** `[US-257 AC-1]` `[US-257 AC-4]`
- [x] 1.3 Route Handler del prototipo en el mismo origen (`app/api/spike-chat/route.ts`) que sirve esas Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      respuestas · **exento** `[US-257 AC-5]`
- [x] 1.4 CSP objetivo de US-216 (sin `unsafe-eval` ni `unsafe-inline` en `script-src`) en `proxy.ts` de la Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      rama si L1D-266 no está mergeado · **exento** `[US-257 AC-2]`
- [x] 1.5 Prototipo con `ExternalStoreRuntime` (o `LocalRuntime`), maquetado según Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      `docs/ux/S6/variante-b.html`, reutilizando los componentes del panel; solo APIs estables;
      Markdown sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` que devuelve `''` si `esUrlHttpSegura()` (L1D-266) es falso; avisos RN-19
      en cada turno y encabezado «Opciones descritas en la evidencia» en el de evidencia · **exento**
      `[US-257 AC-1]` `[US-257 AC-3]` `[US-257 AC-4]` `[US-257 AC-6]`
- [x] 1.6 Playwright (`e2e/spike-assistant-ui.spec.ts`, tiempo máximo explícito) que recorre los cinco Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      escenarios `[S6 resp. 2]`: listener de `securitypolicyviolation` = 0, todas las peticiones al origen
      de `web`, con el bloque Markdown `<img src=x onerror=alert(1)>`: DOM sin `img` del payload, manejador no ejecutado y ningún `href` que no pase `esUrlHttpSegura()`,
      avisos RN-19 y encabezado RN-23 presentes · **exento** `[US-257 AC-1]` `[US-257 AC-2]` `[US-257 AC-4]`
      `[US-257 AC-5]` `[US-257 AC-6]`
- [x] 1.7 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px, una por escenario ·
      **exento** `[US-257 AC-1]`
- [x] 1.8 Medir el peso gzip de `@assistant-ui/react` con `next build` (First Load JS de la ruta con y sin Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      la librería) · **exento** `[US-257 AC-7]`
- [x] 1.9 Inventario de importaciones del prototipo: cada API usada con su estado en la documentación Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      0.15.x (estable / `experimental` / `unstable_` / `beta`) · **exento** `[US-257 AC-3]`

## 2. documentación (entra a `main`)

- [x] 2.1 Reporte `docs/evidence/S6-spike-assistant-ui/README.md`: `cumple | no cumple` por escenario con Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      su captura, resultado de AC-2…AC-6, APIs y estado, peso gzip, `npm audit`, versión de los ejemplos
      usados y propuesta de componentes para US-267 · **exento** `[US-257 AC-1…AC-7]`
- [x] 2.2 Anotar ADR-51 §8 «UI»: «assistant-ui» si AC-1…AC-4 cumplen, si no «shadcn sobre los componentes Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      del panel»; fecha, peso gzip medido, enlace al reporte; estado de la parte de UI de «abierta» a
      «decidida» (cierra US-256 AC-4) · **exento** `[US-257 AC-7]` `[ADR-51]`
- [x] 2.3 Cerrar la rama `spike/l1d-314-assistant-ui` sin merge y anotarlo en el reporte · **exento** Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`.
      `[US-257 AC-7]`

## 3. verificación

- [x] 3.1 `openspec validate l1d-314-spike-assistant-ui --strict` en verde; `data-scan` y `pii-scan` en Evidencia: rama `spike/l1d-314-assistant-ui` (32d44c24) y `docs/evidence/S6-spike-assistant-ui/README.md`. `data-scan` y `pii-scan` los comprueba la CI del PR #357 (no se corrieron en local).
      verde sobre el reporte y las capturas (solo seed sintético)
