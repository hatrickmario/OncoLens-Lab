import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import vitest from '@vitest/eslint-plugin';
import mockSoloEnBordes from './scripts/quality/eslint-rules/mock-solo-en-bordes.mjs';
import testsSinDesactivar from './scripts/quality/eslint-rules/tests-sin-desactivar.mjs';
import noRestrictedImportsEnCliente from './scripts/quality/eslint-rules/no-restricted-imports-en-cliente.mjs';
import { escaparGlob, excepcionesVigentes, leerUmbrales } from './scripts/quality/umbrales.mjs';

// Umbrales de tamaño y complejidad (L1D-263, RN-22): solo se editan en quality-thresholds.json.
// Un umbral ausente o no numérico hace fallar la carga de esta configuración nombrando la clave.
const umbrales = leerUmbrales();

/** Reglas propias del repositorio: un solo objeto, porque ESLint no admite dos plugins distintos con el mismo nombre. */
const pluginOncolens = {
  rules: {
    'no-restricted-imports-en-cliente': noRestrictedImportsEnCliente,
    'mock-solo-en-bordes': mockSoloEnBordes,
    'tests-sin-desactivar': testsSinDesactivar,
  },
};

const SIN_TESTS_DE_CLINICAL_API = ['apps/clinical-api/tests/**', '**/*.test.ts', '**/*.spec.ts'];
const SIN_PRIMITIVAS_NI_TESTS_DE_WEB = [
  'apps/web/components/ui/**',
  'apps/web/tests/**',
  'apps/web/e2e/**',
  '**/*.test.tsx',
  '**/*.spec.tsx',
  '**/*.stories.tsx',
  '**/generated/**',
];

/** Tamaño y complejidad de funciones de clinical-api (US-213 AC-4); los tests quedan fuera. */
export const bloqueTamanoClinicalApi = (limites, files = ['apps/clinical-api/**/*.ts']) => ({
  files,
  ignores: SIN_TESTS_DE_CLINICAL_API,
  rules: {
    'max-lines-per-function': [
      'error',
      { max: limites.maxLinesPerFunction, skipBlankLines: true, skipComments: true },
    ],
    complexity: ['error', { max: limites.complexity }],
  },
});

/**
 * Tamaño de componentes .tsx de web (US-213 AC-7), por archivo y sin blancos ni comentarios.
 * `nivel` 'error' = límite duro (componentLinesError); 'warn' = alerta (componentLinesWarn), que
 * `quality:report` ejecuta en una pasada aparte para no chocar con `--max-warnings 0` (design D3).
 */
export const bloqueTamanoWeb = (
  limites,
  nivel,
  files = ['apps/web/{app,components}/**/*.tsx'],
) => ({
  files,
  ignores: SIN_PRIMITIVAS_NI_TESTS_DE_WEB,
  rules: {
    'max-lines': [
      nivel,
      {
        max: nivel === 'warn' ? limites.web.componentLinesWarn : limites.web.componentLinesError,
        skipBlankLines: true,
        skipComments: true,
      },
    ],
  },
});

/** Excepciones con caducidad (D5): desactivan una regla en un archivo hasta su fecha; después vuelve a fallar. */
export const bloquesDeExcepciones = (limites, hoy = new Date()) =>
  excepcionesVigentes(limites.excepciones, hoy).map(({ regla, archivo }) => ({
    files: [escaparGlob(archivo)],
    rules: { [regla]: 'off' },
  }));

