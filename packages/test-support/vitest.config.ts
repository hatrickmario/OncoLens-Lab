import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
    // Cada test levanta un servidor MSW y hace una petición real por loopback.
    testTimeout: 30_000,
  },
});
