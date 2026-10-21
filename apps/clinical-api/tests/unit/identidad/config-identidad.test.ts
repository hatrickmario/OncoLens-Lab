import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readIdentityKeyConfig } from '../../../src/config/index.js';
import { cargarClavesDeIdentidad } from '../../../src/infrastructure/crypto/claves-de-identidad.js';
import { arrancar } from '../../../src/startup.js';
import { claveDeTest } from '../../support/identidad.js';

const ENTORNO_BASE = {
  IDENTITY_AES_KEY_FILE: '/run/secrets/identity_aes_key',
  BLIND_INDEX_HMAC_KEY_FILE: '/run/secrets/blind_index_hmac_key',
};
const base64 = (etiqueta: string) => claveDeTest(etiqueta).toString('base64');

describe('readIdentityKeyConfig', () => {
  it('usa la versión 1 cuando IDENTITY_KEY_VERSION no está definida', () => {
    expect(readIdentityKeyConfig(ENTORNO_BASE).keyVersion).toBe(1);
  });

  it('recoge las claves de versiones anteriores de IDENTITY_AES_KEY_V<n>_FILE', () => {
    const config = readIdentityKeyConfig({
      ...ENTORNO_BASE,
      IDENTITY_KEY_VERSION: '3',
      IDENTITY_AES_KEY_V1_FILE: '/run/secrets/v1',
      IDENTITY_AES_KEY_V2_FILE: '/run/secrets/v2',
    });

    expect(config.keyVersion).toBe(3);
    expect([...config.previousKeyFiles.keys()]).toEqual([1, 2]);
  });

  it('rechaza una versión que no es un entero positivo nombrando la variable', () => {
    const leer = () => readIdentityKeyConfig({ ...ENTORNO_BASE, IDENTITY_KEY_VERSION: '0' });

    expect(leer).toThrow(/IDENTITY_KEY_VERSION/);
  });

  it('rechaza la clave anterior de la versión activa porque va en IDENTITY_AES_KEY_FILE', () => {
    const leer = () =>
      readIdentityKeyConfig({
        ...ENTORNO_BASE,
        IDENTITY_KEY_VERSION: '2',
        IDENTITY_AES_KEY_V2_FILE: '/run/secrets/v2',
      });

    expect(leer).toThrow(/IDENTITY_AES_KEY_V2_FILE/);
  });

  it('exige IDENTITY_AES_KEY_FILE nombrando la variable', () => {
    const leer = () => readIdentityKeyConfig({ BLIND_INDEX_HMAC_KEY_FILE: '/run/secrets/hmac' });

    expect(leer).toThrow(/IDENTITY_AES_KEY_FILE/);
  });
});

describe('cargarClavesDeIdentidad', () => {
  const config = {
    keyVersion: 2,
    activeKeyFile: 'activa',
    previousKeyFiles: new Map([[1, 'anterior']]),
    hmacKeyFile: 'hmac',
  };
  const archivos: Record<string, string> = {
    activa: `${base64('aes-v2')}\n`,
    anterior: base64('aes-v1'),
    hmac: base64('hmac'),
  };
  const leer = (ruta: string) => archivos[ruta] ?? '';

  it('arma el anillo con la clave activa y las anteriores y devuelve la clave del índice', () => {
    const { anillo, claveDeIndice } = cargarClavesDeIdentidad(config, leer);

    expect(anillo.versionActiva).toBe(2);
    expect(anillo.claveDe(1)?.equals(claveDeTest('aes-v1'))).toBe(true);
    expect(claveDeIndice.equals(claveDeTest('hmac'))).toBe(true);
  });

  it('nombra la variable y no muestra el contenido cuando la clave no mide 32 bytes', () => {
    const corta = 'Y29ydGE=';
    let error: unknown;
    try {
      cargarClavesDeIdentidad(config, (ruta) => (ruta === 'activa' ? corta : leer(ruta)));
    } catch (capturado) {
      error = capturado;
    }

    expect(error).toBeInstanceOf(ConfiguracionInvalidaError);
    expect((error as Error).message).toContain('IDENTITY_AES_KEY_FILE');
    expect((error as Error).message).not.toContain(corta);
  });
});

describe('cargarClavesDeIdentidad: claves separadas', () => {
  it('rechaza nombrando BLIND_INDEX_HMAC_KEY_FILE cuando la clave HMAC es igual a una clave AES', () => {
    const config = {
      keyVersion: 1,
      activeKeyFile: 'aes',
      previousKeyFiles: new Map<number, string>(),
      hmacKeyFile: 'hmac',
    };
    const misma = base64('aes-v1');
    const cargar = () => cargarClavesDeIdentidad(config, () => misma);

    expect(cargar).toThrow(ConfiguracionInvalidaError);
    expect(cargar).toThrow(/BLIND_INDEX_HMAC_KEY_FILE/);
  });
});

describe('arranque de clinical-api con la versión de clave de identidad', () => {
  function arrancarCapturando(env: NodeJS.ProcessEnv, existentes: readonly string[]) {
    const log: string[] = [];
    const salidas: number[] = [];
    const escuchas: number[] = [];
    arrancar({
      env,
      readFile: (ruta) => {
        if (!existentes.includes(ruta)) throw new Error('sin archivo');
        return 'contenido-ficticio';
      },
      log: (linea) => log.push(linea),
      exit: (codigo) => salidas.push(codigo),
      listen: (puerto) => escuchas.push(puerto),
    });
    return { log: log.join('\n'), salidas, escuchas };
  }

  it('no arranca y el log nombra IDENTITY_AES_KEY_FILE sin valores cuando IDENTITY_KEY_VERSION es 2 y falta la clave activa [US-046 AC-5]', () => {
    const resultado = arrancarCapturando(
      {
        ...ENTORNO_BASE,
        IDENTITY_KEY_VERSION: '2',
        IDENTITY_AES_KEY_V1_FILE: '/run/secrets/identity_aes_key_v1',
        SERVICE_JWT_PRIVATE_KEY_FILE: '/run/secrets/jwt',
      },
      [
        ENTORNO_BASE.BLIND_INDEX_HMAC_KEY_FILE,
        '/run/secrets/identity_aes_key_v1',
        '/run/secrets/jwt',
      ],
    );

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toMatchObject({
      event: 'configuracion_invalida',
      motivo: 'variable_ausente',
      variable: 'IDENTITY_AES_KEY_FILE',
    });
    expect(resultado.log).not.toContain('contenido-ficticio');
  });

  it('no arranca y el log nombra IDENTITY_KEY_VERSION cuando no es un entero positivo', () => {
    const resultado = arrancarCapturando(
      {
        ...ENTORNO_BASE,
        IDENTITY_KEY_VERSION: 'dos',
        SERVICE_JWT_PRIVATE_KEY_FILE: '/run/secrets/jwt',
      },
      [
        ENTORNO_BASE.IDENTITY_AES_KEY_FILE,
        ENTORNO_BASE.BLIND_INDEX_HMAC_KEY_FILE,
        '/run/secrets/jwt',
      ],
    );

    expect(resultado.salidas).toEqual([1]);
    expect(JSON.parse(resultado.log)).toMatchObject({
      event: 'configuracion_invalida',
      variable: 'IDENTITY_KEY_VERSION',
    });
  });
});
