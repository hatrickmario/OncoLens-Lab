import { createCipheriv, createDecipheriv } from 'node:crypto';
import type { AnilloDeClaves } from './anillo-de-claves.js';
import { IdentityIntegrityError } from './identity-integrity-error.js';

const ALGORITMO = 'aes-256-gcm';
const BYTES_DE_NONCE = 12;
const BYTES_DE_ETIQUETA = 16;

export type CampoDeIdentidad = 'national_id' | 'full_name';

/** Lo que liga un texto cifrado a su lugar: paciente y campo (más la versión de clave) entran en el AAD (D1). */
export interface ContextoDeCampo {
  readonly patientId: string;
  readonly campo: CampoDeIdentidad;
}

export interface CampoCifrado {
  /** `nonce (12 B) ‖ ciphertext ‖ tag (16 B)`. */
  readonly blob: Buffer;
  readonly keyVersion: number;
}

export interface CifradorDeCampos {
  cifrar(valor: string, contexto: ContextoDeCampo): CampoCifrado;
  /** Lanza `IdentityIntegrityError` si el blob fue alterado, si el contexto no corresponde o si la versión no tiene clave. */
  descifrar(blob: Buffer, contexto: ContextoDeCampo, keyVersion: number): string;
}

export interface DependenciasDelCifrador {
  readonly anillo: AnilloDeClaves;
  /** 12 bytes aleatorios en producción; fijos o secuenciales en los tests (determinismo). */
  readonly generarNonce: () => Buffer;
}

/** Datos autenticados (AAD): impiden trasladar un texto cifrado a otra fila, otro campo u otra versión de clave. */
export function aadDeCampo(contexto: ContextoDeCampo, keyVersion: number): Buffer {
  return Buffer.from(`${contexto.patientId}|${contexto.campo}|${keyVersion}`, 'utf8');
}

export function crearCifradorAesGcm({
  anillo,
  generarNonce,
}: DependenciasDelCifrador): CifradorDeCampos {
  return {
    cifrar(valor, contexto) {
      const keyVersion = anillo.versionActiva;
      const nonce = generarNonce();
      const cifrador = createCipheriv(ALGORITMO, claveActiva(anillo), nonce, {
        authTagLength: BYTES_DE_ETIQUETA,
      });
      cifrador.setAAD(aadDeCampo(contexto, keyVersion));
      const texto = Buffer.concat([cifrador.update(valor, 'utf8'), cifrador.final()]);
      return { blob: Buffer.concat([nonce, texto, cifrador.getAuthTag()]), keyVersion };
    },
    descifrar(blob, contexto, keyVersion) {
      const clave = anillo.claveDe(keyVersion);
      if (clave === undefined || blob.length < BYTES_DE_NONCE + BYTES_DE_ETIQUETA) {
        throw new IdentityIntegrityError();
      }
      const nonce = blob.subarray(0, BYTES_DE_NONCE);
      const texto = blob.subarray(BYTES_DE_NONCE, blob.length - BYTES_DE_ETIQUETA);
      const etiqueta = blob.subarray(blob.length - BYTES_DE_ETIQUETA);
      const descifrador = createDecipheriv(ALGORITMO, clave, nonce, {
        authTagLength: BYTES_DE_ETIQUETA,
      });
      descifrador.setAAD(aadDeCampo(contexto, keyVersion));
      descifrador.setAuthTag(etiqueta);
      try {
        return Buffer.concat([descifrador.update(texto), descifrador.final()]).toString('utf8');
      } catch {
        // El error de OpenSSL se descarta: la causa no importa y no debe viajar a ningún log.
        throw new IdentityIntegrityError();
      }
    },
  };
}

function claveActiva(anillo: AnilloDeClaves): Buffer {
  const clave = anillo.claveDe(anillo.versionActiva);
  if (clave === undefined) throw new Error('el anillo no tiene la clave activa');
  return clave;
}
