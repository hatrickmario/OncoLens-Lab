import { configDefaults, defineConfig } from 'vitest/config';

// Tests de lint y formato (L1D-265, US-215). Fuera del vitest raíz: los ejecuta solo el job `quality` de la CI
// con `npm run test:quality`. Un filtro de la CLI no vence al `exclude` de `vitest.config.ts`, por eso hay una config propia.
export default defineConfig({
  test: {
    // Casi todos los tests de esta suite lanzan herramientas reales (ESLint, dependency-cruiser, Ruff, import-linter,
    // un proceso de Node nuevo) o copian árboles de fixtures. En el runner de la CI tardan más que los 5 s por defecto
    // (L1D-263: «Test timed out in 5000ms»). Es un plazo holgado, no un reintento: un test lento falla igual.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['ci/tests/quality/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [...configDefaults.exclude, '.claude/**', '**/node_modules/**'],
  },
});
