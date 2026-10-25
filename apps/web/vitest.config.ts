import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { vitestEmpaquetado } from '../../scripts/contracts/vitest/index.mjs';

export default defineConfig({
  resolve: {
    // `server-only` lo resuelve Next al compilar; en Vitest se sustituye por un módulo vacío local.
    alias: {
      'server-only': fileURLToPath(
        new URL('./tests/support/server-only-vacio.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // Los tests que validan respuestas contra openapi.yaml leen el empaquetado precalculado (US-223).
    ...vitestEmpaquetado,
    include: ['tests/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
    // El test de build (AC-5) ejecuta `next build` y se lanza aparte: npm run test:build.
    exclude: ['tests/build/**', 'node_modules/**'],
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
    // Solo con `--coverage` (npm run test:coverage): LCOV para la cobertura de líneas cambiadas (US-213 AC-11).
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
      reportsDirectory: 'coverage',
    },
  },
});
