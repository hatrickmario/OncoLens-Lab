import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // La suite contra PostgreSQL real tiene su propia configuración (npm run test:integration, US-038).
    exclude: [
      '**/node_modules/**',
      'tests/integration/schema/**',
      'tests/integration/auth/**',
      'tests/integration/seed/**',
      'tests/integration/evidence-analysis/**',
    ],
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
  },
});
