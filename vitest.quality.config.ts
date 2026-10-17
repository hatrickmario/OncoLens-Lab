import { configDefaults, defineConfig } from 'vitest/config';

// Tests de lint y formato (L1D-265, US-215). Fuera del vitest raíz: los ejecuta solo el job `quality` de la CI
// con `npm run test:quality`. Un filtro de la CLI no vence al `exclude` de `vitest.config.ts`, por eso hay una config propia.
export default defineConfig({
  test: {
    include: ['ci/tests/quality/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [...configDefaults.exclude, '.claude/**', '**/node_modules/**'],
  },
});
