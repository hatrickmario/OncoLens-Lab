/** Línea de log estructurada: nunca lleva identidad, PHI, secretos, contraseñas ni tokens (RN-10, NFR-11). */
export type LineaDeLog = Record<string, unknown>;

export type Registrar = (linea: LineaDeLog) => void;

export const registrarEnConsola: Registrar = (linea) => {
  console.info(JSON.stringify(linea));
};
