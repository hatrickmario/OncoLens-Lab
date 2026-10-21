import { defineConfig, type ReporterDescription } from '@playwright/test';

/**
 * E2E contra Compose en perfil de test (`LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake`, seed sintético).
 * No levanta nada: el stack lo arranca quien corre los E2E (`docker compose … up -d`). Solo localhost.
 * `retries: 1` únicamente en la CI y con traza (CLAUDE.md, Política TDD). En la CI el informe es `github` + `html`.
 * El reporter de depuración va primero: deja las trazas sin cuerpos de request ni contraseñas antes de que el informe
 * HTML y el artefacto de la CI las copien (L1D-278, RN-14).
 */
const enCi = Boolean(process.env.CI);
const reporters: ReporterDescription[] = enCi
  ? [['github'], ['list'], ['html', { open: 'never' }]]
  : [['list']];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: enCi ? 1 : 0,
  reporter: [['./e2e/reporte-sin-secretos.ts'], ...reporters],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: enCi ? 'on-first-retry' : 'off',
    locale: 'es',
  },
});
