import { defineConfig } from 'vitest/config';

// Pruebas de integración de los E2E (L1D-278): lanzan Playwright y Chromium reales, así que NO las recoge el vitest raíz de
// `build-test` (su include exige `.test.`/`.spec.`; estas se llaman `*.integracion.mjs`). Las ejecuta el job `e2e`,
// tras instalar Chromium: `npx vitest run --config scripts/e2e/vitest.integracion.config.mjs`.
export default defineConfig({
  test: {
    include: ['scripts/e2e/integracion/**/*.integracion.mjs'],
    testTimeout: 180_000,
    retry: 0,
  },
});
