# Tasks — l1d-265-lint-format-base

> Matriz TDD de `CLAUDE.md`: configuración, scripts y CI → **test después** (fixture o humo en el
> mismo PR). Sin API: no hay `## contratos`. Sin modelo, prompt, umbral, catálogo ni corpus: no hay
> `## evaluación`. Versiones exactas, comprobadas en la fuente al implementar.
> ↪ Requiere en `main` (o en la rama base) `l1d-164-compose-stack` (workspaces, esqueletos) y
> `l1d-166-ci-build-contracts-scan` (`ci.yml`, `ci-ok`, `vitest.config.ts` raíz).

## 1. clinical-platform

- [x] 1.1 `.editorconfig` raíz (UTF-8, LF, 2 espacios en TS/JS/JSON/YAML, 4 en Python, salto final) · test después
- [x] 1.2 `.prettierrc.json` (`printWidth: 100`, `singleQuote`, `trailingComma: "all"`, `prettier-plugin-tailwindcss`) y `.prettierignore` (lo generado, `**/openapi.yaml`, `contracts/`, `reports/`, `ci/tests/quality/fixtures/`, `.next/`, `dist/`, `coverage/`) (design D2) · test después
- [x] 1.3 `eslint.config.js` raíz en *flat config*: ignores, `@eslint/js`, `typescript-eslint` recommended, bloque `clinical-api` (`globals.node`) y `eslint-config-prettier` al final (design D1) · test después
- [x] 1.4 `package.json` raíz (de L1D-164, conservando `contracts:*`, `test:infra`, `smoke:compose`): scripts `lint` (`eslint . --max-warnings 0`), `format`, `format:check`, `format:py`, `format:py:check`; `devDependencies` exactas de la proposal; `scripts/quality/ruff.mjs` que falla cerrado sin `ruff` (design D3) · test después
- [x] 1.5 Test de humo `ci/tests/quality/lint-format.test.mjs` (Vitest raíz): "termina con 0 cuando el código del S1 está formateado y sin errores de lint [US-215 AC-1]", "no modifica lo generado ni los openapi.yaml cuando se ejecuta format [US-215 AC-1]", "falla e indica cómo instalar ruff cuando no está en el PATH [US-215 AC-1]" · test después
- [x] 1.6 Fixtures `ci/tests/quality/fixtures/formato/` (`sin-formato.ts`, `sin-formato.tsx`, `sin-formato.py`, `formateado.ts`, `formateado.tsx`) y tests: "format:check falla y nombra el archivo cuando un .ts/.tsx/.py no está formateado [US-215 AC-4]", "format lo corrige y conserva el comportamiento (mismo resultado de la función, mismo AST en Python) [US-215 AC-4]", "ninguna regla de estilo marca un archivo formateado por Prettier [US-215 AC-5]" (más la CLI de `eslint-config-prettier` con salida 0) · test después
- [x] 1.7 Job `quality` en `.github/workflows/ci.yml` (de L1D-166): `npm ci`, setup-python con `.python-version`, `pip install -r apps/rag-orchestrator/requirements-dev.txt`, `npm run lint`, `npm run format:check`, `npx vitest run ci/tests/quality`; añadido al `needs:` de `ci-ok` sin borrar los de otros changes; acciones por SHA; sin `continue-on-error` (design D4). Describirlo en `docs/process/ci.md`. Verificación: el job pasa en el PR y falla en una ejecución con un fixture sin formatear (salida adjunta al PR) · test después
- [x] 1.8 Pasada de formato inicial (`npm run format`) sobre el código ya en `main`, commit aislado `style(L1D-265)`, tests en verde antes y después; corregir los errores reales de lint de `clinical-api` sin cambiar comportamiento (design D6) · test después
- [x] 1.9 Refactor: Extract Method / Inline Method en los archivos tocados (`scripts/quality/ruff.mjs`, tests de `ci/tests/quality/`), sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-265)`

## 2. frontend

- [ ] 2.1 Bloque `apps/web/**/*.{ts,tsx}` en `eslint.config.js`: `eslint-plugin-react-hooks` recommended con `rules-of-hooks` y `exhaustive-deps` en `error`, `eslint-plugin-jsx-a11y` recommended, `@next/eslint-plugin-next` recommended + core-web-vitals (`settings.next.rootDir`), `globals.browser`; sin `webpack()` en `next.config` (design D1) · test después
- [ ] 2.2 Fixtures `ci/tests/quality/fixtures/web/hook-condicional.tsx` y `effect-sin-dependencia.tsx`; tests "falla con react-hooks/rules-of-hooks y nombra archivo y línea cuando un hook se llama en un condicional [US-215 AC-2]" y "falla con react-hooks/exhaustive-deps como error cuando useEffect omite una dependencia [US-215 AC-2]" (API de Node de ESLint con `ignore: false`) · test después
- [ ] 2.3 Fixtures `ci/tests/quality/fixtures/web/img-sin-alt.tsx` y `div-clicable.tsx`; tests "falla con jsx-a11y/alt-text cuando una imagen no tiene alt [US-215 AC-3]" y "falla con la regla de jsx-a11y cuando un div clicable no tiene rol ni manejador de teclado [US-215 AC-3]" · test después
- [ ] 2.3b `react/no-danger: error` (`eslint-plugin-react`, versión exacta, solo esa regla) y regla local `scripts/quality/eslint-rules/no-restricted-imports-en-cliente.mjs` (plugin `oncolens`; delega en `no-restricted-imports` nativa solo si el archivo empieza con `'use client'`; patrones `**/lib/server/**`, `@/lib/server/**`, `server-only`) en el bloque `web` (design D1b). Fixtures `dangerously-set.tsx`, `cliente-importa-server.tsx`, `servidor-importa-server.tsx`; tests "falla con react/no-danger y nombra archivo y línea cuando un componente usa dangerouslySetInnerHTML [US-215 AC-3]", "falla con oncolens/no-restricted-imports-en-cliente cuando un módulo 'use client' importa lib/server [US-215 AC-3]", "no marca el import de lib/server cuando el módulo no tiene la directiva 'use client' [US-215 AC-3]"; corren en el job `quality` de la CI · test después
- [ ] 2.4 `npm run lint` y `npm run format:check` en verde sobre el esqueleto de `apps/web` (incluido `components/ui/**` si existe, que se formatea, design D2) · test después
- [ ] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados (bloque `web` de `eslint.config.js`, fixtures), sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-265)`

## 3. ai-services

- [ ] 3.1 `apps/rag-orchestrator/pyproject.toml` (crear o añadir sección): `[tool.ruff] line-length = 100`, `target-version` según `.python-version`, `extend-exclude = ["app/schemas/generated"]`; `ruff` con versión exacta en `apps/rag-orchestrator/requirements-dev.txt` (design D3) · test después
- [ ] 3.2 `ruff format --check apps/rag-orchestrator` en verde (tras `ruff format` del código existente, incluido en el commit `style(L1D-265)` de 1.8); `app/schemas/generated/` sin cambios · test después
- [ ] 3.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-265)`

## 4. Cierre

- [ ] 4.0 **[humano, abierta]** Decidir si `pre-commit-gate.sh` de `.claude/hooks/` corre `npm run lint` y `npm run format:check` (design.md Open Questions); este change no toca `.claude/` sin esa respuesta

- [x] 4.1 `openspec validate l1d-265-lint-format-base --strict` en verde
- [ ] 4.2 Tests del contexto en verde: `npx vitest run ci/tests/quality`, `npm run lint`, `npm run format:check`, `npm run contracts:generate:check` (sin diferencias), tests de `web`, `clinical-api` y Pytest de `rag-orchestrator`. Sin `contracts:verify-provider` (sin cambios de API) ni `run-ai-eval` (no aplica)
- [ ] 4.3 Resultado de `npm audit` adjunto al PR (solo `devDependencies` nuevas)
