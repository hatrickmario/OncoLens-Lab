/** `globalSetup` de Vitest: empaqueta los specs una vez y los reparte a los workers con `provide` (ver `setupFile.mjs`). */
import { prepararSpecsEmpaquetados } from '../lib/bundledSpecs.mjs';

export default async function empaquetarSpecs({ provide }) {
  provide('specsEmpaquetados', await prepararSpecsEmpaquetados());
}