// Base de lint del monorepo (L1D-265, design D1). `npm run lint` = `eslint . --max-warnings 0`.
// `bloqueWeb` aplica React, a11y, Next y seguridad del cliente (D1, D1b) a los archivos que se le den;
// se exporta para que los tests de ci/tests/quality lo apliquen a sus fixtures.
export const bloqueWeb = (files) => ({
  files,
  languageOptions: { globals: globals.browser },
  plugins: {
    'react-hooks': reactHooks,
    'jsx-a11y': jsxA11y,
    '@next/next': nextPlugin,
    react,
    oncolens: pluginOncolens,
  },
  settings: { next: { rootDir: 'apps/web' } },
  rules: {
    ...reactHooks.configs.flat.recommended.rules,
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    ...jsxA11y.flatConfigs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
    'react/no-danger': 'error',
    // Cubre lo que react/no-danger no ve: createElement y spread de props.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "Property[key.name='dangerouslySetInnerHTML'], Property[key.value='dangerouslySetInnerHTML']",
        message:
          'dangerouslySetInnerHTML está prohibido: es la vía de XSS sobre texto generado o extraído',
      },
    ],
    'oncolens/no-restricted-imports-en-cliente': 'error',
  },
});

/** Tests de `web` y `clinical-api` (Vitest, Testing Library, Supertest y Playwright). */
export const ARCHIVOS_DE_TESTS = [
  'apps/web/**/*.{test,spec}.{ts,tsx}',
  'apps/web/{tests,e2e}/**/*.{ts,tsx}',
  'apps/clinical-api/**/*.{test,spec}.ts',
  'apps/clinical-api/tests/**/*.ts',
];

/**
 * Higiene de tests (US-213 AC-8, design D1): ningún test enfocado ni desactivado. Va DESPUÉS de las excepciones con
 * caducidad: una excepción de `quality-thresholds.json` no puede apagar estas reglas.
 */
export const bloqueHigieneDeTests = (files = ARCHIVOS_DE_TESTS) => ({
  files,
  plugins: { vitest, oncolens: pluginOncolens },
  rules: {
    // `it.todo` y `fit` no los ven las reglas del plugin de Vitest: los cubre la regla propia.
    'oncolens/tests-sin-desactivar': 'error',
    'vitest/no-focused-tests': 'error',
    'vitest/no-disabled-tests': 'error',
    'vitest/valid-title': 'error',
  },
});

/** `vi.mock` solo sobre bordes (US-213 AC-10, design D4); admite excepciones con caducidad e ID de deuda. */
export const bloqueMockSoloEnBordes = (files = ARCHIVOS_DE_TESTS) => ({
  files,
  plugins: { oncolens: pluginOncolens },
  rules: { 'oncolens/mock-solo-en-bordes': 'error' },
});

const AVISO_DE_SUPERTEST =
  'Usa clienteVerificado (apps/clinical-api/tests/support/verificarProveedor.ts): valida cada respuesta contra openapi.yaml (US-214).';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.venv/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      'reports/**',
      'packages/api-contracts/src/**',
      'apps/rag-orchestrator/**',
      'ci/tests/quality/fixtures/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Scripts, tests de la CI y configuración raíz: ESM de Node.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Configuración CommonJS de herramientas (p. ej. .dependency-cruiser.cjs): usa require.
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  bloqueWeb(['apps/web/**/*.{js,jsx,ts,tsx}']),
  {
    files: ['apps/clinical-api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Parámetros reservados para la inyección de dependencias de cada historia (`_dependencies`).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // US-214 AC-1: la verificación del proveedor es automática solo si los tests pasan por `clienteVerificado`.
    files: ['apps/clinical-api/**/*.ts'],
    ignores: ['apps/clinical-api/tests/support/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'supertest', message: AVISO_DE_SUPERTEST }],
          patterns: [{ group: ['supertest/*'], message: AVISO_DE_SUPERTEST }],
        },
      ],
      // `require('supertest')` e `import('supertest')` no los ve no-restricted-imports.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/^supertest(\\/.*)?$/], ImportExpression[source.value=/^supertest(\\/.*)?$/]",
          message: AVISO_DE_SUPERTEST,
        },
      ],
    },
  },
  bloqueTamanoClinicalApi(umbrales),
  bloqueTamanoWeb(umbrales, 'error'),
  bloqueMockSoloEnBordes(),
  ...bloquesDeExcepciones(umbrales),
  bloqueHigieneDeTests(),
  // SIEMPRE el último: desactiva toda regla de estilo que choque con Prettier [US-215 AC-5].
  prettier,
);
