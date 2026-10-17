import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Sin reintentos: un test inestable es un bug (CLAUDE.md, Política TDD).
    retry: 0,
  },
});
