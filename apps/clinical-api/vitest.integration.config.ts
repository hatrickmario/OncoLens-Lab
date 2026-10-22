import { defineConfig } from 'vitest/config';
import { vitestEmpaquetado } from '../../scripts/contracts/vitest/index.mjs';

// Integración contra PostgreSQL real de test (US-038). Necesita el perfil test de US-035 (TEST_DATABASE_URL,
// PG_TEST_DB_PREFIX): el global setup crea una base por ejecución, la migra y la elimina. Los tests del seed (US-039)
// crean además su propia base por archivo (tests/support/seed.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/integration/schema/**/*.test.ts',
      'tests/integration/auth/**/*.test.ts',
      'tests/integration/seed/**/*.test.ts',
      'tests/integration/evidence-analysis/**/*.test.ts',
      'tests/integration/identidad/**/*.test.ts',
      'tests/integration/usuarios/**/*.test.ts',
      'tests/integration/documents/**/*.test.ts',
    ],
    // El empaquetado de los specs va antes que la BD: si falla, no se crea ninguna base de test.
    globalSetup: [...vitestEmpaquetado.globalSetup, 'tests/support/global-setup.ts'],
    setupFiles: vitestEmpaquetado.setupFiles,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
  },
});
