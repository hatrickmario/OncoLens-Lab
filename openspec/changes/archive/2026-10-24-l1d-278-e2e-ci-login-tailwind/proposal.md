# Proposal — l1d-278-e2e-ci-login-tailwind

## Trazabilidad

L1D-278 · ARR-02 (resto; arrastre del S1, `backlog/sprints/S2-arrastre.md`) · FEAT-PL1 / FEAT-UX ·
Sprint 2 · Estimación **~3** (resto de 8) · Prioridad Alta · Origen: deudas D-2 (sistema de diseño
real) y D-3 (E2E ejecutables) · ARR-02 AC-1 (job de CI) y AC-3 · Pantalla `docs/ux/S2/pantallas-s2.md`
S2-01 · `docs/ux/sistema-de-diseno.md` · Regresión de US-211 AC-1/AC-4 y US-060 AC-3 (E2E ya escritos)

> **Decidido (usuario, 2026-10-20):** el alcance restante de ARR-02 en el S2 es (1) el job de E2E en la
> CI (`retries: 1` solo en CI, *trace*, Docker en el *runner*; entra **fuera de `ci-ok`** hasta ser
> estable) y (2) el AC-3: migración de `/login` a Tailwind v4 + shadcn/ui y su visual-check a 375 y
> 1280 px. AC-1 (en local), AC-2 y AC-4 quedaron cumplidos en #111. Fuente:
> `backlog/sprints/S2-arrastre.md` §ARR-02 (Avance) y `backlog/sprints/S2-refinamiento.md` §1, §2
> (P-1: vuelve a *In Progress*), §5.

## Why

Los 15 E2E (12 del S1 + 3 de `sesion-y-origen.spec.ts`) pasan en local con `npm run test:e2e`
(`scripts/e2e/ejecutar.sh`, Compose fingido `oncolens-e2e`), pero ninguna CI los ejecuta: una
regresión del login, del panel o del aviso de IA solo se ve si alguien los corre a mano. Además
`/login` sigue en CSS Modules provisionales (D-2) y `apps/web` aún no tiene Tailwind v4 ni shadcn/ui,
que el sistema de diseño del Pre-S1 fija y que las pantallas del S2 (S2-00…S2-09) dan por hechos.

## What Changes

- **Workflow `.github/workflows/e2e.yml`** (separado de `ci.yml`, por tanto fuera de `ci-ok` sin
  contradecir la regla de que `ci-ok` depende de todos los jobs de `ci.yml`): en cada PR, Docker en el
  *runner*, `npx playwright install --with-deps chromium`, `npm run test:e2e` con `CI=true`
  (`retries: 1` solo en CI, `trace: 'on-first-retry'`), sube el informe y las trazas (sin cuerpos de request, usuarios sintéticos) como artefacto con retención de 3 días.
  Pasa a requerido cuando sea estable (criterio en design.md D2).
- **Tailwind v4 + shadcn/ui en `apps/web`** (primera adopción): `@tailwindcss/postcss`, tokens de
  `docs/ux/sistema-de-diseno.md` en `@theme` de `globals.css` (los `--color-*` actuales se conservan
  como fuente), `components/ui/` con `Card`, `Input`, `Label`, `Button` y `Alert` (átomos), `lib/utils`
  (`cn`).
- **`/login` migrado (AC-3):** `app/login/page.tsx`, `organisms/login-form.tsx` y la molécula
  `campo-con-etiqueta` pasan a Tailwind + shadcn; se borran sus `.module.css`. Mismos textos, roles,
  etiquetas y comportamiento (los E2E y los tests de UI de login no cambian sus aserciones).
- **visual-check** de `/login` a 375 y 1280 px sin errores de consola ni violaciones de CSP.

## Capabilities

### New Capabilities
- Ninguna. `ci-pipeline` la introduce `l1d-166-ci-build-contracts-scan` y `auth-session`
  `l1d-197-sesion-login-guard` (ambos del S1, pendientes de archivo en ARR-06).

### Modified Capabilities
- `ci-pipeline`: E2E de Playwright en la CI, informativo hasta ser estable.
- `auth-session`: la página de login usa el sistema de diseño (Tailwind v4 + shadcn/ui) sin cambiar
  su comportamiento.

## Bounded contexts

- **frontend:** `apps/web/app/login/`, `apps/web/components/{ui,organisms/login-form*,molecules/campo-con-etiqueta*}`,
  `apps/web/app/globals.css`, `apps/web/postcss.config.mjs`, `apps/web/components.json`,
  `apps/web/package.json`.
- **clinical-platform:** `.github/workflows/e2e.yml`, `scripts/e2e/ejecutar.sh` (modo CI),
  `apps/web/playwright.config.ts` (retries/trace por `CI`), `docs/process/ci.md`.

## Dependencias

- ↪ `l1d-277-ci-integracion-servicios-reales` (recomendado): mismo patrón de Compose en el *runner*.
- ↪ `l1d-197-sesion-login-guard` (S1, código mergeado): requisitos del login que esta migración no
  debe cambiar.
- **Antes de `l1d-198` (US-044, S2):** US-044 añade a `/login` el pie de expiración y los avisos
  `?motivo=` de S2-01 sobre la página ya migrada; conviene secuenciar l1d-278 → l1d-198 para no
  migrar dos veces.
- ↔ `l1d-267-auditoria-dependencias`: auditará las dependencias nuevas de `web`.

## Fuera de alcance

Migrar el resto de `apps/web` (panel de análisis, cabecera, aviso de IA siguen en CSS Modules; cada
pantalla del S2 lo hace en su historia). Los textos nuevos de S2-01 (US-044). Cabeceras de seguridad
y CSP con nonce (US-216, S6, `[S2 resp. 7]`). Hacer el job de E2E requerido en este change.

## Impact

Dependencias nuevas de `web`: `tailwindcss`, `@tailwindcss/postcss`, `class-variance-authority`,
`clsx`, `tailwind-merge`, `@radix-ui/react-label`, `@radix-ui/react-slot` (versiones fijadas, ≥ 2
semanas, auditadas). Workflow nuevo `e2e.yml`.
