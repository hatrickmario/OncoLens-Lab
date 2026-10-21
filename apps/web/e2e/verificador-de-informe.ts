import type { Reporter } from '@playwright/test/reporter';

/** Esqueleto (L1D-278): se implementa en el commit `feat` que sigue al test en rojo. */
export default class VerificadorDeInforme implements Reporter {
  onExit(): Promise<void> {
    return Promise.resolve();
  }
}
