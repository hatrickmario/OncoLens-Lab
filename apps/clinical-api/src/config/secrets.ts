/** Lector de archivos inyectado: la carga de secretos no hace E/S directa (determinista en test). */
export type LeerArchivo = (ruta: string) => string;

export function loadRequiredSecrets(
  _env: NodeJS.ProcessEnv,
  _readFile: LeerArchivo,
): Readonly<Record<string, string>> {
  throw new Error('no implementado');
}
