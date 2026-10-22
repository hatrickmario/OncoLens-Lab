import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AlmacenNoDisponible, type AlmacenDeDocumentos } from '../modules/documents/ports.js';

export interface ConfiguracionDelAlmacen {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** Plazo de conexión y de cada operación (RN-22). */
  timeoutMs: number;
}

export interface AlmacenMinio extends AlmacenDeDocumentos {
  /** Crea el bucket si no existe (idempotente). */
  asegurarBucket(): Promise<void>;
}

/** MinIO ignora la región, pero el firmador de S3 exige una. */
const REGION_DE_FIRMA = 'us-east-1';
const TIPO_DE_CONTENIDO = 'application/pdf';

function esBucketInexistente(error: unknown): boolean {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'NotFound' || name === 'NoSuchBucket' || $metadata?.httpStatusCode === 404;
}

function crearClienteS3(config: ConfiguracionDelAlmacen): S3Client {
  return new S3Client({
    region: REGION_DE_FIRMA,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // Sin reintentos silenciosos: el 503 es inmediato y la carga se puede repetir (checksum 409 la protege).
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { requestTimeout: config.timeoutMs, connectionTimeout: config.timeoutMs },
  });
}

/** Ejecuta una operación del SDK y traduce cualquier fallo al error de mensaje fijo (el del SDK trae host y clave). */
async function comoAlmacenNoDisponible<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch {
    throw new AlmacenNoDisponible();
  }
}

/** Crea el bucket solo si `HeadBucket` dice que no existe; cualquier otro fallo es `AlmacenNoDisponible`. */
async function asegurarBucketExistente(cliente: S3Client, Bucket: string): Promise<void> {
  try {
    await cliente.send(new HeadBucketCommand({ Bucket }));
  } catch (error) {
    if (!esBucketInexistente(error)) throw new AlmacenNoDisponible();
    await comoAlmacenNoDisponible(() => cliente.send(new CreateBucketCommand({ Bucket })));
  }
}

/**
 * Adapter S3-compatible de `clinical-minio`. Escribe el objeto sin metadatos ni `Content-Disposition` (el nombre
 * original es identidad, RN-10) y traduce cualquier fallo a `AlmacenNoDisponible`, cuyo mensaje es fijo: el error del
 * SDK trae host, bucket y clave y nunca sale de aquí.
 */
export function crearAlmacenMinio(config: ConfiguracionDelAlmacen): AlmacenMinio {
  const cliente = crearClienteS3(config);
  const Bucket = config.bucket;
  return {
    async guardar(clave, contenido) {
      const comando = new PutObjectCommand({
        Bucket,
        Key: clave,
        Body: contenido,
        ContentType: TIPO_DE_CONTENIDO,
      });
      await comoAlmacenNoDisponible(() => cliente.send(comando));
    },
    async borrar(clave) {
      await comoAlmacenNoDisponible(() =>
        cliente.send(new DeleteObjectCommand({ Bucket, Key: clave })),
      );
    },
    asegurarBucket: () => asegurarBucketExistente(cliente, Bucket),
  };
}
