import { describe, expect, it } from 'vitest';
import { leerSecreto } from '../../../prisma/seed/secretos.js';
import { ConfiguracionInvalidaError } from '../../../src/config.js';

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

    const secreto = leerSecreto(
      env,
      'SEED_DOCTOR_PASSWORD',
      archivos({ '/run/doctor': `${VALOR_DEL_ARCHIVO}\n` }),
    );

    expect(secreto).toBe(VALOR_DEL_ARCHIVO);
  });

  it('prefiere el archivo sobre la variable directa cuando están las dos', () => {
    const env = {
      SEED_DOCTOR_PASSWORD_FILE: '/run/doctor',
      SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE,
    };

    const secreto = leerSecreto(
      env,
      'SEED_DOCTOR_PASSWORD',
      archivos({ '/run/doctor': VALOR_DEL_ARCHIVO }),
    );

    expect(secreto).toBe(VALOR_DEL_ARCHIVO);
  });

  it('usa la variable directa como respaldo local cuando no hay _FILE', () => {
    const env = { SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE };

    expect(leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({}))).toBe(VALOR_DE_LA_VARIABLE);
  });

  it('falla con ConfiguracionInvalidaError nombrando _FILE cuando el archivo está vacío, aunque haya variable directa', () => {
    const env = {
      SEED_DOCTOR_PASSWORD_FILE: '/run/doctor',
      SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE,
    };
    const leer = () => leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({ '/run/doctor': '\n' }));

    expect(leer).toThrow(ConfiguracionInvalidaError);
    expect(leer).toThrow('SEED_DOCTOR_PASSWORD_FILE apunta a un archivo vacío');
  });

  it('falla nombrando _FILE y sin la ruta cuando el archivo no se puede leer', () => {
    const env = { SEED_DOCTOR_PASSWORD_FILE: '/run/ruta-secreta' };
    const leer = () => leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({}));

    expect(leer).toThrow(ConfiguracionInvalidaError);
    expect(leer).toThrow('SEED_DOCTOR_PASSWORD_FILE no apunta a un archivo legible');
    expect(leer).not.toThrow(/ruta-secreta/);
  });

  it('falla con ConfiguracionInvalidaError nombrando _FILE cuando no hay archivo ni variable directa', () => {
    const leer = () => leerSecreto({}, 'SEED_ADMIN_PASSWORD', archivos({}));

    expect(leer).toThrow(ConfiguracionInvalidaError);
    expect(leer).toThrow(
      'SEED_ADMIN_PASSWORD_FILE no está definida (ni SEED_ADMIN_PASSWORD como respaldo local)',
    );
  });

  it('no incluye ningún valor secreto en el mensaje de error', () => {
    const env = {
      SEED_DOCTOR_PASSWORD_FILE: '/run/doctor',
      SEED_DOCTOR_PASSWORD: VALOR_DE_LA_VARIABLE,
    };

    expect(() =>
      leerSecreto(env, 'SEED_DOCTOR_PASSWORD', archivos({ '/run/doctor': '' })),
    ).not.toThrow(new RegExp(VALOR_DE_LA_VARIABLE));
  });
});
