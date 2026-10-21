import { configDefaults, defineConfig } from 'vitest/config';
import { vitestEmpaquetado } from './scripts/contracts/vitest/index.mjs';

// Raíz del monorepo: solo scripts, infra y fixtures de la CI. Los workspaces (apps/**, packages/**) corren con su
// propia configuración en `npm test --workspaces`; recogerlos aquí los ejecutaría sin sus alias (L1D-139).
// Tampoco recoge copias de los worktrees de los agentes ni dependencias (Pre-S1-cierre P-8).
export default defineConfig({
  test: {
    // Empaquetado de los specs calculado una vez y repartido a los workers (US-223).
    // Rutas absolutas (los tests de esta config la ejecutan con otra `--root`).
    ...vitestEmpaquetado,
    include: ['scripts', 'infra', 'ci'].map((raiz) => `${raiz}/**/*.{test,spec}.?(c|m)[jt]s?(x)`),
    // `ci/tests/quality` tiene su propio job (`quality`) y su propia config (`vitest.quality.config.ts`, L1D-265).
    exclude: [...configDefaults.exclude, '.claude/**', '**/node_modules/**', 'ci/tests/quality/**'],
  },
});
