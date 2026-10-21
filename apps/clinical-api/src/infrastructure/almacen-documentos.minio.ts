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

/**
 * Adapter S3-compatible de `clinical-minio`. Escribe el objeto sin metadatos ni `Content-Disposition` (el nombre
 * original es identidad, RN-10) y traduce cualquier fallo a `AlmacenNoDisponible`, cuyo mensaje es fijo: el error del
 * SDK trae host, bucket y clave y nunca sale de aquí.
 */
export function crearAlmacenMinio(config: ConfiguracionDelAlmacen): AlmacenMinio {
  const cliente = new S3Client({
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
  const Bucket = config.bucket;

  return {
    async guardar(clave, contenido) {
      try {
        await cliente.send(
          new PutObjectCommand({
            Bucket,
            Key: clave,
            Body: contenido,
            ContentType: TIPO_DE_CONTENIDO,
          }),
        );
      } catch {
        throw new AlmacenNoDisponible();
      }
    },
    async borrar(clave) {
      try {
        await cliente.send(new DeleteObjectCommand({ Bucket, Key: clave }));
      } catch {
        throw new AlmacenNoDisponible();
      }
    },
    async asegurarBucket() {
      try {
        await cliente.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!esBucketInexistente(error)) throw new AlmacenNoDisponible();
        try {
          await cliente.send(new CreateBucketCommand({ Bucket }));
        } catch {
          throw new AlmacenNoDisponible();
        }
      }
    },
  };
}
