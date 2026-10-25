// Única definición de «archivo de test» del repositorio (L1D-285, Gate 2 #1). La consumen ESLint (`eslint.config.js`),
// dependency-cruiser (`.dependency-cruiser.cjs`) y `check-ac-coverage`: así una carpeta de tests nueva se añade en un solo lugar.

/** Globs de ESLint (flat config) de los archivos de test de web, clinical-api, packages, scripts, ci e infra. */
export const GLOBS_DE_TESTS = [
  'apps/web/**/*.{test,spec}.{ts,tsx}',
  'apps/web/{tests,e2e}/**/*.{ts,tsx}',
  'apps/clinical-api/**/*.{test,spec}.ts',
  'apps/clinical-api/tests/**/*.ts',
  'packages/*/tests/**/*.{ts,tsx,mjs}',
  'packages/**/*.{test,spec}.{ts,tsx,mjs}',
  'scripts/**/__tests__/**/*.{mjs,ts}',
  'ci/tests/**/*.{mjs,ts}',
  'infra/**/__tests__/**/*.mjs',
];

/** El mismo criterio como expresión regular sobre una ruta relativa con `/`: carpeta de tests o sufijo `.test` / `.spec`. */
export const PATRON_DE_TEST = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

export const esArchivoDeTest = (ruta) => PATRON_DE_TEST.test(ruta);
