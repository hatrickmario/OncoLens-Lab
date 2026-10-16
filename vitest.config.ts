import { configDefaults, defineConfig } from 'vitest/config';

// Raíz del monorepo: no recoge copias de los worktrees de los agentes ni dependencias (Pre-S1-cierre P-8).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.claude/**', '**/node_modules/**'],
  },
});
