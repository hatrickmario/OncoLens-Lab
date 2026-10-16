/** Parámetros y configuración compartidos por los escáneres de la CI. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ_DEL_REPOSITORIO = path.resolve(import.meta.dirname, '../../..');

/** `--root <dir>` (por defecto la raíz del repositorio) y `--config <archivo>` (por defecto `porDefecto`, bajo la raíz). */
export function parametros(argumentos, porDefecto) {
  const valorDe = (nombre) => {
    const indice = argumentos.indexOf(nombre);
    return indice === -1 ? undefined : argumentos[indice + 1];
  };
  const raiz = path.resolve(valorDe('--root') ?? RAIZ_DEL_REPOSITORIO);
  return { raiz, configuracion: valorDe('--config') ?? porDefecto, banderas: new Set(argumentos.filter((a) => a.startsWith('--'))) };
}

/** Lee un JSON de configuración relativo a la raíz (o absoluto). */
export function leerConfiguracion(raiz, archivo) {
  return JSON.parse(readFileSync(path.resolve(raiz, archivo), 'utf8'));
}
