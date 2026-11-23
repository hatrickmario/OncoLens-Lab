import { describe, expect, it } from 'vitest';
import { entornoDelStackDeTest } from '../../../src/evaluacion/chat/composicion.js';

describe('entornoDelStackDeTest', () => {
  it('completa la conexión y los secretos del stack de test desde el directorio de secretos del repositorio', () => {
    const entorno = entornoDelStackDeTest({}, '/repo');

    expect(entorno['PG_CLINICAL_API_PASSWORD_FILE']).toBe(
      '/repo/infra/docker/secrets/pg_clinical_api_password',
    );
    expect(entorno['CLINICAL_DATABASE_URL']).toBe(
      'postgresql://clinical_api@127.0.0.1:55432/oncolens',
    );
    expect(entorno['EVAL_CHAT_DB_TLS_SERVERNAME']).toBe('postgres');
  });

  it('respeta lo que el entorno ya define y el puerto y los secretos que indique', () => {
    const entorno = entornoDelStackDeTest(
      {
        ONCOLENS_SECRETS_DIR: '/otro',
        PG_TEST_PORT: '55999',
        CLINICAL_DATABASE_CA_FILE: '/mi/ca.crt',
      },
      '/repo',
    );

    expect(entorno['CLINICAL_DATABASE_CA_FILE']).toBe('/mi/ca.crt');
    expect(entorno['IDENTITY_AES_KEY_FILE']).toBe('/otro/identity_aes_key');
    expect(entorno['CLINICAL_DATABASE_URL']).toContain(':55999/');
  });

  it('no completa APP_ENV: la guarda de datos reales exige que quien corre el comando lo declare [RN-13]', () => {
    expect(entornoDelStackDeTest({}, '/repo')['APP_ENV']).toBeUndefined();
  });
});
