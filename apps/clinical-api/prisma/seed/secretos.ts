import type { LeerArchivo } from '../../src/config/secrets.js';

/** Contraseña de una cuenta de demo no resuelta: el mensaje nombra variables, nunca un valor (RN-14). */
export class SecretoDelSeedAusenteError extends Error {
  constructor(
    readonly variable: string,
    motivo: string,
  ) {
    super(`${variable} ${motivo}`);
    this.name = 'SecretoDelSeedAusenteError';
  }
}

/**
 * Resuelve la contraseña `<nombre>`: el archivo de `<nombre>_FILE` es prioritario (L1D-165 D3); la variable directa
 * solo sirve de respaldo local, fuera de Compose. Sin valor por defecto en el código (decisión 66 del plan).
 */
export function leerSecreto(
  env: NodeJS.ProcessEnv,
  nombre: string,
  leerArchivo: LeerArchivo,
): string {
  const variableDeArchivo = `${nombre}_FILE`;
  const ruta = env[variableDeArchivo];
  if (ruta !== undefined && ruta !== '') {
    return leerDeArchivo(variableDeArchivo, ruta, leerArchivo);
  }
  const directo = env[nombre];
  if (directo !== undefined && directo !== '') return directo;
  throw new SecretoDelSeedAusenteError(
    variableDeArchivo,
    `no está definida (ni ${nombre} como respaldo local)`,
  );
}

function leerDeArchivo(variable: string, ruta: string, leerArchivo: LeerArchivo): string {
  let contenido: string;
  try {
    contenido = leerArchivo(ruta).trim();
  } catch {
    // El error de E/S trae la ruta: se descarta y solo se nombra la variable.
    throw new SecretoDelSeedAusenteError(variable, 'no apunta a un archivo legible');
  }
  if (contenido === '') throw new SecretoDelSeedAusenteError(variable, 'apunta a un archivo vacío');
  return contenido;
}
