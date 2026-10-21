/** `setupFiles` de Vitest: instala en cada worker el empaquetado que repartió `globalSetup.mjs`. */
import { inject } from 'vitest';
import { registrarSpecsEmpaquetados } from '../lib/bundledSpecs.mjs';
import { CLAVE_SPECS_EMPAQUETADOS } from './index.mjs';

registrarSpecsEmpaquetados(inject(CLAVE_SPECS_EMPAQUETADOS));
