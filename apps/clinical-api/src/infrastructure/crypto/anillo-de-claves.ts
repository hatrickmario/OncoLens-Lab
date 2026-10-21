/** Longitud de una clave AES-256. */
export const BYTES_DE_CLAVE_AES = 32;

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

/** Los mensajes de error nunca llevan material de clave (RN-10, RN-14). */
export function crearAnilloDeClaves({ versionActiva, claves }: DatosDelAnillo): AnilloDeClaves {
  if (!claves.has(versionActiva)) {
    throw new Error('El anillo de claves de identidad no tiene la clave de la versión activa');
  }
  for (const clave of claves.values()) {
    if (clave.length !== BYTES_DE_CLAVE_AES) {
      throw new Error(`Las claves de identidad deben tener ${BYTES_DE_CLAVE_AES} bytes`);
    }
  }
  return { versionActiva, claveDe: (version) => claves.get(version) };
}
