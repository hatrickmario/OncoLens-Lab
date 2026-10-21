import { defineConfig, type ReporterDescription } from '@playwright/test';

/**
 * E2E contra Compose en perfil de test (`LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake`, seed sintético).
 * No levanta nada: el stack lo arranca quien corre los E2E (`docker compose … up -d`). Solo localhost.
 * `retries: 1` únicamente en la CI y con traza (CLAUDE.md, Política TDD). En la CI el informe es `github` + `html`.
 * El depurador va primero: deja los adjuntos y los títulos de paso sin cuerpos de request ni contraseñas antes de que
 * el informe HTML los copie; el verificador va el último y falla cerrado si el informe aún contiene un secreto (L1D-278, RN-14).
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
  reporter: [['./e2e/depurador-de-adjuntos.ts'], ...reporters, ['./e2e/verificador-de-informe.ts']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: enCi ? 'on-first-retry' : 'off',
    locale: 'es',
  },
});
