import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPKCS8 } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readServiceJwtConfig } from '../../src/config/index.js';
import { loadServicePrivateKey } from '../../src/infrastructure/service-jwt.js';
import { generarParEfimero } from '../support/service-jwt.js';

describe('readServiceJwtConfig', () => {
  it('lanza nombrando SERVICE_JWT_PRIVATE_KEY_FILE cuando no está configurada', () => {
    expect(() => readServiceJwtConfig({})).toThrow('SERVICE_JWT_PRIVATE_KEY_FILE');
  });

  it('usa la vida por defecto cuando SERVICE_JWT_TTL_SECONDS no está definida', () => {
    expect(readServiceJwtConfig({ SERVICE_JWT_PRIVATE_KEY_FILE: '/run/secrets/k' })).toEqual({
      ttlSeconds: 60,
      privateKeyFile: '/run/secrets/k',
    });
  });

  it('devuelve la vida de SERVICE_JWT_TTL_SECONDS cuando es un entero positivo', () => {
    const config = readServiceJwtConfig({
      SERVICE_JWT_PRIVATE_KEY_FILE: '/k',
      SERVICE_JWT_TTL_SECONDS: '30',
    });

    expect(config.ttlSeconds).toBe(30);
  });

  it('lanza nombrando SERVICE_JWT_TTL_SECONDS cuando no es un entero positivo', () => {
    for (const valor of ['0', '-5', 'abc', '1.5']) {
      expect(() =>
        readServiceJwtConfig({
          SERVICE_JWT_PRIVATE_KEY_FILE: '/k',
          SERVICE_JWT_TTL_SECONDS: valor,
        }),
      ).toThrow('SERVICE_JWT_TTL_SECONDS');
    }
  });
});

describe('loadServicePrivateKey', () => {
  let directorio: string;
  beforeAll(async () => {
    directorio = await mkdtemp(join(tmpdir(), 'oncolens-jwt-'));
  });
  afterAll(() => rm(directorio, { recursive: true, force: true }));

  it('carga la clave cuando el archivo contiene una clave privada EC P-256 en PKCS#8', async () => {
    const { privateKey } = await generarParEfimero();
    const archivo = join(directorio, 'privada.pem');
    await writeFile(archivo, await exportPKCS8(privateKey));

    await expect(loadServicePrivateKey(archivo)).resolves.toBeDefined();
  });

  it('lanza sin revelar el contenido cuando el archivo no es una clave válida', async () => {
    const archivo = join(directorio, 'basura.pem');
    await writeFile(archivo, 'contenido-secreto-no-pem');

    const error = await loadServicePrivateKey(archivo).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('SERVICE_JWT_PRIVATE_KEY_FILE');
    expect((error as Error).message).not.toContain('contenido-secreto');
  });

  it('lanza nombrando SERVICE_JWT_PRIVATE_KEY_FILE cuando el archivo no existe', async () => {
    await expect(loadServicePrivateKey(join(directorio, 'no-existe.pem'))).rejects.toThrow(
      'SERVICE_JWT_PRIVATE_KEY_FILE',
    );
  });
});
