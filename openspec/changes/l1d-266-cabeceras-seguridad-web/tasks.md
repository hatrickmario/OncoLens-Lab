# Tasks — l1d-266-cabeceras-seguridad-web

> P-1 (`style-src-attr 'unsafe-inline'`) decidido: aceptado [S6 resp. 19]. Sin cambios de contrato: no hay
> sección `## contratos`.

## frontend

- [x] 1.1 Tests en rojo, con nombres `[US-216 AC-n]`: unitarios de `construirCsp()` (directivas de AC-1, sin `unsafe-inline`/`unsafe-eval` en `script-src` con `aplicar`; `Report-Only` y `unsafe-eval` solo con `solo_informe` en desarrollo) y de `proxy()` con nonce congelado (cabecera de respuesta y `x-nonce` de request; `/pacientes` sin cookie sigue redirigiendo con `no-store`); test de configuración (`solo_informe` + `NODE_ENV=production` falla nombrando `WEB_CSP_MODO`); esqueleto `lib/server/csp.ts` que lanza `new Error('no implementado')` · **test del AC primero** · commit `test(L1D-266)`
- [x] 1.2 Tests en rojo de AC-3 y AC-5 (Testing Library): `EvidenceAnalysis` sintético con `<img src=x onerror=alert(1)>` y `<script>` en síntesis y `chunkTextSnapshot` (texto literal, sin `img`/`script` nuevos, `window.__xss` indefinido); citas con `javascript:` y `data:` sin `a`; `https:` con `target="_blank"` y `rel="noopener noreferrer"` · **test del AC primero** · commit `test(L1D-266)` (si ya pasan, se registra como regresión en el mismo commit)
- [x] 1.3 E2E en rojo (Playwright contra Compose, seed sintético, `LLM_PROVIDER=fake`) en `apps/web/e2e/cabeceras-seguridad.spec.ts`: AC-1 (CSP y cabeceras en `/login`, `/pacientes` con sesión, `GET /api/patients/{id}/case` y un estático; nonce distinto en dos requests y en cada `<script>`; consola sin violaciones de CSP) y AC-2 (página de prueba en otro origen con `<iframe>` hacia `/login` y `/pacientes`: no cargan) · **test del AC primero** · commit `test(L1D-266)`
- [x] 2.1 `lib/server/csp.ts` (`construirCsp`, `generarNonce` inyectable) y `proxy.ts` con *matcher* ampliado; `app/layout.tsx` lee `x-nonce` · AC-1 unitarios en verde · commit `feat(L1D-266)`
- [x] 2.2 `headers()` en `next.config.ts` (`nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`); `WEB_CSP_MODO` validado al arrancar; corregir `citation-details.tsx` si falta `target`/`rel` · AC-1, AC-2, AC-3, AC-5 en verde · commit `feat(L1D-266)`
- [x] 2.3 N/A: sin cambio visible (solo cabeceras y un meta/nonce); lo cubre el E2E completo de 76 tests con consola sin violaciones de CSP. Loop visual (visual-check) original: estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px en `/login`, `/pacientes`, ficha, vista de caso y análisis; cada fallo se convierte primero en un test en rojo
- [x] 2.4 Refactor: sin cambios (archivos nuevos pequeños y de un solo concepto). Plantilla: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-266)`

## ci (quality)

- [x] 3.1 Tests de `scripts/ci/public-env.mjs` en `scripts/ci/__tests__/` con fixtures (variable fuera de la lista → código ≠ 0 nombrando variable y archivo sin valor; árbol real con lista vacía → 0, ejecutando el comando real sobre el repo, tiempo máximo explícito) · **test después** (script de CI) · mismo PR
- [x] 3.2 `config/public-env.allowlist.json` (`{ "variables": [] }`), `scripts/ci/public-env.mjs` y su paso en el job `quality` · commit `feat(L1D-266)`
- [x] 3.3 Escaneo del bundle en `apps/web/tests/build/`: `next build` con centinelas sintéticos (`CLINICAL_API_URL` y clave PEM ficticia), recorrido de `.next/static/` con los patrones de `.gitleaks.toml` y los centinelas, reporte solo de rutas; extraer el recorrido de `url-interna.test.ts` a un helper compartido; tiempo máximo explícito · **test después** · commit `feat(L1D-266)`
- [x] 3.4 Regresión AC-3/AC-4 del lint: confirmar que los fixtures `dangerously-set.tsx` y `cliente-importa-server.tsx` siguen fallando en `ci/tests/quality/web-lint.test.mjs` (sin cambios si ya lo cubren) · **test después**
- [x] 3.5 Refactor: sin cambios; el recorrido de archivos ya se extrajo al helper compartido. Plantilla: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-266)`

## humano

- [ ] H-1 Añadir a `.env.example` (bloque de `web`) · DIFERIDA -> H-1

```
# Modo de la CSP de web: aplicar | solo_informe (solo_informe solo en `next dev`; en producción aborta el arranque).
WEB_CSP_MODO=aplicar
```
