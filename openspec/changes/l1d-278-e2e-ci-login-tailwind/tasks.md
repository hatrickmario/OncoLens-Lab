# Tasks — l1d-278-e2e-ci-login-tailwind

## 1. clinical-platform

- [ ] 1.1 [Test después · CI] Test de `playwright.config.ts`: `retries: 1` y `trace: 'on-first-retry'` solo con `CI=true` [ARR-02 AC-1]
- [ ] 1.2 [Test después] Check que rechaza `test.skip`/`test.only`/`test.fixme` en `apps/web/e2e/` (paso previo del job) con su test [ARR-02 AC-1]
- [ ] 1.3 Modo CI de `scripts/e2e/ejecutar.sh` (reporter `github` + `html`, sin `--mantener`, tiempo máximo explícito de espera del stack)
- [ ] 1.4 `.github/workflows/e2e.yml` (design.md D1): Docker en el *runner*, `npm ci`, `playwright install --with-deps chromium`, `npm run test:e2e`, artefactos de informe y trazas con `retention-days: 3`; fuera de `ci-ok` [ARR-02 AC-1]
- [ ] 1.4b [Test después] Trazas sin cuerpos de request: el *fixture* de E2E quita `postData`/cuerpos de `POST /api/*` de la traza, con test que comprueba que la traza de un login fallido no contiene la contraseña de prueba; usuarios de E2E sintéticos (`@example.test`, contraseñas generadas en `ejecutar.sh`, no versionadas) (design.md D1)
- [ ] 1.5 Verificar en el PR que el job ejecuta los 15 E2E en verde; documentar en `docs/process/ci.md` el criterio de estabilidad (design.md D2) y diferir el paso a requerido a ARR-06 (L1D-282)
- [ ] 1.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-278)`

## 2. frontend

- [x] 2.1 Test del AC primero: test de UI de `/login` que exige `Alert` con `role="alert"` y ausencia de `.module.css` en `app/login/` en rojo [ARR-02 AC-3] · Testing Library, commit `test(L1D-278)`
- [x] 2.2 [Test del AC primero] Instalar Tailwind v4 (`tailwindcss`, `@tailwindcss/postcss`, `postcss.config.mjs`) y `@theme` en `globals.css` con los tokens de `docs/ux/sistema-de-diseno.md` §1 (design.md D3); `npm audit` del cambio adjunto
- [x] 2.3 Átomos `components/ui/{card,input,label,button,alert}.tsx`, `lib/utils.ts` (`cn`) y `components.json`
- [x] 2.4 Migrar `app/login/page.tsx` y `organisms/login-form.tsx`; borrar `login.module.css`, `login-form.module.css` y `molecules/campo-con-etiqueta*`; tests de UI y E2E de login en verde sin cambiar aserciones [ARR-02 AC-3] · commit `feat(L1D-278)`
- [x] 2.5 Tipografía: token `--font-sans` con `system-ui` (Public Sans autoalojada queda para otra historia; design.md D3)
- [x] 2.6 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo. Incluir la pantalla de análisis a 1280 px para descartar efectos del *preflight* de Tailwind [ARR-02 AC-3]
- [x] 2.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-278)`

## 3. Cierre

- [x] 3.1 `openspec validate l1d-278-e2e-ci-login-tailwind --strict`
- [ ] 3.2 `npm test --workspace apps/web`, `npm run build --workspace apps/web` y `npm run test:e2e` en verde; job `e2e` verde en el PR
