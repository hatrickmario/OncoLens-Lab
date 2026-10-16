import { configDefaults, defineConfig } from 'vitest/config';

// Raíz del monorepo: solo scripts, infra y fixtures de la CI. Los workspaces (apps/**, packages/**) corren con su
// propia configuración en `npm test --workspaces`; recogerlos aquí los ejecutaría sin sus alias (L1D-139).
// Tampoco recoge copias de los worktrees de los agentes ni dependencias (Pre-S1-cierre P-8).
export default defineConfig({
  test: {
    include: ['scripts', 'infra', 'ci'].map((raiz) => `${raiz}/**/*.{test,spec}.?(c|m)[jt]s?(x)`),
    exclude: [...configDefaults.exclude, '.claude/**', '**/node_modules/**'],
  },
});
