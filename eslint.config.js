import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import noRestrictedImportsEnCliente from './scripts/quality/eslint-rules/no-restricted-imports-en-cliente.mjs';

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
    oncolens: { rules: { 'no-restricted-imports-en-cliente': noRestrictedImportsEnCliente } },
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
        message: 'dangerouslySetInnerHTML está prohibido: es la vía de XSS sobre texto generado o extraído',
      },
    ],
    'oncolens/no-restricted-imports-en-cliente': 'error',
  },
});

const AVISO_DE_SUPERTEST =
  'Usa clienteVerificado (apps/clinical-api/tests/support/verificarProveedor.ts): valida cada respuesta contra openapi.yaml (US-214).';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
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
  // SIEMPRE el último: desactiva toda regla de estilo que choque con Prettier [US-215 AC-5].
  prettier,
);
