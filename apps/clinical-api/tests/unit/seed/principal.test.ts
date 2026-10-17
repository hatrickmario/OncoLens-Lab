import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ejecutarSeed } from '../../../prisma/seed/principal.js';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';

/** Contraseñas ficticias para cualquier `*_password` y el catálogo real para lo demás. */
const leerArchivo = (ruta: string): string =>
  ruta.endsWith('_password') ? 'SINT-ficticia-0001' : readFileSync(ruta, 'utf8');

const ENTORNO = {
  APP_ENV: 'test',
  CLINICAL_CATALOG_PATH: RUTA_DEL_CATALOGO,
  SEED_DOCTOR_PASSWORD_FILE: '/x/seed_doctor_password',
  SEED_ADMIN_PASSWORD_FILE: '/x/seed_admin_password',
};

describe('ejecutarSeed', () => {
  it('registra la clase desconocida y ningún mensaje cuando se lanza algo que no es un Error', async () => {
    const lineas: Record<string, unknown>[] = [];

    await expect(
      ejecutarSeed(ENTORNO, {
        conectar: () => Promise.reject('cadena con host=secreto'),
        leerArchivo,
        hasher: { hash: () => Promise.resolve('h'), verify: () => Promise.resolve(false) },
        registrar: (linea) => lineas.push(linea),
        traceId: 'req_desconoc',
      }),
    ).rejects.toBe('cadena con host=secreto');

    expect(lineas).toEqual([
      { event: 'seed_fallido', traceId: 'req_desconoc', clase: 'desconocido' },
    ]);
  });
});
