import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    // `server-only` lo resuelve Next al compilar; en Vitest se sustituye por el módulo vacío que trae Next.
    alias: { 'server-only': require.resolve('next/dist/compiled/server-only/empty') },
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
