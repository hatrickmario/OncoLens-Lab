/**
 * Claves AES-256 de la identidad por versión (D3): la activa cifra y descifra; las anteriores solo descifran.
 */
export interface AnilloDeClaves {
  readonly versionActiva: number;
  /** Clave de la versión, o `undefined` si esa versión no está configurada. */
  claveDe(version: number): Buffer | undefined;
}

export interface DatosDelAnillo {
  readonly versionActiva: number;
  readonly claves: ReadonlyMap<number, Buffer>;
}

export function crearAnilloDeClaves(_datos: DatosDelAnillo): AnilloDeClaves {
  throw new Error('no implementado');
}
