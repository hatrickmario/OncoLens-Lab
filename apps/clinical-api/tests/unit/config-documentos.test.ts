import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readDocumentosConfig } from '../../src/config/index.js';

const CLAVE_SINTETICA = 'clave-sintetica-del-almacen';
const ENV_VALIDO = { CLINICAL_MINIO_PASSWORD_FILE: '/run/secrets/clinical_minio_root_password' };
const leerArchivo = (ruta: string): string => {
  if (ruta === ENV_VALIDO.CLINICAL_MINIO_PASSWORD_FILE) return `${CLAVE_SINTETICA}\n`;
  throw new Error(`no existe ${ruta}`);
};

function errorDe(env: NodeJS.ProcessEnv, lector = leerArchivo): ConfiguracionInvalidaError {
  try {
    readDocumentosConfig(env, lector);
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) return error;
    throw error;
  }
  throw new Error('la configuración debía ser inválida');
}

describe('readDocumentosConfig', () => {
  it('aplica los valores por defecto: 20 MiB, endpoint interno de Compose y bucket clinical-documents', () => {
    expect(readDocumentosConfig(ENV_VALIDO, leerArchivo)).toEqual({
      maxUploadMb: 20,
      endpoint: 'http://clinical-minio:9000',
      bucket: 'clinical-documents',
      accessKey: 'clinical-minio-admin',
      secretKey: CLAVE_SINTETICA,
      timeoutMs: 10_000,
    });
  });

  it('lee MAX_UPLOAD_MB, el endpoint, el bucket y el usuario del entorno', () => {
    const config = readDocumentosConfig(
      {
        ...ENV_VALIDO,
        MAX_UPLOAD_MB: '5',
        CLINICAL_MINIO_ENDPOINT: 'http://otro-minio:9000',
        CLINICAL_DOCUMENTS_BUCKET: 'documentos-test',
        CLINICAL_MINIO_ROOT_USER: 'usuario-sintetico',
      },
      leerArchivo,
    );

    expect(config).toMatchObject({
      maxUploadMb: 5,
      endpoint: 'http://otro-minio:9000',
      bucket: 'documentos-test',
      accessKey: 'usuario-sintetico',
    });
  });

  it('trata las variables vacías (Compose sin valor) como ausentes y usa el valor por defecto', () => {
    const config = readDocumentosConfig(
      {
        ...ENV_VALIDO,
        MAX_UPLOAD_MB: '',
        CLINICAL_DOCUMENTS_BUCKET: '',
        CLINICAL_MINIO_ENDPOINT: '',
      },
      leerArchivo,
    );

    expect(config).toMatchObject({
      maxUploadMb: 20,
      bucket: 'clinical-documents',
      endpoint: 'http://clinical-minio:9000',
    });
  });

  it.each(['0', '-1', 'veinte', '1e3'])(
    'rechaza MAX_UPLOAD_MB %s nombrando la variable',
    (valor) => {
      expect(errorDe({ ...ENV_VALIDO, MAX_UPLOAD_MB: valor }).variable).toBe('MAX_UPLOAD_MB');
    },
  );

  it.each(['AB', 'Mayusculas', 'con espacio', '-empieza-con-guion'])(
    'rechaza el bucket %s por no cumplir las reglas de nombre de S3',
    (valor) => {
      expect(errorDe({ ...ENV_VALIDO, CLINICAL_DOCUMENTS_BUCKET: valor }).variable).toBe(
        'CLINICAL_DOCUMENTS_BUCKET',
      );
    },
  );

  it('rechaza un endpoint que no es una URL http(s) sin repetir su valor', () => {
    const error = errorDe({ ...ENV_VALIDO, CLINICAL_MINIO_ENDPOINT: 'ftp://valor-secreto' });

    expect(error.variable).toBe('CLINICAL_MINIO_ENDPOINT');
    expect(error.message).not.toContain('valor-secreto');
  });

  it('falla cerrado nombrando CLINICAL_MINIO_PASSWORD_FILE cuando la variable no está configurada', () => {
    const error = errorDe({});

    expect(error.variable).toBe('CLINICAL_MINIO_PASSWORD_FILE');
    expect(error.motivo).toBe('variable_ausente');
  });

  it('falla cerrado sin revelar la ruta cuando el archivo del secreto no se puede leer', () => {
    const error = errorDe(
      { CLINICAL_MINIO_PASSWORD_FILE: '/ruta/secreta/que-no-existe' },
      leerArchivo,
    );

    expect(error.variable).toBe('CLINICAL_MINIO_PASSWORD_FILE');
    expect(error.message).not.toContain('/ruta/secreta');
  });
});
