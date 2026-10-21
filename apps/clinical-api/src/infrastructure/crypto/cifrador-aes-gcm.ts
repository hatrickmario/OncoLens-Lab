import type { AnilloDeClaves } from './anillo-de-claves.js';

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

export function crearCifradorAesGcm(_dependencias: DependenciasDelCifrador): CifradorDeCampos {
  throw new Error('no implementado');
}
