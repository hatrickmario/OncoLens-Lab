/** `setupFiles` de Vitest: instala en cada worker el empaquetado que repartió `globalSetup.mjs`. */
import { inject } from 'vitest';
import { registrarSpecsEmpaquetados } from '../lib/bundledSpecs.mjs';

registrarSpecsEmpaquetados(inject('specsEmpaquetados'));
