/** Línea de log estructurada: nunca lleva identidad, PHI, secretos, contraseñas ni tokens (RN-10, NFR-11). */
export type LineaDeLog = Record<string, unknown>;

export type Registrar = (linea: LineaDeLog) => void;

/** Registrador que redacta los campos sensibles y escribe una línea JSON por evento. */
export function crearRegistrador(_escribir: (linea: string) => void): Registrar {
  return () => {
    throw new Error('no implementado');
  };
}

export const registrarEnConsola: Registrar = (linea) => {
  console.info(JSON.stringify(linea));
};
