import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Base de lint del monorepo (L1D-265, design D1). `npm run lint` = `eslint . --max-warnings 0`.
// Los bloques de `web` (React, a11y, Next, seguridad del cliente) los añade la sección de frontend.
export default tseslint.config(
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
  {
    files: ['apps/clinical-api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Parámetros reservados para la inyección de dependencias de cada historia (`_dependencies`).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // SIEMPRE el último: desactiva toda regla de estilo que choque con Prettier [US-215 AC-5].
  prettier,
);
