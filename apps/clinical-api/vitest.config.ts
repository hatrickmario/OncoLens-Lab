import { defineConfig } from 'vitest/config';
import { vitestEmpaquetado } from '../../scripts/contracts/vitest/index.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    // Los tests que validan respuestas contra openapi.yaml leen el empaquetado precalculado (US-223).
    ...vitestEmpaquetado,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // La suite contra PostgreSQL real tiene su propia configuración (npm run test:integration, US-038).
    exclude: [
      '**/node_modules/**',
      'tests/integration/schema/**',
      'tests/integration/auth/**',
      'tests/integration/seed/**',
      'tests/integration/evidence-analysis/**',
      'tests/integration/identidad/**',
      'tests/integration/usuarios/**',
      'tests/integration/documents/**',
    ],
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
  },
});
