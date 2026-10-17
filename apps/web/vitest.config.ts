import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
    include: ['tests/**/*.test.ts', 'app/**/*.test.ts'],
    // El test de build (AC-5) ejecuta `next build` y se lanza aparte: npm run test:build.
    exclude: ['tests/build/**', 'node_modules/**'],
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
  },
});
