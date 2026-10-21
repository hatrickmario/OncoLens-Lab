/** `globalSetup` de Vitest: empaqueta los specs una vez y los reparte a los workers con `provide` (ver `setupFile.mjs`). */
import { prepararSpecsEmpaquetados } from '../lib/bundledSpecs.mjs';
import { CLAVE_SPECS_EMPAQUETADOS } from './index.mjs';

export default async function empaquetarSpecs({ provide }) {
  provide(CLAVE_SPECS_EMPAQUETADOS, await prepararSpecsEmpaquetados());
}
