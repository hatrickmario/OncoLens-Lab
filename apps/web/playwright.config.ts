import { defineConfig } from '@playwright/test';

/**
 * E2E contra Compose en perfil de test (`LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake`, seed sintético).
 * No levanta nada: el stack lo arranca quien corre los E2E (`docker compose … up -d`). Solo localhost.
 * `retries: 1` únicamente en la CI y con traza (CLAUDE.md, Política TDD).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    locale: 'es',
  },
});
