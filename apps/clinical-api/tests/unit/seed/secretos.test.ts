import { describe, expect, it } from 'vitest';
import { leerSecreto, SecretoDelSeedAusenteError } from '../../../prisma/seed/secretos.js';

/** Lector de archivos en memoria: el test no hace E/S. */
function archivos(contenidos: Record<string, string>) {
  return (ruta: string): string => {
    const contenido = contenidos[ruta];
    if (contenido === undefined) throw new Error(`ENOENT ${ruta}`);
    return contenido;
  };
}

const VALOR_DEL_ARCHIVO = 'SINT-valor-del-archivo';
const VALOR_DE_LA_VARIABLE = 'SINT-valor-de-la-variable';

describe('leerSecreto', () => {
  it('devuelve el contenido del archivo sin el salto de línea cuando solo está la variable _FILE', () => {
    const env = { SEED_DOCTOR_PASSWORD_FILE: '/run/doctor' };

    const secreto = leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({ '/run/doctor': `${VALOR_DEL_ARCHIVO}\n` }));

    expect(secreto).toBe(VALOR_DEL_ARCHIVO);
  });

  it('prefiere el archivo sobre la variable directa cuando están las dos', () => {
    const env = {
      SEED_DOCTOR_PASSWORD_FILE: '/run/doctor',
      SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE,
    };

    const secreto = leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({ '/run/doctor': VALOR_DEL_ARCHIVO }));

    expect(secreto).toBe(VALOR_DEL_ARCHIVO);
  });

  it('usa la variable directa como respaldo local cuando no hay _FILE', () => {
    const env = { SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE };

    expect(leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({}))).toBe(VALOR_DE_LA_VARIABLE);
  });

  it('falla nombrando _FILE cuando el archivo está vacío, aunque haya variable directa', () => {
    const env = { SEED_DOCTOR_PASSWORD_FILE: '/run/doctor', SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE };

    expect(() => leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({ '/run/doctor': '\n' }))).toThrow(
      /SEED_DOCTOR_PASSWORD_FILE/,
    );
  });

  it('falla nombrando _FILE y sin la ruta cuando el archivo no se puede leer', () => {
    const env = { SEED_DOCTOR_PASSWORD_FILE: '/run/ruta-secreta' };

    expect(() => leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({}))).toThrow(
      new SecretoDelSeedAusenteError('SEED_DOCTOR_PASSWORD_FILE', 'no apunta a un archivo legible'),
    );
  });

  it('falla nombrando _FILE cuando no hay archivo ni variable directa', () => {
    expect(() => leerSecreto({}, 'SEED_ADMIN_PASSWORD', archivos({}))).toThrow(
      /SEED_ADMIN_PASSWORD_FILE/,
    );
  });

  it('no incluye ningún valor secreto en el mensaje de error', () => {
    const env = { SEED_DOCTOR_PASSWORD_FILE: '/run/doctor', SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE };

    expect(() => leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({ '/run/doctor': '' }))).not.toThrow(
      new RegExp(VALOR_DE_LA_VARIABLE),
    );
  });
});
