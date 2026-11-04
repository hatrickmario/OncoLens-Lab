import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pacienteA } from '../../../prisma/seed/pacientes/a.js';
import { pacienteB } from '../../../prisma/seed/pacientes/b.js';
import { pacienteC } from '../../../prisma/seed/pacientes/c.js';
import { pacienteD } from '../../../prisma/seed/pacientes/d.js';
import { pacienteE } from '../../../prisma/seed/pacientes/e.js';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';

interface ClaveDelCatalogo {
  key: string;
  values?: { value: string }[];
}

const claves = (
  JSON.parse(readFileSync(path.join(RUTA_CATALOGO_REAL, 'atributos.json'), 'utf8')) as {
    keys: ClaveDelCatalogo[];
  }
).keys;

/** Pares (clave, valor) de P-CASO (FX-02b-a, `tests/support/caso.ts`) y del checklist de F-M2 (`completitud.ts`). */
const DE_LOS_FIXTURES: readonly (readonly [string, string])[] = [
  ['estado_castracion', 'castrado'],
  ['sitios_metastasicos', 'oseo'],
  ['estado_menopausico', 'posmenopausica'],
];

const DEL_SEED = [pacienteA, pacienteB, pacienteC, pacienteD, pacienteE].flatMap((paciente) =>
  paciente.atributos.map((a) => [a.atributo, a.valor] as const),
);

describe('valores de atributos del seed sintético y de los fixtures', () => {
  it.each([...DEL_SEED, ...DE_LOS_FIXTURES])(
    'está declarado en el catálogo real: %s = %s [US-094 AC-3] [RN-29]',
    (clave, valor) => {
      const declarada = claves.find((k) => k.key === clave);

      expect(declarada?.values?.map((v) => v.value)).toContain(valor);
    },
  );

  it('recorre al menos un atributo del seed [US-094 AC-3]', () => {
    expect(DEL_SEED.length).toBeGreaterThan(0);
  });
});
