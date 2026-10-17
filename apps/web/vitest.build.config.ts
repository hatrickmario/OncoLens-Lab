import { defineConfig } from 'vitest/config';

// Test de build (AC-5): ejecuta `next build`; se lanza aparte de la suite rápida (npm run test:build).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/build/**/*.test.ts'],
    retry: 0,
    // Ambos tests ejecutan `next build` sobre el mismo `.next`: en serie.
    fileParallelism: false,
  },
});
