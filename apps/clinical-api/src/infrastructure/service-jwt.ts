import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT, type CryptoKey } from 'jose';
import type { Clock } from './clock.js';

/** Algoritmo fijado en código en ambos lados: abrirlo a configuración reintroduce la confusión de algoritmos (ADR #7). */
const ALGORITMO = 'ES256';
const EMISOR = 'clinical-api';
const AUDIENCIA = 'rag-orchestrator';

/** Firmador del JWT de servicio hacia rag-orchestrator (ES256, un token nuevo por request). */
export interface ServiceTokenSigner {
  sign(): Promise<string>;
}

export interface ServiceTokenSignerOptions {
  privateKey: CryptoKey;
  clock: Clock;
  ttlSeconds: number;
}

/**
 * Solo `iss`, `aud`, `iat` y `exp`: ningún identificador del doctor, de la sesión ni del paciente (RN-10).
 * Sin `kid`, `jku` ni `x5u`: una sola clave.
 */
export function createServiceTokenSigner(options: ServiceTokenSignerOptions): ServiceTokenSigner {
  const { privateKey, clock, ttlSeconds } = options;
  return {
    async sign() {
      const emitidoEn = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
        .setIssuer(EMISOR)
        .setAudience(AUDIENCIA)
        .setIssuedAt(emitidoEn)
        .setExpirationTime(emitidoEn + ttlSeconds)
        .sign(privateKey);
    },
  };
}

/** Importa la clave privada ES256 (PKCS#8 PEM). El mensaje de error nunca incluye el material de la clave. */
export async function importServicePrivateKey(pem: string): Promise<CryptoKey> {
  try {
    return await importPKCS8(pem, ALGORITMO);
  } catch {
    throw new Error('SERVICE_JWT_PRIVATE_KEY_FILE no contiene una clave privada EC P-256 en formato PKCS#8');
  }
}

/** Lee y valida la clave privada del archivo montado como secreto; sin ella `clinical-api` no arranca. */
export async function loadServicePrivateKey(file: string): Promise<CryptoKey> {
  let pem: string;
  try {
    pem = await readFile(file, 'utf8');
  } catch {
    throw new Error('SERVICE_JWT_PRIVATE_KEY_FILE no se puede leer');
  }
  return importServicePrivateKey(pem);
}
