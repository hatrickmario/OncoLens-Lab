import { ConfiguracionInvalidaError, leerSecretoDeArchivo, readPositiveInteger } from './secciones.js';

export interface DocumentosConfig {
  /** `MAX_UPLOAD_MB`: tamaño máximo de un PDF cargado, en MiB (RN-22). */
  maxUploadMb: number;
  /** `CLINICAL_MINIO_ENDPOINT`: URL interna de `clinical-minio` (nunca publicada al host). */
  endpoint: string;
  /** `CLINICAL_DOCUMENTS_BUCKET`: bucket de los PDF clínicos. */
  bucket: string;
  /** `CLINICAL_MINIO_ROOT_USER`: usuario del almacén (no es un secreto). */
  accessKey: string;
  /** Contenido de `CLINICAL_MINIO_PASSWORD_FILE`: nunca se escribe en un log (RN-14). */
  secretKey: string;
  /** `CLINICAL_MINIO_TIMEOUT_MS`: plazo por operación contra el almacén. */
  timeoutMs: number;
}

const MAX_UPLOAD_MB_POR_DEFECTO = 20;
const ENDPOINT_POR_DEFECTO = 'http://clinical-minio:9000';
const BUCKET_POR_DEFECTO = 'clinical-documents';
const USUARIO_POR_DEFECTO = 'clinical-minio-admin';
const PLAZO_POR_DEFECTO_MS = 10_000;
/** Reglas de nombre de bucket de S3: 3 a 63 caracteres en minúscula, dígitos, puntos y guiones. */
const FORMA_DE_BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function textoOpcional(env: NodeJS.ProcessEnv, variable: string): string | undefined {
  const valor = env[variable]?.trim();
  return valor === undefined || valor === '' ? undefined : valor;
}

function exigirUrlHttp(variable: string, valor: string): string {
  try {
    const url = new URL(valor);
    if (url.protocol === 'http:' || url.protocol === 'https:') return valor;
  } catch {
    // Se descarta el error del parser: puede citar el valor.
  }
  throw new ConfiguracionInvalidaError(variable, 'debe ser una URL http(s) válida');
}

/**
 * Almacén de documentos y límite de carga (RN-22: nada de esto es un literal del dominio). Sin
 * `CLINICAL_MINIO_PASSWORD_FILE` legible el servicio no arranca (fallo cerrado); los errores nombran la variable y
 * nunca su valor.
 */
export function readDocumentosConfig(
  env: NodeJS.ProcessEnv,
  readFile: (ruta: string) => string,
): DocumentosConfig {
  const bucket = textoOpcional(env, 'CLINICAL_DOCUMENTS_BUCKET') ?? BUCKET_POR_DEFECTO;
  if (!FORMA_DE_BUCKET.test(bucket)) {
    throw new ConfiguracionInvalidaError(
      'CLINICAL_DOCUMENTS_BUCKET',
      'debe ser un nombre de bucket válido (3 a 63 caracteres: minúsculas, dígitos, puntos y guiones)',
    );
  }
  const rutaDeLaClave = textoOpcional(env, 'CLINICAL_MINIO_PASSWORD_FILE');
  if (rutaDeLaClave === undefined) {
    throw new ConfiguracionInvalidaError('CLINICAL_MINIO_PASSWORD_FILE', 'no está configurada', {
      motivo: 'variable_ausente',
    });
  }
  return {
    maxUploadMb: readPositiveInteger(env, 'MAX_UPLOAD_MB', MAX_UPLOAD_MB_POR_DEFECTO),
    endpoint: exigirUrlHttp(
      'CLINICAL_MINIO_ENDPOINT',
      textoOpcional(env, 'CLINICAL_MINIO_ENDPOINT') ?? ENDPOINT_POR_DEFECTO,
    ),
    bucket,
    accessKey: textoOpcional(env, 'CLINICAL_MINIO_ROOT_USER') ?? USUARIO_POR_DEFECTO,
    secretKey: leerSecretoDeArchivo('CLINICAL_MINIO_PASSWORD_FILE', rutaDeLaClave, readFile),
    timeoutMs: readPositiveInteger(env, 'CLINICAL_MINIO_TIMEOUT_MS', PLAZO_POR_DEFECTO_MS),
  };
}
