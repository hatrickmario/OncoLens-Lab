import { describe, expect, it } from 'vitest';
import {
  SecretoAusenteError,
  assertSecretPresent,
  loadRequiredSecrets,
} from '../../src/config/secrets.js';

const lectorSinArchivos = () => {
  throw new Error('no debe leer archivos');
};

const capturar = (accion: () => unknown): Error => {
  try {
    accion();
  } catch (error) {
    return error as Error;
  }
  throw new Error('se esperaba una excepción');
};

describe('assertSecretPresent', () => {
  it('lanza SecretoAusenteError con el nombre de la variable cuando la variable no está definida', () => {
    expect(() => assertSecretPresent('IDENTITY_AES_KEY_FILE', {}, lectorSinArchivos)).toThrow(
      SecretoAusenteError,
    );
    expect(() => assertSecretPresent('IDENTITY_AES_KEY_FILE', {}, lectorSinArchivos)).toThrow(
      /IDENTITY_AES_KEY_FILE/,
    );
  });

  it('lanza SecretoAusenteError con el nombre de la variable y sin la ruta cuando el archivo no existe', () => {
    const sinArchivo = () => {
      throw Object.assign(new Error('ENOENT: /run/secrets/identity_aes_key'), { code: 'ENOENT' });
    };
    const error = capturar(() =>
      assertSecretPresent(
        'IDENTITY_AES_KEY_FILE',
        { IDENTITY_AES_KEY_FILE: '/run/secrets/identity_aes_key' },
        sinArchivo,
      ),
    );

    expect(error).toBeInstanceOf(SecretoAusenteError);
    expect(error.message).toContain('IDENTITY_AES_KEY_FILE');
    expect(error.message).not.toContain('/run/secrets');
  });

  it('lanza SecretoAusenteError con el nombre de la variable cuando el archivo está vacío o solo tiene espacios', () => {
    for (const contenido of ['', '  \n']) {
      const error = capturar(() =>
        assertSecretPresent(
          'BLIND_INDEX_HMAC_KEY_FILE',
          { BLIND_INDEX_HMAC_KEY_FILE: '/s/hmac' },
          () => contenido,
        ),
      );

      expect(error).toBeInstanceOf(SecretoAusenteError);
      expect(error.message).toContain('BLIND_INDEX_HMAC_KEY_FILE');
    }
  });

  it('devuelve el contenido sin espacios en los extremos cuando el archivo tiene la clave', () => {
    const valor = assertSecretPresent(
      'IDENTITY_AES_KEY_FILE',
      { IDENTITY_AES_KEY_FILE: '/s/aes' },
      () => 'clave-ficticia\n',
    );

    expect(valor).toBe('clave-ficticia');
  });
});

describe('loadRequiredSecrets', () => {
  const archivos: Record<string, string> = {
    '/s/aes': 'aes-ficticia\n',
    '/s/hmac': 'hmac-ficticia\n',
    '/s/jwt': 'jwt-ficticia\n',
  };
  const lector = (ruta: string) => {
    const contenido = archivos[ruta];
    if (contenido === undefined) throw new Error('ENOENT');
    return contenido;
  };

  it('devuelve el contenido de las claves de identidad indexado por la variable cuando ambas están presentes', () => {
    const secretos = loadRequiredSecrets(
      {
        IDENTITY_AES_KEY_FILE: '/s/aes',
        BLIND_INDEX_HMAC_KEY_FILE: '/s/hmac',
        SERVICE_JWT_PRIVATE_KEY_FILE: '/s/jwt',
      },
      lector,
    );

    expect(secretos).toEqual({
      IDENTITY_AES_KEY_FILE: 'aes-ficticia',
      BLIND_INDEX_HMAC_KEY_FILE: 'hmac-ficticia',
      SERVICE_JWT_PRIVATE_KEY_FILE: 'jwt-ficticia',
    });
  });

  it('lanza nombrando la primera variable ausente cuando faltan las dos claves', () => {
    const error = capturar(() => loadRequiredSecrets({}, lector));

    expect(error).toBeInstanceOf(SecretoAusenteError);
    expect((error as SecretoAusenteError).variable).toBe('IDENTITY_AES_KEY_FILE');
  });

  it('lanza nombrando la clave HMAC cuando solo falta su archivo', () => {
    const error = capturar(() =>
      loadRequiredSecrets(
        { IDENTITY_AES_KEY_FILE: '/s/aes', BLIND_INDEX_HMAC_KEY_FILE: '/s/nada' },
        lector,
      ),
    );

    expect((error as SecretoAusenteError).variable).toBe('BLIND_INDEX_HMAC_KEY_FILE');
  });
});
